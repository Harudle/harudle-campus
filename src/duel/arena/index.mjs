// 대결장 층 모음: world.ts가 층(FLOORS)을 만들고, 서버 대결 규칙이 같은 배치(부활 자리 · 코스)를 읽는다
import { JUMP_ARENA } from "./jump.mjs";
import { SHOOT_ARENA } from "./shoot.mjs";
import { TARGET_ARENA } from "./target.mjs";
import { BOX_ARENA } from "./box.mjs";

export const ARENAS = [JUMP_ARENA, SHOOT_ARENA, TARGET_ARENA, BOX_ARENA];
export const arenaOfGame = (game) => ARENAS.find((a) => a.game === game) || null;
