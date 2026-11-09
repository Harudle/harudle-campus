// 하루들 로그인 연동(캠퍼스 쪽): 가짜 하루들 서버로 시작 → 연결 → 세션 → WebSocket 신원 → 로그아웃까지
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import http from "node:http";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const SECRET = "test-client-secret-0123456789";
const USER = { userId: "6d64421d-6a44-48fa-b917-c1d20f5e5883", nickname: "눈누난나", profileImageUrl: "https://www.harudle.com/profile-images/v1/10.png", profileImageUrlExpiresAt: null };

async function freePort() {
  const l = createServer(); l.listen(0, "127.0.0.1"); await once(l, "listening");
  const port = l.address().port; await new Promise((r) => l.close(r)); return port;
}

// 가짜 하루들: 교환 API만. 코드는 한 번만 쓸 수 있고, 비밀값이 맞아야 한다
async function fakeHarudle(t) {
  const codes = new Map(), calls = [];
  const server = http.createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    calls.push({ path: req.url, auth: req.headers.authorization, body });
    if (req.method !== "POST" || req.url !== "/api/v1/campus/link-codes/exchange") { res.writeHead(404); return res.end(); }
    if (req.headers.authorization !== `Basic ${Buffer.from(`campus:${SECRET}`).toString("base64")}`) { res.writeHead(401); return res.end(); }
    const { code, state } = JSON.parse(body || "{}"), entry = codes.get(code);
    if (!entry || entry.state !== state) { res.writeHead(400, { "content-type": "application/json" }); return res.end('{"error":"invalid_grant"}'); }
    codes.delete(code);
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(entry.profile));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, calls, issue: (state, profile = USER) => { const code = `code${Math.random().toString(36).slice(2)}`.padEnd(43, "x"); codes.set(code, { state, profile }); return code; } };
}

async function startApp(t, extraEnv) {
  const dir = mkdtempSync(join(tmpdir(), "wm-login-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["app.js"], { env: { ...process.env, TMPDIR: dir, CAMPUS_BIND_HOST: "127.0.0.1", PORT: String(port), NODE_ENV: "test", ...extraEnv(origin) }, stdio: "ignore" });
  t.after(() => child.kill("SIGKILL"));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${origin}/healthz`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  return origin;
}

const cookieOf = (res, name) => (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

async function ws(t, origin, { cookie, wsOrigin, secret }) {
  const socket = new WebSocket(`${origin.replace("http", "ws")}/ws`, { headers: { ...(cookie ? { cookie } : {}) }, ...(wsOrigin ? { origin: wsOrigin } : {}) });
  const messages = []; socket.on("message", (d) => messages.push(JSON.parse(d.toString())));
  await once(socket, "open"); t.after(() => socket.terminate());
  socket.send(JSON.stringify({ t: "id", u: secret })); socket.send(JSON.stringify({ t: "name", name: "가짜이름" })); socket.send(JSON.stringify({ t: "p", p: { f: 11, x: 30, y: 16 } }));
  const wait = async (pred, timeout = 3000) => { const until = Date.now() + timeout; while (Date.now() < until) { const i = messages.findIndex(pred); if (i !== -1) return messages.splice(i, 1)[0]; await new Promise((r) => setTimeout(r, 10)); } return null; };
  return { send: (m) => socket.send(JSON.stringify(m)), wait };
}

test("설정이 없으면 연동은 꺼지고 모두 게스트다", async (t) => {
  const origin = await startApp(t, () => ({ HARUDLE_CAMPUS_CLIENT_SECRET: "", CAMPUS_AUTH_STORE: "" }));
  assert.deepEqual(await (await fetch(`${origin}/api/me`)).json(), { enabled: false, loggedIn: false, user: null });
  assert.equal((await fetch(`${origin}/auth/harudle/start`, { redirect: "manual" })).status, 404);
});

test("연동하기 → 하루들 → 돌아오면 캠퍼스 세션이 생기고, 끊으면 사라진다", async (t) => {
  const harudle = await fakeHarudle(t);
  const origin = await startApp(t, (o) => ({ CAMPUS_AUTH_ORIGIN: o, HARUDLE_BASE_URL: harudle.url, HARUDLE_CAMPUS_CLIENT_SECRET: SECRET, CAMPUS_AUTH_STORE: "memory" }));
  assert.equal((await (await fetch(`${origin}/api/me`)).json()).enabled, true);

  // 1) 시작: 하루들 연결 페이지로 보내고 state를 쿠키에 묶는다
  const start = await fetch(`${origin}/auth/harudle/start`, { redirect: "manual" });
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get("location"));
  assert.equal(`${to.origin}${to.pathname}`, `${harudle.url}/campus/connect`);
  const state = to.searchParams.get("state"), setState = start.headers.getSetCookie().find((c) => c.startsWith("campus_link_state="));
  assert.equal(cookieOf(start, "campus_link_state"), state);
  assert.match(setState, /HttpOnly/); assert.match(setState, /SameSite=Lax/); assert.match(setState, /Path=\/auth\/harudle/);

  // 2) state가 다르면(남의 코드를 내 브라우저에 심기) 실패
  const other = harudle.issue("x".repeat(43));
  const bad = await fetch(`${origin}/auth/harudle/callback?code=${other}&state=${"x".repeat(43)}`, { redirect: "manual", headers: { cookie: `campus_link_state=${state}` } });
  assert.equal(bad.headers.get("location"), "/?login=fail"); assert.equal(cookieOf(bad, "campus_sid"), undefined);

  // 3) 정상: 코드 교환 → 세션 쿠키
  const code = harudle.issue(state);
  const ok = await fetch(`${origin}/auth/harudle/callback?code=${code}&state=${state}`, { redirect: "manual", headers: { cookie: `campus_link_state=${state}` } });
  assert.equal(ok.headers.get("location"), "/?login=ok");
  assert.equal(ok.headers.get("referrer-policy"), "no-referrer");
  const sid = cookieOf(ok, "campus_sid"); assert.ok(sid && sid.length >= 43);
  assert.equal(cookieOf(ok, "campus_link_state"), "");   // state 쿠키는 지운다
  const exchangeCall = harudle.calls.at(-1);
  assert.deepEqual(JSON.parse(exchangeCall.body), { code, state });
  const cookie = `campus_sid=${sid}`;
  const me = await (await fetch(`${origin}/api/me`, { headers: { cookie } })).json();
  assert.deepEqual(me, { enabled: true, loggedIn: true, user: { id: USER.userId, nickname: USER.nickname, profileImageUrl: USER.profileImageUrl } });

  // 4) 같은 코드는 다시 못 쓴다
  const again = await fetch(`${origin}/auth/harudle/callback?code=${code}&state=${state}`, { redirect: "manual", headers: { cookie: `campus_link_state=${state}` } });
  assert.equal(again.headers.get("location"), "/?login=fail");

  // 5) WebSocket: 캠퍼스 Origin + 세션 쿠키면 서버가 주소·이름을 정한다(보낸 id·name은 무시)
  const a = await ws(t, origin, { cookie, wsOrigin: origin, secret: "guest-secret-should-be-ignored" });
  const aMe = await a.wait((m) => m.t === "me");
  assert.deepEqual(aMe, { t: "me", u: `h_${USER.userId}`, verified: true, name: USER.nickname });
  assert.equal(await a.wait((m) => m.t === "me", 400), null);   // 게스트 주소로 다시 바뀌지 않는다

  // 다른 사이트에서 쿠키를 실어 연 접속은 게스트로 취급
  const forged = await ws(t, origin, { cookie, wsOrigin: "https://evil.example", secret: "forged-guest-secret-0123456789" });
  assert.match((await forged.wait((m) => m.t === "me"))?.u || "", /^p_[0-9a-f]{16}$/);

  const peers = await forged.wait((m) => m.t === "peers" && m.peers.length === 2 && m.peers.every((p) => p.name !== "크루"));
  const verified = peers?.peers.find((p) => p.u === `h_${USER.userId}`);
  assert.equal(verified?.name, USER.nickname); assert.equal(verified?.hv, 1);
  assert.ok(!peers.peers.find((p) => p.u !== `h_${USER.userId}`).hv);

  // 게스트 → 연동한 사람에게 개인 메시지
  forged.send({ t: "chat", k: "dm", to: `h_${USER.userId}`, text: "안녕하세요" });
  assert.equal((await a.wait((m) => m.t === "chat" && m.text === "안녕하세요"))?.to, `h_${USER.userId}`);

  // 6) 로그아웃: 다른 Origin은 거절, 캠퍼스 Origin이면 세션 폐기
  assert.equal((await fetch(`${origin}/auth/logout`, { method: "POST", headers: { cookie } })).status, 403);
  const out = await fetch(`${origin}/auth/logout`, { method: "POST", headers: { cookie, origin } });
  assert.equal(out.status, 204); assert.equal(cookieOf(out, "campus_sid"), "");
  assert.equal((await (await fetch(`${origin}/api/me`, { headers: { cookie } })).json()).loggedIn, false);
});

test("하루들이 교환을 거절하거나 사진 주소가 만료형이면", async (t) => {
  const harudle = await fakeHarudle(t);
  const origin = await startApp(t, (o) => ({ CAMPUS_AUTH_ORIGIN: o, HARUDLE_BASE_URL: harudle.url, HARUDLE_CAMPUS_CLIENT_SECRET: "wrong-secret-0123456789", CAMPUS_AUTH_STORE: "memory" }));
  const state = "s".repeat(43), code = harudle.issue(state);
  const r = await fetch(`${origin}/auth/harudle/callback?code=${code}&state=${state}`, { redirect: "manual", headers: { cookie: `campus_link_state=${state}` } });
  assert.equal(r.headers.get("location"), "/?login=fail");   // 비밀값이 틀려 401

  const origin2 = await startApp(t, (o) => ({ CAMPUS_AUTH_ORIGIN: o, HARUDLE_BASE_URL: harudle.url, HARUDLE_CAMPUS_CLIENT_SECRET: SECRET, CAMPUS_AUTH_STORE: "memory" }));
  const code2 = harudle.issue(state, { ...USER, profileImageUrl: "https://s3.example/private.webp?sig=1", profileImageUrlExpiresAt: "2026-11-09T00:15:00Z" });
  const ok = await fetch(`${origin2}/auth/harudle/callback?code=${code2}&state=${state}`, { redirect: "manual", headers: { cookie: `campus_link_state=${state}` } });
  const me = await (await fetch(`${origin2}/api/me`, { headers: { cookie: `campus_sid=${cookieOf(ok, "campus_sid")}` } })).json();
  assert.equal(me.user.profileImageUrl, null);
});
