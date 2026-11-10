// 과녁 사격장(23층): 임시 배치. 북쪽이 과녁이 지나가는 넓은 마당, 남쪽 사대에 두 선수, 그 뒤 관전석. 과녁 길은 과녁 종목을 만들 때 채운다
import { arena, ring, tint, N } from "./kit.mjs";

export const TARGET_RANGE = { x: 17, y: 7, w: 22, h: 12 };   // 과녁이 다니는 곳
export const TARGET_LINE = { x: 17, y: 21, w: 22, h: 4 };    // 사대: 선수가 서는 곳
export const TARGET_ARENA = arena({
  f: 23, game: "target", info: "과녁 사격장",
  rooms: [ring(16, 6, 24, 20, { wall: 0xE9D8B8 }), ring(16, 26, 24, 5)],   // 마당과 사대는 한 방(난간이 총알을 막으므로). 선수가 마당에 못 들어가게 하는 건 과녁 종목이 정한다
  zones: [tint(17, 7, 22, 12, "과녁 마당", "#EAF3E2"), tint(17, 21, 22, 4, "사대", "#F6EEDC"), tint(17, 27, 22, 3, "관전석", "#ECEAF4")],
  furn: [],
  spawns: [[24.5, 22.5, N], [31.5, 22.5, N]],
  watch: [[23.5, 28.5, N], [28, 28.5, N], [32.5, 28.5, N]],
});
