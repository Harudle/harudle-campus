import { EASEL_FRAME_GAP, EASEL_FRAME_MARGIN, EASEL_PALETTE, EASEL_SCALE, EASEL_SIZES, type EaselSegment } from '../../data/easel'
import { COLORS } from '../../lib/brand'

const PANEL = (EASEL_SCALE - EASEL_FRAME_MARGIN * 2 - EASEL_FRAME_GAP) / 2
const FRAME_LINE = 6

/** 네컷 칸 네 개의 그림 좌표 [x, y, 한 변] */
export const EASEL_PANELS = [0, 1, 2, 3].map((index) => [
  EASEL_FRAME_MARGIN + (index % 2) * (PANEL + EASEL_FRAME_GAP),
  EASEL_FRAME_MARGIN + Math.floor(index / 2) * (PANEL + EASEL_FRAME_GAP),
  PANEL,
])

/** 선 조각 하나를 size 픽셀 크기 캔버스에 그린다. */
export function drawSegment(ctx: CanvasRenderingContext2D, size: number, segment: EaselSegment) {
  const scale = size / EASEL_SCALE
  ctx.strokeStyle = EASEL_PALETTE[segment.c] ?? COLORS.charcoal
  ctx.lineWidth = (EASEL_SIZES[segment.w] ?? EASEL_SIZES[1]) * scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(segment.p[0] * scale, segment.p[1] * scale)
  for (let index = 2; index < segment.p.length; index += 2) ctx.lineTo(segment.p[index] * scale, segment.p[index + 1] * scale)
  // 길이가 0인 선도 점으로 보이게 아주 조금 움직인다.
  if (segment.p.length === 4 && segment.p[0] === segment.p[2] && segment.p[1] === segment.p[3]) ctx.lineTo(segment.p[0] * scale + 0.01, segment.p[1] * scale)
  ctx.stroke()
}

/** 흰 종이 위에 지금까지의 선을 모두 그린다. */
export function drawPaper(ctx: CanvasRenderingContext2D, size: number, segments: readonly EaselSegment[]) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  for (const segment of segments) drawSegment(ctx, size, segment)
}

/** 칸 밖 여백을 덮고 칸 테두리를 그린다. 선 위에 얹어서 그림이 네 칸 안에만 보이게 한다. */
export function drawFrame(ctx: CanvasRenderingContext2D, size: number) {
  const scale = size / EASEL_SCALE
  const gutter = new Path2D()
  gutter.rect(0, 0, size, size)
  for (const [x, y, side] of EASEL_PANELS) gutter.rect(x * scale, y * scale, side * scale, side * scale)
  ctx.fillStyle = COLORS.paper
  ctx.fill(gutter, 'evenodd')
  ctx.strokeStyle = COLORS.charcoal
  ctx.lineWidth = FRAME_LINE * scale
  for (const [x, y, side] of EASEL_PANELS) ctx.strokeRect(x * scale, y * scale, side * scale, side * scale)
}
