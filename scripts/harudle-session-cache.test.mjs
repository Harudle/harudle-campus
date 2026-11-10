// 유효한 캐시만 사용하고, 재조회 실패로 만료된 신원을 계속 인정하지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuth, sha256 } from "../server/auth/index.js";
import { createMemoryStore } from "../server/auth/store.js";

const AT = Date.parse("2026-11-10T00:00:00.000Z");
const SID = "s".repeat(43);
const USER = { id: "6d64421d-6a44-48fa-b917-c1d20f5e5883", nickname: "테스트회원", profileImageUrl: null };
const ENV = { CAMPUS_AUTH_ORIGIN: "https://campus.harudle.com", HARUDLE_CAMPUS_SIGNING_KEY: Buffer.alloc(32, 1).toString("base64") };
const REQUEST = { method: "GET", headers: { cookie: `campus_sid=${SID}`, origin: ENV.CAMPUS_AUTH_ORIGIN } };

function app(store, now) {
  return createAuth(ENV, { store, now, log: { error() {} } });
}

async function me(auth) {
  const res = { writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); } };
  assert.equal(await auth.handle(REQUEST, res, new URL("/api/me", ENV.CAMPUS_AUTH_ORIGIN)), true);
  assert.equal(res.status, 200);
  return res.body;
}

test("유효 캐시는 유지하지만 캐시 만료 후 DB 장애면 게스트가 되고 복구 후 다시 조회한다", async () => {
  let at = AT, outage = false, lookups = 0;
  const auth = app({ async getSession() {
    lookups++;
    if (outage) throw new Error("store_unavailable");
    return { user: USER, revokedAt: null, expiresAt: AT + 120_000 };
  } }, () => at);
  assert.equal((await me(auth)).loggedIn, true);
  outage = true;
  at = AT + 59_999;
  assert.equal((await me(auth)).loggedIn, true);
  assert.equal(lookups, 1);
  at = AT + 60_000;
  assert.deepEqual(await me(auth), { enabled: true, loggedIn: false, user: null });
  assert.equal(await auth.userFromUpgrade(REQUEST), null);
  outage = false;
  assert.deepEqual(await me(auth), { enabled: true, loggedIn: true, user: USER });
  assert.equal(lookups, 4);
});

test("세션 만료 후 DB 장애가 나도 이전 신원으로 HTTP나 WebSocket을 인증하지 않는다", async () => {
  let at = AT, outage = false;
  const auth = app({ async getSession() {
    if (outage) throw new Error("store_unavailable");
    return { user: USER, revokedAt: null, expiresAt: AT + 90_000 };
  } }, () => at);
  assert.equal((await me(auth)).loggedIn, true);
  at = AT + 90_000;
  outage = true;
  assert.equal((await me(auth)).loggedIn, false);
  assert.equal(await auth.userFromUpgrade(REQUEST), null);
  outage = false;
  assert.equal((await me(auth)).loggedIn, false);
});

test("다른 앱에서 폐기한 세션은 캐시 만료 후 DB 장애 중에도 다시 인증되지 않는다", async () => {
  let at = AT, outage = false;
  const store = createMemoryStore();
  await store.upsertUser({ ...USER, at });
  await store.createSession({ sidHash: sha256(SID), userId: USER.id, createdAt: at, expiresAt: AT + 120_000 });
  const first = app(store, () => at);
  const second = app({ ...store, async getSession(sidHash) {
    if (outage) throw new Error("store_unavailable");
    return store.getSession(sidHash);
  } }, () => at);
  assert.equal((await me(second)).loggedIn, true);
  const res = { writeHead(status) { this.status = status; }, end() {} };
  await first.handle({ ...REQUEST, method: "POST" }, res, new URL("/auth/logout", ENV.CAMPUS_AUTH_ORIGIN));
  assert.equal(res.status, 204);
  at = AT + 60_000;
  outage = true;
  assert.equal((await me(second)).loggedIn, false);
  assert.equal(await second.userFromUpgrade(REQUEST), null);
  outage = false;
  assert.equal((await me(second)).loggedIn, false);
});
