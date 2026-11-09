import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import WebSocket from "ws";

test("근처 채팅은 같은 회의에서만 주고받는다", async (t) => {
  const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve));
  const child = spawn(process.execPath, ["app.js"], { env: { ...process.env, MEDIA_PROVIDER: "livekit", LIVEKIT_URL: "ws://127.0.0.1:7880", LIVEKIT_API_KEY: "devkey", LIVEKIT_API_SECRET: "secret", CAMPUS_BIND_HOST: "127.0.0.1", MEDIA_MEETINGS_TEST: "local-only", MEDIA_MEETINGS: "", PORT: String(port) }, stdio: "ignore" });
  t.after(() => child.kill("SIGKILL"));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  async function connect(uid) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`), messages = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString()))); await once(socket, "open"); t.after(() => socket.terminate());
    socket.send(JSON.stringify({ t: "id", u: uid })); socket.send(JSON.stringify({ t: "p", p: { f: 12, x: 37, y: 2 } }));
    let sequence = 0;
    const wait = async (predicate, timeout = 3000) => {
      const until = Date.now() + timeout;
      while (Date.now() < until) { const i = messages.findIndex(predicate); if (i !== -1) return messages.splice(i, 1)[0]; await new Promise((r) => setTimeout(r, 10)); }
      return null;
    };
    const meeting = async (op, data) => { const id = `r${++sequence}`; socket.send(JSON.stringify({ t: "media:meeting", id, op, data })); return wait((m) => m.id === id); };
    return { socket, wait, meeting };
  }
  const a = await connect("testA"), b = await connect("testB");
  const privateRoom = (await a.meeting("create", { title: "비공개", locked: true, password: "test1234" })).result;
  assert.ok((await b.meeting("create", { title: "다른 회의", locked: false, password: "" })).result.id);
  a.socket.send(JSON.stringify({ t: "chat", k: "near", text: "비공개 메시지" }));
  assert.equal((await a.wait((m) => m.t === "chat" && m.text === "비공개 메시지"))?.scope, `meeting:${privateRoom.id}`);
  assert.equal(await b.wait((m) => m.t === "chat" && m.text === "비공개 메시지", 300), null);
  assert.equal((await b.meeting("join", { id: privateRoom.id, password: "test1234" })).result.id, privateRoom.id);
  a.socket.send(JSON.stringify({ t: "chat", k: "near", text: "같은 회의 메시지" }));
  assert.equal((await b.wait((m) => m.t === "chat" && m.text === "같은 회의 메시지"))?.scope, `meeting:${privateRoom.id}`);
});
