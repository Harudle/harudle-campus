// 컷 상점의 장식: 머리 위 만화 효과 9종(fx) + 외형 위에 덧씌우는 착용 13종(head · neck · held)
// 서버가 접속자 목록에 붙여 준 gear(쓰고 있는 것)만 그린다. 44글자 외형(av)과는 따로다.
// 효과는 가만히 있지 않는다: 말풍선 점이 차례로 튀고, 느낌표가 번쩍 커지고, 하트가 두근거리고, 땀방울이 흘러내린다.
// 이 파일은 캠퍼스 것이다(src/harudle는 하루들 월드 복사본이라 다시 복사하면 덮어써진다).
import { useEffect, useRef, useState } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS } from '../harudle/brand'
import { Ink, INK, LILAC, Skin } from '../harudle/Characters'
import { useCanvasTexture, type DrawFn } from '../harudle/useCanvasTexture'

/** 쓰고 있는 것: 슬롯 → sku (server/auth/catalog.js) */
export type GearState = { pet?: string; fx?: string; head?: string; neck?: string; held?: string; frame?: string }   // frame: 내 네컷 액자에 걸 하루들 피드 ID(서버가 붙인다)
export const FRAME_SKU = 'held_myframe'
export const GEAR_SLOTS = ['pet', 'fx', 'head', 'neck', 'held'] as const
/** 접속자 목록에서 받은 값을 아는 슬롯의 문자열만 남긴다 */
export function readGear(v: unknown): GearState | null {
  if (!v || typeof v !== 'object') return null
  const out: GearState = {}
  for (const slot of GEAR_SLOTS) { const sku = (v as Record<string, unknown>)[slot]; if (typeof sku === 'string' && sku.length <= 40) out[slot] = sku }
  const frame = (v as Record<string, unknown>).frame
  if (out.held === FRAME_SKU && typeof frame === 'string' && /^[0-9a-f-]{36}$/.test(frame)) out.frame = frame
  return Object.keys(out).length ? out : null
}
export const gearKey = (g: GearState | null | undefined) => (g ? GEAR_SLOTS.map((s) => g[s] || '').join('|') + '|' + (g.frame || '') : '')

const SWEAT = '#8FD3FF'
const FX_Y = 0.68   // 머리 중심에서 효과가 뜨는 높이

function Bubble() {
  const root = useRef<THREE.Group>(null), dots = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (root.current) { root.current.position.y = FX_Y + Math.sin(t * 2.2) * 0.025; root.current.scale.setScalar(1 + Math.sin(t * 2.2) * 0.03) }
    dots.current.forEach((d, i) => { if (d) d.position.y = Math.max(0, Math.sin(t * 5 - i * 0.9)) * 0.05 })   // 점이 차례로 톡톡
  })
  return (
    <group ref={root} position={[0.2, FX_Y, 0]}>
      <mesh scale={[1, 0.72, 0.6]}>
        <sphereGeometry args={[0.24, 20, 14]} />
        <Skin thickness={1.5} />
      </mesh>
      <mesh position={[-0.15, -0.17, 0]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <Skin thickness={1.2} />
      </mesh>
      <mesh position={[-0.22, -0.25, 0]}>
        <sphereGeometry args={[0.03, 8, 6]} />
        <Skin thickness={1.1} />
      </mesh>
      {[-1, 0, 1].map((i) => (
        <group key={i} ref={(el) => { dots.current[i + 1] = el }}>
          <Ink radius={0.03} position={[i * 0.1, 0, 0.14]} />
          <Ink radius={0.03} position={[i * 0.1, 0, -0.14]} />
        </group>
      ))}
    </group>
  )
}

function Bang() {
  const root = useRef<THREE.Group>(null), rays = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, beat = (t % 1.6) / 1.6, pop = beat < 0.18 ? Math.sin((beat / 0.18) * Math.PI) : 0   // 1.6초마다 번쩍
    if (root.current) { root.current.scale.setScalar(1 + pop * 0.35); root.current.rotation.z = -0.12 + Math.sin(t * 30) * 0.05 * pop }
    if (rays.current) rays.current.scale.setScalar(0.6 + pop * 0.9)
  })
  return (
    <group position={[0, FX_Y + 0.02, 0]}>
      <group ref={root} rotation-z={-0.12}>
        <mesh position-y={0.1} scale={[1, 1, 0.8]}>
          <capsuleGeometry args={[0.055, 0.2, 6, 12]} />
          <Skin color={COLORS.butter} thickness={1.5} />
        </mesh>
        <mesh position-y={-0.12}>
          <sphereGeometry args={[0.06, 12, 10]} />
          <Skin color={COLORS.butter} thickness={1.5} />
        </mesh>
      </group>
      {/* 놀람 선 */}
      <group ref={rays}>
        {[-1, 1].map((side) => [0.5, 1.1].map((a) => (
          <mesh key={`${side}${a}`} position={[side * Math.cos(a) * 0.24, Math.sin(a) * 0.24 + 0.02, 0]} rotation-z={side * (a - Math.PI / 2)}>
            <capsuleGeometry args={[0.012, 0.07, 3, 5]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        )))}
      </group>
    </group>
  )
}

function Sparkle() {
  const spin = useRef<THREE.Group>(null), stars = useRef<(THREE.Mesh | null)[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (spin.current) { spin.current.rotation.y = t * 1.4; spin.current.position.y = FX_Y + Math.sin(t * 2.6) * 0.03 }
    stars.current.forEach((s, i) => { if (s) { const k = 0.75 + 0.35 * Math.sin(t * 4 + i * 2.1); s.scale.set(0.55 * k, 1.5 * k, 0.55 * k) } })   // 반짝반짝
  })
  return (
    <group ref={spin} position={[0, FX_Y, 0]}>
      {([[0.26, 0.04, 0, 0.11], [-0.2, -0.06, 0.14, 0.075], [-0.08, 0.12, -0.22, 0.09], [0.1, -0.08, -0.2, 0.06]] as const).map(([x, y, z, r], i) => (
        <mesh key={i} ref={(el) => { stars.current[i] = el }} position={[x, y, z]} scale={[0.55, 1.5, 0.55]}>
          <octahedronGeometry args={[r, 0]} />
          <Skin color={i % 2 ? LILAC : COLORS.butter} thickness={1.2} />
        </mesh>
      ))}
    </group>
  )
}

function Heart() {
  const root = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, b = (t % 1.1) / 1.1, beat = b < 0.3 ? Math.sin((b / 0.3) * Math.PI) : 0   // 두근
    if (root.current) { root.current.scale.setScalar(1 + beat * 0.22); root.current.position.y = FX_Y + 0.02 + Math.sin(t * 2) * 0.03; root.current.rotation.y = Math.sin(t * 1.2) * 0.5 }
  })
  return (
    <group ref={root} position={[0, FX_Y + 0.02, 0]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.075, 0.05, 0]} scale={[1, 1, 0.7]}>
          <sphereGeometry args={[0.1, 14, 12]} />
          <Skin color={COLORS.blush} thickness={1.4} />
        </mesh>
      ))}
      <mesh position-y={-0.07} rotation-x={Math.PI} scale={[1, 1, 0.5]}>
        <coneGeometry args={[0.165, 0.2, 4]} />
        <Skin color={COLORS.blush} thickness={1.4} />
      </mesh>
    </group>
  )
}

function Sweat() {
  const drop = useRef<THREE.Group>(null), small = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const fall = (g: THREE.Group | null, offset: number, top: number) => { if (!g) return; const p = ((t + offset) % 1.8) / 1.8; g.position.y = top - p * 0.3; g.scale.setScalar(p < 0.1 ? p / 0.1 : p > 0.85 ? (1 - p) / 0.15 : 1) }   // 맺혔다가 흘러내린다
    fall(drop.current, 0, 0.3); fall(small.current, 0.9, 0.22)
  })
  const Drop = ({ r }: { r: number }) => (
    <>
      <mesh>
        <sphereGeometry args={[r, 12, 10]} />
        <Skin color={SWEAT} thickness={1.2} />
      </mesh>
      <mesh position-y={r * 1.15}>
        <coneGeometry args={[r * 0.78, r * 1.5, 10]} />
        <Skin color={SWEAT} thickness={1.2} />
      </mesh>
    </>
  )
  return (
    <group>
      <group ref={drop} position={[0.33, 0.3, 0.12]}><Drop r={0.055} /></group>
      <group ref={small} position={[0.39, 0.22, -0.02]}><Drop r={0.035} /></group>
    </group>
  )
}

function Bulb() {
  const root = useRef<THREE.Group>(null), rays = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, b = (t % 2.2) / 2.2, on = b < 0.6 ? 1 : 0.35, pop = b < 0.12 ? Math.sin((b / 0.12) * Math.PI) : 0   // 번뜩! 켜졌다가 잠깐 꺼진다
    if (root.current) { root.current.scale.setScalar(1 + pop * 0.3); root.current.position.y = FX_Y + 0.02 + Math.sin(t * 2) * 0.02 }
    if (rays.current) { rays.current.scale.setScalar(0.7 + on * 0.4 + pop * 0.5); rays.current.visible = on === 1 }
  })
  return (
    <group ref={root} position={[0, FX_Y + 0.02, 0]}>
      <mesh position-y={0.05}>
        <sphereGeometry args={[0.12, 16, 12]} />
        <Skin color={COLORS.butter} thickness={1.5} />
      </mesh>
      <mesh position-y={-0.08}>
        <cylinderGeometry args={[0.06, 0.05, 0.08, 12]} />
        <Skin color="#C9CDD4" thickness={1.2} />
      </mesh>
      <group ref={rays} position-y={0.05}>
        {[-1.1, -0.55, 0, 0.55, 1.1].map((a) => (
          <mesh key={a} position={[Math.sin(a) * 0.23, Math.cos(a) * 0.23, 0]} rotation-z={-a}>
            <capsuleGeometry args={[0.012, 0.06, 3, 5]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** 먹선으로 쓴 Z 한 글자 */
function ZLetter({ size }: { size: number }) {
  const r = size * 0.14
  return (
    <>
      {[1, -1].map((k) => (
        <mesh key={k} position-y={k * size * 0.5} rotation-z={Math.PI / 2}>
          <capsuleGeometry args={[r, size, 3, 6]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      ))}
      <mesh rotation-z={-Math.PI / 4}>
        <capsuleGeometry args={[r, size * 1.25, 3, 6]} />
        <meshBasicMaterial color={INK} />
      </mesh>
    </>
  )
}
function Zzz() {
  const zs = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    zs.current.forEach((g, i) => { if (!g) return; const p = ((t * 0.45 + i / 3) % 1); g.position.set(0.16 + p * 0.3 + Math.sin(p * 6) * 0.03, FX_Y - 0.1 + p * 0.5, 0); g.scale.setScalar((0.5 + p * 0.7) * (p > 0.85 ? (1 - p) / 0.15 : Math.min(1, p / 0.1))); g.rotation.z = Math.sin(t * 2 + i) * 0.15 })   // 작게 생겨 커지며 떠오르다 사라진다
  })
  return <group>{[0, 1, 2].map((i) => <group key={i} ref={(el) => { zs.current[i] = el }}><ZLetter size={0.15} /></group>)}</group>
}

function Question() {
  const root = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { const t = clock.elapsedTime; if (root.current) { root.current.rotation.z = Math.sin(t * 2.4) * 0.22; root.current.rotation.y = Math.sin(t * 1.1) * 0.5; root.current.position.y = FX_Y + 0.04 + Math.sin(t * 2) * 0.02 } })   // 갸우뚱갸우뚱
  return (
    <group ref={root} position={[0, FX_Y + 0.04, 0]}>
      <mesh position-y={0.1} rotation-z={-Math.PI / 2}>
        <torusGeometry args={[0.09, 0.04, 10, 20, Math.PI * 1.5]} />
        <Skin color={LILAC} thickness={1.4} />
      </mesh>
      <mesh position-y={-0.03}>
        <capsuleGeometry args={[0.04, 0.05, 4, 10]} />
        <Skin color={LILAC} thickness={1.4} />
      </mesh>
      <mesh position-y={-0.17}>
        <sphereGeometry args={[0.05, 12, 10]} />
        <Skin color={LILAC} thickness={1.4} />
      </mesh>
    </group>
  )
}

function Notes() {
  const notes = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => { const t = clock.elapsedTime; notes.current.forEach((g, i) => { if (g) { g.position.y = FX_Y + Math.abs(Math.sin(t * 3 + i * 1.6)) * 0.09; g.rotation.z = Math.sin(t * 3 + i * 1.6) * 0.25 } }) })   // 박자에 맞춰 통통
  const Note = ({ color }: { color: string }) => (
    <>
      <mesh rotation-z={0.5} scale={[1.25, 0.9, 0.8]}>
        <sphereGeometry args={[0.06, 12, 10]} />
        <Skin color={color} thickness={1.3} />
      </mesh>
      <mesh position={[0.06, 0.13, 0]}>
        <capsuleGeometry args={[0.014, 0.22, 3, 6]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <mesh position={[0.1, 0.21, 0]} rotation-z={-0.9}>
        <capsuleGeometry args={[0.018, 0.08, 3, 6]} />
        <meshBasicMaterial color={INK} />
      </mesh>
    </>
  )
  return (
    <group>
      <group ref={(el) => { notes.current[0] = el }} position={[-0.14, FX_Y, 0]}><Note color={LILAC} /></group>
      <group ref={(el) => { notes.current[1] = el }} position={[0.16, FX_Y, 0.04]} scale={0.8}><Note color={COLORS.blush} /></group>
    </group>
  )
}

/** 머리 위(옆)에서 움직이는 만화 효과. 머리 그룹(원점 = 머리 중심, 반지름 0.34) 안에 넣는다 */
export function GearFx({ sku }: { sku?: string }) {
  if (sku === 'fx_bubble') return <Bubble />
  if (sku === 'fx_bang') return <Bang />
  if (sku === 'fx_sparkle') return <Sparkle />
  if (sku === 'fx_heart') return <Heart />
  if (sku === 'fx_sweat') return <Sweat />
  if (sku === 'fx_bulb') return <Bulb />
  if (sku === 'fx_zzz') return <Zzz />
  if (sku === 'fx_question') return <Question />
  if (sku === 'fx_note') return <Notes />
  return null
}

function GradCap() {
  const tassel = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (tassel.current) { tassel.current.rotation.x = Math.sin(clock.elapsedTime * 2.4) * 0.22; tassel.current.rotation.z = Math.sin(clock.elapsedTime * 1.7) * 0.12 } })   // 술이 달랑달랑
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
      <mesh position={[0.16, 0.115, 0.16]} rotation={[0, -Math.PI / 4, Math.PI / 2]}>
        <capsuleGeometry args={[0.01, 0.44, 3, 6]} />
        <meshBasicMaterial color={COLORS.butter} />
      </mesh>
      <group ref={tassel} position={[0.32, 0.1, 0.32]}>
        <mesh position-y={-0.07}>
          <capsuleGeometry args={[0.008, 0.12, 3, 5]} />
          <meshBasicMaterial color={COLORS.butter} />
        </mesh>
        <mesh position-y={-0.17}>
          <capsuleGeometry args={[0.024, 0.07, 4, 8]} />
          <Skin color={COLORS.butter} thickness={1} />
        </mesh>
      </group>
    </group>
  )
}

const drawPass: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#E5484D'; ctx.beginPath(); ctx.arc(w * 0.13, h / 2, h * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(w * 0.87, h / 2, h * 0.26, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#111118'; ctx.font = `${h * 0.74}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('합격', w / 2, h * 0.54)
}

/** 합격 머리띠: 이마에 두른 빨간 띠(앞에 흰 '합격' 판)와 뒤로 날리는 매듭 */
function Headband() {
  const label = useCanvasTexture(drawPass, 256, 80)
  const tails = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (tails.current) tails.current.rotation.x = 0.5 + Math.sin(clock.elapsedTime * 3) * 0.18 })
  return (
    <group position-y={0.13} rotation-x={-0.12}>
      <mesh rotation-x={Math.PI / 2} scale={[1, 1, 2.2]}>
        <torusGeometry args={[0.325, 0.03, 8, 28]} />
        <Skin color="#E5484D" thickness={1.2} />
      </mesh>
      <mesh position={[0, 0, 0.352]}>
        <planeGeometry args={[0.3, 0.094]} />
        <meshBasicMaterial map={label} toneMapped={false} />
      </mesh>
      <group ref={tails} position={[0, 0, -0.35]} rotation-x={0.5}>
        {[-1, 1].map((side) => (
          <RoundedBox key={side} args={[0.06, 0.22, 0.02]} radius={0.008} position={[side * 0.05, -0.12, 0]} rotation-z={side * 0.3}>
            <Skin color="#E5484D" thickness={1.1} />
          </RoundedBox>
        ))}
        <mesh>
          <sphereGeometry args={[0.04, 10, 8]} />
          <Skin color="#E5484D" thickness={1.1} />
        </mesh>
      </group>
    </group>
  )
}

/** 베레모: 만화가처럼 비스듬히 눌러쓴다 */
function Beret() {
  return (
    <group position={[0.04, 0.29, 0]} rotation={[0.05, 0, -0.2]}>
      <mesh scale={[1.15, 0.36, 1.1]} castShadow>
        <sphereGeometry args={[0.3, 22, 14]} />
        <Skin color={COLORS.primary} thickness={1.4} />
      </mesh>
      <mesh position-y={-0.07} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.25, 0.03, 8, 24]} />
        <Skin color={COLORS.ink} thickness={1.1} />
      </mesh>
      <mesh position-y={0.125}>
        <capsuleGeometry args={[0.014, 0.05, 3, 6]} />
        <meshBasicMaterial color={INK} />
      </mesh>
    </group>
  )
}

/** 왕관(레어): 금빛 테에 뾰족한 다섯 봉우리, 보석이 반짝인다 */
function Crown() {
  const gems = useRef<(THREE.Mesh | null)[]>([])
  useFrame(({ clock }) => { gems.current.forEach((g, i) => { if (g) g.scale.setScalar(0.85 + 0.3 * Math.max(0, Math.sin(clock.elapsedTime * 3 + i * 1.3))) }) })
  const R = 0.2, GOLD = '#FFD43B'
  return (
    <group position-y={0.34} rotation-z={-0.08}>
      <mesh castShadow>
        <cylinderGeometry args={[R, R * 0.92, 0.1, 20, 1, true]} />
        <Skin color={GOLD} thickness={1.4} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2; return (
        <group key={i} position={[Math.sin(a) * R, 0.05, Math.cos(a) * R]}>
          <mesh position-y={0.07} castShadow>
            <coneGeometry args={[0.06, 0.15, 4]} />
            <Skin color={GOLD} thickness={1.3} />
          </mesh>
          <mesh position-y={0.16}>
            <sphereGeometry args={[0.028, 8, 6]} />
            <Skin color={GOLD} thickness={1} />
          </mesh>
          <mesh ref={(el) => { gems.current[i] = el }} position={[Math.sin(a) * 0.012, -0.05, Math.cos(a) * 0.012]}>
            <octahedronGeometry args={[0.03, 0]} />
            <meshBasicMaterial color={i % 2 ? LILAC : '#E5484D'} />
          </mesh>
        </group>
      ) })}
    </group>
  )
}

/** 머리에 쓰는 것. 머리 그룹 안에 넣는다 */
export function GearHead({ sku }: { sku?: string }) {
  if (sku === 'head_gradcap') return <GradCap />
  if (sku === 'head_headband') return <Headband />
  if (sku === 'head_beret') return <Beret />
  if (sku === 'head_crown') return <Crown />
  return null
}

const drawIdCard: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = COLORS.primary; ctx.fillRect(0, 0, w, h * 0.24)
  ctx.fillStyle = '#ffffff'; ctx.font = `${h * 0.13}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('HARUDLE', w / 2, h * 0.125)
  // 낙서 얼굴 사진
  ctx.strokeStyle = '#111118'; ctx.lineWidth = w * 0.035; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.arc(w / 2, h * 0.5, w * 0.17, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#111118'; ctx.beginPath(); ctx.arc(w * 0.44, h * 0.48, w * 0.022, 0, Math.PI * 2); ctx.arc(w * 0.56, h * 0.48, w * 0.022, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(w / 2, h * 0.52, w * 0.07, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke()
  ctx.font = `${h * 0.12}px Jua, sans-serif`; ctx.fillText('크루', w / 2, h * 0.8)
  ctx.fillStyle = '#B9A6EC'; ctx.fillRect(w * 0.28, h * 0.89, w * 0.44, h * 0.03)
}

/** 사원증 목걸이: 걸을 때처럼 살랑살랑 흔들린다. 몸 좌표(발이 원점)에 넣는다 */
function IdCard() {
  const face = useCanvasTexture(drawIdCard, 192, 256)
  const swing = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (swing.current) { swing.current.rotation.z = Math.sin(clock.elapsedTime * 2.2) * 0.1; swing.current.rotation.x = -0.12 + Math.sin(clock.elapsedTime * 1.6) * 0.05 } })
  return (
    <group>
      <mesh position-y={0.97} rotation-x={Math.PI / 2 - 0.35} scale={[1, 1.25, 1]}>
        <torusGeometry args={[0.15, 0.014, 6, 20]} />
        <meshBasicMaterial color={COLORS.primary} />
      </mesh>
      <group ref={swing} position={[0, 0.86, 0.2]} rotation-x={-0.12}>
        <group position={[0, -0.14, 0.04]}>
          <RoundedBox args={[0.19, 0.25, 0.022]} radius={0.01} castShadow>
            <Skin thickness={1.3} />
          </RoundedBox>
          <mesh position-z={0.0125}>
            <planeGeometry args={[0.176, 0.236]} />
            <meshBasicMaterial map={face} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** 목도리: 라벤더 줄무늬, 끝자락이 살랑인다 */
function Scarf() {
  const tail = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (tail.current) { tail.current.rotation.z = Math.sin(clock.elapsedTime * 2.2) * 0.12; tail.current.rotation.x = -0.1 + Math.sin(clock.elapsedTime * 1.5) * 0.06 } })
  return (
    <group>
      <mesh position-y={0.98} rotation-x={Math.PI / 2} scale={[1, 1, 1.5]}>
        <torusGeometry args={[0.17, 0.05, 8, 22]} />
        <Skin color={LILAC} thickness={1.3} />
      </mesh>
      <group ref={tail} position={[0.1, 0.96, 0.17]}>
        <RoundedBox args={[0.1, 0.26, 0.035]} radius={0.014} position-y={-0.13} castShadow>
          <Skin color={LILAC} thickness={1.2} />
        </RoundedBox>
        {[-0.08, -0.16].map((y) => (
          <mesh key={y} position={[0, y, 0.019]}>
            <planeGeometry args={[0.1, 0.03]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
        ))}
        {[-0.03, 0, 0.03].map((x) => (
          <mesh key={x} position={[x, -0.275, 0]}>
            <capsuleGeometry args={[0.007, 0.03, 3, 4]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** 카메라: 오늘의 한 컷을 찍으려고 목에 걸었다. 가끔 플래시가 터진다 */
function Camera() {
  const flash = useRef<THREE.Mesh>(null), swing = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, b = (t % 4.5) / 4.5
    if (flash.current) flash.current.scale.setScalar(b < 0.05 ? 1 + Math.sin((b / 0.05) * Math.PI) * 5 : 1)
    if (swing.current) swing.current.rotation.z = Math.sin(t * 2) * 0.07
  })
  return (
    <group>
      <mesh position-y={0.97} rotation-x={Math.PI / 2 - 0.35} scale={[1, 1.25, 1]}>
        <torusGeometry args={[0.15, 0.014, 6, 20]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <group ref={swing} position={[0, 0.86, 0.2]}>
        <group position={[0, -0.12, 0.05]}>
          <RoundedBox args={[0.24, 0.15, 0.09]} radius={0.02} castShadow>
            <Skin color={COLORS.ink} thickness={1.3} />
          </RoundedBox>
          <mesh position={[0, -0.005, 0.06]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.055, 0.06, 0.06, 16]} />
            <Skin color="#C9CDD4" thickness={1.2} />
          </mesh>
          <mesh position={[0, -0.005, 0.092]}>
            <circleGeometry args={[0.038, 16]} />
            <meshBasicMaterial color="#8FD3FF" />
          </mesh>
          <mesh position={[-0.07, 0.09, 0]}>
            <boxGeometry args={[0.06, 0.03, 0.05]} />
            <meshBasicMaterial color={COLORS.butter} />
          </mesh>
          <mesh ref={flash} position={[0.08, 0.045, 0.047]}>
            <sphereGeometry args={[0.014, 8, 6]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** 목에 거는 것. 몸 좌표에 넣는다 */
export function GearNeck({ sku }: { sku?: string }) {
  if (sku === 'neck_idcard') return <IdCard />
  if (sku === 'neck_scarf') return <Scarf />
  if (sku === 'neck_camera') return <Camera />
  return null
}

// 네컷 원고: 칸마다 낙서 사람이 조금씩 다른 표정으로
const drawManuscript: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.paper; ctx.fillRect(0, 0, w, h)
  const m = w * 0.07, gw = (w - m * 3) / 2, gh = (h - m * 3) / 2
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (let i = 0; i < 4; i++) {
    const x = m + (i % 2) * (gw + m), y = m + Math.floor(i / 2) * (gh + m), cx = x + gw / 2, cy = y + gh * 0.42, r = gw * 0.2
    ctx.fillStyle = i === 1 || i === 2 ? '#EDE7FF' : '#ffffff'; ctx.fillRect(x, y, gw, gh)
    ctx.strokeStyle = '#111118'; ctx.lineWidth = w * 0.022; ctx.strokeRect(x, y, gw, gh)
    ctx.lineWidth = w * 0.018
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()                                  // 머리
    ctx.beginPath(); ctx.moveTo(cx, cy + r); ctx.lineTo(cx, y + gh * 0.86); ctx.stroke()                // 몸
    ctx.beginPath(); ctx.moveTo(cx - r, cy + r * 1.7); ctx.lineTo(cx + r, cy + r * (i === 3 ? 0.9 : 1.7)); ctx.stroke()   // 팔(마지막 칸은 번쩍)
    ctx.fillStyle = '#111118'
    ctx.beginPath(); ctx.arc(cx - r * 0.38, cy - r * 0.1, w * 0.012, 0, Math.PI * 2); ctx.arc(cx + r * 0.38, cy - r * 0.1, w * 0.012, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath()
    if (i === 3) ctx.arc(cx, cy + r * 0.2, r * 0.38, 0.1 * Math.PI, 0.9 * Math.PI)        // 웃음
    else if (i === 2) ctx.arc(cx, cy + r * 0.62, r * 0.3, 1.15 * Math.PI, 1.85 * Math.PI)  // 시무룩
    else { ctx.moveTo(cx - r * 0.3, cy + r * 0.42); ctx.lineTo(cx + r * 0.3, cy + r * 0.42) }
    ctx.stroke()
    if (i === 1) { ctx.font = `${gw * 0.3}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('?', cx + r * 1.5, cy - r * 0.6) }
    if (i === 3) { ctx.font = `${gw * 0.3}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('!', cx + r * 1.5, cy - r * 0.6) }
  }
}

function Manuscript() {
  const page = useCanvasTexture(drawManuscript, 256, 330)
  return (
    <group position={[0.46, 0.74, 0.12]} rotation={[0.12, -0.35, -0.12]}>
      <RoundedBox args={[0.34, 0.44, 0.02]} radius={0.01} castShadow>
        <Skin color={COLORS.paper} thickness={1.4} />
      </RoundedBox>
      {[1, -1].map((side) => (
        <mesh key={side} position-z={side * 0.0115} rotation-y={side === 1 ? 0 : Math.PI}>
          <planeGeometry args={[0.325, 0.42]} />
          <meshBasicMaterial map={page} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/** 아아 한 잔: 투명 컵 속 커피와 얼음, 라벤더 빨대 */
function IcedCoffee() {
  return (
    <group position={[0.44, 0.7, 0.14]} rotation-z={-0.08}>
      <mesh castShadow>
        <cylinderGeometry args={[0.085, 0.065, 0.22, 16]} />
        <Skin color="#7A5236" thickness={1.3} />
      </mesh>
      {/* 얼음 */}
      {([[-0.03, 0.09, 0.02], [0.035, 0.1, -0.02]] as const).map((p, i) => (
        <mesh key={i} position={p} rotation={[0.4, i, 0.3]}>
          <boxGeometry args={[0.05, 0.05, 0.05]} />
          <meshBasicMaterial color="#EAF6FF" />
        </mesh>
      ))}
      <mesh position-y={0.125}>
        <cylinderGeometry args={[0.092, 0.092, 0.03, 16]} />
        <Skin thickness={1.2} />
      </mesh>
      <mesh position={[0.02, 0.22, 0]} rotation-z={-0.15}>
        <capsuleGeometry args={[0.012, 0.2, 3, 6]} />
        <meshBasicMaterial color={LILAC} />
      </mesh>
      {/* 컵 홀더 */}
      <mesh position-y={-0.01}>
        <cylinderGeometry args={[0.084, 0.074, 0.08, 16]} />
        <meshBasicMaterial color={COLORS.paper} />
      </mesh>
    </group>
  )
}

/** 만화 펜: 펜촉 끝에 잉크 방울이 맺혔다 떨어진다 */
function Pen() {
  const drop = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => { const p = (clock.elapsedTime % 2.4) / 2.4; if (drop.current) { drop.current.position.y = -0.27 - (p > 0.7 ? (p - 0.7) * 0.6 : 0); drop.current.scale.setScalar(p < 0.7 ? p / 0.7 : Math.max(0, 1 - (p - 0.7) / 0.3)) } })
  return (
    <group position={[0.44, 0.78, 0.14]} rotation={[0.1, 0, -0.35]}>
      <mesh castShadow>
        <capsuleGeometry args={[0.028, 0.34, 4, 10]} />
        <Skin color={COLORS.primary} thickness={1.3} />
      </mesh>
      <mesh position-y={0.1}>
        <cylinderGeometry args={[0.031, 0.031, 0.04, 10]} />
        <meshBasicMaterial color={COLORS.butter} />
      </mesh>
      <mesh position-y={-0.22} rotation-x={Math.PI}>
        <coneGeometry args={[0.028, 0.1, 8]} />
        <Skin color="#C9CDD4" thickness={1.1} />
      </mesh>
      <mesh ref={drop} position-y={-0.27}>
        <sphereGeometry args={[0.02, 8, 6]} />
        <meshBasicMaterial color={INK} />
      </mesh>
    </group>
  )
}

const drawSticker: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = '#D9CEFC'; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#111118'; ctx.lineWidth = w * 0.02; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.arc(w * 0.5, h * 0.46, w * 0.17, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#111118'; ctx.beginPath(); ctx.arc(w * 0.44, h * 0.44, w * 0.02, 0, Math.PI * 2); ctx.arc(w * 0.56, h * 0.44, w * 0.02, 0, Math.PI * 2); ctx.fill()
  ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.48, w * 0.07, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke()
  ctx.font = `${h * 0.12}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('HARUDLE', w * 0.5, h * 0.86)
}

/** 노트북: 하루들 스티커를 붙인 라벤더 노트북을 옆구리에 낀다 */
function Laptop() {
  const lid = useCanvasTexture(drawSticker, 256, 192)
  return (
    <group position={[0.45, 0.72, 0.1]} rotation={[0.08, -0.5, -0.1]}>
      <RoundedBox args={[0.44, 0.32, 0.035]} radius={0.014} castShadow>
        <Skin color="#C9CDD4" thickness={1.4} />
      </RoundedBox>
      <mesh position-z={0.019}>
        <planeGeometry args={[0.42, 0.3]} />
        <meshBasicMaterial map={lid} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** 붕어빵: 종이 봉투에서 고개를 내민 따끈한 붕어빵. 김이 모락모락 */
function Bungeoppang() {
  const steam = useRef<(THREE.Mesh | null)[]>([])
  useFrame(({ clock }) => { steam.current.forEach((m, i) => { if (!m) return; const p = ((clock.elapsedTime * 0.5 + i * 0.5) % 1); m.position.set((i ? 0.04 : -0.03) + Math.sin(p * 7 + i) * 0.02, 0.3 + p * 0.16, 0); m.scale.setScalar(Math.sin(p * Math.PI) * 1.2) }) })
  const BREAD = '#E0A458'
  return (
    <group position={[0.44, 0.7, 0.14]} rotation-z={-0.1}>
      {/* 종이 봉투 */}
      <mesh position-y={-0.03} castShadow>
        <cylinderGeometry args={[0.095, 0.06, 0.2, 6]} />
        <Skin color={COLORS.paper} thickness={1.3} />
      </mesh>
      {/* 붕어빵: 머리를 위로 */}
      <group position-y={0.13} rotation-z={0.15}>
        <mesh scale={[0.8, 1.2, 0.45]} castShadow>
          <sphereGeometry args={[0.1, 14, 12]} />
          <Skin color={BREAD} thickness={1.3} />
        </mesh>
        <Ink radius={0.014} position={[-0.03, 0.06, 0.04]} />
        {[0, -0.045].map((y) => (
          <mesh key={y} position={[0.01, y, 0.046]} rotation-z={Math.PI / 2}>
            <torusGeometry args={[0.03, 0.006, 4, 10, Math.PI]} />
            <meshBasicMaterial color="#9A6A45" />
          </mesh>
        ))}
      </group>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(el) => { steam.current[i] = el }}>
          <sphereGeometry args={[0.022, 8, 6]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  )
}

// 내 네컷 액자의 빈 그림: 아직 하루들에 올린 네컷만화가 없을 때
const drawEmptyFrame: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.paper; ctx.fillRect(0, 0, w, h)
  const m = w * 0.06, g = (w - m * 3) / 2
  ctx.strokeStyle = '#111118'; ctx.lineWidth = w * 0.016; ctx.setLineDash([w * 0.04, w * 0.03])
  for (let i = 0; i < 4; i++) ctx.strokeRect(m + (i % 2) * (g + m), m + Math.floor(i / 2) * (g + m), g, g)
  ctx.setLineDash([]); ctx.fillStyle = '#8B6FE8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `${w * 0.1}px Jua, sans-serif`; ctx.fillText('오늘의 네컷을', w / 2, h * 0.44); ctx.fillText('올려 보세요', w / 2, h * 0.57)
}

/** 걸 그림을 받아 온다(캠퍼스 서버가 하루들 공개 피드의 그림을 대신 받아 준다). 못 받으면 null */
function useFrameTexture(feedId?: string) {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!feedId) { setTex(null); return }
    let live = true, loaded: THREE.Texture | null = null
    new THREE.TextureLoader().load(`/api/frame/${encodeURIComponent(feedId)}`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; loaded = t
      if (live) setTex(t); else t.dispose()
    }, undefined, () => { if (live) setTex(null) })
    return () => { live = false; loaded?.dispose() }
  }, [feedId])
  return tex
}

/** 내 네컷 액자: 하루들에 올린 내 네컷만화를 액자에 넣어 들고 다닌다. frame = 하루들 피드 ID(서버가 붙여 준다) */
function MyFrame({ frame }: { frame?: string }) {
  const empty = useCanvasTexture(drawEmptyFrame, 256, 256), art = useFrameTexture(frame)
  const root = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (root.current) root.current.rotation.z = -0.08 + Math.sin(clock.elapsedTime * 1.6) * 0.03 })
  return (
    <group ref={root} position={[0.52, 0.8, 0.12]} rotation={[0.08, -0.3, -0.08]}>
      <RoundedBox args={[0.56, 0.56, 0.04]} radius={0.02} castShadow>
        <Skin color={COLORS.primary} thickness={1.5} />
      </RoundedBox>
      {[1, -1].map((side) => (
        <group key={side} position-z={side * 0.0215} rotation-y={side === 1 ? 0 : Math.PI}>
          <mesh>
            <planeGeometry args={[0.5, 0.5]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
          <mesh position-z={0.001}>
            <planeGeometry args={[0.47, 0.47]} />
            <meshBasicMaterial map={art ?? empty} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* 위쪽 리본 */}
      <mesh position={[0, 0.3, 0]} scale={[1.4, 0.7, 0.6]}>
        <sphereGeometry args={[0.04, 10, 8]} />
        <Skin color={COLORS.butter} thickness={1.1} />
      </mesh>
    </group>
  )
}

/** 손에 드는 것: 연필 · 풍선처럼 오른손 옆에 든다. 몸 좌표에 넣는다 */
export function GearHeld({ sku, frame }: { sku?: string; frame?: string }) {
  if (sku === 'held_manuscript') return <Manuscript />
  if (sku === 'held_coffee') return <IcedCoffee />
  if (sku === 'held_pen') return <Pen />
  if (sku === 'held_laptop') return <Laptop />
  if (sku === 'held_bungeoppang') return <Bungeoppang />
  if (sku === FRAME_SKU) return <MyFrame frame={frame} />
  return null
}
