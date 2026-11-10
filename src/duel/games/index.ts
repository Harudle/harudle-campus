// 브라우저 종목 등록: 새 종목은 이 목록에 한 줄 더한다. 여기 없는 종목은 종목 고르기 창에 "준비 중"으로 보인다
import type { DuelGame } from "../client";
import { game as jump } from "./jump";
import { game as shoot } from "./shoot";

export const GAMES: Record<string, DuelGame> = { jump, shoot };
