export type GallerySettings = {
  doodleFollows: boolean
}

const STORAGE_KEY = 'harudle-world.settings'
const DEFAULT_SETTINGS: GallerySettings = { doodleFollows: false }

export function loadSettings(): GallerySettings {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    return { doodleFollows: stored?.doodleFollows === true }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: GallerySettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 저장할 수 없는 환경에서는 이번 방문 동안만 유지한다.
  }
}
