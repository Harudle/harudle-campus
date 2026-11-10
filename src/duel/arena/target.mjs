// 과녁 사격장(23층): 북쪽 과녁 마당(레일 넷을 과녁이 오간다) · 가운데 사대(선수마다 칸막이로 나뉜 부스) · 남쪽 관전석
// 종이 AK는 위아래로 겨누지 못한다(총알이 빨라 거의 곧게 간다). 과녁 레일은 사대에서 4~12칸 사이에 둔다
import { arena, ring, tint, N } from "./kit.mjs";

export const TARGET_RANGE = { x: 15, y: 9, w: 26, h: 10 };   // 과녁이 다니는 곳(뒷벽과 사대 사이)
export const TARGET_X = [16, 40];                             // 과녁 가운데가 다니는 가로 범위(칸)
export const TARGET_ROWS = [10.5, 12.75, 15, 17.25];          // 레일 가운데 줄(북쪽부터). 먼 줄일수록 맞히기 어렵다
export const TARGET_RAIL = 19;                                 // 사대 앞 낮은 카운터 줄. 이보다 북쪽(과녁 마당)으로는 못 나간다
// 선수 부스(카운터 줄 포함). 0번 서쪽 · 1번 동쪽, 가운데 칸막이(27~28열)로 나뉜다
export const TARGET_BOOTHS = [{ x: 15, y: 19, w: 12, h: 4 }, { x: 29, y: 19, w: 12, h: 4 }];
export const TARGET_ARENA = arena({
  f: 23, game: "target", info: "과녁 사격장",
  rooms: [ring(14, 7, 28, 17, { wall: 0xE9D8B8 }), ring(14, 24, 28, 5)],   // 마당과 사대는 한 방(난간이 총알을 막으므로), 관전석은 뒤에 따로
  zones: [tint(15, 8, 26, 11, "과녁 마당", "#EAF3E2"), tint(15, 20, 12, 3, "1번 사대", "#E3ECFA"), tint(29, 20, 12, 3, "2번 사대", "#FBE6E4"), tint(15, 25, 26, 3, "관전석", "#ECEAF4")],
  furn: [
    { kind: "tback", x: 15, y: 8, w: 26, h: 1 },                                         // 뒷벽(과녁판 · 점수판)
    ...TARGET_ROWS.map((r, i) => ({ kind: "ttrack", x: 15, y: r - .5, w: 26, h: 1, walk: true, n: i })),   // 과녁 레일(밟고 지나감)
    ...TARGET_BOOTHS.map((b, i) => ({ kind: "tcounter", x: b.x, y: TARGET_RAIL, w: b.w, h: 1, top: .45, seat: i })),   // 낮은 카운터: 총알은 위로 지나간다
    { kind: "tdiv", x: 27, y: 19, w: 2, h: 4 },                                          // 부스 칸막이
  ],
  spawns: [[21, 21.5, N], [35, 21.5, N]],
  watch: [[20, 26.5, N], [28, 26.5, N], [36, 26.5, N]],
});
