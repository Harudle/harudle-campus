const STORAGE_KEY = 'harudle-world.nickname'

export const MAX_NICKNAME_LENGTH = 12

/** 아직 입력한 적이 없으면 null이다. 빈 문자열은 이름 없이 들어가기로 한 것이다. */
export function loadNickname() {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveNickname(nickname: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, nickname)
  } catch {
    // 저장할 수 없는 환경에서는 이번 방문 동안만 유지한다.
  }
}
