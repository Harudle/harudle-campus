import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";

const scrypt = promisify(scryptCallback);
const validArea = (area) => typeof area === "string" && area.length <= 200 && area.includes("회의실");
const validId = (id) => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id);
const validPassword = (password) => typeof password === "string" && password.length >= 8 && password.length <= 64;
const show = (room) => ({ id: room.id, title: room.title, locked: !!room.locked });

// 같은 서버에서 교체 중인 워커들도 하나의 회의 목록을 사용한다.
export function openPersistentMeetings({ path, now = Date.now, ttlMs = 24 * 60 * 60 * 1000 } = {}) {
  if (!isAbsolute(path || "") || !existsSync(path) || !Number.isSafeInteger(ttlMs) || ttlMs < 60000) throw new Error("meeting_store_missing");
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    if (db.prepare("PRAGMA user_version").get().user_version !== 3 || !db.prepare("SELECT id FROM media_state WHERE id=1").get()) throw new Error("meeting_store_invalid");
    db.exec(`CREATE TABLE IF NOT EXISTS meeting_rooms (
      id TEXT PRIMARY KEY, area TEXT NOT NULL, title TEXT NOT NULL, locked INTEGER NOT NULL,
      salt BLOB, password_hash BLOB, expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS meeting_area ON meeting_rooms(area,expires_at);
    CREATE TABLE IF NOT EXISTS meeting_attempts (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, attempted_at INTEGER NOT NULL) STRICT;
    CREATE INDEX IF NOT EXISTS meeting_attempt_room ON meeting_attempts(room_id,attempted_at);`);
  } catch (error) { db.close(); throw error; }
  let hashing = 0, closed = false;
  const transaction = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); db.exec("COMMIT"); return result; }
    catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
  };
  const time = () => {
    const n = now(); if (!Number.isSafeInteger(n) || n < 0 || closed) throw new Error("meeting_store_invalid"); return n;
  };
  const get = (id) => db.prepare("SELECT * FROM meeting_rooms WHERE id=? AND expires_at>?").get(id, time());
  async function derive(password, salt) {
    if (hashing >= 4) throw new Error("meeting_busy");
    hashing++;
    try { return await scrypt(password, salt, 32); } finally { hashing--; }
  }
  return {
    async create({ area, title, locked, password }) {
      if (!validArea(area) || typeof title !== "string" || typeof locked !== "boolean") throw new Error("invalid_meeting");
      const name = title.trim().replace(/[\u0000-\u001f\u007f]/g, "");
      if (!name || name.length > 30 || (locked && !validPassword(password)) || (!locked && password)) throw new Error("invalid_meeting");
      const salt = locked ? randomBytes(16) : null, hash = locked ? await derive(password, salt) : null;
      const id = randomUUID(), expires = time() + ttlMs;
      transaction(() => {
        const current = time();
        db.prepare("DELETE FROM meeting_attempts WHERE attempted_at<=? OR room_id IN (SELECT id FROM meeting_rooms WHERE expires_at<=?)").run(current - 60000, current);
        db.prepare("DELETE FROM meeting_rooms WHERE expires_at<=?").run(current);
        if (db.prepare("SELECT count(*) AS n FROM meeting_rooms").get().n >= 100 || db.prepare("SELECT count(*) AS n FROM meeting_rooms WHERE area=?").get(area).n >= 20) throw new Error("meeting_full");
        db.prepare("INSERT INTO meeting_rooms VALUES(?,?,?,?,?,?,?)").run(id, area, name, locked ? 1 : 0, salt, hash, expires);
      });
      return { id, title: name, locked };
    },
    list(area) {
      if (!validArea(area)) throw new Error("invalid_meeting");
      return db.prepare("SELECT id,title,locked FROM meeting_rooms WHERE area=? AND expires_at>? ORDER BY rowid").all(area, time()).map(show);
    },
    async join({ area, id, password }) {
      if (!validArea(area) || !validId(id)) throw new Error("invalid_meeting");
      const room = get(id);
      if (!room || room.area !== area) throw new Error("meeting_not_found");
      if (room.locked) {
        if (!validPassword(password)) throw new Error("meeting_password_invalid");
        const attempt = randomUUID();
        transaction(() => {
          const current = time();
          db.prepare("DELETE FROM meeting_attempts WHERE attempted_at<=?").run(current - 60000);
          if (db.prepare("SELECT count(*) AS n FROM meeting_attempts WHERE room_id=?").get(id).n >= 8) throw new Error("meeting_rate_limited");
          db.prepare("INSERT INTO meeting_attempts VALUES(?,?,?)").run(attempt, id, current);
        });
        const hash = await derive(password, Buffer.from(room.salt));
        if (!timingSafeEqual(hash, Buffer.from(room.password_hash))) throw new Error("meeting_password_invalid");
        db.prepare("DELETE FROM meeting_attempts WHERE id=?").run(attempt);
      }
      const current = get(id);
      if (!current || current.area !== area) throw new Error("meeting_not_found");
      return show(current);
    },
    contains(area, id) { return !!(validArea(area) && validId(id) && get(id)?.area === area); },
    close() { if (!closed) { closed = true; db.close(); } },
  };
}
