import { useEffect, useMemo, useRef, useState } from 'react'
import { Billboard, RoundedBox, useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Cheer } from '../../data/cheers'
import { COLORS, FONT_BODY, FONT_DISPLAY, noteColor } from '../../lib/brand'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { Toon } from '../toon'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'

const BOARD_WIDTH = 3.9
const BOARD_HEIGHT = 2.4
const BOARD_Y = 1.8
const NOTE_COLUMNS = 3
const NOTE_ROWS = 2
const NOTE_COUNT = NOTE_COLUMNS * NOTE_ROWS
const NOTE_TILTS = [-0.03, 0.025, -0.015, 0.03, -0.025, 0.015]
const TEXTURE_WIDTH = 1024
const TEXTURE_HEIGHT = Math.round((TEXTURE_WIDTH * BOARD_HEIGHT) / BOARD_WIDTH)
const MESSAGE_LINES = 3
const SHUFFLE_INTERVAL_MS = 10_000

/** 게시판이 넘치면 무작위로 고른다. 방금 올라온 글이 바로 보이도록 처음에는 최신 글을 끼운다. */
function pickNotes(cheers: Cheer[], keepNewest: boolean) {
  if (cheers.length <= NOTE_COUNT) return cheers
  const pool = keepNewest ? cheers.slice(1) : [...cheers]
  for (let index = pool.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[pool[index], pool[other]] = [pool[other], pool[index]]
  }
  return keepNewest ? [cheers[0], ...pool.slice(0, NOTE_COUNT - 1)] : pool.slice(0, NOTE_COUNT)
}

/** 한글은 띄어쓰기가 드물어도 끊을 수 있어서 글자 단위로 줄을 나누고, 넘치면 말줄임표를 붙인다. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = []
  let line = ''
  for (const char of text.replace(/\s+/g, ' ')) {
    if (ctx.measureText(line + char).width <= maxWidth) {
      line += char
      continue
    }
    if (lines.length === maxLines - 1) {
      while (line.length > 1 && ctx.measureText(`${line}…`).width > maxWidth) line = [...line].slice(0, -1).join('')
      lines.push(`${line}…`)
      return lines
    }
    lines.push(line)
    line = char.trimStart()
  }
  if (line) lines.push(line)
  return lines
}

function drawNote(ctx: CanvasRenderingContext2D, cheer: Cheer | undefined, width: number, height: number, isFirst: boolean) {
  ctx.shadowColor = 'rgba(43, 33, 64, 0.3)'
  ctx.shadowOffsetX = 3
  ctx.shadowOffsetY = 5
  ctx.shadowBlur = 4
  ctx.fillStyle = cheer ? noteColor(cheer.id) : 'rgba(255, 255, 255, 0.28)'
  ctx.fillRect(0, 0, width, height)
  ctx.shadowColor = 'transparent'

  const padding = width * 0.08
  const textWidth = width - padding * 2
  const lineHeight = height * 0.2
  const fontSize = height * 0.165
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = COLORS.ink

  if (!cheer) {
    if (!isFirst) return
    ctx.font = `${fontSize}px ${FONT_DISPLAY}`
    ctx.fillStyle = '#ffffff'
    wrapText(ctx, '눌러서 응원을 남겨 주세요', textWidth, MESSAGE_LINES + 1).forEach((text, index) =>
      ctx.fillText(text, padding, padding + index * lineHeight),
    )
    return
  }

  ctx.font = `${fontSize}px ${FONT_BODY}`
  wrapText(ctx, cheer.message, textWidth, MESSAGE_LINES).forEach((text, index) =>
    ctx.fillText(text, padding, padding + index * lineHeight),
  )
  ctx.font = `${fontSize * 0.86}px ${FONT_DISPLAY}`
  ctx.fillStyle = COLORS.primaryDeep
  wrapText(ctx, cheer.nickname, textWidth, 1).forEach((text) => ctx.fillText(text, padding, height - padding - fontSize))
}

const drawSign: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.primaryDeep
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#ffffff'
  ctx.font = `${h * 0.56}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('응원 방명록', w / 2, h / 2 + h * 0.03)
}

/** 작가 방 입구 앞의 게시판. 최신 응원글이 포스트잇으로 붙어 있고, 누르면 전체를 보고 남길 수 있다. */
export function CheerStand({ x, z, rotationY, cheers, count, paused, onOpen }: {
  x: number
  z: number
  rotationY: number
  cheers: Cheer[]
  count: number
  paused: boolean
  onOpen: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const lifted = useRef<THREE.Group>(null)
  const reducedMotion = usePrefersReducedMotion()
  const [shown, setShown] = useState(() => pickNotes(cheers, true))
  const sign = useCanvasTexture(drawSign, 512, 112)
  const drawCount = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      // 뒤에 걸린 작품 위에서도 읽히도록 흰 바탕을 깐다.
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(0, 0, w, h, h / 2)
      ctx.fill()
      ctx.fillStyle = COLORS.primaryDeep
      ctx.font = `${h * 0.6}px ${FONT_DISPLAY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(count > 0 ? `응원 ${count}개` : '첫 응원을 남겨요', w / 2, h / 2 + h * 0.03)
    },
    [count],
  )
  const countText = useCanvasTexture(drawCount, 512, 96)
  const drawNotes = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      const cellWidth = w / NOTE_COLUMNS
      const cellHeight = h / NOTE_ROWS
      for (let index = 0; index < NOTE_COUNT; index++) {
        const noteWidth = cellWidth * 0.92
        const noteHeight = cellHeight * 0.9
        ctx.save()
        ctx.translate((index % NOTE_COLUMNS + 0.5) * cellWidth, (Math.floor(index / NOTE_COLUMNS) + 0.5) * cellHeight)
        ctx.rotate(NOTE_TILTS[index])
        ctx.translate(-noteWidth / 2, -noteHeight / 2)
        drawNote(ctx, shown[index], noteWidth, noteHeight, index === 0)
        ctx.restore()
      }
    },
    [shown],
  )
  const notes = useCanvasTexture(drawNotes, TEXTURE_WIDTH, TEXTURE_HEIGHT)
  const active = hovered && !paused

  useCursor(active)

  // 다 차면 일정 시간마다 다른 글로 바꿔 붙여서 더 많은 응원이 보이게 한다.
  useEffect(() => {
    setShown(pickNotes(cheers, true))
    if (cheers.length <= NOTE_COUNT || reducedMotion) return
    const timer = setInterval(() => setShown(pickNotes(cheers, false)), SHUFFLE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [cheers, reducedMotion])

  useFrame((_, delta) => {
    if (!lifted.current) return
    const scale = THREE.MathUtils.damp(lifted.current.scale.x, active ? 1.05 : 1, 12, delta)
    lifted.current.scale.setScalar(scale)
  })

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.delta > 6 || paused) return
    onOpen()
  }

  return (
    <group position={[x, 0, z]} rotation-y={rotationY}>
      <group ref={lifted}>
        {[-1.6, 1.6].map((legX) => (
          <mesh key={legX} position={[legX, 0.4, 0]} castShadow>
            <boxGeometry args={[0.14, 0.8, 0.14]} />
            <Toon color={COLORS.paper} outlineThickness={1.2} />
          </mesh>
        ))}
        <RoundedBox args={[BOARD_WIDTH + 0.2, BOARD_HEIGHT + 0.2, 0.1]} radius={0.04} position-y={BOARD_Y} castShadow>
          <Toon color={COLORS.primary} />
        </RoundedBox>
        <mesh position={[0, BOARD_Y, 0.06]}>
          <planeGeometry args={[BOARD_WIDTH, BOARD_HEIGHT]} />
          <meshBasicMaterial map={notes} transparent toneMapped={false} />
        </mesh>
        <mesh position={[0, BOARD_Y + BOARD_HEIGHT / 2 + 0.3, 0.02]}>
          <planeGeometry args={[2.1, 0.46]} />
          <meshBasicMaterial map={sign} toneMapped={false} />
        </mesh>
      </group>
      <Billboard position={[0, BOARD_Y + BOARD_HEIGHT / 2 + 0.85, 0]}>
        <mesh>
          <planeGeometry args={[2.4, 0.45]} />
          <meshBasicMaterial map={countText} transparent toneMapped={false} />
        </mesh>
      </Billboard>
      {/* 손가락으로도 누르기 쉽게 게시판보다 넉넉한 판정 상자 */}
      <mesh
        position={[0, 2.05, 0]}
        onPointerOver={(event) => {
          event.stopPropagation()
          if (event.pointerType === 'mouse') setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
      >
        <boxGeometry args={[4.6, 4.1, 1.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
