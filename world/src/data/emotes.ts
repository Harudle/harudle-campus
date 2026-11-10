/** 머리 위에 띄우는 감정 표현. 서버도 이 파일로 값을 확인하므로 다른 파일을 가져오지 않는다. */
export const EMOTES = [
  { id: 'heart', symbol: '❤️', label: '좋아요' },
  { id: 'laugh', symbol: '😆', label: '웃음' },
  { id: 'wow', symbol: '😮', label: '놀람' },
  { id: 'sad', symbol: '😢', label: '슬픔' },
  { id: 'angry', symbol: '😠', label: '화남' },
  { id: 'clap', symbol: '👏', label: '박수' },
] as const

export type EmoteId = (typeof EMOTES)[number]['id']

export function isEmote(value: unknown): value is EmoteId {
  return EMOTES.some((emote) => emote.id === value)
}
