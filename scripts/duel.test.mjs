import assert from "node:assert/strict";
import { test } from "node:test";
import { createDuel } from "../server/duel/index.js";
import { DUEL, findGame, isArena } from "../src/duel/shared.mjs";
import { JUMP_COURSES, JUMP_BOUNCE } from "../src/duel/arena/jump.mjs";
import { ARENAS } from "../src/duel/arena/index.mjs";
import { SERVER_GAMES } from "../server/duel/games/index.js";

// 가짜 접속자 · 시계 · 저장소로 서버 대결을 돌린다
function setup({ games } = {}) {
  let t = 1_000_000;
  const peers = new Map(), sent = [], saved = [];
  const add = (id, uid, name) => peers.set(id, { uid, name, presence: null });
  add("pa", "p_aaaaaaaaaaaaaaaa", "에이"); add("pb", "p_bbbbbbbbbbbbbbbb", "비"); add("pc", "p_cccccccccccccccc", "씨");
  const duel = createDuel({ peers, send: (pid, msg) => sent.push({ pid, ...msg }), now: () => t, random: () => 0, store: { load: () => null, save: (d) => saved.push(JSON.parse(JSON.stringify(d))) }, ...(games ? { games } : {}) });
  const take = (pid, type) => { const out = sent.filter((m) => (!pid || m.pid === pid) && (!type || m.t === type)); sent.length = 0; return out; };
  const last = (pid, type) => sent.filter((m) => m.pid === pid && m.t === type).at(-1);
  const advance = (ms) => { const end = t + ms; while (t < end) { t = Math.min(end, t + DUEL.TICK); duel.tick(); } };
  return { duel, peers, sent, saved, take, last, advance, now: () => t, set: (v) => { t = v; } };
}
const UA = "p_aaaaaaaaaaaaaaaa", UB = "p_bbbbbbbbbbbbbbbb";
function startMatch(s, game = "jump") {
  s.duel.message("pa", { t: "duel:invite", to: "pb", game });
  const inv = s.last("pb", "duel:invited"); assert.ok(inv, "초대장이 상대에게 간다");
  s.duel.message("pb", { t: "duel:answer", id: inv.id, ok: true });
  return s.duel.matchOf(UA);
}

test("종목 이름과 별칭으로 찾는다", () => {
  assert.equal(findGame("점프맵").id, "jump"); assert.equal(findGame("JUMP").id, "jump"); assert.equal(findGame("복싱").id, "box"); assert.equal(findGame("사격 대결").id, "shoot");
  assert.equal(findGame("축구"), null); assert.ok(isArena(21) && isArena(24) && !isArena(14));
});

test("신청 → 수락이면 둘 다 같은 경기 방에 앉고, 3초 뒤 시작한다", () => {
  const s = setup(); const m = startMatch(s);
  assert.ok(m); assert.equal(m.phase, "countdown"); assert.equal(s.duel.matchOf(UB), m);
  const va = s.last("pa", "duel:match"), vb = s.last("pb", "duel:match");
  assert.equal(va.seat, 0); assert.equal(vb.seat, 1); assert.equal(va.floor, 21); assert.equal(va.ar, vb.ar);
  assert.deepEqual(s.duel.arenaOf(UA), { ar: m.ar, floor: 21, role: 1 });
  s.advance(DUEL.MOVE + DUEL.COUNTDOWN - 100); assert.equal(m.phase, "countdown");
  s.advance(200); assert.equal(m.phase, "playing"); assert.equal(m.endsAt, m.startAt + 180000);
});

test("거절 · 만료 · 취소 · 바쁨 · 자기 자신 · 쿨다운 · 받지 않기", () => {
  const s = setup();
  s.duel.message("pa", { t: "duel:invite", to: "pa", game: "jump" }); assert.equal(s.last("pa", "duel:error").code, "self");
  s.duel.message("pa", { t: "duel:invite", to: "pb", game: "jump" }); const inv = s.last("pb", "duel:invited");
  s.duel.message("pb", { t: "duel:answer", id: inv.id, ok: false });
  assert.equal(s.last("pa", "duel:invite-state").state, "declined");
  s.duel.message("pa", { t: "duel:invite", to: "pb", game: "jump" }); assert.equal(s.last("pa", "duel:error").code, "cooldown", "같은 상대는 60초에 한 번");
  s.advance(DUEL.COOLDOWN);
  s.duel.message("pa", { t: "duel:invite", to: "pb", game: "jump" });
  s.advance(DUEL.INVITE + 100); assert.equal(s.last("pb", "duel:invite-state").state, "expired", "30초가 지나면 만료");
  s.duel.message("pc", { t: "duel:invite", to: "pb", game: "jump" }); s.duel.message("pc", { t: "duel:cancel" });
  assert.equal(s.last("pb", "duel:invite-state").state, "canceled");
  s.duel.message("pb", { t: "duel:prefs", accept: false }); s.advance(DUEL.COOLDOWN);
  s.duel.message("pa", { t: "duel:invite", to: "pb", game: "jump" }); assert.equal(s.last("pa", "duel:error").code, "off");
  s.duel.message("pb", { t: "duel:prefs", accept: true });
  s.duel.message("pa", { t: "duel:invite", to: "pb", game: "jump" }); const inv2 = s.last("pb", "duel:invited");
  s.duel.message("pc", { t: "duel:invite", to: "pb", game: "jump" }); assert.equal(s.last("pc", "duel:invite-state").state, "busy", "초대 대기 중인 사람에게는 못 한다");
  s.duel.message("pb", { t: "duel:answer", id: inv2.id, ok: true });
  s.advance(DUEL.COOLDOWN);
  s.duel.message("pc", { t: "duel:invite", to: "pa", game: "jump" }); assert.equal(s.last("pc", "duel:invite-state").state, "busy", "경기 중인 사람에게는 못 한다");
  s.duel.message("pa", { t: "duel:invite", to: "pc", game: "jump" }); assert.equal(s.last("pa", "duel:error").code, "busy_me");
  s.duel.message("pa", { t: "duel:invite", to: "pc", game: "box" }); assert.ok(["not_ready", "busy_me"].includes(s.last("pa", "duel:error").code));
});

test("준비 안 된 종목은 신청할 수 없다", () => {
  const s = setup({ games: { jump: SERVER_GAMES.jump } });   // 서버 규칙이 없는 종목(여기서는 복싱)은 "준비 중"
  s.duel.message("pa", { t: "duel:invite", to: "pb", game: "nope" }); assert.equal(s.last("pa", "duel:error").code, "game");
  s.duel.message("pa", { t: "duel:invite", to: "pb", game: "box" });
  assert.equal(s.last("pa", "duel:error").code, "not_ready");
});

test("기권하면 상대가 이기고, 결과 5초 뒤 경기가 닫히며 전적이 남는다", () => {
  const s = setup(); const m = startMatch(s); s.advance(DUEL.MOVE + DUEL.COUNTDOWN + 100);
  s.duel.message("pa", { t: "duel:forfeit" });
  const end = s.last("pb", "duel:end"); assert.equal(end.winner, UB); assert.equal(end.reason, "forfeit");
  assert.equal(m.phase, "result"); assert.ok(s.duel.arenaOf(UA));
  s.advance(DUEL.RESULT + 100);
  assert.equal(s.last("pa", "duel:match").phase, "closed"); assert.equal(s.duel.matchOf(UA), null);
  assert.equal(s.duel.arenaOf(UA).role, 0, "돌아가는 동안은 대결장 위치를 받아 준다");
  s.advance(DUEL.AFTER + 100); assert.equal(s.duel.arenaOf(UA), null);
  assert.equal(s.duel.records.users[UB].w, 1); assert.equal(s.duel.records.users[UA].l, 1);
  s.advance(5000); assert.ok(s.saved.length >= 1, "전적을 저장소에 쓴다");
  s.duel.message("pc", { t: "duel:records", u: UB }); const r = s.last("pc", "duel:records"); assert.equal(r.w, 1); assert.equal(r.name, "비");
});

test("끊긴 선수는 20초를 기다리고, 그 안에 다시 붙으면 이어서 한다", () => {
  const s = setup(); const m = startMatch(s); s.advance(DUEL.MOVE + DUEL.COUNTDOWN + 100);
  s.duel.left("pa"); s.peers.delete("pa"); assert.ok(m.players[0].away);
  s.advance(10000);
  s.peers.set("pa2", { uid: UA, name: "에이" });   // 새로고침: 같은 uid, 새 peer
  s.duel.message("pa2", { t: "duel:hello", accept: true });
  assert.equal(s.last("pa2", "duel:match").seat, 0); assert.equal(m.players[0].peer, "pa2"); assert.equal(m.players[0].away, 0);
  s.advance(15000); assert.equal(m.phase, "playing");
  s.duel.left("pb"); s.peers.delete("pb"); s.advance(DUEL.GRACE + 200);
  assert.equal(m.phase, "result"); assert.equal(s.last("pa2", "duel:end").reason, "disconnect"); assert.equal(s.last("pa2", "duel:end").winner, UA);
});

test("경기가 없으면 hello에 none으로 답한다", () => {
  const s = setup(); s.duel.message("pa", { t: "duel:hello" }); assert.equal(s.last("pa", "duel:match").phase, "none");
});

test("관전: 경기에 영향을 못 주고, 나가면 닫힘을 받는다", () => {
  const s = setup(); const m = startMatch(s); s.advance(DUEL.MOVE + DUEL.COUNTDOWN + 100);
  s.duel.message("pc", { t: "duel:watch", peer: "pa" });
  const v = s.last("pc", "duel:match"); assert.equal(v.seat, null); assert.equal(v.id, m.id);
  assert.equal(s.duel.arenaOf("p_cccccccccccccccc").role, 2);
  s.duel.message("pc", { t: "duel:forfeit" }); assert.equal(s.last("pc", "duel:error").code, "no_match"); assert.equal(m.phase, "playing");
  s.duel.message("pc", { t: "duel:game", id: m.id, k: "pad", i: 1 }); assert.deepEqual(m.state.cp, [0, 0]);
  s.duel.message("pc", { t: "duel:watch" }); assert.equal(s.last("pc", "duel:match").phase, "closed"); assert.equal(m.watchers.size, 0);
  s.duel.message("pc", { t: "duel:watch", peer: "pc" }); assert.equal(s.last("pc", "duel:error").code, "no_match");
});

test("관전석은 20명까지", () => {
  const s = setup(); startMatch(s);
  for (let i = 0; i < 21; i++) { const id = `w${i}`; s.peers.set(id, { uid: `p_${String(i).padStart(16, "0")}`, name: `관전${i}` }); s.duel.message(id, { t: "duel:watch", peer: "pb" }); }
  assert.equal(s.duel.matchOf(UA).watchers.size, 20); assert.equal(s.last("w20", "duel:error").code, "full");
});

/* ───── 점프맵 ───── */
const course = JUMP_COURSES[0];
const at = (s, pid, pad) => s.duel.presence(pid, { f: 21, x: pad.x + pad.w / 2, y: pad.y + pad.h / 2 });
function runTo(s, pid, i) { // 구간 최소 시간만큼 기다렸다 그 발판 위에서 도착을 보낸다
  const pad = course.pads[i]; s.advance(course.minT[i] + 50); at(s, pid, pad);
  s.duel.message(pid, { t: "duel:game", id: s.duel.matchOf(UA).id, k: "pad", i });
}
test("점프맵: 순서 · 최소 시간 · 위치를 확인하고, 먼저 도착하면 이기며 기록을 남긴다", () => {
  const s = setup(); const m = startMatch(s); s.advance(DUEL.MOVE + DUEL.COUNTDOWN + 100);
  assert.equal(m.state.course, 0, "random 0이면 첫 코스");
  assert.deepEqual(s.last("pa", "duel:match").spawns, course.spawns);
  s.duel.message("pa", { t: "duel:game", id: m.id, k: "pad", i: 2 });
  assert.equal(s.last("pa", "duel:game").k, "reject", "건너뛰면 받지 않는다");
  at(s, "pa", course.pads[1]); s.duel.message("pa", { t: "duel:game", id: m.id, k: "pad", i: 1 });
  assert.equal(m.state.cp[0], 0, "너무 빨리 오면 받지 않는다");
  s.advance(course.minT[1] + 50); s.duel.presence("pa", { f: 21, x: 50, y: 30 });
  s.advance(1600); s.duel.presence("pa", { f: 21, x: 50, y: 30 }); s.duel.message("pa", { t: "duel:game", id: m.id, k: "pad", i: 1 });
  assert.equal(m.state.cp[0], 0, "그 발판 근처에 있지 않으면 받지 않는다");
  for (let i = 1; i < course.pads.length; i++) runTo(s, "pa", i);
  const end = s.last("pb", "duel:end"); assert.equal(end.winner, UA); assert.equal(end.reason, "finish"); assert.equal(end.summary.course, 0);
  assert.ok(end.summary.record && end.summary.personal, "첫 기록은 코스 기록");
  assert.equal(s.duel.records.users[UA].best[`jump:${course.id}`], end.summary.ms); assert.equal(s.duel.records.best[`jump:${course.id}`].name, "에이");
});

test("점프맵: 시간이 다 되면 더 멀리 간 쪽이 이기고, 같으면 무승부", () => {
  const s = setup(); const m = startMatch(s); s.advance(DUEL.MOVE + DUEL.COUNTDOWN + 100);
  runTo(s, "pb", 1); assert.equal(m.state.cp[1], 1);
  s.advance(180000); const end = s.last("pa", "duel:end"); assert.equal(end.reason, "timeout"); assert.equal(end.winner, UB); assert.deepEqual(end.summary.cp, [0, 1]);
  const s2 = setup(); const m2 = startMatch(s2); s2.advance(DUEL.MOVE + DUEL.COUNTDOWN + 100 + 180000);
  assert.equal(m2.phase, "result"); assert.equal(s2.last("pb", "duel:end").winner, null);
  assert.equal(s2.duel.records.users[UA].d, 1);
});

test("점프맵 코스는 모두 깰 수 있게 생겼다(오를 높이 · 틈)", () => {
  const RISE = .705 + .59 + .26, BOUNCE = JUMP_BOUNCE ** 2 / 30 + .59 + .26;   // 더블 점프 + 걸어서 넘는 턱 · 트램펄린 + 더블 점프
  for (const c of JUMP_COURSES) {
    const all = [...c.pads, ...c.blocks].sort((a, b) => a.x - b.x);
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1], b = all[i], gap = b.x - (a.x + a.w), reach = a.kind === "t" ? a.top + BOUNCE : a.top + RISE;
      assert.ok(gap >= 0 && gap <= 4, `${c.name} ${b.x}: 틈 ${gap}`);
      assert.ok(b.top <= reach - .05, `${c.name} ${b.x}: ${a.top} → ${b.top}`);
      assert.ok(b.y >= c.y0 + 1 && b.y + b.h <= c.y0 + 8 && b.x + b.w <= 54, `${c.name} ${b.x}: 띠 안`);
    }
    assert.equal(c.minT.length, c.pads.length); assert.ok(c.pads.length >= 3);
  }
});

test("대결장 층은 21~24층이고 선수 자리 둘 · 관전 자리가 있다", () => {
  assert.deepEqual(ARENAS.map((a) => a.f), [21, 22, 23, 24]);
  for (const a of ARENAS) { assert.equal(a.spawns.length, 2); assert.ok(a.watch.length >= 1); assert.ok(a.rooms.length >= 1); }
});

test("종목 규칙 모듈을 바꿔 끼울 수 있다(setup · message · tick · api)", () => {
  const calls = [];
  const fake = { id: "jump", duration: 5000, setup(m) { m.state = { n: 0 }; calls.push("setup"); }, start() { calls.push("start"); }, message(m, seat, p, api) { m.state.n += p.n; api.broadcast(m, { k: "n", n: m.state.n, seat }); if (m.state.n >= 3) api.finish(m, seat, "score", { n: m.state.n }); }, tick(m, now, api) { if (now >= m.endsAt) api.finish(m, null, "timeout"); } };
  const s = setup({ games: { jump: fake } }); const m = startMatch(s);
  s.advance(DUEL.MOVE + DUEL.COUNTDOWN + 100); assert.deepEqual(calls, ["setup", "start"]);
  s.duel.message("pb", { t: "duel:game", id: m.id, n: 1 }); assert.equal(s.last("pa", "duel:game").n, 1);
  s.duel.message("pb", { t: "duel:game", id: "other", n: 5 }); assert.equal(m.state.n, 1, "다른 경기 id는 무시");
  s.duel.message("pb", { t: "duel:game", id: m.id, n: 2 }); assert.equal(s.last("pa", "duel:end").winner, UB);
});

test("초대를 받은 채로도 다른 크루에게 신청할 수 있고, 내가 보낸 신청이 걸려 있으면 못 한다", () => {
  const s = setup();
  s.duel.message("pa", { t: "duel:invite", to: "pb", game: "jump" });
  s.duel.message("pb", { t: "duel:invite", to: "pc", game: "jump" });
  assert.equal(s.last("pb", "duel:invite-state")?.state, "pending", "받은 초대가 있어도 신청은 된다");
  s.duel.message("pb", { t: "duel:invite", to: "pa", game: "jump" }); assert.equal(s.last("pb", "duel:error").code, "busy_me", "보낸 신청이 걸려 있으면 막는다");
});

test("결과가 뜬 경기는 관전할 수 없다(곧 닫혀 바로 튕기므로)", () => {
  const s = setup(); startMatch(s); s.advance(DUEL.MOVE + DUEL.COUNTDOWN + 100);
  s.duel.message("pa", { t: "duel:forfeit" }); assert.equal(s.duel.matchOf(UA).phase, "result");
  s.duel.message("pc", { t: "duel:watch", peer: "pa" }); assert.equal(s.last("pc", "duel:error").code, "no_match");
  assert.equal(s.duel.matchOf("p_cccccccccccccccc"), null);
});

test("지난 신청 기록은 기다림이 끝나면 지우고, 설정은 마지막 연결이 끊길 때 지운다", () => {
  const s = setup();
  s.duel.message("pa", { t: "duel:invite", to: "pb", game: "jump" }); s.duel.message("pa", { t: "duel:cancel" });
  s.advance(DUEL.COOLDOWN + 200);
  s.duel.message("pa", { t: "duel:invite", to: "pb", game: "jump" }); assert.equal(s.last("pa", "duel:invite-state").state, "pending", "기다림이 끝나면 다시 신청");
  s.duel.message("pc", { t: "duel:prefs", accept: false }); s.duel.left("pc"); s.peers.delete("pc");
  s.peers.set("pc2", { uid: "p_cccccccccccccccc", name: "씨", presence: null });
  s.duel.message("pa", { t: "duel:cancel" }); s.duel.message("pa", { t: "duel:invite", to: "pc2", game: "jump" });
  assert.equal(s.last("pa", "duel:invite-state")?.state, "pending", "다시 붙으면 브라우저가 설정을 다시 보낼 때까지 기본(받기)");
});

