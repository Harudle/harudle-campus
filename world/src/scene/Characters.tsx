import { useMemo, useRef, type RefObject } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS } from '../lib/brand'
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion'
import { Toon } from './toon'
import { useCanvasTexture, type DrawFn } from './useCanvasTexture'

export type CharacterKind = 'harudle' | 'haru' | 'doodle'

/** phase는 걸음 위치, amount는 0(서 있음)부터 1(걷는 중)까지의 세기다. */
/** sit은 0(서 있음)에서 1(앉음)까지의 자세 값이고, swing은 붓을 휘두른 정도(0~1)다. 두들은 사람과 앉는 모양이 달라 dogSit을 따로 쓴다. */
export type WalkMotion = { phase: number; amount: number; sit?: number; dogSit?: number; swing?: number }

type CharacterProps = {
  motion?: RefObject<WalkMotion>
}

export const INK = COLORS.charcoal
export const LILAC = '#B9A6EC'
const SKIN = '#FFFFFF'
export const LINE_RADIUS = 0.032

export function Ink({ radius, position, rotation }: {
  radius: number
  position: [number, number, number]
  rotation?: [number, number, number]
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <sphereGeometry args={[radius, 10, 8]} />
      <meshBasicMaterial color={INK} />
    </mesh>
  )
}

/** 낙서 선처럼 보이는 팔다리. 원점이 관절이고 아래로 뻗는다. */
export function Line({ length, radius = LINE_RADIUS }: { length: number; radius?: number }) {
  return (
    <mesh position-y={-length / 2}>
      <capsuleGeometry args={[radius, length, 4, 8]} />
      <meshBasicMaterial color={INK} />
    </mesh>
  )
}

export function Skin({ color = SKIN, thickness = 1.8 }: { color?: string; thickness?: number }) {
  return <Toon color={color} outlineColor={INK} outlineThickness={thickness} />
}

/** 눈과 입. 머리 앞면(+z)에 붙이며 3.6초마다 눈을 깜빡인다. */
function Face({ radius, smile = true }: { radius: number; smile?: boolean }) {
  const eyes = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    eyes.current?.scale.setY(clock.elapsedTime % 3.6 < 0.12 ? 0.15 : 1)
  })
  const z = radius * 0.94
  return (
    <group>
      <group ref={eyes} position={[0, radius * 0.08, 0]}>
        <Ink radius={radius * 0.095} position={[-radius * 0.36, 0, z]} />
        <Ink radius={radius * 0.095} position={[radius * 0.36, 0, z]} />
      </group>
      {smile && (
        <mesh position={[0, -radius * 0.2, z + 0.01]} rotation-z={Math.PI}>
          <torusGeometry args={[radius * 0.2, radius * 0.035, 6, 14, Math.PI]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      )}
    </group>
  )
}

const SEATED_LEG_ANGLE = -1.45
const DOG_SIT_TILT = 0.45
const DOG_SIT_DROP = 0.07
const DOG_SIT_REAR_LEG = -0.95

export function useLegSwing(motion: RefObject<WalkMotion> | undefined, swing = 0.8) {
  const left = useRef<THREE.Group>(null)
  const right = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!motion?.current) return
    const angle = Math.sin(motion.current.phase) * motion.current.amount * swing
    const sit = motion.current.sit ?? 0
    if (left.current) left.current.rotation.x = THREE.MathUtils.lerp(angle, SEATED_LEG_ANGLE, sit)
    if (right.current) right.current.rotation.x = THREE.MathUtils.lerp(-angle, SEATED_LEG_ANGLE, sit)
  })
  return { left, right }
}

export const drawSketch: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = LILAC
  ctx.lineCap = 'round'
  ctx.lineWidth = w * 0.03
  const cx = w / 2
  const cy = h * 0.42
  ctx.beginPath()
  ctx.arc(cx, cy, w * 0.11, 0, Math.PI * 2)
  ctx.stroke()
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * w * 0.17, cy + Math.sin(angle) * w * 0.17)
    ctx.lineTo(cx + Math.cos(angle) * w * 0.25, cy + Math.sin(angle) * w * 0.25)
    ctx.stroke()
  }
  for (const [y, inset] of [[0.75, 0.2], [0.85, 0.3]]) {
    ctx.beginPath()
    ctx.moveTo(w * inset, h * y)
    ctx.quadraticCurveTo(w * 0.4, h * (y - 0.05), w * 0.5, h * y)
    ctx.quadraticCurveTo(w * 0.6, h * (y + 0.05), w * (1 - inset), h * y)
    ctx.stroke()
  }
}

/** 하루들: 베레모를 쓰고 그림판을 든 창작자 */
export function Harudle({ motion }: CharacterProps) {
  const { left, right } = useLegSwing(motion)
  const sketch = useCanvasTexture(drawSketch, 256, 256)
  return (
    <group>
      <group ref={left} position={[-0.11, 0.46, 0]}>
        <Line length={0.46} />
      </group>
      <group ref={right} position={[0.11, 0.46, 0]}>
        <Line length={0.46} />
      </group>
      <RoundedBox args={[0.66, 0.66, 0.05]} radius={0.015} position={[0, 0.72, 0.08]} castShadow>
        <Skin />
      </RoundedBox>
      <mesh position={[0, 0.72, 0.107]}>
        <planeGeometry args={[0.6, 0.6]} />
        <meshBasicMaterial map={sketch} toneMapped={false} />
      </mesh>
      {[-0.37, 0.37].map((x) => (
        <mesh key={x} position={[x, 0.72, 0.1]} castShadow>
          <sphereGeometry args={[0.06, 12, 10]} />
          <Skin thickness={1.4} />
        </mesh>
      ))}
      <group position-y={1.32}>
        <mesh castShadow>
          <sphereGeometry args={[0.34, 24, 18]} />
          <Skin />
        </mesh>
        <Face radius={0.34} />
        <mesh position={[0, 0.25, -0.01]} rotation-z={-0.08} scale={[1.1, 0.4, 1.1]} castShadow>
          <sphereGeometry args={[0.34, 20, 14]} />
          <Skin color={LILAC} />
        </mesh>
        <mesh position-y={0.42}>
          <capsuleGeometry args={[0.022, 0.07, 4, 6]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      </group>
    </group>
  )
}

/** 하루: 곱슬머리에 가방을 멘 호기심 많은 친구 */
export function Haru({ motion, waving = false }: CharacterProps & { waving?: boolean }) {
  const { left, right } = useLegSwing(motion)
  const arm = useRef<THREE.Group>(null)
  const reducedMotion = usePrefersReducedMotion()

  useFrame(({ clock }) => {
    if (!arm.current) return
    const wave = waving && !reducedMotion ? Math.sin(clock.elapsedTime * 6) * 0.28 : 0
    arm.current.rotation.z = (waving ? 2.5 : 0.25) + wave
  })

  const curls = useMemo(
    () =>
      [-1.15, -0.72, -0.3, 0.14, 0.58, 1.02].map((angle) => ({
        angle,
        x: Math.sin(angle) * 0.34,
        y: Math.cos(angle) * 0.34,
      })),
    [],
  )

  return (
    <group>
      <group ref={left} position={[-0.1, 0.46, 0]}>
        <Line length={0.46} />
      </group>
      <group ref={right} position={[0.1, 0.46, 0]}>
        <Line length={0.46} />
      </group>
      <mesh position-y={0.72} castShadow>
        <cylinderGeometry args={[0.12, 0.25, 0.56, 14]} />
        <Skin />
      </mesh>
      {/* 어깨끈과 가방 */}
      <mesh position={[0.02, 0.76, 0.19]} rotation-z={0.65}>
        <boxGeometry args={[0.05, 0.62, 0.015]} />
        <meshBasicMaterial color={LILAC} />
      </mesh>
      <RoundedBox args={[0.28, 0.24, 0.1]} radius={0.03} position={[0.27, 0.54, 0.14]} rotation-z={-0.2} castShadow>
        <Skin color={LILAC} thickness={1.4} />
      </RoundedBox>
      <group position={[-0.15, 0.92, 0]} rotation-z={-0.3}>
        <Line length={0.36} />
      </group>
      <group ref={arm} position={[0.14, 0.92, 0]}>
        <Line length={0.38} />
        <mesh position-y={-0.42}>
          <sphereGeometry args={[0.055, 12, 10]} />
          <Skin thickness={1.4} />
        </mesh>
      </group>
      <group position-y={1.3}>
        <mesh castShadow>
          <sphereGeometry args={[0.34, 24, 18]} />
          <Skin />
        </mesh>
        <Face radius={0.34} />
        {curls.map(({ angle, x, y }) => (
          <mesh key={angle} position={[x, y + 0.03, 0.02]} rotation-z={-angle}>
            <torusGeometry args={[0.075, 0.024, 6, 12, Math.PI * 1.25]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** 두들: 어디든 따라다니는 강아지 */
export function Doodle({ motion }: CharacterProps) {
  const front = useLegSwing(motion, 0.7)
  const back = useLegSwing(motion, -0.7)
  const pose = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const reducedMotion = usePrefersReducedMotion()

  useFrame(({ clock }) => {
    if (!tail.current) return
    tail.current.rotation.z = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 11) * 0.35
    // 엉덩이를 바닥에 내리고 앞다리는 곧게 세운 채, 고개는 앞을 본다.
    const sit = motion?.current?.dogSit ?? 0
    if (sit === 0 || !pose.current || !head.current) return
    pose.current.rotation.x = -DOG_SIT_TILT * sit
    pose.current.position.y = -DOG_SIT_DROP * sit
    head.current.rotation.x = DOG_SIT_TILT * sit
    for (const leg of [front.left.current, front.right.current]) {
      if (leg) leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, DOG_SIT_TILT, sit)
    }
    for (const leg of [back.left.current, back.right.current]) {
      if (leg) leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, DOG_SIT_REAR_LEG, sit)
    }
  })

  return (
    <group ref={pose}>
      <group ref={front.left} position={[-0.12, 0.36, 0.26]}>
        <Line length={0.36} />
      </group>
      <group ref={front.right} position={[0.12, 0.36, 0.26]}>
        <Line length={0.36} />
      </group>
      <group ref={back.left} position={[-0.12, 0.36, -0.28]}>
        <Line length={0.36} />
      </group>
      <group ref={back.right} position={[0.12, 0.36, -0.28]}>
        <Line length={0.36} />
      </group>
      <mesh position-y={0.48} rotation-x={Math.PI / 2} castShadow>
        <capsuleGeometry args={[0.2, 0.52, 6, 14]} />
        <Skin />
      </mesh>
      <group ref={tail} position={[0, 0.58, -0.5]} rotation-x={0}>
        <group rotation-x={-0.6}>
          <mesh position-y={0.14}>
            <capsuleGeometry args={[LINE_RADIUS, 0.28, 4, 8]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        </group>
      </group>
      <mesh position={[0, 0.62, 0.42]} rotation-x={Math.PI / 2 - 0.3}>
        <torusGeometry args={[0.15, 0.035, 8, 18]} />
        <Toon color={LILAC} outline={false} />
      </mesh>
      <group ref={head} position={[0, 0.8, 0.56]}>
        <mesh castShadow>
          <sphereGeometry args={[0.28, 24, 18]} />
          <Skin />
        </mesh>
        <Face radius={0.28} smile={false} />
        <Ink radius={0.05} position={[0, -0.05, 0.28]} />
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.27, 0.06, 0]} rotation-z={side * -0.25} scale={[0.5, 1, 0.75]} castShadow>
            <sphereGeometry args={[0.17, 14, 12]} />
            <Skin />
          </mesh>
        ))}
      </group>
    </group>
  )
}
