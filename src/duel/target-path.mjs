// 과녁 사격: 서버와 브라우저가 같이 쓰는 과녁 일정 · 길 · 맞힘 셈(three.js 없이). 서버가 고른 seed로 일정을 만들고,
// 과녁마다 길 정보(레일 · 출발 시각 · 수명 · 모양)만 보내면 두 화면과 서버 판정이 같은 자리를 본다
import { TARGET_X, TARGET_ROWS } from "./arena/target.mjs";

export const TARGET = {
  DURATION: 60000,   // 경기 시간(ms)
  LEAD: 600,         // 과녁이 나오기 이만큼 전에 알린다(늦게 받아 갑자기 나타나지 않게)
  GAP: 240,          // 맞힘 사이 최소 간격(ms): 종이 총 0.25초에서 시계 흔들림만큼 뺐다
  HIT_R: .4,         // 맞힘 반지름(칸, 0.5m). 브라우저가 총알과 과녁 가운데 거리로 본다
  BULLET: 19.5 / 1.25,   // 종이 총알 가로 빠르기(칸/초, 엔진 shootPaper 19.5m/s)
  RANGE: 16,         // 총알이 바닥에 떨어지기 전 닿는 거리(칸, 넉넉히)
  POINTS: [1, 3],    // 보통 · 금색
};
// 같은 seed면 같은 난수(mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r2 = (v) => Math.round(v * 100) / 100;
// 경기 일정: [{ id, at(시작 뒤 ms), life(ms), g(1 금색), row(레일 번호), y, kind: slide(한쪽 끝에서 다른 쪽) · swing(오락가락), x0, x1 | cx, amp, hz, ph }]
// 0.55~1.2초마다 하나. 보통은 3.6~5.6초 동안 천천히, 금색은 8개 중 하나꼴로 2.2~2.8초 동안 빠르게. 모두 경기 끝 0.3초 전에 사라진다
export function targetPlan(seed, dur = TARGET.DURATION) {
  const r = rng(seed), out = [], [X0, X1] = TARGET_X, pick = (a, b) => a + r() * (b - a);
  for (let at = 600; ; at += Math.round(pick(550, 1200))) {
    const g = r() < .125 ? 1 : 0, life = Math.min(Math.round(g ? pick(2200, 2800) : pick(3600, 5600)), dur - 300 - at);
    if (life < 1500) break;
    const row = g ? (r() < .6 ? 0 : 1 + Math.floor(r() * 3)) : Math.floor(r() * TARGET_ROWS.length);   // 금색은 먼 줄에 더 자주
    const t = { id: out.length, at, life, g, row, y: TARGET_ROWS[row] };
    if (r() < .65) { // 미끄러지기: 길이 L을 수명 동안 한 번
      const L = g ? pick(11, 16) : pick(8, 16), x = pick(X0, X1 - L), east = r() < .5;
      Object.assign(t, { kind: "slide", x0: r2(east ? x : x + L), x1: r2(east ? x + L : x) });
    } else { // 오락가락: 가운데 cx에서 ±amp, hz번/초
      const amp = g ? pick(2.5, 4) : pick(2, 4), hz = g ? pick(.3, .4) : pick(.15, .25);
      Object.assign(t, { kind: "swing", cx: r2(pick(X0 + amp, X1 - amp)), amp: r2(amp), hz: r2(hz), ph: r2(r() * Math.PI * 2) });
    }
    out.push(t);
  }
  return out;
}
// 과녁이 나온 뒤 ms가 지났을 때 가운데 자리(칸)
export function targetAt(t, ms) {
  if (t.kind === "swing") return { x: t.cx + t.amp * Math.sin(2 * Math.PI * t.hz * ms / 1000 + t.ph), y: t.y };
  const k = Math.min(1, Math.max(0, ms / t.life)); return { x: t.x0 + (t.x1 - t.x0) * k, y: t.y };
}
// 가장 빠를 때 빠르기(칸/초): 서버가 시계 어긋남만큼 맞힘 범위를 넓힌다
export const targetSpeed = (t) => (t.kind === "swing" ? 2 * Math.PI * t.hz * t.amp : Math.abs(t.x1 - t.x0) / t.life * 1000);
// 총구: 엔진 shootPaper처럼 몸에서 앞으로 0.6m, 옆으로 0.2m(칸으로)
export const muzzle = (x, y, dir) => ({ x: x + (Math.sin(dir) * .6 - Math.cos(dir) * .2) / 1.25, y: y + (Math.cos(dir) * .6 - Math.sin(dir) * .2) / 1.25 });
// (x, y)에서 dir로 at(서버 ms)에 쏜 총알이 과녁 t(at은 서버 ms)를 맞힐 수 있었나. 총알이 날아가는 동안 과녁도 움직인 만큼 따라가 본다
// 맞으면 { ht: 맞은 시각, along, off }, 아니면 null. tol: 옆으로 벗어나도 되는 거리(칸)
export function shotHits(t, x, y, dir, at, tol = TARGET.HIT_R) {
  const o = muzzle(x, y, dir), fx = Math.sin(dir), fy = Math.cos(dir);
  let ht = at, p = targetAt(t, ht - t.at);
  for (let i = 0; i < 3; i++) { const along = (p.x - o.x) * fx + (p.y - o.y) * fy; ht = at + Math.max(0, along) / TARGET.BULLET * 1000; p = targetAt(t, ht - t.at); }
  const along = (p.x - o.x) * fx + (p.y - o.y) * fy, off = Math.abs((p.x - o.x) * fy - (p.y - o.y) * fx);
  if (ht < t.at - 100 || ht > t.at + t.life + 150 || along < -.5 || along > TARGET.RANGE || off > tol) return null;
  return { ht, along, off };
}
