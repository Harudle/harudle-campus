import { useMemo, useRef, useState, type ReactNode } from 'react'
import { RoundedBox, useCursor } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import type * as THREE from 'three'
import type { ArtistZone } from '../../data/galleryWorks'
import { COLORS, FONT_BODY, FONT_DISPLAY } from '../../lib/brand'
import { PortalDoor } from '../PortalDoor'
import type { Seat } from '../seats'
import { PaperCut, Tree } from '../Room'
import { scallopedWall, star } from '../shapes'
import { Toon } from '../toon'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'
import {
  BENCHES,
  FACING_BACK_WALL,
  FACING_FRONT_WALL,
  FACING_LEFT_WALL,
  FACING_RIGHT_WALL,
  MAIN_HALF_X,
  MAIN_HALF_Z,
  MAIN_WALL_HEIGHT,
  ROOM_WALL_HEIGHT,
  TREES,
  type DoorSpot,
  type RoomLayout,
} from './layout'

const WALL_DEPTH = 0.2

function fitFont(ctx: CanvasRenderingContext2D, text: string, family: string, size: number, maxWidth: number) {
  let current = size
  ctx.font = `${current}px ${family}`
  while (current > 12 && ctx.measureText(text).width > maxWidth) {
    current -= 4
    ctx.font = `${current}px ${family}`
  }
}

function checkerFloor(columns: number, rows: number): DrawFn {
  return (ctx, w) => {
    const cell = w / columns
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        ctx.fillStyle = (row + column) % 2 === 0 ? COLORS.paper : '#F3EEFF'
        ctx.fillRect(column * cell, row * cell, cell + 1, cell + 1)
      }
    }
  }
}

const drawChecker = checkerFloor(15, 14)

const drawMainFloor: DrawFn = (ctx, w, h) => {
  drawChecker(ctx, w, h)
  // 입구에서 1위 작품까지 이어지는 카펫
  const carpet = w * 0.1
  ctx.fillStyle = COLORS.lavender200
  ctx.fillRect(w / 2 - carpet / 2, 0, carpet, h)
  ctx.strokeStyle = COLORS.paper
  ctx.lineWidth = 8
  ctx.setLineDash([32, 24])
  ctx.strokeRect(w / 2 - carpet / 2 + 14, -20, carpet - 28, h + 40)
  ctx.setLineDash([])
}

const drawHeroSign: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${h * 0.72}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('가장 사랑받은 만화', w / 2, h / 2 + h * 0.03)
}

/** 카메라가 안쪽 면 뒤로 넘어가면 숨겨서 인형의 집처럼 안이 들여다보이게 한다. */
function useHideBehind(x: number, z: number, rotationY: number) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    if (!ref.current) return
    ref.current.visible = (camera.position.x - x) * Math.sin(rotationY) + (camera.position.z - z) * Math.cos(rotationY) > 0
  })
  return ref
}

export function Wall({ x, z, rotationY, length, height, bumps, color, children }: {
  x: number
  z: number
  rotationY: number
  length: number
  height: number
  bumps: number
  color: string
  children?: ReactNode
}) {
  const shape = useMemo(() => scallopedWall(length, height, bumps), [length, height, bumps])
  const ref = useHideBehind(x, z, rotationY)
  return (
    <group ref={ref} position={[x, 0, z]} rotation-y={rotationY}>
      <group position-z={-WALL_DEPTH}>
        <PaperCut shape={shape} depth={WALL_DEPTH} color={color} />
      </group>
      {children}
    </group>
  )
}

function DoorPlate({ text, color }: { text: string; color: string }) {
  const draw = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      ctx.fillStyle = color
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = COLORS.charcoal
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      fitFont(ctx, text, FONT_DISPLAY, h * 0.62, w * 0.92)
      ctx.fillText(text, w / 2, h / 2 + h * 0.03)
    },
    [text, color],
  )
  const texture = useCanvasTexture(draw, 512, 112)
  return (
    <group position={[0, 3.62, 0.04]}>
      <RoundedBox args={[2.75, 0.68, 0.06]} radius={0.025}>
        <Toon color={color} outlineThickness={1.2} />
      </RoundedBox>
      <mesh position-z={0.035}>
        <planeGeometry args={[2.62, 0.57]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function WallDoor({ door, paused, onEnter }: { door: DoorSpot; paused: boolean; onEnter: (id: string) => void }) {
  const ref = useHideBehind(door.x, door.z, door.rotationY)
  return (
    <group ref={ref} position={[door.x, 0, door.z]} rotation-y={door.rotationY}>
      <PortalDoor label={door.label} innerColor={door.color} disabled={paused} onEnter={() => onEnter(door.id)} />
      {door.plate && <DoorPlate text={door.plate} color={door.color ?? COLORS.paper} />}
    </group>
  )
}

/** 누르면 걸어가서 앉는다. */
export function Bench({ x, z, rotationY, disabled, onSit }: {
  x: number
  z: number
  rotationY: number
  disabled: boolean
  onSit: (point: Seat) => void
}) {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered && !disabled)
  return (
    <group
      position={[x, 0, z]}
      rotation-y={rotationY}
      onPointerOver={(event) => {
        event.stopPropagation()
        if (event.pointerType === 'mouse') setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => {
        event.stopPropagation()
        if (event.delta > 6 || disabled) return
        onSit({ x: event.point.x, z: event.point.z })
      }}
    >
      <RoundedBox args={[2.4, 0.18, 0.8]} radius={0.05} position-y={0.62} castShadow receiveShadow>
        <Toon color={COLORS.primary} />
      </RoundedBox>
      {[-0.95, 0.95].map((legX) => (
        <mesh key={legX} position={[legX, 0.28, 0]} castShadow>
          <boxGeometry args={[0.16, 0.56, 0.6]} />
          <Toon color={COLORS.paper} outlineThickness={1.2} />
        </mesh>
      ))}
    </group>
  )
}

type SpaceProps = {
  doors: DoorSpot[]
  paused: boolean
  onFloorClick: (event: ThreeEvent<MouseEvent>) => void
  onDoor: (id: string) => void
  onSit: (point: Seat) => void
}

/** 인기작을 거는 메인 전시실. 양옆 벽의 문이 작가 전시실로 이어진다. */
export function MainHall({ doors, paused, onFloorClick, onDoor, onSit }: SpaceProps) {
  const floor = useCanvasTexture(drawMainFloor, 2048, 1912)
  const heroSign = useCanvasTexture(drawHeroSign, 768, 96)
  const starShape = useMemo(() => star(0.3, 0.13), [])

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={onFloorClick}>
        <planeGeometry args={[MAIN_HALF_X * 2, MAIN_HALF_Z * 2]} />
        <Toon map={floor} outline={false} />
      </mesh>
      <Wall x={0} z={-MAIN_HALF_Z} rotationY={FACING_BACK_WALL} length={MAIN_HALF_X * 2} height={MAIN_WALL_HEIGHT} bumps={20} color={COLORS.lavender100}>
        <mesh position={[0, 5.42, 0.03]}>
          <planeGeometry args={[4.8, 0.6]} />
          <meshBasicMaterial map={heroSign} transparent toneMapped={false} />
        </mesh>
        {[-3, 3].map((x) => (
          <group key={x} position={[x, 5.25, 0.02]}>
            <PaperCut shape={starShape} depth={0.06} color={COLORS.butter} outlineThickness={1.2} />
          </group>
        ))}
      </Wall>
      <Wall x={0} z={MAIN_HALF_Z} rotationY={FACING_FRONT_WALL} length={MAIN_HALF_X * 2} height={MAIN_WALL_HEIGHT} bumps={20} color={COLORS.lavender100} />
      <Wall x={-MAIN_HALF_X} z={0} rotationY={FACING_LEFT_WALL} length={MAIN_HALF_Z * 2} height={MAIN_WALL_HEIGHT} bumps={18} color={COLORS.lavender200} />
      <Wall x={MAIN_HALF_X} z={0} rotationY={FACING_RIGHT_WALL} length={MAIN_HALF_Z * 2} height={MAIN_WALL_HEIGHT} bumps={18} color={COLORS.lavender200} />
      {doors.map((door) => (
        <WallDoor key={door.id} door={door} paused={paused} onEnter={onDoor} />
      ))}
      {BENCHES.map((bench) => (
        <Bench key={`${bench.x},${bench.z}`} {...bench} disabled={paused} onSit={onSit} />
      ))}
      {TREES.map((tree) => (
        <Tree key={`${tree.x},${tree.z}`} position={[tree.x, 0, tree.z]} scale={tree.scale} />
      ))}
    </group>
  )
}

const ROOM_FLOOR_WIDTH = 2048
const TITLE_DEPTH = 1.7
const TITLE_WIDTH = 6.4
// 세로 화면은 보이는 폭이 좁고 아래쪽 버튼과 겹치지 않아야 한다.
const TITLE_WIDTH_PORTRAIT = 3.4
const TITLE_TEXTURE_WIDTH = 1024
const WALL_BUMPS_PER_UNIT = 0.67

function wallBumps(length: number) {
  return Math.max(Math.round(length * WALL_BUMPS_PER_UNIT), 4)
}

/** 바닥에 쓴 방 이름. 방 크기와 상관없이 같은 크기로 또렷하게 보이도록 바닥 텍스처와 따로 그린다. */
function RoomTitle({ zone, z }: { zone: ArtistZone; z: number }) {
  const portrait = useThree((state) => state.viewport.aspect < 1)
  const width = portrait ? TITLE_WIDTH_PORTRAIT : TITLE_WIDTH
  const draw = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = COLORS.charcoal
      fitFont(ctx, `${zone.nickname} 작가의 방`, FONT_DISPLAY, h * 0.5, w * 0.98)
      ctx.fillText(`${zone.nickname} 작가의 방`, w / 2, h * 0.34)
      fitFont(ctx, `작품 ${zone.totalWorks}점 · 좋아요 ${zone.totalLikes}개`, FONT_BODY, h * 0.24, w * 0.9)
      ctx.fillText(`작품 ${zone.totalWorks}점 · 좋아요 ${zone.totalLikes}개`, w / 2, h * 0.78)
    },
    [zone.nickname, zone.totalWorks, zone.totalLikes],
  )
  const texture = useCanvasTexture(draw, TITLE_TEXTURE_WIDTH, Math.round((TITLE_TEXTURE_WIDTH * TITLE_DEPTH) / width))
  return (
    <mesh position={[0, 0.03, z]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[width, TITLE_DEPTH]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/** 한 작가의 작품만 거는 방. 크기는 작품 수에 따라 layout이 정한다. */
export function ArtistRoom({ zone, color, layout, doors, paused, onFloorClick, onDoor, onSit }: SpaceProps & {
  zone: ArtistZone
  color: string
  layout: RoomLayout
}) {
  const { halfX, halfZ } = layout
  const draw = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      // 바닥 칸이 일정해서 방이 커진 만큼 칸 수가 늘어나 보인다.
      checkerFloor(halfX, Math.ceil(halfZ) + 1)(ctx, w, h)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.ellipse(w / 2, h * 0.46, w * 0.42, h * 0.36, 0, 0, Math.PI * 2)
      ctx.fill()
    },
    [color, halfX, halfZ],
  )
  const floor = useCanvasTexture(draw, ROOM_FLOOR_WIDTH, Math.round((ROOM_FLOOR_WIDTH * halfZ) / halfX))

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={onFloorClick}>
        <planeGeometry args={[halfX * 2, halfZ * 2]} />
        <Toon map={floor} outline={false} />
      </mesh>
      <RoomTitle zone={zone} z={layout.titleZ} />
      <Wall x={0} z={-halfZ} rotationY={FACING_BACK_WALL} length={halfX * 2} height={ROOM_WALL_HEIGHT} bumps={wallBumps(halfX * 2)} color={color} />
      <Wall x={0} z={halfZ} rotationY={FACING_FRONT_WALL} length={halfX * 2} height={ROOM_WALL_HEIGHT} bumps={wallBumps(halfX * 2)} color={color} />
      <Wall x={-halfX} z={0} rotationY={FACING_LEFT_WALL} length={halfZ * 2} height={ROOM_WALL_HEIGHT} bumps={wallBumps(halfZ * 2)} color={color} />
      <Wall x={halfX} z={0} rotationY={FACING_RIGHT_WALL} length={halfZ * 2} height={ROOM_WALL_HEIGHT} bumps={wallBumps(halfZ * 2)} color={color} />
      {doors.map((door) => (
        <WallDoor key={door.id} door={door} paused={paused} onEnter={onDoor} />
      ))}
      {layout.benches.map((bench) => (
        <Bench key={`${bench.x},${bench.z}`} {...bench} disabled={paused} onSit={onSit} />
      ))}
    </group>
  )
}
