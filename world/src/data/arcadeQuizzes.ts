export type ArcadeRoomId = 'song' | 'drama'

export type ArcadeRoomInfo = {
  id: ArcadeRoomId
  /** 입구 홀의 문과 버튼에 쓰는 짧은 이름 */
  label: string
  title: string
  /** 사용자 문제의 만화를 끝맺는 문장 */
  prompt: string
  color: string
}

/** 방에는 사용자가 등록한 문제만 걸린다. 서버의 방 목록과 맞춰야 한다. */
export const ARCADE_ROOMS: ArcadeRoomInfo[] = [
  {
    id: 'song',
    label: '노래 맞추기',
    title: '노래 맞추기 방',
    prompt: '(노래 가사) 어떤 노래일까요? 맞춰보세요!',
    color: '#FF7FA3',
  },
  {
    id: 'drama',
    label: '드라마 맞추기',
    title: '드라마·영화 맞추기 방',
    prompt: '(명대사) 어떤 작품일까요? 맞춰보세요!',
    color: '#5CC8F2',
  },
]

export function normalizeAnswer(value: string) {
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s.,!?·'"~-]/g, '')
}
