import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { TokenVerifier } from "livekit-server-sdk";
import WebSocket from "ws";
import { roomKeyAt } from "../dist-check/world.mjs";
import { areaOf, canHear, canShareScreen } from "../src/media/policy.mjs";
import { createMediaService } from "../server/media/index.js";

const env = { LIVEKIT_URL: "ws://127.0.0.1:7880", LIVEKIT_API_KEY: "devkey", LIVEKIT_API_SECRET: "secret" };

test("음성은 같은 층의 6칸 이내 또는 같은 방 사람에게만 전달한다", () => {
  const me = { f: 12, x: 20, y: 20, rm: "" };
  assert.equal(canHear(me, { f: 12, x: 26, y: 20, rm: "" }), true);
  assert.equal(canHear(me, { f: 12, x: 26.1, y: 20, rm: "" }), false);
  assert.equal(canHear(me, { f: 13, x: 20, y: 20, rm: "" }), false);
  assert.equal(canHear(me, { f: 12, x: 20, y: 20, rm: "12:회의실 보이저" }), false);
  const meeting = { ...me, rm: "12:회의실 보이저" };
  assert.equal(canHear(meeting, { ...meeting, x: 40 }), true);
  assert.equal(canHear(meeting, { ...meeting, rm: "12:회의실 아폴로" }), false);
  assert.equal(canHear(me, { ...me, x: NaN }), false);
});

test("지도의 위치로 회의실을 구분하고 회의실에서만 화면을 공유한다", () => {
  assert.equal(roomKeyAt(12, 37, 2), "12:회의실 보이저");
  assert.equal(roomKeyAt(12, 37, 7), "12:회의실 아폴로");
  assert.equal(roomKeyAt(12, 32.5, 15.5), "");
  assert.equal(canShareScreen({ rm: roomKeyAt(12, 37, 2) }), true);
  assert.equal(canShareScreen({ rm: roomKeyAt(12, 32.5, 15.5) }), false);
  assert.notEqual(areaOf({ f: 12, rm: "" }), areaOf({ f: 12, rm: "12:회의실 보이저" }));
});

test("서버는 위치에 맞는 방과 화면 공유 권한만 담은 토큰을 발급한다", async () => {
  assert.equal(createMediaService({}).configured, false);
  assert.equal(createMediaService({ ...env, LIVEKIT_URL: "ws://example.com" }).configured, false);
  const service = createMediaService(env), verifier = new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  const outside = await service.join({ identity: "peer-1", name: "크루", area: "12:open", canShare: false });
  const meeting = await service.join({ identity: "peer-1", name: "크루", area: "12:12:회의실 보이저", canShare: true });
  const openClaims = await verifier.verify(outside.connection.token), roomClaims = await verifier.verify(meeting.connection.token);
  assert.equal(openClaims.sub, "peer-1");
  assert.deepEqual(openClaims.video.canPublishSources, ["microphone"]);
  assert.deepEqual(roomClaims.video.canPublishSources, ["microphone", "screen_share", "screen_share_audio"]);
  assert.notEqual(openClaims.video.room, roomClaims.video.room);
  assert.equal(openClaims.video.canPublishData, false);
  assert.equal(JSON.stringify(outside).includes(env.LIVEKIT_API_SECRET), false);
});

test("아직 시험 단계인 Daily와 자동 전환은 일반 서버에서 켜지지 않는다", () => {
  assert.equal(createMediaService({ MEDIA_PROVIDER: "daily" }).configured, false);
  assert.equal(createMediaService({ MEDIA_PROVIDER: "auto" }, { onSwitch: async () => {} }).configured, false);
  assert.equal(createMediaService({ MEDIA_PROVIDER: "auto-test" }, { onSwitch: async () => {} }).configured, false);
});

async function freePort() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1"); await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

test("토큰 요청은 같은 웹소켓의 실제 위치를 사용한다", async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, ["app.js"], { env: { ...process.env, ...env, CAMPUS_BIND_HOST: "127.0.0.1", PORT: String(port), AUTO_DEPLOY: "0" }, stdio: "ignore" });
  t.after(() => { child.kill("SIGKILL"); });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(`http://127.0.0.1:${port}/healthz`); if (response.ok) { ready = true; break; } } catch { }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(ready, true, "캠퍼스 서버를 시작하지 못했습니다");
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => ws.terminate());
  const messages = [];
  ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await once(ws, "open");
  const take = async (predicate) => {
    for (let i = 0; i < 200; i++) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return messages.splice(index, 1)[0];
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("웹소켓 응답을 받지 못했습니다");
  };
  const hello = await take((m) => m.t === "hello");
  ws.send(JSON.stringify({ t: "media:join", id: "one", area: "12:open" }));
  assert.equal((await take((m) => m.id === "one")).error, "not_ready");
  // 클라이언트가 임의의 방 이름을 보내도 서버는 실제 좌표로 판별한다.
  ws.send(JSON.stringify({ t: "p", p: { f: 12, x: 37, y: 2, rm: "12:회의실 아폴로" } }));
  ws.send(JSON.stringify({ t: "media:join", id: "two", area: "12:12:회의실 아폴로" }));
  assert.equal((await take((m) => m.id === "two")).error, "area_changed");
  ws.send(JSON.stringify({ t: "media:join", id: "three", area: "12:12:회의실 보이저" }));
  const response = await take((m) => m.id === "three");
  assert.equal(response.join.area, "12:12:회의실 보이저");
  assert.equal(response.join.canShare, true);
  const claims = await new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET).verify(response.join.connection.token);
  assert.equal(claims.sub, hello.id);
});

test("운영 주소를 설정하면 다른 사이트에서 건 웹소켓 요청을 거절한다", async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, ["app.js"], { env: { ...process.env, ...env, MEDIA_PROVIDER: "livekit", CAMPUS_BIND_HOST: "127.0.0.1", CAMPUS_PUBLIC_ORIGIN: "https://campus.harudle.com", PORT: String(port) }, stdio: "ignore" });
  t.after(() => child.kill("SIGKILL"));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch {} await new Promise((resolve) => setTimeout(resolve, 50)); }
  const bad = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: "https://example.org" });
  bad.on("error", () => {}); t.after(() => bad.terminate());
  const rejected = await once(bad, "unexpected-response");
  assert.equal(rejected[1].statusCode, 401);
  rejected[1].resume(); bad.terminate();
  const good = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: "https://campus.harudle.com" }); t.after(() => good.terminate());
  await once(good, "open"); assert.equal(good.readyState, WebSocket.OPEN);
});
