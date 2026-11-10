// 복싱 링(24층): 임시 배치. 6×6칸 링(로프 안), 둘레에 관전 마당. 링 기둥 · 로프는 복싱 종목을 만들 때 채운다
import { arena, ring, tint, E, Wd } from "./kit.mjs";

export const BOX_RING = { x: 25, y: 17, w: 6, h: 6 };   // 로프 안쪽
export const BOX_ARENA = arena({
  f: 24, game: "box", info: "복싱 링",
  rooms: [ring(18, 10, 20, 20, { wall: 0xD9CDE8 }), ring(24, 16, 8, 8, { wall: 0xE46F6F })],
  zones: [tint(19, 11, 18, 18, "관전 마당", "#EFECF6"), tint(25, 17, 6, 6, "링", "#F7E7C6")],
  furn: [],
  spawns: [[26.5, 20, E], [29.5, 20, Wd]],
  watch: [[21.5, 20, E], [34.5, 20, Wd], [28, 13.5, 0], [28, 26.5, Math.PI]],
});
