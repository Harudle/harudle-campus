export type Seat = { x: number; z: number }

const SEAT_OFFSET = 0.6

/** 벤치 하나에 두 명이 앉는다. 벤치는 모두 +z를 바라본다. */
export function benchSeats(benches: { x: number; z: number }[]): Seat[] {
  return benches.flatMap(({ x, z }) => [
    { x: x - SEAT_OFFSET, z },
    { x: x + SEAT_OFFSET, z },
  ])
}
