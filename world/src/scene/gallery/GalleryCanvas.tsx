import { useCallback, useRef, type RefObject } from 'react'
import { OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { AvatarConfig } from '../../data/avatar'
import type { Cheer } from '../../data/cheers'
import type { EaselBrush } from '../../data/easel'
import type { EaselArt } from '../../data/presence'
import type { ArtistZone, GalleryWork } from '../../data/galleryWorks'
import type { MoveUpdate, RemotePlayer, RemotePosition, SpeechMap, PlayState } from '../../data/presence'
import { COLORS } from '../../lib/brand'
import { Artwork } from './Artwork'
import { PaintingPortal } from './PaintingPortal'
import { AuthorBooth } from './AuthorBooth'
import { EaselCorner, type EaselNear } from './EaselCorner'
import { HarudlePhone } from './HarudlePhone'
import { CheerStand } from './CheerStand'
import { ArtistRoom, MainHall } from './Hall'
import { MAIN_SLOTS, MAIN_SPACE, MAIN_START, type ArtSlot, type DoorSpot, type RoomLayout } from './layout'
import type { Seat } from '../seats'
import { DoodleFollower, Player, resolveCollisions, type JoystickInput, type Jump } from './Player'
import { PaperThrows } from './PaperThrows'
import { PresenceSender, RemotePlayers } from './RemotePlayers'

type GalleryCanvasProps = {
  /** 작가 전시실 안이면 그 작가, 메인 전시실이면 null */
  zone: ArtistZone | null
  roomLayout: RoomLayout | null
  zoneColor: string
  works: GalleryWork[]
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
  showWaitingFrames: boolean
  overview: boolean
  jump: Jump | null
  paused: boolean
  onSelect: (work: GalleryWork) => void
  onDoor: (id: string) => void
  joystick: RefObject<JoystickInput>
  cheers: Cheer[]
  cheerCount: number
  onOpenCheers: () => void
  onOpenBooth: () => void
  onOpenPhone: () => void
  easel: EaselBrush | null
  easelArt: EaselArt
  easelHolderName: string
  onEaselPick: () => void
  onOpenEaselCanvas: () => void
  onEaselNear: (near: EaselNear) => void
  /** 뛰어들 수 있는 그림이 걸린 자리 */
  portalSlot: ArtSlot | null
  diving: boolean
  /** 그림 속 게임을 하는 동안 3D 화면을 멈춘다. */
  suspended: boolean
  onPortalNear: (near: boolean) => void
  onDive: () => void
  onEntered: () => void
}

/** 휴대폰은 GPU가 약해서 그림자와 해상도를 낮춘다. */
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches
const MIN_SHADOW_REACH = 20

export default function GalleryCanvas({
  zone,
  roomLayout,
  zoneColor,
  works,
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
  showWaitingFrames,
  overview,
  jump,
  paused,
  onSelect,
  onDoor,
  joystick,
  cheers,
  cheerCount,
  onOpenCheers,
  onOpenBooth,
  onOpenPhone,
  easel,
  easelArt,
  easelHolderName,
  onEaselPick,
  onOpenEaselCanvas,
  onEaselNear,
  portalSlot,
  diving,
  suspended,
  onPortalNear,
  onDive,
  onEntered,
}: GalleryCanvasProps) {
  const moveTarget = useRef<THREE.Vector3 | null>(null)
  const leader = useRef(new THREE.Vector3(MAIN_START.x + (Math.random() - 0.5) * 3, 0, MAIN_START.z))
  const seatRequest = useRef<Seat | null>(null)
  const seated = useRef(false)
  const airborne = useRef(false)
  const doubleJumped = useRef(false)
  const companion = useRef(new THREE.Vector3(MAIN_START.x + 1.2, 0, MAIN_START.z + 1))
  const space = roomLayout?.space ?? MAIN_SPACE
  const slots = roomLayout?.slots ?? MAIN_SLOTS
  const reach = Math.max(space.halfX, space.halfZ)
  const shadowReach = Math.max(MIN_SHADOW_REACH, Math.ceil(reach) + 6)
  const roomKey = zone?.authorId ?? 'main'

  const handleSit = useCallback((point: Seat) => {
    seatRequest.current = point
  }, [])

  const walkTo = useCallback(
    (x: number, z: number) => {
      const target = new THREE.Vector3(x, 0, z)
      resolveCollisions(target, space)
      moveTarget.current = target
    },
    [space],
  )

  const handleFloorClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (event.delta > 6) return
      const target = event.point.clone().setY(0)
      resolveCollisions(target, space)
      moveTarget.current = target
    },
    [space],
  )

  return (
    <Canvas
      // 휴대폰 화면(웹 페이지)이 캔버스 뒤에 깔리므로, 그 순서가 HUD 위로 새어 나가지 않게 따로 쌓는다.
      className="!absolute inset-0 isolate"
      data-scene=""
      frameloop={suspended ? 'never' : 'always'}
      shadows={{ type: THREE.PCFShadowMap }}
      flat
      dpr={[1, IS_TOUCH ? 1.5 : 1.75]}
      camera={{ fov: 50, near: 0.5, far: 180, position: [0, 6.4, 15.6] }}
      aria-label="하루들 전시관. 벽에 인기 만화가 액자로 걸려 있고, 문을 통해 작가별 전시실로 들어갈 수 있습니다."
    >
      <color attach="background" args={[COLORS.background]} />
      <hemisphereLight args={['#E8DEFF', COLORS.lavender200, 2.6]} />
      {/* 그림자 범위는 만들 때만 적용되어서 방 크기가 바뀌면 새로 만든다. */}
      <directionalLight
        key={shadowReach}
        position={[6, 18, 8]}
        intensity={0.9}
        castShadow
        shadow-mapSize={IS_TOUCH ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-shadowReach}
        shadow-camera-right={shadowReach}
        shadow-camera-top={shadowReach}
        shadow-camera-bottom={-shadowReach}
        shadow-camera-far={shadowReach * 3}
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
        minDistance={overview ? reach * 1.5 : 7}
        maxDistance={overview ? reach * 4.5 : 16}
        minPolarAngle={overview ? 0.15 : 0.55}
        maxPolarAngle={overview ? 1.05 : 1.2}
      />

      <group key={roomKey}>
        {zone && roomLayout ? (
          <>
            <ArtistRoom
              zone={zone}
              color={zoneColor}
              layout={roomLayout}
              doors={doors}
              paused={paused}
              onFloorClick={handleFloorClick}
              onDoor={onDoor}
              onSit={handleSit}
            />
            <CheerStand {...roomLayout.stand} cheers={cheers} count={cheerCount} paused={paused} onOpen={onOpenCheers} />
          </>
        ) : (
          <>
            <MainHall doors={doors} paused={paused} onFloorClick={handleFloorClick} onDoor={onDoor} onSit={handleSit} />
            <AuthorBooth paused={paused} onOpen={onOpenBooth} />
            <HarudlePhone paused={paused} onOpen={onOpenPhone} />
            <EaselCorner
              easel={easel}
              art={easelArt}
              myId={play.myId}
              holderName={easelHolderName}
              leader={leader}
              paused={paused || overview}
              onWalkTo={walkTo}
              onPick={onEaselPick}
              onOpenCanvas={onOpenEaselCanvas}
              onNotify={play.notify}
              onNearChange={onEaselNear}
            />
          </>
        )}
        {slots.map((slot, index) => {
          const work = works[index]
          if (!work && !showWaitingFrames) return null
          return (
            <Artwork
              key={work?.id ?? `slot-${index}`}
              work={work}
              frameIndex={index}
              size={slot.size}
              position={slot.position}
              rotationY={slot.rotationY}
              paused={paused}
              onSelect={onSelect}
            />
          )
        })}
        {portalSlot && (
          <PaintingPortal
            slot={portalSlot}
            leader={leader}
            airborne={airborne}
            disabled={paused || overview}
            diving={diving}
            onNearChange={onPortalNear}
            onDive={onDive}
            onEntered={onEntered}
          />
        )}
      </group>

      <Player
        avatar={avatar}
        nickname={nickname}
        speech={mySpeech}
        position={leader}
        space={space}
        doors={doors}
        paused={paused}
        overview={overview}
        jump={jump}
        moveTarget={moveTarget}
        joystick={joystick}
        seatRequest={seatRequest}
        seated={seated}
        airborne={airborne}
        doubleJumped={doubleJumped}
        play={play}
        positions={positions}
        onDoor={onDoor}
      />
      {doodleFollows && <DoodleFollower position={companion} leader={leader} seated={seated} space={space} />}
      <PresenceSender position={leader} seated={seated} airborne={airborne} doubleJumped={doubleJumped} onMove={onMove} />
      <RemotePlayers players={others} speech={speech} play={play} positions={positions} space={space} leader={leader} />
      <PaperThrows players={others} positions={positions} leader={leader} play={play} paused={paused} space={space} />
    </Canvas>
  )
}
