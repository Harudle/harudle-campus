import assert from "node:assert/strict";
import { test } from "node:test";
import { createCloudflareSfuClient } from "../server/media/cloudflare-sfu.js";

const env = { CLOUDFLARE_SFU_APP_ID: "a".repeat(32), CLOUDFLARE_SFU_SECRET: "b".repeat(64) };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status });

test("Cloudflare SFU 요청은 서버 자격 정보로 수행하고 트랙별 결과를 확인한다", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname, body = options.body && JSON.parse(options.body);
    requests.push({ path, body, auth: options.headers.authorization });
    if (path.endsWith("/sessions/new")) return reply({ sessionId: "session-one" }, 201);
    if (path.endsWith("/tracks/new") && body.sessionDescription) return reply({ sessionDescription: { type: "answer", sdp: "v=0" }, tracks: [{ mid: "0" }] });
    if (path.endsWith("/tracks/new")) return reply({ sessionDescription: { type: "offer", sdp: "v=0" }, requiresImmediateRenegotiation: true, tracks: [{ mid: "1" }] });
    if (path.endsWith("/renegotiate")) return reply({});
    if (path.endsWith("/tracks/close")) return reply({ tracks: [{ mid: "1" }] });
    if (path.endsWith("/session-one")) return reply({ tracks: [{ mid: "1", status: "active" }] });
    throw new Error("unexpected_request");
  };
  const client = createCloudflareSfuClient(env, fetchImpl);
  assert.equal(await client.createSession(), "session-one");
  assert.equal((await client.publish("session-one", "audio", "0", { type: "offer", sdp: "v=0" })).track.mid, "0");
  assert.equal((await client.subscribe("session-one", "publisher", "audio")).track.mid, "1");
  await client.answer("session-one", { type: "answer", sdp: "v=0" });
  await client.close("session-one", "1");
  assert.deepEqual(await client.getSession("session-one"), [{ mid: "1", status: "active" }]);
  assert.ok(requests.every((x) => x.auth === `Bearer ${env.CLOUDFLARE_SFU_SECRET}`));
  assert.equal(JSON.stringify(requests.map(({ auth, ...x }) => x)).includes(env.CLOUDFLARE_SFU_SECRET), false);
});

test("트랙별 오류나 잘못된 입력은 연결 성공으로 처리하지 않는다", async () => {
  const client = createCloudflareSfuClient(env, async () => reply({ sessionDescription: { type: "answer", sdp: "v=0" }, tracks: [{ mid: "0", errorCode: "track_error" }] }));
  await assert.rejects(client.publish("session-one", "audio", "0", { type: "offer", sdp: "v=0" }), /cloudflare_track_failed/);
  await assert.rejects(client.publish("../other", "audio", "0", { type: "offer", sdp: "v=0" }), /invalid_media_request/);
  assert.equal(createCloudflareSfuClient({}).configured, false);
});

test("이미 사라진 세션은 종료된 것으로 처리한다", async () => {
  const client = createCloudflareSfuClient(env, async () => reply({ errorCode: "session_error" }, 410));
  assert.deepEqual(await client.getSession("session-one"), []);
  await client.close("session-one", "0");
});

test("앱을 찾지 못한 404는 세션 정리 성공으로 처리하지 않는다", async () => {
  const client = createCloudflareSfuClient(env, async () => reply({ errorCode: "not_found" }, 404));
  await assert.rejects(client.getSession("session-one"), /cloudflare_unavailable/);
  await assert.rejects(client.close("session-one", "0"), /cloudflare_unavailable/);
});

test("확인할 수 없는 트랙은 정리된 것으로 처리하지 않는다", async () => {
  const client = createCloudflareSfuClient(env, async () => reply({ tracks: [{ status: "active" }] }));
  await assert.rejects(client.getSession("session-one"), /cloudflare_invalid_response/);
  await assert.rejects(client.close("session-one", "0"), /cloudflare_close_failed/);
  const alreadyClosed = createCloudflareSfuClient(env, async () => reply({ tracks: [{ mid: "0", errorCode: "close_track_error", errorDescription: "already closed" }] }));
  await alreadyClosed.close("session-one", "0");
});
