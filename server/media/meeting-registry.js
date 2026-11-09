import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const validArea = (area) => typeof area === "string" && area.length <= 200 && area.includes("회의실");
const validId = (id) => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id);
const validPassword = (password) => typeof password === "string" && password.length >= 8 && password.length <= 64;

// 로컬 시험용: 서버를 다시 켜면 회의 목록은 지워진다. 사용량 DB와는 별도다.
export function createMeetingRegistry({ now = Date.now, ttlMs = 6 * 60 * 60 * 1000 } = {}) {
  const rooms = new Map(), attempts = new Map();
  let hashing = 0;
  const get = (id) => {
    const room = rooms.get(id);
    if (room && room.expiresAt <= now()) { rooms.delete(id); attempts.delete(id); return null; }
    return room || null;
  };
  const publicRoom = (room) => ({ id: room.id, title: room.title, locked: room.locked });
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
      for (const id of rooms.keys()) get(id);
      if (rooms.size >= 100 || [...rooms.values()].filter((room) => room.area === area).length >= 20) throw new Error("meeting_full");
      const salt = locked ? randomBytes(16) : null, hash = locked ? await derive(password, salt) : null;
      const id = randomUUID(), room = { id, area, title: name, locked, salt, hash, expiresAt: now() + ttlMs };
      rooms.set(id, room);
      return publicRoom(room);
    },
    list(area) {
      if (!validArea(area)) throw new Error("invalid_meeting");
      for (const id of rooms.keys()) get(id);
      return [...rooms.values()].filter((room) => room.area === area).map(publicRoom);
    },
    async join({ area, id, password }) {
      if (!validArea(area) || !validId(id)) throw new Error("invalid_meeting");
      const room = get(id);
      if (!room || room.area !== area) throw new Error("meeting_not_found");
      if (room.locked) {
        if (!validPassword(password)) throw new Error("meeting_password_invalid");
        const time = now(), recent = (attempts.get(id) || []).filter((at) => time >= at && time - at < 60000);
        if (recent.length >= 8) throw new Error("meeting_rate_limited");
        recent.push(time); attempts.set(id, recent);
        const hash = await derive(password, room.salt);
        if (!timingSafeEqual(hash, room.hash)) throw new Error("meeting_password_invalid");
      }
      if (get(id) !== room) throw new Error("meeting_not_found");
      return publicRoom(room);
    },
    contains(area, id) { const room = validId(id) && get(id); return !!room && room.area === area; },
  };
}
