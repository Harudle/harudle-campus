// 점프맵 서버 규칙: 코스를 고르고, 브라우저가 보낸 발판 도착(pad)을 순서 · 구간 최소 시간 · 최근 위치로 확인한다
// 먼저 도착대에 닿으면 승리. 3분 안에 아무도 못 오면 발판을 더 많이 지난 쪽이 이기고, 같으면 무승부
import { JUMP_COURSES } from "../../../src/duel/arena/jump.mjs";
import { rectDist } from "../../../src/duel/arena/kit.mjs";

const NEAR = 2.5;   // 발판 사각형에서 이만큼(칸) 안에 최근 위치가 있어야 받는다(위치는 0.1초쯤마다 와서 조금 늦을 수 있다)

export default {
  id: "jump",
  duration: 180000,
  setup(m, api) {
    const c = JUMP_COURSES[Math.floor(api.random() * JUMP_COURSES.length)];
    m.state = { course: c.k, cp: [0, 0], pads: c.pads.length };   // cp: 선수마다 마지막으로 밟은 발판 번호(0 출발대)
    m.spawns = c.spawns; m.watch = c.watch;
    m.jump = { at: [0, 0] };   // 마지막 발판을 밟은 서버 시각(공개하지 않는다)
  },
  start(m, api) { m.jump.at = [api.now(), api.now()]; },
  message(m, seat, p, api) {
    if (p.k !== "pad") return;
    const c = JUMP_COURSES[m.state.course], i = p.i, t = api.now(), pad = c.pads[i];
    const ok = Number.isInteger(i) && i === m.state.cp[seat] + 1 && pad && t - m.jump.at[seat] >= c.minT[i]
      && api.history(m, seat, 1500).some((h) => h.f === m.floor && rectDist(pad, h.x, h.y) <= NEAR);
    if (!ok) { api.send(m, seat, { k: "reject", i: m.state.cp[seat] }); return; }   // 브라우저는 서버가 아는 마지막 발판으로 돌아간다
    m.state.cp[seat] = i; m.jump.at[seat] = t;
    const ms = t - m.startAt;
    api.broadcast(m, { k: "pad", seat, i, ms });
    if (i < c.pads.length - 1) return api.sync(m);
    const rec = api.best(m, seat, `jump:${c.id}`, ms);
    api.finish(m, seat, "finish", { course: c.k, ms, personal: rec.mine, record: rec.top });
  },
  tick(m, now, api) {
    if (now < m.endsAt) return;
    const [a, b] = m.state.cp;
    api.finish(m, a === b ? null : a > b ? 0 : 1, "timeout", { course: m.state.course, cp: [a, b] });
  },
};
