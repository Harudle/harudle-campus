// 하루들 로그인 연동(캠퍼스 쪽): 시작 → 하루들 서명 토큰 확인 → 세션 → WebSocket 신원 → 로그아웃
// 하루들이 발급하는 HS256 토큰을 이 시험이 같은 키로 직접 만든다(캠퍼스는 하루들을 호출하지 않는다)
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const KEY = Buffer.from("campus-signing-key-for-test-0123456789");
const USER = { sub: "6d64421d-6a44-48fa-b917-c1d20f5e5883", nickname: "눈누난나", picture: "https://www.harudle.com/profile-images/v1/10.png" };

function sign(claims, key = KEY, header = { alg: "HS256", typ: "JWT" }) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${enc(header)}.${enc(claims)}`;
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}
const now = () => Math.floor(Date.now() / 1000);
const claimsFor = (state, extra = {}) => ({ iss: "harudle", aud: "harudle-campus", sub: USER.sub, jti: randomUUID(), iat: now(), exp: now() + 60, nickname: USER.nickname, picture: USER.picture, state, ...extra });

async function freePort() {
  const l = createServer(); l.listen(0, "127.0.0.1"); await once(l, "listening");
  const port = l.address().port; await new Promise((r) => l.close(r)); return port;
}

async function startApp(t, extraEnv) {
  const dir = mkdtempSync(join(tmpdir(), "wm-login-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["app.js"], { env: { ...process.env, TMPDIR: dir, CAMPUS_BIND_HOST: "127.0.0.1", PORT: String(port), NODE_ENV: "test", ...extraEnv(origin) }, stdio: "ignore" });
  t.after(() => child.kill("SIGKILL"));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${origin}/healthz`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  return origin;
}
const enabledEnv = (o) => ({ CAMPUS_AUTH_ORIGIN: o, HARUDLE_BASE_URL: "https://dev.harudle.com", HARUDLE_CAMPUS_SIGNING_KEY: KEY.toString("base64"), CAMPUS_AUTH_STORE: "memory" });

const cookieOf = (res, name) => (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
const callback = (origin, token, state, cookieState = state) => fetch(`${origin}/auth/harudle/callback?token=${token}&state=${state}`, { redirect: "manual", headers: { cookie: `campus_link_state=${cookieState}` } });

async function ws(t, origin, { cookie, wsOrigin, secret }) {
  const socket = new WebSocket(`${origin.replace("http", "ws")}/ws`, { headers: { ...(cookie ? { cookie } : {}) }, ...(wsOrigin ? { origin: wsOrigin } : {}) });
  const messages = []; socket.on("message", (d) => messages.push(JSON.parse(d.toString())));
  await once(socket, "open"); t.after(() => socket.terminate());
  socket.send(JSON.stringify({ t: "id", u: secret })); socket.send(JSON.stringify({ t: "name", name: "가짜이름" })); socket.send(JSON.stringify({ t: "p", p: { f: 11, x: 30, y: 16 } }));
  const wait = async (pred, timeout = 3000) => { const until = Date.now() + timeout; while (Date.now() < until) { const i = messages.findIndex(pred); if (i !== -1) return messages.splice(i, 1)[0]; await new Promise((r) => setTimeout(r, 10)); } return null; };
  return { send: (m) => socket.send(JSON.stringify(m)), wait };
}

test("설정이 없으면 연동은 꺼지고 모두 게스트다", async (t) => {
  const origin = await startApp(t, () => ({ HARUDLE_CAMPUS_SIGNING_KEY: "", CAMPUS_AUTH_STORE: "" }));
  assert.deepEqual(await (await fetch(`${origin}/api/me`)).json(), { enabled: false, loggedIn: false, user: null });
  assert.equal((await fetch(`${origin}/auth/harudle/start`, { redirect: "manual" })).status, 404);
});

test("연동하기 → 하루들 서명 토큰 → 캠퍼스 세션이 생기고, 끊으면 사라진다", async (t) => {
  const origin = await startApp(t, enabledEnv);
  assert.equal((await (await fetch(`${origin}/api/me`)).json()).enabled, true);

  // 1) 시작: 하루들 연결 화면으로 보내고 state를 쿠키에 묶는다
  const start = await fetch(`${origin}/auth/harudle/start`, { redirect: "manual" });
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get("location"));
  assert.equal(`${to.origin}${to.pathname}`, "https://dev.harudle.com/campus/connect");
  const state = to.searchParams.get("state"), setState = start.headers.getSetCookie().find((c) => c.startsWith("campus_link_state="));
  assert.equal(cookieOf(start, "campus_link_state"), state);
  assert.match(setState, /HttpOnly/); assert.match(setState, /SameSite=Lax/); assert.match(setState, /Path=\/auth\/harudle/);

  // 2) 정상 토큰 → 세션 쿠키. state 쿠키는 지운다
  const token = sign(claimsFor(state));
  const ok = await callback(origin, token, state);
  assert.equal(ok.headers.get("location"), "/?login=ok");
  assert.equal(ok.headers.get("referrer-policy"), "no-referrer");
  const sid = cookieOf(ok, "campus_sid"); assert.ok(sid && sid.length >= 43);
  assert.equal(cookieOf(ok, "campus_link_state"), "");
  const cookie = `campus_sid=${sid}`;
  assert.deepEqual(await (await fetch(`${origin}/api/me`, { headers: { cookie } })).json(),
    { enabled: true, loggedIn: true, user: { id: USER.sub, nickname: USER.nickname, profileImageUrl: USER.picture } });

  // 3) 같은 토큰은 다시 못 쓴다(캠퍼스 DB의 jti)
  assert.equal((await callback(origin, token, state)).headers.get("location"), "/?login=fail");

  // 4) WebSocket: 캠퍼스 Origin + 세션 쿠키면 서버가 주소·이름을 정한다(보낸 id·name은 무시)
  const a = await ws(t, origin, { cookie, wsOrigin: origin, secret: "guest-secret-should-be-ignored" });
  assert.deepEqual(await a.wait((m) => m.t === "me"), { t: "me", u: `h_${USER.sub}`, verified: true, name: USER.nickname });
  assert.equal(await a.wait((m) => m.t === "me", 400), null);
  const forged = await ws(t, origin, { cookie, wsOrigin: "https://evil.example", secret: "forged-guest-secret-0123456789" });
  assert.match((await forged.wait((m) => m.t === "me"))?.u || "", /^p_[0-9a-f]{16}$/);
  const peers = await forged.wait((m) => m.t === "peers" && m.peers.length === 2 && m.peers.every((p) => p.name !== "크루"));
  const verified = peers?.peers.find((p) => p.u === `h_${USER.sub}`);
  assert.equal(verified?.name, USER.nickname); assert.equal(verified?.hv, 1);

  // 5) 로그아웃: 다른 Origin은 거절, 캠퍼스 Origin이면 세션 폐기
  assert.equal((await fetch(`${origin}/auth/logout`, { method: "POST", headers: { cookie } })).status, 403);
  const out = await fetch(`${origin}/auth/logout`, { method: "POST", headers: { cookie, origin } });
  assert.equal(out.status, 204);
  assert.equal((await (await fetch(`${origin}/api/me`, { headers: { cookie } })).json()).loggedIn, false);
});

test("위조 · 만료 · 다른 state · 다른 대상의 토큰은 거절한다", async (t) => {
  const origin = await startApp(t, enabledEnv);
  const state = "s".repeat(43), fails = async (token, s = state, c = state) => (await callback(origin, token, s, c)).headers.get("location") === "/?login=fail";
  assert.ok(await fails(sign(claimsFor(state), Buffer.from("another-signing-key-0123456789abcdef"))), "다른 키");
  assert.ok(await fails(sign(claimsFor(state, { exp: now() - 120 }))), "만료");
  assert.ok(await fails(sign(claimsFor("t".repeat(43))), state), "토큰 안 state가 다름");
  assert.ok(await fails(sign(claimsFor(state)), state, "u".repeat(43)), "쿠키 state가 다름");
  assert.ok(await fails(sign(claimsFor(state, { aud: "harudle-api" }))), "다른 대상");
  assert.ok(await fails(sign(claimsFor(state), KEY, { alg: "none" })), "alg none");
  assert.ok(await fails("not.a.jwt"), "형식");
  const ok = await callback(origin, sign(claimsFor(state)), state);
  assert.equal(ok.headers.get("location"), "/?login=ok");
});

test("처음 연동하면 연동하기를 누른 브라우저의 캐릭터가 저장되고, 다시 연동해도 저장된 캐릭터가 남는다", async (t) => {
  const origin = await startApp(t, enabledEnv);
  const AV1 = "0000000FFFFFFF4F1EADBD6D1F4F1EAFFFFFFF6D7C11", AV2 = "1210000B9A6ECF4F1EADBD6D1F4F1EAFFFFFFF6D7C10";
  const link = async (query) => {
    const start = await fetch(`${origin}/auth/harudle/start${query}`, { redirect: "manual" });
    const state = new URL(start.headers.get("location")).searchParams.get("state"), char = cookieOf(start, "campus_link_char");
    const res = await fetch(`${origin}/auth/harudle/callback?token=${sign(claimsFor(state))}&state=${state}`, { redirect: "manual", headers: { cookie: `campus_link_state=${state}; campus_link_char=${char}` } });
    assert.equal(res.headers.get("location"), "/?login=ok");
    assert.equal(cookieOf(res, "campus_link_char"), "");
    return { char, cookie: `campus_sid=${cookieOf(res, "campus_sid")}` };
  };
  const get = async (cookie) => (await (await fetch(`${origin}/api/me/character`, { headers: { cookie } })).json()).character;

  // 모양이 틀린 캐릭터 · 모르는 장식은 받지 않는다
  assert.equal(cookieOf(await fetch(`${origin}/auth/harudle/start?av=<script>`, { redirect: "manual" }), "campus_link_char"), "");

  // 1) 처음 연동: 그 브라우저의 외형 · 푼 장식이 저장된다
  const first = await link(`?av=${AV1}&ul=airpods,headset,crown`);
  assert.equal(first.char, `${AV1}.airpods_headset`);
  assert.deepEqual(await get(first.cookie), { av: AV1, unlocks: ["airpods", "headset"] });

  // 2) 다른 브라우저에서 다시 연동해도 저장된 캐릭터가 이긴다
  const again = await link(`?av=${AV2}`);
  assert.deepEqual(await get(again.cookie), { av: AV1, unlocks: ["airpods", "headset"] });

  // 3) 연동한 채로 꾸미면 덮어쓴다. 캠퍼스 Origin · 로그인 · 올바른 모양만
  const put = (body, headers) => fetch(`${origin}/api/me/character`, { method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await put({ av: AV2, unlocks: [] }, { cookie: again.cookie })).status, 403);
  assert.equal((await put({ av: AV2, unlocks: [] }, { origin })).status, 401);
  assert.equal((await put({ av: "nope", unlocks: [] }, { cookie: again.cookie, origin })).status, 400);
  assert.equal((await put({ av: AV2, unlocks: ["headset"] }, { cookie: again.cookie, origin })).status, 204);
  assert.deepEqual(await get(first.cookie), { av: AV2, unlocks: ["headset"] });
  assert.equal((await fetch(`${origin}/api/me/character`)).status, 401);
});

test("캐릭터 없이 연동해도 로그인은 되고, 저장된 캐릭터는 없다", async (t) => {
  const origin = await startApp(t, enabledEnv);
  const start = await fetch(`${origin}/auth/harudle/start`, { redirect: "manual" });
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const res = await callback(origin, sign(claimsFor(state)), state);
  assert.equal(res.headers.get("location"), "/?login=ok");
  const cookie = `campus_sid=${cookieOf(res, "campus_sid")}`;
  assert.deepEqual(await (await fetch(`${origin}/api/me/character`, { headers: { cookie } })).json(), { character: null });
});
