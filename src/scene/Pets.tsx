// 컷 상점의 펫: 고양이 · 판다 · 여우 · 얼룩말 · 에뮤 (하루들 닉네임에 나오는 동물들) + 레어 대형 펫 호랑이 · 불곰
// 두들(강아지)과 같은 낙서 문법으로 그린다: 흰 몸 + 먹선 다리 + 라벤더 포인트. 발이 원점이고 +z를 바라본다.
// 주인이 멈춰 서 있으면 잠시 뒤 엎드려 쉬면서 주인을 올려다보고, 걸으면 꼬리를 더 빨리 흔든다.
// 이 파일은 캠퍼스 것이다(src/harudle는 하루들 월드 복사본이라 다시 복사하면 덮어써진다).
import { useRef, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS } from '../harudle/brand'
import { Face, Ink, INK, LILAC, Line, LINE_RADIUS, Skin, useLegSwing, type WalkMotion } from '../harudle/Characters'
import { Toon } from '../harudle/toon'

export type PetKind = 'doodle' | 'cat' | 'panda' | 'fox' | 'zebra' | 'emu' | 'tiger' | 'bear'
const SKU_PET: Record<string, PetKind> = { pet_cat: 'cat', pet_panda: 'panda', pet_fox: 'fox', pet_zebra: 'zebra', pet_emu: 'emu', pet_tiger: 'tiger', pet_bear: 'bear' }
/** 상점 sku → 그릴 펫. 모르는 값이면 null */
export const petOfSku = (sku: unknown): PetKind | null => (typeof sku === 'string' && SKU_PET[sku]) || null

/** 주인이 시킨 것(엔진 dog.act → doll.anim.petAct): sit 앉기 · pet 쓰다듬기를 받는 중. t는 시작한 뒤 흐른 시간(초) */
export type PetAct = { kind: 'sit' | 'pet' | null; t: number }
type PetProps = { motion?: RefObject<WalkMotion>; act?: RefObject<PetAct> }
const FOX = '#FFB37A'
const REST_AFTER = 2.6   // 이만큼(초) 멈춰 있으면 엎드린다
const CROUCH = 0.62      // 엎드릴 때 다리가 접히는 정도

// 다리 자리(컴포넌트 안 좌표, 레어 펫은 BIG 배율 전): legY 어깨 · 엉덩이 높이(= 다리 길이) · front/back 앞뒤 다리 z
const GEO: Record<PetKind, { legY: number; front: number; back: number }> = {
  doodle: { legY: 0.36, front: 0.26, back: -0.28 }, cat: { legY: 0.3, front: 0.2, back: -0.22 }, panda: { legY: 0.3, front: 0.2, back: -0.2 },
  fox: { legY: 0.32, front: 0.22, back: -0.24 }, zebra: { legY: 0.4, front: 0.24, back: -0.26 }, emu: { legY: 0.5, front: 0, back: 0 },
  tiger: { legY: 0.36, front: 0.22, back: -0.26 }, bear: { legY: 0.34, front: 0.22, back: -0.24 },
}
// 앉는 자세(펫마다 다르게): tilt 몸을 뒤로 세우는 각(엉덩이를 축으로) · hip 앉았을 때 엉덩이 높이
// front: stand면 앞다리를 곧게 세워 바닥을 짚고(길이는 맞춰 늘린다), 아니면 ang(세계 기준, 0 = 아래 · 음수 = 앞으로 · 양수 = 뒤로 접기) · sc 길이
// back: 뒷다리 ang · sc · splay(바깥으로 벌리기) · head: 고개를 드는 정도
type SitPose = { tilt: number; hip: number; front: { stand?: boolean; ang?: number; sc?: number }; back: { ang: number; sc: number; splay: number }; head: number }
const SIT: Record<PetKind, SitPose> = {
  doodle: { tilt: 0.55, hip: 0.12, front: { stand: true }, back: { ang: -1.25, sc: 0.55, splay: 0.1 }, head: 0.2 },    // 강아지: 앞발 딱 모으고 "앉아!"
  cat: { tilt: 0.82, hip: 0.1, front: { stand: true }, back: { ang: -1.35, sc: 0.5, splay: 0.04 }, head: 0.12 },       // 고양이: 꼿꼿하게 세워 앉아 새침하게
  panda: { tilt: 1.05, hip: 0.14, front: { ang: -0.6, sc: 0.85 }, back: { ang: -1.45, sc: 0.85, splay: 0.45 }, head: 0.1 },   // 판다: 엉덩이 깔고 뒷발 쭉 벌려, 앞발은 대나무 쥐듯 들고
  fox: { tilt: 0.7, hip: 0.11, front: { stand: true }, back: { ang: -1.3, sc: 0.5, splay: 0.12 }, head: 0.3 },        // 여우: 가슴 펴고 고개를 높이
  zebra: { tilt: 0.08, hip: 0.14, front: { ang: 1.35, sc: 0.45 }, back: { ang: -1.35, sc: 0.45, splay: 0.05 }, head: 0.2 },   // 얼룩말: 말처럼 네 다리를 접고 무릎 꿇어 앉는다
  emu: { tilt: 0, hip: 0.5, front: { stand: true }, back: { ang: 0, sc: 1, splay: 0 }, head: 0 },                       // 에뮤: 다리를 접어 쪼그린다(useRest의 엎드리기)
  tiger: { tilt: 0.05, hip: 0.13, front: { ang: -1.4, sc: 1.05 }, back: { ang: -1.4, sc: 0.55, splay: 0.35 }, head: 0.15 },  // 호랑이: 스핑크스처럼 앞발 쭉 뻗고 엎드려 고개만 든다
  bear: { tilt: 1.15, hip: 0.16, front: { ang: -0.35, sc: 0.85 }, back: { ang: -1.45, sc: 0.9, splay: 0.5 }, head: 0.1 },    // 불곰: 곰인형처럼 털썩, 뒷발 벌리고 앞발은 축 늘어뜨린다
}
// 앉은 정도 s(0~1)에서 몸 기울기 θ와 내려갈 높이(엉덩이가 hip에 닿게)
function sitBody(kind: PetKind, s: number) {
  const g = GEO[kind], p = SIT[kind], th = p.tilt * s, hip = THREE.MathUtils.lerp(g.legY, p.hip, s)
  return { th, drop: g.legY * Math.cos(th) - hip, hip }
}

/** 멈춘 지 오래되면 1(엎드림), 걷기 시작하면 0. 몸을 내리고 다리를 접고 머리를 든다.
 *  주인이 앉히면(sit) 엎드리지 않고 고개를 들어 주인을 보고, 쓰다듬으면(pet) 펫마다 다르게 좋아한다(머리 · 몸. 몸 전체 움직임은 Pet이 한다) */
function useRest(motion: RefObject<WalkMotion> | undefined, legY: number, act?: RefObject<PetAct>, kind: PetKind = 'doodle') {
  const body = useRef<THREE.Group>(null), legs = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null), hips = useRef<(THREE.Group | null)[]>([])
  const state = useRef({ still: 0, rest: 0, sit: 0, pet: 0 })
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05), s = state.current, moving = (motion?.current?.amount ?? 0) > 0.08, a = act?.current
    const sitting = a?.kind === 'sit', petting = a?.kind === 'pet', pt = a?.t ?? 0
    s.still = moving ? 0 : s.still + dt
    s.sit = THREE.MathUtils.damp(s.sit, sitting ? 1 : 0, 8, dt); s.pet = THREE.MathUtils.damp(s.pet, petting ? 1 : 0, 8, dt)
    const lie = petting ? kind === 'tiger' : sitting ? kind === 'emu' : s.still > REST_AFTER   // 호랑이는 쓰다듬으면 벌러덩 눕고, 두 발 에뮤는 앉으라면 다리를 접어 쪼그린다
    s.rest = THREE.MathUtils.damp(s.rest, lie ? 1 : 0, moving ? 14 : 5, dt)
    if (legs.current) legs.current.scale.y = 1 - CROUCH * s.rest
    // 앉기: 몸은 Pet이 엉덩이를 축으로 θ만큼 세우고 내린다. 다리는 그 안에서 세계 기준 각도가 되게 θ를 되돌려 준다
    const g = GEO[kind], p = SIT[kind], { th, hip } = sitBody(kind, s.sit), sitK = s.sit
    hips.current.forEach((h, i) => {
      if (!h) return
      const fr = i < 2, side = i % 2 ? 1 : -1
      if (fr && p.front.stand) { h.rotation.x = th; h.rotation.z = 0; h.scale.y = (hip + (g.front - g.back) * Math.sin(th)) / g.legY }   // 앞다리를 곧게 세워 바닥까지
      else { const q = fr ? { ang: p.front.ang ?? 0, sc: p.front.sc ?? 1, splay: 0 } : p.back; h.rotation.x = q.ang * sitK + th; h.rotation.z = side * q.splay * sitK; h.scale.y = THREE.MathUtils.lerp(1, q.sc, sitK) }
    })
    if (body.current) {
      body.current.position.y = -legY * CROUCH * s.rest
      body.current.position.x = kind === 'cat' ? Math.sin(pt * 55) * 0.008 * s.pet : 0   // 고양이: 골골송(몸이 잘게 떨린다)
    }
    if (head.current) {
      const t = clock.elapsedTime, p = s.pet, hp = PET_HEAD[kind] ?? PET_HEAD.doodle, p_ = SIT[kind]
      head.current.rotation.x = -0.22 * s.rest + th * 0.75 - p_.head * sitK + (hp.lean + Math.sin(pt * hp.nodF) * hp.nod) * p   // 주인을 올려다본다(앉으면 세운 몸만큼 고개는 되돌린다) · 쓰다듬으면 손에 기대거나 끄덕인다
      head.current.rotation.z = Math.sin(t * 0.9) * 0.14 * s.rest + Math.sin(pt * hp.rubF) * hp.rub * p          // 고개를 갸웃 · 손에 비빈다
      head.current.rotation.y = Math.sin(t * 0.5) * 0.25 * s.rest * (1 - s.sit)
    }
  })
  return { body, legs, head, hips }
}
// 쓰다듬을 때 머리: lean 손 쪽으로 기대기(음수면 위로) · nod 끄덕임 크기/빠르기 · rub 좌우로 비비기 크기/빠르기
const PET_HEAD: Partial<Record<PetKind, { lean: number; nod: number; nodF: number; rub: number; rubF: number }>> & { doodle: { lean: number; nod: number; nodF: number; rub: number; rubF: number } } = {
  doodle: { lean: -0.15, nod: 0, nodF: 0, rub: 0.2, rubF: 6 },
  cat: { lean: -0.25, nod: 0, nodF: 0, rub: 0.38, rubF: 3.2 },     // 눈 감고 손에 볼을 비빈다
  panda: { lean: -0.1, nod: 0.12, nodF: 5, rub: 0.2, rubF: 2.5 },
  fox: { lean: -0.2, nod: 0, nodF: 0, rub: 0.3, rubF: 5 },
  zebra: { lean: 0, nod: 0.3, nodF: 6, rub: 0, rubF: 0 },          // 고개를 크게 끄덕인다
  emu: { lean: 0, nod: 0.38, nodF: 10, rub: 0, rubF: 0 },          // 긴 목으로 콕콕
  tiger: { lean: -0.3, nod: 0, nodF: 0, rub: 0.3, rubF: 2 },       // 누운 채로 머리를 부빈다
  bear: { lean: -0.4, nod: 0, nodF: 0, rub: 0.12, rubF: 3 },       // 일어서서 올려다본다
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

// hips: 다리마다 붙는 자리 [앞왼 · 앞오 · 뒤왼 · 뒤오]. 앉는 자세는 여기를 돌리고 줄이며, 걷는 흔들림은 그 안(useLegSwing)에서 그대로 돈다
function FourLegs({ motion, y, front, back, x = 0.11, length, radius, legs, hips, leg }: { motion?: RefObject<WalkMotion>; y: number; front: number; back: number; x?: number; length: number; radius?: number; legs: RefObject<THREE.Group | null>; hips?: RefObject<(THREE.Group | null)[]>; leg?: ReactNode }) {
  const f = useLegSwing(motion, 0.7), b = useLegSwing(motion, -0.7), one = leg ?? <Leg length={length} radius={radius} />
  const at = (i: number, sx: number, z: number, swing: RefObject<THREE.Group | null>) => (
    <group ref={(g) => { if (hips?.current) hips.current[i] = g }} position={[sx, y, z]}><group ref={swing}>{one}</group></group>
  )
  return <group ref={legs}>{at(0, -x, front, f.left)}{at(1, x, front, f.right)}{at(2, -x, back, b.left)}{at(3, x, back, b.right)}</group>
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

/** 두들(강아지): 하루들 월드 Doodle과 같은 모양을 캠퍼스 다리 구조로 옮겼다(앉기 · 쓰다듬기 · 엎드리기를 다리째 하려고). 꼬리는 늘 살랑, 쓰다듬으면 붕붕 */
export function DoodleDog({ motion, act }: PetProps) {
  const rest = useRest(motion, 0.36, act, 'doodle'), tail = useRef<THREE.Group>(null), wag = useRef(0)
  useFrame((_, delta) => { wag.current += Math.min(delta, 0.05) * (act?.current?.kind === 'pet' ? 22 : 11); if (tail.current) tail.current.rotation.z = Math.sin(wag.current) * (act?.current?.kind === 'pet' ? 0.6 : 0.35) })
  return (
    <group>
      <FourLegs motion={motion} y={0.36} front={0.26} back={-0.28} x={0.12} length={0.36} legs={rest.legs} hips={rest.hips} />
      <group ref={rest.body}>
        <mesh position-y={0.48} rotation-x={Math.PI / 2} castShadow>
          <capsuleGeometry args={[0.2, 0.52, 6, 14]} />
          <Skin />
        </mesh>
        <group ref={tail} position={[0, 0.58, -0.5]}>
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
        <group ref={rest.head} position={[0, 0.8, 0.56]}>
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
    </group>
  )
}

/** 고양이: 뾰족한 귀(속은 분홍), 위로 세운 긴 꼬리, 등 줄무늬, 분홍 목줄 */
export function Cat({ motion, act }: PetProps) {
  const rest = useRest(motion, 0.3, act, 'cat')
  return (
    <group>
      <FourLegs motion={motion} y={0.3} front={0.2} back={-0.22} length={0.3} legs={rest.legs} hips={rest.hips} />
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
export function Panda({ motion, act }: PetProps) {
  const rest = useRest(motion, 0.3, act, 'panda')
  return (
    <group>
      <FourLegs motion={motion} y={0.3} front={0.2} back={-0.2} x={0.15} length={0.28} radius={0.058} legs={rest.legs} hips={rest.hips} />
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
export function Fox({ motion, act }: PetProps) {
  const rest = useRest(motion, 0.32, act, 'fox')
  return (
    <group>
      <FourLegs motion={motion} y={0.32} front={0.22} back={-0.24} length={0.32} legs={rest.legs} hips={rest.hips} />
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
export function Zebra({ motion, act }: PetProps) {
  const rest = useRest(motion, 0.4, act, 'zebra')
  return (
    <group>
      <FourLegs motion={motion} y={0.4} front={0.24} back={-0.26} x={0.12} length={0.4} radius={0.04} legs={rest.legs} hips={rest.hips} />
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
export function Emu({ motion, act }: PetProps) {
  const rest = useRest(motion, 0.5, act, 'emu')
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
export function Tiger({ motion, act }: PetProps) {
  const rest = useRest(motion, 0.36, act, 'tiger')
  return (
    <group scale={BIG}>
      <FourLegs motion={motion} y={0.36} front={0.22} back={-0.26} x={0.15} length={0.36} legs={rest.legs} hips={rest.hips} leg={<ThickLeg length={0.36} radius={0.07} color={TIGER} paw="#FFFFFF" />} />
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
export function Bear({ motion, act }: PetProps) {
  const rest = useRest(motion, 0.34, act, 'bear')
  return (
    <group scale={BIG}>
      <FourLegs motion={motion} y={0.34} front={0.22} back={-0.24} x={0.18} length={0.34} legs={rest.legs} hips={rest.hips} leg={<ThickLeg length={0.34} radius={0.09} color={BEAR} paw={BEAR} />} />
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

// 쓰다듬을 때 몸 전체 반응(펫마다): hop 통통 · roll 좌우로 뒹굴 · yaw 몸 흔들기 · rear 뒷발로 일어서기(엉덩이를 축으로). 앉기는 위 SIT 표
type BodyReact = { hop: number; hopF: number; roll: number; rollF: number; yaw: number; yawF: number; rear: number }
const BODY: Record<PetKind, BodyReact> = {
  doodle: { hop: 0.08, hopF: 9, roll: 0.1, rollF: 14, yaw: 0, yawF: 0, rear: 0 },        // 강아지: 꼬리 치며 통통
  cat: { hop: 0, hopF: 0, roll: 0, rollF: 0, yaw: 0, yawF: 0, rear: 0 },                 // 고양이: 가만히 골골(머리 · 몸에서)
  panda: { hop: 0, hopF: 0, roll: 0.32, rollF: 2.5, yaw: 0, yawF: 0, rear: 0 },           // 판다: 좌우로 데굴데굴
  fox: { hop: 0.1, hopF: 7, roll: 0, rollF: 0, yaw: 0.28, yawF: 6, rear: 0 },            // 여우: 폴짝폴짝 몸을 흔든다
  zebra: { hop: 0, hopF: 0, roll: 0, rollF: 0, yaw: 0.08, yawF: 3, rear: 0 },             // 얼룩말: 끄덕끄덕(머리에서)
  emu: { hop: 0.06, hopF: 10, roll: 0, rollF: 0, yaw: 0, yawF: 0, rear: 0 },                       // 에뮤: 앉으면 다리를 접어 쪼그리고(머리 · 다리에서), 쓰다듬으면 콩콩
  tiger: { hop: 0, hopF: 0, roll: 0.14, rollF: 2, yaw: 0, yawF: 0, rear: 0 },             // 호랑이: 벌러덩 누워 뒹굴
  bear: { hop: 0, hopF: 0, roll: 0.1, rollF: 3, yaw: 0, yawF: 0, rear: 0.85 },             // 불곰: 뒷발로 번쩍 일어선다
}

export function Pet({ kind, motion, act }: { kind: PetKind; motion?: RefObject<WalkMotion>; act?: RefObject<PetAct> }) {
  const outer = useRef<THREE.Group>(null), inner = useRef<THREE.Group>(null), st = useRef({ sit: 0, pet: 0 })
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05), a = act?.current, s = st.current, b = BODY[kind] ?? BODY.doodle, t = a?.t ?? 0
    s.sit = THREE.MathUtils.damp(s.sit, a?.kind === 'sit' ? 1 : 0, 8, dt); s.pet = THREE.MathUtils.damp(s.pet, a?.kind === 'pet' ? 1 : 0, 8, dt)
    if (!outer.current || !inner.current) return
    const scale = kind === 'tiger' || kind === 'bear' ? BIG : 1, pivot = GEO[kind].back * scale   // 엉덩이(뒷다리 자리)를 축으로. 레어 펫은 몸이 큰 만큼
    const { th, drop } = sitBody(kind, s.sit)
    outer.current.position.set(0, -drop * scale + Math.abs(Math.sin(t * b.hopF)) * b.hop * s.pet, pivot); inner.current.position.z = -pivot
    outer.current.rotation.x = -(th + b.rear * s.pet)
    outer.current.rotation.z = Math.sin(t * b.rollF) * b.roll * s.pet
    outer.current.rotation.y = Math.sin(t * b.yawF) * b.yaw * s.pet
  })
  const body = kind === 'cat' ? <Cat motion={motion} act={act} />
    : kind === 'panda' ? <Panda motion={motion} act={act} />
    : kind === 'fox' ? <Fox motion={motion} act={act} />
    : kind === 'zebra' ? <Zebra motion={motion} act={act} />
    : kind === 'emu' ? <Emu motion={motion} act={act} />
    : kind === 'tiger' ? <Tiger motion={motion} act={act} />
    : kind === 'bear' ? <Bear motion={motion} act={act} />
    : <DoodleDog motion={motion} act={act} />
  return <group ref={outer}><group ref={inner}>{body}</group></group>
}
