import { useMemo, useState } from 'react'
import { RoundedBox, useCursor } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { UserQuiz } from '../../data/userQuizzes'
import { COLORS, FONT_DISPLAY } from '../../lib/brand'
import { useWorkTexture } from '../gallery/Artwork'
import { Toon } from '../toon'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'
import { isShown } from '../visibility'

const SIZE = 3.4
const CENTER_Y = 2.95

const drawLoading: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.lavender100
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${h * 0.09}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('만화를 걸고 있어요', w / 2, h / 2)
}

const drawEmpty: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = '#3B2F7A'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = COLORS.lavender300
  ctx.lineWidth = 6
  ctx.setLineDash([22, 16])
  ctx.strokeRect(14, 14, w - 28, h - 28)
  ctx.setLineDash([])
  ctx.fillStyle = COLORS.lavender100
  ctx.font = `${h * 0.1}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('내 문제를', w / 2, h * 0.43)
  ctx.fillText('걸어 보세요', w / 2, h * 0.57)
}

function plateText(quiz: UserQuiz) {
  if (quiz.solverCount === 0) return `${quiz.author} 작가 문제 · 첫 정답자는?`
  const [latest] = quiz.solvers
  return quiz.solverCount === 1 ? `맞힌 사람: ${latest}` : `맞힌 사람: ${latest} 외 ${quiz.solverCount - 1}명`
}

function useClickable(disabled: boolean, onOpen: () => void) {
  const [hovered, setHovered] = useState(false)
  const active = hovered && !disabled
  useCursor(active)
  return {
    active,
    handlers: {
      onPointerOver: (event: ThreeEvent<PointerEvent>) => {
        if (!isShown(event.eventObject)) return
        event.stopPropagation()
        if (event.pointerType === 'mouse') setHovered(true)
      },
      onPointerOut: () => setHovered(false),
      onClick: (event: ThreeEvent<MouseEvent>) => {
        if (!isShown(event.eventObject)) return
        event.stopPropagation()
        if (event.delta > 6 || disabled) return
        onOpen()
      },
    },
  }
}

/** 사용자가 등록한 문제 만화. 아래 명패에 맞힌 사람이 뜬다. */
export function UserQuizFrame({ quiz, x, color, disabled, onOpen }: {
  quiz: UserQuiz
  x: number
  color: string
  disabled: boolean
  onOpen: () => void
}) {
  const { active, handlers } = useClickable(disabled, onOpen)
  const work = useWorkTexture(quiz.imageUrl)
  const loading = useCanvasTexture(drawLoading, 256, 256)
  const text = plateText(quiz)
  const drawPlate = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      ctx.fillStyle = COLORS.paper
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = COLORS.primaryDeep
      let size = h * 0.6
      ctx.font = `${size}px ${FONT_DISPLAY}`
      while (size > 12 && ctx.measureText(text).width > w * 0.94) {
        size -= 2
        ctx.font = `${size}px ${FONT_DISPLAY}`
      }
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, w / 2, h / 2)
    },
    [text],
  )
  const plate = useCanvasTexture(drawPlate, 640, 80)

  return (
    <group position={[x, CENTER_Y, 0.03]} scale={active ? 1.03 : 1}>
      <RoundedBox args={[SIZE + 0.3, SIZE + 0.3, 0.12]} radius={0.05} castShadow>
        <Toon color={color} />
      </RoundedBox>
      <mesh position-z={0.07} {...handlers}>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshBasicMaterial map={work ?? loading} toneMapped={false} />
      </mesh>
      <mesh position={[0, -SIZE / 2 - 0.38, 0.04]}>
        <planeGeometry args={[3.7, 0.46]} />
        <meshBasicMaterial map={plate} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** 아직 문제가 걸리지 않은 자리. 누르면 등록 화면이 열린다. */
export function EmptyQuizFrame({ x, disabled, onOpen }: { x: number; disabled: boolean; onOpen: () => void }) {
  const { handlers, active } = useClickable(disabled, onOpen)
  const texture = useCanvasTexture(drawEmpty, 256, 256)
  return (
    <group position={[x, CENTER_Y, 0.03]} scale={active ? 1.03 : 1}>
      <mesh {...handlers}>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}
