// 캐릭터 꾸미기 창 옆 미리보기: 엔진이 창을 열고 닫거나 외형을 바꿀 때 알리고, <AvatarPreview>가 받아 그린다
import type { AvatarConfig } from '../harudle/avatarData'

type State = { open: boolean; config: AvatarConfig | null }
let state: State = { open: false, config: null }
const listeners = new Set<() => void>()

export const avatarPreview = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
  get: () => state,
  set(next: Partial<State>) { state = { ...state, ...next }; for (const l of listeners) l() },
}
