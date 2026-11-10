/** 뛰어들 수 있는 그림. 피드에는 만화 내용이 글로 오지 않아서, 만화를 보고 게임을 하나씩 직접 만든다. */
export const CRAB_GAME_WORK_ID = 'bd08fbb7-5aef-4dbc-9820-30344fe8431e'

/** 이미지에서 각 컷이 있는 자리(0~1) */
export type ComicPanel = { x: number; y: number; width: number; height: number }

export const CRAB_GAME_PANELS: ComicPanel[] = [
  { x: 0.028, y: 0.03, width: 0.465, height: 0.455 },
  { x: 0.503, y: 0.03, width: 0.47, height: 0.455 },
  { x: 0.028, y: 0.495, width: 0.465, height: 0.455 },
  { x: 0.503, y: 0.495, width: 0.47, height: 0.455 },
]
