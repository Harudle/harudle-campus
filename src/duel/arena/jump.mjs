// 점프맵 대결장(21층): 층을 남북 띠 넷으로 나눠 띠마다 코스 하나. 서쪽 출발대 → 체크포인트 둘 → 동쪽 도착대
// 발판은 구름 바닥에서 솟은 기둥(top: 윗면 높이 m)이고, 구름 바닥에 발이 닿으면 떨어진 것이다(마지막 발판으로 돌아간다).
// 점프 한 번 약 0.7m, 더블 점프 약 1.3m, 걸어서 넘는 턱 0.26m. 그래서 한 번에 오르는 높이는 1.5m 아래로, 틈은 4칸 아래로 둔다
import { arena, ring, tint, E } from "./kit.mjs";

export const JUMP_RUN = 7.3;                 // 달리기 빠르기(칸/초): 구간 최소 시간을 셈한다
export const JUMP_BOUNCE = 8;                // 트램펄린이 튕겨 주는 속도(m/s, 엔진 점프는 4.6)
const STRIP = 9, X0 = 2;                     // 띠 높이(위아래 난간 포함) · 출발대 서쪽 끝
// 구간: [앞 틈, 길이(x), 높이, 줄(0~6, 북쪽부터), 폭(줄 수), 종류] 종류: b 발판 · t 트램펄린 · cp 체크포인트 · end 도착
const DEFS = [
  { id: "cloud", name: "구름 계단", segs: [
    [1, 2, .8, 2, 3], [2, 2, 1.2, 1, 3], [2, 2, 1.6, 3, 3], [2, 3, 1.2, 2, 3], [2, 3, 1.4, 0, 7, "cp"],
    [2, 1, 1.8, 0, 2], [2, 1, 2.2, 2, 2], [2, 1, 2.6, 4, 2], [2, 2, 2, 2, 3], [2, 3, 2, 0, 7, "cp"],
    [2, 2, .6, 2, 3, "t"], [2, 3, 2.6, 0, 7, "end"]] },
  { id: "stone", name: "징검다리", segs: [
    [1, 1, .7, 1, 2], [2, 1, .9, 4, 2], [2, 1, 1.1, 1, 2], [2, 1, 1.3, 4, 2], [2, 2, 1, 2, 3], [2, 3, 1.2, 0, 7, "cp"],
    [2, 1, 1.5, 0, 2], [1, 1, 1.8, 3, 2], [1, 1, 2.1, 5, 2], [2, 1, 1.6, 2, 2], [2, 1, 2, 0, 2], [2, 3, 2, 0, 7, "cp"],
    [2, 1, 2.4, 2, 3], [2, 1, 2.8, 4, 3], [2, 3, 2.8, 0, 7, "end"]] },
  { id: "spring", name: "통통 트램펄린", segs: [
    [2, 2, .4, 2, 3, "t"], [2, 3, 2, 2, 3], [2, 2, 1.2, 1, 3], [2, 3, 1.2, 0, 7, "cp"],
    [2, 2, .6, 3, 3, "t"], [2, 2, 2.6, 1, 3], [2, 2, .8, 4, 3, "t"], [2, 2, 3.2, 2, 3], [2, 3, 3, 0, 7, "cp"],
    [2, 2, 2.2, 1, 2], [2, 3, 2.6, 0, 7, "end"]] },
  { id: "tower", name: "하늘 탑", segs: [
    [1, 2, 1, 0, 3], [1, 2, 1.6, 4, 3], [1, 2, 2.2, 0, 3], [2, 3, 1.6, 2, 3], [2, 3, 1.8, 0, 7, "cp"],
    [2, 1, 2.9, 3, 2], [2, 1, 2.3, 0, 2], [2, 1, 3.4, 3, 2], [2, 2, 2.8, 5, 2], [2, 3, 2.6, 0, 7, "cp"],
    [2, 1, 3.2, 1, 2], [2, 1, 3.6, 4, 2], [2, 3, 3, 0, 7, "end"]] },
];
// 코스 하나: pads[0] 출발대 · pads[1..] 체크포인트 · 마지막이 도착대. minT[i]는 pads[i-1]에서 pads[i]까지 최소 시간(ms)
function course(def, k) {
  const y0 = 1 + k * STRIP, iy = y0 + 1, pads = [{ x: X0, y: iy, w: 3, h: 7, top: .5 }], blocks = [];
  let x = X0 + 3;
  for (const [gap, len, top, lane = 0, rows = 7, kind = "b"] of def.segs) {
    x += gap; const b = { x, y: iy + lane, w: len, h: rows, top, kind }; x += len;
    (kind === "cp" || kind === "end" ? pads : blocks).push(b);
  }
  const cx = (r) => r.x + r.w / 2, minT = pads.map((p, i) => (i ? Math.round((cx(p) - cx(pads[i - 1])) / JUMP_RUN * 1000 * .7) : 0));
  const spot = (p) => [cx(p), p.y + p.h / 2, E];   // 체크포인트로 돌아올 때 서는 자리(동쪽을 본다)
  return { id: def.id, name: def.name, k, y0, pads, blocks, minT, spot: pads.map(spot), spawns: [[X0 + 1.5, iy + 1.5, E], [X0 + 1.5, iy + 5.5, E]], watch: [[X0 + 1.5, iy + 3.5, E]] };
}
export const JUMP_COURSES = DEFS.map(course);

export const JUMP_ARENA = (() => {
  const a = arena({ f: 21, game: "jump", info: "점프맵 대결장", spawns: JUMP_COURSES[0].spawns, watch: JUMP_COURSES[0].watch, starts: JUMP_COURSES.map((c) => [c.pads[0].x + 3.5, c.pads[0].y + 3.5]) });
  for (const c of JUMP_COURSES) {
    a.rooms.push(ring(1, c.y0, 54, STRIP));
    a.zones.push(tint(2, c.y0 + 1, 52, 7, `${c.name} 코스`, "#DCEBFC", { checker: ["#E4F0FD", "#D2E4F9"] }));
    c.pads.forEach((p, i) => a.furn.push({ ...p, kind: "jpad", mark: i === 0 ? "start" : i === c.pads.length - 1 ? "end" : "cp", n: i, course: c.k }));
    for (const b of c.blocks) a.furn.push({ ...b, kind: b.kind === "t" ? "jtramp" : "jblock", ...(b.kind === "t" ? { bounce: JUMP_BOUNCE } : {}), course: c.k });
  }
  return a;
})();
