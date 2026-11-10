// 하루들 로그인 연동 (캠퍼스 쪽)
//
//   캠퍼스 [하루들 연동하기] → GET /auth/harudle/start → 하루들 /campus/connect?state=…
//   하루들에서 [연동하기] → GET /auth/harudle/callback?token&state
//   → 캠퍼스 서버가 서명(HS256, 하루들과 나눠 가진 키)을 직접 확인 → 캠퍼스 자체 세션 쿠키(campus_sid)
//
// 하루들은 60초짜리 서명 토큰만 발급하고 아무것도 저장하지 않는다. 한 번만 쓰기(jti)는 캠퍼스 DB가 지킨다.
// 캠퍼스는 하루들을 호출하지 않는다(단방향). 하루들이 알려 주는 것은 회원 ID · 닉네임 · 프로필 사진뿐이다.
// 설정(HARUDLE_CAMPUS_SIGNING_KEY, 저장소)이 없으면 꺼진 채로 돈다: 로그인 버튼이 숨고 모두 게스트다.
//
// 캐릭터: 처음 연동할 때 [연동하기]를 누른 브라우저의 캐릭터(외형 · 푼 장식)를 /auth/harudle/start?av&ul로 받아
// 쿠키에 잠깐 두었다가, 콜백에서 이 회원의 캐릭터가 아직 없을 때만 저장한다. 그 뒤로는 /api/me/character로 읽고 쓴다.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createStoreFromEnv } from "./store.js";
import { createWallet } from "./wallet.js";
import { createShop } from "./shop.js";

const STATE_COOKIE = "campus_link_state", SID_COOKIE = "campus_sid", CHAR_COOKIE = "campus_link_char";
const STATE_TTL_S = 600;                       // 하루들 로그인까지 다녀올 시간
export const SESSION_TTL_MS = 30 * 864e5;      // 캠퍼스 로그인 유지 30일
export const USER_TTL_MS = 90 * 864e5;         // 마지막 로그인 후 90일이 지나면 지운다 (탈퇴를 알 수 없으므로)
const CACHE_MS = 60_000;
const TOKEN = /^[A-Za-z0-9_-]{43,128}$/;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ISSUER = "harudle", AUDIENCE = "harudle-campus", CLOCK_SKEW_S = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AV = /^[0-9a-z]{7}([0-9A-F]{6}){6}[0-9a-z]?$/;   // 엔진 avEncode 44글자(예전 43글자) · 접속 presence의 av와 같은 모양
export const UNLOCKS = ["airpods", "headset"];         // 잠긴 장식(avatarData LOCKED_OPTIONS)

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("="); if (i < 1) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

// 브라우저가 보낸 캐릭터. 모양이 틀리면 null, 모르는 장식은 버린다
export function readCharacter(av, unlocks) {
  if (typeof av !== "string" || !AV.test(av) || !Array.isArray(unlocks)) return null;
  return { av, unlocks: UNLOCKS.filter((v) => unlocks.includes(v)) };
}
const charToCookie = (c) => `${c.av}.${c.unlocks.join("_")}`;
const charFromCookie = (v) => { const [av, ul = ""] = String(v || "").split("."); return readCharacter(av, ul ? ul.split("_") : []); };

async function readJson(req, max = 2048) {
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > max) throw new Error("too_large"); }
  return JSON.parse(body);
}

// 캠퍼스 자기 주소. https이거나, 로컬 개발(localhost · 127.0.0.1)일 때만 http를 허락한다
function readOrigin(value) {
  if (!value) return "";
  const u = new URL(value);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.origin !== value || u.username || u.password || !(u.protocol === "https:" || (u.protocol === "http:" && local))) throw new Error("invalid_campus_auth_origin");
  return value;
}

// 하루들 연결 토큰(HS256 JWT) 확인. exp는 원래 만료 시각, validUntilMs는 시간 차이 허용까지 포함한 검증 종료 시각이다.
export function verifyLinkToken(token, key, { state, nowMs }) {
  if (typeof token !== "string" || token.length > 4096 || !JWT.test(token)) throw new Error("token_format");
  const [h, p, sig] = token.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
  if (header.alg !== "HS256") throw new Error("token_alg");
  const expected = createHmac("sha256", key).update(`${h}.${p}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error("token_signature");
  const c = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  const now = Math.floor(nowMs / 1000), aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (c.iss !== ISSUER || !aud.includes(AUDIENCE)) throw new Error("token_audience");
  const validUntilMs = (c.exp + CLOCK_SKEW_S) * 1000;
  if (typeof c.exp !== "number" || nowMs >= validUntilMs || (typeof c.iat === "number" && c.iat - CLOCK_SKEW_S > now)) throw new Error("token_expired");
  if (typeof c.state !== "string" || !same(c.state, state)) throw new Error("token_state");
  if (typeof c.jti !== "string" || !c.jti || c.jti.length > 100) throw new Error("token_jti");
  if (typeof c.sub !== "string" || !UUID.test(c.sub)) throw new Error("token_subject");
  const nickname = typeof c.nickname === "string" ? c.nickname.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 30) : "";
  if (!nickname) throw new Error("token_nickname");
  const img = typeof c.picture === "string" && /^https:\/\//.test(c.picture) ? c.picture.slice(0, 500) : null;
  return { id: c.sub.toLowerCase(), nickname, profileImageUrl: img, jti: c.jti, exp: c.exp * 1000, validUntilMs };
}

export function createAuth(env = process.env, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch;
  const now = opts.now || (() => Date.now());
  const log = opts.log || console;
  const origin = readOrigin(env.CAMPUS_AUTH_ORIGIN || env.CAMPUS_PUBLIC_ORIGIN || "");
  const harudle = (env.HARUDLE_BASE_URL || "https://www.harudle.com").replace(/\/+$/, "");
  const key = env.HARUDLE_CAMPUS_SIGNING_KEY ? Buffer.from(env.HARUDLE_CAMPUS_SIGNING_KEY, "base64") : null;
  if (key && key.length < 32) throw new Error("invalid_harudle_campus_signing_key");   // 하루들과 같은 32바이트 이상 키
  const store = opts.store !== undefined ? opts.store : createStoreFromEnv(env, { fetch: fetchFn });
  const enabled = !!(origin && key && store);
  const secure = origin.startsWith("https:");
  const cache = new Map();   // sid 해시 → { user, until }
  const wallet = createWallet({ env, store: enabled ? store : null, harudle, fetch: fetchFn, now, log });   // 지갑 '컷'. CAMPUS_WALLET=on일 때만
  const shop = createShop({ env, store: enabled ? store : null, feedReward: wallet.amount, linkBonus: wallet.bonus, now, log });   // 컷 상점 · 착용. 지갑과 같은 스위치

  const cookie = (name, value, maxAge, path = "/") => `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  const redirect = (res, to, cookies = []) => {
    res.writeHead(302, { location: to, "cache-control": "no-store", "referrer-policy": "no-referrer", ...(cookies.length ? { "set-cookie": cookies } : {}) });
    res.end();
  };
  const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };

  async function userFromSid(sid) {
    if (!enabled || !sid || !TOKEN.test(sid)) return null;
    const key = sha256(sid), t = now(), hit = cache.get(key);
    if (hit && hit.until > t) return hit.user;
    let user = null;
    try {
      const s = await store.getSession(key);
      if (s && !s.revokedAt && s.expiresAt > t) user = s.user;
    } catch (e) { log.error?.("[auth] session lookup failed:", e.message); cache.delete(key); return null; }
    cache.set(key, { user, until: t + CACHE_MS }); if (cache.size > 5000) cache.clear();
    return user;
  }

  // HTTP 요청의 로그인 사용자 (없으면 null)
  const userFromRequest = (req) => userFromSid(parseCookies(req.headers.cookie)[SID_COOKIE]);

  // WebSocket 접속의 로그인 사용자: 다른 사이트가 쿠키를 실어 여는 것을 막으려고 Origin이 캠퍼스일 때만 인정한다
  const userFromUpgrade = (req) => (enabled && req.headers.origin === origin ? userFromRequest(req) : Promise.resolve(null));

  async function callback(req, res, url) {
    const clearState = cookie(STATE_COOKIE, "", 0, "/auth/harudle"), clearChar = cookie(CHAR_COOKIE, "", 0, "/auth/harudle");
    const fail = (reason, e) => { log.warn?.(`[auth] login failed: ${reason}${e ? ` (${e.message})` : ""}`); redirect(res, "/?login=fail", [clearState, clearChar]); };
    if (url.searchParams.get("error")) return fail("cancelled");
    const linkToken = url.searchParams.get("token") || "", state = url.searchParams.get("state") || "";
    const cookies = parseCookies(req.headers.cookie), saved = cookies[STATE_COOKIE] || "";
    if (!TOKEN.test(state) || !TOKEN.test(saved) || !same(saved, state)) return fail("state");
    let profile;
    try { profile = verifyLinkToken(linkToken, key, { state, nowMs: now() }); } catch (e) { return fail("token", e); }
    const sid = token(), t = now();
    try {
      if (!(await store.useLinkToken(profile.jti, profile.validUntilMs))) return fail("token_reused");   // 같은 토큰은 한 번만
      await store.upsertUser({ id: profile.id, nickname: profile.nickname, profileImageUrl: profile.profileImageUrl, at: t });
      await store.createSession({ sidHash: sha256(sid), userId: profile.id, createdAt: t, expiresAt: t + SESSION_TTL_MS });
    } catch (e) { return fail("store", e); }
    // 처음 연동이면 연동하기를 누른 브라우저의 캐릭터를 저장한다. 못 해도 로그인은 그대로(돌아간 화면이 다시 올린다)
    const ch = charFromCookie(cookies[CHAR_COOKIE]);
    if (ch) try { await store.createCharacter({ userId: profile.id, ...ch, at: t }); } catch (e) { log.error?.("[auth] character save failed:", e.message); }
    redirect(res, "/?login=ok", [clearState, clearChar, cookie(SID_COOKIE, sid, Math.floor(SESSION_TTL_MS / 1000))]);
  }

  async function logout(req, res) {
    if (req.headers.origin !== origin) return json(res, 403, { error: "origin" });
    const sid = parseCookies(req.headers.cookie)[SID_COOKIE];
    if (sid && TOKEN.test(sid)) {
      const key = sha256(sid); cache.delete(key);
      try { await store.revokeSession(key, now()); } catch (e) { log.error?.("[auth] logout failed:", e.message); return json(res, 502, { error: "store" }); }
    }
    res.writeHead(204, { "set-cookie": cookie(SID_COOKIE, "", 0), "cache-control": "no-store" }); res.end();
  }

  // 연동한 크루의 캐릭터: GET은 저장된 것(없으면 null), PUT은 바꾼 것을 덮어쓴다(캠퍼스 Origin만)
  async function character(req, res) {
    if (!enabled) return json(res, 404, { error: "login_disabled" });
    if (req.method === "PUT" && req.headers.origin !== origin) return json(res, 403, { error: "origin" });
    const user = await userFromRequest(req);
    if (!user) return json(res, 401, { error: "login" });
    try {
      if (req.method === "GET") return json(res, 200, { character: await store.getCharacter(user.id) });
      let body; try { body = await readJson(req); } catch { return json(res, 400, { error: "body" }); }
      const ch = readCharacter(body?.av, body?.unlocks);
      if (!ch) return json(res, 400, { error: "character" });
      await store.saveCharacter({ userId: user.id, ...ch, at: now() });
      res.writeHead(204, { "cache-control": "no-store" }); res.end();
    } catch (e) { log.error?.("[auth] character failed:", e.message); json(res, 502, { error: "store" }); }
  }

  // 처리했으면 true. 나머지 요청은 app.js가 이어서 처리한다
  async function handle(req, res, url) {
    const p = url.pathname;
    if (p === "/api/me" && req.method === "GET") {
      const user = await userFromRequest(req);
      json(res, 200, { enabled, loggedIn: !!user, user: user ? { id: user.id, nickname: user.nickname, profileImageUrl: user.profileImageUrl } : null });
      return true;
    }
    if (p === "/api/me/character" && (req.method === "GET" || req.method === "PUT")) { await character(req, res); return true; }
    if ((p.startsWith("/api/shop") || p === "/api/me/gear") && await shop.handle(req, res, url, { user: userFromRequest, origin, json })) return true;
    if (p.startsWith("/api/me/wallet") && await wallet.handle(req, res, url, { user: userFromRequest, origin, json })) return true;
    if (!p.startsWith("/auth/")) return false;
    if (!enabled) { json(res, 404, { error: "login_disabled" }); return true; }
    if (p === "/auth/harudle/start" && req.method === "GET") {
      const state = token(), ul = url.searchParams.get("ul");
      const ch = readCharacter(url.searchParams.get("av"), ul ? ul.split(",") : []);
      redirect(res, `${harudle}/campus/connect?state=${state}`, [cookie(STATE_COOKIE, state, STATE_TTL_S, "/auth/harudle"), cookie(CHAR_COOKIE, ch ? charToCookie(ch) : "", ch ? STATE_TTL_S : 0, "/auth/harudle")]);
      return true;
    }
    if (p === "/auth/harudle/callback" && req.method === "GET") { await callback(req, res, url); return true; }
    if (p === "/auth/logout" && req.method === "POST") { await logout(req, res); return true; }
    json(res, 404, { error: "not_found" }); return true;
  }

  // 하루에 한 번: 끝난 세션과 오래 안 들어온 사용자 지우기
  function startCleanup() {
    if (!enabled || !store.cleanup) return null;
    const run = () => store.cleanup({ sessionsBefore: now(), usersBefore: now() - USER_TTL_MS }).catch((e) => log.error?.("[auth] cleanup failed:", e.message));
    const first = setTimeout(run, 60_000), timer = setInterval(run, 864e5);
    first.unref?.(); timer.unref?.();
    return () => { clearTimeout(first); clearInterval(timer); };
  }

  return { enabled, origin, handle, userFromRequest, userFromUpgrade, startCleanup, walletEnabled: wallet.enabled, gearOf: shop.gearOf, onGear: shop.onGear, ownedOf: shop.ownedOf, onOwned: shop.onOwned };
}
