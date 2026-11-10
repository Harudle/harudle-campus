// 컷 상점의 펫: 고양이 · 판다 · 여우 · 얼룩말 · 에뮤 (하루들 닉네임에 나오는 동물들) + 레어 대형 펫 호랑이 · 불곰
// 두들(강아지)과 같은 낙서 문법으로 그린다: 흰 몸 + 먹선 다리 + 라벤더 포인트. 발이 원점이고 +z를 바라본다.
// 주인이 멈춰 서 있으면 잠시 뒤 엎드려 쉬면서 주인을 올려다보고, 걸으면 꼬리를 더 빨리 흔든다.
// 이 파일은 캠퍼스 것이다(src/harudle는 하루들 월드 복사본이라 다시 복사하면 덮어써진다).
import { useRef, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS } from '../harudle/brand'
import { Doodle, Face, Ink, INK, LILAC, Line, LINE_RADIUS, Skin, useLegSwing, type WalkMotion } from '../harudle/Characters'

export type PetKind = 'doodle' | 'cat' | 'panda' | 'fox' | 'zebra' | 'emu' | 'tiger' | 'bear'
const SKU_PET: Record<string, PetKind> = { pet_cat: 'cat', pet_panda: 'panda', pet_fox: 'fox', pet_zebra: 'zebra', pet_emu: 'emu', pet_tiger: 'tiger', pet_bear: 'bear' }
/** 상점 sku → 그릴 펫. 모르는 값이면 null */
export const petOfSku = (sku: unknown): PetKind | null => (typeof sku === 'string' && SKU_PET[sku]) || null

type PetProps = { motion?: RefObject<WalkMotion> }
const FOX = '#FFB37A'
const REST_AFTER = 2.6   // 이만큼(초) 멈춰 있으면 엎드린다
const CROUCH = 0.62      // 엎드릴 때 다리가 접히는 정도

/** 멈춘 지 오래되면 1(엎드림), 걷기 시작하면 0. 몸을 내리고 다리를 접고 머리를 든다 */
function useRest(motion: RefObject<WalkMotion> | undefined, legY: number) {
  const body = useRef<THREE.Group>(null), legs = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null)
  const state = useRef({ still: 0, rest: 0 })
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05), s = state.current, moving = (motion?.current?.amount ?? 0) > 0.08
    s.still = moving ? 0 : s.still + dt
    s.rest = THREE.MathUtils.damp(s.rest, s.still > REST_AFTER ? 1 : 0, moving ? 14 : 5, dt)
    if (legs.current) legs.current.scale.y = 1 - CROUCH * s.rest
    if (body.current) body.current.position.y = -legY * CROUCH * s.rest
    if (head.current) {
      const t = clock.elapsedTime
      head.current.rotation.x = -0.22 * s.rest                                   // 주인을 올려다본다
      head.current.rotation.z = Math.sin(t * 0.9) * 0.14 * s.rest                // 고개를 갸웃
      head.current.rotation.y = Math.sin(t * 0.5) * 0.25 * s.rest
    }
  })
  return { body, legs, head }
}

/** 다리 하나: 먹선 + 동그란 발 */
function Leg({ length, radius = LINE_RADIUS, paw = 0.048 }: { length: number; radius?: number; paw?: number }) {
  return (
    <>
      <Line length={length} radius={radius} />
      <mesh position-y={-length}>
        <sphereGeometry args={[paw, 10, 8]} />
        <meshBasicMaterial color={INK} />
      </mesh>
    </>
  )
}

function FourLegs({ motion, y, front, back, x = 0.11, length, radius, legs, leg }: { motion?: RefObject<WalkMotion>; y: number; front: number; back: number; x?: number; length: number; radius?: number; legs: RefObject<THREE.Group | null>; leg?: ReactNode }) {
  const f = useLegSwing(motion, 0.7), b = useLegSwing(motion, -0.7)
  if (leg) return (
    <group ref={legs}>
      <group ref={f.left} position={[-x, y, front]}>{leg}</group>
      <group ref={f.right} position={[x, y, front]}>{leg}</group>
      <group ref={b.left} position={[-x, y, back]}>{leg}</group>
      <group ref={b.right} position={[x, y, back]}>{leg}</group>
    </group>
  )
  return (
    <group ref={legs}>
      <group ref={f.left} position={[-x, y, front]}><Leg length={length} radius={radius} /></group>
      <group ref={f.right} position={[x, y, front]}><Leg length={length} radius={radius} /></group>
      <group ref={b.left} position={[-x, y, back]}><Leg length={length} radius={radius} /></group>
      <group ref={b.right} position={[x, y, back]}><Leg length={length} radius={radius} /></group>
    </group>
  )
}

/** 꼬리: 걸을 때 더 빨리 흔든다 */
function Tail({ motion, position, speed, amount, children }: { motion?: RefObject<WalkMotion>; position: [number, number, number]; speed: number; amount: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null), phase = useRef(0)
  useFrame((_, delta) => {
    phase.current += Math.min(delta, 0.05) * speed * (1 + 1.6 * (motion?.current?.amount ?? 0))
    if (ref.current) ref.current.rotation.z = Math.sin(phase.current) * amount
  })
  return <group ref={ref} position={position}>{children}</group>
}

/** 볼 터치 */
function Cheeks({ radius, z, y = -0.05 }: { radius: number; z: number; y?: number }) {
  return (
    <>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * radius * 0.62, y, z]} scale={[1, 0.7, 0.4]}>
          <sphereGeometry args={[radius * 0.16, 10, 8]} />
          <meshBasicMaterial color={COLORS.blush} />
        </mesh>
      ))}
    </>
  )
}

/** 고양이: 뾰족한 귀(속은 분홍), 위로 세운 긴 꼬리, 등 줄무늬, 분홍 목줄 */
export function Cat({ motion }: PetProps) {
  const rest = useRest(motion, 0.3)
  return (
    <group>
      <FourLegs motion={motion} y={0.3} front={0.2} back={-0.22} length={0.3} legs={rest.legs} />
      <group ref={rest.body}>
        <mesh position-y={0.42} rotation-x={Math.PI / 2} castShadow>
          <capsuleGeometry args={[0.17, 0.42, 6, 14]} />
          <Skin />
        </mesh>
        {/* 등 줄무늬 */}
        {[-0.14, 0, 0.14].map((z) => (
          <mesh key={z} position={[0, 0.585, z - 0.05]} rotation-z={Math.PI / 2}>
            <capsuleGeometry args={[0.014, 0.13, 3, 6]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        ))}
        <Tail motion={motion} position={[0, 0.5, -0.4]} speed={3.2} amount={0.32}>
          <group rotation-x={-0.25}>
            <mesh position-y={0.24}>
              <capsuleGeometry args={[LINE_RADIUS * 1.3, 0.46, 4, 8]} />
              <meshBasicMaterial color={INK} />
            </mesh>
            <mesh position={[0, 0.5, 0.03]}>
              <sphereGeometry args={[0.055, 10, 8]} />
              <meshBasicMaterial color={INK} />
            </mesh>
          </group>
        </Tail>
        <mesh position={[0, 0.54, 0.34]} rotation-x={Math.PI / 2 - 0.3}>
          <torusGeometry args={[0.13, 0.03, 8, 18]} />
          <Skin color={COLORS.blush} thickness={1.1} />
        </mesh>
        {/* 방울 */}
        <mesh position={[0, 0.47, 0.47]}>
          <sphereGeometry args={[0.04, 10, 8]} />
          <Skin color={COLORS.butter} thickness={1} />
        </mesh>
        <group ref={rest.head} position={[0, 0.72, 0.46]}>
          <mesh castShadow>
            <sphereGeometry args={[0.25, 24, 18]} />
            <Skin />
          </mesh>
          <Face radius={0.25} smile={false} />
          <Ink radius={0.03} position={[0, -0.035, 0.248]} />
          <Cheeks radius={0.25} z={0.2} y={-0.06} />
          {[-1, 1].map((side) => (
            <group key={side}>
              <group position={[side * 0.15, 0.23, 0]} rotation-z={side * -0.3}>
                <mesh castShadow>
                  <coneGeometry args={[0.095, 0.19, 4]} />
                  <Skin />
                </mesh>
                <mesh position={[0, -0.02, 0.035]} scale={[0.55, 0.6, 0.4]}>
                  <coneGeometry args={[0.095, 0.19, 4]} />
                  <meshBasicMaterial color={COLORS.blush} />
                </mesh>
              </group>
              {[-0.03, 0.03].map((dy) => (
                <mesh key={dy} position={[side * 0.2, -0.06 + dy, 0.2]} rotation-z={Math.PI / 2 + side * dy * 5}>
                  <capsuleGeometry args={[0.008, 0.14, 3, 4]} />
                  <meshBasicMaterial color={INK} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}

/** 판다: 통통한 몸, 굵고 까만 팔다리, 까만 귀와 눈가, 대나무 잎 */
export function Panda({ motion }: PetProps) {
  const rest = useRest(motion, 0.3)
  return (
    <group>
      <FourLegs motion={motion} y={0.3} front={0.2} back={-0.2} x={0.15} length={0.28} radius={0.058} legs={rest.legs} />
      <group ref={rest.body}>
        <mesh position-y={0.46} rotation-x={Math.PI / 2} scale={[1.1, 1, 1]} castShadow>
          <capsuleGeometry args={[0.23, 0.34, 6, 14]} />
          <Skin />
        </mesh>
        {/* 어깨의 까만 띠 */}
        <mesh position={[0, 0.47, 0.14]} rotation-x={Math.PI / 2} scale={[1.12, 1, 1.03]}>
          <cylinderGeometry args={[0.232, 0.232, 0.15, 20]} />
          <meshBasicMaterial color={INK} />
        </mesh>
        <mesh position={[0, 0.52, -0.42]}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshBasicMaterial color={INK} />
        </mesh>
        <group ref={rest.head} position={[0, 0.78, 0.44]}>
          <mesh castShadow>
            <sphereGeometry args={[0.29, 24, 18]} />
            <Skin />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh position={[side * 0.2, 0.22, -0.02]}>
                <sphereGeometry args={[0.1, 14, 12]} />
                <meshBasicMaterial color={INK} />
              </mesh>
              {/* 눈가 얼룩: 그 위에 흰 눈동자를 올린다 */}
              <mesh position={[side * 0.105, 0.02, 0.255]} rotation-z={side * 0.5} scale={[0.8, 1.15, 0.35]}>
                <sphereGeometry args={[0.07, 12, 10]} />
                <meshBasicMaterial color={INK} />
              </mesh>
              <mesh position={[side * 0.105, 0.03, 0.283]}>
                <sphereGeometry args={[0.022, 8, 6]} />
                <meshBasicMaterial color="#FFFFFF" />
              </mesh>
            </group>
          ))}
          <Ink radius={0.04} position={[0, -0.07, 0.285]} />
          <Cheeks radius={0.29} z={0.235} y={-0.1} />
          {/* 입에 문 대나무 잎 */}
          <group position={[0.07, -0.13, 0.27]} rotation={[0.2, 0.3, -0.5]}>
            <mesh>
              <capsuleGeometry args={[0.012, 0.16, 3, 6]} />
              <meshBasicMaterial color="#5FAE6B" />
            </mesh>
            <mesh position={[0.03, 0.09, 0]} rotation-z={-0.6} scale={[0.45, 1, 0.2]}>
              <sphereGeometry args={[0.06, 8, 6]} />
              <meshBasicMaterial color="#7CC98A" />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

/** 여우: 주황 몸, 흰 가슴, 끝이 먹색인 큰 귀, 끝이 흰 풍성한 꼬리 */
export function Fox({ motion }: PetProps) {
  const rest = useRest(motion, 0.32)
  return (
    <group>
      <FourLegs motion={motion} y={0.32} front={0.22} back={-0.24} length={0.32} legs={rest.legs} />
      <group ref={rest.body}>
        <mesh position-y={0.44} rotation-x={Math.PI / 2} castShadow>
          <capsuleGeometry args={[0.17, 0.46, 6, 14]} />
          <Skin color={FOX} />
        </mesh>
        {/* 흰 가슴 */}
        <mesh position={[0, 0.4, 0.3]} scale={[0.9, 1, 0.8]}>
          <sphereGeometry args={[0.13, 14, 12]} />
          <Skin thickness={1.1} />
        </mesh>
        <Tail motion={motion} position={[0, 0.48, -0.4]} speed={4.5} amount={0.28}>
          <group rotation-x={-1.05}>
            <mesh position-y={0.22} scale={[1.15, 1, 0.95]} castShadow>
              <capsuleGeometry args={[0.11, 0.26, 6, 12]} />
              <Skin color={FOX} thickness={1.4} />
            </mesh>
            <mesh position-y={0.42}>
              <sphereGeometry args={[0.105, 12, 10]} />
              <Skin thickness={1.2} />
            </mesh>
          </group>
        </Tail>
        <mesh position={[0, 0.56, 0.36]} rotation-x={Math.PI / 2 - 0.3}>
          <torusGeometry args={[0.13, 0.03, 8, 18]} />
          <Skin color={LILAC} thickness={1.1} />
        </mesh>
        <group ref={rest.head} position={[0, 0.74, 0.5]}>
          <mesh castShadow>
            <sphereGeometry args={[0.24, 24, 18]} />
            <Skin color={FOX} />
          </mesh>
          {/* 흰 주둥이 */}
          <mesh position={[0, -0.07, 0.15]} scale={[1, 0.75, 1]}>
            <sphereGeometry args={[0.13, 16, 12]} />
            <Skin thickness={1.1} />
          </mesh>
          <Face radius={0.24} smile={false} />
          <Ink radius={0.035} position={[0, -0.06, 0.285]} />
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.17, 0.26, -0.02]} rotation-z={side * -0.38}>
              <mesh castShadow>
                <coneGeometry args={[0.12, 0.3, 4]} />
                <Skin color={FOX} />
              </mesh>
              {/* 귀 끝은 먹색 */}
              <mesh position-y={0.1}>
                <coneGeometry args={[0.05, 0.12, 4]} />
                <meshBasicMaterial color={INK} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}

/** 얼룩말: 먹선 줄무늬, 갈기, 긴 얼굴, 술 달린 꼬리 */
export function Zebra({ motion }: PetProps) {
  const rest = useRest(motion, 0.4)
  return (
    <group>
      <FourLegs motion={motion} y={0.4} front={0.24} back={-0.26} x={0.12} length={0.4} radius={0.04} legs={rest.legs} />
      <group ref={rest.body}>
        <mesh position-y={0.56} rotation-x={Math.PI / 2} castShadow>
          <capsuleGeometry args={[0.2, 0.5, 6, 14]} />
          <Skin />
        </mesh>
        {/* 몸통 줄무늬 */}
        {[-0.24, -0.1, 0.04, 0.18].map((z) => (
          <mesh key={z} position={[0, 0.56, z]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.203, 0.203, 0.045, 20]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        ))}
        <Tail motion={motion} position={[0, 0.66, -0.46]} speed={2.6} amount={0.35}>
          <group rotation-x={-2.4}>
            <mesh position-y={0.14}>
              <capsuleGeometry args={[LINE_RADIUS * 0.9, 0.26, 4, 8]} />
              <meshBasicMaterial color={INK} />
            </mesh>
            <mesh position-y={0.32} scale={[1, 1.5, 1]}>
              <sphereGeometry args={[0.055, 10, 8]} />
              <meshBasicMaterial color={INK} />
            </mesh>
          </group>
        </Tail>
        {/* 목 */}
        <mesh position={[0, 0.8, 0.36]} rotation-x={0.75} castShadow>
          <capsuleGeometry args={[0.12, 0.26, 6, 12]} />
          <Skin />
        </mesh>
        {[0.7, 0.8, 0.9].map((y, i) => (
          <mesh key={y} position={[0, y, 0.27 + i * 0.09]} rotation-x={0.75 + Math.PI / 2}>
            <cylinderGeometry args={[0.123, 0.123, 0.035, 16]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        ))}
        <group ref={rest.head} position={[0, 1.0, 0.52]}>
          {/* 갈기 */}
          <mesh position={[0, 0.06, -0.18]} rotation-x={0.75} scale={[0.35, 1, 1]}>
            <capsuleGeometry args={[0.07, 0.34, 4, 8]} />
            <meshBasicMaterial color={INK} />
          </mesh>
          <mesh castShadow>
            <sphereGeometry args={[0.2, 20, 16]} />
            <Skin />
          </mesh>
          {/* 긴 주둥이 */}
          <mesh position={[0, -0.08, 0.2]} rotation-x={Math.PI / 2 + 0.35} castShadow>
            <capsuleGeometry args={[0.11, 0.14, 6, 12]} />
            <Skin />
          </mesh>
          <mesh position={[0, -0.13, 0.31]} scale={[1, 0.8, 0.7]}>
            <sphereGeometry args={[0.108, 14, 12]} />
            <meshBasicMaterial color={INK} />
          </mesh>
          <Ink radius={0.03} position={[-0.11, 0.04, 0.165]} />
          <Ink radius={0.03} position={[0.11, 0.04, 0.165]} />
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.11, 0.21, -0.02]} rotation-z={side * -0.25} scale={[0.6, 1, 0.5]} castShadow>
              <coneGeometry args={[0.07, 0.17, 6]} />
              <Skin />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}

/** 에뮤: 두 다리로 성큼성큼, 라벤더 솜털 몸, 긴 목, 노란 부리 */
export function Emu({ motion }: PetProps) {
  const rest = useRest(motion, 0.5)
  const leg = useLegSwing(motion, 0.9)
  const neck = useRef<THREE.Group>(null)
  useFrame(() => { if (neck.current) neck.current.rotation.x = 0.12 + Math.sin(motion?.current?.phase ?? 0) * 0.14 * (motion?.current?.amount ?? 0) })   // 걸을 때 목을 앞뒤로
  return (
    <group>
      <group ref={rest.legs}>
        <group ref={leg.left} position={[-0.1, 0.5, 0]}><Leg length={0.5} radius={0.028} paw={0.055} /></group>
        <group ref={leg.right} position={[0.1, 0.5, 0]}><Leg length={0.5} radius={0.028} paw={0.055} /></group>
      </group>
      <group ref={rest.body}>
        <mesh position={[0, 0.72, -0.04]} scale={[1, 0.9, 1.25]} castShadow>
          <sphereGeometry args={[0.27, 20, 16]} />
          <Skin color={COLORS.lavender200} />
        </mesh>
        {/* 꽁지 솜털 */}
        {[-1, 0, 1].map((i) => (
          <mesh key={i} position={[i * 0.09, 0.72 - Math.abs(i) * 0.03, -0.38]} rotation-x={-0.9} scale={[0.6, 1, 0.6]}>
            <sphereGeometry args={[0.1, 10, 8]} />
            <Skin color={COLORS.lavender300} thickness={1.1} />
          </mesh>
        ))}
        <group ref={neck} position={[0, 0.84, 0.2]}>
          <mesh position-y={0.24} castShadow>
            <capsuleGeometry args={[0.065, 0.42, 6, 10]} />
            <Skin />
          </mesh>
          <group ref={rest.head} position={[0, 0.54, 0.02]}>
            <mesh castShadow>
              <sphereGeometry args={[0.15, 18, 14]} />
              <Skin />
            </mesh>
            <Face radius={0.15} smile={false} />
            <mesh position={[0, -0.03, 0.19]} rotation-x={Math.PI / 2}>
              <coneGeometry args={[0.05, 0.14, 8]} />
              <Skin color={COLORS.butter} thickness={1.1} />
            </mesh>
            {/* 머리 위 솜털 세 가닥 */}
            {[-0.5, 0, 0.5].map((a) => (
              <mesh key={a} position={[a * 0.09, 0.17, -0.02]} rotation-z={-a * 0.7}>
                <capsuleGeometry args={[0.012, 0.09, 3, 5]} />
                <meshBasicMaterial color={INK} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  )
}

const TIGER = '#FF9F45', BEAR = '#9A6A45', BEAR_LIGHT = '#E8C9A0'
const BIG = 1.55   // 레어 펫은 다른 펫보다 훨씬 크다

/** 굵은 다리: 몸 색 기둥 + 큼직한 발 */
function ThickLeg({ length, radius, color, paw }: { length: number; radius: number; color: string; paw: string }) {
  return (
    <>
      <mesh position-y={-length / 2} castShadow>
        <capsuleGeometry args={[radius, length - radius, 6, 10]} />
        <Skin color={color} thickness={1.4} />
      </mesh>
      <mesh position={[0, -length + radius * 0.5, radius * 0.35]} scale={[1.15, 0.7, 1.35]}>
        <sphereGeometry args={[radius * 1.05, 12, 10]} />
        <Skin color={paw} thickness={1.3} />
      </mesh>
    </>
  )
}

/** 호랑이(레어): 큰 몸, 먹선 줄무늬, 흰 배와 볼 털, 이마의 王, 줄무늬 꼬리 */
export function Tiger({ motion }: PetProps) {
  const rest = useRest(motion, 0.36)
  return (
    <group scale={BIG}>
      <FourLegs motion={motion} y={0.36} front={0.22} back={-0.26} x={0.15} length={0.36} legs={rest.legs} leg={<ThickLeg length={0.36} radius={0.07} color={TIGER} paw="#FFFFFF" />} />
      <group ref={rest.body}>
        <mesh position-y={0.52} rotation-x={Math.PI / 2} castShadow>
          <capsuleGeometry args={[0.22, 0.46, 8, 16]} />
          <Skin color={TIGER} />
        </mesh>
        {/* 흰 배 */}
        <mesh position={[0, 0.43, 0]} rotation-x={Math.PI / 2} scale={[0.82, 1, 0.7]}>
          <capsuleGeometry args={[0.2, 0.4, 6, 12]} />
          <meshBasicMaterial color="#FFFFFF" />
        </mesh>
        {/* 등 줄무늬: 위쪽 반만 감는 먹선 */}
        {[-0.24, -0.12, 0, 0.12, 0.24].map((z, i) => (
          <mesh key={z} position={[0, 0.52, z]}>
            <torusGeometry args={[0.222, i % 2 ? 0.02 : 0.027, 6, 18, Math.PI]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        ))}
        <Tail motion={motion} position={[0, 0.6, -0.44]} speed={2.4} amount={0.4}>
          <group rotation-x={-0.9}>
            <mesh position-y={0.26} castShadow>
              <capsuleGeometry args={[0.05, 0.46, 6, 10]} />
              <Skin color={TIGER} thickness={1.3} />
            </mesh>
            {[0.12, 0.26, 0.4].map((y) => (
              <mesh key={y} position-y={y}>
                <cylinderGeometry args={[0.053, 0.053, 0.045, 12]} />
                <meshBasicMaterial color={INK} />
              </mesh>
            ))}
            <mesh position-y={0.53}>
              <sphereGeometry args={[0.058, 10, 8]} />
              <meshBasicMaterial color={INK} />
            </mesh>
          </group>
        </Tail>
        <group ref={rest.head} position={[0, 0.86, 0.5]}>
          <mesh castShadow>
            <sphereGeometry args={[0.3, 26, 20]} />
            <Skin color={TIGER} />
          </mesh>
          {/* 흰 볼 털과 주둥이 */}
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh position={[side * 0.2, -0.1, 0.12]} scale={[1, 0.8, 0.8]}>
                <sphereGeometry args={[0.15, 14, 12]} />
                <Skin thickness={1.2} />
              </mesh>
              <mesh position={[side * 0.2, 0.25, -0.02]} castShadow>
                <sphereGeometry args={[0.1, 14, 12]} />
                <Skin color={TIGER} />
              </mesh>
              <mesh position={[side * 0.2, 0.25, 0.045]} scale={[1, 1, 0.5]}>
                <sphereGeometry args={[0.055, 10, 8]} />
                <meshBasicMaterial color="#FFFFFF" />
              </mesh>
              {/* 볼 줄무늬 */}
              {[0, 1].map((k) => (
                <mesh key={k} position={[side * 0.285, -0.02 - k * 0.07, 0.06]} rotation-z={side * 0.5}>
                  <capsuleGeometry args={[0.013, 0.07, 3, 5]} />
                  <meshBasicMaterial color={INK} />
                </mesh>
              ))}
            </group>
          ))}
          <mesh position={[0, -0.09, 0.22]} scale={[1.1, 0.8, 0.9]}>
            <sphereGeometry args={[0.13, 16, 12]} />
            <Skin thickness={1.1} />
          </mesh>
          <Face radius={0.3} smile={false} />
          <mesh position={[0, -0.05, 0.345]} scale={[1.3, 0.8, 0.6]}>
            <sphereGeometry args={[0.04, 10, 8]} />
            <meshBasicMaterial color={COLORS.blush} />
          </mesh>
          {/* 이마의 王 */}
          {[0.19, 0.145, 0.1].map((y, i) => (
            <mesh key={y} position={[0, y, Math.sqrt(0.09 - y * y) + 0.004]} rotation={[-Math.asin(y / 0.3), 0, Math.PI / 2]}>
              <capsuleGeometry args={[0.012, i === 1 ? 0.07 : 0.1, 3, 5]} />
              <meshBasicMaterial color={INK} />
            </mesh>
          ))}
          <mesh position={[0, 0.145, Math.sqrt(0.09 - 0.145 * 0.145) + 0.006]} rotation-x={-Math.asin(0.145 / 0.3)}>
            <capsuleGeometry args={[0.012, 0.09, 3, 5]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** 불곰(레어): 묵직한 갈색 몸, 둥근 귀, 밝은 주둥이와 배, 짧은 꼬리 */
export function Bear({ motion }: PetProps) {
  const rest = useRest(motion, 0.34)
  return (
    <group scale={BIG}>
      <FourLegs motion={motion} y={0.34} front={0.22} back={-0.24} x={0.18} length={0.34} legs={rest.legs} leg={<ThickLeg length={0.34} radius={0.09} color={BEAR} paw={BEAR} />} />
      <group ref={rest.body}>
        <mesh position-y={0.56} rotation-x={Math.PI / 2} scale={[1.12, 1, 1.08]} castShadow>
          <capsuleGeometry args={[0.28, 0.4, 8, 16]} />
          <Skin color={BEAR} />
        </mesh>
        {/* 어깨 혹 */}
        <mesh position={[0, 0.78, 0.14]} scale={[1, 0.6, 1]} castShadow>
          <sphereGeometry args={[0.2, 16, 12]} />
          <Skin color={BEAR} thickness={1.3} />
        </mesh>
        <mesh position={[0, 0.6, -0.5]}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <Skin color={BEAR} thickness={1.2} />
        </mesh>
        <group ref={rest.head} position={[0, 0.84, 0.52]}>
          <mesh castShadow>
            <sphereGeometry args={[0.3, 26, 20]} />
            <Skin color={BEAR} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.21, 0.24, -0.02]}>
              <mesh castShadow>
                <sphereGeometry args={[0.105, 14, 12]} />
                <Skin color={BEAR} />
              </mesh>
              <mesh position-z={0.05} scale={[1, 1, 0.5]}>
                <sphereGeometry args={[0.06, 10, 8]} />
                <meshBasicMaterial color={BEAR_LIGHT} />
              </mesh>
            </group>
          ))}
          {/* 밝은 주둥이 */}
          <mesh position={[0, -0.09, 0.22]} scale={[1.1, 0.85, 1]}>
            <sphereGeometry args={[0.15, 16, 12]} />
            <Skin color={BEAR_LIGHT} thickness={1.2} />
          </mesh>
          <Face radius={0.3} smile={false} />
          <mesh position={[0, -0.04, 0.37]} scale={[1.3, 0.85, 0.7]}>
            <sphereGeometry args={[0.05, 12, 10]} />
            <meshBasicMaterial color={INK} />
          </mesh>
          <mesh position={[0, -0.13, 0.36]} rotation-z={Math.PI}>
            <torusGeometry args={[0.04, 0.01, 6, 12, Math.PI]} />
            <meshBasicMaterial color={INK} />
          </mesh>
          <Cheeks radius={0.3} z={0.25} y={-0.06} />
        </group>
      </group>
    </group>
  )
}

export function Pet({ kind, motion }: { kind: PetKind; motion?: RefObject<WalkMotion> }) {
  if (kind === 'cat') return <Cat motion={motion} />
  if (kind === 'panda') return <Panda motion={motion} />
  if (kind === 'fox') return <Fox motion={motion} />
  if (kind === 'zebra') return <Zebra motion={motion} />
  if (kind === 'emu') return <Emu motion={motion} />
  if (kind === 'tiger') return <Tiger motion={motion} />
  if (kind === 'bear') return <Bear motion={motion} />
  return <Doodle motion={motion} />
}
