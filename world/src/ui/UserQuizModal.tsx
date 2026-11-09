import { useEffect, useId, useState, type FormEvent } from 'react'
import { loadNickname } from '../data/nickname'
import type { UserQuiz, UserQuizBoard } from '../data/userQuizzes'
import { QuizConfetti } from './QuizConfetti'
import { RemoveControls } from './RemoveControls'
import { useModalDialog } from './useModalDialog'

const CONFETTI_MS = 2600

function Game({ quiz, board, onClose, titleId }: {
  quiz: UserQuiz
  board: UserQuizBoard
  onClose: () => void
  titleId: string
}) {
  const [answer, setAnswer] = useState('')
  const [nickname, setNickname] = useState(() => loadNickname() ?? '')
  const [sending, setSending] = useState(false)
  const [solved, setSolved] = useState(false)
  const [wrongCount, setWrongCount] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [confetti, setConfetti] = useState(false)

  useEffect(() => {
    if (!confetti) return
    const timer = setTimeout(() => setConfetti(false), CONFETTI_MS)
    return () => clearTimeout(timer)
  }, [confetti])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending || solved) return
    if (!answer.trim()) {
      setNotice('답을 적어 주세요.')
      return
    }
    setSending(true)
    setNotice(null)
    const result = await board.answer(quiz.id, answer.trim(), nickname.trim())
    setSending(false)
    if (result.status === 'correct') {
      setSolved(true)
      setConfetti(true)
    } else if (result.status === 'wrong') {
      setWrongCount((count) => count + 1)
    } else if (result.status === 'rate_limited') {
      setNotice('시도가 너무 많아요. 잠시 후 다시 해 보세요.')
    } else if (result.status === 'bad_nickname') {
      setNotice('닉네임은 12자까지이고 링크는 쓸 수 없어요.')
    } else {
      setNotice('채점하지 못했어요. 잠시 후 다시 시도해 주세요.')
    }
  }

  return (
    <>
      <h2 id={titleId} className="pr-12 font-display text-2xl leading-tight text-haru-600 sm:text-3xl">
        {quiz.author} 작가의 문제
      </h2>
      <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <a href={quiz.shareUrl} target="_blank" rel="noopener noreferrer" aria-label={`${quiz.author} 작가의 만화를 하루들에서 보기`} className="block self-start border-[3px] border-ink">
          <img src={quiz.imageUrl} alt={`${quiz.author} 작가가 낸 네컷만화 문제`} className="block aspect-square w-full bg-white object-contain" />
        </a>

        <div className="flex flex-col gap-3">
          {quiz.hint &&
            (showHint ? (
              <p className="rounded-xl bg-haru-100 p-3 text-sm leading-relaxed">힌트: {quiz.hint}</p>
            ) : (
              <button
                type="button"
                onClick={() => setShowHint(true)}
                className="cursor-pointer self-start rounded-full border-2 border-ink bg-white px-3 py-1 text-sm transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600 pointer-coarse:min-h-11 pointer-coarse:px-4"
              >
                힌트 보기
              </button>
            ))}

          {!solved && (
            <form className="flex flex-col gap-2" onSubmit={submit}>
              <label className="font-display text-haru-800" htmlFor={`${titleId}-answer`}>
                정답
              </label>
              <input
                id={`${titleId}-answer`}
                value={answer}
                maxLength={100}
                autoComplete="off"
                placeholder="정답을 적어 보세요"
                onChange={(event) => {
                  setAnswer(event.target.value)
                  setNotice(null)
                }}
                className="w-full rounded-xl border-2 border-ink bg-white px-3 py-2 text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
              />
              <label className="font-display text-haru-800" htmlFor={`${titleId}-nickname`}>
                맞히면 표시될 닉네임
              </label>
              <input
                id={`${titleId}-nickname`}
                value={nickname}
                maxLength={12}
                autoComplete="off"
                placeholder="익명의 도전자"
                onChange={(event) => setNickname(event.target.value)}
                className="w-full rounded-xl border-2 border-ink bg-white px-3 py-2 text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
              />
              <button
                type="submit"
                disabled={sending}
                className="block w-full cursor-pointer rounded-xl border-2 border-ink bg-haru-600 px-5 py-3 text-center font-display text-xl text-white shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 disabled:cursor-wait disabled:opacity-70"
              >
                {sending ? '채점 중…' : '정답 확인'}
              </button>
            </form>
          )}

          <div aria-live="polite">
            {solved ? (
              <p className="rounded-xl border-2 border-ink bg-[#FFF3C9] p-3 font-display text-2xl text-haru-600">정답입니다!</p>
            ) : wrongCount > 0 ? (
              <p key={wrongCount} className="quiz-shake rounded-xl border-2 border-ink bg-[#FFE2E9] p-3 font-display text-xl">
                아쉬워요, 다시 도전!
              </p>
            ) : (
              notice && <p className="text-sm text-red-700">{notice}</p>
            )}
            {notice && (solved || wrongCount > 0) && <p className="mt-1 text-sm text-red-700">{notice}</p>}
          </div>

          <section aria-label="맞힌 사람">
            <h3 className="font-display text-haru-800">맞힌 사람 {quiz.solverCount}명</h3>
            {quiz.solvers.length > 0 ? (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {quiz.solvers.map((solver) => (
                  <li key={solver} className="rounded-full bg-haru-100 px-2.5 py-0.5 text-sm">
                    {solver}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-haru-800">첫 번째로 맞혀 보세요!</p>
            )}
          </section>

          <RemoveControls
            needsPassword={quiz.hasPassword}
            canRemove={quiz.hasPassword || board.hasLegacyToken(quiz.id)}
            removeLabel="문제 내리기"
            onRemove={(password) => board.remove(quiz.id, password)}
            onReport={() => board.report(quiz.id)}
            onRemoved={onClose}
          />
        </div>
      </div>
      {confetti && <QuizConfetti />}
    </>
  )
}

export function UserQuizModal({ quiz, board, onClose }: { quiz: UserQuiz | null; board: UserQuizBoard; onClose: () => void }) {
  const { dialogRef, contentRef } = useModalDialog(quiz !== null)
  const titleId = useId()
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="scoop-dialog"
      style={{ animation: 'none' }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <article ref={contentRef} tabIndex={-1} className="relative p-4 outline-none sm:p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="문제 닫기"
          className="absolute top-3 right-3 z-10 grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-lg leading-none transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:size-11"
        >
          ✕
        </button>
        {quiz && <Game key={quiz.id} quiz={quiz} board={board} onClose={onClose} titleId={titleId} />}
      </article>
    </dialog>
  )
}
