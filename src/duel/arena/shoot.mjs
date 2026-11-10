// 사격 대결장(22층): 난간 안 28×24칸 경기장에 높이가 다른 엄폐물(높은 벽 · 컨테이너 · 2단 상자 · 상자 · 통 · 모래주머니)과 올라서는 단상, 북서 · 남동 구석이 두 선수 자리, 남쪽 난간 너머 관전석
// 엄폐물은 경기장 한가운데를 두고 180도 돌려도 같은 모양(어느 자리든 공평하게). 올라설 수 없고(top 없음) 제 높이(ht)까지 오는 종이 총알을 막는다
import { arena, ring, tint, N } from "./kit.mjs";

// 규칙 숫자: 서버 판정(server/duel/games/shoot.js)과 브라우저 HUD가 같이 쓴다
// 종이 AK-47(FPS 1:1처럼): 탄창 20발 · 연사 0.13초 · 장전 2.2초. 체력 200에 몸 15 · 머리 26(1.75배)이라 몸만이면 열네 발, 머리만이면 여덟 발
export const SHOOT = {
  HP: 200, DMG: 15, WIN: 2,          // 체력 · 한 발 · 이겨야 하는 라운드 수(3판 2선승)
  HEAD: 1.75, HEAD_Y: .7,            // 헤드샷 배수 · 머리로 치는 높이(인형 발에서 m, 인형은 1.15m)
  MUZZLE: .82,                       // 총구 높이(발 + m, 엔진 MUZZLE.up과 같게): 서버가 위아래(fp)로 맞은 높이를 셈한다
  ROUND: 60000, READY: 3000,         // 라운드 제한 · 다음 라운드 전 3·2·1
  MAX_ROUNDS: 6,                     // 무승부로 다시 하는 판까지 합쳐 이만큼 하면 라운드 수로 끝낸다
  MAG: 20, RELOAD: 2200, FIRE: 130,  // 탄창 · 장전 시간 · 연사 간격(ms, 브라우저가 지킨다)
  GAP: 110,                          // 서버가 받는 연사 간격(FIRE에서 시계 흔들림을 조금 봐준다)
  SPEED: 27.2,                       // 종이 총알 빠르기(칸/초, 엔진 34m/s)
  RANGE: 32,                         // 맞힐 수 있는 거리(칸). 빨라서 경기장 끝에서 끝까지 거의 곧게 간다
  WIDE: 1,                           // 쏜 줄에서 옆으로 벗어나도 되는 거리(칸): 총알 반지름 · 손 위치 · 위치가 늦게 오는 것
  OVER: .65,                         // 이만큼(m) 높이서 쏘면 상자 · 통(1.2m) 위로 넘어간다. 높은 벽 · 컨테이너 · 2단 상자(2m 넘게)는 뛰어도 못 넘는다
};
export const SHOOT_FIELD = { x: 14, y: 5, w: 28, h: 24 };   // 난간 안쪽(선수가 다니는 곳, 35×30m)
const CX = SHOOT_FIELD.x * 2 + SHOOT_FIELD.w, CY = SHOOT_FIELD.y * 2 + SHOOT_FIELD.h;   // 180도 돌리기: (x, y, w, h) → (CX - x - w, CY - y - h)
const rot = ([x, y, w, h, ...r]) => [CX - x - w, CY - y - h, w, h, ...r];
// 엄폐물 높이(m, 캐릭터는 1.15m · 한 번 뛰면 머리가 1.85m쯤): 높은 벽 · 컨테이너 · 2단 상자는 뛰어도 다 가린다. 상자 · 통은 뛰면 보이고, 모래주머니는 다리만 가린다
export const COVER_HT = { tall: 2.8, container: 2.6, stack: 2.4, crate: 1.2, barrel: 1.2, sandbag: .8 };
const HALF = [   // [x, y, w, h, 모양] 한쪽 절반. 나머지는 돌려서 만든다
  [17, 9, 4, 2, "container"],   // 내 자리 앞 컨테이너(자리를 가린다)
  [38, 6, 2, 3, "container"],   // 비어 있는 구석 컨테이너
  [24, 6, 1, 4, "tall"],        // 북쪽 길을 나누는 벽
  [31, 5, 1, 2, "tall"],        // 북쪽 끝 짧은 벽(가장자리를 끝까지 못 보게)
  [40, 19, 2, 1, "tall"],       // 동쪽 끝 짧은 벽
  [29, 12, 1, 3, "tall"],       // 가운데를 도는 벽(바람개비 모양)
  [22, 15, 3, 1, "tall"],
  [15, 15, 2, 2, "stack"],      // 2단 상자 더미
  [21, 11, 2, 2, "crate"],      // 상자
  [33, 8, 1, 1, "barrel"], [19, 20, 1, 1, "barrel"],
  [35, 10, 3, 1, "sandbag"],    // 모래주머니(다리만 가린다)
];
export const SHOOT_COVER = [
  ...HALF.flatMap((c) => [c, rot(c)]),
  [27, 16, 2, 2, "crate", true],   // 한가운데 큰 상자(뛰면 너머가 보인다)
].map(([x, y, w, h, look, big]) => ({ x, y, w, h, look, ht: COVER_HT[look], ...(big ? { big } : {}) }));
// 올라설 수 있는 단상(top): 계단(0.45m)을 밟고 뛰어 0.9m 단에 오르면 상자 · 통 너머를 쏠 수 있다
export const SHOOT_DECKS = [[36, 14, 3, 2, .9], [36, 16, 3, 1, .45, "step"]].flatMap((d) => [d, rot(d)])
  .map(([x, y, w, h, top, look]) => ({ x, y, w, h, top, look: look || "deck" }));
export const SHOOT_ARENA = arena({
  f: 22, game: "shoot", info: "사격 대결장",
  rooms: [ring(13, 4, 30, 26, { wall: 0xE8B9A6 }), ring(13, 30, 30, 5)],
  zones: [
    tint(14, 5, 28, 24, "사격 경기장", "#F3EEE4"),   // 바둑판(checker)은 tint 위에 그려져 자리 색을 덮으므로 쓰지 않는다
    tint(14, 5, 3, 3, "빨강 자리", "#F6D3CC"), tint(39, 26, 3, 3, "파랑 자리", "#CFE0F6"),
    tint(14, 31, 28, 3, "관전석", "#ECEAF4"),
  ],
  furn: [...SHOOT_COVER.map((c) => ({ ...c, kind: "scover" })), ...SHOOT_DECKS.map((d) => ({ ...d, kind: "sdeck" }))],
  spawns: [[15.5, 6.5, Math.PI / 4], [40.5, 27.5, -Math.PI * 3 / 4]],   // 북서 구석(남동을 본다) · 남동 구석(북서를 본다)
  watch: [[20.5, 32.5, N], [28, 32.5, N], [35.5, 32.5, N]],
});
