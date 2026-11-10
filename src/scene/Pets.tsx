// 컷 상점의 펫: 고양이 · 판다 · 여우 (하루들 닉네임에 나오는 동물들)
// 두들(강아지)과 같은 낙서 문법으로 그린다: 흰 몸 + 먹선 다리 + 라벤더 포인트. 발이 원점이고 +z를 바라본다.
// 이 파일은 캠퍼스 것이다(src/harudle는 하루들 월드 복사본이라 다시 복사하면 덮어써진다).
import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS } from '../harudle/brand'
import { Doodle, Face, Ink, INK, LILAC, Line, LINE_RADIUS, Skin, useLegSwing, type WalkMotion } from '../harudle/Characters'

export type PetKind = 'doodle' | 'cat' | 'panda' | 'fox'
/** 상점 sku → 그릴 펫. 모르는 값이면 null */
export const petOfSku = (sku: unknown): PetKind | null => (sku === 'pet_cat' ? 'cat' : sku === 'pet_panda' ? 'panda' : sku === 'pet_fox' ? 'fox' : null)

type PetProps = { motion?: RefObject<WalkMotion> }
const FOX = '#FFB37A'

function Legs({ motion, y, front, back, x = 0.11, length }: { motion?: RefObject<WalkMotion>; y: number; front: number; back: number; x?: number; length: number }) {
  const f = useLegSwing(motion, 0.7), b = useLegSwing(motion, -0.7)
  return (
    <>
      <group ref={f.left} position={[-x, y, front]}><Line length={length} /></group>
      <group ref={f.right} position={[x, y, front]}><Line length={length} /></group>
      <group ref={b.left} position={[-x, y, back]}><Line length={length} /></group>
      <group ref={b.right} position={[x, y, back]}><Line length={length} /></group>
    </>
  )
}

/** 꼬리를 좌우로 흔든다 */
function useSway(speed: number, amount: number) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.z = Math.sin(clock.elapsedTime * speed) * amount })
  return ref
}

/** 고양이: 뾰족한 귀, 위로 세운 긴 꼬리, 분홍 목줄 */
export function Cat({ motion }: PetProps) {
  const tail = useSway(3.2, 0.3)
  return (
    <group>
      <Legs motion={motion} y={0.3} front={0.2} back={-0.22} length={0.3} />
      <mesh position-y={0.42} rotation-x={Math.PI / 2} castShadow>
        <capsuleGeometry args={[0.17, 0.42, 6, 14]} />
        <Skin />
      </mesh>
      <group ref={tail} position={[0, 0.5, -0.4]}>
        <group rotation-x={-0.25}>
          <mesh position-y={0.24}>
            <capsuleGeometry args={[LINE_RADIUS * 1.25, 0.46, 4, 8]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        </group>
      </group>
      <mesh position={[0, 0.54, 0.34]} rotation-x={Math.PI / 2 - 0.3}>
        <torusGeometry args={[0.13, 0.03, 8, 18]} />
        <Skin color={COLORS.blush} thickness={1.1} />
      </mesh>
      <group position={[0, 0.72, 0.46]}>
        <mesh castShadow>
          <sphereGeometry args={[0.25, 24, 18]} />
          <Skin />
        </mesh>
        <Face radius={0.25} smile={false} />
        <Ink radius={0.035} position={[0, -0.04, 0.245]} />
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 0.15, 0.23, 0]} rotation-z={side * -0.3} castShadow>
              <coneGeometry args={[0.09, 0.17, 4]} />
              <Skin />
            </mesh>
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
  )
}

/** 판다: 통통한 몸, 까만 귀와 눈가, 짧은 꼬리 */
export function Panda({ motion }: PetProps) {
  return (
    <group>
      <Legs motion={motion} y={0.3} front={0.2} back={-0.2} x={0.14} length={0.3} />
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
      <group position={[0, 0.78, 0.44]}>
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
      </group>
    </group>
  )
}

/** 여우: 주황 몸, 큰 귀, 끝이 흰 풍성한 꼬리 */
export function Fox({ motion }: PetProps) {
  const tail = useSway(4.5, 0.25)
  return (
    <group>
      <Legs motion={motion} y={0.32} front={0.22} back={-0.24} length={0.32} />
      <mesh position-y={0.44} rotation-x={Math.PI / 2} castShadow>
        <capsuleGeometry args={[0.17, 0.46, 6, 14]} />
        <Skin color={FOX} />
      </mesh>
      <group ref={tail} position={[0, 0.48, -0.4]}>
        <group rotation-x={-1.05}>
          <mesh position-y={0.2} scale={[1, 1, 0.85]} castShadow>
            <capsuleGeometry args={[0.1, 0.24, 6, 12]} />
            <Skin color={FOX} thickness={1.4} />
          </mesh>
          <mesh position-y={0.39}>
            <sphereGeometry args={[0.092, 12, 10]} />
            <Skin thickness={1.2} />
          </mesh>
        </group>
      </group>
      <mesh position={[0, 0.56, 0.36]} rotation-x={Math.PI / 2 - 0.3}>
        <torusGeometry args={[0.13, 0.03, 8, 18]} />
        <Skin color={LILAC} thickness={1.1} />
      </mesh>
      <group position={[0, 0.74, 0.5]}>
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
  )
}

export function Pet({ kind, motion }: { kind: PetKind; motion?: RefObject<WalkMotion> }) {
  if (kind === 'cat') return <Cat motion={motion} />
  if (kind === 'panda') return <Panda motion={motion} />
  if (kind === 'fox') return <Fox motion={motion} />
  return <Doodle motion={motion} />
}
