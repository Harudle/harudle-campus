import type { ThreeEvent } from '@react-three/fiber'
import { ARCADE_ROOMS, type ArcadeRoomInfo } from '../../data/arcadeQuizzes'
import { COLORS } from '../../lib/brand'
import { Bench, WallDoor } from '../gallery/Hall'
import type { DoorSpot } from '../gallery/layout'
import { PortalDoor } from '../PortalDoor'
import type { Seat } from '../seats'
import { ArcadeShell } from './ArcadeShell'
import { ARCADE_HALF_X, ARCADE_HALF_Z, HUB_BENCHES, LOBBY_DOOR_ID } from './layout'
import { NeonSign } from './NeonSign'

// 입장했을 때 화면 위로 잘리지 않도록 문과 간판을 카메라 높이(약 5.3) 아래에 둔다.
const DOOR_SCALE = 1.3

function RoomDoor({ room, door, disabled, onDoor }: {
  room: ArcadeRoomInfo
  door: DoorSpot
  disabled: boolean
  onDoor: (id: string) => void
}) {
  return (
    <group position-x={door.x}>
      <group scale={DOOR_SCALE}>
        <PortalDoor label="입장" innerColor={room.color} disabled={disabled} onEnter={() => onDoor(door.id)} />
      </group>
      <NeonSign text={room.label} color={room.color} position={[0, 4.72, 0.1]} width={7} height={1.05} />
    </group>
  )
}

/** 오락실 입구 홀. 뒷벽의 문 두 개가 노래, 드라마 맞추기 방으로 이어진다. */
export function ArcadeHub({ doors, disabled, onFloorClick, onSit, onDoor }: {
  doors: DoorSpot[]
  disabled: boolean
  onFloorClick: (event: ThreeEvent<MouseEvent>) => void
  onSit: (point: Seat) => void
  onDoor: (id: string) => void
}) {
  const lobbyDoor = doors.find((door) => door.id === LOBBY_DOOR_ID)
  return (
    <group>
      <ArcadeShell halfX={ARCADE_HALF_X} halfZ={ARCADE_HALF_Z} onFloorClick={onFloorClick}>
        <NeonSign text="퀴즈 아케이드" color={COLORS.blush} position={[0, 7.2, 0.1]} width={7.5} height={1.1} />
        {ARCADE_ROOMS.map((room) => {
          const door = doors.find((candidate) => candidate.id === room.id)
          return door && <RoomDoor key={room.id} room={room} door={door} disabled={disabled} onDoor={onDoor} />
        })}
      </ArcadeShell>
      {lobbyDoor && <WallDoor door={lobbyDoor} paused={disabled} onEnter={onDoor} />}
      {HUB_BENCHES.map((bench) => (
        <Bench key={`${bench.x},${bench.z}`} {...bench} disabled={disabled} onSit={onSit} />
      ))}
    </group>
  )
}
