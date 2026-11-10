import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { EaselSegment } from '../data/easel'
import { fetchEaselPage, fetchEaselPages, type EaselPageInfo } from '../data/easelPages'
import { drawFrame, drawPaper } from '../scene/gallery/easelDrawing'
import { useModalDialog } from './useModalDialog'

const CANVAS_PIXELS = 1024
const SWIPE_DISTANCE = 50

const NAV_BUTTON =
  'cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-2 font-display text-haru-600 transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 disabled:cursor-default disabled:opacity-40 pointer-coarse:min-h-11'

const DATE_FORMAT = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

type SketchbookModalProps = {
  open: boolean
  onClose: () => void
}

type PageState = { id: number; segments: EaselSegment[] | null; failed: boolean }

/** 이젤에서 새 종이로 넘긴 지난 그림들을 넘겨 보는 스케치북. 가장 최근 장부터 열고, 버튼, 방향키, 밀기로 넘긴다. */
export function SketchbookModal({ open, onClose }: SketchbookModalProps) {
  const { dialogRef, contentRef } = useModalDialog(open)
  const titleId = useId()
  const [pages, setPages] = useState<EaselPageInfo[] | null>(null)
  const [listFailed, setListFailed] = useState(false)
  const [index, setIndex] = useState(0)
  const [page, setPage] = useState<PageState | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const swipeStart = useRef<number | null>(null)
  const lastIndex = (pages?.length ?? 0) - 1
  const current = pages?.[index]

  // 열 때마다 목록을 새로 받아 다른 사람이 방금 넘긴 장도 보이게 한다.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setPages(null)
    setListFailed(false)
    fetchEaselPages().then((items) => {
      if (cancelled) return
      if (!items) setListFailed(true)
      else {
        setPages(items)
        setIndex(Math.max(items.length - 1, 0))
      }
    })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!current) return
    const controller = new AbortController()
    setPage({ id: current.id, segments: null, failed: false })
    fetchEaselPage(current.id, controller.signal).then((segments) => {
      if (!controller.signal.aborted) setPage({ id: current.id, segments, failed: segments === null })
    })
    return () => controller.abort()
  }, [current])

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx || !page?.segments) return
    drawPaper(ctx, CANVAS_PIXELS, page.segments)
    drawFrame(ctx, CANVAS_PIXELS)
  }, [page])

  const go = (next: number) => setIndex(Math.min(Math.max(next, 0), lastIndex))

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') go(index - 1)
    if (event.key === 'ArrowRight') go(index + 1)
  }

  const handlePointerUp = (event: PointerEvent) => {
    if (swipeStart.current === null) return
    const moved = event.clientX - swipeStart.current
    swipeStart.current = null
    if (Math.abs(moved) >= SWIPE_DISTANCE) go(index + (moved < 0 ? 1 : -1))
  }

  const loading = page?.id === current?.id && page?.segments === null && !page?.failed

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="scoop-dialog"
      style={{ animation: 'none', width: 'min(620px, calc(100% - 2rem))' }}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <article ref={contentRef} tabIndex={-1} className="relative p-4 outline-none sm:p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="스케치북 닫기"
          className="absolute top-3 right-3 z-10 grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-lg leading-none transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:size-11"
        >
          ✕
        </button>

        <header className="pr-12" aria-live="polite">
          <p className="text-sm text-haru-800">{current ? `${DATE_FORMAT.format(current.at)}에 넘긴 장` : '다 같이 그린 지난 그림'}</p>
          <h2 id={titleId} className="font-display text-2xl leading-tight text-haru-600 sm:text-3xl">
            {current ? `스케치북 ${index + 1}쪽` : '스케치북'}
          </h2>
        </header>

        {pages === null && (
          <p className="py-16 text-center text-haru-800">{listFailed ? '스케치북을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.' : '스케치북을 펴는 중이에요…'}</p>
        )}
        {pages?.length === 0 && (
          <p className="py-16 text-center text-haru-800">아직 넘긴 장이 없어요. 이젤에서 새 종이를 누르면 그때까지의 그림이 여기에 남아요.</p>
        )}

        {current && (
          <>
            <div
              className="relative mx-auto mt-3 aspect-square max-w-md touch-pan-y select-none overflow-hidden rounded-md border-[3px] border-ink bg-white"
              onPointerDown={(event) => {
                swipeStart.current = event.clientX
              }}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                swipeStart.current = null
              }}
            >
              <canvas
                ref={canvas}
                width={CANVAS_PIXELS}
                height={CANVAS_PIXELS}
                role="img"
                aria-label={`스케치북 ${index + 1}쪽 네컷 그림`}
                className={`block size-full transition-opacity ${page?.segments && page.id === current.id ? '' : 'opacity-0'}`}
              />
              {(loading || page?.failed) && (
                <p className="absolute inset-0 grid place-items-center text-haru-800">{page?.failed ? '이 장을 불러오지 못했어요' : '넘기는 중…'}</p>
              )}
            </div>

            <nav aria-label="쪽 넘기기" className="mt-3 flex items-center justify-between gap-2">
              <button type="button" disabled={index === 0} onClick={() => go(index - 1)} className={NAV_BUTTON}>
                ← 이전 장
              </button>
              <span className="text-sm text-haru-800">
                {index + 1} / {pages?.length}
              </span>
              <button type="button" disabled={index >= lastIndex} onClick={() => go(index + 1)} className={NAV_BUTTON}>
                다음 장 →
              </button>
            </nav>
          </>
        )}
      </article>
    </dialog>
  )
}
