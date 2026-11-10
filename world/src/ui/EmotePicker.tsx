import { useEffect, useRef, useState } from 'react'
import { EMOTES, type EmoteId } from '../data/emotes'
import { pressHandlers } from './ActionButtons'

function EmoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14.5c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4M9 9.5v.5M15 9.5v.5" />
    </svg>
  )
}

/** 채팅 옆의 감정 표현 버튼. PC에서는 숫자 키로도 바로 고른다. */
export function EmotePicker({ disabled, onEmote, className }: { disabled: boolean; onEmote: (emote: EmoteId) => void; className: string }) {
  const [picking, setPicking] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // e.code는 한글 입력 상태에서도 같다.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPicking(false)
      if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || document.querySelector('dialog[open]')) return
      const emote = EMOTES[Number(event.code.replace('Digit', '')) - 1]
      if (emote) onEmote(emote.id)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onEmote])

  useEffect(() => {
    if (!picking) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setPicking(false)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [picking])

  return (
    <div ref={root} className="relative shrink-0">
      {picking && (
        <div role="group" aria-label="감정 고르기" className="absolute bottom-full left-0 z-20 mb-2 grid w-max grid-cols-3 gap-1 rounded-2xl border-2 border-ink bg-white p-1.5 shadow-[3px_3px_0_var(--color-ink)]">
          {EMOTES.map((emote, index) => (
            <button
              key={emote.id}
              type="button"
              aria-label={emote.label}
              title={`${emote.label} (${index + 1})`}
              {...pressHandlers(() => {
                onEmote(emote.id)
                setPicking(false)
              })}
              className="grid size-11 cursor-pointer touch-none place-items-center rounded-xl text-2xl select-none hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600"
            >
              {emote.symbol}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        aria-label="감정 표현"
        aria-expanded={picking}
        disabled={disabled}
        {...pressHandlers(() => setPicking((current) => !current))}
        className={`grid cursor-pointer touch-none place-items-center border-2 border-ink bg-white text-haru-600 select-none hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 disabled:cursor-default disabled:opacity-50 ${className}`}
      >
        <EmoteIcon />
      </button>
    </div>
  )
}
