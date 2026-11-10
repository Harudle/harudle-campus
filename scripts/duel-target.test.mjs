import assert from "node:assert/strict";
import { test } from "node:test";
import { createDuel } from "../server/duel/index.js";
import { DUEL } from "../src/duel/shared.mjs";
import { TARGET, targetPlan, targetAt, targetSpeed, muzzle, shotHits } from "../src/duel/target-path.mjs";
import { TARGET_ARENA, TARGET_X } from "../src/duel/arena/target.mjs";

// 가짜 접속자 · 시계로 과녁 사격을 돌린다(scripts/duel.test.mjs와 같은 틀). 경기가 막 시작된 상태로 돌려준다
const UA = "p_aaaaaaaaaaaaaaaa", UB = "p_bbbbbbbbbbbbbbbb", UC = "p_cccccccccccccccc";
function setup(random = () => 0) {
  let t = 1_000_000;
  const peers = new Map(), sent = [];
  for (const [id, uid, name] of [["pa", UA, "에이"], ["pb", UB, "비"], ["pc", UC, "씨"]]) peers.set(id, { uid, name, presence: null });
  const duel = createDuel({ peers, send: (pid, msg) => sent.push({ pid, ...msg }), now: () => t, random, store: { load: () => null, save() { } } });
  const game = (pid, k) => sent.filter((m) => m.pid === pid && m.t === "duel:game" && (!k || m.k === k));
  const last = (pid, type) => sent.filter((m) => m.pid === pid && m.t === type).at(-1);
  const advance = (ms) => { const end = t + ms; while (t < end) { t = Math.min(end, t + DUEL.TICK); duel.tick(); } };
  duel.message("pa", { t: "duel:invite", to: "pb", game: "target" });
  duel.message("pb", { t: "duel:answer", id: last("pb", "duel:invited").id, ok: true });
  const m = duel.matchOf(UA);
  advance(DUEL.MOVE + DUEL.COUNTDOWN + 100);
  return { duel, m, sent, game, last, advance, now: () => t };
}
const SPOT = [[21, 21.5], [35, 21.5]], PID = ["pa", "pb"];
// 총알이 날아가는 동안 과녁이 움직이는 것까지 따라가 정확히 겨눈 방향
function aim(t, x, y, at) {
  let dir = 0;
  for (let i = 0; i < 8; i++) { const o = muzzle(x, y, dir), p0 = targetAt(t, at - t.at), p = targetAt(t, at + Math.hypot(p0.x - o.x, p0.y - o.y) / TARGET.BULLET * 1000 - t.at); dir = Math.atan2(p.x - o.x, p.y - o.y); }
  return dir;
}
// 지금 살아 있고 총알이 닿을 때까지 남아 있을 과녁들
const alive = (s) => s.m.target.plan.filter((t) => t.at <= s.now() && t.at + t.life - s.now() > 1200 && !s.m.target.taken.has(t.id));
// seat 자리 선수가 과녁 t를 쏴 맞혔다고 알린다. o: { from: 쏜 자리, stand: 서버가 받은 위치, at, skew: 방향 어긋남, pid }
function hit(s, seat, t, o = {}) {
  const [x, y] = o.from || SPOT[seat], at = o.at ?? s.now(), pid = o.pid || PID[seat];
  s.duel.presence(pid, { f: 23, x: (o.stand || [x, y])[0], y: (o.stand || [x, y])[1] });
  s.duel.message(pid, { t: "duel:game", id: s.m.id, k: "hit", tg: t.id, x, y, dir: aim(t, x, y, at) + (o.skew || 0), at });
}
const lastMiss = (s, seat) => s.game(PID[seat], "miss").at(-1);

test("과녁 일정: 같은 seed면 같고, 마당 안에서 움직이며, 금색은 드물고 빠르다", () => {
  const a = targetPlan(1234), b = targetPlan(1234), c = targetPlan(99);
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  for (const p of [a, c, targetPlan(7), targetPlan(0)]) {
    assert.ok(p.length >= 40 && p.length <= 110, `과녁 수 ${p.length}`);
    for (const t of p) {
      assert.ok(t.at >= 0 && t.at + t.life <= TARGET.DURATION - 300 && t.life >= 1500);
      for (let ms = 0; ms <= t.life; ms += 100) { const q = targetAt(t, ms); assert.ok(q.x >= TARGET_X[0] - .01 && q.x <= TARGET_X[1] + .01, `${t.id} x ${q.x}`); }
    }
    const gold = p.filter((t) => t.g), norm = p.filter((t) => !t.g), avg = (l) => l.reduce((s, t) => s + targetSpeed(t), 0) / l.length;
    assert.ok(gold.length >= 1 && gold.length < norm.length / 3, "금색은 드물다");
    assert.ok(avg(gold) > avg(norm) * 1.4, "금색은 빠르다");
  }
});

test("맞힘 셈: 정확히 겨누면 맞고, 많이 비껴가거나 과녁이 사라진 뒤면 안 맞는다", () => {
  const t = { ...targetPlan(5)[0], at: 0 }, at = 500, dir = aim(t, 21, 21.5, at);
  assert.ok(shotHits(t, 21, 21.5, dir, at)); assert.equal(shotHits(t, 21, 21.5, dir + .3, at), null);
  assert.equal(shotHits(t, 21, 21.5, aim(t, 21, 21.5, t.life + 400), t.life + 400), null);
});

test("서버는 같은 난수면 같은 일정을 만들고, 나오기 조금 전에 모두에게 알린다", () => {
  const s1 = setup(), s2 = setup(), s3 = setup(() => .5);
  assert.deepEqual(s1.m.target.plan, s2.m.target.plan); assert.notDeepEqual(s1.m.target.plan, s3.m.target.plan);
  assert.equal(s1.m.target.plan[0].at, s1.m.startAt + targetPlan(0)[0].at, "일정은 시작 시각 기준");
  const [first, , third] = s1.m.target.plan;
  assert.equal(s1.game("pa", "spawn")[0].tgt.id, first.id, "첫 과녁은 시작하자마자 알린다");
  s1.advance(third.at - s1.now() - TARGET.LEAD - 150); assert.equal(s1.game("pa", "spawn").length, 2);
  s1.advance(200); const sp = s1.game("pb", "spawn"); assert.equal(sp.length, 3);
  assert.equal(sp[2].tgt.id, third.id); assert.equal(sp[2].tgt.at, third.at); assert.equal(sp[2].tgt.x0, third.x0); assert.equal(sp[2].id, s1.m.id, "경기 id는 그대로");
  assert.deepEqual(s1.m.state.live.map((t) => t.id), [0, 1, 2], "관전 · 다시 접속용 live");
  s1.duel.message("pc", { t: "duel:watch", peer: "pa" }); assert.equal(s1.last("pc", "duel:match").state.live.length, 3, "관전자는 지금 과녁부터 받는다");
  s1.advance(6000); assert.ok(!s1.m.state.live.some((t) => t.id === first.id), "사라진 과녁은 live에서 빠진다");
  assert.deepEqual(TARGET_ARENA.spawns.map(([x, y]) => [x, y]), SPOT);
});

test("먼저 맞힌 사람만 점수를 받는다(보통 1 · 금색 3), 같은 과녁 두 번째는 받지 않는다", () => {
  const s = setup(); s.advance(3000);
  const t = alive(s)[0]; assert.ok(t, "살아 있는 과녁");
  hit(s, 0, t);
  const take = s.game("pb", "take").at(-1); assert.ok(take, "모두에게 take");
  assert.equal(take.tg, t.id); assert.equal(take.seat, 0); assert.equal(take.pts, t.g ? 3 : 1); assert.equal(take.id, s.m.id);
  assert.deepEqual(s.m.state.score, [t.g ? 3 : 1, 0]); assert.ok(!s.m.state.live.some((x) => x.id === t.id));
  s.advance(300); hit(s, 1, t);
  assert.equal(lastMiss(s, 1).why, "taken"); assert.deepEqual(s.m.state.score, [t.g ? 3 : 1, 0]);
  s.advance(300); hit(s, 0, t); assert.equal(lastMiss(s, 0).why, "taken");
  const gold = s.m.target.plan.find((x) => x.g && !s.m.target.taken.has(x.id));
  s.advance(gold.at + 300 - s.now()); hit(s, 1, gold);
  assert.equal(s.game("pa", "take").at(-1).pts, 3); assert.equal(s.m.state.score[1], 3); assert.equal(s.m.state.gold[1], 1);
});

test("아직 안 나온 과녁 · 사라진 과녁 · 엉뚱한 시각은 받지 않는다", () => {
  const s = setup(); s.advance(8000);
  const later = s.m.target.plan.find((t) => t.at - TARGET.LEAD > s.now() + 5000);
  hit(s, 0, later); assert.equal(lastMiss(s, 0).why, "early");
  const gone = s.m.target.plan.find((t) => t.at + t.life < s.now() - 200);
  s.advance(300); hit(s, 0, gone); assert.equal(lastMiss(s, 0).why, "aim", "사라진 뒤에 맞힐 수 없다");
  const t = alive(s)[0];
  s.advance(300); hit(s, 0, t, { at: s.now() + 2000 }); assert.equal(lastMiss(s, 0).why, "time", "앞날에 쏜 것");
  s.advance(300); hit(s, 0, t, { at: s.now() - 4000 }); assert.equal(lastMiss(s, 0).why, "time", "너무 오래전에 쏜 것");
  s.advance(300); s.duel.message("pa", { t: "duel:game", id: s.m.id, k: "hit", tg: 9999, x: 21, y: 21.5, dir: 3, at: s.now() }); assert.equal(lastMiss(s, 0).why, "bad");
  s.duel.message("pa", { t: "duel:game", id: s.m.id, k: "hit", tg: t.id, x: "21", y: 21.5, dir: 3, at: s.now() }); assert.equal(lastMiss(s, 0).why, "bad");
  assert.deepEqual(s.m.state.score, [0, 0]);
});

test("조준이 틀리거나 쏜 자리가 말이 안 되면 받지 않는다", () => {
  const s = setup(); s.advance(3000);
  const t = alive(s)[0];
  hit(s, 0, t, { skew: .5 }); assert.equal(lastMiss(s, 0).why, "aim", "엉뚱한 방향");
  s.advance(300); hit(s, 0, t, { from: SPOT[1] }); assert.equal(lastMiss(s, 0).why, "pos", "상대 부스에서 쏠 수 없다");
  s.advance(300); hit(s, 0, t, { from: [28, 14] }); assert.equal(lastMiss(s, 0).why, "pos", "과녁 마당 안에서 쏠 수 없다");
  s.advance(3100); hit(s, 0, alive(s)[0], { stand: [16, 22.5] }); assert.equal(lastMiss(s, 0).why, "pos", "최근 위치와 쏜 자리가 멀다");
  s.advance(300); const u = alive(s)[0]; hit(s, 0, u, { from: [23, 22] }); assert.equal(s.game("pa", "take").at(-1)?.tg, u.id, "내 부스 안이면 움직여도 된다");
});

test("맞힘 사이 간격은 0.25초", () => {
  const s = setup(); s.advance(4000);
  const [a, b, c] = alive(s); assert.ok(c, "살아 있는 과녁 셋");
  const at = s.now();
  hit(s, 0, a, { at }); assert.equal(s.m.state.hits[0], 1);
  hit(s, 0, b, { at: at + 100 }); assert.equal(lastMiss(s, 0).why, "rate");
  s.advance(200); hit(s, 0, c, { at: at + TARGET.GAP + 10 }); assert.equal(s.m.state.hits[0], 2, "간격을 지키면 받는다");
  hit(s, 1, b, { at: at + 100 }); assert.equal(s.m.state.hits[1], 1, "간격은 선수마다");
});

test("관전자는 점수를 낼 수 없다", () => {
  const s = setup(); s.advance(3000);
  s.duel.message("pc", { t: "duel:watch", peer: "pa" });
  const t = alive(s)[0];
  hit(s, 0, t, { pid: "pc" });
  assert.deepEqual(s.m.state.score, [0, 0]); assert.equal(s.game("pc", "take").length, 0); assert.equal(s.game("pc", "miss").length, 0);
});

test("60초가 지나면 점수가 높은 쪽이 이기고, 같으면 무승부", () => {
  const s = setup(); s.advance(3000);
  hit(s, 1, alive(s)[0]);
  s.advance(TARGET.DURATION - 3000 - 200); assert.equal(s.m.phase, "playing");
  s.advance(800);
  const end = s.last("pa", "duel:end"); assert.equal(end.reason, "timeout"); assert.equal(end.winner, UB); assert.equal(end.seat, 1);
  assert.deepEqual(end.summary.score, s.m.state.score); assert.equal(s.duel.records.users[UB].w, 1);
  const d = setup(); d.advance(TARGET.DURATION + 600);
  const e2 = d.last("pb", "duel:end"); assert.equal(e2.winner, null); assert.deepEqual(e2.summary.score, [0, 0]); assert.equal(d.duel.records.users[UA].d, 1);
  hit(d, 0, d.m.target.plan[0]); assert.deepEqual(d.m.state.score, [0, 0], "끝난 뒤에는 받지 않는다");
});
