// 컷 상점의 펫(초레어 독수리는 날아다니고 주인 어깨에 앉는다): 고양이 · 판다 · 여우 · 얼룩말 · 에뮤 (하루들 닉네임에 나오는 동물들) · 러버덕 · 카피바라 · 펭귄 + 레어 대형 펫 호랑이 · 불곰 · 용(떠서 따라온다)
// 두들(강아지)과 같은 낙서 문법으로 그린다: 흰 몸 + 먹선 다리 + 라벤더 포인트. 발이 원점이고 +z를 바라본다.
// 주인이 멈춰 서 있으면 잠시 뒤 엎드려 쉬면서 주인을 올려다보고, 걸으면 꼬리를 더 빨리 흔든다.
// 이 파일은 캠퍼스 것이다(src/harudle는 하루들 월드 복사본이라 다시 복사하면 덮어써진다).
import { useRef, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS } from '../harudle/brand'
import { Face, Ink, INK, LILAC, Line, LINE_RADIUS, Skin, useLegSwing, type WalkMotion } from '../harudle/Characters'
import { Toon } from '../harudle/toon'

export type PetKind = 'doodle' | 'cat' | 'panda' | 'fox' | 'zebra' | 'emu' | 'tiger' | 'bear' | 'duck' | 'capybara' | 'penguin' | 'dragon' | 'eagle'
const SKU_PET: Record<string, PetKind> = { pet_cat: 'cat', pet_panda: 'panda', pet_fox: 'fox', pet_zebra: 'zebra', pet_emu: 'emu', pet_tiger: 'tiger', pet_bear: 'bear', pet_duck: 'duck', pet_capybara: 'capybara', pet_penguin: 'penguin', pet_dragon: 'dragon', pet_eagle: 'eagle' }
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
  duck: { legY: 0.12, front: 0, back: 0 }, capybara: { legY: 0.24, front: 0.2, back: -0.22 }, penguin: { legY: 0.1, front: 0, back: 0 }, dragon: { legY: 0.24, front: 0.18, back: -0.22 },
  eagle: { legY: 0.14, front: 0, back: 0 },
}
/** 걸음걸이(펫마다): walkF · runF 걸음 빠르기(위상/초) · walkAmp · runAmp 다리 흔드는 폭 · walkBob · runBob 몸이 들썩이는 높이
 *  lean 달릴 때 앞으로 숙이는 각 · roll 걸을 때 좌우로 흔들리는 각 · style 달리는 모양
 *   bound: 앞다리끼리 · 뒷다리끼리 같이 차고 나가는 질주(허리가 접혔다 펴진다) · lumber: 무겁게 좌우로 흔들며 뛴다
 *   waddle: 두 발로 뒤뚱 종종(다리는 각 펫이 그린다) · strut: 두 발로 성큼성큼 · fly: 다리를 접고 난다 */
export type GaitStyle = 'bound' | 'lumber' | 'waddle' | 'strut' | 'fly'
export type Gait = { walkF: number; runF: number; walkAmp: number; runAmp: number; walkBob: number; runBob: number; lean: number; roll: number; style: GaitStyle }
export const GAIT: Record<PetKind, Gait> = {
  doodle: { walkF: 10, runF: 17, walkAmp: 0.6, runAmp: 1.05, walkBob: 0.03, runBob: 0.08, lean: 0.12, roll: 0, style: 'bound' },     // 강아지: 신나서 깡총깡총
  cat: { walkF: 8, runF: 16, walkAmp: 0.45, runAmp: 1.1, walkBob: 0.012, runBob: 0.07, lean: 0.1, roll: 0, style: 'bound' },          // 고양이: 걸을 땐 사뿐사뿐 미끄러지듯, 뛰면 몸을 쭉쭉
  panda: { walkF: 7, runF: 11, walkAmp: 0.42, runAmp: 0.75, walkBob: 0.02, runBob: 0.05, lean: 0.06, roll: 0.08, style: 'lumber' },  // 판다: 엉덩이를 씰룩이며 뒤뚱
  fox: { walkF: 11, runF: 18, walkAmp: 0.6, runAmp: 1.15, walkBob: 0.025, runBob: 0.08, lean: 0.15, roll: 0, style: 'bound' },       // 여우: 가볍고 날렵하게
  zebra: { walkF: 9, runF: 14, walkAmp: 0.55, runAmp: 1, walkBob: 0.03, runBob: 0.09, lean: 0.1, roll: 0, style: 'bound' },          // 얼룩말: 또각또각 걷다가 다그닥다그닥 질주
  emu: { walkF: 9, runF: 15, walkAmp: 0, runAmp: 0, walkBob: 0.03, runBob: 0.06, lean: 0.32, roll: 0, style: 'strut' },               // 에뮤: 몸을 앞으로 숙이고 성큼성큼
  tiger: { walkF: 7, runF: 12, walkAmp: 0.5, runAmp: 1.05, walkBob: 0.02, runBob: 0.08, lean: 0.16, roll: 0.03, style: 'bound' },    // 호랑이: 어슬렁 걷다가 낮게 덮치듯 질주
  bear: { walkF: 6, runF: 10, walkAmp: 0.45, runAmp: 0.8, walkBob: 0.03, runBob: 0.07, lean: 0.08, roll: 0.1, style: 'lumber' },     // 불곰: 쿵쿵 묵직하게
  duck: { walkF: 12, runF: 20, walkAmp: 0, runAmp: 0, walkBob: 0.03, runBob: 0.09, lean: 0.14, roll: 0, style: 'waddle' },           // 러버덕: 뛰면 뿅뿅 튄다
  capybara: { walkF: 8, runF: 13, walkAmp: 0.42, runAmp: 0.75, walkBob: 0.015, runBob: 0.05, lean: 0.06, roll: 0.04, style: 'lumber' },   // 카피바라: 뛰어도 표정은 그대로, 통통
  penguin: { walkF: 13, runF: 21, walkAmp: 0, runAmp: 0, walkBob: 0.02, runBob: 0.05, lean: 0.3, roll: 0, style: 'waddle' },         // 펭귄: 몸을 앞으로 기울이고 날개를 펴서 종종종
  eagle: { walkF: 5, runF: 8, walkAmp: 0, runAmp: 0, walkBob: 0, runBob: 0, lean: 0, roll: 0, style: 'fly' },   // 독수리: 날개 · 몸짓은 Eagle이, 어디를 날지는 엔진(flyPet)이 정한다
  dragon: { walkF: 5, runF: 8, walkAmp: 0.18, runAmp: 0.1, walkBob: 0, runBob: 0, lean: 0.38, roll: 0, style: 'fly' },               // 용: 뛰면 다리를 접고 더 높이, 더 빨리 날갯짓
}
const LEG_TUCK = 0.9   // 날 때 다리를 뒤로 접는 각
/** 레어 대형 펫 */
export const BIG_PETS: ReadonlySet<PetKind> = new Set<PetKind>(['tiger', 'bear', 'dragon'])
const TWO_LEGS: ReadonlySet<PetKind> = new Set<PetKind>(['emu', 'duck', 'penguin'])   // 두 발 펫: 앉으라면 다리를 접어 쪼그린다
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
  duck: { tilt: 0, hip: 0.12, front: { stand: true }, back: { ang: 0, sc: 1, splay: 0 }, head: 0 },   // 러버덕: 물에 뜬 것처럼 납작 앉는다
  capybara: { tilt: 0.04, hip: 0.1, front: { ang: -1.4, sc: 0.9 }, back: { ang: -1.4, sc: 0.6, splay: 0.3 }, head: 0.08 },   // 카피바라: 식빵처럼 네 다리를 접고 엎드린다
  penguin: { tilt: 0, hip: 0.1, front: { stand: true }, back: { ang: 0, sc: 1, splay: 0 }, head: 0 },   // 펭귄: 배를 깔고 쪼그린다
  dragon: { tilt: 0.6, hip: 0.1, front: { stand: true }, back: { ang: -1.3, sc: 0.55, splay: 0.15 }, head: 0.2 },   // 용: 내려앉아 앞발을 모으고 고개를 든다
  eagle: { tilt: 0, hip: 0.14, front: { stand: true }, back: { ang: 0, sc: 1, splay: 0 }, head: 0 },   // 독수리: 앉으라면 주인 어깨에 앉는다(엔진)
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
    const lie = petting ? kind === 'tiger' : sitting ? TWO_LEGS.has(kind) : s.still > REST_AFTER   // 호랑이는 쓰다듬으면 벌러덩 눕고, 두 발 에뮤는 앉으라면 다리를 접어 쪼그린다
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
  duck: { lean: 0, nod: 0.25, nodF: 9, rub: 0, rubF: 0 },   // 꽥꽥 끄덕
  capybara: { lean: -0.12, nod: 0, nodF: 0, rub: 0.06, rubF: 1.5 },   // 무덤덤하게
  penguin: { lean: -0.15, nod: 0, nodF: 0, rub: 0.3, rubF: 6 },
  dragon: { lean: -0.3, nod: 0, nodF: 0, rub: 0.22, rubF: 3 },
  eagle: { lean: 0, nod: 0, nodF: 0, rub: 0, rubF: 0 },
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

// hips: 다리마다 붙는 자리 [앞왼 · 앞오 · 뒤왼 · 뒤오]. 앉는 자세는 여기를 돌리고 줄이며, 걷는 흔들림은 그 안에서 돈다
// 걷기는 대각선 다리가 같이(앞왼 · 뒤오), 질주(bound)는 앞다리 둘 · 뒷다리 둘이 반 박자씩 엇갈려 같이 차고 나간다. 날기(fly)는 다리를 뒤로 접는다
function FourLegs({ kind, motion, y, front, back, x = 0.11, length, radius, legs, hips, leg }: { kind: PetKind; motion?: RefObject<WalkMotion>; y: number; front: number; back: number; x?: number; length: number; radius?: number; legs: RefObject<THREE.Group | null>; hips?: RefObject<(THREE.Group | null)[]>; leg?: ReactNode }) {
  const swing = useRef<(THREE.Group | null)[]>([]), one = leg ?? <Leg length={length} radius={radius} />
  useFrame(() => {
    const m = motion?.current; if (!m) return
    const g = GAIT[kind], r = m.run ?? 0, a = Math.min(1, m.amount), ph = m.phase
    const amp = THREE.MathUtils.lerp(g.walkAmp, g.runAmp, r) * a, bound = g.style === 'bound' ? r : 0, tuck = g.style === 'fly' ? LEG_TUCK * Math.max(r, a * 0.4) : 0
    swing.current.forEach((el, i) => {
      if (!el) return
      const fr = i < 2, left = i % 2 === 0
      const trot = Math.sin(ph) * (fr === left ? 1 : -1)
      const gallop = Math.sin(ph + (fr ? 0 : Math.PI * 0.9) + (left ? 0 : 0.35))
      el.rotation.x = THREE.MathUtils.lerp(trot, gallop, bound) * amp + tuck
    })
  })
  const at = (i: number, sx: number, z: number) => (
    <group ref={(g) => { if (hips?.current) hips.current[i] = g }} position={[sx, y, z]}><group ref={(g) => { swing.current[i] = g }}>{one}</group></group>
  )
  return <group ref={legs}>{at(0, -x, front)}{at(1, x, front)}{at(2, -x, back)}{at(3, x, back)}</group>
}

/** 꼬리: 걸을 때 더 빨리 흔든다 */
function Tail({ motion, position, speed, amount, children }: { motion?: RefObject<WalkMotion>; position: [number, number, number]; speed: number; amount: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null), phase = useRef(0)
  useFrame((_, delta) => {
    const r = motion?.current?.run ?? 0
    phase.current += Math.min(delta, 0.05) * speed * (1 + 1.6 * Math.min(1, motion?.current?.amount ?? 0) + 1.2 * r)
    if (ref.current) { ref.current.rotation.z = Math.sin(phase.current) * amount * (1 - 0.5 * r); ref.current.rotation.x = -0.55 * r }   // 달리면 꼬리가 뒤로 날린다
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
  useFrame((_, delta) => { const r = motion?.current?.run ?? 0; wag.current += Math.min(delta, 0.05) * (act?.current?.kind === 'pet' ? 22 : 11 + 8 * r); if (tail.current) { tail.current.rotation.z = Math.sin(wag.current) * (act?.current?.kind === 'pet' ? 0.6 : 0.35); tail.current.rotation.x = -0.5 * r } })
  return (
    <group>
      <FourLegs kind="doodle" motion={motion} y={0.36} front={0.26} back={-0.28} x={0.12} length={0.36} legs={rest.legs} hips={rest.hips} />
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
      <FourLegs kind="cat" motion={motion} y={0.3} front={0.2} back={-0.22} length={0.3} legs={rest.legs} hips={rest.hips} />
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
      <FourLegs kind="panda" motion={motion} y={0.3} front={0.2} back={-0.2} x={0.15} length={0.28} radius={0.058} legs={rest.legs} hips={rest.hips} />
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
      <FourLegs kind="fox" motion={motion} y={0.32} front={0.22} back={-0.24} length={0.32} legs={rest.legs} hips={rest.hips} />
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
      <FourLegs kind="zebra" motion={motion} y={0.4} front={0.24} back={-0.26} x={0.12} length={0.4} radius={0.04} legs={rest.legs} hips={rest.hips} />
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
      <FourLegs kind="tiger" motion={motion} y={0.36} front={0.22} back={-0.26} x={0.15} length={0.36} legs={rest.legs} hips={rest.hips} leg={<ThickLeg length={0.36} radius={0.07} color={TIGER} paw="#FFFFFF" />} />
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
      <FourLegs kind="bear" motion={motion} y={0.34} front={0.22} back={-0.24} x={0.18} length={0.34} legs={rest.legs} hips={rest.hips} leg={<ThickLeg length={0.34} radius={0.09} color={BEAR} paw={BEAR} />} />
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

const DUCK = '#FFD43B', BEAK = '#FF9F45', CAPY = '#B98A5E', CAPY_DARK = '#7A5236', DRAGON = '#8B6FE8', MANDARIN = '#FF9F45'

/** 물갈퀴 발: 짧은 주황 다리 + 납작한 발 */
function WebFoot({ length }: { length: number }) {
  return (
    <>
      <mesh position-y={-length / 2}>
        <capsuleGeometry args={[0.022, length * 0.6, 3, 6]} />
        <meshBasicMaterial color={BEAK} />
      </mesh>
      <mesh position={[0, -length + 0.02, 0.04]} scale={[1.1, 0.35, 1.5]}>
        <sphereGeometry args={[0.06, 10, 8]} />
        <Skin color={BEAK} thickness={1.1} />
      </mesh>
    </>
  )
}
/** 걸을 때 몸이 좌우로 뒤뚱거린다(두 발 펫) */
function useWaddle(motion: RefObject<WalkMotion> | undefined, amount: number) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => { if (ref.current) ref.current.rotation.z = Math.sin(motion?.current?.phase ?? 0) * amount * (motion?.current?.amount ?? 0) })
  return ref
}

/** 러버덕: 노란 고무 오리. 개발자의 디버깅 친구라 라벤더 헤드셋을 썼다 */
export function Duck({ motion, act }: PetProps) {
  const rest = useRest(motion, 0.12, act, 'duck'), leg = useLegSwing(motion, 0.9), wob = useWaddle(motion, 0.16)
  return (
    <group>
      <group ref={rest.legs}>
        <group ref={leg.left} position={[-0.09, 0.12, 0]}><WebFoot length={0.12} /></group>
        <group ref={leg.right} position={[0.09, 0.12, 0]}><WebFoot length={0.12} /></group>
      </group>
      <group ref={rest.body}>
        <group ref={wob}>
          <mesh position={[0, 0.33, -0.03]} scale={[1, 0.82, 1.22]} castShadow>
            <sphereGeometry args={[0.25, 22, 16]} />
            <Skin color={DUCK} />
          </mesh>
          {/* 꽁지 */}
          <mesh position={[0, 0.43, -0.3]} rotation-x={-0.9} castShadow>
            <coneGeometry args={[0.09, 0.2, 10]} />
            <Skin color={DUCK} thickness={1.2} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.22, 0.34, -0.06]} rotation-x={-0.25} scale={[0.35, 0.7, 1.15]}>
              <sphereGeometry args={[0.15, 14, 10]} />
              <Skin color={DUCK} thickness={1.2} />
            </mesh>
          ))}
          <group ref={rest.head} position={[0, 0.63, 0.14]}>
            <mesh castShadow>
              <sphereGeometry args={[0.2, 22, 16]} />
              <Skin color={DUCK} />
            </mesh>
            <Face radius={0.2} smile={false} />
            <mesh position={[0, -0.05, 0.2]} scale={[1.25, 0.42, 1]}>
              <sphereGeometry args={[0.085, 14, 10]} />
              <Skin color={BEAK} thickness={1.2} />
            </mesh>
            <Cheeks radius={0.2} z={0.16} y={-0.04} />
            {/* 헤드셋 */}
            <mesh rotation-y={Math.PI / 2}>
              <torusGeometry args={[0.212, 0.018, 6, 20, Math.PI]} />
              <meshBasicMaterial color={INK} />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.2, 0, 0]} scale={[0.5, 1, 1]}>
                <sphereGeometry args={[0.07, 12, 10]} />
                <Skin color={LILAC} thickness={1.1} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  )
}

/** 카피바라: 통나무 같은 갈색 몸, 뭉툭한 얼굴, 머리 위에 귤 하나 */
export function Capybara({ motion, act }: PetProps) {
  const rest = useRest(motion, 0.24, act, 'capybara')
  return (
    <group>
      <FourLegs kind="capybara" motion={motion} y={0.24} front={0.2} back={-0.22} x={0.13} length={0.24} radius={0.042} legs={rest.legs} hips={rest.hips} />
      <group ref={rest.body}>
        <mesh position-y={0.4} rotation-x={Math.PI / 2} scale={[1.08, 1, 1]} castShadow>
          <capsuleGeometry args={[0.21, 0.4, 6, 14]} />
          <Skin color={CAPY} />
        </mesh>
        <group ref={rest.head} position={[0, 0.58, 0.4]}>
          {/* 뭉툭하고 긴 얼굴 */}
          <mesh rotation-x={Math.PI / 2} scale={[1, 1, 0.92]} castShadow>
            <capsuleGeometry args={[0.17, 0.2, 6, 14]} />
            <Skin color={CAPY} />
          </mesh>
          <mesh position={[0, 0, 0.25]} scale={[1, 0.9, 0.4]}>
            <sphereGeometry args={[0.13, 14, 10]} />
            <Skin color={CAPY_DARK} thickness={1.1} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side}>
              <Ink radius={0.016} position={[side * 0.04, 0.03, 0.305]} />
              {/* 반쯤 감은 눈 */}
              <mesh position={[side * 0.135, 0.07, 0.1]} rotation-y={side * 0.9}>
                <capsuleGeometry args={[0.012, 0.05, 3, 5]} />
                <meshBasicMaterial color={INK} />
              </mesh>
              <mesh position={[side * 0.13, 0.15, -0.1]} scale={[0.7, 1, 0.6]} castShadow>
                <sphereGeometry args={[0.055, 10, 8]} />
                <Skin color={CAPY_DARK} thickness={1.1} />
              </mesh>
            </group>
          ))}
          {/* 머리 위 귤 */}
          <mesh position={[0, 0.215, 0]} scale={[1, 0.85, 1]} castShadow>
            <sphereGeometry args={[0.075, 14, 10]} />
            <Skin color={MANDARIN} thickness={1.2} />
          </mesh>
          <mesh position={[0.02, 0.285, 0]} rotation-z={-0.7} scale={[0.5, 1, 0.25]}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshBasicMaterial color="#5FAE6B" />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** 펭귄: 먹색 몸에 흰 배, 걸으면 날개를 파닥이며 뒤뚱거린다. 라벤더 목도리 */
export function Penguin({ motion, act }: PetProps) {
  const rest = useRest(motion, 0.1, act, 'penguin'), leg = useLegSwing(motion, 0.8), wob = useWaddle(motion, 0.2)
  const flip = useRef<(THREE.Group | null)[]>([])
  useFrame(() => { const m = motion?.current, k = Math.abs(Math.sin(m?.phase ?? 0)) * (m?.amount ?? 0); flip.current.forEach((g, i) => { if (g) g.rotation.z = (i ? 1 : -1) * (0.22 + k * 0.7 + 0.5 * (m?.run ?? 0)) }) })
  return (
    <group>
      <group ref={rest.legs}>
        <group ref={leg.left} position={[-0.09, 0.1, 0.02]}><WebFoot length={0.1} /></group>
        <group ref={leg.right} position={[0.09, 0.1, 0.02]}><WebFoot length={0.1} /></group>
      </group>
      <group ref={rest.body}>
        <group ref={wob}>
          <mesh position-y={0.36} castShadow>
            <capsuleGeometry args={[0.22, 0.2, 8, 16]} />
            <Skin color={COLORS.ink} />
          </mesh>
          <mesh position={[0, 0.34, 0.075]} scale={[0.82, 1.05, 0.75]}>
            <sphereGeometry args={[0.22, 18, 14]} />
            <meshBasicMaterial color="#FFFFFF" />
          </mesh>
          {[-1, 1].map((side, i) => (
            <group key={side} ref={(g) => { flip.current[i] = g }} position={[side * 0.215, 0.5, 0]}>
              <mesh position-y={-0.14} scale={[0.4, 1, 0.9]} castShadow>
                <capsuleGeometry args={[0.06, 0.18, 4, 10]} />
                <Skin color={COLORS.ink} thickness={1.2} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.58, 0.02]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.185, 0.04, 8, 20]} />
            <Skin color={LILAC} thickness={1.1} />
          </mesh>
          <group ref={rest.head} position={[0, 0.74, 0.02]}>
            <mesh castShadow>
              <sphereGeometry args={[0.21, 22, 16]} />
              <Skin color={COLORS.ink} />
            </mesh>
            {/* 흰 얼굴 */}
            <mesh position={[0, -0.02, 0.075]} scale={[1, 0.9, 0.9]}>
              <sphereGeometry args={[0.165, 18, 14]} />
              <meshBasicMaterial color="#FFFFFF" />
            </mesh>
            <Ink radius={0.026} position={[-0.075, 0.025, 0.205]} />
            <Ink radius={0.026} position={[0.075, 0.025, 0.205]} />
            <mesh position={[0, -0.04, 0.25]} rotation-x={Math.PI / 2}>
              <coneGeometry args={[0.045, 0.1, 8]} />
              <Skin color={COLORS.butter} thickness={1.1} />
            </mesh>
            <Cheeks radius={0.21} z={0.19} y={-0.05} />
          </group>
        </group>
      </group>
    </group>
  )
}

const DRAGON_L = '#A48DF0'   // 주둥이 · 날개 안쪽

/** 용(레어): 걷지 않고 날개를 저으며 떠서 따라온다. 큰 둥근 머리에 볼 터치 · 동글한 뿔 · 길쭉한 주둥이(콧구멍은 위에) · 송곳니 하나. 앉히거나 쓰다듬으면 내려앉아 날개를 접는다 */
export function Dragon({ motion, act }: PetProps) {
  const rest = useRest(motion, 0.24, act, 'dragon')
  const fly = useRef<THREE.Group>(null), wings = useRef<(THREE.Group | null)[]>([]), hover = useRef(0), smoke = useRef<(THREE.Mesh | null)[]>([])
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime, r = motion?.current?.run ?? 0, up = act?.current?.kind ? 0 : 1 + 0.6 * r
    hover.current = THREE.MathUtils.damp(hover.current, up, 4, Math.min(delta, 0.05))
    if (fly.current) fly.current.position.y = hover.current * (0.3 + Math.sin(t * 2.4) * 0.05)
    const h = Math.min(1, hover.current), beat = Math.sin(t * (4 + 5 * h + 7 * r)), spread = 0.25 + 0.55 * h
    wings.current.forEach((g, i) => { if (g) { const side = i ? 1 : -1; g.rotation.z = side * (spread * 0.4 + beat * spread * 0.6); g.rotation.y = side * (1 - h) * 0.7 } })   // 내려앉으면 날개를 뒤로 접는다
    smoke.current.forEach((m, i) => { if (!m) return; const p = (t * 0.55 + i * 0.5) % 1; m.position.set((i ? 0.035 : -0.035) + Math.sin(p * 6) * 0.02, 0.0 + p * 0.22, 0.4 + p * 0.04); m.scale.setScalar(Math.sin(p * Math.PI) * 1.3) })   // 콧김 퐁퐁
  })
  return (
    <group scale={BIG}>
      <group ref={fly}>
        <FourLegs kind="dragon" motion={motion} y={0.24} front={0.18} back={-0.22} x={0.14} length={0.24} legs={rest.legs} hips={rest.hips} leg={<ThickLeg length={0.24} radius={0.06} color={DRAGON} paw={COLORS.butter} />} />
        <group ref={rest.body}>
          <mesh position-y={0.42} rotation-x={Math.PI / 2} castShadow>
            <capsuleGeometry args={[0.21, 0.4, 8, 16]} />
            <Skin color={DRAGON} />
          </mesh>
          {/* 노란 배 */}
          <mesh position={[0, 0.34, 0.02]} rotation-x={Math.PI / 2} scale={[0.8, 1, 0.7]}>
            <capsuleGeometry args={[0.19, 0.36, 6, 12]} />
            <meshBasicMaterial color={COLORS.butter} />
          </mesh>
          {/* 등 가시: 동글동글 */}
          {[-0.24, -0.08, 0.08, 0.22].map((z, i) => (
            <mesh key={z} position={[0, 0.66 - Math.abs(z) * 0.12, z]} rotation-x={-0.25}>
              <coneGeometry args={[0.05, i % 2 ? 0.1 : 0.13, 6]} />
              <Skin color={COLORS.butter} thickness={1.1} />
            </mesh>
          ))}
          <Tail motion={motion} position={[0, 0.44, -0.4]} speed={2.2} amount={0.35}>
            <group rotation-x={-1.25}>
              <mesh position-y={0.24} castShadow>
                <coneGeometry args={[0.1, 0.52, 12]} />
                <Skin color={DRAGON} thickness={1.3} />
              </mesh>
              <mesh position-y={0.53} scale={[1.2, 1.3, 0.5]}>
                <octahedronGeometry args={[0.07, 0]} />
                <Skin color={COLORS.butter} thickness={1.1} />
              </mesh>
            </group>
          </Tail>
          {/* 날개: 동글한 막에 물결 가장자리 · 손가락 선 두 줄 */}
          {[-1, 1].map((side, i) => (
            <group key={side} ref={(g) => { wings.current[i] = g }} position={[side * 0.15, 0.6, -0.04]}>
              <group rotation-y={side * -0.25}>
                <mesh position={[side * 0.24, 0.02, -0.03]} scale={[1.7, 0.1, 1]} castShadow>
                  <sphereGeometry args={[0.16, 14, 10]} />
                  <Skin color={LILAC} thickness={1.3} />
                </mesh>
                {[0.14, 0.3].map((x) => (
                  <mesh key={x} position={[side * x, 0.01, -0.17]} scale={[1, 0.08, 0.9]}>
                    <sphereGeometry args={[0.07, 10, 8]} />
                    <Skin color={LILAC} thickness={1.1} />
                  </mesh>
                ))}
                <mesh position={[side * 0.2, 0.03, 0.09]} rotation-z={Math.PI / 2}>
                  <capsuleGeometry args={[0.018, 0.4, 3, 6]} />
                  <meshBasicMaterial color={INK} />
                </mesh>
                {[0.6, 1.1].map((a) => (
                  <group key={a} position={[side * 0.34, 0.035, 0.07]} rotation-y={side * -a}>
                    <mesh position={[side * 0.08, 0, 0]} rotation-z={Math.PI / 2}>
                      <capsuleGeometry args={[0.009, 0.14, 3, 4]} />
                      <meshBasicMaterial color={INK} />
                    </mesh>
                  </group>
                ))}
              </group>
            </group>
          ))}
          <group ref={rest.head} position={[0, 0.76, 0.44]}>
            <mesh castShadow>
              <sphereGeometry args={[0.27, 26, 20]} />
              <Skin color={DRAGON} />
            </mesh>
            {/* 주둥이: 앞으로 살짝 길쭉하게(정면 둥근 코가 아니다) */}
            <mesh position={[0, -0.09, 0.2]} scale={[0.9, 0.62, 1.3]}>
              <sphereGeometry args={[0.14, 18, 14]} />
              <Skin color={DRAGON_L} thickness={1.2} />
            </mesh>
            {/* 콧구멍: 주둥이 위쪽에 작게 */}
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.04, -0.015, 0.34]} rotation-x={-0.5} scale={[1, 0.5, 1]}>
                <sphereGeometry args={[0.012, 8, 6]} />
                <meshBasicMaterial color={INK} />
              </mesh>
            ))}
            {/* 미소 · 송곳니 하나 */}
            <mesh position={[0, -0.135, 0.3]} rotation={[-0.5, 0, Math.PI]}>
              <torusGeometry args={[0.05, 0.008, 4, 12, Math.PI]} />
              <meshBasicMaterial color={INK} />
            </mesh>
            <mesh position={[0.035, -0.155, 0.31]} rotation-x={Math.PI}>
              <coneGeometry args={[0.013, 0.035, 6]} />
              <meshBasicMaterial color="#FFFFFF" />
            </mesh>
            <Face radius={0.27} smile={false} />
            <Cheeks radius={0.27} z={0.2} y={-0.02} />
            {/* 정수리 가시 둘 */}
            {[-0.05, 0.05].map((z, i) => (
              <mesh key={z} position={[0, 0.27 - i * 0.02, z - 0.08]} rotation-x={-0.4} scale={[0.5, 1, 1]}>
                <coneGeometry args={[0.04, 0.09 - i * 0.02, 6]} />
                <Skin color={COLORS.butter} thickness={1.1} />
              </mesh>
            ))}
            {[-1, 1].map((side) => (
              <group key={side}>
                {/* 동글한 뿔: 뒤로 살짝 눕힌다 */}
                <group position={[side * 0.13, 0.24, -0.03]} rotation={[-0.55, 0, side * -0.3]}>
                  <mesh position-y={0.07} castShadow>
                    <coneGeometry args={[0.05, 0.16, 10]} />
                    <Skin color={COLORS.butter} thickness={1.2} />
                  </mesh>
                  <mesh position-y={0.15}>
                    <sphereGeometry args={[0.016, 8, 6]} />
                    <Skin color={COLORS.butter} thickness={1} />
                  </mesh>
                </group>
                {/* 볏(귀 지느러미) */}
                <mesh position={[side * 0.27, 0.05, -0.05]} rotation-z={side * -1.1} scale={[1, 1, 0.35]}>
                  <coneGeometry args={[0.07, 0.16, 4]} />
                  <Skin color={LILAC} thickness={1.1} />
                </mesh>
              </group>
            ))}
            {/* 콧김 */}
            {[0, 1].map((i) => (
              <mesh key={i} ref={(el) => { smoke.current[i] = el }}>
                <sphereGeometry args={[0.022, 8, 6]} />
                <meshBasicMaterial color="#FFFFFF" transparent opacity={0.8} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  )
}

const EAGLE = '#6B4428', EAGLE_D = '#4A2E1A'

/** 독수리 날개: 어깨가 원점. 덮깃(갈색) + 끝으로 갈수록 갈라지는 칼깃(먹색) */
function EagleWing({ side }: { side: 1 | -1 }) {
  return (
    <group>
      <mesh position={[side * 0.27, 0, -0.02]} scale={[1.7, 0.13, 0.82]} castShadow>
        <sphereGeometry args={[0.18, 16, 10]} />
        <Skin color={EAGLE} thickness={1.3} />
      </mesh>
      <mesh position={[side * 0.22, 0.012, 0.06]} scale={[1.45, 0.1, 0.4]}>
        <sphereGeometry args={[0.16, 14, 8]} />
        <Skin color="#8A5A36" thickness={1.1} />
      </mesh>
      {/* 칼깃: 날개 끝에서 손가락처럼 벌어진다 */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[side * (0.52 + i * 0.03), -0.005, 0.04 - i * 0.07]} rotation-y={side * (-0.15 - i * 0.22)} rotation-z={side * Math.PI / 2} scale={[1, 1, 0.4]}>
          <capsuleGeometry args={[0.03, 0.17 - i * 0.015, 4, 8]} />
          <Skin color={EAGLE_D} thickness={1.1} />
        </mesh>
      ))}
    </group>
  )
}

/** 독수리(초레어): 흰 머리 · 노란 갈고리 부리 · 매서운 눈썹, 넓은 날개, 흰 부채꼴 꽁지.
 *  날면(fly) 몸을 수평으로 눕히고 날개를 펴서 활공 · 날갯짓(flap)을 하고, 내려앉으면 몸을 세우고 날개를 접어 두리번거린다.
 *  쓰다듬으면 앉은 채 날개를 활짝 편다. 둘레에 초레어 반짝이가 돈다. 어디를 날지는 엔진(flyPet)이 정한다 */
export function Eagle({ motion, act }: PetProps) {
  const torso = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null), legs = useRef<THREE.Group>(null), tail = useRef<THREE.Group>(null), glints = useRef<THREE.Group>(null)
  const wings = useRef<(THREE.Group | null)[]>([]), st = useRef({ fly: 0, flap: 0, spread: 0, ph: 0 })
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05), m = motion?.current, s = st.current, t = clock.elapsedTime, petting = act?.current?.kind === 'pet'
    s.fly = THREE.MathUtils.damp(s.fly, m?.fly ?? 0, 5, dt); s.flap = THREE.MathUtils.damp(s.flap, m?.flap ?? 0, 4, dt)
    s.spread = THREE.MathUtils.damp(s.spread, petting ? 1 : s.fly, 6, dt)
    s.ph += dt * (5 + 11 * s.flap)
    const beat = Math.sin(s.ph) * (0.12 + 0.7 * s.flap) * s.fly + (petting ? Math.sin(t * 5) * 0.12 : 0)
    wings.current.forEach((g, i) => {
      if (!g) return; const side = i ? 1 : -1
      g.rotation.y = side * THREE.MathUtils.lerp(1.45, 0, s.spread)   // 접으면 날개 끝이 뒤를 향한다
      g.rotation.z = side * THREE.MathUtils.lerp(-0.2, 0.12 + beat, s.spread)
    })
    const tilt = THREE.MathUtils.lerp(-0.7, 0.06, s.fly)   // 앉으면 몸을 세우고, 날면 수평
    if (torso.current) torso.current.rotation.x = tilt
    if (head.current) { head.current.rotation.x = -tilt * 0.85; head.current.rotation.y = (1 - s.fly) * (Math.sin(t * 0.7) * 0.55 + Math.sin(t * 2.9) * 0.08) }   // 앉아 있으면 두리번두리번
    if (legs.current) { legs.current.rotation.x = 1.3 * s.fly; legs.current.scale.y = 1 - 0.35 * s.fly }   // 날면 발을 뒤로 접는다
    if (tail.current) tail.current.scale.x = 1 + 0.45 * s.fly
    if (glints.current) { glints.current.rotation.y = t * 1.3; glints.current.children.forEach((c, i) => { c.scale.setScalar(0.6 + 0.4 * Math.max(0, Math.sin(t * 3 + i * 2.1))) }) }
  })
  return (
    <group scale={1.15}>
      {/* 다리 · 발톱(라벤더 발찌) */}
      <group ref={legs} position-y={0.14}>
        {[-1, 1].map((side) => (
          <group key={side} position-x={side * 0.07}>
            <mesh position-y={-0.06}>
              <capsuleGeometry args={[0.026, 0.08, 4, 8]} />
              <Skin color={COLORS.butter} thickness={1.1} />
            </mesh>
            <mesh position-y={-0.03} rotation-x={Math.PI / 2}>
              <torusGeometry args={[0.032, 0.012, 6, 12]} />
              <meshBasicMaterial color={LILAC} />
            </mesh>
            {[-0.5, 0, 0.5].map((a) => (
              <mesh key={a} position={[Math.sin(a) * 0.035, -0.125, Math.cos(a) * 0.035]} rotation={[Math.PI / 2 - 0.3, 0, -a]}>
                <coneGeometry args={[0.013, 0.06, 6]} />
                <meshBasicMaterial color={INK} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      <group ref={torso} position-y={0.2}>
        <mesh position={[0, 0.1, 0]} scale={[0.85, 0.85, 1.3]} castShadow>
          <sphereGeometry args={[0.19, 22, 16]} />
          <Skin color={EAGLE} />
        </mesh>
        {/* 흰 꽁지: 부채꼴 */}
        <group ref={tail} position={[0, 0.08, -0.26]}>
          {[-1, 0, 1].map((k) => (
            <mesh key={k} position={[k * 0.05, 0, -0.05]} rotation-y={k * 0.3} scale={[0.55, 0.12, 1.2]}>
              <sphereGeometry args={[0.1, 12, 8]} />
              <Skin thickness={1.2} />
            </mesh>
          ))}
        </group>
        {[-1, 1].map((side, i) => (
          <group key={side} ref={(g) => { wings.current[i] = g }} position={[side * 0.13, 0.16, 0.04]}>
            <EagleWing side={side as 1 | -1} />
          </group>
        ))}
        <group ref={head} position={[0, 0.22, 0.2]}>
          <mesh castShadow>
            <sphereGeometry args={[0.135, 20, 16]} />
            <Skin />
          </mesh>
          {/* 목깃: 흰 머리와 갈색 몸 사이의 깃털 */}
          <mesh position={[0, -0.1, -0.03]} scale={[1.1, 0.5, 1]}>
            <sphereGeometry args={[0.12, 14, 10]} />
            <Skin thickness={1.1} />
          </mesh>
          {/* 노란 갈고리 부리 */}
          <mesh position={[0, -0.01, 0.15]} rotation-x={Math.PI / 2} scale={[0.85, 1, 0.75]}>
            <coneGeometry args={[0.05, 0.12, 12]} />
            <Skin color={COLORS.butter} thickness={1.2} />
          </mesh>
          <mesh position={[0, -0.04, 0.2]} scale={[0.7, 1.1, 0.8]}>
            <sphereGeometry args={[0.022, 10, 8]} />
            <Skin color={COLORS.butter} thickness={1} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side}>
              <Ink radius={0.022} position={[side * 0.07, 0.025, 0.105]} />
              {/* 매서운 눈썹 */}
              <mesh position={[side * 0.065, 0.065, 0.11]} rotation={[0.2, 0, side * 0.4]}>
                <capsuleGeometry args={[0.012, 0.06, 3, 6]} />
                <meshBasicMaterial color={INK} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
      {/* 초레어 반짝이: 둘레를 돈다 */}
      <group ref={glints} position-y={0.35}>
        {[0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2; return (
          <mesh key={i} position={[Math.sin(a) * 0.5, Math.sin(a * 2) * 0.08, Math.cos(a) * 0.5]} scale={[0.55, 1.4, 0.55]}>
            <octahedronGeometry args={[0.035, 0]} />
            <meshBasicMaterial color={i === 1 ? LILAC : '#FFD43B'} />
          </mesh>
        ) })}
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
  duck: { hop: 0.07, hopF: 10, roll: 0, rollF: 0, yaw: 0, yawF: 0, rear: 0 },   // 러버덕: 뿅뿅 튄다
  capybara: { hop: 0, hopF: 0, roll: 0.04, rollF: 1.5, yaw: 0, yawF: 0, rear: 0 },   // 카피바라: 거의 안 움직인다
  penguin: { hop: 0, hopF: 0, roll: 0.16, rollF: 7, yaw: 0.2, yawF: 7, rear: 0 },   // 펭귄: 뒤뚱뒤뚱 신나게
  dragon: { hop: 0.14, hopF: 4, roll: 0, rollF: 0, yaw: 0.15, yawF: 4, rear: 0 },   // 용: 둥실둥실
  eagle: { hop: 0, hopF: 0, roll: 0, rollF: 0, yaw: 0, yawF: 0, rear: 0 },   // 독수리: 쓰다듬으면 날개를 활짝(Eagle)
}

export function Pet({ kind, motion, act }: { kind: PetKind; motion?: RefObject<WalkMotion>; act?: RefObject<PetAct> }) {
  const outer = useRef<THREE.Group>(null), inner = useRef<THREE.Group>(null), gait = useRef<THREE.Group>(null), st = useRef({ sit: 0, pet: 0 })
  useFrame(() => {   // 걸음걸이: 들썩임 · 달릴 때 숙이기 · 좌우 흔들림 · 질주할 때 허리 접기
    const m = motion?.current, gr = gait.current; if (!m || !gr) return
    const g = GAIT[kind] ?? GAIT.doodle, r = m.run ?? 0, a = Math.min(1, m.amount), ph = m.phase, scale = BIG_PETS.has(kind) ? BIG : 1
    const bound = g.style === 'bound' ? r : 0, bob = THREE.MathUtils.lerp(g.walkBob, g.runBob, r) * a
    gr.position.y = THREE.MathUtils.lerp(Math.abs(Math.sin(ph)), (1 + Math.sin(ph - 0.6)) / 2, bound) * bob * scale
    gr.rotation.x = g.lean * r * a + Math.sin(ph + 0.9) * 0.1 * bound * a
    gr.rotation.z = Math.sin(ph) * g.roll * a * (1 + r)
  })
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05), a = act?.current, s = st.current, b = BODY[kind] ?? BODY.doodle, t = a?.t ?? 0
    s.sit = THREE.MathUtils.damp(s.sit, a?.kind === 'sit' ? 1 : 0, 8, dt); s.pet = THREE.MathUtils.damp(s.pet, a?.kind === 'pet' ? 1 : 0, 8, dt)
    if (!outer.current || !inner.current) return
    const scale = BIG_PETS.has(kind) ? BIG : 1, pivot = GEO[kind].back * scale   // 엉덩이(뒷다리 자리)를 축으로. 레어 펫은 몸이 큰 만큼
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
    : kind === 'duck' ? <Duck motion={motion} act={act} />
    : kind === 'capybara' ? <Capybara motion={motion} act={act} />
    : kind === 'penguin' ? <Penguin motion={motion} act={act} />
    : kind === 'dragon' ? <Dragon motion={motion} act={act} />
    : kind === 'eagle' ? <Eagle motion={motion} act={act} />
    : <DoodleDog motion={motion} act={act} />
  return <group ref={gait}><group ref={outer}><group ref={inner}>{body}</group></group></group>
}
