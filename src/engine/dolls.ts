// 엔진(three.js)과 캐릭터(React)를 잇는 다리
// 엔진은 위치·방향·자세만 정하고, 모양은 하루들 월드의 <Avatar>·<Doodle>이 그린다.
import * as THREE from 'three'
import type { AvatarConfig } from '../harudle/avatarData'

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
}

export type Doll = {
  id: number
  kind: 'avatar' | 'dog'
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

export function makeDoll(kind: Doll['kind'], config: AvatarConfig | null, blob: THREE.Mesh): Doll {
  const root = new THREE.Group(), turn = new THREE.Group()
  root.add(turn); root.add(blob)
  let heading = 0
  const doll: Doll = {
    id: nextId++, kind, config, root, turn, blob, look: config,
    anim: { moving: false, run: false, air: false, seated: false, act: null, waving: false, style: 0, actT: 0, noHead: false },
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

export function dropDoll(doll: Doll | null | undefined) {
  if (!doll) return
  doll.root.removeFromParent()
  if (live.delete(doll.id)) changed()
}
