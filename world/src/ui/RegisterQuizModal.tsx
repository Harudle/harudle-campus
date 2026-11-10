import { useEffect, useId, useState, type FormEvent } from 'react'
import { ARCADE_ROOMS, type ArcadeRoomId } from '../data/arcadeQuizzes'
import { registerQuiz, type RegisterResult } from '../data/userQuizzes'
import { HARUDLE_SHORT_URL } from '../lib/brand'
import { useModalDialog } from './useModalDialog'

type RegisterError = Extract<RegisterResult, { ok: false }>['code']

const ERROR_COPY: Record<RegisterError, string> = {
  bad_link: '하루들 피드 글의 공유 링크를 넣어 주세요. https://www.harudle.com/feeds/… 형태예요.',
  bad_answer: '정답을 확인해 주세요. 여러 개는 쉼표로 나누고 5개까지 적을 수 있어요.',
  bad_hint: '힌트는 80자까지이고 링크는 넣을 수 없어요.',
  bad_password: '비밀번호는 4자 이상 64자 이하로 정해 주세요.',
  duplicate: '이미 등록된 만화예요.',
  not_found: '피드에서 이 글을 찾지 못했어요. 피드에 게시했는지 확인해 주세요.',
  rate_limited: '등록이 너무 잦아요. 잠시 후 다시 시도해 주세요.',
  unavailable: '지금 하루들에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.',
  failed: '등록하지 못했어요. 잠시 후 다시 시도해 주세요.',
}

const INPUT =
  'w-full rounded-xl border-2 border-ink bg-white px-3 py-2 text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600'
const LABEL = 'font-display text-haru-800'

type RegisterQuizModalProps = {
  open: boolean
  /** 들어와 있는 방을 기본으로 고른다. */
  defaultRoom: ArcadeRoomId | null
  onRegistered: (room: ArcadeRoomId) => void
  onClose: () => void
}

/** 하루들에서 만화를 만들어 피드에 올린 뒤, 공유 링크와 정답을 내는 화면 */
export function RegisterQuizModal({ open, defaultRoom, onRegistered, onClose }: RegisterQuizModalProps) {
  const { dialogRef, contentRef } = useModalDialog(open)
  const titleId = useId()
  const [roomId, setRoomId] = useState<ArcadeRoomId>(defaultRoom ?? 'song')
  const [shareUrl, setShareUrl] = useState('')
  const [answer, setAnswer] = useState('')
  const [hint, setHint] = useState('')
  const [password, setPassword] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const room = ARCADE_ROOMS.find((candidate) => candidate.id === roomId)!

  useEffect(() => {
    if (!open) return
    if (defaultRoom) setRoomId(defaultRoom)
    setError(null)
  }, [open, defaultRoom])

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(room.prompt)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending) return
    if (!shareUrl.trim() || !answer.trim() || !password) {
      setError('공유 링크, 정답, 비밀번호를 모두 적어 주세요.')
      return
    }
    setSending(true)
    setError(null)
    const result = await registerQuiz(roomId, shareUrl, answer, hint, password)
    setSending(false)
    if (!result.ok) {
      setError(ERROR_COPY[result.code])
      return
    }
    setShareUrl('')
    setAnswer('')
    setHint('')
    setPassword('')
    onRegistered(roomId)
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="scoop-dialog"
      style={{ animation: 'none', width: 'min(600px, calc(100% - 2rem))' }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <article ref={contentRef} tabIndex={-1} className="relative p-4 outline-none sm:p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="등록 닫기"
          className="absolute top-3 right-3 grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-lg leading-none transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:size-11"
        >
          ✕
        </button>
        <h2 id={titleId} className="pr-12 font-display text-3xl leading-tight text-haru-600">
          문제 등록하기
        </h2>

        <fieldset className="mt-3">
          <legend className={LABEL}>어느 방에 걸까요?</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ARCADE_ROOMS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={candidate.id === roomId}
                onClick={() => {
                  setRoomId(candidate.id)
                  setCopied(false)
                }}
                className={`cursor-pointer rounded-full border-2 border-ink px-3 py-1 text-sm transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:min-h-11 pointer-coarse:px-4 ${
                  candidate.id === roomId ? 'bg-haru-600 text-white' : 'bg-white hover:bg-haru-100'
                }`}
              >
                {candidate.label}
              </button>
            ))}
          </div>
        </fieldset>

        <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5 leading-relaxed">
          <li>
            하루들에서 네컷만화를 만들 때 이 문장으로 끝나게 적어 주세요.
            <span className="mt-1 block rounded-lg bg-haru-100 p-2 font-bold">{room.prompt}</span>
            <span className="mt-1.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyPrompt}
                className="cursor-pointer rounded-full border-2 border-ink bg-white px-3 py-1 text-sm transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600 pointer-coarse:min-h-11"
              >
                {copied ? '복사했어요' : '문장 복사'}
              </button>
              <a
                href={HARUDLE_SHORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border-2 border-ink bg-haru-600 px-3 py-1 text-sm text-white transition hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-haru-600 pointer-coarse:min-h-11 pointer-coarse:leading-8"
              >
                하루들에서 만들기 ↗
              </a>
            </span>
          </li>
          <li>
            완성한 만화를 피드에 게시할 때 <strong>이벤트</strong> 카테고리를 골라 주시고, 공유 링크를 복사해요.
          </li>
          <li>아래에 공유 링크와 정답을 내면 이 방 벽에 걸려요.</li>
        </ol>

        <form className="mt-4 flex flex-col gap-2" onSubmit={submit}>
          <label className={LABEL} htmlFor={`${titleId}-link`}>
            공유 링크
          </label>
          <input
            id={`${titleId}-link`}
            inputMode="url"
            value={shareUrl}
            placeholder="https://www.harudle.com/feeds/…"
            autoComplete="off"
            onChange={(event) => setShareUrl(event.target.value)}
            className={INPUT}
          />
          <label className={`${LABEL} mt-1`} htmlFor={`${titleId}-answer`}>
            정답
          </label>
          <input
            id={`${titleId}-answer`}
            value={answer}
            maxLength={100}
            placeholder="여러 개면 쉼표로 나눠요. 예) 아리랑, 정선아리랑"
            autoComplete="off"
            onChange={(event) => setAnswer(event.target.value)}
            className={INPUT}
          />
          <label className={`${LABEL} mt-1`} htmlFor={`${titleId}-hint`}>
            힌트 (선택)
          </label>
          <input
            id={`${titleId}-hint`}
            value={hint}
            maxLength={80}
            autoComplete="off"
            onChange={(event) => setHint(event.target.value)}
            className={INPUT}
          />
          <label className={`${LABEL} mt-1`} htmlFor={`${titleId}-password`}>
            비밀번호
          </label>
          <input
            id={`${titleId}-password`}
            type="password"
            value={password}
            maxLength={64}
            autoComplete="new-password"
            aria-describedby={`${titleId}-password-hint`}
            placeholder="4자 이상"
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT}
          />
          <p id={`${titleId}-password-hint`} className="text-xs text-haru-800">
            문제를 내릴 때 필요해요. 찾을 수 없으니 잘 기억해 주세요. 다른 곳에서 쓰는 비밀번호는 넣지 마세요.
          </p>
          <p aria-live="polite" className="min-h-5 text-sm text-red-700">
            {error}
          </p>
          <button
            type="submit"
            disabled={sending}
            className="block w-full cursor-pointer rounded-xl border-2 border-ink bg-haru-600 px-5 py-3 text-center font-display text-xl text-white shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 disabled:cursor-wait disabled:opacity-70"
          >
            {sending ? '확인하는 중…' : '제출하기'}
          </button>
          <p className="text-xs leading-relaxed text-haru-800">
            정답은 서버에만 저장돼요. 내가 게시한 만화만 등록해 주시고, 노래 가사나 대사는 다른 사람의 저작물일 수 있어요. 신고가 쌓인 문제는 가려져요.
          </p>
        </form>
      </article>
    </dialog>
  )
}
