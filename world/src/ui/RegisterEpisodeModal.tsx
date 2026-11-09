import { useEffect, useId, useState, type FormEvent } from 'react'
import { registerEpisode, type RegisterEpisodeResult, type RelayEpisode } from '../data/relayEpisodes'
import { HARUDLE_SHORT_URL } from '../lib/brand'
import { useModalDialog } from './useModalDialog'

const ERROR_COPY: Record<Exclude<RegisterEpisodeResult, 'ok'>, string> = {
  bad_link: '하루들 피드 글의 공유 링크를 넣어 주세요. https://www.harudle.com/feeds/… 형태예요.',
  bad_password: '비밀번호는 4자 이상 64자 이하로 정해 주세요.',
  duplicate: '이미 올라온 만화예요.',
  not_found: '피드에서 이 글을 찾지 못했어요. 피드에 게시했는지 확인해 주세요.',
  rate_limited: '올리기가 너무 잦아요. 잠시 후 다시 시도해 주세요.',
  unavailable: '지금 하루들에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.',
  failed: '올리지 못했어요. 잠시 후 다시 시도해 주세요.',
}

const INPUT =
  'w-full rounded-xl border-2 border-ink bg-white px-3 py-2 text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600'
const LABEL = 'mt-1 font-display text-haru-800'

/** 앞 화의 결말을 보여 주고, 하루들에서 이어 그린 만화의 공유 링크를 받는 화면 */
export function RegisterEpisodeModal({ open, latest, onRegistered, onClose }: {
  open: boolean
  /** 이어 그릴 앞 화. 없으면 1화를 올린다. */
  latest: RelayEpisode | null
  onRegistered: () => void
  onClose: () => void
}) {
  const { dialogRef, contentRef } = useModalDialog(open)
  const titleId = useId()
  const [shareUrl, setShareUrl] = useState('')
  const [password, setPassword] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending) return
    if (!shareUrl.trim() || !password) {
      setError('공유 링크와 비밀번호를 모두 적어 주세요.')
      return
    }
    setSending(true)
    setError(null)
    const result = await registerEpisode({ shareUrl, password })
    setSending(false)
    if (result !== 'ok') {
      setError(ERROR_COPY[result])
      return
    }
    setShareUrl('')
    setPassword('')
    onRegistered()
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
          aria-label="올리기 닫기"
          className="absolute top-3 right-3 grid size-9 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-lg leading-none transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:size-11"
        >
          ✕
        </button>
        <h2 id={titleId} className="pr-12 font-display text-3xl leading-tight text-haru-600">
          {latest ? '다음 화 이어 그리기' : '1화 올리기'}
        </h2>

        <div className="mt-3 flex gap-3 rounded-xl bg-haru-100 p-3">
          {latest && <img src={latest.imageUrl} alt={`${latest.number}화 네컷만화`} className="size-32 shrink-0 border-2 border-ink bg-white object-contain" />}
          <p className="leading-relaxed font-bold">
            {latest
              ? `앞선 ${latest.number}화의 마지막 컷을 보고 이어 그려 보세요. 과연 다음 이야기는? 하루들에서 상상력을 펼쳐보세요!`
              : '아직 첫 화가 없어요. 하루들에서 네 컷 만화로 이야기를 시작해 보세요!'}
          </p>
        </div>

        <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 leading-relaxed">
          <li>
            하루들에서 {latest ? '이어지는' : '첫'} 네컷만화를 만들어요.{' '}
            <a href={HARUDLE_SHORT_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-haru-600 underline focus-visible:outline-3 focus-visible:outline-haru-600">
              {latest ? '하루들에서 다음 화 만들기' : '하루들에서 1화 만들기'} ↗
            </a>
          </li>
          <li>
            완성한 만화를 피드에 게시할 때 <strong>이벤트</strong> 카테고리를 골라 주시고, 공유 링크를 복사해요.
          </li>
          <li>아래에 공유 링크를 내면 소설관에 이어 붙어요.</li>
        </ol>

        <form className="mt-3 flex flex-col gap-2" onSubmit={submit}>
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
          <label className={LABEL} htmlFor={`${titleId}-password`}>
            비밀번호
          </label>
          <input
            id={`${titleId}-password`}
            type="password"
            value={password}
            maxLength={64}
            autoComplete="new-password"
            placeholder="4자 이상"
            aria-describedby={`${titleId}-password-hint`}
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT}
          />
          <p id={`${titleId}-password-hint`} className="text-xs text-haru-800">
            내릴 때 필요해요. 찾을 수 없으니 잘 기억해 주세요. 다른 곳에서 쓰는 비밀번호는 넣지 마세요.
          </p>
          <p aria-live="polite" className="min-h-5 text-sm text-red-700">
            {error}
          </p>
          <button
            type="submit"
            disabled={sending}
            className="block w-full cursor-pointer rounded-xl border-2 border-ink bg-haru-600 px-5 py-3 text-center font-display text-xl text-white shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 disabled:cursor-wait disabled:opacity-70"
          >
            {sending ? '확인하는 중…' : '올리기'}
          </button>
          <p className="text-xs leading-relaxed text-haru-800">내가 게시한 만화만 올려 주세요. 신고가 쌓인 화는 가려져요.</p>
        </form>
      </article>
    </dialog>
  )
}
