export const AVATAR_OPTIONS = {
  head: [
    { value: 'beret', label: '베레모' },
    { value: 'curly', label: '곱슬머리' },
    { value: 'cap', label: '캡모자' },
    { value: 'ribbon', label: '리본' },
    { value: 'crown', label: '왕관' },
    { value: 'bunny', label: '토끼 귀' },
    { value: 'none', label: '없음' },
  ],
  face: [
    { value: 'smile', label: '방긋' },
    { value: 'wink', label: '윙크' },
    { value: 'cat', label: '고양이 입' },
    { value: 'surprised', label: '깜짝' },
  ],
  eyewear: [
    { value: 'none', label: '없음' },
    { value: 'round', label: '동그란 안경' },
    { value: 'sunglasses', label: '선글라스' },
  ],
  outfit: [
    { value: 'tunic', label: '원피스' },
    { value: 'tee', label: '티셔츠' },
    { value: 'stick', label: '막대 몸' },
  ],
  neck: [
    { value: 'none', label: '없음' },
    { value: 'scarf', label: '목도리' },
    { value: 'bowtie', label: '나비넥타이' },
  ],
  bag: [
    { value: 'none', label: '없음' },
    { value: 'messenger', label: '크로스백' },
    { value: 'backpack', label: '배낭' },
  ],
  held: [
    { value: 'none', label: '없음' },
    { value: 'sketch', label: '그림판' },
    { value: 'pencil', label: '연필' },
    { value: 'brush', label: '붓' },
    { value: 'heart', label: '하트 풍선' },
  ],
} as const

export const AVATAR_COLORS = [
  { value: '#FFFFFF', label: '하양' },
  { value: '#F4F1EA', label: '크림' },
  { value: '#DBD6D1', label: '웜 그레이' },
  { value: '#2F2F2F', label: '먹색' },
  { value: '#E6DDF6', label: '연보라' },
  { value: '#B9A6EC', label: '라벤더' },
  { value: '#7355DA', label: '보라' },
  { value: '#3F2F8F', label: '남보라' },
  { value: '#FFA9BD', label: '분홍' },
  { value: '#F0568A', label: '진분홍' },
  { value: '#E5484D', label: '빨강' },
  { value: '#FF9B54', label: '주황' },
  { value: '#FFD97A', label: '버터' },
  { value: '#F5C400', label: '노랑' },
  { value: '#A9E0C8', label: '민트' },
  { value: '#3FA37C', label: '초록' },
  { value: '#A9CFF5', label: '하늘' },
  { value: '#3B82D6', label: '파랑' },
  { value: '#FFF1E3', label: '피부 1' },
  { value: '#F6D7B8', label: '피부 2' },
  { value: '#D9A77A', label: '피부 3' },
  { value: '#8D5A3B', label: '피부 4' },
] as const

/** 색을 따로 고를 수 있는 부위 */
export const AVATAR_COLOR_PARTS = [
  { key: 'outfitColor', label: '옷' },
  { key: 'headColor', label: '머리 장식' },
  { key: 'neckColor', label: '목' },
  { key: 'bagColor', label: '가방' },
  { key: 'heldColor', label: '소품' },
  { key: 'skinColor', label: '피부' },
] as const

export type AvatarColorKey = (typeof AVATAR_COLOR_PARTS)[number]['key']

type Options = typeof AVATAR_OPTIONS
export type AvatarPart = keyof Options
type PartValues = { [Part in AvatarPart]: Options[Part][number]['value'] }

export type AvatarConfig = PartValues & Record<AvatarColorKey, string>

export const AVATAR_PRESETS: { label: string; config: AvatarConfig }[] = [
  {
    label: '하루들 스타일',
    config: {
      head: 'beret',
      face: 'smile',
      eyewear: 'none',
      outfit: 'stick',
      neck: 'none',
      bag: 'none',
      held: 'sketch',
      outfitColor: '#FFFFFF',
      headColor: '#B9A6EC',
      neckColor: '#B9A6EC',
      bagColor: '#B9A6EC',
      heldColor: '#B9A6EC',
      skinColor: '#FFFFFF',
    },
  },
  {
    label: '하루 스타일',
    config: {
      head: 'curly',
      face: 'smile',
      eyewear: 'none',
      outfit: 'tunic',
      neck: 'none',
      bag: 'messenger',
      held: 'none',
      outfitColor: '#FFFFFF',
      headColor: '#2F2F2F',
      neckColor: '#B9A6EC',
      bagColor: '#B9A6EC',
      heldColor: '#B9A6EC',
      skinColor: '#FFFFFF',
    },
  },
]

export const DEFAULT_AVATAR = AVATAR_PRESETS[0].config

const STORAGE_KEY = 'harudle-world.avatar'
const PARTS = Object.keys(AVATAR_OPTIONS) as AvatarPart[]

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function isColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

/** 저장된 값이 깨졌거나 옛 형식이어도 항목별로 기본값으로 메운다. */
export function sanitizeAvatar(raw: unknown): AvatarConfig {
  const source = (raw ?? {}) as Record<string, unknown>
  const result = { ...DEFAULT_AVATAR } as Record<string, string>
  for (const part of PARTS) {
    const value = source[part]
    if (AVATAR_OPTIONS[part].some((option) => option.value === value)) result[part] = value as string
  }
  for (const { key } of AVATAR_COLOR_PARTS) {
    const value = source[key]
    if (isColor(value)) result[key] = value.toUpperCase()
    // 예전에 저장된 공통 악세서리 색을 이어서 쓴다.
    else if (key !== 'outfitColor' && key !== 'skinColor' && isColor(source.accentColor)) result[key] = source.accentColor
  }
  return result as AvatarConfig
}

export function randomAvatar(): AvatarConfig {
  const pick = (items: readonly { value: string }[]) => items[Math.floor(Math.random() * items.length)]
  const result = {} as Record<string, string>
  for (const part of PARTS) result[part] = pick(AVATAR_OPTIONS[part]).value
  for (const { key } of AVATAR_COLOR_PARTS) result[key] = pick(AVATAR_COLORS).value
  // 피부는 눈코입이 잘 보이도록 밝은 쪽에서만 고른다.
  result.skinColor = pick(AVATAR_COLORS.filter(({ label }) => label.startsWith('피부') && label !== '피부 4')).value
  return result as AvatarConfig
}

/** 이 브라우저에 저장된 아바타. 처음 온 방문자면 null이다. */
export function loadAvatar(): AvatarConfig | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? sanitizeAvatar(JSON.parse(stored)) : null
  } catch {
    return null
  }
}

export function saveAvatar(config: AvatarConfig) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // 저장할 수 없는 환경에서는 이번 방문 동안만 유지한다.
  }
}
