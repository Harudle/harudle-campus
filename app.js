// 하루들 우테코 캠퍼스 앱 (워커 프로세스)
// server.js(감독)가 띄운다. 새 버전이 오면 감독이 새 워커를 먼저 띄우고, 준비되면 이 워커를 비운다.
// - dist/ 정적 파일 (npm run build 결과, 저장소에 함께 올린다)
// - GET /api/feed : 하루들 공개 피드를 작성자별로 묶어 중계 (4분 캐시)
// - WS  /ws       : 같은 캠퍼스에 있는 크루 위치·말풍선·스킬 공유
// - 14층 하루들 월드: /world/(dist), WS /world/ws, 월드 API (dist-server/world.mjs, world/server/campus.ts)
import http from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createWeatherService } from "./weather.js";

const PORT = Number(process.env.PORT || 80);
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
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url, "http://x");
  if (pathname === "/ws") wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  else if (!(world && pathname === "/world/ws")) socket.destroy();
});
const peers = new Map();   // id -> { ws, name, presence }
let seq = 0, dirty = false;
const clean = (s, n) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, "").slice(0, n) : "");
function sanitize(p) {
  if (!p || typeof p !== "object") return null;
  const num = (v, a, b) => (typeof v === "number" && isFinite(v) ? Math.min(b, Math.max(a, v)) : 0);
  return {
    f: [11, 12, 13, 14].includes(p.f) ? p.f : 11, x: num(p.x, 0, 56), y: num(p.y, 0, 40), u: num(p.u, 0, 2), h: num(p.h, -7, 7),
    m: p.m ? 1 : 0, r: p.r ? 1 : 0, look: Math.floor(num(p.look, 0, 99)), jc: Math.floor(num(p.jc, 0, 1e9)), ac: Math.floor(num(p.ac, 0, 1e9)),
    br: p.br ? 1 : 0, bc: typeof p.bc === "string" && /^#[0-9a-f]{6}$/i.test(p.bc) ? p.bc : null, l: p.l ? 1 : 0, ly: num(p.ly, -7, 7), st: p.st ? 1 : 0, av: typeof p.av === "string" && /^[0-9a-z]{7}([0-9A-F]{6}){6}[0-9a-z]?$/.test(p.av) ? p.av : null, an: ["draw", "wave", "heart", "laptop", "coffee", "dance", "gun"].includes(p.an) ? p.an : null, lp: p.lp ? 1 : 0, gn: p.gn ? 1 : 0, fk: p.fk ? 1 : 0, hc: Math.floor(num(p.hc, 0, 1e9)), hd: num(p.hd, -50, 50), dn: p.dn ? 1 : 0, fc: Math.floor(num(p.fc, 0, 1e9)), fh: num(p.fh, -50, 50), as: Math.floor(num(p.as, 0, 1e7)), rm: clean(p.rm, 40), 
  };
}
/* ───────── 하루들 부스 공유 이젤: 획(stroke)을 모아 두고 모두에게 나눈다 ─────────
   획 = { id, u(그린 사람), c(색), w(굵기), p[x,y,…](0~1000), h(뒤로가기로 숨김) }. 배포로 워커가 바뀌어도 남게 임시 폴더에 저장한다 */
const EZ_FILE = join(tmpdir(), "harudle-easel.json"), EZ_MAX = 2500, EZ_PTS = 4000;
// 판(board)이 여럿: easel(부스 네컷 이젤), wb(12층 코워킹 존 화이트보드). 판마다 획과 사람별 앞으로가기 줄을 따로 둔다
const EZ_BOARDS = ["easel", "wb"], ez = Object.fromEntries(EZ_BOARDS.map((b) => [b, { strokes: [], redo: new Map() }]));
try { const d = JSON.parse(readFileSync(EZ_FILE, "utf8")); if (Array.isArray(d.strokes)) ez.easel.strokes = d.strokes; for (const b of EZ_BOARDS) if (Array.isArray(d.boards?.[b])) ez[b].strokes = d.boards[b]; } catch { }
let ezDirty = false;
setInterval(() => { if (!ezDirty) return; ezDirty = false; writeFile(EZ_FILE, JSON.stringify({ strokes: ez.easel.strokes, boards: Object.fromEntries(EZ_BOARDS.map((b) => [b, ez[b].strokes])) })).catch(() => { }); }, 4000).unref();
const ezAll = (msg, except) => { const s = JSON.stringify(msg); for (const [pid, { ws }] of peers) if (pid !== except && ws.readyState === 1) ws.send(s); };
function ezMessage(pid, m) {
  const u = clean(m.u, 24); if (!u) return;
  const b = EZ_BOARDS.includes(m.b) ? m.b : "easel", ezStrokes = ez[b].strokes, ezRedo = ez[b].redo;
  if (m.k === "seg") {
    const id = clean(m.id, 32), c = /^#[0-9a-f]{6}$/i.test(m.c) ? m.c : "#111118", w = Math.min(80, Math.max(1, Number(m.w) || 6));
    const pts = Array.isArray(m.p) ? m.p.slice(0, 400).map((v) => Math.min(1000, Math.max(0, Math.round(Number(v) || 0)))) : [];
    if (!id || pts.length < 2) return;
    let st = ezStrokes.find((x) => x.id === id);
    if (!st) { st = { id, u, c, w, p: [], h: 0 }; ezStrokes.push(st); ezRedo.delete(u); if (ezStrokes.length > EZ_MAX) ezStrokes.splice(0, ezStrokes.length - EZ_MAX); }
    if (st.u !== u || st.p.length >= EZ_PTS) return;
    st.p.push(...pts); ezDirty = true;
    ezAll({ t: "ez", b, k: "seg", id, u, c, w, p: pts }, pid);
  } else if (m.k === "end") ezAll({ t: "ez", b, k: "end", id: clean(m.id, 32) }, pid);
  else if (m.k === "undo") {
    for (let i = ezStrokes.length - 1; i >= 0; i--) { const st = ezStrokes[i]; if (st.u === u && !st.h) { st.h = 1; (ezRedo.get(u) || ezRedo.set(u, []).get(u)).push(st.id); ezDirty = true; ezAll({ t: "ez", b, k: "vis", id: st.id, h: 1 }, pid); break; } }
  } else if (m.k === "redo") {
    const id = ezRedo.get(u)?.pop(), st = id && ezStrokes.find((x) => x.id === id);
    if (st) { st.h = 0; ezDirty = true; ezAll({ t: "ez", b, k: "vis", id, h: 0 }, pid); }
  }
}
/* ───────── 채팅: 근처 · 전체 · 개인 ─────────
   근처: 보낸 순간 같은 층, 같은 방(회의실·강의실이면 그 방 사람만), 열린 곳이면 6칸 안. 남기지 않는다(받은 사람 브라우저에만)
   전체: 최근 200개를 남긴다. 개인: 두 사람(브라우저 uid) 사이 최근 50개를 남긴다. 둘 다 임시 폴더에 저장 */
const CHAT_FILE = join(tmpdir(), "harudle-chat.json"), NEAR = 6;
let chatAll = [], chatDm = {};
try { const d = JSON.parse(readFileSync(CHAT_FILE, "utf8")); if (Array.isArray(d.all)) chatAll = d.all; if (d.dm && typeof d.dm === "object") chatDm = d.dm; } catch { }
let chatDirty = false, chatSeq = Date.now();
setInterval(() => { if (!chatDirty) return; chatDirty = false; writeFile(CHAT_FILE, JSON.stringify({ all: chatAll, dm: chatDm })).catch(() => { }); }, 4000).unref();
const dmKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function chatMessage(pid, m) {
  const me = peers.get(pid); if (!me || !me.uid) return;
  const now = Date.now(); me.chatT = (me.chatT || []).filter((x) => now - x < 5000); if (me.chatT.length >= 6) return void me.ws.send(JSON.stringify({ t: "chat", k: "sys", text: "조금 천천히 보내 주세요" })); me.chatT.push(now);
  const text = clean(m.text, 200).trim(); if (!text) return;
  const p = me.presence || { f: 11, x: 0, y: 0 }, msg = { id: (++chatSeq).toString(36), k: m.k, text, at: now, from: { u: me.uid, peer: pid, name: me.name, f: p.f } };
  const sendTo = (pp) => { if (pp.ws.readyState === 1) pp.ws.send(JSON.stringify({ t: "chat", ...msg })); };
  if (m.k === "all") { chatAll.push(msg); if (chatAll.length > 200) chatAll.splice(0, chatAll.length - 200); chatDirty = true; for (const pp of peers.values()) sendTo(pp); }
  else if (m.k === "near") {
    const rm = me.presence?.rm || ""; let n = 0;
    for (const [qid, pp] of peers) { const q = pp.presence; if (!q || q.f !== p.f || (q.rm || "") !== rm) continue; if (!rm && Math.hypot(q.x - p.x, q.y - p.y) > NEAR) continue; if (qid !== pid) n++; sendTo(pp); }
    if (!me.presence) sendTo(me);
    if (!n) me.ws.send(JSON.stringify({ t: "chat", k: "sys", text: rm ? "이 방에는 아직 아무도 없어요" : "근처(6칸 안)에 아무도 없어요" }));
  } else if (m.k === "dm") {
    const to = clean(m.to, 24); if (!to || to === me.uid) return; msg.to = to;
    const key = dmKey(me.uid, to); (chatDm[key] ||= []).push(msg); if (chatDm[key].length > 50) chatDm[key].splice(0, chatDm[key].length - 50); chatDirty = true;
    for (const pp of peers.values()) if (pp.uid === to || pp.uid === me.uid) sendTo(pp);
  }
}
wss.on("connection", (ws) => {
  const id = `p${++seq}`;
  peers.set(id, { ws, name: "크루", presence: null });
  ws.send(JSON.stringify({ t: "hello", id, v: VERSION }));
  for (const b of EZ_BOARDS) ws.send(JSON.stringify({ t: "ez", b, k: "all", strokes: ez[b].strokes }));   // 들어오자마자 판마다 그림 전체
  dirty = true;
  ws.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const me = peers.get(id); if (!me) return;
    if (msg.t === "name") { me.name = clean(msg.name, 16) || "크루"; dirty = true; }
    if (msg.t === "p") { me.presence = sanitize(msg.p); dirty = true; }
    if (msg.t === "ez") ezMessage(id, msg);
    if (msg.t === "id" && !me.uid) { // 브라우저마다 고정된 uid: 개인 메시지 주소. 받자마자 지난 대화를 보낸다
      me.uid = clean(msg.u, 24); dirty = true; if (!me.uid) return;
      const dms = Object.entries(chatDm).filter(([k]) => k.split("|").includes(me.uid)).flatMap(([, v]) => v);
      ws.send(JSON.stringify({ t: "chat", k: "history", all: chatAll, dm: dms }));
    }
    if (msg.t === "chat" && ["near", "all", "dm"].includes(msg.k)) chatMessage(id, msg);
  });
  ws.on("close", () => { peers.delete(id); dirty = true; });
  ws.on("error", () => {});
});
setInterval(() => { // 초당 12번, 바뀐 게 있을 때만 모두에게 전체 상태를 보낸다
  if (!dirty) return; dirty = false;
  const list = [...peers].filter(([, p]) => p.presence).map(([peer, p]) => ({ peer, name: p.name, u: p.uid || null, presence: p.presence }));
  const msg = JSON.stringify({ t: "peers", peers: list });
  for (const { ws } of peers.values()) if (ws.readyState === 1) ws.send(msg);
}, 83);
setInterval(() => { for (const { ws } of peers.values()) if (ws.readyState === 1) ws.ping(); }, 25000);

/* ───────── 무중단 배포: 준비 알림 · 비우기 ───────── */
let draining = false;
function drain(reason) {
  if (draining) return; draining = true;
  console.log(`[${VERSION}] draining (${reason})`);
  server.close(() => process.exit(0));                       // 새 연결은 받지 않고, 처리 중인 요청은 마저 끝낸다
  const bye = JSON.stringify({ t: "bye" });                  // 접속 중인 크루는 곧바로 새 워커로 다시 붙는다
  for (const { ws } of peers.values()) { try { ws.send(bye); ws.close(1012, "restart"); } catch { } }
  try { world?.close(); } catch (e) { console.error("[world] close", e.message); }
  setTimeout(() => process.exit(0), 10000).unref();          // 오래 붙잡힌 연결이 있어도 10초 뒤엔 끝낸다
}
process.on("message", (m) => { if (m && m.t === "drain") drain("new version ready"); });
process.on("SIGTERM", () => drain("SIGTERM"));

server.listen(PORT, async () => {
  console.log(`[${VERSION}] wooteco-metaverse on :${PORT}`);
  await Promise.race([feed().catch(() => null), new Promise((r) => setTimeout(r, 5000))]);   // 피드를 미리 데워 두고
  process.send?.({ t: "ready", v: VERSION });                                                  // 감독에게 준비됐다고 알린다
});
