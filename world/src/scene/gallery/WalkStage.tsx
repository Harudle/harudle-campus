import { useCallback, useRef, type ReactNode, type RefObject } from 'react'
import { OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { AvatarConfig } from '../../data/avatar'
import type { MoveUpdate, PlayState, RemotePlayer, RemotePosition, SpeechMap } from '../../data/presence'
import { COLORS } from '../../lib/brand'
import type { Seat } from '../seats'
import type { DoorSpot, SpaceBounds } from './layout'
import { PaperThrows } from './PaperThrows'
import { DoodleFollower, Player, resolveCollisions, type JoystickInput } from './Player'
import { PresenceSender, RemotePlayers } from './RemotePlayers'

const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches

export type WalkStageProps = {
  label: string
  space: SpaceBounds
  start: { x: number; z: number }
  doors: DoorSpot[]
  avatar: AvatarConfig
  nickname: string
  doodleFollows: boolean
  others: RemotePlayer[]
  speech: SpeechMap
  mySpeech: string
  play: PlayState
  positions: RefObject<Map<number, RemotePosition>>
  onMove: (update: MoveUpdate) => void
  paused: boolean
  joystick: RefObject<JoystickInput>
  /** 문에 들어갈 때 그 문의 id로 호출한다. */
  onExit: (doorId: string) => void
  children: (handlers: {
    onFloorClick: (event: ThreeEvent<MouseEvent>) => void
    onSit: (point: Seat) => void
  }) => ReactNode
}

/** 오락실과 소설관이 함께 쓰는 무대: 조명, 카메라, 내 캐릭터, 다른 방문자 */
export function WalkStage({
  label,
  space,
  start,
  doors,
  avatar,
  nickname,
  doodleFollows,
  others,
  speech,
  mySpeech,
  play,
  positions,
  onMove,
  paused,
  joystick,
  onExit,
  children,
}: WalkStageProps) {
  const moveTarget = useRef<THREE.Vector3 | null>(null)
  const seatRequest = useRef<Seat | null>(null)
  const seated = useRef(false)
  const airborne = useRef(false)
  const doubleJumped = useRef(false)
  // 여럿이 동시에 들어와도 겹치지 않게 입구 앞에 흩어져 시작한다.
  const leader = useRef(new THREE.Vector3(start.x + (Math.random() - 0.5) * 6, 0, start.z + Math.random() * 2))
  const companion = useRef(new THREE.Vector3(start.x + 1.2, 0, start.z + 1))
  const reach = Math.max(space.halfX, space.halfZ) + 6

  const onFloorClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (event.delta > 6) return
      const target = event.point.clone().setY(0)
      resolveCollisions(target, space)
      moveTarget.current = target
    },
    [space],
  )
  const onSit = useCallback((point: Seat) => {
    seatRequest.current = point
  }, [])

  return (
    <Canvas
      className="!absolute inset-0"
      shadows={{ type: THREE.PCFShadowMap }}
      flat
      dpr={[1, IS_TOUCH ? 1.5 : 1.75]}
      camera={{ fov: 50, near: 0.5, far: 180, position: [start.x, 6.4, start.z + 9.6] }}
      aria-label={label}
    >
      <color attach="background" args={[COLORS.background]} />
      <hemisphereLight args={['#E8DEFF', COLORS.lavender200, 2.6]} />
      <directionalLight
        position={[6, 22, 8]}
        intensity={0.9}
        castShadow
        shadow-mapSize={IS_TOUCH ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-far={reach * 3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <OrbitControls
        makeDefault
        enabled={!paused}
        enablePan={false}
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.5}
        zoomSpeed={0.7}
        minDistance={7}
        maxDistance={16}
        minPolarAngle={0.55}
        maxPolarAngle={1.2}
      />
      {children({ onFloorClick, onSit })}
      <Player
        avatar={avatar}
        nickname={nickname}
        speech={mySpeech}
        position={leader}
        space={space}
        doors={doors}
        paused={paused}
        overview={false}
        jump={null}
        moveTarget={moveTarget}
        joystick={joystick}
        seatRequest={seatRequest}
        seated={seated}
        airborne={airborne}
        doubleJumped={doubleJumped}
        play={play}
        positions={positions}
        onDoor={onExit}
      />
      {doodleFollows && <DoodleFollower position={companion} leader={leader} seated={seated} space={space} />}
      <PresenceSender position={leader} seated={seated} airborne={airborne} doubleJumped={doubleJumped} onMove={onMove} />
      <RemotePlayers players={others} speech={speech} play={play} positions={positions} space={space} leader={leader} />
      <PaperThrows players={others} positions={positions} leader={leader} play={play} paused={paused} space={space} />
    </Canvas>
  )
}
