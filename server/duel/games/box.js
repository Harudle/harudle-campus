// 복싱 서버 규칙: 브라우저는 "주먹을 냈다(punch)" · "가드를 올렸다/내렸다(guard)"만 보내고, 맞았는지는 서버가 정한다
// 맞힘 = 간격(잽 0.35초 · 스트레이트 0.7초)을 지켰고, 내 마지막 위치에서 상대(최근 0.4초 위치 중 하나)가 1.3칸 안 · 내가 보는 쪽 60도 안.
// 상대가 가드 중이면 30%만 들어간다. 체력 0이면 KO, 3분이 다 되면 체력이 많은 쪽이 이기고 같으면 무승부
import { BOX } from "../../../src/duel/arena/box.mjs";

const LAG = 400;     // 상대 위치는 이만큼(ms) 지난 것까지 본다(내 화면의 상대는 조금 늦게 보인다)
const SLACK = .8;    // 간격은 80%까지 봐준다(메시지가 몰려 도착할 수 있다)
const r1 = (v) => Math.round(v * 10) / 10;
// a(때리는 사람 위치 · 방향 h)에서 b가 닿는 곳인지. h: 0 남(+y) · π/2 동(+x)
export function reach(a, b, floor) {
  if (!a || !b || a.f !== floor || b.f !== floor) return false;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (!(d <= BOX.RANGE)) return false;
  if (d < .25) return true;   // 거의 겹쳐 있으면 방향을 따지지 않는다
  const cos = (Math.sin(+a.h || 0) * dx + Math.cos(+a.h || 0) * dy) / d;
  return cos >= Math.cos(BOX.ANGLE) - 1e-9;
}

export default {
  id: "box",
  duration: 180000,
  setup(m) {
    m.state = { hp: [BOX.HP, BOX.HP], guard: [0, 0] };   // 공개: 체력 · 가드 중인지
    m.box = { at: [{ jab: -Infinity, str: -Infinity }, { jab: -Infinity, str: -Infinity }], any: [-Infinity, -Infinity] };   // 마지막으로 낸 주먹 시각
  },
  message(m, seat, p, api) {
    const foe = 1 - seat;
    if (p.k === "guard") {
      const on = p.on ? 1 : 0; if (m.state.guard[seat] === on) return;
      m.state.guard[seat] = on; api.broadcast(m, { k: "guard", seat, on });
      return;
    }
    if (p.k !== "punch") return;
    const kind = p.kind, P = Object.hasOwn(BOX.PUNCH, kind) ? BOX.PUNCH[kind] : null, t = api.now(), b = m.box;
    if (!P || m.state.guard[seat]) return;   // 가드를 올린 채로는 못 친다(브라우저도 막는다)
    if (t - b.at[seat][kind] < P.gap * SLACK || t - b.any[seat] < BOX.GAP * SLACK) return;   // 너무 빠르면 없던 일로
    b.at[seat][kind] = t; b.any[seat] = t;
    const me = api.presence(m, seat), them = [...api.history(m, foe, LAG), api.presence(m, foe)];
    if (!them.some((h) => reach(me, h, m.floor))) return api.broadcast(m, { k: "punch", seat, kind, hit: 0 });   // 헛손질도 모두에게 보인다
    const g = m.state.guard[foe], dmg = r1(P.dmg * (g ? BOX.GUARD : 1));
    m.state.hp[foe] = Math.max(0, r1(m.state.hp[foe] - dmg));
    api.broadcast(m, { k: "punch", seat, kind, hit: 1, dmg, g, hp: [...m.state.hp] });
    if (m.state.hp[foe] <= 0) api.finish(m, seat, "ko", { hp: [...m.state.hp], kind });
  },
  tick(m, now, api) {
    if (now < m.endsAt) return;
    const [a, b] = m.state.hp;
    api.finish(m, a === b ? null : a > b ? 0 : 1, "timeout", { hp: [a, b] });
  },
};
