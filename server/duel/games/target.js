// 과녁 사격 서버 규칙: seed로 60초 과녁 일정을 만들고, 나오기 조금 전에 하나씩 알린다(spawn).
// 브라우저가 보낸 맞힘(hit: 과녁 · 쏜 자리 · 방향 · 쏜 시각)을 과녁이 그때 살아 있었는지 · 쏜 자리가 내 부스이고 최근 위치와 맞는지 · 조준 · 간격으로 확인한다.
// 먼저 맞힌 사람이 점수(보통 1 · 금색 3)를 가져가고, 시간이 다 되면 점수가 높은 쪽이 이긴다(같으면 무승부)
import { TARGET, targetPlan, targetSpeed, shotHits } from "../../../src/duel/target-path.mjs";
import { TARGET_BOOTHS } from "../../../src/duel/arena/target.mjs";
import { rectDist } from "../../../src/duel/arena/kit.mjs";

const NEAR = 1.5, LAG = 1000;   // 쏜 자리와 최근 위치 차이(칸) · 그 위치가 쏜 시각에서 떨어져도 되는 시간(ms, 위치는 0.1초쯤마다 와서 늦을 수 있다)
const num = (v) => typeof v === "number" && Number.isFinite(v);
// duel:game의 t · id는 틀이 쓰는 자리(메시지 종류 · 경기 id)라, 과녁은 tgt(정보) · tg(번호)로 주고받는다
const pub =({ id, at, life, g, row, y, kind, x0, x1, cx, amp, hz, ph }) => ({ id, at, life, g, row, y, kind, x0, x1, cx, amp, hz, ph });

export default {
  id: "target",
  duration: TARGET.DURATION,
  setup(m, api) {
    const seed = Math.floor(api.random() * 2 ** 31);
    m.target = { seed, plan: targetPlan(seed).map((t) => ({ ...t, at: m.startAt + t.at })), next: 0, taken: new Map(), last: [-Infinity, -Infinity] };   // 일정 · 다음에 알릴 번호 · 가져간 과녁(id → 자리) · 마지막으로 받은 쏜 시각
    m.state = { score: [0, 0], hits: [0, 0], gold: [0, 0], live: [] };   // live: 지금 알린 과녁(관전 · 다시 접속하면 이것부터 그린다)
  },
  tick(m, now, api) {
    const T = m.target;
    while (T.next < T.plan.length && T.plan[T.next].at - TARGET.LEAD <= now) { const t = pub(T.plan[T.next++]); m.state.live.push(t); api.broadcast(m, { k: "spawn", tgt: t }); }
    m.state.live = m.state.live.filter((t) => !T.taken.has(t.id) && t.at + t.life > now - 300);
    if (now < m.endsAt + 300) return;   // 끝나기 직전에 쏜 총알의 맞힘이 올 틈
    const [a, b] = m.state.score;
    api.finish(m, a === b ? null : a > b ? 0 : 1, "timeout", { score: [a, b], hits: [...m.state.hits], gold: [...m.state.gold] });
  },
  message(m, seat, p, api) {
    if (p.k !== "hit") return;
    const T = m.target, now = api.now(), t = Number.isInteger(p.tg) ? T.plan[p.tg] : null;
    const why = !t || ![p.x, p.y, p.dir, p.at].every(num) ? "bad"
      : T.taken.has(t.id) ? "taken"
      : t.at - TARGET.LEAD > now ? "early"
      : p.at < m.startAt || p.at > now + 300 || p.at < now - 2500 || p.at > m.endsAt ? "time"
      : p.at - T.last[seat] < TARGET.GAP ? "rate"
      : rectDist(TARGET_BOOTHS[seat], p.x, p.y) > .6 || !api.history(m, seat, 3000).some((h) => h.f === m.floor && Math.abs(h.at - p.at) <= LAG && Math.hypot(h.x - p.x, h.y - p.y) <= NEAR) ? "pos"
      : !shotHits(t, p.x, p.y, p.dir, p.at, TARGET.HIT_R + .35 + targetSpeed(t) * .15) ? "aim" : "";
    if (why) return api.send(m, seat, { k: "miss", tg: t ? t.id : null, why });   // 브라우저는 숨겨 둔 과녁을 다시 보인다
    const pts = TARGET.POINTS[t.g ? 1 : 0];
    T.taken.set(t.id, seat); T.last[seat] = p.at;
    m.state.score[seat] += pts; m.state.hits[seat]++; if (t.g) m.state.gold[seat]++;
    m.state.live = m.state.live.filter((x) => x.id !== t.id);
    api.broadcast(m, { k: "take", tg: t.id, seat, pts, g: t.g, score: [...m.state.score] });
  },
};
