// 대결장 배치 도우미(three.js 없이). world.ts가 층을 만들고, 서버 규칙도 같은 배치를 읽는다
// 대결장 = { f, game, info, rooms, furn, zones, spawns[[x, y, 방향]×2], watch[[x, y, 방향]…], starts[[x, y]…] }
// 좌표는 캠퍼스와 같은 56×40칸(한 칸 1.25m). 방향(h)은 엔진의 me.h와 같다: 0 남쪽(+y) · π/2 동쪽(+x)
export const E = Math.PI / 2, Wd = -Math.PI / 2, N = Math.PI, Sd = 0;
// 사방이 막힌 낮은 난간 방(문 없음). 안쪽은 (x+1, y+1)부터 (w-2)×(h-2)칸
export const ring = (x, y, w, h, o = {}) => ({ x, y, w, h, name: "", ring: true, wall: 0xC9D6EE, ...o });
// 바닥 색 구역(이름은 /찾기 · 크루 목록에 쓰지 않는다. 대결장은 따로 표시한다)
export const tint = (x, y, w, h, name, color, o = {}) => ({ x, y, w, h, name, desc: "", npc: false, tint: color, ...o });
export function arena(def) {
  return { rooms: [], furn: [], zones: [], watch: [], ...def, starts: def.starts?.length ? def.starts : [...(def.watch || []), ...(def.spawns || [])].map(([x, y]) => [x, y]) };
}
// 점이 칸 사각형(x, y, w, h)에서 떨어진 거리(칸). 안이면 0
export const rectDist = (r, x, y) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));
