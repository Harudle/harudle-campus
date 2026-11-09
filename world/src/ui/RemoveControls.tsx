import { useId, useState } from 'react'
import type { RemoveResult } from '../data/userQuizzes'

const SMALL_BUTTON =
  'cursor-pointer rounded px-2 py-1 text-sm text-haru-800 underline hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600 pointer-coarse:min-h-11 pointer-coarse:px-3'

const REMOVE_ERRORS: Record<Exclude<RemoveResult, 'ok'>, string> = {
  wrong_password: '비밀번호가 맞지 않아요.',
  rate_limited: '시도가 너무 많아요. 10분 뒤에 다시 해 보세요.',
  failed: '내리지 못했어요. 잠시 후 다시 시도해 주세요.',
}

type RemoveControlsProps = {
  /** false면 비밀번호를 묻지 않고 바로 내린다. 비밀번호 도입 전 문제만 해당한다. */
  needsPassword?: boolean
  canRemove?: boolean
  removeLabel: string
  onRemove: (password: string) => Promise<RemoveResult>
  onReport: () => Promise<boolean>
  onRemoved: () => void
}

/** 비밀번호를 아는 사람만 내릴 수 있다. 다른 사람은 신고할 수 있다. */
export function RemoveControls({ needsPassword = true, canRemove = true, removeLabel, onRemove, onReport, onRemoved }: RemoveControlsProps) {
  const [asking, setAsking] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [reported, setReported] = useState(false)
  const passwordId = useId()

  const remove = async (value: string) => {
    if (sending) return
    setSending(true)
    setError(null)
    const result = await onRemove(value)
    setSending(false)
    if (result === 'ok') onRemoved()
    else setError(REMOVE_ERRORS[result])
  }

  if (asking) {
    return (
      <form
        className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (password) remove(password)
        }}
      >
        <label className="font-display text-haru-800" htmlFor={passwordId}>
          올릴 때 정한 비밀번호
        </label>
        <input
          id={passwordId}
          type="password"
          value={password}
          maxLength={64}
          autoComplete="current-password"
          autoFocus
          onChange={(event) => {
            setPassword(event.target.value)
            setError(null)
          }}
          className="w-full rounded-xl border-2 border-ink bg-white px-3 py-2 text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
        />
        <p aria-live="polite" className="text-sm text-red-700">
          {error}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setAsking(false)
              setPassword('')
              setError(null)
            }}
            className={SMALL_BUTTON}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={sending || !password}
            className="cursor-pointer rounded-full border-2 border-ink bg-haru-600 px-4 py-1 font-display text-white transition hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 disabled:cursor-default disabled:opacity-60 pointer-coarse:min-h-11"
          >
            {removeLabel}
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-col items-end">
      <div className="flex justify-end gap-1">
        {canRemove && (
          <button type="button" disabled={sending} onClick={() => (needsPassword ? setAsking(true) : remove(''))} className={SMALL_BUTTON}>
            {removeLabel}
          </button>
        )}
        {reported ? (
          <span className="px-2 py-1 text-sm text-haru-800">신고했어요</span>
        ) : (
          <button
            type="button"
            onClick={async () => {
              if (await onReport()) setReported(true)
            }}
            className={SMALL_BUTTON}
          >
            신고
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  )
}
