/** 함께 그리는 이젤의 규칙. 서버도 이 파일로 값을 확인하므로 다른 파일을 가져오지 않는다. */

/** 이젤이 있는 방 */
export const EASEL_ROOM = 'main'

/** 그림 좌표의 한 변. 점은 0~EASEL_SCALE 정수로 주고받는다. */
export const EASEL_SCALE = 1000

/** 붓 색. 0번은 종이색이라 지우개처럼 쓴다. */
export const EASEL_PALETTE = ['#FFFFFF', '#2F2F2F', '#E5484D', '#FF9B54', '#FFD97A', '#5BBF8A', '#4A90D9', '#8B6FE8'] as const
export const EASEL_COLOR_NAMES = ['지우개', '먹색', '빨강', '주황', '노랑', '초록', '파랑', '보라'] as const

/** 붓 굵기. 그림 좌표 기준이다. */
export const EASEL_SIZES = [6, 14, 32] as const
export const EASEL_SIZE_NAMES = ['가늘게', '보통', '굵게'] as const

/** 한 번에 보내는 선 조각의 최대 점 수와, 한 장에 그릴 수 있는 점 수 */
export const EASEL_MAX_SEGMENT_POINTS = 60
export const EASEL_MAX_POINTS = 20_000

/** 네컷 칸의 바깥 여백과 칸 사이 간격. 그림 좌표 기준이다. */
export const EASEL_FRAME_MARGIN = 30
export const EASEL_FRAME_GAP = 24

/** 선 조각 하나. c는 색 번호, w는 굵기 번호, p는 x, y가 번갈아 오는 점 목록이다. */
export type EaselSegment = { c: number; w: number; p: number[] }

/** 이젤 붓의 상태. holder가 null이면 붓은 바닥의 x, z에 있다. */
export type EaselBrush = { holder: number | null; x: number; z: number }

export function isEaselBrush(value: unknown): value is EaselBrush {
  if (typeof value !== 'object' || value === null) return false
  const brush = value as Record<string, unknown>
  return (brush.holder === null || typeof brush.holder === 'number') && typeof brush.x === 'number' && typeof brush.z === 'number'
}

/** 받은 선 조각을 확인해 허용된 값만 남긴다. 맞지 않으면 null. */
export function sanitizeSegment(value: unknown): EaselSegment | null {
  if (typeof value !== 'object' || value === null) return null
  const { c, w, p } = value as Record<string, unknown>
  if (!Number.isInteger(c) || (c as number) < 0 || (c as number) >= EASEL_PALETTE.length) return null
  if (!Number.isInteger(w) || (w as number) < 0 || (w as number) >= EASEL_SIZES.length) return null
  if (!Array.isArray(p) || p.length < 4 || p.length % 2 !== 0 || p.length > EASEL_MAX_SEGMENT_POINTS * 2) return null
  if (!p.every((n) => Number.isInteger(n) && n >= 0 && n <= EASEL_SCALE)) return null
  return { c: c as number, w: w as number, p: p as number[] }
}

export function segmentPoints(segment: EaselSegment) {
  return segment.p.length / 2
}
