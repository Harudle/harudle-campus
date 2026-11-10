import assert from "node:assert/strict";
import { test } from "node:test";
import { createDuel } from "../server/duel/index.js";
import { DUEL } from "../src/duel/shared.mjs";
import { BOX, BOX_RING, BOX_ARENA } from "../src/duel/arena/box.mjs";
import { reach } from "../server/duel/games/box.js";

// 가짜 접속자 · 시계로 복싱 경기를 돌린다(scripts/duel.test.mjs와 같은 틀)
const UA = "p_aaaaaaaaaaaaaaaa", UB = "p_bbbbbbbbbbbbbbbb", UC = "p_cccccccccccccccc";
function bout() {
  let t = 1_000_000;
  const peers = new Map(), sent = [];
  for (const [id, uid, name] of [["pa", UA, "에이"], ["pb", UB, "비"], ["pc", UC, "씨"]]) peers.set(id, { uid, name, presence: null });
  const duel = createDuel({ peers, send: (pid, msg) => sent.push({ pid, ...msg }), now: () => t, random: () => 0, store: { load: () => null, save() { } } });
  const advance = (ms) => { const end = t + ms; while (t < end) { t = Math.min(end, t + DUEL.TICK); duel.tick(); } };
  duel.message("pa", { t: "duel:invite", to: "pb", game: "box" });
  const inv = sent.filter((m) => m.pid === "pb" && m.t === "duel:invited").at(-1);
  duel.message("pb", { t: "duel:answer", id: inv.id, ok: true });
  const m = duel.matchOf(UA); advance(DUEL.MOVE + DUEL.COUNTDOWN + 100);
  const at = (pid, x, y, h = 0) => duel.presence(pid, { f: 24, x, y, h });
  const game = (pid, p) => duel.message(pid, { t: "duel:game", id: m.id, ...p });
  const punch = (pid, kind) => game(pid, { k: "punch", kind });
  const last = (pid, t2) => sent.filter((x) => x.pid === pid && x.t === t2).at(-1);
  const games = (pid) => sent.filter((x) => x.pid === pid && x.t === "duel:game");
  return { duel, m, sent, advance, at, game, punch, last, games, now: () => t };
}
const E = Math.PI / 2, W = -Math.PI / 2;

test("복싱: 링 · 선수 자리 · 관전 자리", () => {
  assert.equal(BOX_ARENA.f, 24); assert.deepEqual(BOX_RING, { x: 25, y: 17, w: 6, h: 6 });
  const inRing = ([x, y]) => x > BOX_RING.x && x < BOX_RING.x + BOX_RING.w && y > BOX_RING.y && y < BOX_RING.y + BOX_RING.h;
  assert.ok(BOX_ARENA.spawns.every(inRing), "선수는 링 안에서 시작"); assert.ok(BOX_ARENA.watch.every((w) => !inRing(w)), "관전 자리는 링 밖");
  const [a, b] = BOX_ARENA.spawns;
  assert.ok(reach({ f: 24, x: b[0], y: b[1], h: b[2] }, { f: 24, x: b[0] + Math.sin(b[2]), y: b[1] + Math.cos(b[2]) }, 24), "선수 방향은 상대 쪽");
  assert.ok(Math.abs(Math.atan2(b[0] - a[0], b[1] - a[1]) - a[2]) < 1e-9);
});

test("복싱: 거리 · 앞쪽 60도 판정", () => {
  const me = { f: 24, x: 27, y: 20, h: E };
  assert.ok(reach(me, { f: 24, x: 28.2, y: 20 }, 24)); assert.ok(!reach(me, { f: 24, x: 28.4, y: 20 }, 24), "1.3칸 넘으면 안 닿는다");
  assert.ok(reach(me, { f: 24, x: 27 + Math.cos(Math.PI / 3 - .01), y: 20 + Math.sin(Math.PI / 3 - .01) }, 24), "60도 안");
  assert.ok(!reach(me, { f: 24, x: 27 + Math.cos(Math.PI / 3 + .05), y: 20 + Math.sin(Math.PI / 3 + .05) }, 24), "60도 밖");
  assert.ok(!reach(me, { f: 24, x: 26, y: 20 }, 24), "뒤"); assert.ok(!reach(me, { f: 23, x: 28, y: 20 }, 24), "다른 층");
});

test("복싱: 앞에 있는 상대에게 잽 8 · 스트레이트 14", () => {
  const s = bout(); assert.equal(s.m.phase, "playing"); assert.deepEqual(s.m.state.hp, [100, 100]);
  s.at("pa", 27, 20, E); s.at("pb", 28, 20, W);
  s.punch("pa", "jab");
  const p = s.last("pb", "duel:game"); assert.equal(p.k, "punch"); assert.equal(p.seat, 0); assert.equal(p.hit, 1); assert.equal(p.dmg, 8); assert.deepEqual(p.hp, [100, 92]);
  assert.equal(s.last("pc", "duel:game"), undefined, "관전자가 아니면 받지 않는다");
  s.advance(200); s.punch("pa", "str"); assert.deepEqual(s.m.state.hp, [100, 78]);
  s.punch("pb", "str"); assert.deepEqual(s.m.state.hp, [86, 78], "상대도 나를 보고 있으면 맞힌다");
});

test("복싱: 멀거나 뒤에 있으면 헛손질(모두에게 보인다), 너무 빠르면 없던 일", () => {
  const s = bout();
  s.at("pa", 27, 20, E); s.at("pb", 29, 20, W);
  s.punch("pa", "jab"); let p = s.last("pb", "duel:game"); assert.equal(p.hit, 0); assert.equal(p.kind, "jab"); assert.deepEqual(s.m.state.hp, [100, 100]);
  s.advance(400); s.at("pa", 27, 20, W); s.at("pb", 28, 20, W);
  s.punch("pa", "jab"); assert.equal(s.last("pb", "duel:game").hit, 0, "등 뒤"); assert.deepEqual(s.m.state.hp, [100, 100]);
  s.advance(400); s.at("pa", 27, 20, E);
  s.punch("pa", "jab"); assert.deepEqual(s.m.state.hp, [100, 92]);
  const n = s.games("pb").length;
  s.advance(100); s.punch("pa", "jab"); assert.deepEqual(s.m.state.hp, [100, 92], "잽은 0.35초 간격"); assert.equal(s.games("pb").length, n, "간격을 어기면 아무것도 보내지 않는다");
  s.advance(100); s.punch("pa", "str"); assert.deepEqual(s.m.state.hp, [100, 78], "잽 · 스트레이트 간격은 따로");
  s.advance(300); s.punch("pa", "str"); assert.deepEqual(s.m.state.hp, [100, 78], "스트레이트는 0.7초 간격");
  s.advance(400); s.punch("pa", "str"); assert.deepEqual(s.m.state.hp, [100, 64]);
  s.punch("pa", "jab"); assert.deepEqual(s.m.state.hp, [100, 64], "주먹 사이 최소 간격");
  s.punch("pa", "hook"); s.game("pa", { k: "hit", dmg: 99 }); assert.deepEqual(s.m.state.hp, [100, 64], "모르는 주먹 · 메시지는 무시");
});

test("복싱: 상대의 조금 전 위치(0.4초)까지 봐준다", () => {
  const s = bout();
  s.at("pa", 27, 20, E); s.at("pb", 28, 20, W); s.advance(300); s.at("pb", 31, 20, W);
  s.punch("pa", "jab"); assert.deepEqual(s.m.state.hp, [100, 92]);
  s.advance(600); s.at("pb", 31, 20, W); s.punch("pa", "jab"); assert.deepEqual(s.m.state.hp, [100, 92], "오래전 위치는 안 본다");
});

test("복싱: 가드는 받는 데미지를 30%로, 가드 중엔 못 친다", () => {
  const s = bout();
  s.at("pa", 27, 20, E); s.at("pb", 28, 20, W);
  s.game("pb", { k: "guard", on: true }); assert.deepEqual(s.m.state.guard, [0, 1]);
  const g = s.last("pa", "duel:game"); assert.equal(g.k, "guard"); assert.equal(g.seat, 1); assert.equal(g.on, 1);
  s.punch("pa", "jab"); assert.deepEqual(s.m.state.hp, [100, 97.6]); assert.equal(s.last("pb", "duel:game").g, 1);
  s.advance(200); s.punch("pa", "str"); assert.deepEqual(s.m.state.hp, [100, 93.4]);
  s.punch("pb", "jab"); assert.deepEqual(s.m.state.hp, [100, 93.4], "가드 중엔 못 친다");
  const n = s.games("pa").length; s.game("pb", { k: "guard", on: true }); assert.equal(s.games("pa").length, n, "같은 가드는 다시 알리지 않는다");
  s.game("pb", { k: "guard", on: false }); s.advance(400); s.punch("pa", "jab"); assert.deepEqual(s.m.state.hp, [100, 85.4]);
});

test("복싱: 체력이 0이면 KO로 끝난다", () => {
  const s = bout();
  s.at("pa", 27, 20, E); s.at("pb", 28, 20, W);
  for (let i = 0; i < 20 && s.m.phase === "playing"; i++) { s.punch("pa", "jab"); s.advance(400); }
  assert.equal(s.m.state.hp[1], 0); assert.equal(s.m.phase, "result");
  const end = s.last("pb", "duel:end"); assert.equal(end.reason, "ko"); assert.equal(end.winner, UA); assert.deepEqual(end.summary.hp, [100, 0]); assert.equal(end.summary.kind, "jab");
  assert.equal(s.duel.records.users[UA].w, 1); assert.equal(s.duel.records.users[UB].l, 1);
  s.punch("pa", "jab"); assert.equal(s.m.state.hp[1], 0, "끝난 뒤 주먹은 무시");
});

test("복싱: 3분이 다 되면 체력이 많은 쪽, 같으면 무승부", () => {
  const s = bout();
  s.at("pa", 27, 20, E); s.at("pb", 28, 20, W); s.punch("pb", "jab");
  s.advance(179000); assert.equal(s.m.phase, "playing");
  s.advance(1200); const end = s.last("pa", "duel:end"); assert.equal(end.reason, "timeout"); assert.equal(end.winner, UB); assert.deepEqual(end.summary.hp, [92, 100]);
  const d = bout(); d.advance(180100);
  const e2 = d.last("pb", "duel:end"); assert.equal(e2.reason, "timeout"); assert.equal(e2.winner, null); assert.equal(d.duel.records.users[UA].d, 1);
});

test("복싱: 관전자는 주먹도 가드도 못 한다", () => {
  const s = bout();
  s.duel.message("pc", { t: "duel:watch", peer: "pa" }); assert.equal(s.last("pc", "duel:match").seat, null);
  s.at("pa", 27, 20, E); s.at("pb", 28, 20, W);
  s.duel.presence("pc", { f: 24, x: 27.5, y: 20, h: E });
  s.game("pc", { k: "punch", kind: "str" }); s.game("pc", { k: "guard", on: true });
  assert.deepEqual(s.m.state.hp, [100, 100]); assert.deepEqual(s.m.state.guard, [0, 0]); assert.equal(s.games("pa").length, 0);
  s.punch("pa", "jab"); assert.equal(s.last("pc", "duel:game").hit, 1, "관전자도 주먹을 본다");
});

test("복싱: 표에 없는 펀치 종류(constructor 같은 이름)는 없던 일", () => {
  const b = bout(); b.at("pa", 27.5, 20, E); b.at("pb", 28.5, 20, W);
  for (const kind of ["constructor", "toString", "__proto__", "hasOwnProperty"]) b.punch("pa", kind);
  assert.deepEqual(b.m.state.hp, [BOX.HP, BOX.HP]);
  b.punch("pa", "jab"); assert.equal(b.m.state.hp[1], BOX.HP - BOX.PUNCH.jab.dmg, "진짜 잽은 그대로 들어간다");
});

