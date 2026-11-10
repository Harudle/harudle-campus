// 컷 상점의 장식: 머리 위 만화 효과 3종(fx) + 외형 위에 덧씌우는 착용 3종(head · neck · held)
// 서버가 접속자 목록에 붙여 준 gear(쓰고 있는 것)만 그린다. 44글자 외형(av)과는 따로다.
// 이 파일은 캠퍼스 것이다(src/harudle는 하루들 월드 복사본이라 다시 복사하면 덮어써진다).
import { useRef } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS } from '../harudle/brand'
import { Ink, INK, LILAC, Skin } from '../harudle/Characters'

/** 쓰고 있는 것: 슬롯 → sku (server/auth/catalog.js) */
export type GearState = { pet?: string; fx?: string; head?: string; neck?: string; held?: string }
export const GEAR_SLOTS = ['pet', 'fx', 'head', 'neck', 'held'] as const
/** 접속자 목록에서 받은 값을 아는 슬롯의 문자열만 남긴다 */
export function readGear(v: unknown): GearState | null {
  if (!v || typeof v !== 'object') return null
  const out: GearState = {}
  for (const slot of GEAR_SLOTS) { const sku = (v as Record<string, unknown>)[slot]; if (typeof sku === 'string' && sku.length <= 40) out[slot] = sku }
  return Object.keys(out).length ? out : null
}
export const gearKey = (g: GearState | null | undefined) => (g ? GEAR_SLOTS.map((s) => g[s] || '').join('|') : '')

/** 머리 위에서 살짝 떠 있는 만화 효과. 머리 그룹(원점 = 머리 중심, 반지름 0.34) 안에 넣는다 */
export function GearFx({ sku }: { sku?: string }) {
  const bob = useRef<THREE.Group>(null), spin = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (bob.current) bob.current.position.y = 0.66 + Math.sin(t * 2.6) * 0.03
    if (spin.current) spin.current.rotation.y = t * 1.4
  })
  if (sku === 'fx_bubble') {
    return (
      <group ref={bob} position={[0.2, 0.66, 0]}>
        <mesh scale={[1, 0.72, 0.6]}>
          <sphereGeometry args={[0.24, 20, 14]} />
          <Skin thickness={1.5} />
        </mesh>
        <mesh position={[-0.17, -0.19, 0]}>
          <sphereGeometry args={[0.05, 10, 8]} />
          <Skin thickness={1.2} />
        </mesh>
        {[-1, 0, 1].map((i) => (
          <group key={i}>
            <Ink radius={0.03} position={[i * 0.1, 0, 0.14]} />
            <Ink radius={0.03} position={[i * 0.1, 0, -0.14]} />
          </group>
        ))}
      </group>
    )
  }
  if (sku === 'fx_bang') {
    return (
      <group ref={bob} position={[0, 0.66, 0]} rotation-z={-0.12}>
        <mesh position-y={0.1} scale={[1, 1, 0.8]}>
          <capsuleGeometry args={[0.055, 0.2, 6, 12]} />
          <Skin color={COLORS.butter} thickness={1.5} />
        </mesh>
        <mesh position-y={-0.12}>
          <sphereGeometry args={[0.06, 12, 10]} />
          <Skin color={COLORS.butter} thickness={1.5} />
        </mesh>
      </group>
    )
  }
  if (sku === 'fx_sparkle') {
    return (
      <group ref={bob} position={[0, 0.66, 0]}>
        <group ref={spin}>
          {[[0.26, 0.04, 0, 0.11], [-0.2, -0.06, 0.14, 0.075], [-0.08, 0.12, -0.22, 0.09]].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]} scale={[0.55, 1.5, 0.55]}>
              <octahedronGeometry args={[r, 0]} />
              <Skin color={i === 1 ? LILAC : COLORS.butter} thickness={1.2} />
            </mesh>
          ))}
        </group>
      </group>
    )
  }
  return null
}

/** 학사모. 머리 그룹 안에 넣는다 */
export function GearHead({ sku }: { sku?: string }) {
  if (sku !== 'head_gradcap') return null
  return (
    <group position-y={0.26} rotation-z={-0.06}>
      <mesh castShadow>
        <cylinderGeometry args={[0.24, 0.27, 0.14, 20]} />
        <Skin color={COLORS.ink} thickness={1.3} />
      </mesh>
      <RoundedBox args={[0.66, 0.035, 0.66]} radius={0.012} position-y={0.09} rotation-y={Math.PI / 4} castShadow>
        <Skin color={COLORS.ink} thickness={1.4} />
      </RoundedBox>
      <mesh position-y={0.12}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <Skin color={COLORS.butter} thickness={1} />
      </mesh>
      {/* 술: 가운데에서 모서리로 가서 아래로 늘어진다 */}
      <mesh position={[0.16, 0.115, 0.16]} rotation={[0, -Math.PI / 4, Math.PI / 2]}>
        <capsuleGeometry args={[0.01, 0.44, 3, 6]} />
        <meshBasicMaterial color={COLORS.butter} />
      </mesh>
      <mesh position={[0.32, 0.0, 0.32]}>
        <capsuleGeometry args={[0.022, 0.16, 4, 8]} />
        <Skin color={COLORS.butter} thickness={1} />
      </mesh>
    </group>
  )
}

/** 사원증 목걸이. 몸 좌표(발이 원점)에 넣는다 */
export function GearNeck({ sku }: { sku?: string }) {
  if (sku !== 'neck_idcard') return null
  return (
    <group>
      <mesh position-y={0.97} rotation-x={Math.PI / 2 - 0.35} scale={[1, 1.25, 1]}>
        <torusGeometry args={[0.15, 0.014, 6, 20]} />
        <meshBasicMaterial color={COLORS.primary} />
      </mesh>
      <group position={[0, 0.72, 0.24]} rotation-x={-0.12}>
        <RoundedBox args={[0.19, 0.25, 0.022]} radius={0.01} castShadow>
          <Skin thickness={1.3} />
        </RoundedBox>
        <mesh position={[0, 0.095, 0.012]}>
          <boxGeometry args={[0.19, 0.055, 0.004]} />
          <meshBasicMaterial color={COLORS.primary} />
        </mesh>
        <Ink radius={0.036} position={[0, 0.01, 0.014]} />
        <mesh position={[0, -0.075, 0.013]}>
          <boxGeometry args={[0.11, 0.016, 0.003]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      </group>
    </group>
  )
}

/** 네컷 원고: 연필 · 풍선처럼 오른손 옆에 든다. 몸 좌표(발이 원점)에 넣는다 */
export function GearHeld({ sku }: { sku?: string }) {
  if (sku !== 'held_manuscript') return null
  return (
    <group position={[0.46, 0.74, 0.12]} rotation={[0.12, -0.35, -0.12]}>
      <RoundedBox args={[0.34, 0.44, 0.02]} radius={0.01} castShadow>
        <Skin color={COLORS.paper} thickness={1.4} />
      </RoundedBox>
      {/* 네 칸 */}
      {[-1, 1].map((sx) => [-1, 1].map((sy) => (
        <mesh key={`${sx}${sy}`} position={[sx * 0.078, sy * 0.1, 0.012]}>
          <boxGeometry args={[0.125, 0.17, 0.002]} />
          <meshBasicMaterial color={(sx + sy) % 4 === 0 ? COLORS.lavender200 : '#FFFFFF'} />
        </mesh>
      )))}
      <mesh position={[0, 0, 0.0125]}><boxGeometry args={[0.012, 0.4, 0.003]} /><meshBasicMaterial color={INK} /></mesh>
      <mesh position={[0, 0, 0.0125]}><boxGeometry args={[0.3, 0.012, 0.003]} /><meshBasicMaterial color={INK} /></mesh>
    </group>
  )
}
