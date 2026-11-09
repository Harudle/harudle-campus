// 개인 메시지 주소: 비밀 uid는 서버 밖으로 나가지 않고, 공개 주소만으로는 남의 개인 메시지를 받을 수 없다
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import WebSocket from "ws";

const pubOf = (secret) => `p_${createHash("sha256").update(`harudle-campus:${secret}`).digest("hex").slice(0, 16)}`;

async function startApp(t, seed) {
  const dir = mkdtempSync(join(tmpdir(), "wm-dm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (seed) writeFileSync(join(dir, "harudle-chat.json"), JSON.stringify(seed));
  const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve));
  const child = spawn(process.execPath, ["app.js"], { env: { ...process.env, TMPDIR: dir, CAMPUS_BIND_HOST: "127.0.0.1", PORT: String(port) }, stdio: "ignore" });
  t.after(() => child.kill("SIGKILL"));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 50)); }
  return async function connect(secret) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`), messages = [], raw = [];
    socket.on("message", (data) => { raw.push(data.toString()); messages.push(JSON.parse(data.toString())); });
    await once(socket, "open"); t.after(() => socket.terminate());
    socket.send(JSON.stringify({ t: "id", u: secret })); socket.send(JSON.stringify({ t: "p", p: { f: 11, x: 30, y: 16 } }));
    const wait = async (predicate, timeout = 3000) => {
      const until = Date.now() + timeout;
      while (Date.now() < until) { const i = messages.findIndex(predicate); if (i !== -1) return messages.splice(i, 1)[0]; await new Promise((r) => setTimeout(r, 10)); }
      return null;
    };
    const send = (m) => socket.send(JSON.stringify(m));
    return { wait, send, raw };
  }
}

test("공개 주소로 접속해도 남의 개인 메시지를 받을 수 없다", async (t) => {
  const connect = await startApp(t);
  const sa = "secret-alpha-0123456789abcdef", sb = "secret-bravo-0123456789abcdef";
  const a = await connect(sa), b = await connect(sb);
  assert.equal((await a.wait((m) => m.t === "me"))?.u, pubOf(sa));
  const bPub = (await b.wait((m) => m.t === "me"))?.u;
  assert.equal(bPub, pubOf(sb));

  // 접속자 목록에는 공개 주소만 나간다
  const peers = await a.wait((m) => m.t === "peers" && m.peers.length === 2);
  assert.ok(peers, "접속자 목록을 받지 못함");
  assert.deepEqual(peers.peers.map((p) => p.u).sort(), [pubOf(sa), pubOf(sb)].sort());

  a.send({ t: "chat", k: "dm", to: bPub, text: "둘만 아는 이야기" });
  const got = await b.wait((m) => m.t === "chat" && m.text === "둘만 아는 이야기");
  assert.equal(got?.from?.u, pubOf(sa));

  // 공격자: 목록에서 본 B의 공개 주소를 자기 uid로 보낸다
  const c = await connect(bPub);
  const history = await c.wait((m) => m.t === "chat" && m.k === "history");
  assert.ok(history, "기록 응답이 없음");
  assert.equal(history.dm.length, 0);

  // 이젤: 보낸 u와 비밀이 든 획 id를 믿지 않는다
  a.send({ t: "ez", b: "easel", k: "seg", u: sb, id: `${sa}-x-0`, c: "#111118", w: 6, p: [1, 1, 2, 2] });
  const seg = await b.wait((m) => m.t === "ez" && m.k === "seg");
  assert.equal(seg?.u, pubOf(sa));
  assert.ok(seg.id.startsWith(`${pubOf(sa)}-`));

  for (const s of [...a.raw, ...b.raw, ...c.raw]) for (const secret of [sa, sb]) assert.ok(!s.includes(secret), "비밀 uid가 밖으로 나감");
});

test("예전 기록의 비밀 uid는 공개 주소로 바뀐다", async (t) => {
  const la = "legacyalpha", lb = "legacybravo";
  const msg = { id: "1", k: "dm", text: "예전 메시지", at: 1, to: lb, from: { u: la, peer: "p1", name: "가", f: 11 } };
  const connect = await startApp(t, { all: [{ ...msg, k: "all", to: undefined }], dm: { [`${la}|${lb}`]: [msg] } });
  const owner = await connect(lb);
  const history = await owner.wait((m) => m.t === "chat" && m.k === "history");
  assert.equal(history?.dm.length, 1);
  assert.equal(history.dm[0].from.u, pubOf(la));
  assert.equal(history.dm[0].to, pubOf(lb));
  assert.ok(!owner.raw.join("").includes(la), "예전 비밀 uid가 기록에 남음");
  const stranger = await connect(pubOf(lb));
  assert.equal((await stranger.wait((m) => m.t === "chat" && m.k === "history"))?.dm.length, 0);
});
