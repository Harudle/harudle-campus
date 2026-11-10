// 하루들 우테코 캠퍼스 앱 (워커 프로세스)
// server.js(감독)가 띄운다. 새 버전이 오면 감독이 새 워커를 먼저 띄우고, 준비되면 이 워커를 비운다.
// - dist/ 정적 파일 (npm run build 결과, 저장소에 함께 올린다)
// - GET /api/feed : 하루들 공개 피드를 작성자별로 묶어 중계 (4분 캐시)
// - WS  /ws       : 같은 캠퍼스에 있는 크루 위치·말풍선·스킬 공유
// - 14층 하루들 월드: /world/(dist), WS /world/ws, 월드 API (dist-server/world.mjs, world/server/campus.ts)
// - 1:1 대결: WS duel:* (server/duel, docs/duel.md)
import http from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createWeatherService } from "./weather.js";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { roomKeyAt } from "./dist-check/world.mjs";
import { createMediaService, mediaArea, canShareInRoom } from "./server/media/index.js";
import { createSwitchCoordinator } from "./server/media/switch-coordinator.js";
import { createCloudflareTestService } from "./server/media/cloudflare-test.js";
import { createMeetingRegistry } from "./server/media/meeting-registry.js";
import { createMediaAdmission, mediaClientAddress } from "./server/media/admission.js";
import { createAuth } from "./server/auth/index.js";
import { createStartrack } from "./server/startrack.js";
import { canControlStartrack } from "./src/startrack/shared.mjs";
import { CHAT_CMDS, rollText, pickText } from "./src/chat/shared.mjs";
import { createDuel } from "./server/duel/index.js";
import { DUEL } from "./src/duel/shared.mjs";

const PORT = Number(process.env.PORT || 80);
const BIND_HOST = process.env.CAMPUS_BIND_HOST || undefined;
const VERSION = (process.env.APP_VERSION || "dev").slice(0, 12);
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const HARUDLE = "https://www.harudle.com";
const FEED_TTL = 4 * 60 * 1000;   // 하루들 이미지 주소는 15분 뒤 만료되므로 그보다 짧게
const PER_AUTHOR = 6;
const weather = createWeatherService();
const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
// 월드 DB는 배포(git reset)에도 지워지지 않는 .data/world에 둔다
const WORLD_DATA_DIR = process.env.WORLD_DATA_DIR || join(APP_DIR, ".data", "world");
const WORLD_ORIGINS = (process.env.WORLD_ORIGINS || "https://campus.harudle.com,http://localhost:8080,http://localhost:3000,http://127.0.0.1:8080,http://127.0.0.1:3000").split(",").map((o) => o.trim()).filter(Boolean);
const auth = createAuth(process.env);   // 하루들 로그인 연동. 비밀값·저장소가 없으면 꺼진 채(모두 게스트)
auth.startCleanup();

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

/* ───────── 하루들 공개 피드 ───────── */
let feedCache = { at: 0, body: null, pending: null };
async function fetchFeed() {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 4; page++) {
    const url = `${HARUDLE}/api/v1/feeds?size=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "wooteco-metaverse/1.0" } });
    if (!res.ok) throw new Error(`harudle ${res.status}`);
    const json = await res.json();
    items.push(...(json.items || []));
    if (!json.hasNext || !json.nextCursor) break;
    cursor = json.nextCursor;
  }
  const byAuthor = new Map();
  for (const f of items) {
    const a = f.author || {};
    const key = a.id || a.nickname || "anon";
    if (!byAuthor.has(key)) byAuthor.set(key, { id: key, nick: a.nickname || "익명", avatar: a.profileImageUrl || null, total: 0, feeds: [] });
    const p = byAuthor.get(key);
    p.total++;
    if (p.feeds.length < PER_AUTHOR) p.feeds.push({ id: f.id, cat: f.category?.name || "", at: f.publishedAt, likes: f.likeCount || 0, comments: f.commentCount || 0, share: f.shareUrl, img: f.imageUrl });
  }
  return JSON.stringify([...byAuthor.values()].sort((a, b) => b.total - a.total));
}
async function feed() {
  if (feedCache.body && Date.now() - feedCache.at < FEED_TTL) return feedCache.body;
  if (!feedCache.pending) {
    feedCache.pending = fetchFeed()
      .then((body) => { feedCache = { at: Date.now(), body, pending: null }; return body; })
      .catch((e) => { feedCache.pending = null; if (feedCache.body) return feedCache.body; throw e; });
  }
  return feedCache.pending;
}

// 피드 하나가 있는지(헤드셋 해금 확인). 확인한 것은 기억해 두고, 하루들이 응답하지 않으면 있다고 본다
const feedSeen = new Map();
async function feedExists(id) {
  if (feedSeen.has(id)) return feedSeen.get(id);
  try {
    const res = await fetch(`${HARUDLE}/api/v1/feeds/${id}`, { headers: { accept: "application/json", "user-agent": "wooteco-metaverse/1.0" }, signal: AbortSignal.timeout(5000) });
    if (res.status === 404) { feedSeen.set(id, false); return false; }
    if (!res.ok) return true;
    feedSeen.set(id, true); if (feedSeen.size > 5000) feedSeen.clear(); return true;
  } catch { return true; }
}

/* ───────── HTTP ───────── */
let world = null;   // 14층 하루들 월드 (아래에서 켠다)
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/healthz") { res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }); return res.end(`ok ${VERSION}`); }
    if (await auth.handle(req, res, url)) return;   // /api/me · /auth/harudle/start · /auth/harudle/callback · /auth/logout
    if (url.pathname === "/api/environment") {
      // 외부 요청은 백그라운드에서 갱신하므로 날씨 서비스가 느려도 시계는 바로 응답한다.
      const state = weather.snapshot();
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return res.end(JSON.stringify({ serverTime: Date.now(), ...state }));
    }
    if (url.pathname === "/api/feed-check") {   // 헤드셋 해금: 붙여넣은 하루들 피드가 진짜 있는지
      const id = url.searchParams.get("id") || "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) { res.writeHead(400, { "content-type": "application/json" }); return res.end('{"ok":false}'); }
      const ok = await feedExists(id);
      res.writeHead(ok ? 200 : 404, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify({ ok }));
    }
    if (url.pathname === "/api/feed") {
      const body = await feed();
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return res.end(body);
    }
    if (world?.handle(req, res)) return;
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path.endsWith("/")) path += "index.html";
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("없는 페이지예요"); }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": extname(file) === ".html" ? "no-cache" : path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "max-age=3600" });
    res.end(await readFile(file));
  } catch (e) {
    console.error(req.url, e.message);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "feed_unavailable" }));
  }
});

/* ───────── 14층 하루들 월드 ───────── */
// Node 22.13 이상(node:sqlite)이 필요하다. 켜지 못해도 캠퍼스는 그대로 돌고, 14층은 연결 안 됨으로 보인다
try {
  const { startWorld } = await import("./dist-server/world.mjs");
  world = startWorld(server, { dataDir: WORLD_DATA_DIR, allowedOrigins: WORLD_ORIGINS, trustProxy: process.env.NODE_ENV === "production" });
  console.log("[world] 14층 하루들 월드 켜짐");
} catch (e) { console.error(`[world] 14층 하루들 월드를 켜지 못했어요 (Node ${process.version})`, e.message); }

/* ───────── 실시간 접속 ───────── */
// /world/ws는 하루들 월드가 받으므로, 캠퍼스는 /ws만 직접 골라 받는다
const cloudflareTestMode = ["cloudflare-test", "auto-test", "managed-draft"].includes(process.env.MEDIA_PROVIDER);
const requiredOrigin = process.env.CAMPUS_PUBLIC_ORIGIN || "";
if (requiredOrigin) {
  const parsed = new URL(requiredOrigin);
  if (parsed.protocol !== "https:" || parsed.origin !== requiredOrigin || parsed.username || parsed.password) throw new Error("invalid_campus_origin");
}
if (process.env.NODE_ENV === "production" && process.env.MEDIA_PROVIDER === "managed-draft" && !requiredOrigin) throw new Error("invalid_campus_origin");
const wss = new WebSocketServer({ noServer: true, maxPayload: cloudflareTestMode ? 131072 : 4096, verifyClient: ({ origin }) => !requiredOrigin || origin === requiredOrigin });
server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url, "http://x");
  if (pathname === "/ws") wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  else if (!(world && pathname === "/world/ws")) socket.destroy();
});
const peers = new Map();   // id -> { ws, name, presence }
// 연동 크루가 상점에서 펫 · 장식을 쓰거나 벗으면 접속 중인 그 크루의 gear를 바로 바꾼다
auth.onGear((userId, gear) => { const uid = `h_${userId}`; for (const p of peers.values()) if (p.uid === uid) { if (Object.keys(gear).length) p.gear = gear; else delete p.gear; dirty = true; } });
const startrack = createStartrack({ onChange: (state) => ezAll({ t: "startrack", state }) });
// 1:1 대결: 경기 · 관전 자리는 공개 주소(uid)에 묶는다. 100ms마다 시간을 흘려 보낸다(카운트다운 · 시간 제한 · 끊김 기다림)
const duel = createDuel({ peers, send: (pid, msg) => { const p = peers.get(pid); if (p?.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); } });
setInterval(() => duel.tick(), DUEL.TICK).unref();
const admission = process.env.MEDIA_PROVIDER === "managed-draft" ? createMediaAdmission({ peers, maxParticipants: Number(process.env.MEDIA_MAX_PARTICIPANTS || 20), perAddressPerMinute: Number(process.env.MEDIA_JOIN_PER_IP_PER_MINUTE || 12) }) : null;
const mediaSwitch = createSwitchCoordinator(peers, process.env.MEDIA_PROVIDER === "managed-draft" ? 2000 : 15000);
let managedStack = null;
if (process.env.MEDIA_PROVIDER === "managed-draft") {
  try {
    const { createManagedMediaStack } = await import("./server/media/managed-stack.js");
    managedStack = createManagedMediaStack(process.env, peers, { notifySwitch: (change) => mediaSwitch.prepare(change) });
  } catch (error) {
    const reason = /^[a-z_]+$/.test(error?.message || "") ? error.message : "unavailable";
    console.error(`[media-managed] unavailable: ${reason}`);
  }
}
const cloudflareTest = process.env.MEDIA_PROVIDER === "managed-draft" ? managedStack?.cloudflare : cloudflareTestMode ? createCloudflareTestService(process.env, peers) : null;
// 운영에서는 예약과 복구가 없는 단순 제공자를 실수로 켜지 않는다.
const unmanagedProduction = process.env.NODE_ENV === "production" && process.env.MEDIA_PROVIDER !== "managed-draft";
const mediaService = unmanagedProduction ? { configured: false } : process.env.MEDIA_PROVIDER === "managed-draft" ? managedStack?.router || { configured: false } : process.env.MEDIA_PROVIDER === "cloudflare-test" ? cloudflareTest : createMediaService(process.env, { onSwitch: (change) => mediaSwitch.prepare(change), cloudflareTest });
// 운영에서는 사용량 DB에 회의 목록을 함께 저장한다. 로컬 시험은 메모리만 사용한다.
let meetings = null;
if (process.env.NODE_ENV === "production" && process.env.MEDIA_PROVIDER === "managed-draft" && process.env.MEDIA_MEETINGS !== "persistent") throw new Error("invalid_meeting_config");
if (process.env.MEDIA_MEETINGS === "persistent") {
  if (process.env.MEDIA_PROVIDER !== "managed-draft" || process.env.MEDIA_SINGLE_HOST !== "1") throw new Error("invalid_meeting_config");
  const { openPersistentMeetings } = await import("./server/media/persistent-meetings.js");
  meetings = openPersistentMeetings({ path: process.env.MEDIA_STATE_PATH });
} else if (process.env.MEDIA_MEETINGS_TEST === "local-only" && BIND_HOST === "127.0.0.1") meetings = createMeetingRegistry();
const workerId = randomBytes(6).toString("hex");
let seq = 0, dirty = false;
function retireMedia(peer) {
  const key = peer.mediaLease; peer.mediaLease = null;
  if (!key || !managedStack) return peer.mediaRelease || Promise.resolve();
  const work = Promise.resolve(peer.mediaRelease).catch(() => {}).then(() => managedStack.router.releaseLivekit(key));
  peer.mediaRelease = work;
  void work.finally(() => { if (peer.mediaRelease === work) peer.mediaRelease = null; }).catch(() => {});
  return work;
}
const clean = (s, n) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, "").slice(0, n) : "");
/* ───────── 크루 주소: 비밀 uid는 서버 밖으로 내보내지 않는다 ─────────
   브라우저는 저만 아는 비밀 uid를 서버에 한 번 보낸다(WS "id"). 서버는 그 해시(공개 주소 p_…)만 다른 크루에게 보여 준다.
   개인 메시지·이젤 획·접속자 목록은 모두 공개 주소를 쓰므로, 남의 주소를 알아도 그 사람의 개인 메시지 기록은 받을 수 없다 */
const PUB_RE = /^p_[0-9a-f]{16}$/;
const ADDR_RE = /^(p_[0-9a-f]{16}|h_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;   // 게스트(p_…) · 하루들 로그인(h_회원 ID)
const pubOf = (secret) => `p_${createHash("sha256").update(`harudle-campus:${secret}`).digest("hex").slice(0, 16)}`;
const asPub = (u) => (typeof u !== "string" || !u ? u : PUB_RE.test(u) ? u : pubOf(u));   // 예전 기록(비밀 uid 그대로)을 공개 주소로
function dmKeyOf(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
const strokeId = (u, id) => (id.startsWith(`${u}-`) ? id : `${u}-${createHash("sha256").update(id).digest("hex").slice(0, 12)}`);   // 예전 클라이언트는 획 id에 비밀 uid를 넣었다
// arena: 이 크루가 지금 있는 경기 방(duel.arenaOf). 대결장 층(21~24)은 그 경기의 선수 · 관전자만 그 방 번호(ar)로 받고, 나머지는 캠퍼스로 돌린다
function sanitize(p, arena = null) {
  if (!p || typeof p !== "object") return null;
  const num = (v, a, b) => (typeof v === "number" && isFinite(v) ? Math.min(b, Math.max(a, v)) : 0);
  const inArena = !!arena && p.f === arena.floor && p.ar === arena.ar, f = inArena ? p.f : [11, 12, 13, 14].includes(p.f) ? p.f : 11;
  return {
    f, x: num(p.x, 0, 56), y: num(p.y, 0, 40), u: num(p.u, 0, inArena ? 12 : 2), h: num(p.h, -7, 7),
    m: p.m ? 1 : 0, r: p.r ? 1 : 0, look: Math.floor(num(p.look, 0, 99)), jc: Math.floor(num(p.jc, 0, 1e9)), ac: Math.floor(num(p.ac, 0, 1e9)),
    br: p.br ? 1 : 0, bc: typeof p.bc === "string" && /^#[0-9a-f]{6}$/i.test(p.bc) ? p.bc : null, l: p.l ? 1 : 0, ly: num(p.ly, -7, 7), st: p.st ? 1 : 0, av: typeof p.av === "string" && /^[0-9a-z]{7}([0-9A-F]{6}){6}[0-9a-z]?$/.test(p.av) ? p.av : null, an: ["draw", "wave", "heart", "laptop", "coffee", "dance", "gun"].includes(p.an) ? p.an : null, lp: p.lp ? 1 : 0, gn: p.gn ? 1 : 0, fk: p.fk ? 1 : 0, fl: p.fl ? 1 : 0, ox: num(p.ox, -20, 2), oz: num(p.oz, -40, 20), hc: Math.floor(num(p.hc, 0, 1e9)), hd: num(p.hd, -50, 50), dn: Math.floor(num(p.dn, 0, 10)), fc: Math.floor(num(p.fc, 0, 1e9)), fh: num(p.fh, -50, 50), as: Math.floor(num(p.as, 0, 1e7)), vc: [0, 1, 2].includes(p.vc) ? p.vc : 0,
    // 대결장의 방 이름은 경기 방: 근처 채팅과 음성이 그 경기(선수 + 관전자) 안에서만 오간다. 회의실이 아니라 화면 공유는 꺼진다. dr: 1 선수 · 2 관전
    rm: inArena ? `duel:${arena.ar}` : roomKeyAt(f, num(p.x, 0, 56), num(p.y, 0, 40)), ...(inArena ? { ar: arena.ar, ...(arena.role ? { dr: arena.role } : {}) } : {}),
  };
}
/* ───────── 13층 스타트랙 객석 뒤 창문 두 칸(이스터에그, 창가 테이블 띠 남쪽): 종이 총알 50발이면 깨지고 1분 뒤 다시 붙는다 ─────────
   맞은 횟수는 모두 함께 센다(쏜 사람 브라우저가 자기 총알이 창에 맞으면 알린다). 3분 동안 아무도 안 쏘면 금이 사라진다. 워커가 바뀌면 처음부터 */
const GLASS_N = 2, GLASS_HITS = 50, GLASS_BACK = 60000, GLASS_IDLE = 180000;
const glass = { hits: Array(GLASS_N).fill(0), until: Array(GLASS_N).fill(0), at: 0 };
const glassState = () => JSON.stringify({ t: "glass", hits: glass.hits, left: glass.until.map((u) => Math.max(0, u - Date.now())) });
function glassAll() { const s = glassState(); for (const pp of peers.values()) if (pp.ws.readyState === 1) pp.ws.send(s); }
function glassHit(pid, w) {
  const me = peers.get(pid), now = Date.now();
  if (!me || me.presence?.f !== 13 || !Number.isInteger(w) || w < 0 || w >= GLASS_N || glass.until[w] > now) return;
  if (now - (me.glassAt || 0) < 200) return; me.glassAt = now;   // 종이 총은 0.25초에 한 발
  glass.at = now;
  if (++glass.hits[w] >= GLASS_HITS) { glass.hits[w] = 0; glass.until[w] = now + GLASS_BACK; setTimeout(glassAll, GLASS_BACK + 50).unref?.(); }
  glassAll();
}
setInterval(() => { if (glass.hits.some(Boolean) && Date.now() - glass.at > GLASS_IDLE) { glass.hits.fill(0); glassAll(); } }, 30000).unref();
/* ───────── 하루들 부스 공유 이젤: 획(stroke)을 모아 두고 모두에게 나눈다 ─────────
   획 = { id, u(그린 사람), c(색), w(굵기), p[x,y,…](0~1000), h(뒤로가기로 숨김) }. 배포로 워커가 바뀌어도 남게 임시 폴더에 저장한다 */
const EZ_FILE = join(tmpdir(), "harudle-easel.json"), EZ_MAX = 2500, EZ_PTS = 4000;
// 판(board)이 여럿: easel(부스 네컷 이젤), wb(12층 코워킹 존 화이트보드). 판마다 획과 사람별 앞으로가기 줄을 따로 둔다
const EZ_BOARDS = ["easel", "wb"], ez = Object.fromEntries(EZ_BOARDS.map((b) => [b, { strokes: [], redo: new Map() }]));
try { const d = JSON.parse(readFileSync(EZ_FILE, "utf8")); if (Array.isArray(d.strokes)) ez.easel.strokes = d.strokes; for (const b of EZ_BOARDS) if (Array.isArray(d.boards?.[b])) ez[b].strokes = d.boards[b]; } catch { }
for (const b of EZ_BOARDS) for (const st of ez[b].strokes) { st.u = asPub(st.u); if (typeof st.id === "string" && st.u) st.id = strokeId(st.u, st.id); }   // 예전 획: 비밀 uid → 공개 주소
let ezDirty = false;
setInterval(() => { if (!ezDirty) return; ezDirty = false; writeFile(EZ_FILE, JSON.stringify({ strokes: ez.easel.strokes, boards: Object.fromEntries(EZ_BOARDS.map((b) => [b, ez[b].strokes])) })).catch(() => { }); }, 4000).unref();
const ezAll = (msg, except) => { const s = JSON.stringify(msg); for (const [pid, { ws }] of peers) if (pid !== except && ws.readyState === 1) ws.send(s); };
function ezMessage(pid, m) {
  const u = peers.get(pid)?.uid; if (!u) return;   // 그린 사람은 접속의 공개 주소로 정한다(보낸 값을 믿지 않는다)
  const b = EZ_BOARDS.includes(m.b) ? m.b : "easel", ezStrokes = ez[b].strokes, ezRedo = ez[b].redo;
  if (m.k === "seg") {
    const raw = clean(m.id, 48), id = raw && strokeId(u, raw), c = /^#[0-9a-f]{6}$/i.test(m.c) ? m.c : "#111118", w = Math.min(80, Math.max(1, Number(m.w) || 6));
    const pts = Array.isArray(m.p) ? m.p.slice(0, 400).map((v) => Math.min(1000, Math.max(0, Math.round(Number(v) || 0)))) : [];
    if (!id || pts.length < 2) return;
    let st = ezStrokes.find((x) => x.id === id);
    if (!st) { st = { id, u, c, w, p: [], h: 0 }; ezStrokes.push(st); ezRedo.delete(u); if (ezStrokes.length > EZ_MAX) ezStrokes.splice(0, ezStrokes.length - EZ_MAX); }
    if (st.u !== u || st.p.length >= EZ_PTS) return;
    st.p.push(...pts); ezDirty = true;
    ezAll({ t: "ez", b, k: "seg", id, u, c, w, p: pts }, pid);
  } else if (m.k === "end") { const raw = clean(m.id, 48); if (raw) ezAll({ t: "ez", b, k: "end", id: strokeId(u, raw) }, pid); }
  else if (m.k === "undo") {
    for (let i = ezStrokes.length - 1; i >= 0; i--) { const st = ezStrokes[i]; if (st.u === u && !st.h) { st.h = 1; (ezRedo.get(u) || ezRedo.set(u, []).get(u)).push(st.id); ezDirty = true; ezAll({ t: "ez", b, k: "vis", id: st.id, h: 1 }, pid); break; } }
  } else if (m.k === "redo") {
    const id = ezRedo.get(u)?.pop(), st = id && ezStrokes.find((x) => x.id === id);
    if (st) { st.h = 0; ezDirty = true; ezAll({ t: "ez", b, k: "vis", id, h: 0 }, pid); }
  }
}
/* ───────── 채팅: 근처 · 전체 · 개인 ─────────
   근처: 보낸 순간 같은 층, 같은 방(회의실·강의실이면 그 방 사람만), 열린 곳이면 12칸 안(음성과 같은 거리). 남기지 않는다(받은 사람 브라우저에만)
   전체: 최근 200개를 남긴다. 개인: 두 사람(브라우저 uid) 사이 최근 50개를 남긴다. 둘 다 임시 폴더에 저장 */
const CHAT_FILE = join(tmpdir(), "harudle-chat.json"), NEAR = 12;
let chatAll = [], chatDm = {};
try { const d = JSON.parse(readFileSync(CHAT_FILE, "utf8")); if (Array.isArray(d.all)) chatAll = d.all; if (d.dm && typeof d.dm === "object") chatDm = d.dm; } catch { }
{ // 예전 기록에 남은 비밀 uid를 공개 주소로 바꾼다
  const fix = (m) => { if (m?.from) m.from.u = asPub(m.from.u); if (m && "to" in m) m.to = asPub(m.to); return m; };
  chatAll.forEach(fix);
  const dm = {}; for (const [k, v] of Object.entries(chatDm)) { const [a, b] = k.split("|").map(asPub); if (!a || !b || !Array.isArray(v)) continue; (dm[dmKeyOf(a, b)] ||= []).push(...v.map(fix)); }
  chatDm = dm;
}
let chatDirty = false, chatSeq = Date.now();
setInterval(() => { if (!chatDirty) return; chatDirty = false; writeFile(CHAT_FILE, JSON.stringify({ all: chatAll, dm: chatDm })).catch(() => { }); }, 4000).unref();
const dmKey = dmKeyOf;
function chatMessage(pid, m) {
  const me = peers.get(pid); if (!me || !me.uid) return;
  const now = Date.now(); me.chatT = (me.chatT || []).filter((x) => now - x < 5000); if (me.chatT.length >= 6) return void me.ws.send(JSON.stringify({ t: "chat", k: "sys", text: "조금 천천히 보내 주세요" })); me.chatT.push(now);
  // 채팅 명령어: me(행동)는 글 그대로, 주사위 · 뽑기는 보낸 글을 범위 · 후보로만 쓰고 결과는 서버가 굴린다
  const cmd = CHAT_CMDS.includes(m.cmd) ? m.cmd : null, raw = clean(m.text, 200).trim();
  const text = cmd === "roll" ? rollText(raw, randomInt) : cmd === "pick" ? pickText(raw, randomInt) : raw; if (!text) return;
  const p = me.presence || { f: 11, x: 0, y: 0 }, msg = { id: (++chatSeq).toString(36), k: m.k, text, at: now, from: { u: me.uid, peer: pid, name: me.name, f: p.f }, ...(cmd ? { cmd } : {}) };
  const sendTo = (pp) => { if (pp.ws.readyState === 1) pp.ws.send(JSON.stringify({ t: "chat", ...msg })); };
  if (m.k === "all") { chatAll.push(msg); if (chatAll.length > 200) chatAll.splice(0, chatAll.length - 200); chatDirty = true; for (const pp of peers.values()) sendTo(pp); }
  else if (m.k === "near") {
    const rm = me.presence?.rm || ""; let n = 0;
    if (meetings && canShareInRoom(p) && me.meetingId && (me.meetingArea !== mediaArea(p) || !meetings.contains(mediaArea(p), me.meetingId))) {
      me.ws.send(JSON.stringify({ t: "chat", k: "sys", text: "회의가 끝났어요. 회의를 다시 선택해 주세요." })); return;
    }
    const scope = meetings && canShareInRoom(p) && me.meetingId && me.meetingArea === mediaArea(p) && meetings.contains(mediaArea(p), me.meetingId) ? `meeting:${me.meetingId}` : null;
    if (scope) msg.scope = scope;
    for (const [qid, pp] of peers) {
      const q = pp.presence; if (!q || q.f !== p.f || (q.rm || "") !== rm) continue;
      if (!rm && Math.hypot(q.x - p.x, q.y - p.y) > NEAR && !(canControlStartrack(p) && canControlStartrack(q))) continue;
      if (meetings && canShareInRoom(p) && (pp.meetingId || null) !== (scope ? me.meetingId : null)) continue;
      if (qid !== pid) n++; sendTo(pp);
    }
    if (!me.presence) sendTo(me);
    if (!n) me.ws.send(JSON.stringify({ t: "chat", k: "sys", text: rm ? "이 방에는 아직 아무도 없어요" : "근처(12칸 안)에 아무도 없어요" }));
  } else if (m.k === "dm") {
    const to = clean(m.to, 40); if (!ADDR_RE.test(to) || to === me.uid) return; msg.to = to;
    const key = dmKey(me.uid, to); (chatDm[key] ||= []).push(msg); if (chatDm[key].length > 50) chatDm[key].splice(0, chatDm[key].length - 50); chatDirty = true;
    for (const pp of peers.values()) if (pp.uid === to || pp.uid === me.uid) sendTo(pp);
  }
}
wss.on("connection", (ws, request) => {
  const id = `p${workerId}-${++seq}`;
  peers.set(id, { ws, name: "크루", presence: null, mediaAddress: mediaClientAddress(request, process.env.CAMPUS_TRUST_PROXY === "1") });
  ws.send(JSON.stringify({ t: "hello", id, v: VERSION, meetingTest: !!meetings }));
  ws.send(JSON.stringify({ t: "startrack", state: startrack.snapshot() }));
  ws.send(glassState());
  for (const b of EZ_BOARDS) ws.send(JSON.stringify({ t: "ez", b, k: "all", strokes: ez[b].strokes }));   // 들어오자마자 판마다 그림 전체
  dirty = true;
  const sendHistory = (me) => { const dms = Object.entries(chatDm).filter(([k]) => k.split("|").includes(me.uid)).flatMap(([, v]) => v); ws.send(JSON.stringify({ t: "chat", k: "history", all: chatAll, dm: dms })); };
  // 하루들로 로그인한 접속: 주소(h_회원 ID)와 이름(하루들 닉네임)을 서버가 정한다. 보낸 id·name은 무시한다
  const ready = auth.userFromUpgrade(request).then((user) => {
    const me = peers.get(id); if (!user || !me) return;
    me.uid = `h_${user.id}`; me.name = user.nickname; me.verified = true; dirty = true;
    // 산 펫 · 장식(gear)은 서버가 DB에서 읽어 붙인다. 브라우저가 보내는 값은 받지 않는다
    auth.gearOf(user.id).then((gear) => { const p = peers.get(id); if (p && Object.keys(gear).length) { p.gear = gear; dirty = true; } }, () => {});
    ws.send(JSON.stringify({ t: "me", u: me.uid, verified: true, name: user.nickname }));
    sendHistory(me);
  }, () => {});
  ws.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (raw.length > 4096 && msg.t !== "media:cf") return;
    const me = peers.get(id); if (!me) return;
    if (msg.t === "name" && !me.verified) { me.name = clean(msg.name, 16) || "크루"; dirty = true; }
    if (msg.t === "p" && !me.uid && +msg.p?.f >= 21) return;   // 다시 붙자마자 오는 대결장 위치: 누구인지(uid) 정해진 뒤 다시 온다(먼저 받으면 11층으로 튀어 보인다)
    if (msg.t === "p") {
      const previousArea = me.presence && mediaArea(me.presence);
      me.presence = sanitize(msg.p, duel.arenaOf(me.uid)); duel.presence(id, me.presence);
      startrack.setPresent(id, canControlStartrack(me.presence));
      if (meetings && previousArea && (!me.presence || mediaArea(me.presence) !== previousArea)) {
        me.meetingId = null; me.meetingArea = null; me.dailyReady = false;
        cloudflareTest?.disconnected?.(id); void retireMedia(me).catch(() => {}); mediaSwitch.left(id);
      }
      dirty = true; cloudflareTest?.presenceChanged?.(); managedStack?.dailyPermissions.changed();
    }
    if (msg.t === "startrack") {
      const now = Date.now();
      me.startrackTimes = (me.startrackTimes || []).filter((at) => now - at < 5000);
      if (me.startrackTimes.length >= 12) { ws.send(JSON.stringify({ t: "startrack", error: "rate_limited" })); return; }
      me.startrackTimes.push(now);
      const result = startrack.apply(msg, me);
      if (result.error) ws.send(JSON.stringify({ t: "startrack", error: result.error }));
      else ezAll({ t: "startrack", state: result.state });
    }
    if (msg.t === "startrack:clock" && typeof msg.sentAt === "number" && Number.isFinite(msg.sentAt) && msg.sentAt >= 0) {
      ws.send(JSON.stringify({ t: "startrack:clock", sentAt: msg.sentAt, serverTime: Date.now() }));
    }
    if (msg.t === "media:switch-ack" && Number.isSafeInteger(msg.revision)) mediaSwitch.ack(id, msg.revision);
    if (msg.t === "media:left") { me.dailyReady = false; me.mediaProvider = null; cloudflareTest?.disconnected?.(id); void retireMedia(me).catch(() => {}); mediaSwitch.left(id); managedStack?.dailyPermissions.changed(); }
    if (msg.t === "media:meeting" && meetings && typeof msg.id === "string" && /^[a-zA-Z0-9-]{1,48}$/.test(msg.id)) {
      const respond = (data) => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: "media:meeting", id: msg.id, ...data })); };
      const now = Date.now(); me.meetingTimes = (me.meetingTimes || []).filter((t) => now - t < 60000);
      if (me.meetingTimes.length >= 40) { respond({ error: "meeting_rate_limited" }); return; }
      me.meetingTimes.push(now);
      if (!me.presence || !canShareInRoom(me.presence)) { respond({ error: "meeting_area_required" }); return; }
      const area = mediaArea(me.presence);
      if (msg.op === "list") { respond({ result: meetings.list(area) }); return; }
      if (["create", "join"].includes(msg.op) && process.env.MEDIA_PROVIDER === "managed-draft" && (!managedStack || managedStack.router.state().phase === "blocked")) { respond({ error: "media_unavailable" }); return; }
      if (!["create", "join", "leave"].includes(msg.op) || me.meetingBusy || me.mediaJoining || me.mediaProvider) { respond({ error: "meeting_busy" }); return; }
      me.meetingBusy = true;
      Promise.resolve().then(async () => {
        if (me.mediaRelease) await me.mediaRelease;
        if (msg.op === "leave") { me.meetingId = null; me.meetingArea = null; return null; }
        const result = msg.op === "create"
          ? await meetings.create({ area, title: msg.data?.title, locked: msg.data?.locked, password: msg.data?.password || "" })
          : await meetings.join({ area, id: msg.data?.id, password: msg.data?.password || "" });
        if (!peers.has(id) || !me.presence || mediaArea(me.presence) !== area) throw new Error("area_changed");
        me.meetingId = result.id; me.meetingArea = area;
        return result;
      }).then((result) => respond({ result })).catch((error) => {
        const reason = /^[a-z_]+$/.test(error?.message || "") ? error.message : "unavailable";
        respond({ error: reason });
      }).finally(() => { me.meetingBusy = false; });
    }
    if (msg.t === "media:daily-ready" && me.mediaProvider === "daily") { me.dailyReady = true; managedStack?.dailyPermissions.changed(); }
    if (msg.t === "media:renew" && typeof msg.id === "string" && /^[a-zA-Z0-9-]{1,48}$/.test(msg.id)) {
      const respond = (data) => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: "media:renew", id: msg.id, ...data })); };
      const time = Date.now(); me.mediaRenewTimes = (me.mediaRenewTimes || []).filter((t) => time - t < 10000);
      if (me.mediaRenewTimes.length >= 4) { respond({ error: "rate_limited" }); return; }
      me.mediaRenewTimes.push(time);
      if (!managedStack || me.mediaProvider !== "livekit" || !me.mediaLease || !me.presence || me.mediaArea !== mediaArea(me.presence) || me.mediaJoining) { respond({ error: "media_unavailable" }); return; }
      const key = me.mediaLease; me.mediaJoining = true;
      Promise.resolve().then(() => managedStack.router.renewLivekit(key, canShareInRoom(me.presence))).then((lease) => {
        if (!peers.has(id) || me.mediaLease !== key || me.mediaProvider !== "livekit") throw new Error("media_unavailable");
        respond({ expiresAt: lease.expiresAt });
      }).catch((error) => respond({ error: error?.message === "media_unavailable" ? error.message : "unavailable" })).finally(() => { me.mediaJoining = false; });
    }
    if (msg.t === "media:cf" && cloudflareTest?.configured && typeof msg.id === "string" && /^[a-zA-Z0-9-]{1,48}$/.test(msg.id)) {
      const respond = (data) => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: "media:cf", id: msg.id, ...data })); };
      const now = Date.now(); me.cfTimes = (me.cfTimes || []).filter((t) => now - t < 60000);
      if (me.cfTimes.length >= 180 || me.mediaProvider !== "cloudflare") { respond({ error: "unavailable" }); return; }
      me.cfTimes.push(now);
      cloudflareTest.operation(id, msg.op, msg.data).then((result) => respond({ result })).catch((error) => {
        const reason = /^[a-z_]+$/.test(error?.message || "") ? error.message : "unavailable";
        console.warn(`[cloudflare-test] request: ${reason}`); respond({ error: "unavailable" });
      });
    }
    if (msg.t === "media:join" && typeof msg.id === "string" && /^[a-zA-Z0-9-]{1,48}$/.test(msg.id)) {
      const requestId = msg.id;
      const sendMedia = (data) => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: "media:join", id: requestId, ...data })); };
      const now = Date.now(); me.mediaJoinTimes = (me.mediaJoinTimes || []).filter((t) => now - t < 10000);
      if (me.mediaJoinTimes.length >= 10) { sendMedia({ error: "rate_limited" }); return; }
      me.mediaJoinTimes.push(now);
      if (!mediaService.configured) sendMedia({ error: "not_configured" });
      else if (!me.presence) sendMedia({ error: "not_ready" });
      else {
        const area = mediaArea(me.presence);
        const meetingId = meetings && canShareInRoom(me.presence) ? me.meetingId : null;
        const scope = meetingId ? `meeting:${meetingId}` : area;
        if (msg.area !== area) sendMedia({ error: "area_changed" });
        else if (meetings && canShareInRoom(me.presence) && (!meetingId || me.meetingArea !== area || !meetings.contains(area, meetingId))) sendMedia({ error: "meeting_required" });
        else if (me.mediaJoining || me.meetingBusy) sendMedia({ error: "in_progress" });
        else {
          try { admission?.check(id, me.mediaAddress); }
          catch (error) { sendMedia({ error: ["rate_limited", "room_full"].includes(error?.message) ? error.message : "unavailable" }); return; }
          me.mediaJoining = true;
          Promise.resolve().then(async () => {
            if (me.mediaRelease) await me.mediaRelease;
            if (me.mediaLease) await retireMedia(me);
            return mediaService.join({ identity: id, name: me.name, area, scope, canShare: canShareInRoom(me.presence) });
          })
          .then((join) => {
            if (!peers.has(id) || !me.presence || mediaArea(me.presence) !== area || (meetingId && (me.meetingId !== meetingId || !meetings.contains(area, meetingId)))) {
              if (join._leaseKey) void managedStack?.router.releaseLivekit(join._leaseKey).catch(() => {});
              if (join.provider === "cloudflare") cloudflareTest?.disconnected?.(id);
              sendMedia({ error: "area_changed" });
            } else {
              const { _leaseKey, ...publicJoin } = join;
              me.mediaLease = _leaseKey || null; me.mediaProvider = join.provider; me.mediaArea = area; me.mediaScope = scope; me.mediaGeneration = join.revision; me.dailyReady = false;
              managedStack?.dailyPermissions.changed(); sendMedia({ join: publicJoin });
            }
          }).catch((error) => sendMedia({ error: ["room_full", "cloudflare_cleanup_required", "media_unavailable"].includes(error?.message) ? error.message : "unavailable" }))
          .finally(() => { me.mediaJoining = false; });
        }
      }
    }
    if (msg.t === "ez") ezMessage(id, msg);
    if (msg.t === "glass") glassHit(id, msg.w);
    if (msg.t === "id") void ready.then(() => { // 브라우저의 비밀 uid → 공개 주소(로그인했으면 이미 정해져 있어 건너뛴다). 본인에게 공개 주소를 알려 주고 지난 대화를 보낸다
      if (me.uid || !peers.has(id)) return;
      const secret = clean(msg.u, 64); if (!secret) return;
      me.uid = pubOf(secret); dirty = true;
      ws.send(JSON.stringify({ t: "me", u: me.uid }));
      sendHistory(me);
    });
    if (msg.t === "chat" && ["near", "all", "dm"].includes(msg.k)) chatMessage(id, msg);
    if (typeof msg.t === "string" && msg.t.startsWith("duel:")) void ready.then(() => { if (peers.has(id)) duel.message(id, msg); });   // uid가 정해진 뒤("id" 처리 다음)에 받는다
  });
  ws.on("pong", () => startrack.setPresent(id, canControlStartrack(peers.get(id)?.presence)));
  ws.on("close", () => { const me = peers.get(id); duel.left(id); if (me) void retireMedia(me).catch(() => {}); startrack.setPresent(id, false); cloudflareTest?.disconnected?.(id); mediaSwitch.disconnected(id); peers.delete(id); managedStack?.dailyPermissions.changed(); dirty = true; });
  ws.on("error", () => {});
});
setInterval(() => { // 초당 12번, 바뀐 게 있을 때만 모두에게 전체 상태를 보낸다
  if (!dirty) return; dirty = false;
  const list = [...peers].filter(([, p]) => p.presence).map(([peer, p]) => ({ peer, name: p.name, u: p.uid || null, ...(p.verified ? { hv: 1 } : {}), ...(p.gear ? { g: p.gear } : {}), presence: p.presence }));
  const msg = JSON.stringify({ t: "peers", peers: list });
  for (const { ws } of peers.values()) if (ws.readyState === 1) ws.send(msg);
}, 83);
setInterval(() => { for (const { ws } of peers.values()) if (ws.readyState === 1) ws.ping(); }, 25000);
setInterval(() => startrack.expirePresence(), 15000);

/* ───────── 무중단 배포: 준비 알림 · 비우기 ───────── */
let draining = false;
function drain(reason) {
  if (draining) return; draining = true;
  console.log(`[${VERSION}] draining (${reason})`);
  const mediaCleanup = (managedStack?.shutdown?.() || cloudflareTest?.shutdown?.() || Promise.resolve()).catch(() => {});
  server.close(() => { void mediaCleanup.finally(() => { meetings?.close?.(); process.exit(0); }); });  // 새 연결은 받지 않고, 처리 중인 요청과 음성 정리를 마친다
  const bye = JSON.stringify({ t: "bye" });                  // 접속 중인 크루는 곧바로 새 워커로 다시 붙는다
  for (const { ws } of peers.values()) { try { ws.send(bye); ws.close(1012, "restart"); } catch { } }
  try { world?.close(); } catch (e) { console.error("[world] close", e.message); }
  setTimeout(() => process.exit(0), 10000).unref();          // 오래 붙잡힌 연결이 있어도 10초 뒤엔 끝낸다
}
process.on("message", (m) => { if (m && m.t === "drain") drain("new version ready"); });
process.on("SIGTERM", () => drain("SIGTERM"));

server.listen(PORT, BIND_HOST, async () => {
  console.log(`[${VERSION}] wooteco-metaverse on :${PORT}`);
  await Promise.race([feed().catch(() => null), new Promise((r) => setTimeout(r, 5000))]);   // 피드를 미리 데워 두고
  process.send?.({ t: "ready", v: VERSION });                                                  // 감독에게 준비됐다고 알린다
});
