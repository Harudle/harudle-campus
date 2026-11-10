// 사격 대결장(22층): 난간 안 20×20칸 경기장에 엄폐물(상자 · 종이벽 · 통), 북서 · 남동 구석이 두 선수 자리, 남쪽 난간 너머 관전석
// 엄폐물은 경기장 한가운데를 두고 180도 돌려도 같은 모양(어느 자리든 공평하게). 올라설 수 없고(top 없음) 1.25m 아래로 오는 종이 총알을 막는다
import { arena, ring, tint, N } from "./kit.mjs";

// 규칙 숫자: 서버 판정(server/duel/games/shoot.js)과 브라우저 HUD가 같이 쓴다
// 종이 AK-47(FPS 1:1처럼): 탄창 20발 · 연사 0.13초 · 장전 2.2초, 한 발 15라 일곱 발이면 쓰러진다(한 탄창의 35%를 맞혀야 한다)
export const SHOOT = {
  HP: 100, DMG: 15, WIN: 2,          // 체력 · 한 발 · 이겨야 하는 라운드 수(3판 2선승)
  ROUND: 60000, READY: 3000,         // 라운드 제한 · 다음 라운드 전 3·2·1
  MAX_ROUNDS: 6,                     // 무승부로 다시 하는 판까지 합쳐 이만큼 하면 라운드 수로 끝낸다
  MAG: 20, RELOAD: 2200, FIRE: 130,  // 탄창 · 장전 시간 · 연사 간격(ms, 브라우저가 지킨다)
  GAP: 110,                          // 서버가 받는 연사 간격(FIRE에서 시계 흔들림을 조금 봐준다)
  SPEED: 27.2,                       // 종이 총알 빠르기(칸/초, 엔진 34m/s)
  RANGE: 22,                         // 맞힐 수 있는 거리(칸). 빨라서 경기장 끝에서 끝까지 거의 곧게 간다
  WIDE: 1,                           // 쏜 줄에서 옆으로 벗어나도 되는 거리(칸): 총알 반지름 · 손 위치 · 위치가 늦게 오는 것
  OVER: .65,                         // 이만큼(m) 높이서 쏘면 엄폐물 위로 넘어간다(총알은 발 + 0.6m에서 나간다)
};
export const SHOOT_FIELD = { x: 18, y: 7, w: 20, h: 20 };   // 난간 안쪽(선수가 다니는 곳)
const CX = SHOOT_FIELD.x * 2 + SHOOT_FIELD.w, CY = SHOOT_FIELD.y * 2 + SHOOT_FIELD.h;   // 180도 돌리기: (x, y, w, h) → (CX - x - w, CY - y - h)
const HALF = [   // [x, y, w, h, 모양] 한쪽 절반. 나머지는 돌려서 만든다
  [22, 10, 2, 2, "crate"],    // 내 자리 앞 상자
  [34, 9, 2, 2, "crate"],     // 비어 있는 구석 상자
  [30, 10, 3, 1, "wall"],     // 가로 종이벽
  [23, 14, 1, 3, "wall"],     // 세로 종이벽
  [27, 12, 1, 1, "barrel"],   // 가운데 앞 통
  [19, 17, 1, 1, "barrel"],   // 옆 통
];
export const SHOOT_COVER = [
  ...HALF.flatMap(([x, y, w, h, look]) => [{ x, y, w, h, look }, { x: CX - x - w, y: CY - y - h, w, h, look }]),
  { x: 27, y: 16, w: 2, h: 2, look: "crate", big: true },   // 한가운데 큰 상자
];
export const SHOOT_ARENA = arena({
  f: 22, game: "shoot", info: "사격 대결장",
  rooms: [ring(17, 6, 22, 22, { wall: 0xE8B9A6 }), ring(17, 28, 22, 5)],
  zones: [
    tint(18, 7, 20, 20, "사격 경기장", "#F3EEE4"),   // 바둑판(checker)은 tint 위에 그려져 자리 색을 덮으므로 쓰지 않는다
    tint(18, 7, 3, 3, "빨강 자리", "#F6D3CC"), tint(35, 24, 3, 3, "파랑 자리", "#CFE0F6"),
    tint(18, 29, 20, 3, "관전석", "#ECEAF4"),
  ],
  furn: SHOOT_COVER.map((c) => ({ ...c, kind: "scover" })),
  spawns: [[19.5, 8.5, Math.PI / 4], [36.5, 25.5, -Math.PI * 3 / 4]],   // 북서 구석(남동을 본다) · 남동 구석(북서를 본다)
  watch: [[22.5, 30.5, N], [28, 30.5, N], [33.5, 30.5, N]],
});
