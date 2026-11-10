import { useEffect, useMemo, useRef, useState } from 'react'
import { Billboard, RoundedBox, useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS, FONT_BODY, FONT_DISPLAY } from '../lib/brand'
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion'
import { Harudle } from './Characters'
import { PopUp } from './PopUp'
import { speechBubble } from './shapes'
import { Toon } from './toon'
import { useCanvasTexture, type DrawFn } from './useCanvasTexture'

const drawSign: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.primaryDeep
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#ffffff'
  ctx.font = `${h * 0.62}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('오늘의 특종', w / 2, h / 2 + h * 0.03)
}

const drawNewspaper: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.paper
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = COLORS.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${w * 0.15}px ${FONT_DISPLAY}`
  ctx.fillText('하루들 일보', w / 2, h * 0.08)
  ctx.fillRect(w * 0.06, h * 0.135, w * 0.88, 5)
  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${w * 0.22}px ${FONT_DISPLAY}`
  ctx.fillText('특종!', w / 2, h * 0.225)

  // 네 컷 칸
  const gap = w * 0.03
  const size = (w * 0.88 - gap) / 2
  const startY = h * 0.3
  const fills = [COLORS.lavender200, COLORS.butter, COLORS.blush, COLORS.lavender300]
  fills.forEach((fill, index) => {
    const x = w * 0.06 + (index % 2) * (size + gap)
    const y = startY + Math.floor(index / 2) * (size + gap)
    ctx.fillStyle = fill
    ctx.fillRect(x, y, size, size)
    ctx.strokeStyle = COLORS.ink
    ctx.lineWidth = 5
    ctx.strokeRect(x, y, size, size)
  })

  ctx.fillStyle = COLORS.ink
  ctx.font = `${w * 0.05}px ${FONT_BODY}`
  ctx.fillText('우리끼리 통하는 네컷만화', w / 2, h * 0.94)
}

const drawHint: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${h * 0.6}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('눌러 보세요!', w / 2, h / 2 + h * 0.03)
}

function Newspaper({ position, rotation }: {
  position: [number, number, number]
  rotation: [number, number, number]
}) {
  const texture = useCanvasTexture(drawNewspaper, 512, 680)
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[0.82, 1.09, 0.04]} />
        <Toon color={COLORS.paper} outlineThickness={1.2} />
      </mesh>
      <mesh position-z={0.022}>
        <planeGeometry args={[0.82, 1.09]} />
        <Toon map={texture} outline={false} />
      </mesh>
    </group>
  )
}

function PaperStack({ position, count, rotationY = 0 }: {
  position: [number, number, number]
  count: number
  rotationY?: number
}) {
  return (
    <group position={position} rotation-y={rotationY}>
      {Array.from({ length: count }, (_, index) => (
        <mesh key={index} position-y={0.05 + index * 0.09} rotation-y={(index % 2 === 0 ? 1 : -1) * 0.05} castShadow>
          <boxGeometry args={[0.82, 0.08, 0.58]} />
          <Toon color={index % 2 === 0 ? COLORS.paper : '#F3EEFF'} outlineThickness={1} />
        </mesh>
      ))}
    </group>
  )
}

export function Awning() {
  const stripes = 8
  const width = 3.76
  const stripeWidth = width / stripes
  return (
    <group position={[0, 3.2, 0.1]} rotation-x={0.3}>
      {Array.from({ length: stripes }, (_, index) => {
        const x = -width / 2 + stripeWidth * (index + 0.5)
        const color = index % 2 === 0 ? COLORS.primary : COLORS.paper
        return (
          <group key={index} position-x={x}>
            <mesh castShadow>
              <boxGeometry args={[stripeWidth, 0.1, 2.15]} />
              <Toon color={color} outline={false} />
            </mesh>
            <mesh position-z={1.075} castShadow>
              <cylinderGeometry args={[stripeWidth / 2, stripeWidth / 2, 0.1, 14]} />
              <Toon color={color} outlineThickness={1.2} />
            </mesh>
          </group>
        )
      })}
      {/* 줄무늬 윗면 외곽선 역할을 하는 어두운 받침 */}
      <RoundedBox args={[width + 0.08, 0.05, 2.22]} radius={0.02} position-y={-0.06}>
        <Toon color={COLORS.outline} outline={false} />
      </RoundedBox>
    </group>
  )
}

function StandModel() {
  const signTexture = useCanvasTexture(drawSign, 640, 180)
  const posts: [number, number, number][] = [
    [-1.62, 2.35, 0.8],
    [1.62, 2.35, 0.8],
    [-1.62, 2.55, -0.72],
    [1.62, 2.55, -0.72],
  ]

  return (
    <group>
      <RoundedBox args={[3.8, 0.2, 2.5]} radius={0.06} position-y={0.1} castShadow receiveShadow>
        <Toon color={COLORS.primaryDeep} />
      </RoundedBox>
      <RoundedBox args={[3.3, 1.3, 1.7]} radius={0.08} position-y={0.85} castShadow receiveShadow>
        <Toon color={COLORS.primary} />
      </RoundedBox>
      <RoundedBox args={[3.6, 0.14, 1.8]} radius={0.05} position-y={1.56} castShadow receiveShadow>
        <Toon color={COLORS.paper} />
      </RoundedBox>

      <Newspaper position={[-1, 0.93, 1.03]} rotation={[-0.16, 0, 0.02]} />
      <Newspaper position={[0, 0.95, 1.03]} rotation={[-0.16, 0, -0.015]} />
      <Newspaper position={[1, 0.93, 1.03]} rotation={[-0.16, 0, 0.015]} />
      <RoundedBox args={[3.3, 0.22, 0.12]} radius={0.03} position={[0, 0.32, 1.14]} castShadow>
        <Toon color={COLORS.lavender300} />
      </RoundedBox>

      <PaperStack position={[-1.15, 1.62, 0.25]} count={5} rotationY={0.12} />
      <PaperStack position={[1.15, 1.62, 0.25]} count={3} rotationY={-0.1} />

      {posts.map((position) => (
        <mesh key={position[0] * position[2]} position={position} castShadow>
          <cylinderGeometry args={[0.065, 0.065, position[1] === 2.35 ? 1.55 : 1.95, 8]} />
          <Toon color={COLORS.paper} outlineThickness={1.2} />
        </mesh>
      ))}

      <group position={[0, 0.98, -0.25]}>
        <Harudle />
      </group>
      <Awning />

      <group position={[0, 4.02, -0.55]} rotation-x={-0.08}>
        <RoundedBox args={[2.75, 0.84, 0.14]} radius={0.05} castShadow>
          <Toon color={COLORS.primaryDeep} />
        </RoundedBox>
        <mesh position-z={0.075}>
          <planeGeometry args={[2.6, 0.73]} />
          <meshBasicMaterial map={signTexture} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function ClickHint() {
  const shape = useMemo(() => speechBubble(2.5, 0.9, 0.3), [])
  const geometry = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false, curveSegments: 10 }),
    [shape],
  )
  const texture = useCanvasTexture(drawHint, 512, 128)
  const ref = useRef<THREE.Group>(null)
  const reducedMotion = usePrefersReducedMotion()

  useFrame(({ clock }) => {
    if (!ref.current || reducedMotion) return
    ref.current.position.y = 4.48 + Math.sin(clock.elapsedTime * 2.4) * 0.09
  })

  return (
    <group ref={ref} position={[0, 4.48, -0.2]}>
      <Billboard>
        <mesh geometry={geometry} scale={0.8}>
          <Toon color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.6, 0.075]}>
          <planeGeometry args={[1.8, 0.45]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  )
}

type NewspaperStandProps = {
  modalOpen: boolean
  showHint: boolean
  onOpen: () => void
}

export function NewspaperStand({ modalOpen, showHint, onOpen }: NewspaperStandProps) {
  const [hovered, setHovered] = useState(false)
  const bouncer = useRef<THREE.Group>(null)
  const energy = useRef(0)
  const phase = useRef(0)
  const reducedMotion = usePrefersReducedMotion()

  useCursor(hovered)

  // 모달이 캔버스를 덮으면 pointerout이 오지 않으므로 직접 풀어 준다.
  useEffect(() => {
    if (modalOpen) setHovered(false)
  }, [modalOpen])

  useFrame((_, delta) => {
    const group = bouncer.current
    if (!group) return
    const dt = Math.min(delta, 0.05)
    energy.current = THREE.MathUtils.damp(energy.current, hovered ? 1 : 0, hovered ? 9 : 5, dt)
    const e = energy.current

    if (reducedMotion) {
      group.scale.setScalar(1 + e * 0.025)
      return
    }

    if (e < 0.005 && !hovered) {
      energy.current = 0
      phase.current = 0
      group.position.y = 0
      group.scale.setScalar(1)
      return
    }

    phase.current += dt * 8.5
    const hop = Math.abs(Math.sin(phase.current))
    const landing = Math.pow(1 - hop, 3)
    group.position.y = e * hop * 0.2
    const squash = e * (hop * 0.035 - landing * 0.07)
    group.scale.set(1 - squash * 0.6, 1 + squash, 1 - squash * 0.6)
  })

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    if (event.pointerType === 'mouse') setHovered(true)
  }

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    // 가판대 위에서 시작한 드래그는 카메라 회전이므로 클릭으로 치지 않는다.
    if (event.delta > 6) return
    onOpen()
  }

  return (
    <group position={[0, 0, 0.75]}>
      <PopUp delay={0.45} mode="grow">
        <group ref={bouncer}>
          <StandModel />
        </group>
        {showHint && <ClickHint />}
      </PopUp>

      {/* 통통 튀어도 호버가 끊기지 않도록 판정 상자는 움직이지 않는다. */}
      <mesh
        position={[0, 2.25, 0]}
        onPointerOver={handlePointerOver}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
      >
        <boxGeometry args={[4, 4.7, 2.9]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
