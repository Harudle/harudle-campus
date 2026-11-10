export const HARUDLE_URL = 'https://www.harudle.com'
export const HARUDLE_SHORT_URL = 'https://harudle.com'
export const LOGIN_URL = `${HARUDLE_URL}/login`
export const SLOGAN = '우리끼리 통하는 네컷만화'

export const COLORS = {
  primary: '#8B6FE8',
  primaryDeep: '#7355DA',
  background: '#F8F6FF',
  lavender100: '#EDE7FF',
  lavender200: '#D9CEFC',
  lavender300: '#C3B3F8',
  paper: '#FFFDF7',
  ink: '#2B2140',
  outline: '#3B2A7A',
  butter: '#FFD97A',
  blush: '#FFA9BD',
  charcoal: '#2F2F2F',
} as const

/** 응원글 포스트잇 색. 글 번호로 고르므로 게시판과 방명록에서 같은 색으로 보인다. */
export const NOTE_COLORS = ['#FFE9A8', '#FFD3DE', '#E6DDFB', '#D5EFE3', '#D7E8FB', '#FFE2CC']

export function noteColor(id: number) {
  return NOTE_COLORS[id % NOTE_COLORS.length]
}

export const FONT_DISPLAY = 'Jua'
export const FONT_BODY = '"Gowun Dodum"'
