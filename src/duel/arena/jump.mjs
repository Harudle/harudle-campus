// 점프맵 대결장(21층): 미니 온리업 탑. 층을 사분면 넷으로 나눠 사분면마다 탑 하나(코스 하나)
// 출발대에서 탑 바깥 바퀴(15×15칸 둘레)를 시계 방향으로 돌며 오르고, 체크포인트에서 안쪽 바퀴(9×9칸)로 들어가 한 번 더 돌아 꼭대기 도착대(25m쯤)로.
// 발판은 대부분 한 칸짜리이고 공중에 떠 있는 잡동사니처럼 그린다(나무 상자 · 파이프 · 깡통 · 책 더미 · 철골). 부딪히는 것은 바닥까지 이어진 칸 기둥이다.
// 바닥(구름)에 발이 닿으면 떨어진 것이다(체크포인트 · 출발대로 돌아간다). 떨어지다 아래 바퀴 발판에 걸리면 거기서 다시 오른다.
// 점프 한 번 약 0.7m, 더블 점프 약 1.3m, 걸어서 넘는 턱 0.26m, 트램펄린 + 더블 점프 약 3m. 그래서 한 번에 오르는 높이는 1.3m(트램펄린 뒤 2.6m) 아래로, 틈은 3칸 아래로 둔다
import { arena, ring, tint, E } from "./kit.mjs";

export const JUMP_RUN = 7.3;                 // 달리기 빠르기(칸/초): 구간 최소 시간을 셈한다
export const JUMP_BOUNCE = 8;                // 트램펄린이 튕겨 주는 속도(m/s, 엔진 점프는 4.6)
export const JUMP_CEIL = 40;                 // 이 층은 카메라 천장을 높인다(꼭대기가 25m쯤)
const OUTER = 15, INNER = 9;                 // 바퀴 한 변(칸)
const LOOKS = ["crate", "pipe", "can", "books", "beam"];
// 코스: rise 오르는 높이 범위(m) · drop 몇 번째마다 살짝 내려가는지 · tramp 트램펄린을 둘 발판 번호(바퀴 안 순서) · seed 모양 · 간격 섞기
const DEFS = [
  { id: "tower-sky", name: "하늘 탑", seed: 11, rise: [1, 1.25], drop: 6, tramp: [9] },
  { id: "tower-junk", name: "고물 탑", seed: 23, rise: [1.05, 1.28], drop: 7, tramp: [] },
  { id: "tower-bounce", name: "통통 탑", seed: 37, rise: [1, 1.2], drop: 5, tramp: [4, 12] },
  { id: "tower-onlyup", name: "온리 업", seed: 59, rise: [1.15, 1.3], drop: 0, tramp: [] },
];
// 사분면 안쪽(난간 안) 왼쪽 위 칸과 크기: 층 56×40을 넷으로
const QUADS = [[2, 2], [29, 2], [2, 21], [29, 21]], QW = 25, QH = 17;

const lcg = (seed) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
// 한 변 L인 정사각형 둘레의 p번째 칸(왼쪽 위 모서리에서 시계 방향)
function perim(rx, ry, L, p) {
  const s = L - 1;
  if (p < s) return [rx + p, ry];
  if (p < 2 * s) return [rx + s, ry + p - s];
  if (p < 3 * s) return [rx + s - (p - 2 * s), ry + s];
  return [rx, ry + s - (p - 3 * s)];
}
// 3칸 · 4칸 걸음(틈 2 · 3)을 섞어 합이 total이 되게: 바퀴 끝이 안쪽 바퀴 들어가는 자리 바로 옆에 오도록
function steps(total, r) {
  const four = (total - 3 * Math.floor(total / 3)) % 3, n4 = [0, 4, 2][four] + 3 * Math.floor(r() * 2);   // 4a + 3b = total 이 되는 a(늘 가능한 작은 해 + 3의 배수)
  const n3 = (total - 4 * n4) / 3, out = [...Array(n4).fill(4), ...Array(n3).fill(3)];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
// 코스 하나: pads[0] 출발대 · pads[1] 체크포인트(안쪽 바퀴 첫 칸) · pads[2] 꼭대기 도착대. path는 밟는 순서 전체(검사용)
function course(def, k) {
  const r = lcg(def.seed), [qx, qy] = QUADS[k], rx = qx + 7, ry = qy + 1;
  const start = { x: rx - 4, y: ry, w: 3, h: 3, top: .5, kind: "start" }, pads = [start], blocks = [], path = [start];
  let top = start.top, n = 0;
  const rise = () => def.rise[0] + r() * (def.rise[1] - def.rise[0]);
  const put = (x, y, kind = "b", w = 1, h = 1) => {
    n++;
    const prev = path[path.length - 1], dropNow = kind === "b" && def.drop && n % def.drop === 0, bounce = prev.kind === "t";
    top = Math.round((dropNow ? top - .5 : bounce ? top + 2.4 : kind === "t" ? top + .3 : top + rise()) * 100) / 100;
    const b = { x, y, w, h, top, kind, look: LOOKS[Math.floor(r() * LOOKS.length)] };
    (kind === "cp" || kind === "end" ? pads : blocks).push(b); path.push(b);
  };
  // 바깥 바퀴: (rx, ry)에서 시작해 한 바퀴 돌고 (rx, ry + 3)에서 끝난다
  let p = 0; const s1 = steps(4 * (OUTER - 1) - 3, r);
  for (let i = 0; i <= s1.length; i++) { const [x, y] = perim(rx, ry, OUTER, p); put(x, y, def.tramp.includes(i) ? "t" : "b"); p += s1[i] ?? 0; }
  // 안쪽 바퀴: 첫 칸이 체크포인트, (rx + 3, ry + 6)에서 끝난다
  p = 0; const s2 = steps(4 * (INNER - 1) - 3, r);
  for (let i = 0; i <= s2.length; i++) { const [x, y] = perim(rx + 3, ry + 3, INNER, p); put(x, y, i === 0 ? "cp" : def.tramp.includes(i + 20) ? "t" : "b"); p += s2[i] ?? 0; }
  put(rx + 6, ry + 6, "end", 3, 3);   // 꼭대기: 안쪽 바퀴 한가운데 3×3
  const cx = (o) => o.x + o.w / 2, cy = (o) => o.y + o.h / 2;
  const minT = pads.map((o, i) => (i ? Math.round(path.slice(path.indexOf(pads[i - 1]) + 1, path.indexOf(o) + 1).reduce((t, b, j, a) => t + Math.hypot(cx(b) - cx(j ? a[j - 1] : pads[i - 1]), cy(b) - cy(j ? a[j - 1] : pads[i - 1])), 0) / JUMP_RUN * 1000 * .5) : 0));   // 밟는 순서대로 간 거리의 절반 빠르기
  const spot = (o) => [cx(o), cy(o), E];
  return { id: def.id, name: def.name, k, quad: [qx, qy], pads, blocks, path, minT, spot: pads.map(spot), spawns: [[start.x + 1.5, start.y + .8, E], [start.x + 1.5, start.y + 2.2, E]], watch: [[qx + 1.5, qy + QH / 2, E]] };
}
export const JUMP_COURSES = DEFS.map(course);

export const JUMP_ARENA = (() => {
  const a = arena({ f: 21, game: "jump", info: "점프맵 대결장", ceil: JUMP_CEIL, spawns: JUMP_COURSES[0].spawns, watch: JUMP_COURSES[0].watch, starts: JUMP_COURSES.map((c) => [c.pads[0].x + 1.5, c.pads[0].y + 1.5]) });
  for (const c of JUMP_COURSES) {
    const [qx, qy] = c.quad;
    a.rooms.push(ring(qx - 1, qy - 1, QW + 2, QH + 2));
    a.zones.push(tint(qx, qy, QW, QH, `${c.name} 코스`, "#DCEBFC", { checker: ["#E4F0FD", "#D2E4F9"] }));
    c.pads.forEach((p, i) => a.furn.push({ x: p.x, y: p.y, w: p.w, h: p.h, top: p.top, kind: "jpad", mark: i === 0 ? "start" : i === c.pads.length - 1 ? "end" : "cp", n: i, course: c.k }));
    for (const b of c.blocks) a.furn.push({ x: b.x, y: b.y, w: b.w, h: b.h, top: b.top, look: b.look, kind: b.kind === "t" ? "jtramp" : "jblock", ...(b.kind === "t" ? { bounce: JUMP_BOUNCE } : {}), course: c.k });
  }
  return a;
})();
