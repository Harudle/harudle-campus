import assert from "node:assert/strict";
import { test } from "node:test";
import { createMeetingRegistry } from "../server/media/meeting-registry.js";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import WebSocket from "ws";
import { TokenVerifier } from "livekit-server-sdk";

test("공개 회의는 바로 들어가고 비공개 회의는 올바른 비밀번호가 필요하다", async () => {
  const registry = createMeetingRegistry(), area = "12:12:회의실 보이저";
  const open = await registry.create({ area, title: "함께 공부", locked: false, password: "" });
  const locked = await registry.create({ area, title: "작은 회의", locked: true, password: "test1234" });
  assert.equal((await registry.join({ area, id: open.id, password: "" })).id, open.id);
  await assert.rejects(registry.join({ area, id: locked.id, password: "test1235" }), /meeting_password_invalid/);
  assert.equal((await registry.join({ area, id: locked.id, password: "test1234" })).id, locked.id);
  assert.deepEqual(registry.list(area).map((r) => r.locked), [false, true]);
  assert.equal(JSON.stringify(registry.list(area)).includes("test1234"), false);
  await assert.rejects(registry.join({ area: "12:12:회의실 허블", id: locked.id, password: "test1234" }), /meeting_not_found/);
});

test("반복된 비밀번호 시도를 제한하고 만료된 회의는 입장을 막는다", async () => {
  let time = 1000000; const registry = createMeetingRegistry({ now: () => time, ttlMs: 120000 }), area = "12:회의실";
  const room = await registry.create({ area, title: "test", locked: true, password: "test1234" });
  for (let n = 0; n < 8; n++) await assert.rejects(registry.join({ area, id: room.id, password: "wrong999" }), /meeting_password_invalid/);
  await assert.rejects(registry.join({ area, id: room.id, password: "test1234" }), /meeting_rate_limited/);
  time += 120001; assert.equal(registry.contains(area, room.id), false);
  assert.equal(registry.list(area).length, 0);
});

test("서버는 비밀번호를 확인한 사용자에게만 회의별로 분리된 음성 토큰을 발급한다", async (t) => {
  const socket = createServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening");
  const port = socket.address().port; await new Promise((resolve) => socket.close(resolve));
  const env = { LIVEKIT_URL: "ws://127.0.0.1:7880", LIVEKIT_API_KEY: "devkey", LIVEKIT_API_SECRET: "secret", CAMPUS_BIND_HOST: "127.0.0.1", MEDIA_MEETINGS_TEST: "local-only", PORT: String(port) };
  const child = spawn(process.execPath, ["app.js"], { env: { ...process.env, ...env, MEDIA_PROVIDER: "livekit" }, stdio: "ignore" });
  t.after(() => child.kill("SIGKILL"));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  async function client() {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), replies = [];
    ws.on("message", (data) => replies.push(JSON.parse(data.toString()))); await once(ws, "open");
    t.after(() => ws.terminate());
    let sequence = 0;
    const call = async (type, data = {}) => {
      const id = `test${++sequence}`; ws.send(JSON.stringify({ t: type, id, ...data }));
      for (let n = 0; n < 200; n++) { const i = replies.findIndex((r) => r.id === id); if (i !== -1) return replies.splice(i, 1)[0]; await new Promise((r) => setTimeout(r, 10)); }
      throw new Error("no_reply");
    };
    ws.send(JSON.stringify({ t: "p", p: { f: 12, x: 37, y: 2 } }));
    return { ws, call };
  }
  const a = await client(), b = await client(), area = "12:12:회의실 보이저";
  const privateRoom = (await a.call("media:meeting", { op: "create", data: { title: "비공개", locked: true, password: "test1234" } })).result;
  assert.ok(privateRoom.id);
  assert.equal((await b.call("media:meeting", { op: "join", data: { id: privateRoom.id, password: "wrong123" } })).error, "meeting_password_invalid");
  assert.equal((await b.call("media:join", { area })).error, "meeting_required");
  assert.equal((await b.call("media:meeting", { op: "join", data: { id: privateRoom.id, password: "test1234" } })).result.id, privateRoom.id);
  const verifier = new TokenVerifier("devkey", "secret");
  const aJoin = (await a.call("media:join", { area })).join, bJoin = (await b.call("media:join", { area })).join;
  assert.equal((await verifier.verify(aJoin.connection.token)).video.room, (await verifier.verify(bJoin.connection.token)).video.room);
  b.ws.send(JSON.stringify({ t: "media:left" }));
  const publicRoom = (await b.call("media:meeting", { op: "create", data: { title: "공개", locked: false, password: "" } })).result;
  assert.ok(publicRoom.id);
  const otherJoin = (await b.call("media:join", { area })).join;
  assert.notEqual((await verifier.verify(aJoin.connection.token)).video.room, (await verifier.verify(otherJoin.connection.token)).video.room);
});
