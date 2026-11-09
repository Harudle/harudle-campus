import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { RelayEpisode } from '../data/relayEpisodes'
import type { RemoveResult } from '../data/userQuizzes'
import { RemoveControls } from './RemoveControls'
import { useModalDialog } from './useModalDialog'

const SWIPE_DISTANCE = 50

const NAV_BUTTON =
  'cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-2 font-display text-haru-600 transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 disabled:cursor-default disabled:opacity-40 pointer-coarse:min-h-11'

type RelayViewerModalProps = {
  episodes: RelayEpisode[]
  /** 열어 줄 화 번호. null이면 닫힌다. */
  startEpisode: number | null
  onDrawNext: () => void
  onRemove: (id: number, password: string) => Promise<RemoveResult>
  onReport: (id: number) => Promise<boolean>
  onClose: () => void
}

/** 1화부터 현재 화까지 넘겨 보는 뷰어. 버튼, 방향키, 밀기로 넘긴다. */
export function RelayViewerModal({ episodes, startEpisode, onDrawNext, onRemove, onReport, onClose }: RelayViewerModalProps) {
  const open = startEpisode !== null && episodes.length > 0
  const { dialogRef, contentRef } = useModalDialog(open)
  const titleId = useId()
  const [index, setIndex] = useState(0)
  const swipeStart = useRef<number | null>(null)
  const lastIndex = episodes.length - 1
  const episode = episodes[Math.min(index, lastIndex)]

  useEffect(() => {
    if (startEpisode !== null) setIndex(startEpisode - 1)
  }, [startEpisode])

  const go = (next: number) => setIndex(Math.min(Math.max(next, 0), lastIndex))

  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).tagName === 'INPUT') return
    if (event.key === 'ArrowLeft') go(index - 1)
    if (event.key === 'ArrowRight') go(index + 1)
  }

  const handlePointerUp = (event: PointerEvent) => {
    if (swipeStart.current === null) return
    const moved = event.clientX - swipeStart.current
    swipeStart.current = null
    if (Math.abs(moved) >= SWIPE_DISTANCE) go(index + (moved < 0 ? 1 : -1))
  }

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
          aria-label="뷰어 닫기"
          className="absolute top-3 right-3 z-10 grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-lg leading-none transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:size-11"
        >
          ✕
        </button>

        {episode && (
          <>
            <header className="pr-12" aria-live="polite">
              <p className="text-sm text-haru-800">
                현재 {episodes.length}화까지 · {episode.author} 작가
              </p>
              <h2 id={titleId} className="font-display text-2xl leading-tight text-haru-600 sm:text-3xl">
                {episode.number}화
              </h2>
            </header>

            <div
              className="mx-auto mt-3 max-w-md touch-pan-y select-none"
              onPointerDown={(event) => {
                swipeStart.current = event.clientX
              }}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                swipeStart.current = null
              }}
            >
              <img
                src={episode.imageUrl}
                alt={`${episode.number}화 네컷만화`}
                draggable={false}
                className="block aspect-square w-full border-[3px] border-ink bg-white object-contain"
              />
            </div>

            <nav aria-label="화 넘기기" className="mt-3 flex items-center justify-between gap-2">
              <button type="button" disabled={index === 0} onClick={() => go(index - 1)} className={NAV_BUTTON}>
                ← 이전 화
              </button>
              <span className="text-sm text-haru-800">
                {episode.number} / {episodes.length}
              </span>
              <button type="button" disabled={index >= lastIndex} onClick={() => go(index + 1)} className={NAV_BUTTON}>
                다음 화 →
              </button>
            </nav>

            <button
              type="button"
              onClick={onDrawNext}
              className="mt-4 block w-full cursor-pointer rounded-xl border-2 border-ink bg-[#FFD97A] px-5 py-3 text-center font-display text-xl text-ink shadow-[3px_3px_0_var(--color-ink)] transition hover:brightness-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
            >
              다음 화 이어 그리기
            </button>

            <div className="mt-2">
              <RemoveControls
                key={episode.id}
                removeLabel="이 화 내리기"
                onRemove={(password) => onRemove(episode.id, password)}
                onReport={() => onReport(episode.id)}
                onRemoved={() => {
                  if (episodes.length <= 1) onClose()
                  else setIndex((current) => Math.min(current, episodes.length - 2))
                }}
              />
            </div>
          </>
        )}
      </article>
    </dialog>
  )
}
