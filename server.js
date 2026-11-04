// 하루들 우테코 캠퍼스 서버
// - public/ 정적 파일
// - GET /api/feed : 하루들 공개 피드를 작성자별로 묶어 중계 (4분 캐시)
// - WS  /ws       : 같은 캠퍼스에 있는 크루 위치·말풍선·스킬 공유
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 80);
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const HARUDLE = "https://www.harudle.com";
const FEED_TTL = 4 * 60 * 1000;   // 하루들 이미지 주소는 15분 뒤 만료되므로 그보다 짧게
const PER_AUTHOR = 6;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

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
    if (url.pathname === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
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
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": extname(file) === ".html" ? "no-cache" : "max-age=3600" });
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
    f: [11, 12, 13, 14].includes(p.f) ? p.f : 11, x: num(p.x, 0, 56), y: num(p.y, 0, 34), h: num(p.h, -7, 7),
    m: p.m ? 1 : 0, r: p.r ? 1 : 0, look: Math.floor(num(p.look, 0, 99)), jc: Math.floor(num(p.jc, 0, 1e9)), ac: Math.floor(num(p.ac, 0, 1e9)),
    l: p.l ? 1 : 0, ly: num(p.ly, -7, 7), an: ["draw", "wave", "heart"].includes(p.an) ? p.an : null, as: Math.floor(num(p.as, 0, 1e7)), say: clean(p.say, 40) || null,
  };
}
wss.on("connection", (ws) => {
  const id = `p${++seq}`;
  peers.set(id, { ws, name: "크루", presence: null });
  ws.send(JSON.stringify({ t: "hello", id }));
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

server.listen(PORT, () => console.log(`wooteco-metaverse on :${PORT}`));
