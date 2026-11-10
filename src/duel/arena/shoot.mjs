// 사격 대결장(22층): 임시 배치. 20×20칸 경기장(난간 안) + 남쪽 관전석. 엄폐물 · 부활 자리는 사격 종목을 만들 때 채운다
import { arena, ring, tint, E, Wd } from "./kit.mjs";

export const SHOOT_FIELD = { x: 19, y: 9, w: 18, h: 18 };   // 난간 안쪽(선수가 다니는 곳)
export const SHOOT_ARENA = arena({
  f: 22, game: "shoot", info: "사격 대결장",
  rooms: [ring(18, 8, 20, 20), ring(18, 28, 20, 5)],
  zones: [tint(19, 9, 18, 18, "사격 경기장", "#F3EEE4"), tint(19, 29, 18, 3, "관전석", "#ECEAF4")],
  furn: [],
  spawns: [[21.5, 18, E], [34.5, 18, Wd]],
  watch: [[24.5, 30.5, Math.PI], [28, 30.5, Math.PI], [31.5, 30.5, Math.PI]],
});
