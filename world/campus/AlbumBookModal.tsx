// 14층 작가 작품 앨범북: 작가 벽에는 두 편만 걸리므로, 그 작가가 받은 피드의 만화를 모두 책처럼 펼쳐 넘겨 본다.
// 한 번에 두 쪽(좁은 화면은 한 쪽)씩 넘기고, 모아 보기로 전체를 작게 본다. 만화를 누르면 크게 보기(ArtworkModal)로 연다.
import { useEffect, useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { ArtistZone, GalleryStatus, GalleryWork } from '../src/data/galleryWorks'
import { ArtworkModal } from '../src/ui/ArtworkModal'
import { useModalDialog } from '../src/ui/useModalDialog'

const SWIPE_DISTANCE = 50
const NAV_BUTTON =
  'cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-2 font-display text-haru-600 transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 disabled:cursor-default disabled:opacity-40 pointer-coarse:min-h-11'

/** 좁은 화면(휴대폰)에서는 한 쪽씩 본다 */
function usePerSpread() {
  const query = '(min-width: 640px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const onChange = () => setWide(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [])
  return wide ? 2 : 1
}

function Page({ work, number, side, onOpen }: { work: GalleryWork | undefined; number: number; side: 'left' | 'right'; onOpen: (work: GalleryWork) => void }) {
  const edge = side === 'left' ? 'rounded-l-xl border-r-0 shadow-[inset_-18px_0_18px_-14px_rgb(43_33_64/0.35)]' : 'rounded-r-xl shadow-[inset_18px_0_18px_-14px_rgb(43_33_64/0.35)]'
  return (
    <div className={`flex min-w-0 flex-1 flex-col border-[3px] border-ink bg-[#FFFBF2] p-3 sm:p-4 ${edge}`}>
      {work ? (
        <>
          <button
            type="button"
            onClick={() => onOpen(work)}
            aria-label={`${number}번째 만화 크게 보기`}
            className="block cursor-zoom-in border-2 border-ink bg-white p-1 shadow-[3px_3px_0_var(--color-ink)] transition hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
          >
            <img src={work.imageUrl} alt={`${work.nickname} 님의 네 컷 만화`} loading="lazy" className="block aspect-square w-full object-contain" />
          </button>
          <p className="mt-2 flex items-center justify-between text-sm text-haru-800">
            <span>{work.category}</span>
            <span>
              ♥ {work.likeCount} · 💬 {work.commentCount}
            </span>
          </p>
          <p className={`mt-auto pt-1 text-xs text-haru-800/70 ${side === 'left' ? 'text-left' : 'text-right'}`}>{number}</p>
        </>
      ) : (
        <p className="grid flex-1 place-items-center py-10 text-center font-display text-haru-800/60">끝</p>
      )}
    </div>
  )
}

type AlbumBookModalProps = {
  zone: ArtistZone | null
  name: string
  status: GalleryStatus
  onClose: () => void
}

export function AlbumBookModal({ zone, name, status, onClose }: AlbumBookModalProps) {
  const [viewing, setViewing] = useState<GalleryWork | null>(null)
  const { dialogRef, contentRef } = useModalDialog(!viewing)
  const titleId = useId()
  const perSpread = usePerSpread()
  const [first, setFirst] = useState(0)
  const [grid, setGrid] = useState(false)
  const [swipeStart, setSwipeStart] = useState<number | null>(null)
  const works = zone?.works ?? []
  const lastFirst = Math.max(0, Math.ceil(works.length / perSpread) * perSpread - perSpread)
  const start = Math.min(first - (first % perSpread), lastFirst)

  const go = (next: number) => setFirst(Math.min(Math.max(next, 0), lastFirst))
  const handleKeyDown = (event: KeyboardEvent) => {
    if (grid) return
    if (event.key === 'ArrowLeft') go(start - perSpread)
    if (event.key === 'ArrowRight') go(start + perSpread)
  }
  const handlePointerUp = (event: PointerEvent) => {
    if (swipeStart === null) return
    const moved = event.clientX - swipeStart
    setSwipeStart(null)
    if (Math.abs(moved) >= SWIPE_DISTANCE) go(start + (moved < 0 ? perSpread : -perSpread))
  }

  if (viewing) return <ArtworkModal work={viewing} onClose={() => setViewing(null)} />

  const pageNumbers = `${start + 1}${perSpread > 1 && start + 2 <= works.length ? `–${start + 2}` : ''} / ${works.length}`

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="scoop-dialog"
      style={{ animation: 'none', width: 'min(900px, calc(100% - 2rem))' }}
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
          aria-label="앨범 닫기"
          className="absolute top-3 right-3 z-10 grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-lg leading-none transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:size-11"
        >
          ✕
        </button>

        <header className="flex flex-wrap items-end justify-between gap-2 pr-12">
          <div>
            <p className="text-sm text-haru-800">작가 작품 앨범북</p>
            <h2 id={titleId} className="font-display text-2xl leading-tight text-haru-600 sm:text-3xl">
              {zone?.nickname ?? name} 작가의 만화
            </h2>
            {zone && (
              <p className="text-sm text-haru-800">
                {zone.totalWorks}편 · 받은 좋아요 {zone.totalLikes}
              </p>
            )}
          </div>
          {works.length > perSpread && (
            <button type="button" onClick={() => setGrid(!grid)} aria-pressed={grid} className={NAV_BUTTON}>
              {grid ? '책으로 보기' : '모아 보기'}
            </button>
          )}
        </header>

        {!zone && (
          <p className="py-16 text-center text-haru-800">
            {status === 'loading' ? '앨범을 펴는 중이에요…' : '이 작가의 만화를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'}
          </p>
        )}

        {zone && grid && (
          <ul className="mt-4 grid max-h-[65vh] grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-5" aria-label="모든 만화">
            {works.map((work, index) => (
              <li key={work.id}>
                <button
                  type="button"
                  onClick={() => {
                    setGrid(false)
                    go(index)
                  }}
                  aria-label={`${index + 1}번째 쪽으로 펼치기`}
                  className="block w-full cursor-pointer border-2 border-ink bg-white p-0.5 transition hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
                >
                  <img src={work.imageUrl} alt="" loading="lazy" className="block aspect-square w-full object-contain" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {zone && !grid && (
          <>
            <div
              className="mt-4 flex touch-pan-y select-none rounded-2xl bg-[#7355DA] p-2 shadow-[5px_5px_0_var(--color-ink)] sm:p-3"
              onPointerDown={(event) => setSwipeStart(event.clientX)}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => setSwipeStart(null)}
              aria-live="polite"
            >
              {perSpread === 1 ? (
                <Page work={works[start]} number={start + 1} side="right" onOpen={setViewing} />
              ) : (
                <>
                  <Page work={works[start]} number={start + 1} side="left" onOpen={setViewing} />
                  <Page work={works[start + 1]} number={start + 2} side="right" onOpen={setViewing} />
                </>
              )}
            </div>
            <nav aria-label="쪽 넘기기" className="mt-4 flex items-center justify-between gap-2">
              <button type="button" disabled={start === 0} onClick={() => go(start - perSpread)} className={NAV_BUTTON}>
                ← 앞 장
              </button>
              <span className="text-sm text-haru-800">{pageNumbers}</span>
              <button type="button" disabled={start >= lastFirst} onClick={() => go(start + perSpread)} className={NAV_BUTTON}>
                다음 장 →
              </button>
            </nav>
          </>
        )}
      </article>
    </dialog>
  )
}
