// 사격 대결 서버 규칙: 체력 100 · 한 발 20, 라운드마다 체력이 다시 차고 3판 2선승. 라운드 90초, 시간이 다 되면 체력이 많은 쪽이 이기고 같으면 다시 한다
// 명중은 서버가 정한다. 쏜 사람 브라우저가 "내 총알이 상대에게 닿았다"(hit)를 보내면, 그 사람의 위치 기록에서 그 발을 쏜 순간(fc가 바뀐 위치, fh = 방향)을 찾아
// 거리 · 앞쪽 · 옆으로 벗어난 정도 · 엄폐물 · 연사 간격을 상대의 최근 위치 기록과 맞춰 본다. 맞은 사람 브라우저의 말(hc)은 쓰지 않는다
import { SHOOT, SHOOT_COVER } from "../../../src/duel/arena/shoot.mjs";

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));   // 두 방향 사이 각(한 바퀴 돌아도 같다)
// 선분 (x0, y0) → (x1, y1)이 사각형(가장자리를 m만큼 줄인)을 지나는지(slab)
function crosses(r, x0, y0, x1, y1, m = .2) {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[x0, x1 - x0, r.x + m, r.x + r.w - m], [y0, y1 - y0, r.y + m, r.y + r.h - m]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let a = (lo - p) / d, b = (hi - p) / d; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false;
  }
  return true;
}
// 쏜 순간들: 종이 총(fk)이고 fc가 바로 앞 위치와 달라진 위치(쏠 때마다 엔진이 위치를 바로 보낸다). 맨 앞 기록은 비교할 앞이 없어 쏜 순간으로 치지 않는다
// (예전 발의 fc를 그대로 단 채 더 가까이 걸어온 위치를 쏜 자리로 우기지 못하게)
const shotsOf = (hist) => hist.filter((e, i) => i > 0 && e.fk && e.fc !== hist[i - 1].fc);

// 맞힘 확인: 받으면 { shot }, 아니면 { why } (why: round · self · bad · late · fast · shot · behind · far · cover · aim)
export function judge(m, seat, p, api) {
  const st = m.state, sh = m.shoot, t = api.now();
  if (st.phase !== "go" || t < st.at) return { why: "round" };
  if (p.to !== 1 - seat) return { why: "self" };
  if (!fin(p.dir) || !fin(p.at) || !fin(p.lift ?? 0) || (p.lift ?? 0) < 0 || (p.lift ?? 0) > 1.6) return { why: "bad" };
  if (p.at > t + 300 || p.at < t - 2000 || p.at < st.at - 100) return { why: "late" };   // 지난 라운드 · 너무 오래된 발 · 앞날 시각
  if (p.at - sh.lastAt[seat] < SHOOT.GAP) return { why: "fast" };
  // 그 발을 쏜 순간: 방향이 같고(fh는 0.01로 반올림돼 온다) 아직 안 쓴 발 중 서버에 닿은 시각이 쏜 시각과 가장 가까운 것
  const shot = shotsOf(api.history(m, seat, Infinity)).filter((e) => e.f === m.floor && turn(e.fh, p.dir) < .006 && e.at >= p.at - 300 && e.at <= p.at + 1500 && e.fc > sh.lastFc[seat])
    .reduce((a, e) => (!a || Math.abs(e.at - p.at) < Math.abs(a.at - p.at) ? e : a), null);
  if (!shot) return { why: "shot" };
  if (shot.at - sh.lastShot[seat] < SHOOT.GAP / 2) return { why: "fast" };   // 서버에 닿은 간격으로도(보낸 시각을 꾸며도 걸린다. 네트워크 흔들림만큼 봐준다)
  const dir = shot.fh, fx = Math.sin(dir), fy = Math.cos(dir), lift = Math.min(p.lift ?? 0, (+shot.u || 0) + 1.4);
  // 상대 위치: 쏜 무렵부터 총알이 닿을 때까지(쏜 사람 화면의 상대는 조금 늦게 보이므로 앞으로 넉넉히). 위치 사이 가운데도 본다
  const foe = api.history(m, 1 - seat, 3000).filter((h) => h.f === m.floor && h.at >= shot.at - 1000 && h.at <= shot.at + 1600);
  const pts = foe.length ? foe.flatMap((h, i) => (i ? [{ x: (h.x + foe[i - 1].x) / 2, y: (h.y + foe[i - 1].y) / 2, at: (h.at + foe[i - 1].at) / 2 }, h] : [h])) : [api.presence(m, 1 - seat)].filter((h) => h && h.f === m.floor);
  let why = "aim", best = 0;
  const rank = { aim: 1, behind: 2, far: 3, cover: 4 };   // 가장 그럴듯했던 이유를 돌려준다(시험 · 기록용)
  for (const h of pts) {
    const dx = h.x - shot.x, dy = h.y - shot.y, fwd = dx * fx + dy * fy, side = Math.abs(dx * fy - dy * fx);
    const k = fwd <= 0 ? "behind" : fwd > SHOOT.RANGE ? "far" : side > SHOOT.WIDE ? "aim" : Math.abs(h.at - (shot.at + fwd / SHOOT.SPEED * 1000 - 250)) > 1100 ? "aim"
      : lift < SHOOT.OVER && SHOOT_COVER.some((c) => crosses(c, shot.x, shot.y, h.x, h.y)) ? "cover" : "";
    if (!k) return { shot };
    if (rank[k] > best) { best = rank[k]; why = k; }
  }
  return { why };
}

function round(m, api, n, again = false) { // 다음 라운드: 체력을 채우고 3·2·1 뒤 시작. 두 선수는 브라우저가 자기 구석으로 옮긴다
  const t = api.now(), st = m.state;
  st.n++; st.round = n; st.again = again; st.hp = [SHOOT.HP, SHOOT.HP]; st.phase = "ready"; st.at = t + SHOOT.READY;
  m.endsAt = st.at + SHOOT.ROUND; api.sync(m);
}
function roundOver(m, api, winner, why) { // why: ko · time(시간 종료, 체력 많은 쪽) · tie(같아서 다시)
  const st = m.state; m.shoot.played++;
  if (winner !== null) st.wins[winner]++;
  st.last = { seat: winner, why, round: st.round };
  api.broadcast(m, { k: "round", seat: winner, why, round: st.round, wins: [...st.wins], hp: [...st.hp] });
  const summary = { wins: [...st.wins], rounds: m.shoot.played };
  if (winner !== null && st.wins[winner] >= SHOOT.WIN) { st.phase = "over"; return api.finish(m, winner, why === "ko" ? "ko" : "timeout", summary); }
  if (m.shoot.played >= SHOOT.MAX_ROUNDS) { const [a, b] = st.wins; st.phase = "over"; return api.finish(m, a === b ? null : a > b ? 0 : 1, "timeout", summary); }
  round(m, api, winner === null ? st.round : st.round + 1, winner === null);
}

export default {
  id: "shoot",
  duration: SHOOT.ROUND,   // 첫 라운드는 틀의 3·2·1 뒤 바로. endsAt은 라운드마다 바꾼다(남은 시간 = 라운드 남은 시간)
  setup(m) { // 공개 상태: n 몇 번째 판(다시 하는 판 포함) · round 라운드 번호 · again 무승부라 다시 · phase ready(3·2·1) · go · over · at 그 판 시작 시각 · last 지난 판 결과
    m.state = { n: 1, round: 1, again: false, phase: "ready", at: m.startAt, hp: [SHOOT.HP, SHOOT.HP], wins: [0, 0], last: null };
    m.shoot = { lastAt: [-Infinity, -Infinity], lastShot: [-Infinity, -Infinity], lastFc: [-Infinity, -Infinity], played: 0 };   // 마지막으로 받은 발: 쏜 시각(브라우저) · 서버에 닿은 시각 · fc(공개하지 않는다)
  },
  start(m, api) { m.state.phase = "go"; m.state.at = api.now(); m.endsAt = m.state.at + SHOOT.ROUND; },
  message(m, seat, p, api) {
    if (p.k !== "hit") return;
    const r = judge(m, seat, p, api);
    if (!r.shot) return api.send(m, seat, { k: "miss", why: r.why });
    m.shoot.lastAt[seat] = p.at; m.shoot.lastShot[seat] = r.shot.at; m.shoot.lastFc[seat] = r.shot.fc;
    const foe = 1 - seat, st = m.state; st.hp[foe] = Math.max(0, st.hp[foe] - SHOOT.DMG);
    api.broadcast(m, { k: "hit", seat, to: foe, dir: r.shot.fh, hp: [...st.hp] });
    if (st.hp[foe] <= 0) return roundOver(m, api, seat, "ko");
    api.sync(m);
  },
  tick(m, now, api) {
    const st = m.state;
    if (st.phase === "ready" && now >= st.at) { st.phase = "go"; api.sync(m); return; }
    if (st.phase !== "go" || now < m.endsAt) return;
    const [a, b] = st.hp;
    roundOver(m, api, a === b ? null : a > b ? 0 : 1, a === b ? "tie" : "time");
  },
};
