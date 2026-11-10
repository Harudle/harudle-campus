// 고정된 시각으로 토큰 허용 구간과 사용 기록의 수명을 함께 확인한다.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { createAuth, verifyLinkToken } from "../server/auth/index.js";
import { createMemoryStore, createSupabaseStore } from "../server/auth/store.js";

const KEY = Buffer.from("campus-signing-key-for-test-0123456789");
const STATE = "s".repeat(43);
const ISSUED_AT = Date.parse("2026-11-10T00:00:00.000Z");
const EXPIRES_AT = Date.parse("2026-11-10T00:01:00.000Z");
const VALID_UNTIL = Date.parse("2026-11-10T00:01:30.000Z");
const JTI = "used-campus-link-token";
const ENV = { CAMPUS_AUTH_ORIGIN: "https://campus.harudle.com", HARUDLE_CAMPUS_SIGNING_KEY: KEY.toString("base64") };

function signedToken() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const claims = encode({ iss: "harudle", aud: "harudle-campus", sub: "6d64421d-6a44-48fa-b917-c1d20f5e5883", nickname: "테스트회원", state: STATE, jti: JTI, iat: ISSUED_AT / 1000, exp: EXPIRES_AT / 1000 });
  const body = `${header}.${claims}`;
  return `${body}.${createHmac("sha256", KEY).update(body).digest("base64url")}`;
}

function harness(store) {
  let at = ISSUED_AT;
  let sessionCount = 0;
  const auth = createAuth(ENV, { store: { ...store, async createSession(value) { sessionCount++; return store.createSession(value); } }, now: () => at, log: { warn() {}, error() {} } });
  return {
    setNow(value) { at = value; },
    sessionsCreated() { return sessionCount; },
    async callback(token) {
      const req = { method: "GET", headers: { cookie: `campus_link_state=${STATE}` } };
      const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end() {} };
      await auth.handle(req, res, new URL(`/auth/harudle/callback?token=${token}&state=${STATE}`, ENV.CAMPUS_AUTH_ORIGIN));
      assert.equal(res.status, 302);
      return res.headers.location;
    },
  };
}

test("원래 만료 후 사용 기록을 정리해도 허용 구간의 재사용은 막는다", async () => {
  const store = createMemoryStore(), h = harness(store), token = signedToken();
  assert.equal(await h.callback(token), "/?login=ok");
  for (const at of [EXPIRES_AT + 1, VALID_UNTIL - 1]) {
    h.setNow(at);
    await store.cleanup({ sessionsBefore: at, usersBefore: ISSUED_AT - 1 });
    assert.equal(await h.callback(token), "/?login=fail");
  }
  assert.equal(h.sessionsCreated(), 1);
});

test("30초 허용 구간의 마지막 1ms까지 검증하고 경계부터 거절한다", () => {
  const token = signedToken();
  const profile = verifyLinkToken(token, KEY, { state: STATE, nowMs: VALID_UNTIL - 1 });
  assert.equal(profile.exp, EXPIRES_AT);
  assert.equal(profile.validUntilMs, VALID_UNTIL);
  for (const at of [VALID_UNTIL, VALID_UNTIL + 1]) {
    assert.throws(() => verifyLinkToken(token, KEY, { state: STATE, nowMs: at }), /token_expired/);
  }
});

test("검증 종료 후 사용 기록을 정리해도 만료 토큰으로 세션을 만들지 않는다", async () => {
  const store = createMemoryStore(), h = harness(store), token = signedToken();
  assert.equal(await h.callback(token), "/?login=ok");
  await store.cleanup({ sessionsBefore: VALID_UNTIL, usersBefore: ISSUED_AT - 1 });
  assert.equal(await store.useLinkToken(JTI, VALID_UNTIL), false);
  await store.cleanup({ sessionsBefore: VALID_UNTIL + 1, usersBefore: ISSUED_AT - 1 });
  assert.equal(await store.useLinkToken(JTI, VALID_UNTIL), true);
  h.setNow(VALID_UNTIL + 1);
  assert.equal(await h.callback(token), "/?login=fail");
  assert.equal(h.sessionsCreated(), 1);
});

test("동시에 같은 토큰을 보내도 세션은 하나만 만든다", async () => {
  const h = harness(createMemoryStore()), token = signedToken();
  h.setNow(VALID_UNTIL - 1);
  const results = await Promise.all(Array.from({ length: 8 }, () => h.callback(token)));
  assert.equal(results.filter((result) => result === "/?login=ok").length, 1);
  assert.equal(h.sessionsCreated(), 1);
});

test("서로 다른 앱도 Supabase의 jti 충돌을 따르고 허용 종료 시각을 저장한다", async () => {
  const used = new Set(), inserts = [];
  const fetch = async (url, init) => {
    if (url.endsWith("/campus_used_link_tokens")) {
      const value = JSON.parse(init.body); inserts.push(value);
      if (used.has(value.jti)) return new Response(null, { status: 409 });
      used.add(value.jti);
    }
    return new Response(null, { status: 204 });
  };
  const makeApp = () => harness(createSupabaseStore({ url: "https://campus.example.supabase.co", key: "test-service-key", fetch }));
  const apps = [makeApp(), makeApp()], token = signedToken();
  for (const app of apps) app.setNow(VALID_UNTIL - 1);
  const results = await Promise.all(Array.from({ length: 8 }, (_, n) => apps[n % apps.length].callback(token)));
  assert.equal(results.filter((result) => result === "/?login=ok").length, 1);
  assert.equal(apps.reduce((sum, app) => sum + app.sessionsCreated(), 0), 1);
  assert.ok(inserts.length > 1);
  for (const row of inserts) assert.deepEqual(row, { jti: JTI, expires_at: "2026-11-10T00:01:30.000Z" });
});
