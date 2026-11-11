// 엔진(three.js)과 캐릭터(React)를 잇는 다리
// 엔진은 위치·방향·자세만 정하고, 모양은 하루들 월드의 <Avatar>·<Doodle>이 그린다.
import * as THREE from 'three'
import type { AvatarConfig } from '../harudle/avatarData'

import type { GearState } from '../scene/Gear'
import type { PetKind } from '../scene/Pets'

export type DollAnim = {
  moving: boolean
  run: boolean
  air: boolean
  seated: boolean
  seatH?: number
  act: 'draw' | 'wave' | 'heart' | 'laptop' | 'coffee' | 'dance' | 'gun' | 'read' | null
  waving: boolean
  style: number   // 춤 번호(0~9)
  actT: number    // 동작을 시작한 뒤 흐른 시간(춤 팔을 엔진의 박자에 맞춘다)
  noHead: boolean // 1인칭의 내 캐릭터: 카메라가 머리 안에 있으니 머리만 숨긴다
  sleep?: boolean // 쿨쿨 자는 중(개인 빈백): 눈을 감고 고개를 숙인다
  listen?: boolean // LP 감상 중: 헤드셋을 쓰고 박자에 맞춰 고개를 끄덕인다
  guitar?: boolean // 기타 연주 중: 기타를 내려다보며 오른손은 줄을 튕기고 왼손은 넥을 짚는다
  cross?: boolean  // 앉아서 다리 꼬기
  party?: boolean  // 클럽 파티: 두 팔을 번갈아 마구 흔들고 고개를 신나게 흔든다
  petAct: 'sit' | 'pet' | null // 펫(dog)만: 주인이 앉혔다 · 쓰다듬는 중
  fly?: number   // 나는 펫(독수리)만: 떠 있으면 1, 앉아 있으면 0
  flap?: number  // 나는 펫만: 날갯짓 세기(0 활공 ~ 1 힘차게)
  arms: number[] | null // 대결 종목이 정한 팔 자세 [오른팔 x, z, 왼팔 x, z](라디안). 있으면 다른 팔 동작보다 먼저(복싱 주먹 · 가드)
}

export type Doll = {
  id: number
  /** harudle·haru는 14층 특종 가판대의 하루들 기자와 손 흔드는 하루(움직이지 않는다) */
  kind: 'avatar' | 'dog' | 'harudle' | 'haru'
  /** kind가 dog일 때 그릴 펫(없으면 두들) */
  pet: PetKind
  /** 컷 상점에서 사서 쓰고 있는 장식(아바타만) */
  gear: GearState | null
  config: AvatarConfig | null
  root: THREE.Group
  turn: THREE.Group
  blob: THREE.Mesh
  anim: DollAnim
  look: AvatarConfig | null
  update(dt: number, t: number, moving: boolean, heading?: number | null, seed?: number, waving?: boolean, act?: DollAnim['act'], air?: boolean, run?: boolean): void
  setSeated(v: unknown): void
}

let nextId = 1
const live = new Map<number, Doll>()
let snapshot: Doll[] = []
const listeners = new Set<() => void>()
const changed = () => { snapshot = [...live.values()]; for (const l of listeners) l() }

export const dollStore = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
  get: () => snapshot,
}

const turnTo = (from: number, to: number) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d }

export function makeDoll(kind: Doll['kind'], config: AvatarConfig | null, blob: THREE.Mesh, extra: { pet?: PetKind; gear?: GearState | null } = {}): Doll {
  const root = new THREE.Group(), turn = new THREE.Group()
  root.add(turn); root.add(blob)
  // 화면 밖이라 그리지 않는 프레임(엔진의 cullDolls가 turn을 끈다)에는 몸 안쪽 자리 계산도 건너뛴다
  { const update = THREE.Object3D.prototype.updateMatrixWorld; turn.updateMatrixWorld = function (force?: boolean) { if (this.visible) update.call(this, force) } }
  let heading = 0
  const doll: Doll = {
    id: nextId++, kind, config, root, turn, blob, look: config, pet: extra.pet ?? 'doodle', gear: extra.gear ?? null,
    anim: { moving: false, run: false, air: false, seated: false, act: null, waving: false, style: 0, actT: 0, noHead: false, arms: null, petAct: null },
    update(dt, _t, moving, wantHeading, _seed = 0, waving = false, act = null, air = false, run = false) {
      if (wantHeading !== undefined && wantHeading !== null) heading = wantHeading
      turn.rotation.y += turnTo(turn.rotation.y, heading) * Math.min(1, dt * (kind === 'dog' ? 10 : 12))
      Object.assign(doll.anim, { moving, run, air, act, waving })
    },
    setSeated(v: any) { // v: 앉은 자리({ h }) 또는 true/false. 높은 자리면 그만큼 몸을 올리고, 다리는 높이에 맞게 굽힌다
      doll.anim.seated = !!v; doll.anim.seatH = v && typeof v === 'object' && v.h != null ? v.h : 0.26
      if (v) root.position.y += Math.max(0, doll.anim.seatH - 0.26)
    },
  }
  live.set(doll.id, doll); changed()
  return doll
}

/** 숨겨진 동안(다른 층에 있는 크루)은 자리 계산을 건너뛴다. 다시 보이면 그 프레임에 바로 맞춰진다. 숨긴 채 월드 좌표를 읽는 캐릭터(1인칭의 나)에는 쓰지 않는다 */
export function restWhenHidden(doll: Doll): Doll {
  const update = THREE.Object3D.prototype.updateMatrixWorld
  doll.root.updateMatrixWorld = function (force?: boolean) { if (this.visible) update.call(this, force) }
  return doll
}

export function dropDoll(doll: Doll | null | undefined) {
  if (!doll) return
  doll.root.removeFromParent()
  if (live.delete(doll.id)) changed()
}
