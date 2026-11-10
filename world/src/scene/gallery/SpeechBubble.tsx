import { useMemo } from 'react'
import { Billboard } from '@react-three/drei'
import { COLORS, FONT_BODY } from '../../lib/brand'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'

const BUBBLE_Y = 3.2
const PLANE_WIDTH = 3.4
const TEXTURE_WIDTH = 544
const TEXTURE_HEIGHT = 232
const FONT_SIZE = 32
const LINE_HEIGHT = 42
const PADDING = 22
const TAIL_HEIGHT = 20
const MAX_LINES = 3

/** 글자 단위로 줄을 나눈다. 넘치는 뒷부분은 말줄임표로 줄이고, 전체 문장은 채팅창에서 본다. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  let line = ''
  const characters = [...text]
  for (let index = 0; index < characters.length; index += 1) {
    const next = line + characters[index]
    if (ctx.measureText(next).width <= maxWidth) {
      line = next
      continue
    }
    if (lines.length === MAX_LINES - 1) {
      while (line && ctx.measureText(`${line}…`).width > maxWidth) line = [...line].slice(0, -1).join('')
      lines.push(`${line}…`)
      return lines
    }
    lines.push(line)
    line = characters[index]
  }
  lines.push(line)
  return lines
}

/** 채팅을 보내면 잠깐 뜨는 머리 위 말풍선. 이름표 위에 놓인다. */
export function SpeechBubble({ text }: { text: string }) {
  const draw = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      ctx.font = `${FONT_SIZE}px ${FONT_BODY}`
      const lines = wrapText(ctx, text, w - PADDING * 2 - 8)
      const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width))
      const boxWidth = Math.min(textWidth + PADDING * 2, w - 8)
      const boxHeight = lines.length * LINE_HEIGHT + PADDING
      const left = (w - boxWidth) / 2
      const top = h - TAIL_HEIGHT - boxHeight - 3

      ctx.beginPath()
      ctx.roundRect(left, top, boxWidth, boxHeight, 18)
      ctx.moveTo(w / 2 - 12, top + boxHeight)
      ctx.lineTo(w / 2, top + boxHeight + TAIL_HEIGHT)
      ctx.lineTo(w / 2 + 12, top + boxHeight)
      ctx.fillStyle = COLORS.paper
      ctx.strokeStyle = COLORS.ink
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fill()

      ctx.fillStyle = COLORS.ink
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      lines.forEach((line, index) => {
        ctx.fillText(line, w / 2, top + PADDING / 2 + LINE_HEIGHT * (index + 0.5))
      })
    },
    [text],
  )
  const texture = useCanvasTexture(draw, TEXTURE_WIDTH, TEXTURE_HEIGHT)

  return (
    <Billboard position-y={BUBBLE_Y}>
      <mesh renderOrder={2}>
        <planeGeometry args={[PLANE_WIDTH, (PLANE_WIDTH * TEXTURE_HEIGHT) / TEXTURE_WIDTH]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </Billboard>
  )
}
