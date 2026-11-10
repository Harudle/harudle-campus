import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { EmoteId } from '../data/emotes'
import type { ChatMessage, ChatReject, PresenceStatus } from '../data/presence'
import { EmotePicker } from './EmotePicker'

const MAX_LENGTH = 100
const NOTICE_SECONDS = 4
const FEED_SIZE = 3
// 좁은 화면과 휴대폰에서는 공간을 가리지 않게 접어 두고 시작한다.
const OPEN_BY_DEFAULT = window.matchMedia('(pointer: fine) and (min-width: 1100px)').matches
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches

const TIME_FORMAT = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

function formatTime(at: number) {
  return TIME_FORMAT.format(at)
}

const REJECT_NOTICE: Record<ChatReject, string> = {
  long: `${MAX_LENGTH}자까지 보낼 수 있어요`,
  link: '링크는 보낼 수 없어요',
  fast: '조금 천천히 보내 주세요',
}

const BUTTON =
  'cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-2 font-display text-haru-600 shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:min-h-11'

type ChatPanelProps = {
  chat: {
    status: PresenceStatus
    messages: ChatMessage[]
    reject: { reason: ChatReject; key: number } | null
    send: (text: string) => boolean
    mute: (id: number) => void
    emote: (emote: EmoteId) => void
  }
}

/** 같은 공간에 있는 사람끼리 나누는 채팅. 최근 대화는 서버에 저장되어 나중에 온 사람도 본다. */
export function ChatPanel({ chat }: ChatPanelProps) {
  const { status, messages, reject, send, mute, emote } = chat
  const [open, setOpen] = useState(OPEN_BY_DEFAULT)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')
  const [seenKey, setSeenKey] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const log = useRef<HTMLOListElement>(null)
  const submitAfterComposition = useRef(false)
  const online = status === 'online'
  const lastKey = messages[messages.length - 1]?.key ?? 0

  const unread = open ? 0 : messages.filter((message) => message.key > seenKey && !message.mine && !message.historic).length

  useEffect(() => {
    if (open) setSeenKey(lastKey)
  }, [open, lastKey])

  useEffect(() => {
    const list = log.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, open])

  useEffect(() => {
    if (!reject) return
    setNotice(REJECT_NOTICE[reject.reason])
    const timer = setTimeout(() => setNotice(''), NOTICE_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [reject])

  // 다른 입력칸이나 버튼을 쓰고 있지 않으면 Enter로 바로 채팅을 시작한다.
  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Enter' || event.isComposing || document.querySelector('dialog[open]')) return
      const active = document.activeElement
      if (active && active !== document.body && active.tagName !== 'CANVAS') return
      event.preventDefault()
      setOpen(true)
      // 이미 열려 있으면 곧바로 쳐도 글자가 빠지지 않게 바로 옮기고, 접혀 있었으면 그려진 뒤에 옮긴다.
      input.current?.focus()
      requestAnimationFrame(() => input.current?.focus())
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const submit = (value: string) => {
    const text = value.trim()
    if (!text) return
    if (send(text)) setDraft('')
    else setNotice('연결되면 보낼 수 있어요')
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    submit(draft)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.currentTarget.blur()
      return
    }
    // 한글 조합 중의 Enter는 글자가 완성된 뒤에 한 번만 보낸다.
    if (event.key === 'Enter' && event.nativeEvent.isComposing) {
      event.preventDefault()
      submitAfterComposition.current = true
    }
  }

  if (!open) {
    return (
      <div className="pointer-events-none absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 flex w-[min(18rem,calc(100vw-2rem))] flex-col items-start gap-1.5 sm:bottom-6 sm:left-6 pointer-coarse:bottom-[calc(8.5rem+env(safe-area-inset-bottom))]">
        {/* 접어 두어도 대화가 보이도록 최근 글만 띄운다. 3D 화면을 누르는 데 방해되지 않게 터치는 통과시킨다. */}
        {messages.length > 0 && (
          <ol role="log" aria-label="최근 채팅" className="flex flex-col items-start gap-1">
            {messages.slice(-FEED_SIZE).map((message, index, recent) => (
              <li
                key={message.key}
                className={`line-clamp-2 rounded-lg bg-white/85 px-2 py-0.5 text-sm break-words ${message.historic ? 'opacity-70' : ''} ${recent.length === FEED_SIZE && index === 0 ? '[@media(max-height:480px)]:hidden' : ''}`}
              >
                <span className={`font-display ${message.mine ? 'text-haru-600' : 'text-ink'}`}>{message.nickname || '방문자'}</span> {message.text}
              </li>
            ))}
          </ol>
        )}
        <div className="pointer-events-auto flex items-center gap-2">
          <button type="button" onClick={() => setOpen(true)} className={BUTTON}>
            채팅{unread > 0 && ` ${unread}`}
          </button>
          <EmotePicker disabled={!online} onEmote={emote} className="size-11 rounded-full shadow-[3px_3px_0_var(--color-ink)]" />
        </div>
      </div>
    )
  }

  return (
    <section
      aria-label="채팅"
      className="absolute z-10 bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 flex w-72 max-w-[calc(100vw-2rem)] flex-col rounded-2xl border-2 border-ink bg-white/90 p-2 shadow-[3px_3px_0_var(--color-ink)] backdrop-blur-sm sm:bottom-6 sm:left-6 pointer-coarse:bottom-[calc(8.5rem+env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="font-display text-haru-600">이 공간 채팅</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer rounded-md px-2 text-sm text-haru-800 hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600 pointer-coarse:min-h-11"
        >
          접기
        </button>
      </div>
      <p className="px-1 text-xs text-haru-800">대화는 30일 동안 저장되고, 나중에 온 사람도 볼 수 있어요</p>
      <ol
        ref={log}
        role="log"
        aria-live="polite"
        tabIndex={0}
        className="my-1 h-36 overflow-y-auto rounded-lg px-1 text-sm break-words focus-visible:outline-3 focus-visible:outline-haru-600 pointer-coarse:h-24 [@media(max-height:480px)]:h-16"
      >
        {messages.length === 0 && <li className="py-1 text-haru-800">같은 공간에 있는 사람과 대화해 보세요.</li>}
        {messages.map((message) => (
          <li key={message.key} className="group py-0.5">
            <span className={`font-display ${message.mine ? 'text-haru-600' : 'text-ink'}`}>{message.nickname || '방문자'}</span> {message.text}
            {message.historic && <span className="ml-1 text-xs text-haru-800">{formatTime(message.at)}</span>}
            {!message.mine && message.id !== null && (
              <button
                type="button"
                onClick={() => mute(message.id as number)}
                aria-label={`${message.nickname || '방문자'}의 채팅 가리기`}
                className="ml-1 cursor-pointer rounded text-xs text-haru-800 underline opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-haru-600 pointer-coarse:opacity-100"
              >
                가리기
              </button>
            )}
          </li>
        ))}
      </ol>
      {notice && (
        <p role="status" className="px-1 pb-1 text-xs text-haru-800">
          {notice}
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex gap-1">
        <EmotePicker disabled={!online} onEmote={emote} className="h-full min-h-9 w-9 rounded-lg pointer-coarse:min-h-11 pointer-coarse:w-11" />
        <input
          ref={input}
          type="text"
          value={draft}
          maxLength={MAX_LENGTH}
          disabled={!online}
          aria-label="채팅 메시지"
          placeholder={online ? (IS_TOUCH ? '메시지를 입력해요' : '메시지 입력 (Enter)') : '연결되면 쓸 수 있어요'}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionEnd={(event) => {
            if (!submitAfterComposition.current) return
            submitAfterComposition.current = false
            submit(event.currentTarget.value)
          }}
          className="min-w-0 grow rounded-lg border-2 border-ink bg-white px-2 py-1 text-base focus-visible:outline-3 focus-visible:outline-haru-600 disabled:bg-haru-100 sm:text-sm pointer-coarse:min-h-11 pointer-coarse:text-base"
        />
        <button
          type="submit"
          disabled={!online || !draft.trim()}
          className="shrink-0 cursor-pointer rounded-lg border-2 border-ink bg-haru-600 px-3 font-display text-white hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 disabled:cursor-default disabled:opacity-50 pointer-coarse:min-h-11"
        >
          보내기
        </button>
      </form>
    </section>
  )
}
