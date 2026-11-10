import { useCallback, useEffect, useId, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import {
  EASEL_COLOR_NAMES,
  EASEL_MAX_POINTS,
  EASEL_MAX_SEGMENT_POINTS,
  EASEL_PALETTE,
  EASEL_SCALE,
  EASEL_SIZE_NAMES,
  EASEL_SIZES,
  segmentPoints,
  type EaselSegment,
} from '../data/easel'
import type { EaselArt } from '../data/presence'
import { drawFrame, drawPaper, drawSegment } from '../scene/gallery/easelDrawing'
import { useModalDialog } from './useModalDialog'

const CANVAS_PIXELS = 1024
/** 그리는 중인 선을 이만큼마다 끊어서 보낸다. */
const FLUSH_MS = 60

type EaselCanvasModalProps = {
  open: boolean
  art: EaselArt
  color: number
  size: number
  onColorChange: (color: number) => void
  onSizeChange: (size: number) => void
  onDraw: (segment: EaselSegment) => void
  onFull: () => void
  onClear: () => void
  onClose: () => void
}

/**
 * 이젤 붓을 든 사람이 쓰는 네컷 그림판. 선은 그리는 대로 조금씩 서버에 보내므로, 종이에 맞아 창이 닫혀도 그린 그림은 이젤에 남는다.
 * 다른 사람이 그린 선과 새 종이도 바로 반영한다.
 */
export function EaselCanvasModal({ open, art, color, size, onColorChange, onSizeChange, onDraw, onFull, onClear, onClose }: EaselCanvasModalProps) {
  const { dialogRef, contentRef } = useModalDialog(open)
  const titleId = useId()
  const paper = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLCanvasElement>(null)
  /** 아직 보내지 않은 점. 첫 점은 앞 조각과 이어지도록 직전에 보낸 마지막 점이다. */
  const pending = useRef<number[]>([])
  const fresh = useRef(0)
  const drawing = useRef<{ pointerId: number } | null>(null)
  const brush = useRef({ color, size })
  brush.current = { color, size }
  /** 붓 굵기만 한 동그라미. 마우스를 따라다니며 어디에 얼마나 굵게 그려질지 미리 보여 준다. */
  const preview = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)

  const placePreview = useCallback(() => {
    const circle = preview.current
    const canvas = paper.current
    if (!circle || !canvas) return
    if (!pointer.current) {
      circle.style.display = 'none'
      return
    }
    const diameter = Math.max(4, (EASEL_SIZES[brush.current.size] / EASEL_SCALE) * canvas.getBoundingClientRect().width)
    circle.style.display = 'block'
    circle.style.width = `${diameter}px`
    circle.style.height = `${diameter}px`
    circle.style.backgroundColor = `${EASEL_PALETTE[brush.current.color]}99`
    circle.style.transform = `translate(${pointer.current.x - diameter / 2}px, ${pointer.current.y - diameter / 2}px)`
  }, [])

  const trackPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    placePreview()
  }

  // 색이나 굵기를 바꾸면 그 자리의 동그라미도 바로 바뀐다.
  useEffect(() => {
    placePreview()
  }, [color, size, placePreview])
  // 부모가 다시 그려져 함수가 바뀌어도 그리던 선이 끊기지 않도록 ref로 들고 있는다.
  const callbacks = useRef({ onDraw, onFull })
  callbacks.current = { onDraw, onFull }
  const segments = art.segments
  /** 그림판에 이미 그린 선 목록과 개수. 뒤에 붙은 선만 더 그리면 될 때를 알아본다. */
  const drawn = useRef<{ list: EaselSegment[] | null; count: number }>({ list: null, count: 0 })

  const flush = useCallback(
    (ending: boolean) => {
      const points = pending.current
      if (fresh.current > 0 && points.length >= 2) {
        const p = points.length === 2 ? [...points, ...points] : [...points]
        const segment: EaselSegment = { c: brush.current.color, w: brush.current.size, p }
        const used = segments.current.reduce((sum, item) => sum + segmentPoints(item), 0)
        if (used + segmentPoints(segment) > EASEL_MAX_POINTS) {
          callbacks.current.onFull()
          drawing.current = null
          pending.current = []
          fresh.current = 0
          return
        }
        callbacks.current.onDraw(segment)
      }
      pending.current = ending ? [] : points.slice(-2)
      fresh.current = 0
    },
    [segments],
  )

  // 선이 뒤에 붙기만 했으면 새 선만 그린다(내 선은 이미 그려져 있다). 새 종이처럼 통째로 바뀌면 처음부터 다시 그린다.
  useEffect(() => {
    const ctx = paper.current?.getContext('2d')
    if (!open || !ctx) {
      drawn.current = { list: null, count: 0 }
      return
    }
    const list = segments.current
    if (drawn.current.list === list && list.length >= drawn.current.count) {
      for (let index = drawn.current.count; index < list.length; index++) drawSegment(ctx, CANVAS_PIXELS, list[index])
    } else {
      drawPaper(ctx, CANVAS_PIXELS, list)
      if (pending.current.length >= 2) {
        drawSegment(ctx, CANVAS_PIXELS, { c: brush.current.color, w: brush.current.size, p: [...pending.current, ...pending.current.slice(-2)] })
      }
    }
    drawn.current = { list, count: list.length }
  }, [open, art, segments])

  useEffect(() => {
    const ctx = frame.current?.getContext('2d')
    if (!open || !ctx) return
    ctx.clearRect(0, 0, CANVAS_PIXELS, CANVAS_PIXELS)
    drawFrame(ctx, CANVAS_PIXELS)
  }, [open])

  // 그리는 동안 조금씩 보낸다. 창이 닫힐 때만(종이에 맞은 때도) 남은 선을 마저 보내고 선을 끝낸다.
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => {
      if (drawing.current) flush(false)
    }, FLUSH_MS)
    return () => {
      clearInterval(timer)
      if (drawing.current || fresh.current > 0) flush(true)
      drawing.current = null
    }
  }, [open, flush])

  const toPoint = (event: ReactPointerEvent<HTMLCanvasElement> | PointerEvent): [number, number] => {
    const rect = paper.current!.getBoundingClientRect()
    const clamp = (value: number) => Math.min(EASEL_SCALE, Math.max(0, Math.round(value)))
    return [clamp(((event.clientX - rect.left) / rect.width) * EASEL_SCALE), clamp(((event.clientY - rect.top) / rect.height) * EASEL_SCALE)]
  }

  const extend = (point: [number, number]) => {
    const ctx = paper.current?.getContext('2d')
    const points = pending.current
    const last = points.slice(-2)
    points.push(...point)
    fresh.current += 1
    if (ctx && last.length === 2) drawSegment(ctx, CANVAS_PIXELS, { c: brush.current.color, w: brush.current.size, p: [...last, ...point] })
    if (points.length / 2 >= EASEL_MAX_SEGMENT_POINTS) flush(false)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    trackPointer(event)
    if (drawing.current || event.button > 0) return
    // 캔버스 밖으로 나가도 선이 이어지도록 잡아 둔다. 잡을 수 없는 포인터여도 그리기는 이어간다.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 무시
    }
    drawing.current = { pointerId: event.pointerId }
    const point = toPoint(event)
    pending.current = [...point]
    fresh.current = 1
    const ctx = paper.current?.getContext('2d')
    if (ctx) drawSegment(ctx, CANVAS_PIXELS, { c: color, w: size, p: [...point, ...point] })
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    trackPointer(event)
    if (drawing.current?.pointerId !== event.pointerId) return
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
    for (const item of events.length > 0 ? events : [event.nativeEvent]) extend(toPoint(item))
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    // 손가락은 떼면 가리킨 곳이 없으므로 동그라미를 숨긴다.
    if (event.pointerType !== 'mouse') hidePreview()
    if (drawing.current?.pointerId !== event.pointerId) return
    flush(true)
    drawing.current = null
  }

  const hidePreview = () => {
    pointer.current = null
    placePreview()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="scoop-dialog"
      style={{ animation: 'none', width: 'min(640px, calc(100% - 1rem))' }}
      onClose={onClose}
    >
      <section ref={contentRef} tabIndex={-1} className="flex flex-col gap-3 p-3 outline-none sm:p-4">
        <header className="flex items-center gap-2">
          <h2 id={titleId} className="min-w-0 flex-1 font-display text-2xl leading-none text-haru-600">
            네컷 그림판
          </h2>
          <p className="hidden text-sm text-haru-800 sm:block">다 같이 그리는 그림이에요</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="그림판 닫기"
            className="grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-lg leading-none transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:size-11"
          >
            ✕
          </button>
        </header>

        <div className="relative mx-auto aspect-square w-full max-w-[min(100%,62dvh)] touch-none select-none overflow-hidden rounded-md border-2 border-ink">
          <canvas
            ref={paper}
            width={CANVAS_PIXELS}
            height={CANVAS_PIXELS}
            aria-label="네컷 그림판. 끌어서 그려요."
            className="absolute inset-0 size-full cursor-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onPointerLeave={hidePreview}
          />
          <canvas ref={frame} width={CANVAS_PIXELS} height={CANVAS_PIXELS} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />
          <div
            ref={preview}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 hidden rounded-full border-2 border-ink/70 shadow-[0_0_0_1px_white]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <div role="radiogroup" aria-label="붓 색" className="flex flex-wrap justify-center gap-1.5">
            {EASEL_PALETTE.map((value, index) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={color === index}
                aria-label={EASEL_COLOR_NAMES[index]}
                onClick={() => onColorChange(index)}
                className={`grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink text-xs transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 ${color === index ? 'scale-110 ring-3 ring-haru-500 ring-offset-2' : ''}`}
                style={{ backgroundColor: value }}
              >
                {index === 0 ? '지움' : ''}
              </button>
            ))}
          </div>
          <span aria-hidden="true" className="h-7 w-0.5 bg-haru-200" />
          <div role="radiogroup" aria-label="붓 굵기" className="flex gap-1.5">
            {EASEL_SIZES.map((value, index) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={size === index}
                aria-label={EASEL_SIZE_NAMES[index]}
                onClick={() => onSizeChange(index)}
                className={`grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 ${size === index ? 'bg-haru-100 ring-3 ring-haru-500 ring-offset-2' : ''}`}
              >
                <span className="rounded-full bg-ink" style={{ width: 4 + index * 5, height: 4 + index * 5 }} />
              </button>
            ))}
          </div>
          <span aria-hidden="true" className="h-7 w-0.5 bg-haru-200" />
          <button type="button" onClick={onClear} className="min-h-9 cursor-pointer rounded-full border-2 border-ink bg-white px-3 text-sm hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600">
            새 종이
          </button>
          <button type="button" onClick={onClose} className="min-h-9 cursor-pointer rounded-full border-2 border-ink bg-haru-600 px-4 font-display text-white hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600">
            다 그렸어요
          </button>
        </div>
      </section>
    </dialog>
  )
}
