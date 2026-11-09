import { useId } from 'react'
import type { GalleryWork } from '../data/galleryWorks'
import { HARUDLE_URL } from '../lib/brand'
import { CharacterFace } from './CharacterFace'
import { useModalDialog } from './useModalDialog'

const postedDate = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeZone: 'Asia/Seoul' })

type ArtworkModalProps = {
  work: GalleryWork | null
  onClose: () => void
}

export function ArtworkModal({ work, onClose }: ArtworkModalProps) {
  const { dialogRef, contentRef } = useModalDialog(Boolean(work))
  const titleId = useId()

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="scoop-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      {work && (
        <article ref={contentRef} tabIndex={-1} className="relative p-4 outline-none sm:p-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="작품 닫기"
            className="absolute top-3 right-3 z-10 grid size-9 pointer-coarse:size-11 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-lg leading-none transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
          >
            ✕
          </button>
          <div className="grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <section className="contents md:flex md:flex-col">
              <div className="order-1 pr-10 md:order-none md:pr-0">
                <p className="font-display text-lg text-haru-600">하루들 전시관</p>
                <h2 id={titleId} className="mt-1 font-display text-3xl leading-tight text-ink">
                  {work.nickname} 작가의 만화
                </h2>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t-2 border-ink pt-3">
                  <dt className="text-haru-800">분야</dt>
                  <dd>{work.category}</dd>
                  <dt className="text-haru-800">전시 반응</dt>
                  <dd>
                    좋아요 {work.likeCount}개 · 댓글 {work.commentCount}개
                  </dd>
                  <dt className="text-haru-800">게시일</dt>
                  <dd>{postedDate.format(new Date(work.publishedAt))}</dd>
                </dl>
                <p className="mt-4 flex items-center gap-2 rounded-xl bg-haru-100 px-3 py-2 text-sm">
                  <CharacterFace kind="doodle" className="size-9 shrink-0" />
                  <span>두들이 이 작품 앞에서 꼬리를 흔들고 있어요</span>
                </p>
              </div>
              <div className="order-3 flex flex-col gap-2 md:order-none md:mt-auto md:pt-5">
                <a
                  href={work.shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border-2 border-ink bg-white px-5 py-3 text-center font-display text-lg text-haru-600 transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
                >
                  하루들에서 이 만화 보기 ↗
                </a>
                <a
                  href={HARUDLE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border-2 border-ink bg-haru-600 px-5 py-3 text-center font-display text-lg text-white shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
                >
                  하루들에서 나도 만들기 ↗
                </a>
              </div>
            </section>
            <div className="order-2 md:order-none">
              <img
                src={work.imageUrl}
                alt={`${work.nickname} 님이 그린 네 컷 만화`}
                className="block aspect-square w-full border-[3px] border-ink bg-white object-contain"
              />
            </div>
          </div>
        </article>
      )}
    </dialog>
  )
}
