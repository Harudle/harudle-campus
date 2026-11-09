import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { MediaLease } from "../workers/media-watchdog/index.js";
import { createCloudflareWatchdog } from "../server/media/cloudflare-watchdog.js";

function storage() {
  let lease, alarm = null;
  return {
    async get() { return structuredClone(lease); },
    async put(_key, value) { lease = structuredClone(value); },
    async getAlarm() { return alarm; },
    async setAlarm(value) { alarm = value; },
    async deleteAll() { lease = undefined; alarm = null; },
  };
}
const env = { SFU_APP_ID: "a".repeat(24), SFU_SECRET: "b".repeat(40) };
function request(action, body) { return new Request(`https://internal/${action}`, { method: "POST", body: JSON.stringify(body) }); }
function mockSfu({ delayed } = {}) {
  const tracks = [{ mid: "0", status: "active" }];
  let first = true;
  return {
    tracks,
    fetch: async (url, options) => {
      if (delayed && first && options.method === "GET") { first = false; await delayed; }
      if (url.endsWith("/tracks/close")) { tracks[0].status = "inactive"; return Response.json({ tracks: [{ mid: "0" }] }); }
      return Response.json({ tracks });
    },
  };
}

test("등록이 완료되면 만료 시간이 저장되고, 만료 시 별도 실행에서 트랙을 닫는다", async () => {
  const st = storage(), sfu = mockSfu(), object = new MediaLease({ storage: st }, { ...env, TEST_FETCH: sfu.fetch });
  const expiresAt = Math.floor(Date.now() / 1000) + 60, id = "session-123";
  assert.equal((await object.fetch(request("register", { id, expiresAt }))).status, 204);
  assert.equal(await st.getAlarm(), expiresAt * 1000);
  await object.alarm();
  assert.equal(sfu.tracks[0].status, "inactive");
  assert.equal(await st.get("lease"), undefined);
});

test("결과가 불확실한 요청은 세션이 사라질 때까지 정리 알람을 유지한다", async () => {
  const st = storage(), sfu = mockSfu(), object = new MediaLease({ storage: st }, { ...env, TEST_FETCH: sfu.fetch });
  const id = "session-uncertain", expiresAt = Math.floor(Date.now() / 1000) + 60;
  await object.fetch(request("register", { id, expiresAt }));
  await object.fetch(request("begin", { id }));
  assert.equal((await object.fetch(request("disarm", { id }))).status, 409);
  await object.alarm();
  assert.equal(sfu.tracks[0].status, "inactive");
  assert.equal((await st.get("lease")).pending, true);
  assert.ok((await st.getAlarm()) > Date.now());
  assert.equal((await object.fetch(request("finish", { id }))).status, 204);
  await object.alarm();
  assert.equal(await st.get("lease"), undefined);
});

test("정리 중 새 작업을 동시에 시작해도 알람 해제와 순서가 섞이지 않는다", async () => {
  let unblock; const delay = new Promise((resolve) => { unblock = resolve; });
  const st = storage(), sfu = mockSfu({ delayed: delay }), object = new MediaLease({ storage: st }, { ...env, TEST_FETCH: sfu.fetch });
  const id = "session-concurrent", expiresAt = Math.floor(Date.now() / 1000) + 60;
  await object.fetch(request("register", { id, expiresAt }));
  const closing = object.fetch(request("disarm", { id }));
  const starting = object.fetch(request("begin", { id }));
  unblock();
  assert.equal((await closing).status, 204);
  assert.equal((await starting).status, 404);
  assert.equal(await st.getAlarm(), null);
});

test("SFU 오류가 나면 알람을 다시 설정한다", async () => {
  const st = storage(), object = new MediaLease({ storage: st }, { ...env, TEST_FETCH: async () => new Response(null, { status: 503 }) });
  const id = "session-failed", expiresAt = Math.floor(Date.now() / 1000) + 60;
  await object.fetch(request("register", { id, expiresAt }));
  await object.alarm();
  assert.equal((await st.get("lease")).id, id);
  assert.ok((await st.getAlarm()) > Date.now());
});

test("SFU 앱 오류 404를 세션 정리 완료로 판단하지 않는다", async () => {
  const st = storage(), object = new MediaLease({ storage: st }, { ...env, TEST_FETCH: async () => Response.json({ errorCode: "not_found" }, { status: 404 }) });
  const id = "session-bad-app", expiresAt = Math.floor(Date.now() / 1000) + 60;
  await object.fetch(request("register", { id, expiresAt }));
  await object.alarm();
  assert.equal((await st.get("lease")).id, id);
  assert.ok((await st.getAlarm()) > Date.now());
});

test("Worker는 비밀값이 없는 요청을 거절하고 서버는 HTTPS 주소만 허용한다", async () => {
  const token = "t".repeat(40), namespace = { idFromName: (x) => x, get: () => ({ fetch: async () => new Response(null, { status: 204 }) }) };
  const body = JSON.stringify({ id: "abc", expiresAt: Math.floor(Date.now() / 1000) + 60 });
  assert.equal((await worker.fetch(new Request("https://watch/register", { method: "POST", body }), { WATCHDOG_TOKEN: token, LEASES: namespace })).status, 401);
  assert.equal((await worker.fetch(new Request("https://watch/register", { method: "POST", body, headers: { authorization: `Bearer ${token}` } }), { WATCHDOG_TOKEN: token, LEASES: namespace })).status, 204);
  assert.equal(createCloudflareWatchdog({ CLOUDFLARE_WATCHDOG_URL: "http://example.com", CLOUDFLARE_WATCHDOG_TOKEN: token }).configured, false);
  assert.equal(createCloudflareWatchdog({ CLOUDFLARE_WATCHDOG_URL: "https://example.com", CLOUDFLARE_WATCHDOG_TOKEN: token }).configured, true);
});
