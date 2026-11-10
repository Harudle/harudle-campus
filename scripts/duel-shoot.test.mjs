import assert from "node:assert/strict";
import { test } from "node:test";
import { createDuel } from "../server/duel/index.js";
import { DUEL } from "../src/duel/shared.mjs";
import { SHOOT, SHOOT_ARENA, SHOOT_COVER, SHOOT_FIELD } from "../src/duel/arena/shoot.mjs";
import { judge } from "../server/duel/games/shoot.js";

// 가짜 접속자 · 시계로 사격 대결을 돌린다(scripts/duel.test.mjs와 같은 틀)
const UA = "p_aaaaaaaaaaaaaaaa", UB = "p_bbbbbbbbbbbbbbbb", UC = "p_cccccccccccccccc";
const E = Math.PI / 2, W = -Math.PI / 2;
function setup() {
  let t = 1_000_000;
  const peers = new Map(), sent = [];
  for (const [id, uid, name] of [["pa", UA, "에이"], ["pb", UB, "비"], ["pc", UC, "씨"]]) peers.set(id, { uid, name, presence: null });
  const duel = createDuel({ peers, send: (pid, msg) => sent.push({ pid, ...msg }), now: () => t, random: () => 0, store: { load: () => null, save() { } } });
  const last = (pid, type, k) => sent.filter((m) => m.pid === pid && m.t === type && (!k || m.k === k)).at(-1);
  const advance = (ms) => { const end = t + ms; while (t < end) { t = Math.min(end, t + DUEL.TICK); duel.tick(); } };
  duel.message("pa", { t: "duel:invite", to: "pb", game: "shoot" });
  duel.message("pb", { t: "duel:answer", id: last("pb", "duel:invited").id, ok: true });
  const m = duel.matchOf(UA);
  advance(DUEL.MOVE + DUEL.COUNTDOWN + 100);
  const fc = { pa: 0, pb: 0 };
  // 위치 보내기(엔진 sendPresence처럼 fk · fc · fh를 늘 같이). 쏘면 fc가 하나 늘고 fh가 방향
  const pos = (pid, x, y, o = {}) => duel.presence(pid, { f: 22, x, y, u: 0, fk: 1, fc: fc[pid], fh: o.fh ?? 0, ...o });
  const fire = (pid, x, y, dir) => { fc[pid]++; pos(pid, x, y, { fh: dir }); return t; };
  const hit = (pid, p) => duel.message(pid, { t: "duel:game", id: m.id, k: "hit", lift: 0, ...p });
  // 정석 한 발: a(20, 13.5)가 동쪽 b(28, 13.5)를 쏘고, 총알이 닿을 무렵 b가 그 자리에 있다
  // b가 쏠 때는 자리를 바꿔 서쪽으로 쏜다. 돌려주는 것: 이번 발에 서버가 보낸 miss(받았으면 undefined)
  const shot = (from = "pa", { sx = from === "pa" ? 20 : 28, sy = 13.5, tx = from === "pa" ? 28 : 20, ty = 13.5, dir = from === "pa" ? E : W, to = from === "pa" ? 1 : 0, ...o } = {}) => {
    const foe = from === "pa" ? "pb" : "pa";
    advance(300); pos(foe, tx, ty);
    const at = fire(from, sx, sy, dir);
    advance(200); pos(foe, tx, ty); advance(200); pos(foe, tx, ty);
    const n = sent.length; hit(from, { to, dir, at, ...o });
    return sent.slice(n).find((m) => m.pid === from && m.k === "miss");
  };
  return { duel, m, sent, last, advance, pos, fire, hit, shot, now: () => t, set: (v) => { t = v; } };
}

test("사격: 신청하면 22층 사격장에서 첫 라운드가 시작되고 체력은 100", () => {
  const s = setup();
  assert.equal(s.m.floor, 22); assert.equal(s.m.phase, "playing");
  assert.deepEqual(s.m.state.hp, [SHOOT.HP, SHOOT.HP]); assert.equal(s.m.state.phase, "go"); assert.equal(s.m.state.round, 1);
  assert.equal(s.m.endsAt, s.m.state.at + SHOOT.ROUND, "남은 시간은 라운드 시간");
  assert.deepEqual(s.last("pa", "duel:match").spawns, SHOOT_ARENA.spawns);
});

test("사격: 말이 되는 명중은 받아 체력 20을 깎고 모두에게 알린다", () => {
  const s = setup();
  assert.equal(s.shot(), undefined, "miss가 없다");
  assert.deepEqual(s.m.state.hp, [100, 80]);
  const h = s.last("pc", "duel:game", "hit") || s.last("pb", "duel:game", "hit"); assert.equal(h.seat, 0); assert.equal(h.to, 1); assert.deepEqual(h.hp, [100, 80]);
  assert.equal(s.last("pb", "duel:match").state.hp[1], 80, "duel:match로도 바뀐 체력이 간다");
  s.shot("pb"); assert.deepEqual(s.m.state.hp, [80, 80], "반대쪽도 똑같이");
  s.shot("pa", { sx: 20.3, sy: 13.9, tx: 27.6, ty: 12.8 }); assert.deepEqual(s.m.state.hp, [80, 60], "조금 비껴 서 있어도(1칸 안) 받는다");
});

test("사격: 거리 밖 · 뒤쪽 · 옆으로 크게 빗나감 · 엄폐물 너머는 받지 않는다", () => {
  const s = setup();
  assert.equal(s.shot("pa", { sx: 19, tx: 37 }).why, "far", "18칸은 너무 멀다");
  assert.equal(s.shot("pa", { dir: W }).why, "behind", "상대가 등 뒤");
  assert.equal(s.shot("pa", { dir: E + .5 }).why, "aim", "방향이 크게 다르다");
  assert.equal(s.shot("pa", { sx: 20, sy: 15.5, tx: 26, ty: 15.5 }).why, "cover", "가운데 왼쪽 종이벽(23, 14~16) 너머");
  assert.equal(s.shot("pa", { sx: 20, sy: 15.5, tx: 26, ty: 15.5, lift: 1 }), undefined, "높이 뛰어 쏘면 엄폐물을 넘어간다");
  assert.deepEqual(s.m.state.hp, [100, 80]);
});

test("사격: 너무 빠른 연사 · 같은 발 두 번 · 쏜 적 없는 발 · 나 자신 · 관전자는 받지 않는다", () => {
  const s = setup();
  s.advance(300); s.pos("pb", 28, 13.5);
  const a1 = s.fire("pa", 20, 13.5, E); s.advance(100); const a2 = s.fire("pa", 20, 13.5, E); s.advance(200); s.pos("pb", 28, 13.5);
  s.hit("pa", { to: 1, dir: E, at: a1 }); assert.deepEqual(s.m.state.hp, [100, 80]);
  s.hit("pa", { to: 1, dir: E, at: a2 }); assert.equal(s.last("pa", "duel:game", "miss").why, "fast", "0.1초 뒤 발은 받지 않는다");
  s.hit("pa", { to: 1, dir: E, at: a2 + 200 }); assert.equal(s.last("pa", "duel:game", "miss").why, "fast", "쏜 시각을 꾸며도 서버에 닿은 간격으로 걸린다");
  s.advance(400); s.pos("pb", 28, 13.5); s.hit("pa", { to: 1, dir: E, at: s.now() - 100 }); assert.equal(s.last("pa", "duel:game", "miss").why, "shot", "위치 기록에 쏜 흔적이 없다");
  s.advance(300); const a3 = s.fire("pa", 20, 13.5, E); s.advance(200); s.pos("pb", 28, 13.5);
  s.hit("pa", { to: 1, dir: E, at: a3 }); assert.deepEqual(s.m.state.hp, [100, 60]);
  s.advance(300); s.hit("pa", { to: 1, dir: E, at: a3 + 300 }); assert.equal(s.last("pa", "duel:game", "miss").why, "shot", "이미 쓴 발을 다시 쓸 수 없다");
  assert.equal(s.shot("pa", { to: 0 }).why, "self", "나 자신은 못 맞힌다");
  assert.equal(s.shot("pa", { at: s.now() + 5000 }).why, "late", "앞날 시각");
  s.duel.message("pc", { t: "duel:watch", peer: "pa" }); assert.equal(s.duel.matchOf(UC), s.m);
  s.advance(300); s.duel.presence("pc", { f: 22, x: 20, y: 13.5, fk: 1, fc: 9, fh: E });
  s.duel.message("pc", { t: "duel:game", id: s.m.id, k: "hit", to: 1, dir: E, at: s.now(), lift: 0 });
  s.duel.message("pc", { t: "duel:game", id: s.m.id, k: "hit", to: 0, dir: E, at: s.now(), lift: 0 });
  assert.deepEqual(s.m.state.hp, [100, 60], "관전자는 경기에 영향을 못 준다");
});

test("사격: 판정 함수는 시각이 안 맞는 상대 위치(쏘고 한참 뒤)를 쓰지 않는다", () => {
  const s = setup();
  s.advance(300); s.pos("pb", 40, 30);
  const at = s.fire("pa", 20, 13.5, E); s.advance(1500); s.pos("pb", 28, 13.5);   // 쏜 지 1.5초 뒤에야 그 자리에 온다(총알은 0.5초면 닿는다)
  const r = judge(s.m, 0, { k: "hit", to: 1, dir: E, at, lift: 0 }, s.duel.api);
  assert.ok(!r.shot, `받으면 안 된다: ${r.why}`);
});

test("사격: 다섯 발이면 KO로 라운드를 가져가고, 체력이 차서 3·2·1 뒤 다음 라운드. 두 라운드를 먼저 이기면 승리", () => {
  const s = setup();
  for (let i = 0; i < 5; i++) assert.equal(s.shot(), undefined);
  assert.deepEqual(s.m.state.wins, [1, 0]); assert.equal(s.m.state.round, 2); assert.equal(s.m.state.phase, "ready");
  assert.deepEqual(s.m.state.hp, [100, 100], "라운드마다 체력이 다시 찬다");
  const r = s.last("pb", "duel:game", "round"); assert.equal(r.seat, 0); assert.equal(r.why, "ko"); assert.deepEqual(r.wins, [1, 0]);
  assert.equal(s.shot().why, "round", "3·2·1 동안은 맞힘을 받지 않는다");
  s.advance(SHOOT.READY); assert.equal(s.m.state.phase, "go"); assert.equal(s.m.endsAt, s.m.state.at + SHOOT.ROUND);
  for (let i = 0; i < 5; i++) s.shot("pb");
  assert.deepEqual(s.m.state.wins, [1, 1]); assert.equal(s.m.state.round, 3);
  s.advance(SHOOT.READY);
  for (let i = 0; i < 5; i++) s.shot("pa");
  assert.equal(s.m.phase, "result");
  const end = s.last("pb", "duel:end"); assert.equal(end.winner, UA); assert.equal(end.reason, "ko"); assert.deepEqual(end.summary.wins, [2, 1]);
  assert.equal(s.duel.records.users[UA].w, 1); assert.equal(s.duel.records.users[UB].l, 1);
});

test("사격: 90초가 지나면 체력이 많은 쪽이 라운드를 가져가고, 같으면 그 라운드를 다시 한다", () => {
  const s = setup();
  s.shot();   // b 80
  s.advance(SHOOT.ROUND);
  assert.deepEqual(s.m.state.wins, [1, 0]); assert.equal(s.last("pa", "duel:game", "round").why, "time"); assert.equal(s.m.state.round, 2);
  s.advance(SHOOT.READY + SHOOT.ROUND);
  assert.deepEqual(s.m.state.wins, [1, 0], "체력이 같으면 아무도 못 가져간다"); assert.equal(s.m.state.round, 2); assert.equal(s.m.state.again, true);
  assert.equal(s.last("pa", "duel:game", "round").why, "tie"); assert.equal(s.m.phase, "playing");
  s.advance(SHOOT.READY); s.shot("pa"); s.advance(SHOOT.ROUND);
  assert.equal(s.m.phase, "result"); const end = s.last("pa", "duel:end"); assert.equal(end.winner, UA); assert.equal(end.reason, "timeout");
});

test("사격: 비기는 판만 이어지면 정한 판 수에서 라운드 수로 끝낸다(같으면 무승부)", () => {
  const s = setup();
  for (let i = 0; i < SHOOT.MAX_ROUNDS; i++) s.advance(SHOOT.READY + SHOOT.ROUND + 100);
  assert.equal(s.m.phase, "result"); const end = s.last("pa", "duel:end"); assert.equal(end.winner, null); assert.equal(end.summary.rounds, SHOOT.MAX_ROUNDS);
  assert.equal(s.duel.records.users[UA].d, 1);
});

test("사격장 배치: 엄폐물은 경기장 안에 겹치지 않고, 선수 자리 · 관전 자리는 막히지 않았다", () => {
  const inField = (x, y) => x >= SHOOT_FIELD.x && x < SHOOT_FIELD.x + SHOOT_FIELD.w && y >= SHOOT_FIELD.y && y < SHOOT_FIELD.y + SHOOT_FIELD.h;
  const cells = new Set();
  for (const c of SHOOT_COVER) for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) {
    assert.ok(inField(x, y), `엄폐물 (${x}, ${y})는 경기장 안`); assert.ok(!cells.has(`${x},${y}`), `(${x}, ${y}) 겹침`); cells.add(`${x},${y}`);
  }
  for (const [x, y] of SHOOT_ARENA.spawns) { assert.ok(inField(x, y)); assert.ok(!cells.has(`${Math.floor(x)},${Math.floor(y)}`)); }
  for (const [x, y] of SHOOT_ARENA.watch) assert.ok(!inField(x, y), "관전 자리는 경기장 밖");
  const [a, b] = SHOOT_ARENA.spawns; assert.equal(a[0] + b[0], SHOOT_FIELD.x * 2 + SHOOT_FIELD.w); assert.equal(a[1] + b[1], SHOOT_FIELD.y * 2 + SHOOT_FIELD.h, "두 자리는 가운데를 두고 마주 본다");
});
