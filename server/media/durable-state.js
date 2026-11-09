import { openSync, closeSync, existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

// EC2 한 대의 영구 디스크에서만 사용한다. 여러 호스트가 같은 SQLite 파일을 공유하면 안 된다.
const PROVIDERS = ["livekit", "daily", "cloudflare"];
const BUDGETS = [...PROVIDERS, "livekit_bytes"];
// 무료 제공량보다 작게 제한한다. 외부 사용량과 실제 청구 오차는 별도로 확인해야 한다.
const MAX_LIMIT = { livekit: 240000, daily: 480000, cloudflare: 800000000000, livekit_bytes: 40000000000 };
// 모든 제공자의 한 달보다 넉넉한 35일 동안 예약을 유지한다.
// 최초 입력값에는 기존 계정 사용량 전체가 포함되어야 한다.
const WINDOW_SECONDS = 35 * 86400;
const validInt = (v) => Number.isSafeInteger(v) && v >= 0;
const validPeriod = (v) => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const validKey = (v) => typeof v === "string" && /^[a-zA-Z0-9:_-]{1,160}$/.test(v);

function configure(db) {
  db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
}
function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const result = fn(); db.exec("COMMIT"); return result; }
  catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
}
function settings(db) {
  const row = db.prepare("SELECT period, provider, phase, generation, next_provider, transition_id FROM media_state WHERE id=1").get();
  if (!row || !validPeriod(row.period) || !PROVIDERS.includes(row.provider) || !["active", "switching", "blocked", "recovering"].includes(row.phase) || !validInt(row.generation)) throw new Error("media_state_invalid");
  return row;
}

// 초기값은 운영자가 기존 사용량을 확인한 후 한 번만 넣는다. 기존 DB는 덮어쓰지 않는다.
export function initializeDurableMediaState({ path, period, budgets, now = Date.now }) {
  if (!isAbsolute(path || "") || !validPeriod(period) || !budgets || !BUDGETS.every((p) => validInt(budgets[p]?.limit) && budgets[p].limit > 0 && budgets[p].limit <= MAX_LIMIT[p] && validInt(budgets[p]?.used) && budgets[p].used <= budgets[p].limit)) throw new Error("invalid_media_state_config");
  const initialTime = Math.floor(now() / 1000);
  if (!validInt(initialTime)) throw new Error("invalid_media_state_config");
  const fd = openSync(path, "wx", 0o600); closeSync(fd);
  const db = new DatabaseSync(path);
  try {
    configure(db);
    db.exec(`
      CREATE TABLE media_state (id INTEGER PRIMARY KEY CHECK(id=1), period TEXT NOT NULL, provider TEXT NOT NULL, phase TEXT NOT NULL, generation INTEGER NOT NULL, next_provider TEXT, transition_id TEXT) STRICT;
      CREATE TABLE budget (period TEXT NOT NULL, provider TEXT NOT NULL, limit_value INTEGER NOT NULL, reserved INTEGER NOT NULL, PRIMARY KEY(period, provider)) STRICT;
      CREATE TABLE resource (resource_key TEXT PRIMARY KEY, provider TEXT NOT NULL, generation INTEGER NOT NULL, kind TEXT NOT NULL, locator TEXT NOT NULL, expires_at INTEGER NOT NULL, pending INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0) STRICT;
      CREATE INDEX resource_cleanup ON resource(provider, closed, generation);
      CREATE TABLE reservation (id TEXT PRIMARY KEY, period TEXT NOT NULL, provider TEXT NOT NULL, generation INTEGER NOT NULL, amount INTEGER NOT NULL, expires_at INTEGER NOT NULL) STRICT;
      CREATE TABLE leader (id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL, nonce TEXT NOT NULL) STRICT;
      CREATE TABLE initialization (id INTEGER PRIMARY KEY CHECK(id=1), baseline_until INTEGER NOT NULL, livekit_bytes_until INTEGER NOT NULL) STRICT;
      CREATE TABLE blocked_budget (provider TEXT PRIMARY KEY, reserved INTEGER NOT NULL) STRICT;
      PRAGMA user_version=3;
    `);
    transaction(db, () => {
      db.prepare("INSERT INTO media_state VALUES(1, ?, 'livekit', 'recovering', 0, NULL, NULL)").run(period);
      const insert = db.prepare("INSERT INTO budget VALUES(?, ?, ?, ?)");
      for (const p of BUDGETS) insert.run(period, p, budgets[p].limit, budgets[p].used);
      db.prepare("INSERT INTO initialization VALUES(1, ?, ?)").run(initialTime + WINDOW_SECONDS, initialTime + WINDOW_SECONDS);
    });
  } finally { db.close(); }
}

// 이전 기록은 보존하고 전송량의 기존 사용량을 명시한 경우에만 한 번 업그레이드한다.
export function upgradeDurableMediaState({ path, livekitBytes, now = Date.now }) {
  if (!isAbsolute(path || "") || !existsSync(path) || !validInt(livekitBytes?.limit) || livekitBytes.limit < 1 || livekitBytes.limit > MAX_LIMIT.livekit_bytes || !validInt(livekitBytes.used) || livekitBytes.used > livekitBytes.limit) throw new Error("invalid_media_state_config");
  const initialTime = Math.floor(now() / 1000);
  if (!validInt(initialTime)) throw new Error("invalid_media_state_config");
  const db = new DatabaseSync(path); configure(db);
  try {
    transaction(db, () => {
      if (db.prepare("PRAGMA user_version").get().user_version !== 2) throw new Error("media_state_invalid");
      if (db.prepare("SELECT COUNT(*) AS n FROM leader").get().n) throw new Error("media_leader_active");
      const period = settings(db).period;
      db.exec("ALTER TABLE initialization ADD COLUMN livekit_bytes_until INTEGER NOT NULL DEFAULT 0");
      db.prepare("UPDATE initialization SET livekit_bytes_until=? WHERE id=1").run(initialTime + WINDOW_SECONDS);
      db.prepare("INSERT INTO budget VALUES(?, 'livekit_bytes', ?, ?)").run(period, livekitBytes.limit, livekitBytes.used);
      db.exec("PRAGMA user_version=3");
    });
  } finally { db.close(); }
}

export function openDurableMediaState(path, { now = Date.now } = {}) {
  if (!isAbsolute(path || "") || !existsSync(path)) throw new Error("media_state_missing");
  const db = new DatabaseSync(path);
  configure(db);
  try {
    const version = db.prepare("PRAGMA user_version").get().user_version;
    if (version === 2) throw new Error("media_state_upgrade_required");
    if (version !== 3) throw new Error("media_state_invalid");
    settings(db);
    if (db.prepare("SELECT COUNT(*) AS n FROM budget WHERE period=?").get(settings(db).period).n !== 4) throw new Error("media_state_invalid");
    if (!validInt(db.prepare("SELECT baseline_until FROM initialization WHERE id=1").get()?.baseline_until)) throw new Error("media_state_invalid");
    if (!validInt(db.prepare("SELECT livekit_bytes_until FROM initialization WHERE id=1").get()?.livekit_bytes_until)) throw new Error("media_state_invalid");
    db.exec("CREATE TABLE IF NOT EXISTS cloudflare_recovery (session_id TEXT PRIMARY KEY, pending INTEGER NOT NULL CHECK(pending IN (0,1))) STRICT");
  } catch (error) { db.close(); throw error; }
  const state = () => settings(db);
  function budget(provider) {
    const s = state(), time = Math.floor(now() / 1000);
    if (!validInt(time) || !BUDGETS.includes(provider)) throw new Error("media_state_invalid");
    const row = db.prepare("SELECT limit_value, reserved FROM budget WHERE period=? AND provider=?").get(s.period, provider);
    const initial = db.prepare("SELECT baseline_until, livekit_bytes_until FROM initialization WHERE id=1").get();
    const baselineUntil = provider === "livekit_bytes" ? initial?.livekit_bytes_until : initial?.baseline_until;
    const rolling = db.prepare("SELECT COALESCE(SUM(amount), 0) AS amount FROM reservation WHERE provider=? AND expires_at>?").get(provider, time - WINDOW_SECONDS).amount;
    if (!row || !validInt(row.limit_value) || row.limit_value > MAX_LIMIT[provider] || !validInt(row.reserved) || !validInt(baselineUntil) || !validInt(rolling)) throw new Error("media_state_invalid");
    const reserved = rolling + (time < baselineUntil ? row.reserved : 0);
    if (!validInt(reserved) || reserved > row.limit_value) throw new Error("media_state_invalid");
    return { period: s.period, limit: row.limit_value, reserved };
  }
  let leaderNonce = null;
  const leaderOwned = () => {
    const leader = db.prepare("SELECT pid, nonce FROM leader WHERE id=1").get();
    return !!leaderNonce && leader?.pid === process.pid && leader.nonce === leaderNonce;
  };
  return {
    state,
    acquireLeadership() {
      if (leaderNonce) throw new Error("leadership_already_owned");
      const nonce = randomUUID();
      transaction(db, () => {
        const existing = db.prepare("SELECT pid FROM leader WHERE id=1").get();
        if (existing) {
          if (!validInt(existing.pid) || existing.pid < 1) throw new Error("media_state_invalid");
          let alive = true;
          try { process.kill(existing.pid, 0); } catch (error) { if (error?.code === "ESRCH") alive = false; }
          if (alive) throw new Error("media_leader_active");
        }
        db.prepare("INSERT INTO leader(id,pid,nonce) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET pid=excluded.pid, nonce=excluded.nonce").run(process.pid, nonce);
      });
      leaderNonce = nonce;
    },
    assertLeadership() { if (!leaderOwned()) throw new Error("media_leadership_lost"); },
    releaseLeadership() {
      if (!leaderOwned()) throw new Error("media_leadership_lost");
      db.prepare("DELETE FROM leader WHERE id=1 AND pid=? AND nonce=?").run(process.pid, leaderNonce);
      leaderNonce = null;
    },
    budget,
    externalCloudflareSessions() {
      return db.prepare("SELECT session_id,pending FROM cloudflare_recovery ORDER BY session_id").all();
    },
    closeExternalCloudflareSession(sessionId) {
      this.assertLeadership();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId || "")) throw new Error("invalid_resource");
      if (db.prepare("DELETE FROM cloudflare_recovery WHERE session_id=?").run(sessionId).changes !== 1) throw new Error("media_state_changed");
    },
    reserve({ provider, generation, amount, expiresAt }) {
      return this.reserveAmounts({ provider, generation, amounts: { [provider]: amount }, expiresAt });
    },
    reserveAmounts({ provider, generation, amounts, expiresAt }) {
      const keys = Object.keys(amounts || {});
      if (!PROVIDERS.includes(provider) || !validInt(generation) || !validInt(expiresAt) || !keys.length || !keys.every((key) => (key === provider || (provider === "livekit" && key === "livekit_bytes")) && validInt(amounts[key]) && amounts[key] > 0)) throw new Error("invalid_reservation");
      return transaction(db, () => {
        const s = state(), time = now();
        if (!Number.isFinite(time)) throw new Error("media_state_invalid");
        if (s.phase !== "active" || s.provider !== provider || s.generation !== generation) throw new Error("media_state_changed");
        const secondsLeft = expiresAt - Math.floor(time / 1000);
        if (secondsLeft <= 0 || (amounts[provider] !== undefined && provider !== "cloudflare" && amounts[provider] < secondsLeft)) throw new Error("invalid_reservation");
        const rows = Object.fromEntries(keys.map((key) => [key, budget(key)]));
        if (keys.some((key) => amounts[key] > rows[key].limit - rows[key].reserved)) throw new Error("budget_exhausted");
        const insert = db.prepare("INSERT INTO reservation VALUES(?, ?, ?, ?, ?, ?)");
        for (const key of keys) insert.run(randomUUID(), s.period, key, generation, amounts[key], expiresAt);
        return { expiresAt, reserved: rows[provider] ? rows[provider].reserved + amounts[provider] : undefined };
      });
    },
    beginSwitch({ provider, generation }) {
      if (!PROVIDERS.includes(provider) || !validInt(generation)) throw new Error("invalid_transition");
      return transaction(db, () => {
        const s = state();
        if (s.phase !== "active" || s.provider !== provider || s.generation !== generation) throw new Error("media_state_changed");
        const next = PROVIDERS[PROVIDERS.indexOf(provider) + 1] || null, id = randomUUID();
        db.prepare("UPDATE media_state SET phase='switching', generation=generation+1, next_provider=?, transition_id=? WHERE id=1").run(next, id);
        return { id, from: provider, to: next, generation: generation + 1 };
      });
    },
    beginRecovery() {
      return transaction(db, () => {
        const s = state();
        if (s.phase === "active") db.prepare("UPDATE media_state SET phase='recovering', generation=generation+1 WHERE id=1").run();
        return state();
      });
    },
    registerResource({ key, provider, generation, kind, locator, expiresAt }) {
      if (!validKey(key) || !PROVIDERS.includes(provider) || !validInt(generation) || !["room", "session", "participant"].includes(kind) || typeof locator !== "string" || !locator || locator.length > 400 || !validInt(expiresAt)) throw new Error("invalid_resource");
      return transaction(db, () => {
        const s = state();
        if (s.phase !== "active" || s.provider !== provider || s.generation !== generation) throw new Error("media_state_changed");
        const existing = db.prepare("SELECT provider,generation,kind,locator,closed FROM resource WHERE resource_key=?").get(key);
        if (existing) {
          if (existing.closed || existing.provider !== provider || existing.generation !== generation || existing.kind !== kind || existing.locator !== locator) throw new Error("media_state_changed");
          db.prepare("UPDATE resource SET expires_at=MAX(expires_at,?) WHERE resource_key=?").run(expiresAt, key);
        } else db.prepare("INSERT INTO resource(resource_key,provider,generation,kind,locator,expires_at) VALUES(?,?,?,?,?,?)").run(key, provider, generation, kind, locator, expiresAt);
      });
    },
    setPending(key, pending) {
      if (!validKey(key) || typeof pending !== "boolean") throw new Error("invalid_resource");
      return transaction(db, () => {
        const resource = db.prepare("SELECT provider, generation, closed, pending FROM resource WHERE resource_key=?").get(key);
        if (!resource || resource.closed || resource.pending === Number(pending)) throw new Error("media_state_changed");
        if (pending) {
          const s = state();
          if (s.phase !== "active" || s.provider !== resource.provider || s.generation !== resource.generation) throw new Error("media_state_changed");
        }
        db.prepare("UPDATE resource SET pending=? WHERE resource_key=?").run(Number(pending), key);
      });
    },
    closeResource(key) {
      if (!validKey(key)) throw new Error("invalid_resource");
      const changed = db.prepare("UPDATE resource SET closed=1 WHERE resource_key=? AND pending=0 AND closed=0").run(key).changes;
      if (changed !== 1) throw new Error("cleanup_unconfirmed");
    },
    pendingResources(provider) {
      if (provider && !PROVIDERS.includes(provider)) throw new Error("invalid_resource");
      return provider
        ? db.prepare("SELECT * FROM resource WHERE closed=0 AND provider=? ORDER BY resource_key").all(provider)
        : db.prepare("SELECT * FROM resource WHERE closed=0 ORDER BY provider, resource_key").all();
    },
    resource(key) {
      if (!validKey(key)) throw new Error("invalid_resource");
      return db.prepare("SELECT * FROM resource WHERE resource_key=?").get(key) || null;
    },
    livekitRoomParticipants(room, generation) {
      if (!validInt(generation) || typeof room !== "string" || !/^[a-z0-9-]{1,100}$/.test(room)) throw new Error("invalid_resource");
      return db.prepare("SELECT COUNT(*) AS n FROM resource WHERE provider='livekit' AND kind='participant' AND closed=0 AND generation=? AND json_valid(locator) AND json_extract(locator,'$.room')=?").get(generation, room).n;
    },
    expiredResources(provider, kind, timeSeconds) {
      if (!PROVIDERS.includes(provider) || !["room", "session", "participant"].includes(kind) || !validInt(timeSeconds)) throw new Error("invalid_resource");
      return db.prepare("SELECT * FROM resource WHERE closed=0 AND pending=0 AND provider=? AND kind=? AND expires_at<=? ORDER BY expires_at").all(provider, kind, timeSeconds);
    },
    completeCleanup({ transitionId } = {}) {
      return transaction(db, () => {
        const s = state();
        if (!["switching", "recovering"].includes(s.phase) || (s.phase === "switching" && s.transition_id !== transitionId)) throw new Error("media_state_changed");
        const remaining = db.prepare("SELECT COUNT(*) AS n FROM resource WHERE closed=0").get().n;
        if (remaining) throw new Error("cleanup_unconfirmed");
        if (s.phase === "switching" && !s.next_provider) {
          db.prepare("DELETE FROM blocked_budget").run();
          const insert = db.prepare("INSERT INTO blocked_budget VALUES(?, ?)");
          for (const provider of BUDGETS) insert.run(provider, budget(provider).reserved);
          db.prepare("UPDATE media_state SET phase='blocked', next_provider=NULL, transition_id=NULL WHERE id=1").run();
        }
        else db.prepare("UPDATE media_state SET provider=?, phase='active', next_provider=NULL, transition_id=NULL WHERE id=1").run(s.next_provider || s.provider);
        return state();
      });
    },
    resumeCandidate(minimums) {
      if (state().phase !== "blocked" || db.prepare("SELECT COUNT(*) AS n FROM resource WHERE closed=0").get().n) return null;
      for (const provider of PROVIDERS) {
        const previous = db.prepare("SELECT reserved FROM blocked_budget WHERE provider=?").get(provider);
        const current = budget(provider), minimum = minimums[provider];
        let freed = !!previous && current.reserved < previous.reserved;
        let enough = validInt(minimum) && minimum > 0 && current.limit - current.reserved >= minimum;
        if (provider === "livekit") {
          const bytes = budget("livekit_bytes"), previousBytes = db.prepare("SELECT reserved FROM blocked_budget WHERE provider='livekit_bytes'").get();
          freed ||= !!previousBytes && bytes.reserved < previousBytes.reserved;
          enough &&= validInt(minimums.livekit_bytes) && minimums.livekit_bytes > 0 && bytes.limit - bytes.reserved >= minimums.livekit_bytes;
        }
        if (freed && enough) return provider;
      }
      return null;
    },
    resume(provider, minimums) {
      return transaction(db, () => {
        if (this.resumeCandidate(minimums) !== provider) throw new Error("media_state_changed");
        db.prepare("UPDATE media_state SET provider=?, phase='active', generation=generation+1, next_provider=NULL, transition_id=NULL WHERE id=1").run(provider);
        db.prepare("DELETE FROM blocked_budget").run();
        return state();
      });
    },
    close() { db.close(); },
  };
}
