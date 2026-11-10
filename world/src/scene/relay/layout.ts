import type { DoorSpot, SpaceBounds } from '../gallery/layout.ts'
import { benchSeats } from '../seats.ts'

export const RELAY_HALF_X = 6.5
export const RELAY_HALF_Z = 21
export const RELAY_WALL_HEIGHT = 6

export const EASEL_POSITION = { x: 0, z: -16 }

/** 벽 필름 위 에피소드 자리. 입구에서 안쪽으로 갈수록 뒷화다. */
export const FRAME_Z = [10, 4, -2, -8]

export const RELAY_BENCHES = [8, -2, -11].flatMap((z) => [
  { x: -4.6, z, rotationY: 0 },
  { x: 4.6, z, rotationY: 0 },
])

export const RELAY_SPACE: SpaceBounds = {
  halfX: RELAY_HALF_X,
  halfZ: RELAY_HALF_Z,
  obstacles: [
    ...RELAY_BENCHES.map((bench) => ({ x: bench.x, z: bench.z, radius: 1.3 })),
    { x: EASEL_POSITION.x, z: EASEL_POSITION.z, radius: 1.8 },
  ],
  seats: benchSeats(RELAY_BENCHES),
}

export const RELAY_START = { x: 0, z: 16 }

export const RELAY_EXIT_DOOR: DoorSpot = {
  id: 'lobby',
  label: '로비로',
  x: 0,
  z: RELAY_HALF_Z,
  rotationY: Math.PI,
}
