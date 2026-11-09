import { useEffect, useId, useState, type FormEvent } from 'react'
import {
  MAX_CHEER_LENGTH,
  MAX_CHEER_NICKNAME_LENGTH,
  type CheerBoard,
  type CheerPostResult,
} from '../data/cheers'
import { noteColor } from '../lib/brand'
import { loadNickname } from '../data/nickname'
import { CharacterFace } from './CharacterFace'
import { useModalDialog } from './useModalDialog'

const ERROR_COPY: Record<Exclude<CheerPostResult, 'ok'>, string> = {
  rate_limited: '응원글이 너무 빨라요. 잠시 후 다시 남겨 주세요.',
  link: '링크는 남길 수 없어요.',
  invalid: '내용을 확인해 주세요.',
  failed: '응원글을 남기지 못했어요. 잠시 후 다시 시도해 주세요.',
}

const postedAt = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Seoul',
})

const TEXT_BUTTON =
  'cursor-pointer rounded px-2 py-1 text-sm text-haru-800 underline hover:bg-white/60 focus-visible:outline-3 focus-visible:outline-haru-600 pointer-coarse:min-h-11 pointer-coarse:px-3'

type CheerBoardModalProps = {
  open: boolean
  artist: string
  board: CheerBoard
  onClose: () => void
}

export function CheerBoardModal({ open, artist, board, onClose }: CheerBoardModalProps) {
  const { dialogRef, contentRef } = useModalDialog(open)
  const titleId = useId()
  const [nickname, setNickname] = useState(() => loadNickname() ?? '')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [reported, setReported] = useState<number[]>([])
  const { reload } = board

  useEffect(() => {
    if (open) reload()
  }, [open, reload])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending) return
    if (!message.trim()) {
      setFeedback('응원 내용을 적어 주세요.')
      return
    }
    setSending(true)
    setFeedback(null)
    const result = await board.post(nickname.trim(), message.trim())
    setSending(false)
    if (result === 'ok') setMessage('')
    else setFeedback(ERROR_COPY[result])
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="scoop-dialog"
      style={{ animation: 'none', width: 'min(640px, calc(100% - 2rem))' }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <article ref={contentRef} tabIndex={-1} className="relative p-4 outline-none sm:p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="방명록 닫기"
          className="absolute top-3 right-3 grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-lg leading-none transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:size-11"
        >
          ✕
        </button>

        <header className="flex items-center gap-3 pr-12">
          <CharacterFace kind="doodle" className="size-12 shrink-0" />
          <div>
            <h2 id={titleId} className="font-display text-2xl leading-tight text-haru-600 sm:text-3xl">
              {artist} 작가 응원 방명록
            </h2>
            <p className="text-sm text-haru-800">응원글 {board.total}개</p>
          </div>
        </header>

        <form className="mt-4 flex flex-col gap-2" onSubmit={submit}>
          <label className="font-display text-haru-800" htmlFor={`${titleId}-nickname`}>
            내 이름 (선택)
          </label>
          <input
            id={`${titleId}-nickname`}
            value={nickname}
            maxLength={MAX_CHEER_NICKNAME_LENGTH}
            placeholder="익명의 관람객"
            autoComplete="off"
            onChange={(event) => setNickname(event.target.value)}
            className="w-full rounded-xl border-2 border-ink bg-white px-3 py-2 text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
          />
          <label className="mt-1 font-display text-haru-800" htmlFor={`${titleId}-message`}>
            응원 한마디
          </label>
          <textarea
            id={`${titleId}-message`}
            value={message}
            maxLength={MAX_CHEER_LENGTH}
            rows={3}
            placeholder="작가님에게 따뜻한 한마디를 남겨 주세요."
            aria-describedby={`${titleId}-hint`}
            onChange={(event) => {
              setMessage(event.target.value)
              setFeedback(null)
            }}
            className="w-full resize-none rounded-xl border-2 border-ink bg-white p-3 text-base leading-relaxed focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
          />
          <p id={`${titleId}-hint`} className="flex justify-between gap-3 text-sm text-haru-800">
            <span role={feedback ? 'alert' : undefined} className={feedback ? 'text-red-700' : undefined}>
              {feedback ?? '누구나 볼 수 있어요. 신고가 쌓인 글은 가려져요.'}
            </span>
            <span className="shrink-0">
              {message.length} / {MAX_CHEER_LENGTH}
            </span>
          </p>
          <button
            type="submit"
            disabled={sending}
            className="block w-full cursor-pointer rounded-xl border-2 border-ink bg-haru-600 px-5 py-3 text-center font-display text-xl text-white shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 disabled:cursor-wait disabled:opacity-70"
          >
            {sending ? '남기는 중…' : '응원 남기기'}
          </button>
        </form>

        <section aria-label="응원글 목록" className="mt-5 overflow-x-clip border-t-2 border-ink pt-3">
          {board.status === 'loading' && <p className="py-4 text-center text-haru-800">응원글을 불러오는 중이에요…</p>}
          {board.status === 'failed' && (
            <div className="py-4 text-center" role="alert">
              <p className="text-haru-800">응원글을 불러오지 못했어요.</p>
              <button type="button" onClick={reload} className={TEXT_BUTTON}>
                다시 시도
              </button>
            </div>
          )}
          {board.status === 'ready' && board.items.length === 0 && (
            <p className="py-4 text-center text-haru-800">첫 응원글을 남겨 주세요!</p>
          )}
          <ul className="grid grid-cols-1 gap-3 p-1 sm:grid-cols-2">
            {board.items.map((cheer) => (
              <li
                key={cheer.id}
                style={{ backgroundColor: noteColor(cheer.id) }}
                className={`flex min-w-0 flex-col rounded-sm p-3 shadow-[2px_3px_0_rgb(43_33_64/0.25)] ${
                  cheer.id % 2 === 0 ? '-rotate-1' : 'rotate-1'
                }`}
              >
                <p className="grow leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">{cheer.message}</p>
                <p className="mt-2 font-display text-haru-800">{cheer.nickname}</p>
                <div className="flex items-center justify-between gap-2">
                  <time dateTime={cheer.createdAt} className="text-xs text-haru-800">
                    {postedAt.format(new Date(cheer.createdAt))}
                  </time>
                  {board.isMine(cheer.id) ? (
                    <button type="button" onClick={() => board.remove(cheer.id)} className={TEXT_BUTTON}>
                      삭제
                    </button>
                  ) : reported.includes(cheer.id) ? (
                    <span className="px-2 py-1 text-sm text-haru-800">신고했어요</span>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await board.report(cheer.id)) setReported((current) => [...current, cheer.id])
                      }}
                      className={TEXT_BUTTON}
                    >
                      신고
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {board.hasMore && (
            <div className="mt-2 text-center">
              <button type="button" onClick={board.loadMore} className={TEXT_BUTTON}>
                더 보기
              </button>
            </div>
          )}
        </section>
      </article>
    </dialog>
  )
}
