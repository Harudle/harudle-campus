// 하루들 우테코 캠퍼스 앱 (워커 프로세스)
// server.js(감독)가 띄운다. 새 버전이 오면 감독이 새 워커를 먼저 띄우고, 준비되면 이 워커를 비운다.
// - dist/ 정적 파일 (npm run build 결과, 저장소에 함께 올린다)
// - GET /api/feed : 하루들 공개 피드를 작성자별로 묶어 중계 (4분 캐시)
// - WS  /ws       : 같은 캠퍼스에 있는 크루 위치·말풍선·스킬 공유
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 80);
const VERSION = (process.env.APP_VERSION || "dev").slice(0, 12);
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const HARUDLE = "https://www.harudle.com";
const FEED_TTL = 4 * 60 * 1000;   // 하루들 이미지 주소는 15분 뒤 만료되므로 그보다 짧게
const PER_AUTHOR = 6;

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

/* ───────── HTTP ───────── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/healthz") { res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }); return res.end(`ok ${VERSION}`); }
    if (url.pathname === "/api/feed") {
      const body = await feed();
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return res.end(body);
    }
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

/* ───────── 실시간 접속 ───────── */
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
const peers = new Map();   // id -> { ws, name, presence }
let seq = 0, dirty = false;
const clean = (s, n) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, "").slice(0, n) : "");
function sanitize(p) {
  if (!p || typeof p !== "object") return null;
  const num = (v, a, b) => (typeof v === "number" && isFinite(v) ? Math.min(b, Math.max(a, v)) : 0);
  return {
    f: [11, 12, 13, 14].includes(p.f) ? p.f : 11, x: num(p.x, 0, 56), y: num(p.y, 0, 40), u: num(p.u, 0, 2), h: num(p.h, -7, 7),
    m: p.m ? 1 : 0, r: p.r ? 1 : 0, look: Math.floor(num(p.look, 0, 99)), jc: Math.floor(num(p.jc, 0, 1e9)), ac: Math.floor(num(p.ac, 0, 1e9)),
    l: p.l ? 1 : 0, ly: num(p.ly, -7, 7), st: p.st ? 1 : 0, av: typeof p.av === "string" && /^[0-9a-z]{7}([0-9A-F]{6}){6}$/.test(p.av) ? p.av : null, an: ["draw", "wave", "heart", "laptop", "coffee", "dance", "gun"].includes(p.an) ? p.an : null, lp: p.lp ? 1 : 0, gn: p.gn ? 1 : 0, fk: p.fk ? 1 : 0, hc: Math.floor(num(p.hc, 0, 1e9)), hd: num(p.hd, -50, 50), dn: p.dn ? 1 : 0, fc: Math.floor(num(p.fc, 0, 1e9)), fh: num(p.fh, -50, 50), as: Math.floor(num(p.as, 0, 1e7)), say: clean(p.say, 40) || null,
  };
}
wss.on("connection", (ws) => {
  const id = `p${++seq}`;
  peers.set(id, { ws, name: "크루", presence: null });
  ws.send(JSON.stringify({ t: "hello", id, v: VERSION }));
  dirty = true;
  ws.on("message", (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const me = peers.get(id); if (!me) return;
    if (msg.t === "name") { me.name = clean(msg.name, 16) || "크루"; dirty = true; }
    if (msg.t === "p") { me.presence = sanitize(msg.p); dirty = true; }
  });
  ws.on("close", () => { peers.delete(id); dirty = true; });
  ws.on("error", () => {});
});
setInterval(() => { // 초당 12번, 바뀐 게 있을 때만 모두에게 전체 상태를 보낸다
  if (!dirty) return; dirty = false;
  const list = [...peers].filter(([, p]) => p.presence).map(([peer, p]) => ({ peer, name: p.name, presence: p.presence }));
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
  setTimeout(() => process.exit(0), 10000).unref();          // 오래 붙잡힌 연결이 있어도 10초 뒤엔 끝낸다
}
process.on("message", (m) => { if (m && m.t === "drain") drain("new version ready"); });
process.on("SIGTERM", () => drain("SIGTERM"));

server.listen(PORT, async () => {
  console.log(`[${VERSION}] wooteco-metaverse on :${PORT}`);
  await Promise.race([feed().catch(() => null), new Promise((r) => setTimeout(r, 5000))]);   // 피드를 미리 데워 두고
  process.send?.({ t: "ready", v: VERSION });                                                  // 감독에게 준비됐다고 알린다
});
