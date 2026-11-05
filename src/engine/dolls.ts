// 엔진(three.js)과 캐릭터(React)를 잇는 다리
// 엔진은 위치·방향·자세만 정하고, 모양은 하루들 월드의 <Avatar>·<Doodle>이 그린다.
import * as THREE from 'three'
import type { AvatarConfig } from '../harudle/avatarData'

export type DollAnim = {
  moving: boolean
  run: boolean
  air: boolean
  seated: boolean
  act: 'draw' | 'wave' | 'heart' | null
  waving: boolean
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
    anim: { moving: false, run: false, air: false, seated: false, act: null, waving: false },
    update(dt, _t, moving, wantHeading, _seed = 0, waving = false, act = null, air = false, run = false) {
      if (wantHeading !== undefined && wantHeading !== null) heading = wantHeading
      turn.rotation.y += turnTo(turn.rotation.y, heading) * Math.min(1, dt * (kind === 'dog' ? 10 : 12))
      Object.assign(doll.anim, { moving, run, air, act, waving })
    },
    setSeated(v) { doll.anim.seated = !!v },
  }
  live.set(doll.id, doll); changed()
  return doll
}

export function dropDoll(doll: Doll | null | undefined) {
  if (!doll) return
  doll.root.removeFromParent()
  if (live.delete(doll.id)) changed()
}
