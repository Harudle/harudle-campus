import { useId, useState } from 'react'
import { usePopularFeed, type PopularFeed } from '../data/popularFeed'
import { exampleScoop, scoopCopy } from '../data/todayScoop'
import { HARUDLE_URL, SLOGAN } from '../lib/brand'
import { CharacterFace } from './CharacterFace'
import { FourCutComic } from './FourCutComic'
import { useModalDialog } from './useModalDialog'

type ScoopModalProps = {
  open: boolean
  onClose: () => void
}

const issueDate = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full' })
const postedDate = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })

function FeedArticle({ feed }: { feed: PopularFeed }) {
  return (
    <>
      <h3 className="text-xl leading-snug font-bold">
        {feed.nickname} 작가, 좋아요 {feed.likeCount}개로 1면 장식
      </h3>
      <p className="mt-2 leading-relaxed">
        {postedDate.format(new Date(feed.publishedAt))}에 올라온 ‘{feed.category}’ 만화가 좋아요 {feed.likeCount}개
        {feed.commentCount > 0 && `, 댓글 ${feed.commentCount}개`}를 모으며 그날 올라온 만화 중 가장 큰 사랑을 받았다.
      </p>
      <p className="mt-3 flex items-center gap-2 text-sm text-haru-800">
        {feed.profileImageUrl && (
          <img src={feed.profileImageUrl} alt="" className="size-7 rounded-full border border-ink object-cover" />
        )}
        <span>
          {feed.nickname} · {feed.category}
        </span>
      </p>
    </>
  )
}

function FeedComic({ feed, onImageError }: { feed: PopularFeed; onImageError: () => void }) {
  return (
    <a
      href={feed.shareUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${feed.nickname} 님의 만화를 하루들에서 보기`}
      className="block border-[3px] border-ink transition hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
    >
      <img
        src={feed.imageUrl}
        alt={`${feed.nickname} 님이 그린 네 컷 만화`}
        onError={onImageError}
        className="block aspect-square w-full bg-white object-contain"
      />
    </a>
  )
}

export function ScoopModal({ open, onClose }: ScoopModalProps) {
  const { dialogRef, contentRef } = useModalDialog(open)
  const titleId = useId()
  const feedState = usePopularFeed(open)
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)

  const loading = feedState.status === 'loading'
  const feed =
    feedState.status === 'ready' && feedState.feed.imageUrl !== failedImageUrl ? feedState.feed : null
  const showExample = !loading && !feed
  const subtitle =
    feed && !feed.isYesterday
      ? `${postedDate.format(new Date(feed.publishedAt))} 가장 인기 있었던 우리끼리 만화`
      : scoopCopy.subtitle

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
      <article ref={contentRef} tabIndex={-1} className="p-4 outline-none sm:p-6">
        <header className="relative border-b-4 border-double border-ink pb-3 text-center">
          <button
            type="button"
            onClick={onClose}
            aria-label="신문 닫기"
            className="absolute -top-1 -right-1 grid size-9 pointer-coarse:size-11 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-lg leading-none transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
          >
            ✕
          </button>
          <p className="font-display text-4xl tracking-wide text-ink sm:text-5xl">하루들 일보</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 border-t border-ink pt-1.5 text-xs sm:justify-between sm:text-sm">
            <span>{issueDate.format(new Date())}</span>
            <span>{SLOGAN}</span>
            <span>구독료: 웃음 한 번</span>
          </div>
        </header>

        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <section className="contents md:flex md:flex-col">
            <div className="order-1 md:order-none">
              <div className="flex items-center gap-3">
                <span className="shrink-0 -rotate-6 rounded-sm border-2 border-haru-600 px-2 py-0.5 font-display text-haru-600">
                  특종
                </span>
                <h2 id={titleId} className="font-display text-3xl leading-tight text-haru-600 sm:text-4xl">
                  {scoopCopy.label}
                </h2>
              </div>
              <p className="mt-2 font-display text-lg">{subtitle}</p>
              <div className="mt-3 border-t-2 border-ink pt-3" aria-busy={loading}>
                {loading && <p className="leading-relaxed text-haru-800">하루들 기자가 따끈한 특종을 가져오는 중이에요…</p>}
                {feed && <FeedArticle feed={feed} />}
                {showExample && (
                  <>
                    <h3 className="text-xl leading-snug font-bold">{exampleScoop.headline}</h3>
                    <p className="mt-2 leading-relaxed">{exampleScoop.article}</p>
                  </>
                )}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-sm text-haru-800">
                <CharacterFace kind="harudle" className="size-8" />
                <span>취재 하루들 기자</span>
                <CharacterFace kind="doodle" className="ml-2 size-8" />
                <span>보조 두들</span>
              </p>
            </div>
            {/* 모바일에서는 만화를 먼저 보여 주고, 버튼은 화면 아래에 붙여 둔다. */}
            <div className="sticky bottom-0 order-3 -mb-4 bg-paper pt-1 pb-3 md:static md:order-none md:mt-auto md:mb-0 md:pt-5 md:pb-0">
              <a
                href={HARUDLE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border-2 border-ink bg-haru-600 px-5 py-3.5 text-center font-display text-xl text-white shadow-[3px_3px_0_var(--color-ink)] transition hover:-translate-y-0.5 hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 active:translate-y-0.5 active:shadow-none"
              >
                {scoopCopy.ctaLabel} ↗
              </a>
              {showExample && (
                <p className="mt-2 text-center text-xs text-haru-800">
                  * 인기 만화를 불러오지 못해 예시 만화를 보여 드려요
                </p>
              )}
            </div>
          </section>

          <div className="order-2 md:order-none">
            {loading && <div className="aspect-square w-full animate-pulse border-[3px] border-ink bg-haru-100" />}
            {feed && <FeedComic feed={feed} onImageError={() => setFailedImageUrl(feed.imageUrl)} />}
            {showExample && <FourCutComic description={exampleScoop.comicDescription} />}
          </div>
        </div>
      </article>
    </dialog>
  )
}
