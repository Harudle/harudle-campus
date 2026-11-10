// world/server/campus.ts
import { join } from "node:path";

// world/server/chatLog.ts
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
var RETENTION_DAYS = 30;
var DAY_MS = 864e5;
var PURGE_INTERVAL_MS = 36e5;
var HISTORY_SIZE = 30;
function createChatLog(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 2000;
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      run TEXT NOT NULL,
      nickname TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_messages_room ON chat_messages (room, id);
    CREATE INDEX IF NOT EXISTS chat_messages_created ON chat_messages (created_at);
  `);
  const run = randomUUID();
  const insert = db.prepare("INSERT INTO chat_messages (room, player_id, run, nickname, text, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const select = db.prepare("SELECT player_id, run, nickname, text, created_at FROM chat_messages WHERE room = ? AND created_at >= ? ORDER BY id DESC LIMIT ?");
  const remove = db.prepare("DELETE FROM chat_messages WHERE created_at < ?");
  const cutoff = () => Date.now() - RETENTION_DAYS * DAY_MS;
  const purge = () => {
    try {
      remove.run(cutoff());
    } catch (error) {
      console.error("\uCC44\uD305 \uAE30\uB85D \uC815\uB9AC \uC2E4\uD328", error);
    }
  };
  purge();
  const purgeTimer = setInterval(purge, PURGE_INTERVAL_MS);
  purgeTimer.unref();
  return {
    /** 저장에 실패해도 대화는 끊기지 않게 기록만 건너뛴다. */
    add(room, playerId, nickname, text) {
      try {
        insert.run(room, playerId, run, nickname, text, Date.now());
      } catch (error) {
        console.error("\uCC44\uD305 \uC800\uC7A5 \uC2E4\uD328", error);
      }
    },
    /** 이 공간의 최근 대화를 오래된 순서로 돌려준다. */
    recent(room) {
      try {
        const rows = select.all(room, cutoff(), HISTORY_SIZE);
        return rows.reverse().map((row) => ({
          id: row.run === run ? row.player_id : null,
          nickname: row.nickname,
          text: row.text,
          at: row.created_at
        }));
      } catch (error) {
        console.error("\uCC44\uD305 \uAE30\uB85D \uC77D\uAE30 \uC2E4\uD328", error);
        return [];
      }
    },
    close() {
      clearInterval(purgeTimer);
      db.close();
    }
  };
}

// world/server/cheers.ts
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync as mkdirSync2 } from "node:fs";
import { dirname as dirname2 } from "node:path";
import { DatabaseSync as DatabaseSync2 } from "node:sqlite";
var AUTHOR_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
var INVISIBLE_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F​‎‏‪-‮⁠-⁩﻿]/g;
var LINK_PATTERN = /(https?:\/\/|www\.)/i;
var MAX_BODY_BYTES = 2048;
var MAX_MESSAGE_LENGTH = 200;
var MAX_NICKNAME_LENGTH = 12;
var DEFAULT_NICKNAME = "\uC775\uBA85\uC758 \uAD00\uB78C\uAC1D";
var PAGE_SIZE = 30;
var HIDE_AT_REPORTS = 3;
var MINUTE_MS = 6e4;
var HOUR_MS = 60 * MINUTE_MS;
var POSTS_PER_MINUTE = 5;
var POSTS_PER_HOUR_TOTAL = 600;
var REPORTS_PER_HOUR = 20;
var MAX_TRACKED_KEYS = 2e4;
function hashToken(token) {
  return createHash("sha256").update(token).digest();
}
function cleanText(value) {
  return value.normalize("NFC").replace(INVISIBLE_CHARS, "").replace(/\n{3,}/g, "\n\n").trim();
}
function charLength(value) {
  return [...value].length;
}
function createLimiter() {
  const windows = /* @__PURE__ */ new Map();
  return (key, limit, windowMs) => {
    const now = Date.now();
    if (windows.size > MAX_TRACKED_KEYS) {
      for (const [entryKey, entry2] of windows) if (now - entry2.start >= HOUR_MS) windows.delete(entryKey);
    }
    const entry = windows.get(key);
    if (!entry || now - entry.start >= windowMs) {
      windows.set(key, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
function readBody(request, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", () => resolve(null));
  });
}
function createCheersHandler({ databasePath, isOriginAllowed, trustProxy = false }) {
  mkdirSync2(dirname2(databasePath), { recursive: true });
  const database = new DatabaseSync2(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cheers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      token_hash BLOB NOT NULL,
      reports INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS cheers_by_author ON cheers (author_id, hidden, id);
  `);
  const listAll = database.prepare(
    "SELECT id, nickname, message, created_at FROM cheers WHERE author_id = ? AND hidden = 0 ORDER BY id DESC LIMIT ?"
  );
  const listBefore = database.prepare(
    "SELECT id, nickname, message, created_at FROM cheers WHERE author_id = ? AND hidden = 0 AND id < ? ORDER BY id DESC LIMIT ?"
  );
  const countAll = database.prepare("SELECT COUNT(*) AS total FROM cheers WHERE author_id = ? AND hidden = 0");
  const insert = database.prepare(
    "INSERT INTO cheers (author_id, nickname, message, created_at, token_hash) VALUES (?, ?, ?, ?, ?)"
  );
  const findToken = database.prepare("SELECT token_hash FROM cheers WHERE id = ?");
  const remove = database.prepare("DELETE FROM cheers WHERE id = ?");
  const addReport = database.prepare(
    `UPDATE cheers SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ${HIDE_AT_REPORTS} THEN 1 ELSE hidden END WHERE id = ?`
  );
  const limit = createLimiter();
  const reportedBy = /* @__PURE__ */ new Set();
  const clientKey = (request) => {
    const forwarded = trustProxy ? request.headers["x-forwarded-for"] : void 0;
    const value = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
    return value?.split(",").pop()?.trim() || request.socket.remoteAddress || "unknown";
  };
  const toCheer = (row) => ({
    id: row.id,
    nickname: row.nickname,
    message: row.message,
    createdAt: row.created_at
  });
  const handlePost = async (request, response, respond) => {
    if (!request.headers["content-type"]?.startsWith("application/json")) return respond(415, { code: "invalid" });
    const raw = await readBody(request);
    if (raw === null) {
      response.setHeader("Connection", "close");
      return respond(413, { code: "invalid" });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return respond(400, { code: "invalid" });
    }
    const author = body?.author;
    if (typeof author !== "string" || !AUTHOR_PATTERN.test(author)) return respond(400, { code: "invalid" });
    if (typeof body?.message !== "string") return respond(400, { code: "invalid" });
    const message = cleanText(body.message);
    if (!message || charLength(message) > MAX_MESSAGE_LENGTH) return respond(400, { code: "invalid" });
    if (LINK_PATTERN.test(message)) return respond(400, { code: "link" });
    const rawNickname = typeof body.nickname === "string" ? cleanText(body.nickname).replace(/\n/g, " ") : "";
    if (charLength(rawNickname) > MAX_NICKNAME_LENGTH || LINK_PATTERN.test(rawNickname)) {
      return respond(400, { code: "invalid" });
    }
    if (!limit(`post:${clientKey(request)}`, POSTS_PER_MINUTE, MINUTE_MS) || !limit("post:all", POSTS_PER_HOUR_TOTAL, HOUR_MS)) {
      return respond(429, { code: "rate_limited" });
    }
    const nickname = rawNickname || DEFAULT_NICKNAME;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const token = randomBytes(24).toString("base64url");
    const { lastInsertRowid } = insert.run(author, nickname, message, createdAt, hashToken(token));
    respond(201, { cheer: { id: Number(lastInsertRowid), nickname, message, createdAt }, deleteToken: token });
  };
  const handleDelete = (request, id, respond) => {
    const token = request.headers["x-cheer-token"];
    const row = findToken.get(id);
    if (typeof token !== "string" || !row) return respond(404, { code: "not_found" });
    if (!timingSafeEqual(hashToken(token), row.token_hash)) return respond(403, { code: "forbidden" });
    remove.run(id);
    respond(204);
  };
  const handleReport = (request, id, respond) => {
    const key = clientKey(request);
    if (!limit(`report:${key}`, REPORTS_PER_HOUR, HOUR_MS)) return respond(429, { code: "rate_limited" });
    const reportKey = `${key}:${id}`;
    if (!reportedBy.has(reportKey)) {
      if (reportedBy.size > MAX_TRACKED_KEYS) reportedBy.clear();
      reportedBy.add(reportKey);
      addReport.run(id);
    }
    respond(204);
  };
  const handle = (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = /^\/cheers(?:\/(\d{1,15})(\/report)?)?$/.exec(url.pathname);
    if (!match) return false;
    const origin = request.headers.origin;
    const originAllowed = isOriginAllowed(origin);
    const respond = (status, body) => {
      response.writeHead(status, {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Origin",
        ...originAllowed && origin ? { "Access-Control-Allow-Origin": origin } : {},
        ...body === void 0 ? {} : { "Content-Type": "application/json; charset=utf-8" }
      });
      response.end(body === void 0 ? void 0 : JSON.stringify(body));
    };
    const id = match[1] ? Number(match[1]) : null;
    const isReport = Boolean(match[2]);
    if (request.method === "OPTIONS") {
      if (originAllowed) {
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Cheer-Token");
        response.setHeader("Access-Control-Max-Age", "600");
      }
      respond(204);
      return true;
    }
    if (request.method === "GET" && id === null) {
      const author = url.searchParams.get("author") ?? "";
      if (!AUTHOR_PATTERN.test(author)) {
        respond(400, { code: "invalid" });
        return true;
      }
      const before = Number(url.searchParams.get("before"));
      const rows = Number.isSafeInteger(before) && before > 0 ? listBefore.all(author, before, PAGE_SIZE + 1) : listAll.all(author, PAGE_SIZE + 1);
      const { total } = countAll.get(author);
      respond(200, { items: rows.slice(0, PAGE_SIZE).map(toCheer), hasMore: rows.length > PAGE_SIZE, total });
      return true;
    }
    if (!originAllowed) {
      respond(403, { code: "forbidden" });
      return true;
    }
    const fail = () => {
      if (!response.headersSent) respond(500, { code: "failed" });
    };
    try {
      if (request.method === "POST" && id === null) handlePost(request, response, respond).catch(fail);
      else if (request.method === "DELETE" && id !== null && !isReport) handleDelete(request, id, respond);
      else if (request.method === "POST" && id !== null && isReport) handleReport(request, id, respond);
      else respond(405, { code: "invalid" });
    } catch {
      fail();
    }
    return true;
  };
  return { handle, close: () => database.close() };
}

// world/server/crabRanking.ts
import { createHash as createHash2, randomBytes as randomBytes2, randomInt } from "node:crypto";
import { mkdirSync as mkdirSync3 } from "node:fs";
import { dirname as dirname3 } from "node:path";
import { DatabaseSync as DatabaseSync3 } from "node:sqlite";

// world/src/games/crabSim.ts
var CRAB_GOAL = 15;
var CRAB_START_HEARTS = 3;
var CRAB_TICK_RATE = 60;
var CRAB_TIME_LIMIT = 60;
var CRAB_MAX_TICKS = CRAB_TIME_LIMIT * CRAB_TICK_RATE;
var CRAB_STAGE_SECONDS = 12;
var CRAB_FIELD_WIDTH = 600;
var CRAB_FIELD_HEIGHT = 800;
var CRAB_GROUND_Y = CRAB_FIELD_HEIGHT - 26;
var CRAB_PLATE_Y = CRAB_GROUND_Y - 128;
var CRAB_HERO_STEP = 640 / CRAB_TICK_RATE;
var FEVER_TICKS = 6 * CRAB_TICK_RATE;
var PLATE_MARGIN = 16;
var HERO_MARGIN = 36;
var SPAWN_MARGIN = 40;
var CRAB_POINTS = 10;
var SURVIVE_HEART_BONUS = 200;
function createRandom(seed) {
  let state = seed | 0;
  return () => {
    state = state + 1831565813 | 0;
    let mixed = Math.imul(state ^ state >>> 15, 1 | state);
    mixed = mixed + Math.imul(mixed ^ mixed >>> 7, 61 | mixed) ^ mixed;
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}
function triangleWave(at) {
  const within = at - Math.floor(at);
  return within < 0.5 ? within * 4 - 1 : 3 - within * 4;
}
function comboMultiplier(combo) {
  if (combo >= 20) return 4;
  if (combo >= 10) return 3;
  if (combo >= 5) return 2;
  return 1;
}
function crabPlateHalf(fever, tick) {
  if (fever) return 88;
  return 54 - 18 * Math.min(tick / CRAB_MAX_TICKS, 1);
}
function createCrabSim(seed) {
  const random = createRandom(seed);
  const items = [];
  let nextId = 1;
  let spawnIn = Math.round(0.8 * CRAB_TICK_RATE);
  const spawnItem = (kind, x, speed, swayRange = 0) => {
    items.push({
      id: nextId,
      kind,
      x,
      y: -30,
      speed,
      baseX: x,
      swayRange,
      swayAt: random(),
      swayStep: swayRange > 0 ? (0.7 + random() * 0.5) / CRAB_TICK_RATE : 0
    });
    nextId += 1;
  };
  const sim = {
    tick: 0,
    heroX: CRAB_FIELD_WIDTH / 2,
    score: 0,
    crabs: 0,
    combo: 0,
    bestCombo: 0,
    hearts: CRAB_START_HEARTS,
    fever: 0,
    stage: 1,
    finished: false,
    items,
    step(direction) {
      if (sim.finished) return [];
      const events = [];
      sim.tick += 1;
      const seconds = sim.tick / CRAB_TICK_RATE;
      const progress = Math.min(sim.tick / CRAB_MAX_TICKS, 1);
      sim.fever = Math.max(sim.fever - 1, 0);
      const stage = Math.min(Math.floor(seconds / CRAB_STAGE_SECONDS), 4) + 1;
      if (stage !== sim.stage) {
        sim.stage = stage;
        events.push({ type: "stage", stage });
      }
      sim.heroX = Math.min(Math.max(sim.heroX + direction * CRAB_HERO_STEP, HERO_MARGIN), CRAB_FIELD_WIDTH - HERO_MARGIN);
      spawnIn -= 1;
      if (spawnIn <= 0) {
        spawnIn = Math.round((0.7 - progress * 0.44) * CRAB_TICK_RATE);
        const speed = (380 + progress * 720) * (0.88 + random() * 0.24);
        const roll = random();
        const tabletChance = seconds < 3 ? 0 : 0.2 + progress * 0.28;
        const swayRange = stage >= 2 && random() < 0.2 + progress * 0.4 ? 60 + random() * 70 : 0;
        const x = SPAWN_MARGIN + swayRange + random() * (CRAB_FIELD_WIDTH - (SPAWN_MARGIN + swayRange) * 2);
        if (roll < 0.05 && sim.fever === 0) {
          spawnItem("star", x, speed);
        } else if (roll < 0.05 + tabletChance) {
          spawnItem("tablet", x, speed, swayRange);
        } else if (stage >= 3 && random() < 0.4) {
          const side = x < CRAB_FIELD_WIDTH / 2 ? 1 : -1;
          spawnItem("crab", x, speed);
          spawnItem("tablet", x + side * 110, speed);
        } else {
          spawnItem("crab", x, speed, swayRange);
        }
      }
      const fever = sim.fever > 0;
      const reach = crabPlateHalf(fever, sim.tick) + PLATE_MARGIN;
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];
        const before = item.y;
        item.y += item.speed / CRAB_TICK_RATE;
        if (item.swayRange > 0) {
          item.swayAt += item.swayStep;
          item.x = item.baseX + triangleWave(item.swayAt) * item.swayRange;
        }
        const crossed = before < CRAB_PLATE_Y && item.y >= CRAB_PLATE_Y - 8;
        if (crossed && Math.abs(item.x - sim.heroX) < reach) {
          items.splice(index, 1);
          if (item.kind === "crab") {
            sim.combo += 1;
            sim.bestCombo = Math.max(sim.bestCombo, sim.combo);
            const points = CRAB_POINTS * comboMultiplier(sim.combo) * (fever ? 2 : 1);
            sim.score += points;
            sim.crabs += fever ? 2 : 1;
            events.push({ type: "catch", x: item.x, points, combo: sim.combo });
            if (sim.crabs >= CRAB_GOAL && sim.crabs - (fever ? 2 : 1) < CRAB_GOAL) events.push({ type: "goal" });
          } else if (item.kind === "star") {
            sim.fever = FEVER_TICKS;
            events.push({ type: "star", x: item.x });
          } else {
            sim.hearts -= 1;
            sim.combo = 0;
            events.push({ type: "hurt", x: item.x });
          }
          continue;
        }
        if (item.kind === "crab" && before < CRAB_PLATE_Y && item.y >= CRAB_PLATE_Y) {
          sim.combo = 0;
          events.push({ type: "miss" });
        }
        if (item.y > CRAB_FIELD_HEIGHT + 40) items.splice(index, 1);
      }
      if (sim.hearts <= 0) {
        sim.finished = true;
      } else if (sim.tick >= CRAB_MAX_TICKS) {
        sim.score += sim.hearts * SURVIVE_HEART_BONUS;
        sim.finished = true;
      }
      return events;
    }
  };
  return sim;
}
function replayCrabRun(seed, moves) {
  if (!Array.isArray(moves) || moves.length % 2 !== 0) return null;
  const sim = createCrabSim(seed);
  let direction = 0;
  let next = 0;
  let previousTick = -1;
  for (let index = 0; index < moves.length; index += 2) {
    const tick = moves[index];
    const value = moves[index + 1];
    if (!Number.isSafeInteger(tick) || tick <= previousTick || tick > CRAB_MAX_TICKS) return null;
    if (value !== -1 && value !== 0 && value !== 1) return null;
    previousTick = tick;
  }
  while (!sim.finished) {
    if (next < moves.length && moves[next] === sim.tick) {
      direction = moves[next + 1];
      next += 2;
    }
    sim.step(direction);
  }
  return { score: sim.score, crabs: sim.crabs, hearts: sim.hearts, ticks: sim.tick };
}

// world/server/crabRanking.ts
var PLAYER_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
var RUN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
var MAX_BODY_BYTES2 = 64 * 1024;
var MAX_NICKNAME_LENGTH2 = 12;
var DEFAULT_NICKNAME2 = "\uC775\uBA85\uC758 \uAD00\uB78C\uAC1D";
var TOP_SIZE = 20;
var MINUTE_MS2 = 6e4;
var HOUR_MS2 = 60 * MINUTE_MS2;
var RUN_TTL_MS = 10 * MINUTE_MS2;
var CLOCK_MARGIN_MS = 1e3;
var SLOW_DEVICE_FACTOR = 1.5;
var PAUSE_ALLOWANCE_MS = 3e4;
var RUNS_PER_MINUTE = 30;
var RUNS_PER_HOUR_TOTAL = 2e4;
var SUBMITS_PER_MINUTE = 30;
function hashPlayer(token) {
  return createHash2("sha256").update(token).digest();
}
function createCrabRankingHandler({ databasePath, isOriginAllowed, trustProxy = false }) {
  mkdirSync3(dirname3(databasePath), { recursive: true });
  const database = new DatabaseSync3(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS crab_scores (
      player_hash BLOB PRIMARY KEY,
      nickname TEXT NOT NULL,
      score INTEGER NOT NULL,
      crabs INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS crab_scores_by_rank ON crab_scores (hidden, score DESC, created_at);
    CREATE TABLE IF NOT EXISTS crab_runs (
      id TEXT PRIMARY KEY,
      seed INTEGER NOT NULL,
      started_at INTEGER NOT NULL
    );
  `);
  const insertRun = database.prepare("INSERT INTO crab_runs (id, seed, started_at) VALUES (?, ?, ?)");
  const takeRun = database.prepare("DELETE FROM crab_runs WHERE id = ? RETURNING seed, started_at");
  const removeOldRuns = database.prepare("DELETE FROM crab_runs WHERE started_at < ?");
  const listTop = database.prepare(
    `SELECT nickname, score, crabs, created_at, player_hash = ? AS mine FROM crab_scores WHERE hidden = 0 ORDER BY score DESC, created_at LIMIT ${TOP_SIZE}`
  );
  const findBest = database.prepare("SELECT nickname, score, crabs, created_at, hidden FROM crab_scores WHERE player_hash = ?");
  const countAhead = database.prepare(
    "SELECT COUNT(*) AS ahead FROM crab_scores WHERE hidden = 0 AND (score > ? OR (score = ? AND created_at < ?))"
  );
  const countAll = database.prepare("SELECT COUNT(*) AS total FROM crab_scores WHERE hidden = 0");
  const saveBest = database.prepare(`
    INSERT INTO crab_scores (player_hash, nickname, score, crabs, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (player_hash) DO UPDATE SET nickname = excluded.nickname, score = excluded.score, crabs = excluded.crabs, created_at = excluded.created_at
  `);
  const renamePlayer = database.prepare("UPDATE crab_scores SET nickname = ? WHERE player_hash = ?");
  const limit = createLimiter();
  const clientKey = (request) => {
    const forwarded = trustProxy ? request.headers["x-forwarded-for"] : void 0;
    const value = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
    return value?.split(",").pop()?.trim() || request.socket.remoteAddress || "unknown";
  };
  const ranking = (playerHash) => {
    const top = listTop.all(playerHash ?? new Uint8Array()).map((row, index) => ({
      rank: index + 1,
      nickname: row.nickname,
      score: row.score,
      crabs: row.crabs,
      mine: row.mine === 1
    }));
    const best = playerHash ? findBest.get(playerHash) : void 0;
    const me = best && best.hidden === 0 ? {
      rank: countAhead.get(best.score, best.score, best.created_at).ahead + 1,
      nickname: best.nickname,
      score: best.score,
      crabs: best.crabs
    } : null;
    const { total } = countAll.get();
    return { top, me, total };
  };
  const handleSubmit = async (request, response, respond) => {
    if (!request.headers["content-type"]?.startsWith("application/json")) return respond(415, { code: "invalid" });
    const raw = await readBody(request, MAX_BODY_BYTES2);
    if (raw === null) {
      response.setHeader("Connection", "close");
      return respond(413, { code: "invalid" });
    }
    if (!limit(`submit:${clientKey(request)}`, SUBMITS_PER_MINUTE, MINUTE_MS2)) return respond(429, { code: "rate_limited" });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return respond(400, { code: "invalid" });
    }
    const { runId, player, moves } = body ?? {};
    if (typeof runId !== "string" || !RUN_PATTERN.test(runId)) return respond(400, { code: "invalid" });
    if (typeof player !== "string" || !PLAYER_PATTERN.test(player)) return respond(400, { code: "invalid" });
    const run = takeRun.get(runId);
    if (!run) return respond(404, { code: "expired" });
    const outcome = replayCrabRun(run.seed, moves);
    if (!outcome) return respond(400, { code: "invalid" });
    const playedMs = outcome.ticks / CRAB_TICK_RATE * 1e3;
    const elapsedMs = Date.now() - run.started_at;
    if (elapsedMs < playedMs - CLOCK_MARGIN_MS || elapsedMs > playedMs * SLOW_DEVICE_FACTOR + PAUSE_ALLOWANCE_MS) {
      return respond(422, { code: "rejected" });
    }
    if (body?.score !== outcome.score) return respond(422, { code: "rejected" });
    const rawNickname = typeof body?.nickname === "string" ? cleanText(body.nickname).replace(/\n/g, " ") : "";
    const nickname = rawNickname && charLength(rawNickname) <= MAX_NICKNAME_LENGTH2 && !LINK_PATTERN.test(rawNickname) ? rawNickname : DEFAULT_NICKNAME2;
    const playerHash = hashPlayer(player);
    const previous = findBest.get(playerHash);
    const isBest = !previous || outcome.score > previous.score;
    if (isBest) saveBest.run(playerHash, nickname, outcome.score, outcome.crabs, (/* @__PURE__ */ new Date()).toISOString());
    else renamePlayer.run(nickname, playerHash);
    respond(200, { score: outcome.score, crabs: outcome.crabs, isBest, ...ranking(playerHash) });
  };
  const handle = (request, response) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    if (pathname !== "/crab-game/runs" && pathname !== "/crab-game/scores") return false;
    const origin = request.headers.origin;
    const originAllowed = isOriginAllowed(origin);
    const respond = (status, body) => {
      response.writeHead(status, {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Origin",
        ...originAllowed && origin ? { "Access-Control-Allow-Origin": origin } : {},
        ...body === void 0 ? {} : { "Content-Type": "application/json; charset=utf-8" }
      });
      response.end(body === void 0 ? void 0 : JSON.stringify(body));
    };
    if (request.method === "OPTIONS") {
      if (originAllowed) {
        response.setHeader("Access-Control-Allow-Methods", "GET, POST");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Crab-Player");
        response.setHeader("Access-Control-Max-Age", "600");
      }
      respond(204);
      return true;
    }
    const fail = () => {
      if (!response.headersSent) respond(500, { code: "failed" });
    };
    try {
      if (request.method === "GET" && pathname === "/crab-game/scores") {
        const player = request.headers["x-crab-player"];
        respond(200, ranking(typeof player === "string" && PLAYER_PATTERN.test(player) ? hashPlayer(player) : null));
        return true;
      }
      if (!originAllowed) {
        respond(403, { code: "forbidden" });
        return true;
      }
      if (request.method === "POST" && pathname === "/crab-game/runs") {
        if (!limit(`run:${clientKey(request)}`, RUNS_PER_MINUTE, MINUTE_MS2) || !limit("run:all", RUNS_PER_HOUR_TOTAL, HOUR_MS2)) {
          respond(429, { code: "rate_limited" });
          return true;
        }
        const now = Date.now();
        removeOldRuns.run(now - RUN_TTL_MS);
        const runId = randomBytes2(18).toString("base64url");
        const seed = randomInt(1, 2 ** 31 - 1);
        insertRun.run(runId, seed, now);
        respond(201, { runId, seed });
      } else if (request.method === "POST" && pathname === "/crab-game/scores") {
        handleSubmit(request, response, respond).catch(fail);
      } else {
        respond(405, { code: "invalid" });
      }
    } catch {
      fail();
    }
    return true;
  };
  return { handle, close: () => database.close() };
}

// world/server/easelStore.ts
import { mkdirSync as mkdirSync4 } from "node:fs";
import { dirname as dirname4 } from "node:path";
import { DatabaseSync as DatabaseSync4 } from "node:sqlite";

// world/src/data/easel.ts
var EASEL_ROOM = "main";
var EASEL_SCALE = 1e3;
var EASEL_PALETTE = ["#FFFFFF", "#2F2F2F", "#E5484D", "#FF9B54", "#FFD97A", "#5BBF8A", "#4A90D9", "#8B6FE8"];
var EASEL_SIZES = [6, 14, 32];
var EASEL_MAX_SEGMENT_POINTS = 60;
var EASEL_MAX_POINTS = 2e4;
function sanitizeSegment(value) {
  if (typeof value !== "object" || value === null) return null;
  const { c, w, p } = value;
  if (!Number.isInteger(c) || c < 0 || c >= EASEL_PALETTE.length) return null;
  if (!Number.isInteger(w) || w < 0 || w >= EASEL_SIZES.length) return null;
  if (!Array.isArray(p) || p.length < 4 || p.length % 2 !== 0 || p.length > EASEL_MAX_SEGMENT_POINTS * 2) return null;
  if (!p.every((n) => Number.isInteger(n) && n >= 0 && n <= EASEL_SCALE)) return null;
  return { c, w, p };
}
function segmentPoints(segment) {
  return segment.p.length / 2;
}

// world/server/easelStore.ts
var MAX_PAGES = 500;
var PAGE_CACHE_SECONDS = 300;
var toSegments = (raw) => {
  const segments = [];
  let pointCount = 0;
  for (const item of raw) {
    const segment = sanitizeSegment(item);
    if (!segment || pointCount + segmentPoints(segment) > EASEL_MAX_POINTS) continue;
    segments.push(segment);
    pointCount += segmentPoints(segment);
  }
  return segments;
};
function createEaselStore(databasePath) {
  mkdirSync4(dirname4(databasePath), { recursive: true });
  const db = new DatabaseSync4(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 2000;
    CREATE TABLE IF NOT EXISTS easel_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      color INTEGER NOT NULL,
      width INTEGER NOT NULL,
      points TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS easel_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      segments TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0
    );
  `);
  const insert = db.prepare("INSERT INTO easel_segments (color, width, points, created_at) VALUES (?, ?, ?, ?)");
  const selectAll = db.prepare("SELECT color, width, points FROM easel_segments ORDER BY id");
  const removeAll = db.prepare("DELETE FROM easel_segments");
  const insertPage = db.prepare("INSERT INTO easel_pages (segments, created_at) VALUES (?, ?)");
  const trimPages = db.prepare("DELETE FROM easel_pages WHERE id <= (SELECT id FROM easel_pages ORDER BY id DESC LIMIT 1 OFFSET ?)");
  const listPages = db.prepare("SELECT id, created_at FROM easel_pages WHERE hidden = 0 ORDER BY id DESC LIMIT ?");
  const findPage = db.prepare("SELECT id, segments, created_at FROM easel_pages WHERE id = ? AND hidden = 0");
  return {
    /** 저장된 선을 그린 순서대로 돌려준다. 맞지 않는 줄은 건너뛰고, 한 장에 그릴 수 있는 만큼만 읽는다. */
    load() {
      try {
        const rows = selectAll.all();
        return toSegments(rows.map((row) => ({ c: row.color, w: row.width, p: JSON.parse(row.points) })));
      } catch (error) {
        console.error("\uADF8\uB9BC\uD310 \uC77D\uAE30 \uC2E4\uD328", error);
        return [];
      }
    },
    /** 저장에 실패해도 그리기는 끊기지 않게 기록만 건너뛴다. */
    add(segment) {
      try {
        insert.run(segment.c, segment.w, JSON.stringify(segment.p), Date.now());
      } catch (error) {
        console.error("\uADF8\uB9BC\uD310 \uC800\uC7A5 \uC2E4\uD328", error);
      }
    },
    /** 지금 그림을 스케치북 한 장으로 넘기고 종이를 비운다. 빈 종이는 넘기지 않는다. */
    clear(segments) {
      try {
        db.exec("BEGIN");
        if (segments.length > 0) {
          insertPage.run(JSON.stringify(segments), Date.now());
          trimPages.run(MAX_PAGES);
        }
        removeAll.run();
        db.exec("COMMIT");
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
        }
        console.error("\uADF8\uB9BC\uD310 \uB118\uAE30\uAE30 \uC2E4\uD328", error);
      }
    },
    /** GET /easel/pages(최근 장 목록), GET /easel/pages/:id(한 장의 선). 처리했으면 true. */
    handle(request, response) {
      const url = new URL(request.url ?? "/", "http://localhost");
      const match = /^\/easel\/pages(?:\/(\d{1,15}))?$/.exec(url.pathname);
      if (!match) return false;
      const respond = (status, body, cacheSeconds = 0) => {
        response.writeHead(status, {
          "Cache-Control": cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store",
          "X-Content-Type-Options": "nosniff",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json; charset=utf-8"
        });
        response.end(JSON.stringify(body));
      };
      if (request.method !== "GET") {
        respond(405, { code: "method" });
        return true;
      }
      try {
        if (!match[1]) {
          const rows = listPages.all(MAX_PAGES);
          respond(200, { items: rows.map((row) => ({ id: row.id, at: row.created_at })) });
        } else {
          const row = findPage.get(Number(match[1]));
          if (!row) respond(404, { code: "not_found" });
          else respond(200, { id: row.id, at: row.created_at, segs: toSegments(JSON.parse(row.segments)) }, PAGE_CACHE_SECONDS);
        }
      } catch (error) {
        console.error("\uC2A4\uCF00\uCE58\uBD81 \uC77D\uAE30 \uC2E4\uD328", error);
        if (!response.headersSent) respond(500, { code: "failed" });
      }
      return true;
    },
    close() {
      db.close();
    }
  };
}

// world/server/harudleProxy.ts
import { Readable } from "node:stream";
var HARUDLE_ORIGIN = "https://www.harudle.com";
var IMAGE_ORIGIN = "https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com";
var IMAGE_PATH_PATTERN = /^\/s3-image(\/harudle\/[A-Za-z0-9._~%/-]+)$/;
var SORTS = /* @__PURE__ */ new Set(["LATEST", "POPULAR"]);
var MAX_PAGE_SIZE = 50;
var MAX_CURSOR_LENGTH = 300;
var MINUTE_MS3 = 6e4;
var FEED_CACHE_MS = MINUTE_MS3;
var MAX_CACHED_PAGES = 200;
var FEEDS_PER_MINUTE = 120;
var IMAGES_PER_MINUTE = 600;
var TIMEOUT_MS = 1e4;
function createHarudleProxy({ trustProxy = false }) {
  const limit = createLimiter();
  const pages = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  const clientKey = (request) => {
    const forwarded = trustProxy ? request.headers["x-forwarded-for"] : void 0;
    const value = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
    return value?.split(",").pop()?.trim() || request.socket.remoteAddress || "unknown";
  };
  const canonicalQuery = (url) => {
    const sort = url.searchParams.get("sort") ?? "LATEST";
    const size = Number(url.searchParams.get("size") ?? 20);
    const cursor = url.searchParams.get("cursor");
    if (!SORTS.has(sort) || !Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) return null;
    if (cursor && cursor.length > MAX_CURSOR_LENGTH) return null;
    const query = new URLSearchParams({ sort, size: String(size) });
    if (cursor) query.set("cursor", cursor);
    return query.toString();
  };
  const loadPage = (query) => {
    const cached = pages.get(query);
    if (cached && Date.now() - cached.at < FEED_CACHE_MS) return Promise.resolve(cached);
    const running = pending.get(query);
    if (running) return running;
    const task = fetch(`${HARUDLE_ORIGIN}/api/v1/feeds?${query}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" }
    }).then(async (response) => {
      const page = { at: Date.now(), status: response.status, body: await response.text() };
      if (response.ok) {
        if (pages.size >= MAX_CACHED_PAGES) pages.clear();
        pages.set(query, page);
      }
      return page;
    }).finally(() => pending.delete(query));
    pending.set(query, task);
    return task;
  };
  const sendFeed = (query, response) => {
    loadPage(query).then((page) => {
      response.writeHead(page.status === 200 ? 200 : 502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(page.status === 200 ? page.body : JSON.stringify({ code: "upstream" }));
    }).catch(() => {
      response.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ code: "upstream" }));
    });
  };
  const sendImage = async (path, search, response) => {
    const upstream = await fetch(`${IMAGE_ORIGIN}${path}${search}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/") || !upstream.body) {
      await upstream.body?.cancel();
      response.writeHead(502).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff"
    });
    Readable.fromWeb(upstream.body).on("error", () => response.destroy()).pipe(response);
  };
  return (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const isFeed = url.pathname === "/api/v1/feeds";
    const image = IMAGE_PATH_PATTERN.exec(url.pathname);
    if (!isFeed && !image && !url.pathname.startsWith("/s3-image") && !url.pathname.startsWith("/api/")) return false;
    if (request.method !== "GET" || !isFeed && (!image || image[1].includes(".."))) {
      response.writeHead(404).end();
      return true;
    }
    const key = clientKey(request);
    if (!limit(`${isFeed ? "feed" : "image"}:${key}`, isFeed ? FEEDS_PER_MINUTE : IMAGES_PER_MINUTE, MINUTE_MS3)) {
      response.writeHead(429).end();
      return true;
    }
    if (isFeed) {
      const query = canonicalQuery(url);
      if (query) sendFeed(query, response);
      else response.writeHead(400).end();
    } else {
      sendImage(image[1], url.search, response).catch(() => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
    }
    return true;
  };
}

// world/server/quizzes.ts
import { createHash as createHash3, randomBytes as randomBytes4, timingSafeEqual as timingSafeEqual3 } from "node:crypto";
import { mkdirSync as mkdirSync5 } from "node:fs";
import { dirname as dirname5 } from "node:path";
import { DatabaseSync as DatabaseSync5 } from "node:sqlite";

// world/src/data/arcadeQuizzes.ts
function normalizeAnswer(value) {
  return value.normalize("NFC").toLowerCase().replace(/[\s.,!?·'"~-]/g, "");
}

// world/server/feedPosts.ts
import { randomBytes as randomBytes3, scrypt, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
import { promisify } from "node:util";
var SHARE_HOSTS = /* @__PURE__ */ new Set(["harudle.com", "www.harudle.com"]);
var SHARE_PATH_PATTERN = /^\/feeds\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
var MIN_PASSWORD_LENGTH = 4;
var MAX_PASSWORD_LENGTH = 64;
var PASSWORD_KEY_BYTES = 32;
var FEED_CACHE_MS2 = 10 * 6e4;
var FEED_MISSING_CACHE_MS = 6e4;
var FEED_TIMEOUT_MS = 5e3;
function parseFeedId(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !SHARE_HOSTS.has(url.hostname)) return null;
    return SHARE_PATH_PATTERN.exec(url.pathname)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}
function createFeedFetcher(harudleBaseUrl = "https://www.harudle.com") {
  const cache = /* @__PURE__ */ new Map();
  return async function fetchFeed(feedId) {
    const cached = cache.get(feedId);
    const age = cached ? Date.now() - cached.at : Infinity;
    if (cached?.result.status === "ok" && age < FEED_CACHE_MS2) return cached.result;
    if (cached?.result.status === "missing" && age < FEED_MISSING_CACHE_MS) return cached.result;
    try {
      const response = await fetch(`${harudleBaseUrl}/api/v1/feeds/${feedId}`, {
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
        headers: { Accept: "application/json" }
      });
      if (response.status === 404 || response.status === 410) {
        const result2 = { status: "missing" };
        cache.set(feedId, { at: Date.now(), result: result2 });
        return result2;
      }
      if (!response.ok) throw new Error(`feed ${response.status}`);
      const data = await response.json();
      if (typeof data?.imageUrl !== "string" || !data.imageUrl.startsWith("https://")) return { status: "missing" };
      const result = {
        status: "ok",
        feed: {
          imageUrl: data.imageUrl,
          shareUrl: `${harudleBaseUrl}/feeds/${feedId}`,
          author: typeof data.author?.nickname === "string" ? data.author.nickname : "\uC6B0\uB9AC\uB07C\uB9AC \uC791\uAC00",
          category: typeof data.category?.name === "string" ? data.category.name : "\uC6B0\uB9AC\uB07C\uB9AC"
        }
      };
      cache.set(feedId, { at: Date.now(), result });
      return result;
    } catch {
      return cached?.result.status === "ok" ? cached.result : { status: "unavailable" };
    }
  };
}
var deriveKey = promisify(scrypt);
function isValidPassword(value) {
  return typeof value === "string" && charLength(value) >= MIN_PASSWORD_LENGTH && charLength(value) <= MAX_PASSWORD_LENGTH;
}
async function hashPassword(password) {
  const salt = randomBytes3(16);
  return { salt, hash: await deriveKey(password, salt, PASSWORD_KEY_BYTES) };
}
async function verifyPassword(value, salt, hash) {
  if (typeof value !== "string" || charLength(value) > MAX_PASSWORD_LENGTH) return false;
  return timingSafeEqual2(await deriveKey(value, salt, PASSWORD_KEY_BYTES), hash);
}

// world/server/quizzes.ts
var ROOM_PATTERN = /^(song|drama)$/;
var MAX_ANSWER_LENGTH = 100;
var MAX_ACCEPTED_ANSWERS = 5;
var MAX_HINT_LENGTH = 80;
var MAX_NICKNAME_LENGTH3 = 12;
var DEFAULT_NICKNAME3 = "\uC775\uBA85\uC758 \uB3C4\uC804\uC790";
var LIST_SIZE = 30;
var SOLVERS_SHOWN = 20;
var HIDE_AT_REPORTS2 = 3;
var MINUTE_MS4 = 6e4;
var HOUR_MS3 = 60 * MINUTE_MS4;
var REGISTERS_PER_WINDOW = 5;
var REGISTER_WINDOW_MS = 10 * MINUTE_MS4;
var REGISTERS_PER_HOUR_TOTAL = 200;
var ANSWERS_PER_MINUTE_PER_QUIZ = 10;
var ANSWERS_PER_MINUTE = 40;
var REPORTS_PER_HOUR2 = 20;
var REMOVE_TRIES_PER_WINDOW = 5;
var REMOVE_WINDOW_MS = 10 * MINUTE_MS4;
function hashToken2(token) {
  return createHash3("sha256").update(token).digest();
}
function parseAcceptedAnswers(value) {
  if (typeof value !== "string" || charLength(value) > MAX_ANSWER_LENGTH) return null;
  const accepted = [...new Set(cleanText(value).split(/[,，\n]/).map(normalizeAnswer).filter(Boolean))];
  return accepted.length > 0 && accepted.length <= MAX_ACCEPTED_ANSWERS ? accepted : null;
}
function createQuizzesHandler({
  databasePath,
  isOriginAllowed,
  trustProxy = false,
  harudleBaseUrl
}) {
  mkdirSync5(dirname5(databasePath), { recursive: true });
  const database = new DatabaseSync5(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS user_quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT NOT NULL,
      feed_id TEXT NOT NULL UNIQUE,
      answers TEXT NOT NULL,
      hint TEXT NOT NULL,
      created_at TEXT NOT NULL,
      token_hash BLOB NOT NULL,
      reports INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS user_quizzes_by_room ON user_quizzes (room, hidden, id);
    CREATE TABLE IF NOT EXISTS quiz_solvers (
      quiz_id INTEGER NOT NULL REFERENCES user_quizzes (id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      solved_at TEXT NOT NULL,
      PRIMARY KEY (quiz_id, nickname)
    );
  `);
  const columns = database.prepare("PRAGMA table_info(user_quizzes)").all();
  if (!columns.some((column) => column.name === "password_hash")) {
    database.exec("ALTER TABLE user_quizzes ADD COLUMN password_hash BLOB; ALTER TABLE user_quizzes ADD COLUMN password_salt BLOB;");
  }
  const listByRoom = database.prepare(
    "SELECT id, room, feed_id, hint, created_at, password_hash IS NOT NULL AS has_password FROM user_quizzes WHERE room = ? AND hidden = 0 ORDER BY id DESC LIMIT ?"
  );
  const findVisible = database.prepare("SELECT answers FROM user_quizzes WHERE id = ? AND hidden = 0");
  const findCredentials = database.prepare("SELECT token_hash, password_hash, password_salt FROM user_quizzes WHERE id = ?");
  const findFeed = database.prepare("SELECT id FROM user_quizzes WHERE feed_id = ?");
  const insertQuiz = database.prepare(
    "INSERT INTO user_quizzes (room, feed_id, answers, hint, created_at, token_hash, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const removeSolvers = database.prepare("DELETE FROM quiz_solvers WHERE quiz_id = ?");
  const removeQuiz = database.prepare("DELETE FROM user_quizzes WHERE id = ?");
  const addReport = database.prepare(
    `UPDATE user_quizzes SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ${HIDE_AT_REPORTS2} THEN 1 ELSE hidden END WHERE id = ?`
  );
  const insertSolver = database.prepare("INSERT OR IGNORE INTO quiz_solvers (quiz_id, nickname, solved_at) VALUES (?, ?, ?)");
  const listSolvers = database.prepare("SELECT nickname FROM quiz_solvers WHERE quiz_id = ? ORDER BY solved_at DESC LIMIT ?");
  const countSolvers = database.prepare("SELECT COUNT(*) AS total FROM quiz_solvers WHERE quiz_id = ?");
  const limit = createLimiter();
  const reportedBy = /* @__PURE__ */ new Set();
  const fetchFeed = createFeedFetcher(harudleBaseUrl);
  const clientKey = (request) => {
    const forwarded = trustProxy ? request.headers["x-forwarded-for"] : void 0;
    const value = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
    return value?.split(",").pop()?.trim() || request.socket.remoteAddress || "unknown";
  };
  const solverSummary = (quizId) => {
    const { total } = countSolvers.get(quizId);
    const rows = listSolvers.all(quizId, SOLVERS_SHOWN);
    return { solverCount: total, solvers: rows.map((row) => row.nickname) };
  };
  const toQuiz = (row, feed) => ({
    id: row.id,
    room: row.room,
    hint: row.hint,
    createdAt: row.created_at,
    hasPassword: row.has_password === 1,
    ...feed,
    ...solverSummary(row.id)
  });
  const handle = (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = /^\/quizzes(?:\/(\d{1,15})(\/answer|\/report|\/remove)?)?$/.exec(url.pathname);
    if (!match) return false;
    const origin = request.headers.origin;
    const originAllowed = isOriginAllowed(origin);
    const respond = (status, body) => {
      response.writeHead(status, {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Origin",
        ...originAllowed && origin ? { "Access-Control-Allow-Origin": origin } : {},
        ...body === void 0 ? {} : { "Content-Type": "application/json; charset=utf-8" }
      });
      response.end(body === void 0 ? void 0 : JSON.stringify(body));
    };
    const fail = () => {
      if (!response.headersSent) respond(500, { code: "failed" });
    };
    const readJson = async () => {
      if (!request.headers["content-type"]?.startsWith("application/json")) return null;
      const raw = await readBody(request);
      if (raw === null) {
        response.setHeader("Connection", "close");
        return null;
      }
      try {
        const body = JSON.parse(raw);
        return typeof body === "object" && body !== null ? body : null;
      } catch {
        return null;
      }
    };
    const id = match[1] ? Number(match[1]) : null;
    const action = match[2];
    if (request.method === "OPTIONS") {
      if (originAllowed) {
        response.setHeader("Access-Control-Allow-Methods", "GET, POST");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
        response.setHeader("Access-Control-Max-Age", "600");
      }
      respond(204);
      return true;
    }
    if (request.method === "GET" && id === null) {
      const room = url.searchParams.get("room") ?? "";
      if (!ROOM_PATTERN.test(room)) {
        respond(400, { code: "invalid" });
        return true;
      }
      const rows = listByRoom.all(room, LIST_SIZE);
      Promise.all(rows.map(async (row) => ({ row, result: await fetchFeed(row.feed_id) }))).then((results) => {
        const items = results.flatMap(({ row, result }) => result.status === "ok" ? [toQuiz(row, result.feed)] : []);
        respond(200, { items });
      }).catch(fail);
      return true;
    }
    if (!originAllowed) {
      respond(403, { code: "forbidden" });
      return true;
    }
    const register = async () => {
      const body = await readJson();
      if (!body) return respond(400, { code: "invalid" });
      const { room, shareUrl, answer, hint, password } = body;
      if (typeof room !== "string" || !ROOM_PATTERN.test(room)) return respond(400, { code: "invalid" });
      const feedId = parseFeedId(shareUrl);
      if (!feedId) return respond(400, { code: "bad_link" });
      const accepted = parseAcceptedAnswers(answer);
      if (!accepted) return respond(400, { code: "bad_answer" });
      const cleanHint = typeof hint === "string" ? cleanText(hint).replace(/\n/g, " ") : "";
      if (charLength(cleanHint) > MAX_HINT_LENGTH || LINK_PATTERN.test(cleanHint)) return respond(400, { code: "bad_hint" });
      if (!isValidPassword(password)) return respond(400, { code: "bad_password" });
      if (findFeed.get(feedId)) return respond(409, { code: "duplicate" });
      if (!limit(`register:${clientKey(request)}`, REGISTERS_PER_WINDOW, REGISTER_WINDOW_MS) || !limit("register:all", REGISTERS_PER_HOUR_TOTAL, HOUR_MS3)) {
        return respond(429, { code: "rate_limited" });
      }
      const result = await fetchFeed(feedId);
      if (result.status === "missing") return respond(404, { code: "not_found" });
      if (result.status === "unavailable") return respond(503, { code: "unavailable" });
      if (findFeed.get(feedId)) return respond(409, { code: "duplicate" });
      const { hash: passwordHash, salt } = await hashPassword(password);
      if (findFeed.get(feedId)) return respond(409, { code: "duplicate" });
      const createdAt = (/* @__PURE__ */ new Date()).toISOString();
      const { lastInsertRowid } = insertQuiz.run(
        room,
        feedId,
        JSON.stringify(accepted),
        cleanHint,
        createdAt,
        hashToken2(randomBytes4(24).toString("base64url")),
        passwordHash,
        salt
      );
      const row = { id: Number(lastInsertRowid), room, feed_id: feedId, hint: cleanHint, created_at: createdAt, has_password: 1 };
      respond(201, { quiz: toQuiz(row, result.feed) });
    };
    const answerQuiz = async (quizId) => {
      const key = clientKey(request);
      if (!limit(`answer:${key}`, ANSWERS_PER_MINUTE, MINUTE_MS4) || !limit(`answer:${key}:${quizId}`, ANSWERS_PER_MINUTE_PER_QUIZ, MINUTE_MS4)) {
        return respond(429, { code: "rate_limited" });
      }
      const body = await readJson();
      if (!body) return respond(400, { code: "invalid" });
      const row = findVisible.get(quizId);
      if (!row) return respond(404, { code: "not_found" });
      if (typeof body.answer !== "string" || charLength(body.answer) > MAX_ANSWER_LENGTH) return respond(400, { code: "invalid" });
      const nickname = typeof body.nickname === "string" ? cleanText(body.nickname).replace(/\n/g, " ") : "";
      if (charLength(nickname) > MAX_NICKNAME_LENGTH3 || LINK_PATTERN.test(nickname)) return respond(400, { code: "bad_nickname" });
      const accepted = JSON.parse(row.answers);
      if (!accepted.includes(normalizeAnswer(body.answer))) return respond(200, { correct: false });
      insertSolver.run(quizId, nickname || DEFAULT_NICKNAME3, (/* @__PURE__ */ new Date()).toISOString());
      respond(200, { correct: true, ...solverSummary(quizId) });
    };
    const removeWithPassword = async (quizId) => {
      const body = await readJson();
      if (!body) return respond(400, { code: "invalid" });
      if (!limit(`remove:${clientKey(request)}:${quizId}`, REMOVE_TRIES_PER_WINDOW, REMOVE_WINDOW_MS)) {
        return respond(429, { code: "rate_limited" });
      }
      const row = findCredentials.get(quizId);
      if (!row) return respond(404, { code: "not_found" });
      let allowed = false;
      if (row.password_hash && row.password_salt) {
        allowed = await verifyPassword(body.password, row.password_salt, row.password_hash);
      } else if (typeof body.token === "string") {
        allowed = timingSafeEqual3(hashToken2(body.token), row.token_hash);
      }
      if (!allowed) return respond(403, { code: "wrong_password" });
      removeSolvers.run(quizId);
      removeQuiz.run(quizId);
      respond(204);
    };
    const report = (quizId) => {
      const key = clientKey(request);
      if (!limit(`report:${key}`, REPORTS_PER_HOUR2, HOUR_MS3)) return respond(429, { code: "rate_limited" });
      const reportKey = `${key}:${quizId}`;
      if (!reportedBy.has(reportKey)) {
        reportedBy.add(reportKey);
        addReport.run(quizId);
      }
      respond(204);
    };
    try {
      if (request.method === "POST" && id === null) register().catch(fail);
      else if (request.method === "POST" && id !== null && action === "/answer") answerQuiz(id).catch(fail);
      else if (request.method === "POST" && id !== null && action === "/report") report(id);
      else if (request.method === "POST" && id !== null && action === "/remove") removeWithPassword(id).catch(fail);
      else respond(405, { code: "invalid" });
    } catch {
      fail();
    }
    return true;
  };
  return { handle, close: () => database.close() };
}

// world/server/realtime.ts
import { WebSocketServer } from "ws";

// world/src/scene/seats.ts
var SEAT_OFFSET = 0.6;
function benchSeats(benches) {
  return benches.flatMap(({ x, z }) => [
    { x: x - SEAT_OFFSET, z },
    { x: x + SEAT_OFFSET, z }
  ]);
}

// world/src/scene/arcade/layout.ts
var ARCADE_HALF_X = 20;
var ARCADE_HALF_Z = 14;
var QUIZ_ROOM_HALF_X = 17;
var QUIZ_ROOM_HALF_Z = 13;
var HUB_BENCHES = [-15, -8, 8, 15].flatMap((x) => [
  { x, z: 7, rotationY: 0 },
  { x, z: -2, rotationY: 0 }
]);
var QUIZ_ROOM_BENCHES = [-12, -5, 5, 12].map((x) => ({ x, z: 5, rotationY: 0 }));
function spaceOf(halfX, halfZ, benches) {
  return {
    halfX,
    halfZ,
    obstacles: benches.map(({ x, z }) => ({ x, z, radius: 1.3 })),
    seats: benchSeats(benches)
  };
}
var HUB_SPACE = spaceOf(ARCADE_HALF_X, ARCADE_HALF_Z, HUB_BENCHES);
var QUIZ_ROOM_SPACE = spaceOf(QUIZ_ROOM_HALF_X, QUIZ_ROOM_HALF_Z, QUIZ_ROOM_BENCHES);

// world/src/scene/relay/layout.ts
var RELAY_HALF_X = 6.5;
var RELAY_HALF_Z = 21;
var EASEL_POSITION = { x: 0, z: -16 };
var RELAY_BENCHES = [8, -2, -11].flatMap((z) => [
  { x: -4.6, z, rotationY: 0 },
  { x: 4.6, z, rotationY: 0 }
]);
var RELAY_SPACE = {
  halfX: RELAY_HALF_X,
  halfZ: RELAY_HALF_Z,
  obstacles: [
    ...RELAY_BENCHES.map((bench) => ({ x: bench.x, z: bench.z, radius: 1.3 })),
    { x: EASEL_POSITION.x, z: EASEL_POSITION.z, radius: 1.8 }
  ],
  seats: benchSeats(RELAY_BENCHES)
};

// world/src/scene/gallery/layout.ts
var FACING_BACK_WALL = 0;
var FACING_FRONT_WALL = Math.PI;
var FACING_LEFT_WALL = Math.PI / 2;
var FACING_RIGHT_WALL = -Math.PI / 2;
var WALL_GAP = 0.02;
var MAIN_HALF_X = 15;
var MAIN_HALF_Z = 14;
var ART_Y = 3;
var NORMAL_SIZE = 2.6;
var ROW_X = [4.6, 8.2, 11.8];
var SIDE_ART_Z = [-6, 0, 6, -12, 12];
var MAIN_SLOTS = [
  { position: [0, 3.05, -MAIN_HALF_Z + WALL_GAP], rotationY: FACING_BACK_WALL, size: 4 },
  ...ROW_X.flatMap((x) => [
    { position: [-x, ART_Y, -MAIN_HALF_Z + WALL_GAP], rotationY: FACING_BACK_WALL, size: NORMAL_SIZE },
    { position: [x, ART_Y, -MAIN_HALF_Z + WALL_GAP], rotationY: FACING_BACK_WALL, size: NORMAL_SIZE }
  ]),
  ...SIDE_ART_Z.flatMap((z) => [
    { position: [-MAIN_HALF_X + WALL_GAP, ART_Y, z], rotationY: FACING_LEFT_WALL, size: NORMAL_SIZE },
    { position: [MAIN_HALF_X - WALL_GAP, ART_Y, z], rotationY: FACING_RIGHT_WALL, size: NORMAL_SIZE }
  ]),
  ...ROW_X.flatMap((x) => [
    { position: [-x, ART_Y, MAIN_HALF_Z - WALL_GAP], rotationY: FACING_FRONT_WALL, size: NORMAL_SIZE },
    { position: [x, ART_Y, MAIN_HALF_Z - WALL_GAP], rotationY: FACING_FRONT_WALL, size: NORMAL_SIZE }
  ])
];
var ARTIST_DOOR_Z = [-9, -3, 3, 9];
var ARTIST_ROOM_COUNT = ARTIST_DOOR_Z.length * 2;
var BENCHES = [
  { x: -11.5, z: -7, rotationY: 0 },
  { x: 8, z: -5, rotationY: 0 },
  { x: -8, z: 5, rotationY: 0 },
  { x: 8, z: 5, rotationY: 0 }
];
var TREES = [
  { x: -14, z: -13.2, scale: 0.85 },
  { x: 14, z: -13.2, scale: 0.85 },
  { x: -14, z: 13.2, scale: 0.85 },
  { x: 14, z: 13.2, scale: 0.85 }
];
var BOOTH_POSITION = [-6.6, 0, -2.5];
var PHONE_POSITION = [6.4, 0, -2];
var PHONE_ROTATION_Y = -0.5;
var PHONE_KIOSK_OFFSET = [2.4, 0, 0.4];
function phoneLocalToWorld([x, , z]) {
  const cos = Math.cos(PHONE_ROTATION_Y);
  const sin = Math.sin(PHONE_ROTATION_Y);
  return { x: PHONE_POSITION[0] + x * cos + z * sin, z: PHONE_POSITION[2] - x * sin + z * cos };
}
var PHONE_KIOSK = phoneLocalToWorld(PHONE_KIOSK_OFFSET);
var EASEL_POSITION2 = [-5.2, 0, 7.2];
var EASEL_BRUSH_HOME = { x: -3.4, z: 8.8 };
var EASEL_PICK_REACH = 1.8;
var EASEL_PAINT_REACH = 3.4;
var MAIN_SPACE = {
  halfX: MAIN_HALF_X,
  halfZ: MAIN_HALF_Z,
  obstacles: [
    ...BENCHES.map((bench) => ({ x: bench.x, z: bench.z, radius: 1.3 })),
    ...TREES.map((tree) => ({ x: tree.x, z: tree.z, radius: 0.6 })),
    { x: BOOTH_POSITION[0], z: BOOTH_POSITION[2], radius: 2.7 },
    { x: PHONE_POSITION[0], z: PHONE_POSITION[2], radius: 1.6 },
    { x: PHONE_KIOSK.x, z: PHONE_KIOSK.z, radius: 0.7 },
    { x: EASEL_POSITION2[0], z: EASEL_POSITION2[2], radius: 1.3 }
  ],
  seats: benchSeats(BENCHES)
};
var MAX_ROOM_WORKS = 40;
var ROOM_ART_Y = 2.7;
var ROOM_BACK_STEP = 4.2;
var ROOM_SIDE_STEP = 3.4;
var ROOM_DOOR_CLEARANCE = 3.6;
var ROOM_MAX_RATIO = 1.3;
var ROOM_BENCH_FROM_COLUMNS = 6;
var STAND_RADIUS = 2;
var ROOM_STAND_GAP = 2.8;
var ROOM_TITLE_GAP = 1.6;
function roomHalfX(columns) {
  return columns * (ROOM_BACK_STEP / 2) + 0.6;
}
function roomHalfZ(rows) {
  return rows * (ROOM_SIDE_STEP / 2) + 1.9;
}
function wallPositions(count, step) {
  return Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * step).sort(
    (a, b) => Math.abs(a) - Math.abs(b) || a - b
  );
}
function frontPositions(columns) {
  return wallPositions(columns, ROOM_BACK_STEP).filter((x) => Math.abs(x) >= ROOM_DOOR_CLEARANCE);
}
function roomLayout(workCount) {
  const count = Math.min(workCount, MAX_ROOM_WORKS);
  let columns = 2;
  let rows = 1;
  while (columns + rows * 2 + frontPositions(columns).length < count) {
    if (roomHalfX(columns) / roomHalfZ(rows) > ROOM_MAX_RATIO) rows += 1;
    else columns += 1;
  }
  const halfX = roomHalfX(columns);
  const halfZ = roomHalfZ(rows);
  const slots = [
    ...wallPositions(columns, ROOM_BACK_STEP).map((x) => ({
      position: [x, ROOM_ART_Y, -halfZ + WALL_GAP],
      rotationY: FACING_BACK_WALL,
      size: NORMAL_SIZE
    })),
    ...wallPositions(rows, ROOM_SIDE_STEP).flatMap((z) => [
      { position: [-halfX + WALL_GAP, ROOM_ART_Y, z], rotationY: FACING_LEFT_WALL, size: NORMAL_SIZE },
      { position: [halfX - WALL_GAP, ROOM_ART_Y, z], rotationY: FACING_RIGHT_WALL, size: NORMAL_SIZE }
    ]),
    ...frontPositions(columns).map((x) => ({
      position: [x, ROOM_ART_Y, halfZ - WALL_GAP],
      rotationY: FACING_FRONT_WALL,
      size: NORMAL_SIZE
    }))
  ];
  const start = { x: 0, z: halfZ - 3.2 };
  const stand = { x: 0, z: start.z - ROOM_STAND_GAP, rotationY: 0 };
  const benches = columns >= ROOM_BENCH_FROM_COLUMNS ? [-1, 1].map((side) => ({ x: side * halfX * 0.5, z: -halfZ * 0.3, rotationY: 0 })) : [];
  return {
    halfX,
    halfZ,
    slots,
    start,
    stand,
    benches,
    titleZ: start.z + ROOM_TITLE_GAP,
    space: {
      halfX,
      halfZ,
      obstacles: [
        ...benches.map((bench) => ({ x: bench.x, z: bench.z, radius: 1.3 })),
        { x: stand.x, z: stand.z, radius: STAND_RADIUS }
      ],
      seats: benchSeats(benches)
    },
    exitDoor: { id: "main", label: "\uBA54\uC778\uC73C\uB85C", x: 0, z: halfZ, rotationY: FACING_FRONT_WALL }
  };
}
var LARGEST_ROOM = roomLayout(MAX_ROOM_WORKS);
var MAX_SPACE_HALF_X = Math.max(MAIN_HALF_X, LARGEST_ROOM.halfX, ARCADE_HALF_X, RELAY_HALF_X);
var MAX_SPACE_HALF_Z = Math.max(MAIN_HALF_Z, LARGEST_ROOM.halfZ, ARCADE_HALF_Z, RELAY_HALF_Z);
var BRUSH_REACH = 2.2;

// world/server/easel.ts
var REACH_SLACK = 1.5;
var CLEAR_INTERVAL_MS = 5e3;
var DROP_GRACE_MS = 1500;
var HOLD_IDLE_MS = 2 * 6e4;
var RESET_IDLE_MS = 30 * 6e4;
function createEasel(broadcast, store) {
  const brush = { holder: null, x: EASEL_BRUSH_HOME.x, z: EASEL_BRUSH_HOME.z };
  let segments = store?.load() ?? [];
  let pointCount = segments.reduce((sum, segment) => sum + segmentPoints(segment), 0);
  let holderX = 0;
  let holderZ = 0;
  let lastUsedAt = Date.now();
  let lastClearAt = 0;
  let dropped = null;
  const brushPayload = () => JSON.stringify({ t: "easel", ...brush });
  const artPayload = () => JSON.stringify({ t: "easel-art", segs: segments });
  const publishBrush = () => broadcast(EASEL_ROOM, brushPayload());
  const near = (player, x, z, reach) => player.room === EASEL_ROOM && player.placed && Math.hypot(player.x - x, player.z - z) <= reach + REACH_SLACK;
  const drop = (x, z) => {
    brush.holder = null;
    brush.x = Math.round(x * 100) / 100;
    brush.z = Math.round(z * 100) / 100;
    publishBrush();
  };
  const pick = (player, now) => {
    if (brush.holder !== null || !near(player, brush.x, brush.z, EASEL_PICK_REACH)) return;
    brush.holder = player.id;
    holderX = player.x;
    holderZ = player.z;
    lastUsedAt = now;
    dropped = null;
    publishBrush();
  };
  const draw = (player, message, now) => {
    const holding = brush.holder === player.id;
    const graced = dropped !== null && dropped.id === player.id && now < dropped.until;
    if (!holding && !graced) return false;
    if (holding && !near(player, EASEL_POSITION2[0], EASEL_POSITION2[2], EASEL_PAINT_REACH)) return false;
    const segment = sanitizeSegment(message);
    if (!segment || pointCount + segmentPoints(segment) > EASEL_MAX_POINTS) return false;
    segments.push(segment);
    pointCount += segmentPoints(segment);
    lastUsedAt = now;
    store?.add(segment);
    broadcast(EASEL_ROOM, JSON.stringify({ t: "easel-seg", from: player.id, ...segment }), player.id);
    return true;
  };
  const clear = (player, now) => {
    if (brush.holder !== player.id || now - lastClearAt < CLEAR_INTERVAL_MS) return;
    if (!near(player, EASEL_POSITION2[0], EASEL_POSITION2[2], EASEL_PAINT_REACH)) return;
    lastClearAt = now;
    lastUsedAt = now;
    store?.clear(segments);
    segments = [];
    pointCount = 0;
    broadcast(EASEL_ROOM, artPayload());
  };
  return {
    /** 이젤 방에 들어온 사람에게 보낼 지금 상태 */
    snapshotFor: (room) => room === EASEL_ROOM ? [brushPayload(), artPayload()] : [],
    /** 그리기를 받아들이지 않았으면 false를 돌려준다. */
    handle(player, message, now) {
      if (message.t === "easel-pick") pick(player, now);
      else if (message.t === "easel-drop" && brush.holder === player.id) drop(player.x, player.z);
      else if (message.t === "easel-draw") return draw(player, message, now);
      else if (message.t === "easel-clear") clear(player, now);
      return true;
    },
    /** 든 사람의 위치를 따라가 두었다가, 그 사람이 나가면 마지막 자리에 떨어뜨린다. */
    moved(player) {
      if (brush.holder !== player.id) return;
      holderX = player.x;
      holderZ = player.z;
    },
    /** 든 사람이 다른 방으로 가거나 접속이 끊기면 붓을 내려놓는다. */
    left(player) {
      if (brush.holder === player.id) drop(holderX, holderZ);
    },
    /** 든 사람이 종이에 맞으면 붓을 그 자리에 떨어뜨린다. 그리던 선은 잠깐 더 받아 준다. */
    hit(player, now) {
      if (brush.holder !== player.id) return;
      dropped = { id: player.id, until: now + DROP_GRACE_MS };
      drop(player.x, player.z);
    },
    tick(now) {
      if (brush.holder !== null && now - lastUsedAt >= HOLD_IDLE_MS) {
        lastUsedAt = now;
        drop(holderX, holderZ);
        return;
      }
      if (brush.holder === null && now - lastUsedAt >= RESET_IDLE_MS) {
        lastUsedAt = now;
        const moved = brush.x !== EASEL_BRUSH_HOME.x || brush.z !== EASEL_BRUSH_HOME.z;
        if (moved) {
          brush.x = EASEL_BRUSH_HOME.x;
          brush.z = EASEL_BRUSH_HOME.z;
          publishBrush();
        }
      }
    }
  };
}

// world/src/data/avatar.ts
var AVATAR_OPTIONS = {
  head: [
    { value: "beret", label: "\uBCA0\uB808\uBAA8" },
    { value: "curly", label: "\uACF1\uC2AC\uBA38\uB9AC" },
    { value: "cap", label: "\uCEA1\uBAA8\uC790" },
    { value: "ribbon", label: "\uB9AC\uBCF8" },
    { value: "crown", label: "\uC655\uAD00" },
    { value: "bunny", label: "\uD1A0\uB07C \uADC0" },
    { value: "none", label: "\uC5C6\uC74C" }
  ],
  face: [
    { value: "smile", label: "\uBC29\uAE0B" },
    { value: "wink", label: "\uC719\uD06C" },
    { value: "cat", label: "\uACE0\uC591\uC774 \uC785" },
    { value: "surprised", label: "\uAE5C\uC9DD" }
  ],
  eyewear: [
    { value: "none", label: "\uC5C6\uC74C" },
    { value: "round", label: "\uB3D9\uADF8\uB780 \uC548\uACBD" },
    { value: "sunglasses", label: "\uC120\uAE00\uB77C\uC2A4" }
  ],
  outfit: [
    { value: "tunic", label: "\uC6D0\uD53C\uC2A4" },
    { value: "tee", label: "\uD2F0\uC154\uCE20" },
    { value: "stick", label: "\uB9C9\uB300 \uBAB8" }
  ],
  neck: [
    { value: "none", label: "\uC5C6\uC74C" },
    { value: "scarf", label: "\uBAA9\uB3C4\uB9AC" },
    { value: "bowtie", label: "\uB098\uBE44\uB125\uD0C0\uC774" }
  ],
  bag: [
    { value: "none", label: "\uC5C6\uC74C" },
    { value: "messenger", label: "\uD06C\uB85C\uC2A4\uBC31" },
    { value: "backpack", label: "\uBC30\uB0AD" }
  ],
  held: [
    { value: "none", label: "\uC5C6\uC74C" },
    { value: "sketch", label: "\uADF8\uB9BC\uD310" },
    { value: "pencil", label: "\uC5F0\uD544" },
    { value: "brush", label: "\uBD93" },
    { value: "heart", label: "\uD558\uD2B8 \uD48D\uC120" }
  ]
};
var AVATAR_COLOR_PARTS = [
  { key: "outfitColor", label: "\uC637" },
  { key: "headColor", label: "\uBA38\uB9AC \uC7A5\uC2DD" },
  { key: "neckColor", label: "\uBAA9" },
  { key: "bagColor", label: "\uAC00\uBC29" },
  { key: "heldColor", label: "\uC18C\uD488" },
  { key: "skinColor", label: "\uD53C\uBD80" }
];
var AVATAR_PRESETS = [
  {
    label: "\uD558\uB8E8\uB4E4 \uC2A4\uD0C0\uC77C",
    config: {
      head: "beret",
      face: "smile",
      eyewear: "none",
      outfit: "stick",
      neck: "none",
      bag: "none",
      held: "sketch",
      outfitColor: "#FFFFFF",
      headColor: "#B9A6EC",
      neckColor: "#B9A6EC",
      bagColor: "#B9A6EC",
      heldColor: "#B9A6EC",
      skinColor: "#FFFFFF"
    }
  },
  {
    label: "\uD558\uB8E8 \uC2A4\uD0C0\uC77C",
    config: {
      head: "curly",
      face: "smile",
      eyewear: "none",
      outfit: "tunic",
      neck: "none",
      bag: "messenger",
      held: "none",
      outfitColor: "#FFFFFF",
      headColor: "#2F2F2F",
      neckColor: "#B9A6EC",
      bagColor: "#B9A6EC",
      heldColor: "#B9A6EC",
      skinColor: "#FFFFFF"
    }
  }
];
var DEFAULT_AVATAR = AVATAR_PRESETS[0].config;
var PARTS = Object.keys(AVATAR_OPTIONS);
var HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
function isColor(value) {
  return typeof value === "string" && HEX_COLOR.test(value);
}
function sanitizeAvatar(raw) {
  const source = raw ?? {};
  const result = { ...DEFAULT_AVATAR };
  for (const part of PARTS) {
    const value = source[part];
    if (AVATAR_OPTIONS[part].some((option) => option.value === value)) result[part] = value;
  }
  for (const { key } of AVATAR_COLOR_PARTS) {
    const value = source[key];
    if (isColor(value)) result[key] = value.toUpperCase();
    else if (key !== "outfitColor" && key !== "skinColor" && isColor(source.accentColor)) result[key] = source.accentColor;
  }
  return result;
}

// world/src/data/emotes.ts
var EMOTES = [
  { id: "heart", symbol: "\u2764\uFE0F", label: "\uC88B\uC544\uC694" },
  { id: "laugh", symbol: "\u{1F606}", label: "\uC6C3\uC74C" },
  { id: "wow", symbol: "\u{1F62E}", label: "\uB180\uB78C" },
  { id: "sad", symbol: "\u{1F622}", label: "\uC2AC\uD514" },
  { id: "angry", symbol: "\u{1F620}", label: "\uD654\uB0A8" },
  { id: "clap", symbol: "\u{1F44F}", label: "\uBC15\uC218" }
];
function isEmote(value) {
  return EMOTES.some((emote) => emote.id === value);
}

// world/server/realtime.ts
var SNAPSHOT_INTERVAL_MS = 100;
var ROSTER_EVERY_TICKS = 3;
var LARGE_ROOM_SIZE = 40;
var HEARTBEAT_INTERVAL_MS = 3e4;
var MAX_PAYLOAD_BYTES = 2048;
var MAX_MESSAGES_PER_SECOND = 40;
var MAX_BUFFERED_BYTES = 64 * 1024;
var ROOM_PATTERN2 = /^[A-Za-z0-9-]{1,64}$/;
var DEFAULT_ROOM = "main";
var MAX_NICKNAME_LENGTH4 = 12;
var MAX_CHAT_LENGTH = 100;
var CHAT_WINDOW_MS = 1e4;
var MAX_CHATS_PER_WINDOW = 5;
var THROW_WINDOW_MS = 5e3;
var MAX_THROWS_PER_WINDOW = 6;
var KNOCK_HITS = 1;
var KNOCK_HIT_WINDOW_MS = 1e4;
var KNOCK_IMMUNE_MS = 8e3;
var PAPER_HIT_RADIUS = 1;
var PAPER_FLIGHT_SPEED = 16;
var PAPER_MIN_FLIGHT_MS = 250;
var PAPER_DROP_HEIGHT = 1.34;
var MAX_MUTED_PLAYERS = 200;
var BRUSH_INTERVAL_MS = 500;
var EMOTE_INTERVAL_MS = 1e3;
var BRUSH_REACH_SLACK = 1.5;
var LIVE_SIGNAL_MS = 3 * 6e4;
var EASEL_TICK_EVERY = 10;
var EASEL_RESYNC_INTERVAL_MS = 2e3;
var NON_VISITOR_AGENT = /bot|crawl|spider|headless|lighthouse|playwright|puppeteer|selenium/i;
var CLOSE_FULL = 4001;
var CLOSE_RESTART = 1012;
function clampNumber(value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(Math.max(value, min), max);
}
function sanitizeRoom(value) {
  return typeof value === "string" && ROOM_PATTERN2.test(value) ? value : DEFAULT_ROOM;
}
function sanitizeNickname(value) {
  if (typeof value !== "string") return "";
  const nickname = cleanText(value).replace(/\n/g, " ");
  return charLength(nickname) > MAX_NICKNAME_LENGTH4 || LINK_PATTERN.test(nickname) ? "" : nickname;
}
function round(value) {
  return Math.round(value * 100) / 100;
}
function isBrowserAgent(agent) {
  return agent !== void 0 && agent.startsWith("Mozilla/") && !NON_VISITOR_AGENT.test(agent);
}
function attachRealtime(server, { path, maxPlayers, isOriginAllowed, chatLog, easelStore }) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const players = /* @__PURE__ */ new Map();
  let nextId = 1;
  const rosterDirty = /* @__PURE__ */ new Set();
  const positionsDirty = /* @__PURE__ */ new Set();
  let lastTotal = 0;
  let snapshotTick = 0;
  const send = (socket, payload) => {
    if (socket.readyState === socket.OPEN && socket.bufferedAmount < MAX_BUFFERED_BYTES) socket.send(payload);
  };
  const easel = createEasel((room, payload, exceptId) => {
    for (const member of players.values()) {
      if (member.room === room && member.id !== exceptId) send(member.socket, payload);
    }
  }, easelStore);
  const sendEasel = (player) => {
    for (const payload of easel.snapshotFor(player.room)) send(player.socket, payload);
  };
  const markRoster = (room) => {
    rosterDirty.add(room);
  };
  const flushRosters = () => {
    const total = players.size;
    const totalChanged = total !== lastTotal;
    lastTotal = total;
    if (rosterDirty.size === 0 && !totalChanged) return;
    const rooms = /* @__PURE__ */ new Map();
    for (const player of players.values()) {
      const members = rooms.get(player.room);
      if (members) members.push(player);
      else rooms.set(player.room, [player]);
    }
    const countPayload = totalChanged ? JSON.stringify({ t: "count", total }) : null;
    for (const [room, members] of rooms) {
      if (!rosterDirty.has(room)) {
        if (countPayload) for (const member of members) send(member.socket, countPayload);
        continue;
      }
      const payload = JSON.stringify({
        t: "roster",
        total,
        players: members.map(({ id, avatar, nickname, doodle, room: memberRoom }) => ({ id, avatar, nickname, doodle, room: memberRoom }))
      });
      for (const member of members) send(member.socket, payload);
    }
    rosterDirty.clear();
  };
  const sendChatHistory = (player) => {
    if (!chatLog) return;
    const items = chatLog.recent(player.room).filter((item) => item.id === null || !player.mutedPlayers.has(item.id));
    send(player.socket, JSON.stringify({ t: "chat-history", items }));
  };
  const handleChat = (player, value, now) => {
    if (typeof value !== "string") return;
    const text = cleanText(value).replace(/\s*\n\s*/g, " ");
    if (!text) return;
    const reject = (reason) => send(player.socket, JSON.stringify({ t: "chat-reject", reason }));
    if (charLength(text) > MAX_CHAT_LENGTH) return reject("long");
    if (LINK_PATTERN.test(text)) return reject("link");
    if (now - player.chatWindowStart >= CHAT_WINDOW_MS) {
      player.chatWindowStart = now;
      player.chatCount = 0;
    }
    if (player.chatCount >= MAX_CHATS_PER_WINDOW) return reject("fast");
    player.chatCount += 1;
    chatLog?.add(player.room, player.id, player.nickname, text);
    const payload = JSON.stringify({ t: "chat", id: player.id, nickname: player.nickname, text });
    for (const member of players.values()) {
      if (member.room === player.room) send(member.socket, payload);
    }
  };
  const countHit = (target, thrower, now) => {
    if (target.mutedPlayers.has(thrower.id) || now < target.knockImmuneUntil) return false;
    if (now - target.hitWindowStart >= KNOCK_HIT_WINDOW_MS) {
      target.hitWindowStart = now;
      target.hitCount = 0;
    }
    target.hitCount += 1;
    if (target.hitCount < KNOCK_HITS) return false;
    target.hitCount = 0;
    target.knockImmuneUntil = now + KNOCK_IMMUNE_MS;
    return true;
  };
  const landPaper = (thrower, x, z, flightMs) => {
    const timer = setTimeout(() => {
      if (!players.has(thrower.socket)) return;
      let hit = null;
      let nearest = PAPER_HIT_RADIUS;
      for (const member of players.values()) {
        if (member === thrower || member.room !== thrower.room || !member.placed || member.mutedPlayers.has(thrower.id)) continue;
        const distance = Math.hypot(member.x - x, member.z - z);
        if (distance <= nearest) {
          nearest = distance;
          hit = member;
        }
      }
      if (!hit) return;
      easel.hit(hit, Date.now());
      const knock = countHit(hit, thrower, Date.now());
      const payload = JSON.stringify({ t: "hit", id: hit.id, from: thrower.id, nickname: thrower.nickname, ...knock ? { knock: true } : {} });
      for (const member of players.values()) {
        if (member.room === thrower.room) send(member.socket, payload);
      }
    }, flightMs);
    timer.unref();
  };
  const handleThrow = (player, message, now) => {
    if (now - player.throwWindowStart >= THROW_WINDOW_MS) {
      player.throwWindowStart = now;
      player.throwCount = 0;
    }
    if (player.throwCount >= MAX_THROWS_PER_WINDOW) return;
    const x = clampNumber(message.x, -MAX_SPACE_HALF_X, MAX_SPACE_HALF_X);
    const z = clampNumber(message.z, -MAX_SPACE_HALF_Z, MAX_SPACE_HALF_Z);
    if (x === null || z === null) return;
    player.throwCount += 1;
    const flight = Math.hypot(x - player.x, z - player.z, PAPER_DROP_HEIGHT) / PAPER_FLIGHT_SPEED * 1e3;
    landPaper(player, x, z, Math.max(flight, PAPER_MIN_FLIGHT_MS));
    const payload = JSON.stringify({ t: "throw", from: player.id, nickname: player.nickname, x: round(x), z: round(z) });
    for (const member of players.values()) {
      if (member.room === player.room) send(member.socket, payload);
    }
  };
  const handleBrush = (player, value, now) => {
    if (player.avatar.held !== "brush" || !player.placed || now - player.lastBrushAt < BRUSH_INTERVAL_MS) return;
    let target = null;
    for (const member of players.values()) {
      if (member.id === value && member !== player && member.room === player.room && member.placed) target = member;
    }
    if (!target || target.mutedPlayers.has(player.id)) return;
    if (Math.hypot(target.x - player.x, target.z - player.z) > BRUSH_REACH + BRUSH_REACH_SLACK) return;
    player.lastBrushAt = now;
    const payload = JSON.stringify({ t: "brush", from: player.id, nickname: player.nickname, to: target.id, color: player.avatar.heldColor });
    for (const member of players.values()) {
      if (member.room === player.room) send(member.socket, payload);
    }
  };
  const handleMessage = (socket, raw, browser) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof message !== "object" || message === null) return;
    const player = players.get(socket);
    if (message.t === "join" && !player) {
      if (players.size >= maxPlayers) {
        socket.close(CLOSE_FULL, "full");
        return;
      }
      const id = nextId++;
      players.set(socket, {
        id,
        socket,
        avatar: sanitizeAvatar(message.avatar),
        nickname: sanitizeNickname(message.nickname),
        doodle: message.doodle === true,
        room: sanitizeRoom(message.room),
        x: 0,
        z: 0,
        heading: 0,
        moving: false,
        seated: false,
        jumping: false,
        doubleJumped: false,
        placed: false,
        alive: true,
        browser,
        lastMoveAt: 0,
        windowStart: Date.now(),
        windowCount: 0,
        chatWindowStart: Date.now(),
        chatCount: 0,
        throwWindowStart: Date.now(),
        throwCount: 0,
        hitWindowStart: Date.now(),
        hitCount: 0,
        knockImmuneUntil: 0,
        lastBrushAt: 0,
        lastEmoteAt: 0,
        lastEaselResyncAt: 0,
        mutedPlayers: /* @__PURE__ */ new Set()
      });
      send(socket, JSON.stringify({ t: "welcome", id }));
      markRoster(sanitizeRoom(message.room));
      const joined = players.get(socket);
      if (joined) {
        sendChatHistory(joined);
        sendEasel(joined);
      }
      return;
    }
    if (!player) return;
    const now = Date.now();
    if (now - player.windowStart >= 1e3) {
      player.windowStart = now;
      player.windowCount = 0;
    }
    player.windowCount += 1;
    if (player.windowCount > MAX_MESSAGES_PER_SECOND) {
      socket.close(1008, "rate limit");
      return;
    }
    if (message.t === "move") {
      const x = clampNumber(message.x, -MAX_SPACE_HALF_X, MAX_SPACE_HALF_X);
      const z = clampNumber(message.z, -MAX_SPACE_HALF_Z, MAX_SPACE_HALF_Z);
      const heading = clampNumber(message.h, -Math.PI * 2, Math.PI * 2);
      if (x === null || z === null || heading === null) return;
      player.x = x;
      player.z = z;
      player.heading = heading;
      player.moving = message.m === true;
      player.seated = message.s === true;
      player.jumping = message.j === true;
      player.doubleJumped = message.d === true;
      player.placed = true;
      player.lastMoveAt = now;
      positionsDirty.add(player.room);
      easel.moved(player);
    } else if (message.t === "avatar") {
      player.avatar = sanitizeAvatar(message.avatar);
      player.nickname = sanitizeNickname(message.nickname);
      player.doodle = message.doodle === true;
      markRoster(player.room);
    } else if (message.t === "room") {
      markRoster(player.room);
      easel.left(player);
      player.room = sanitizeRoom(message.room);
      player.placed = false;
      markRoster(player.room);
      sendChatHistory(player);
      sendEasel(player);
    } else if (message.t === "chat") {
      handleChat(player, message.text, now);
    } else if (message.t === "throw") {
      handleThrow(player, message, now);
    } else if (message.t === "brush") {
      handleBrush(player, message.to, now);
    } else if (message.t === "emote") {
      if (!isEmote(message.emote) || now - player.lastEmoteAt < EMOTE_INTERVAL_MS) return;
      player.lastEmoteAt = now;
      const payload = JSON.stringify({ t: "emote", from: player.id, emote: message.emote });
      for (const member of players.values()) {
        if (member.room === player.room) send(member.socket, payload);
      }
    } else if (typeof message.t === "string" && message.t.startsWith("easel-")) {
      if (!easel.handle(player, message, now) && now - player.lastEaselResyncAt >= EASEL_RESYNC_INTERVAL_MS) {
        player.lastEaselResyncAt = now;
        sendEasel(player);
      }
    } else if (message.t === "mute" && typeof message.id === "number" && player.mutedPlayers.size < MAX_MUTED_PLAYERS) {
      player.mutedPlayers.add(message.id);
    }
  };
  sockets.on("connection", (socket, request) => {
    const browser = isBrowserAgent(request.headers["user-agent"]);
    socket.on("message", (data, isBinary) => {
      if (!isBinary) handleMessage(socket, data.toString(), browser);
    });
    socket.on("pong", () => {
      const player = players.get(socket);
      if (player) player.alive = true;
    });
    socket.on("error", () => socket.terminate());
    socket.on("close", () => {
      const player = players.get(socket);
      if (player && players.delete(socket)) {
        markRoster(player.room);
        easel.left(player);
      }
    });
  });
  const handleUpgrade = (request, socket, head) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    if (pathname !== path) return;
    if (!isOriginAllowed(request.headers.origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client, request));
  };
  server.on("upgrade", handleUpgrade);
  const snapshotTimer = setInterval(() => {
    snapshotTick += 1;
    if (snapshotTick % ROSTER_EVERY_TICKS === 0) flushRosters();
    if (snapshotTick % EASEL_TICK_EVERY === 0) easel.tick(Date.now());
    if (positionsDirty.size === 0) return;
    const rooms = /* @__PURE__ */ new Map();
    for (const player of players.values()) {
      if (!positionsDirty.has(player.room)) continue;
      const members = rooms.get(player.room);
      if (members) members.push(player);
      else rooms.set(player.room, [player]);
    }
    positionsDirty.clear();
    for (const [room, members] of rooms) {
      if (members.length > LARGE_ROOM_SIZE && snapshotTick % 2 === 1) {
        positionsDirty.add(room);
        continue;
      }
      const payload = JSON.stringify({
        t: "snapshot",
        players: members.filter((player) => player.placed).map(({ id, x, z, heading, moving, seated, jumping, doubleJumped }) => ({ id, x: round(x), z: round(z), h: round(heading), m: moving, s: seated, ...jumping ? { j: true } : {}, ...doubleJumped ? { d: true } : {} }))
      });
      for (const member of members) send(member.socket, payload);
    }
  }, SNAPSHOT_INTERVAL_MS);
  const heartbeatTimer = setInterval(() => {
    for (const player of players.values()) {
      if (!player.alive) {
        player.socket.terminate();
        continue;
      }
      player.alive = false;
      player.socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  snapshotTimer.unref();
  heartbeatTimer.unref();
  const close = () => {
    clearInterval(snapshotTimer);
    clearInterval(heartbeatTimer);
    server.off("upgrade", handleUpgrade);
    for (const client of sockets.clients) client.close(CLOSE_RESTART, "restart");
    sockets.close();
  };
  server.once("close", close);
  const liveCount = () => {
    const since = Date.now() - LIVE_SIGNAL_MS;
    let count = 0;
    for (const player of players.values()) {
      if (player.browser && player.lastMoveAt >= since) count += 1;
    }
    return count;
  };
  const easelSnapshot = () => easel.snapshotFor(EASEL_ROOM).map((payload) => JSON.parse(payload));
  return { close, playerCount: () => players.size, liveCount, easelSnapshot };
}

// world/server/relay.ts
import { mkdirSync as mkdirSync6 } from "node:fs";
import { dirname as dirname6 } from "node:path";
import { DatabaseSync as DatabaseSync6 } from "node:sqlite";
var LIST_SIZE2 = 100;
var HIDE_AT_REPORTS3 = 3;
var MINUTE_MS5 = 6e4;
var HOUR_MS4 = 60 * MINUTE_MS5;
var REGISTERS_PER_WINDOW2 = 5;
var REGISTER_WINDOW_MS2 = 10 * MINUTE_MS5;
var REGISTERS_PER_HOUR_TOTAL2 = 200;
var REPORTS_PER_HOUR3 = 20;
var REMOVE_TRIES_PER_WINDOW2 = 5;
var REMOVE_WINDOW_MS2 = 10 * MINUTE_MS5;
function createRelayHandler({ databasePath, isOriginAllowed, trustProxy = false, harudleBaseUrl }) {
  mkdirSync6(dirname6(databasePath), { recursive: true });
  const database = new DatabaseSync6(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS relay_episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      password_hash BLOB NOT NULL,
      password_salt BLOB NOT NULL,
      reports INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0
    );
  `);
  const columns = database.prepare("PRAGMA table_info(relay_episodes)").all();
  for (const name of ["title", "ending"]) {
    if (columns.some((column) => column.name === name)) database.exec(`ALTER TABLE relay_episodes DROP COLUMN ${name}`);
  }
  const list = database.prepare("SELECT id, feed_id, created_at FROM relay_episodes WHERE hidden = 0 ORDER BY id LIMIT ?");
  const findFeed = database.prepare("SELECT id FROM relay_episodes WHERE feed_id = ?");
  const findCredentials = database.prepare("SELECT password_hash, password_salt FROM relay_episodes WHERE id = ?");
  const insert = database.prepare(
    "INSERT INTO relay_episodes (feed_id, created_at, password_hash, password_salt) VALUES (?, ?, ?, ?)"
  );
  const remove = database.prepare("DELETE FROM relay_episodes WHERE id = ?");
  const addReport = database.prepare(
    `UPDATE relay_episodes SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ${HIDE_AT_REPORTS3} THEN 1 ELSE hidden END WHERE id = ?`
  );
  const limit = createLimiter();
  const reportedBy = /* @__PURE__ */ new Set();
  const fetchFeed = createFeedFetcher(harudleBaseUrl);
  const clientKey = (request) => {
    const forwarded = trustProxy ? request.headers["x-forwarded-for"] : void 0;
    const value = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
    return value?.split(",").pop()?.trim() || request.socket.remoteAddress || "unknown";
  };
  const toEpisode = (row, feed, number) => ({
    id: row.id,
    number,
    createdAt: row.created_at,
    imageUrl: feed.imageUrl,
    shareUrl: feed.shareUrl,
    author: feed.author
  });
  const handle = (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = /^\/relay(?:\/(\d{1,15})\/(report|remove))?$/.exec(url.pathname);
    if (!match) return false;
    const origin = request.headers.origin;
    const originAllowed = isOriginAllowed(origin);
    const respond = (status, body) => {
      response.writeHead(status, {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Origin",
        ...originAllowed && origin ? { "Access-Control-Allow-Origin": origin } : {},
        ...body === void 0 ? {} : { "Content-Type": "application/json; charset=utf-8" }
      });
      response.end(body === void 0 ? void 0 : JSON.stringify(body));
    };
    const fail = () => {
      if (!response.headersSent) respond(500, { code: "failed" });
    };
    const readJson = async () => {
      if (!request.headers["content-type"]?.startsWith("application/json")) return null;
      const raw = await readBody(request);
      if (raw === null) {
        response.setHeader("Connection", "close");
        return null;
      }
      try {
        const body = JSON.parse(raw);
        return typeof body === "object" && body !== null ? body : null;
      } catch {
        return null;
      }
    };
    const id = match[1] ? Number(match[1]) : null;
    const action = match[2];
    if (request.method === "OPTIONS") {
      if (originAllowed) {
        response.setHeader("Access-Control-Allow-Methods", "GET, POST");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
        response.setHeader("Access-Control-Max-Age", "600");
      }
      respond(204);
      return true;
    }
    if (request.method === "GET" && id === null) {
      const rows = list.all(LIST_SIZE2);
      Promise.all(rows.map(async (row) => ({ row, result: await fetchFeed(row.feed_id) }))).then((results) => {
        const visible = results.flatMap(({ row, result }) => result.status === "ok" ? [{ row, feed: result.feed }] : []);
        respond(200, { items: visible.map(({ row, feed }, index) => toEpisode(row, feed, index + 1)) });
      }).catch(fail);
      return true;
    }
    if (!originAllowed) {
      respond(403, { code: "forbidden" });
      return true;
    }
    const register = async () => {
      const body = await readJson();
      if (!body) return respond(400, { code: "invalid" });
      const feedId = parseFeedId(body.shareUrl);
      if (!feedId) return respond(400, { code: "bad_link" });
      if (!isValidPassword(body.password)) return respond(400, { code: "bad_password" });
      if (findFeed.get(feedId)) return respond(409, { code: "duplicate" });
      if (!limit(`register:${clientKey(request)}`, REGISTERS_PER_WINDOW2, REGISTER_WINDOW_MS2) || !limit("register:all", REGISTERS_PER_HOUR_TOTAL2, HOUR_MS4)) {
        return respond(429, { code: "rate_limited" });
      }
      const result = await fetchFeed(feedId);
      if (result.status === "missing") return respond(404, { code: "not_found" });
      if (result.status === "unavailable") return respond(503, { code: "unavailable" });
      const { hash, salt } = await hashPassword(body.password);
      if (findFeed.get(feedId)) return respond(409, { code: "duplicate" });
      insert.run(feedId, (/* @__PURE__ */ new Date()).toISOString(), hash, salt);
      respond(201, { ok: true });
    };
    const removeWithPassword = async (episodeId) => {
      const body = await readJson();
      if (!body) return respond(400, { code: "invalid" });
      if (!limit(`remove:${clientKey(request)}:${episodeId}`, REMOVE_TRIES_PER_WINDOW2, REMOVE_WINDOW_MS2)) {
        return respond(429, { code: "rate_limited" });
      }
      const row = findCredentials.get(episodeId);
      if (!row) return respond(404, { code: "not_found" });
      if (!await verifyPassword(body.password, row.password_salt, row.password_hash)) return respond(403, { code: "wrong_password" });
      remove.run(episodeId);
      respond(204);
    };
    const report = (episodeId) => {
      const key = clientKey(request);
      if (!limit(`report:${key}`, REPORTS_PER_HOUR3, HOUR_MS4)) return respond(429, { code: "rate_limited" });
      const reportKey = `${key}:${episodeId}`;
      if (!reportedBy.has(reportKey)) {
        reportedBy.add(reportKey);
        addReport.run(episodeId);
      }
      respond(204);
    };
    try {
      if (request.method === "POST" && id === null) register().catch(fail);
      else if (request.method === "POST" && id !== null && action === "remove") removeWithPassword(id).catch(fail);
      else if (request.method === "POST" && id !== null && action === "report") report(id);
      else respond(405, { code: "invalid" });
    } catch {
      fail();
    }
    return true;
  };
  return { handle, close: () => database.close() };
}

// world/server/campus.ts
var WORLD_WS_PATH = "/world/ws";
function startWorld(server, { dataDir, allowedOrigins, trustProxy = false, maxPlayers = 150 }) {
  const allowed = new Set(allowedOrigins);
  const isOriginAllowed = (origin) => origin !== void 0 && allowed.has(origin);
  const db = (name) => join(dataDir, `${name}.db`);
  const chatLog = createChatLog(db("chats"));
  const easelStore = createEaselStore(db("easel"));
  const handlers = [
    createCheersHandler({ databasePath: db("cheers"), isOriginAllowed, trustProxy }),
    createQuizzesHandler({ databasePath: db("quizzes"), isOriginAllowed, trustProxy }),
    createRelayHandler({ databasePath: db("relay"), isOriginAllowed, trustProxy }),
    createCrabRankingHandler({ databasePath: db("crabgame"), isOriginAllowed, trustProxy })
  ];
  const proxyHarudle = createHarudleProxy({ trustProxy });
  const realtime = attachRealtime(server, { path: WORLD_WS_PATH, maxPlayers, isOriginAllowed, chatLog, easelStore });
  return {
    handle(request, response) {
      if (request.url === "/easel/art" && request.method === "GET") {
        const [brush, art] = realtime.easelSnapshot();
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        response.end(JSON.stringify({ holder: brush?.holder ?? null, segs: art?.segs ?? [] }));
        return true;
      }
      return handlers.some((handler) => handler.handle(request, response)) || easelStore.handle(request, response) || proxyHarudle(request, response);
    },
    playerCount: realtime.playerCount,
    /** 접속자에게 재접속 신호를 보내고 DB를 닫는다. */
    close() {
      realtime.close();
      for (const handler of handlers) handler.close();
      chatLog.close();
      easelStore.close();
    }
  };
}
export {
  WORLD_WS_PATH,
  startWorld
};
