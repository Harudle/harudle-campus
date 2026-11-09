import { useId } from 'react'
import { LOGIN_URL } from '../lib/brand'
import { CharacterFace } from './CharacterFace'
import { useModalDialog } from './useModalDialog'

const STEPS = [
  { title: '하루들에 접속하기', body: '아래 버튼으로 로그인해요.' },
  { title: '네컷만화 만들기', body: '같이 웃었던 순간을 적으면 만화가 돼요.' },
  { title: '피드에 게시하기', body: '완성한 만화를 하루들 피드에 올려요.' },
  { title: '하루들 월드에 전시', body: '피드에 올린 만화가 이곳 전시관으로 찾아와요.' },
]

type AuthorBoothModalProps = {
  open: boolean
  onClose: () => void
}

/** 만화는 하루들에서 만들고, 피드에 올린 작품이 전시관으로 온다는 것을 안내한 뒤 로그인으로 보낸다. */
export function AuthorBoothModal({ open, onClose }: AuthorBoothModalProps) {
  const { dialogRef, contentRef } = useModalDialog(open)
  const titleId = useId()

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="scoop-dialog"
      style={{ animation: 'none', width: 'min(560px, calc(100% - 2rem))' }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <article ref={contentRef} tabIndex={-1} className="relative p-4 outline-none sm:p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="안내 닫기"
          className="absolute top-3 right-3 grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-lg leading-none transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:size-11"
        >
          ✕
        </button>

        <header className="flex items-center gap-3 pr-12">
          <CharacterFace kind="harudle" className="size-12 shrink-0" />
          <div>
            <h2 id={titleId} className="font-display text-3xl leading-tight text-haru-600">
              하루들 작가 체험
            </h2>
            <p className="text-sm text-haru-800">내 만화를 하루들 월드에 걸어 보세요</p>
          </div>
        </header>

        <ol className="mt-4 flex flex-col gap-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-haru-100 font-display text-lg text-haru-600"
              >
                {index + 1}
              </span>
              <div>
                <p className="font-display text-lg leading-snug text-ink">{step.title}</p>
                <p className="text-sm leading-relaxed text-haru-800">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-4 text-sm leading-relaxed text-haru-800">
          좋아요를 많이 받을수록 메인 전시실에 걸리고, 사랑받는 작가에게는 전용 전시실도 열려요.
        </p>

        <a
          href={LOGIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block w-full cursor-pointer rounded-xl border-2 border-ink bg-haru-600 px-5 py-3 text-center font-display text-xl text-white shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
        >
          하루들 접속하기 ↗
        </a>
      </article>
    </dialog>
  )
}
