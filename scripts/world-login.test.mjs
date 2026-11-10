// 14층 릴레이 만화와 노래·드라마 맞추기: 하루들에 로그인해야 쓰고, 내가 그린 글만 올리고, 올린 사람만 내린다(비밀번호 없음)
// 하루들 피드 API는 이 시험이 띄운 가짜 서버가 대신한다. 로그인 사용자는 요청 머리글(x-test-user)로 흉내 낸다
import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRelayHandler } from "../world/server/relay.ts";
import { createQuizzesHandler } from "../world/server/quizzes.ts";

const ALICE = "6d64421d-6a44-48fa-b917-c1d20f5e5883";
const BOB = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const FEEDS = {
  "11111111-1111-4111-8111-111111111111": ALICE,
  "22222222-2222-4222-8222-222222222222": ALICE,
  "33333333-3333-4333-8333-333333333333": BOB,
};
const link = (id) => `https://www.harudle.com/feeds/${id}`;

async function listen(server) {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

async function setup() {
  const harudle = http.createServer((req, res) => {
    const id = /\/api\/v1\/feeds\/([0-9a-f-]+)$/.exec(req.url)?.[1];
    if (!id || !FEEDS[id]) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ imageUrl: `https://example.com/${id}.webp`, author: { id: FEEDS[id], nickname: FEEDS[id] === ALICE ? "앨리스" : "밥" }, category: { name: "이벤트" } }));
  });
  const dir = mkdtempSync(join(tmpdir(), "relay-"));
  const harudleBaseUrl = await listen(harudle);
  const userOf = async (req) => (req.headers["x-test-user"] ? { id: String(req.headers["x-test-user"]), nickname: req.headers["x-test-user"] === ALICE ? "앨리스" : "밥" } : null);
  const relay = createRelayHandler({ databasePath: join(dir, "relay.db"), isOriginAllowed: () => true, harudleBaseUrl, userOf });
  const quizzes = createQuizzesHandler({ databasePath: join(dir, "quizzes.db"), isOriginAllowed: () => true, harudleBaseUrl, userOf });
  const app = http.createServer((req, res) => { if (!relay.handle(req, res) && !quizzes.handle(req, res)) res.writeHead(404).end(); });
  const base = await listen(app);
  const call = async (path, { user, body } = {}) => {
    const response = await fetch(base + path, {
      method: body === undefined ? (/^\/(relay|quizzes)(\?|$)/.test(path) ? "GET" : "POST") : "POST",
      headers: { origin: "http://localhost:8080", ...(user ? { "x-test-user": user } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  };
  const close = () => { for (const s of [app, harudle]) { s.closeAllConnections(); s.close(); } relay.close(); quizzes.close(); rmSync(dir, { recursive: true, force: true }); };
  return { call, close };
}

test("로그인하지 않으면 올릴 수 없다", async () => {
  const { call, close } = await setup();
  try {
    const r = await call("/relay", { body: { shareUrl: link("11111111-1111-4111-8111-111111111111") } });
    assert.equal(r.status, 401); assert.equal(r.data.code, "login_required");
  } finally { close(); }
});

test("남이 그린 글은 올릴 수 없고, 내 글은 비밀번호 없이 여러 화 올린다", async () => {
  const { call, close } = await setup();
  try {
    const other = await call("/relay", { user: ALICE, body: { shareUrl: link("33333333-3333-4333-8333-333333333333") } });
    assert.equal(other.status, 403); assert.equal(other.data.code, "not_author");
    for (const id of ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]) {
      const r = await call("/relay", { user: ALICE, body: { shareUrl: link(id) } });
      assert.equal(r.status, 201);
    }
    const list = await call("/relay", { user: ALICE });
    assert.deepEqual(list.data.items.map((e) => [e.number, e.mine]), [[1, true], [2, true]]);
    const asBob = await call("/relay", { user: BOB });
    assert.deepEqual(asBob.data.items.map((e) => e.mine), [false, false]);
  } finally { close(); }
});

test("올린 사람만 내린다", async () => {
  const { call, close } = await setup();
  try {
    await call("/relay", { user: ALICE, body: { shareUrl: link("11111111-1111-4111-8111-111111111111") } });
    const [episode] = (await call("/relay")).data.items;
    assert.equal((await call(`/relay/${episode.id}/remove`)).status, 401);
    assert.equal((await call(`/relay/${episode.id}/remove`, { user: BOB })).status, 403);
    assert.equal((await call(`/relay/${episode.id}/remove`, { user: ALICE })).status, 204);
    assert.equal((await call("/relay")).data.items.length, 0);
  } finally { close(); }
});

test("퀴즈: 로그인해야 풀고 걸고, 내가 그린 글로만 걸고, 건 사람만 내린다", async () => {
  const { call, close } = await setup();
  try {
    const quiz = (id) => ({ room: "song", shareUrl: link(id), answer: "아리랑", hint: "" });
    assert.equal((await call("/quizzes", { body: quiz("11111111-1111-4111-8111-111111111111") })).status, 401);
    const other = await call("/quizzes", { user: ALICE, body: quiz("33333333-3333-4333-8333-333333333333") });
    assert.equal(other.status, 403); assert.equal(other.data.code, "not_author");
    const made = await call("/quizzes", { user: ALICE, body: quiz("11111111-1111-4111-8111-111111111111") });
    assert.equal(made.status, 201); assert.equal(made.data.quiz.mine, true);
    const id = made.data.quiz.id;
    assert.equal((await call(`/quizzes/${id}/answer`, { body: { answer: "아리랑" } })).status, 401);
    const solved = await call(`/quizzes/${id}/answer`, { user: BOB, body: { answer: "아리랑" } });
    assert.equal(solved.data.correct, true); assert.deepEqual(solved.data.solvers, ["밥"]);
    assert.deepEqual((await call("/quizzes?room=song", { user: BOB })).data.items.map((q) => q.mine), [false]);
    assert.equal((await call(`/quizzes/${id}/remove`, { user: BOB })).status, 403);
    assert.equal((await call(`/quizzes/${id}/remove`, { user: ALICE })).status, 204);
  } finally { close(); }
});
