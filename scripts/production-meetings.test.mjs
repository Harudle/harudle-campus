import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import WebSocket from "ws";
import { initializeDurableMediaState, openDurableMediaState } from "../server/media/durable-state.js";

test("운영 설정에서 만든 비공개 회의는 서버 재시작 후에도 비밀번호로 입장한다", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "campus-prod-meetings-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const state = join(dir, "state.sqlite"), listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve));
  initializeDurableMediaState({ path: state, period: new Date().toISOString().slice(0, 7), budgets: { livekit: { limit: 1000, used: 0 }, livekit_bytes: { limit: 1000000000, used: 0 }, daily: { limit: 1000, used: 0 }, cloudflare: { limit: 1000000000, used: 0 } } });
  const env = { ...process.env, NODE_ENV: "production", AUTO_DEPLOY: "0", PORT: String(port), CAMPUS_BIND_HOST: "127.0.0.1", CAMPUS_PUBLIC_ORIGIN: "https://campus.harudle.com", MEDIA_PROVIDER: "managed-draft", MEDIA_SINGLE_HOST: "1", MEDIA_MEETINGS: "persistent", MEDIA_STATE_PATH: state, MEDIA_NAMESPACE: "prodfake", LIVEKIT_URL: "wss://example.invalid", LIVEKIT_API_KEY: "test", LIVEKIT_API_SECRET: "test", DAILY_DOMAIN: "campus-test", DAILY_API_KEY: "test", CLOUDFLARE_SFU_APP_ID: "a".repeat(20), CLOUDFLARE_SFU_SECRET: "s".repeat(32), CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_ANALYTICS_TOKEN: "test", CLOUDFLARE_BUDGET_BYTES: "1000000000", CLOUDFLARE_WATCHDOG_URL: "https://example.invalid", CLOUDFLARE_WATCHDOG_TOKEN: "w".repeat(32) };
  let child;
  t.after(() => child?.kill("SIGKILL"));
  async function start() {
    child = spawn(process.execPath, ["app.js"], { env, stdio: "ignore" });
    for (let i = 0; i < 150; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 50)); }
    throw new Error("server_not_ready");
  }
  async function connect() {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: env.CAMPUS_PUBLIC_ORIGIN }), messages = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString()))); await once(socket, "open");
    socket.send(JSON.stringify({ t: "p", p: { f: 12, x: 37, y: 2 } }));
    let seq = 0;
    const request = async (type, data) => {
      const id = `r${++seq}`; socket.send(JSON.stringify({ t: type, id, ...data }));
      for (let i = 0; i < 300; i++) { const at = messages.findIndex((m) => m.id === id); if (at !== -1) return messages.splice(at, 1)[0]; await new Promise((r) => setTimeout(r, 10)); }
      throw new Error("reply_timeout");
    };
    return { socket, meeting: (op, data) => request("media:meeting", { op, data }), voice: (area) => request("media:join", { area }) };
  }
  await start(); const first = await connect();
  const room = (await first.meeting("create", { title: "재시작 시험", locked: true, password: "test1234" })).result;
  assert.ok(room?.id); first.socket.close(); await once(first.socket, "close"); child.kill("SIGTERM"); await once(child, "exit");
  await start(); const second = await connect(); t.after(() => second.socket.terminate());
  assert.ok((await second.meeting("list", {})).result.some((item) => item.id === room.id));
  assert.equal((await second.meeting("join", { id: room.id, password: "wrong123" })).error, "meeting_password_invalid");
  assert.equal((await second.meeting("join", { id: room.id, password: "test1234" })).result.id, room.id);
  second.socket.close(); await once(second.socket, "close"); child.kill("SIGTERM"); await once(child, "exit");

  const db = openDurableMediaState(state);
  // 운영에서 허용하는 세 제공자를 모두 소진한 상태를 만든다.
  while (db.state().phase === "active") {
    const current = db.state(), transition = db.beginSwitch({ provider: current.provider, generation: current.generation });
    db.completeCleanup({ transitionId: transition.id });
  }
  db.close();
  await start(); const third = await connect(); t.after(() => third.socket.terminate());
  assert.equal((await third.meeting("create", { title: "한도 시험", locked: false, password: "" })).error, "media_unavailable");
  assert.equal((await third.meeting("join", { id: room.id, password: "test1234" })).error, "media_unavailable");
  third.socket.send(JSON.stringify({ t: "p", p: { f: 12, x: 2, y: 2 } }));
  assert.equal((await third.voice("12:open")).error, "media_unavailable");
  third.socket.close(); await once(third.socket, "close"); child.kill("SIGTERM"); await once(child, "exit");
});
