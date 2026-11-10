import { ARCADE_HALF_X, ARCADE_HALF_Z } from '../arcade/layout.ts'
import { RELAY_HALF_X, RELAY_HALF_Z } from '../relay/layout.ts'
import { benchSeats, type Seat } from '../seats.ts'

export type Obstacle = { x: number; z: number; radius: number }

export type ArtSlot = {
  position: [number, number, number]
  rotationY: number
  size: number
}

/** 걸어 다닐 수 있는 한 공간의 크기와 장애물 */
export type SpaceBounds = {
  halfX: number
  halfZ: number
  obstacles: Obstacle[]
  /** 앉을 수 있는 벤치 자리 */
  seats?: Seat[]
}

/** 벽에 붙은 문. 벽 안쪽(+z 방향으로 회전한 쪽)을 바라본다. */
export type DoorSpot = {
  id: string
  label: string
  x: number
  z: number
  rotationY: number
  /** 문 위에 거는 이름표. 작가 전시실 문에만 있다. */
  plate?: string
  color?: string
}

export const FACING_BACK_WALL = 0
export const FACING_FRONT_WALL = Math.PI
export const FACING_LEFT_WALL = Math.PI / 2
export const FACING_RIGHT_WALL = -Math.PI / 2

const WALL_GAP = 0.02

// ---- 메인 전시실 ----

export const MAIN_HALF_X = 15
export const MAIN_HALF_Z = 14
export const MAIN_WALL_HEIGHT = 5.9

const ART_Y = 3
const NORMAL_SIZE = 2.6
const ROW_X = [4.6, 8.2, 11.8]
const SIDE_ART_Z = [-6, 0, 6, -12, 12]

/** 인기순으로 채운다. 입구 맞은편 벽 가운데가 1위 자리이고, 뒤로 갈수록 입구 쪽 벽으로 온다. */
export const MAIN_SLOTS: ArtSlot[] = [
  { position: [0, 3.05, -MAIN_HALF_Z + WALL_GAP], rotationY: FACING_BACK_WALL, size: 4 },
  ...ROW_X.flatMap((x): ArtSlot[] => [
    { position: [-x, ART_Y, -MAIN_HALF_Z + WALL_GAP], rotationY: FACING_BACK_WALL, size: NORMAL_SIZE },
    { position: [x, ART_Y, -MAIN_HALF_Z + WALL_GAP], rotationY: FACING_BACK_WALL, size: NORMAL_SIZE },
  ]),
  ...SIDE_ART_Z.flatMap((z): ArtSlot[] => [
    { position: [-MAIN_HALF_X + WALL_GAP, ART_Y, z], rotationY: FACING_LEFT_WALL, size: NORMAL_SIZE },
    { position: [MAIN_HALF_X - WALL_GAP, ART_Y, z], rotationY: FACING_RIGHT_WALL, size: NORMAL_SIZE },
  ]),
  ...ROW_X.flatMap((x): ArtSlot[] => [
    { position: [-x, ART_Y, MAIN_HALF_Z - WALL_GAP], rotationY: FACING_FRONT_WALL, size: NORMAL_SIZE },
    { position: [x, ART_Y, MAIN_HALF_Z - WALL_GAP], rotationY: FACING_FRONT_WALL, size: NORMAL_SIZE },
  ]),
]

/** 양옆 벽의 작품 사이에 난 작가 전시실 문 자리 */
const ARTIST_DOOR_Z = [-9, -3, 3, 9]

export const ARTIST_ROOM_COUNT = ARTIST_DOOR_Z.length * 2

export function artistDoorPosition(index: number) {
  const side = index % 2 === 0 ? -1 : 1
  const z = ARTIST_DOOR_Z[Math.floor(index / 2)]
  return {
    x: side * MAIN_HALF_X,
    z,
    rotationY: side === -1 ? FACING_LEFT_WALL : FACING_RIGHT_WALL,
    side,
  }
}

export const LOBBY_DOOR_Z = MAIN_HALF_Z

export const BENCHES: { x: number; z: number; rotationY: number }[] = [
  { x: -11.5, z: -7, rotationY: 0 },
  { x: 8, z: -5, rotationY: 0 },
  { x: -8, z: 5, rotationY: 0 },
  { x: 8, z: 5, rotationY: 0 },
]

export const TREES: { x: number; z: number; scale: number }[] = [
  { x: -14, z: -13.2, scale: 0.85 },
  { x: 14, z: -13.2, scale: 0.85 },
  { x: -14, z: 13.2, scale: 0.85 },
  { x: 14, z: 13.2, scale: 0.85 },
]

/** 하루들 작가 체험 부스. 입구에서 왼쪽으로 잘 보이게 카펫 쪽으로 비스듬히 세운다. */
export const BOOTH_POSITION: [number, number, number] = [-6.6, 0, -2.5]
export const BOOTH_ROTATION_Y = 0.55

/** 하루들을 직접 써 볼 수 있는 큰 휴대폰. 부스와 마주 보도록 카펫 오른쪽에 비스듬히 세운다. */
export const PHONE_POSITION: [number, number, number] = [6.4, 0, -2]
export const PHONE_ROTATION_Y = -0.5
/** 휴대폰 오른쪽에 둔 '크게 열기' 받침대. 휴대폰 기준 위치다. */
export const PHONE_KIOSK_OFFSET: [number, number, number] = [2.4, 0, 0.4]

/** 휴대폰 기준 위치를 전시실 바닥 좌표로 바꾼다. */
function phoneLocalToWorld([x, , z]: [number, number, number]) {
  const cos = Math.cos(PHONE_ROTATION_Y)
  const sin = Math.sin(PHONE_ROTATION_Y)
  return { x: PHONE_POSITION[0] + x * cos + z * sin, z: PHONE_POSITION[2] - x * sin + z * cos }
}
const PHONE_KIOSK = phoneLocalToWorld(PHONE_KIOSK_OFFSET)

/** 함께 그리는 네컷 이젤. 카펫 왼쪽 앞 벤치 옆에 세우고, 카펫과 입구 쪽을 보도록 비스듬히 돌린다. */
export const EASEL_POSITION: [number, number, number] = [-5.2, 0, 7.2]
export const EASEL_ROTATION_Y = 0.35
/** 이젤 붓이 처음 놓여 있는 바닥 자리. 이젤 앞 카펫 쪽이다. */
export const EASEL_BRUSH_HOME = { x: -3.4, z: 8.8 }
/** 이젤 붓을 주울 수 있는 거리와 이젤에서 그릴 수 있는 거리. 서버도 같은 값으로 확인한다. */
export const EASEL_PICK_REACH = 1.8
export const EASEL_PAINT_REACH = 3.4

export const MAIN_SPACE: SpaceBounds = {
  halfX: MAIN_HALF_X,
  halfZ: MAIN_HALF_Z,
  obstacles: [
    ...BENCHES.map((bench) => ({ x: bench.x, z: bench.z, radius: 1.3 })),
    ...TREES.map((tree) => ({ x: tree.x, z: tree.z, radius: 0.6 })),
    { x: BOOTH_POSITION[0], z: BOOTH_POSITION[2], radius: 2.7 },
    { x: PHONE_POSITION[0], z: PHONE_POSITION[2], radius: 1.6 },
    { x: PHONE_KIOSK.x, z: PHONE_KIOSK.z, radius: 0.7 },
    { x: EASEL_POSITION[0], z: EASEL_POSITION[2], radius: 1.3 },
  ],
  seats: benchSeats(BENCHES),
}

export const MAIN_START = { x: 0, z: 6 }

// ---- 작가 전시실 ----

export const ROOM_WALL_HEIGHT = 4.8
/** 작품 수만큼 텍스처를 올리므로 한 방에 거는 수와 방 크기의 상한을 둔다. */
export const MAX_ROOM_WORKS = 40

const ROOM_ART_Y = 2.7
const ROOM_BACK_STEP = 4.2
const ROOM_SIDE_STEP = 3.4
const ROOM_DOOR_CLEARANCE = 3.6
const ROOM_MAX_RATIO = 1.3
const ROOM_BENCH_FROM_COLUMNS = 6
const STAND_RADIUS = 2
const ROOM_STAND_GAP = 2.8
const ROOM_TITLE_GAP = 1.6

export type RoomLayout = {
  halfX: number
  halfZ: number
  slots: ArtSlot[]
  space: SpaceBounds
  exitDoor: DoorSpot
  start: { x: number; z: number }
  benches: { x: number; z: number; rotationY: number }[]
  stand: { x: number; z: number; rotationY: number }
  /** 바닥에 쓰는 방 이름 자리. 게시판에 가리지 않도록 입구와 시작 위치 사이에 둔다. */
  titleZ: number
}

function roomHalfX(columns: number) {
  return columns * (ROOM_BACK_STEP / 2) + 0.6
}

function roomHalfZ(rows: number) {
  return rows * (ROOM_SIDE_STEP / 2) + 1.9
}

/** 벽 가운데부터 바깥쪽 순서로 자리를 준다. */
function wallPositions(count: number, step: number) {
  return Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * step).sort(
    (a, b) => Math.abs(a) - Math.abs(b) || a - b,
  )
}

function frontPositions(columns: number) {
  return wallPositions(columns, ROOM_BACK_STEP).filter((x) => Math.abs(x) >= ROOM_DOOR_CLEARANCE)
}

/** 작품이 늘면 가로세로를 번갈아 넓혀서, 모두 걸 수 있는 가장 작은 방을 만든다. */
export function roomLayout(workCount: number): RoomLayout {
  const count = Math.min(workCount, MAX_ROOM_WORKS)
  let columns = 2
  let rows = 1
  while (columns + rows * 2 + frontPositions(columns).length < count) {
    if (roomHalfX(columns) / roomHalfZ(rows) > ROOM_MAX_RATIO) rows += 1
    else columns += 1
  }

  const halfX = roomHalfX(columns)
  const halfZ = roomHalfZ(rows)
  // 좋아요가 많은 작품부터 안쪽 벽, 옆 벽, 입구 쪽 벽 순서로 건다.
  const slots: ArtSlot[] = [
    ...wallPositions(columns, ROOM_BACK_STEP).map((x): ArtSlot => ({
      position: [x, ROOM_ART_Y, -halfZ + WALL_GAP],
      rotationY: FACING_BACK_WALL,
      size: NORMAL_SIZE,
    })),
    ...wallPositions(rows, ROOM_SIDE_STEP).flatMap((z): ArtSlot[] => [
      { position: [-halfX + WALL_GAP, ROOM_ART_Y, z], rotationY: FACING_LEFT_WALL, size: NORMAL_SIZE },
      { position: [halfX - WALL_GAP, ROOM_ART_Y, z], rotationY: FACING_RIGHT_WALL, size: NORMAL_SIZE },
    ]),
    ...frontPositions(columns).map((x): ArtSlot => ({
      position: [x, ROOM_ART_Y, halfZ - WALL_GAP],
      rotationY: FACING_FRONT_WALL,
      size: NORMAL_SIZE,
    })),
  ]

  const start = { x: 0, z: halfZ - 3.2 }
  // 들어오자마자 정면 가운데에 보이도록 입구와 마주 보게 세운다.
  const stand = { x: 0, z: start.z - ROOM_STAND_GAP, rotationY: 0 }
  const benches =
    columns >= ROOM_BENCH_FROM_COLUMNS
      ? [-1, 1].map((side) => ({ x: side * halfX * 0.5, z: -halfZ * 0.3, rotationY: 0 }))
      : []

  return {
    halfX,
    halfZ,
    slots,
    start,
    stand,
    benches,
    titleZ: start.z + ROOM_TITLE_GAP,
    space: {
      halfX,
      halfZ,
      obstacles: [
        ...benches.map((bench) => ({ x: bench.x, z: bench.z, radius: 1.3 })),
        { x: stand.x, z: stand.z, radius: STAND_RADIUS },
      ],
      seats: benchSeats(benches),
    },
    exitDoor: { id: 'main', label: '메인으로', x: 0, z: halfZ, rotationY: FACING_FRONT_WALL },
  }
}

const LARGEST_ROOM = roomLayout(MAX_ROOM_WORKS)

/** 실시간 서버가 위치를 검증할 때 쓰는, 어느 전시실이든 벗어나지 않는 범위 */
export const MAX_SPACE_HALF_X = Math.max(MAIN_HALF_X, LARGEST_ROOM.halfX, ARCADE_HALF_X, RELAY_HALF_X)
export const MAX_SPACE_HALF_Z = Math.max(MAIN_HALF_Z, LARGEST_ROOM.halfZ, ARCADE_HALF_Z, RELAY_HALF_Z)

export const ZONE_COLORS = ['#E6DDF6', '#FFE9B5', '#FFD9E2', '#D5EFE3', '#D7E8FB', '#FFE2CC', '#DCD3FA', '#F6DFF4']

export function zoneColor(index: number) {
  return ZONE_COLORS[index % ZONE_COLORS.length]
}

/** 붓이 닿는 거리. 서버도 같은 값으로 확인한다. */
export const BRUSH_REACH = 2.2
