// 캐릭터 꾸미기 창 옆 미리보기: 엔진이 창을 열고 닫거나 외형을 바꿀 때 알리고, <AvatarPreview>가 받아 그린다
import type { AvatarConfig } from '../harudle/avatarData'
import type * as THREE from 'three'

// silent: 캡쳐용으로만 잠깐 띄운 것(보이지 않게). 엔진의 captureAvatar가 쓴다
type State = { open: boolean; silent: boolean; config: AvatarConfig | null; note: string | null }   // note: 잠긴 장식을 껴 보는 중이면 그 안내
export type PreviewContext = { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera }   // 미리보기 캔버스의 렌더러(캡쳐에 쓴다)
let state: State = { open: false, silent: false, config: null, note: null }
let context: PreviewContext | null = null
const listeners = new Set<() => void>()

export const avatarPreview = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
  get: () => state,
  set(next: Partial<State>) { state = { ...state, ...next }; for (const l of listeners) l() },
  setContext(c: PreviewContext | null) { context = c },
  context: () => context,
}
