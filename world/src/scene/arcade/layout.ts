import type { ArcadeRoomId } from '../../data/arcadeQuizzes'
import type { DoorSpot, SpaceBounds } from '../gallery/layout.ts'
import { benchSeats } from '../seats.ts'

/** 입구 홀. 방문자 100명이 1인당 약 11칸씩 쓸 수 있는 크기다. */
export const ARCADE_HALF_X = 20
export const ARCADE_HALF_Z = 14
export const ARCADE_WALL_HEIGHT = 8

/** 퀴즈 방 하나. 100명이 한 방에 모여도 1인당 약 9칸이다. */
export const QUIZ_ROOM_HALF_X = 17
export const QUIZ_ROOM_HALF_Z = 13

export const HUB_BENCHES = [-15, -8, 8, 15].flatMap((x) => [
  { x, z: 7, rotationY: 0 },
  { x, z: -2, rotationY: 0 },
])

export const QUIZ_ROOM_BENCHES = [-12, -5, 5, 12].map((x) => ({ x, z: 5, rotationY: 0 }))

function spaceOf(halfX: number, halfZ: number, benches: { x: number; z: number }[]): SpaceBounds {
  return {
    halfX,
    halfZ,
    obstacles: benches.map(({ x, z }) => ({ x, z, radius: 1.3 })),
    seats: benchSeats(benches),
  }
}

export const HUB_SPACE = spaceOf(ARCADE_HALF_X, ARCADE_HALF_Z, HUB_BENCHES)
export const QUIZ_ROOM_SPACE = spaceOf(QUIZ_ROOM_HALF_X, QUIZ_ROOM_HALF_Z, QUIZ_ROOM_BENCHES)

export const HUB_START = { x: 0, z: 3 }
export const QUIZ_ROOM_START = { x: 0, z: 2 }

const ROOM_DOOR_X = [-6, 6]

export const LOBBY_DOOR_ID = 'lobby'
export const HUB_DOOR_ID = 'hub'

export function hubDoors(rooms: { id: ArcadeRoomId; label: string; color: string }[]): DoorSpot[] {
  return [
    ...rooms.map((room, index) => ({
      id: room.id,
      label: '입장',
      plate: room.label,
      color: room.color,
      x: ROOM_DOOR_X[index],
      z: -ARCADE_HALF_Z,
      rotationY: 0,
    })),
    { id: LOBBY_DOOR_ID, label: '로비로', x: 0, z: ARCADE_HALF_Z, rotationY: Math.PI },
  ]
}

export const QUIZ_ROOM_EXIT_DOOR: DoorSpot = {
  id: HUB_DOOR_ID,
  label: '오락실로',
  x: 0,
  z: QUIZ_ROOM_HALF_Z,
  rotationY: Math.PI,
}

/** 문제 자리. 입장하자마자 보이는 뒷벽을 가운데부터 채운다. */
export const USER_BACK_X = [0, -4.6, 4.6, -9.2, 9.2, -13.8, 13.8]
/** 뒷벽이 차면 양옆 벽에 건다. */
export const USER_SIDE_OFFSETS = [-8.4, -2.8, 2.8, 8.4]
