// 하루들 로그인 연동 (캠퍼스 쪽)
//
//   캠퍼스 [하루들 연동하기] → GET /auth/harudle/start → 하루들 /campus/connect?state=…
//   하루들에서 [연동하기] → GET /auth/harudle/callback?code&state
//   → 캠퍼스 서버가 하루들에 code를 교환(서버끼리, 비밀값) → 캠퍼스 자체 세션 쿠키(campus_sid)
//
// 캠퍼스는 하루들 토큰을 받지도 갖지도 않는다. 하루들이 알려 주는 것은 회원 ID · 닉네임 · 프로필 사진뿐이다.
// 설정(HARUDLE_CAMPUS_CLIENT_SECRET, 저장소)이 없으면 꺼진 채로 돈다: 로그인 버튼이 숨고 모두 게스트다.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createStoreFromEnv } from "./store.js";

const STATE_COOKIE = "campus_link_state", SID_COOKIE = "campus_sid";
const STATE_TTL_S = 600;                       // 하루들 로그인까지 다녀올 시간
export const SESSION_TTL_MS = 30 * 864e5;      // 캠퍼스 로그인 유지 30일
export const USER_TTL_MS = 90 * 864e5;         // 마지막 로그인 후 90일이 지나면 지운다 (탈퇴를 알 수 없으므로)
const CACHE_MS = 60_000;
const TOKEN = /^[A-Za-z0-9_-]{43,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// 캠퍼스 자기 주소. https이거나, 로컬 개발(localhost · 127.0.0.1)일 때만 http를 허락한다
function readOrigin(value) {
  if (!value) return "";
  const u = new URL(value);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.origin !== value || u.username || u.password || !(u.protocol === "https:" || (u.protocol === "http:" && local))) throw new Error("invalid_campus_auth_origin");
  return value;
}

// 하루들이 돌려준 회원 정보 검사. 이메일·실명은 받지 않는다
function readProfile(p) {
  if (!p || typeof p !== "object" || typeof p.userId !== "string" || !UUID.test(p.userId)) return null;
  const nickname = typeof p.nickname === "string" ? p.nickname.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 30) : "";
  if (!nickname) return null;
  // 직접 올린 사진은 15분 뒤 만료되는 주소라 저장하지 않는다(기본 이미지 주소만 남긴다)
  const img = typeof p.profileImageUrl === "string" && /^https:\/\//.test(p.profileImageUrl) && !p.profileImageUrlExpiresAt ? p.profileImageUrl.slice(0, 500) : null;
  return { id: p.userId.toLowerCase(), nickname, profileImageUrl: img };
}

export function createAuth(env = process.env, opts = {}) {
  const fetchFn = opts.fetch || globalThis.fetch;
  const now = opts.now || (() => Date.now());
  const log = opts.log || console;
  const origin = readOrigin(env.CAMPUS_AUTH_ORIGIN || env.CAMPUS_PUBLIC_ORIGIN || "");
  const harudle = (env.HARUDLE_BASE_URL || "https://www.harudle.com").replace(/\/+$/, "");
  const secret = env.HARUDLE_CAMPUS_CLIENT_SECRET || "";
  const store = opts.store !== undefined ? opts.store : createStoreFromEnv(env, { fetch: fetchFn });
  const enabled = !!(origin && secret && store);
  const secure = origin.startsWith("https:");
  const cache = new Map();   // sid 해시 → { user, until }

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
    } catch (e) { log.error?.("[auth] session lookup failed:", e.message); return hit?.user || null; }
    cache.set(key, { user, until: t + CACHE_MS }); if (cache.size > 5000) cache.clear();
    return user;
  }

  // HTTP 요청의 로그인 사용자 (없으면 null)
  const userFromRequest = (req) => userFromSid(parseCookies(req.headers.cookie)[SID_COOKIE]);

  // WebSocket 접속의 로그인 사용자: 다른 사이트가 쿠키를 실어 여는 것을 막으려고 Origin이 캠퍼스일 때만 인정한다
  const userFromUpgrade = (req) => (enabled && req.headers.origin === origin ? userFromRequest(req) : Promise.resolve(null));

  async function exchange(code, state) {
    const res = await fetchFn(`${harudle}/api/v1/campus/link-codes/exchange`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`campus:${secret}`).toString("base64")}`, "content-type": "application/json", accept: "application/json", "user-agent": "harudle-campus/1.0" },
      body: JSON.stringify({ code, state }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`exchange ${res.status}`);
    const profile = readProfile(await res.json().catch(() => null));
    if (!profile) throw new Error("exchange_bad_profile");
    return profile;
  }

  async function callback(req, res, url) {
    const clearState = cookie(STATE_COOKIE, "", 0, "/auth/harudle");
    const fail = (reason, e) => { log.warn?.(`[auth] login failed: ${reason}${e ? ` (${e.message})` : ""}`); redirect(res, "/?login=fail", [clearState]); };
    if (url.searchParams.get("error")) return fail("cancelled");
    const code = url.searchParams.get("code") || "", state = url.searchParams.get("state") || "";
    const saved = parseCookies(req.headers.cookie)[STATE_COOKIE] || "";
    if (!TOKEN.test(code) || !TOKEN.test(state) || !TOKEN.test(saved) || !same(saved, state)) return fail("state");
    let profile;
    try { profile = await exchange(code, state); } catch (e) { return fail("exchange", e); }
    const sid = token(), t = now();
    try {
      await store.upsertUser({ ...profile, at: t });
      await store.createSession({ sidHash: sha256(sid), userId: profile.id, createdAt: t, expiresAt: t + SESSION_TTL_MS });
    } catch (e) { return fail("store", e); }
    redirect(res, "/?login=ok", [clearState, cookie(SID_COOKIE, sid, Math.floor(SESSION_TTL_MS / 1000))]);
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

  // 처리했으면 true. 나머지 요청은 app.js가 이어서 처리한다
  async function handle(req, res, url) {
    const p = url.pathname;
    if (p === "/api/me" && req.method === "GET") {
      const user = await userFromRequest(req);
      json(res, 200, { enabled, loggedIn: !!user, user: user ? { id: user.id, nickname: user.nickname, profileImageUrl: user.profileImageUrl } : null });
      return true;
    }
    if (!p.startsWith("/auth/")) return false;
    if (!enabled) { json(res, 404, { error: "login_disabled" }); return true; }
    if (p === "/auth/harudle/start" && req.method === "GET") {
      const state = token();
      redirect(res, `${harudle}/campus/connect?state=${state}`, [cookie(STATE_COOKIE, state, STATE_TTL_S, "/auth/harudle")]);
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

  return { enabled, origin, handle, userFromRequest, userFromUpgrade, startCleanup };
}
