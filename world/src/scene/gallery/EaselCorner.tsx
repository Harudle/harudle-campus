import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { RoundedBox, useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { EaselBrush } from '../../data/easel'
import type { EaselArt } from '../../data/presence'
import { COLORS } from '../../lib/brand'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { EaselBrushModel } from '../EaselBrushModel'
import { Toon } from '../toon'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'
import { drawFrame, drawPaper } from './easelDrawing'
import { EASEL_BRUSH_HOME, EASEL_PAINT_REACH, EASEL_PICK_REACH, EASEL_POSITION, EASEL_ROTATION_Y } from './layout'

const WOOD = '#B9855A'
const BOARD_SIZE = 2.3
const BOARD_Y = 2.35
const BOARD_TILT = -0.12
const ART_PIXELS = 512
/** 이젤 앞에서 칠하기 좋은 자리. 이젤을 눌렀는데 멀면 여기로 걸어간다. */
const FRONT_GAP = 2.2

export type EaselNear = { brush: boolean; easel: boolean }

type EaselCornerProps = {
  easel: EaselBrush | null
  art: EaselArt
  myId: number | null
  holderName: string
  leader: RefObject<THREE.Vector3>
  paused: boolean
  onWalkTo: (x: number, z: number) => void
  onPick: () => void
  onOpenCanvas: () => void
  onNotify: (text: string) => void
  onNearChange: (near: EaselNear) => void
}

/** 바닥에 누운 이젤 붓. 멀리서도 보이게 손에 드는 붓보다 크게 둔다. */
function GroundBrush({ x, z, active, onClick, onHover }: {
  x: number
  z: number
  active: boolean
  onClick: (event: ThreeEvent<MouseEvent>) => void
  onHover: (hovered: boolean) => void
}) {
  const ring = useRef<THREE.Mesh>(null)
  const reducedMotion = usePrefersReducedMotion()

  useFrame(({ clock }) => {
    if (!ring.current) return
    const pulse = reducedMotion ? 0.5 : (Math.sin(clock.elapsedTime * 3) + 1) / 2
    ring.current.scale.setScalar(1 + pulse * 0.15)
    ;(ring.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + pulse * 0.35
  })

  return (
    <group position={[x, 0, z]}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.02}>
        <ringGeometry args={[0.85, 1.02, 40]} />
        <meshBasicMaterial color={COLORS.butter} transparent depthWrite={false} />
      </mesh>
      <group position-y={0.12} rotation={[0, 0.6, Math.PI / 2]} scale={active ? 1.12 : 1}>
        <EaselBrushModel />
      </group>
      {/* 작은 붓도 누르기 쉽게 넓은 판정 상자를 둔다. */}
      <mesh
        position-y={0.4}
        onPointerOver={(event) => {
          event.stopPropagation()
          if (event.pointerType === 'mouse') onHover(true)
        }}
        onPointerOut={() => onHover(false)}
        onClick={onClick}
      >
        <boxGeometry args={[2, 0.9, 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

/**
 * 메인 전시실의 함께 그리는 네컷 이젤과, 하나뿐인 이젤 붓. 붓을 주운 사람이 이젤을 누르면 그림판이 열린다.
 * 붓과 그림의 상태는 서버가 정하고, 여기서는 보여 주기와 가까이 있는지만 맡는다.
 */
export function EaselCorner({ easel, art, myId, holderName, leader, paused, onWalkTo, onPick, onOpenCanvas, onNotify, onNearChange }: EaselCornerProps) {
  const [hovered, setHovered] = useState<'brush' | 'board' | null>(null)
  const near = useRef<EaselNear>({ brush: false, easel: false })
  const pendingPick = useRef(false)
  // 선이 늘어날 때마다 이젤 그림을 다시 그린다.
  const draw = useCallback<DrawFn>(
    (ctx, w) => {
      drawPaper(ctx, w, art.segments.current)
      drawFrame(ctx, w)
    },
    // 선 목록은 ref라 version으로 바뀐 것을 안다.
    [art.version, art.segments],
  )
  const texture = useCanvasTexture(draw, ART_PIXELS, ART_PIXELS)
  const holding = easel !== null && myId !== null && easel.holder === myId
  const brushOnFloor = easel === null || easel.holder === null
  const brushX = easel?.x ?? EASEL_BRUSH_HOME.x
  const brushZ = easel?.z ?? EASEL_BRUSH_HOME.z
  const [easelX, , easelZ] = EASEL_POSITION

  useCursor(hovered !== null && !paused)
  useEffect(() => () => onNearChange({ brush: false, easel: false }), [onNearChange])

  useFrame(() => {
    const player = leader.current
    if (!player) return
    const nearBrush = easel !== null && easel.holder === null && Math.hypot(player.x - brushX, player.z - brushZ) < EASEL_PICK_REACH
    const nearEasel = Math.hypot(player.x - easelX, player.z - easelZ) < EASEL_PAINT_REACH
    if (nearBrush !== near.current.brush || nearEasel !== near.current.easel) {
      near.current = { brush: nearBrush, easel: nearEasel }
      onNearChange(near.current)
    }
    // 붓을 눌러 걸어가는 중이었다면 닿자마자 줍는다.
    if (pendingPick.current && nearBrush) {
      pendingPick.current = false
      onPick()
    }
  })

  // 다른 사람이 먼저 주웠으면 걸어가던 줍기를 그만둔다.
  useEffect(() => {
    if (!brushOnFloor) pendingPick.current = false
  }, [brushOnFloor])

  const handleBrushClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.delta > 6 || paused) return
    if (!easel) {
      onNotify('다른 관람객과 연결되면 붓을 쓸 수 있어요')
      return
    }
    if (near.current.brush) {
      onPick()
      return
    }
    pendingPick.current = true
    onWalkTo(brushX, brushZ)
  }

  const handleBoardClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.delta > 6 || paused) return
    if (!easel) {
      onNotify('다른 관람객과 연결되면 함께 그릴 수 있어요')
      return
    }
    if (!holding) {
      onNotify(easel.holder === null ? '바닥에 있는 붓을 주워 와야 그릴 수 있어요' : `${holderName || '누군가'}님이 그리고 있어요`)
      return
    }
    if (!near.current.easel) {
      const normalX = Math.sin(EASEL_ROTATION_Y)
      const normalZ = Math.cos(EASEL_ROTATION_Y)
      onWalkTo(easelX + normalX * FRONT_GAP, easelZ + normalZ * FRONT_GAP)
      onNotify('이젤 앞으로 가서 그려요')
      return
    }
    onOpenCanvas()
  }

  return (
    <>
      <group position={EASEL_POSITION} rotation-y={EASEL_ROTATION_Y}>
        {/* 앞다리 둘과 뒷다리 하나 */}
        {[-0.85, 0.85].map((x) => (
          <mesh key={x} position={[x, 1.65, -0.08]} rotation-z={x > 0 ? 0.1 : -0.1} castShadow>
            <boxGeometry args={[0.12, 3.4, 0.12]} />
            <Toon color={WOOD} outlineThickness={1.2} />
          </mesh>
        ))}
        <mesh position={[0, 1.6, -0.6]} rotation-x={-0.35} castShadow>
          <boxGeometry args={[0.12, 3.3, 0.12]} />
          <Toon color={WOOD} outlineThickness={1.2} />
        </mesh>
        {/* 그림을 받치는 선반 */}
        <RoundedBox args={[2.6, 0.12, 0.34]} radius={0.04} position={[0, BOARD_Y - BOARD_SIZE / 2 - 0.06, 0.24]} castShadow>
          <Toon color={WOOD} outlineThickness={1.2} />
        </RoundedBox>
        <group position={[0, BOARD_Y, 0.2]} rotation-x={BOARD_TILT} scale={hovered === 'board' && holding && !paused ? 1.03 : 1}>
          <RoundedBox args={[BOARD_SIZE + 0.12, BOARD_SIZE + 0.12, 0.08]} radius={0.03} castShadow>
            <Toon color={COLORS.paper} outlineColor={COLORS.charcoal} outlineThickness={1.4} />
          </RoundedBox>
          <mesh
            position-z={0.045}
            onPointerOver={(event) => {
              event.stopPropagation()
              if (event.pointerType === 'mouse') setHovered('board')
            }}
            onPointerOut={() => setHovered(null)}
            onClick={handleBoardClick}
          >
            <planeGeometry args={[BOARD_SIZE, BOARD_SIZE]} />
            <meshBasicMaterial map={texture} toneMapped={false} />
          </mesh>
        </group>
      </group>

      {brushOnFloor && (
        <GroundBrush
          x={brushX}
          z={brushZ}
          active={hovered === 'brush' && !paused}
          onClick={handleBrushClick}
          onHover={(value) => setHovered(value ? 'brush' : null)}
        />
      )}
    </>
  )
}
