// 복싱 링(24층): 가운데 6×6칸 링(로프 안), 둘레 관전 마당과 관전 의자. 선수는 대각선 코너(0 파랑 북서 · 1 빨강 남동)에서 마주 보고 선다
// 링 난간(방 벽 0.45m)이 걸어서 못 나가게 막고, 기둥 · 로프 · 매트는 그림(boxring, 밟고 지나감). 점프로 넘으면 브라우저가 링 안으로 되돌린다
import { arena, ring, tint, E, Wd } from "./kit.mjs";

export const BOX_RING = { x: 25, y: 17, w: 6, h: 6 };   // 로프 안쪽(선수가 다니는 곳)
// 규칙 수(서버 판정과 브라우저 간격이 같은 값을 쓴다). 시간은 ms, 거리는 칸
export const BOX = {
  HP: 100, RANGE: 1.3, ANGLE: Math.PI / 3, GUARD: .3, GAP: 180,   // GAP: 잽 · 스트레이트를 섞어도 주먹 사이 최소 간격
  PUNCH: { jab: { dmg: 8, gap: 350 }, str: { dmg: 14, gap: 700 } },
};
// 마주 보는 방향: 대각선 반대 코너 쪽(h = atan2(dx, dy))
const face = (x, y, tx, ty) => Math.atan2(tx - x, ty - y);
const SP = [[26.2, 18.2], [29.8, 21.8]];
export const BOX_ARENA = arena({
  f: 24, game: "box", info: "복싱 링",
  rooms: [ring(18, 10, 20, 20, { wall: 0xD9CDE8 }), ring(24, 16, 8, 8, { wall: 0x3A4A7A })],
  zones: [tint(19, 11, 18, 18, "관전 마당", "#EFECF6"), tint(25, 17, 6, 6, "링", "#F7E7C6")],
  furn: [
    { kind: "boxring", x: 24, y: 16, w: 8, h: 8, walk: true },
    // 관전 의자: 올라서면 링이 잘 보인다(윗면 0.42m, 점프로 올라선다)
    { kind: "boxbench", x: 22, y: 11, w: 12, h: 1, top: .42 },
    { kind: "boxbench", x: 22, y: 28, w: 12, h: 1, top: .42 },
    { kind: "boxbench", x: 19, y: 14, w: 1, h: 12, top: .42 },
    { kind: "boxbench", x: 36, y: 14, w: 1, h: 12, top: .42 },
  ],
  spawns: [[...SP[0], face(...SP[0], ...SP[1])], [...SP[1], face(...SP[1], ...SP[0])]],
  watch: [[21.5, 20, E], [34.5, 20, Wd], [28, 13.5, 0], [28, 26.5, Math.PI], [21.5, 15, E], [34.5, 25, Wd]],
});
