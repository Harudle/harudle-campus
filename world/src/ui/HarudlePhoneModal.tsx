import { useEffect, useId, useState } from 'react'
import { HARUDLE_URL } from '../lib/brand'
import { HarudleFrame } from './HarudleFrame'
import { useModalDialog } from './useModalDialog'

type HarudlePhoneModalProps = {
  open: boolean
  onClose: () => void
}

/**
 * 전시관 휴대폰 화면이 작게 보일 때 하루들을 휴대폰 화면 크기로 크게 띄운다.
 * 하루들이 막혀 있을 때를 위해 새 창 열기를 늘 함께 둔다.
 */
export function HarudlePhoneModal({ open, onClose }: HarudlePhoneModalProps) {
  const { dialogRef, contentRef } = useModalDialog(open)
  const titleId = useId()
  // 처음 열 때 불러오고, 닫았다 다시 열어도 보던 화면이 그대로 남게 한다.
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (open) setLoaded(true)
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="harudle-phone-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <section ref={contentRef} tabIndex={-1} className="flex h-full flex-col outline-none">
        <header className="flex items-center gap-2 px-3 pt-2 pb-2">
          <h2 id={titleId} className="min-w-0 flex-1 truncate font-display text-xl leading-none text-white">
            하루들
          </h2>
          <a
            href={HARUDLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-9 rounded-full border-2 border-white/70 px-3 py-1 text-sm text-white transition hover:bg-white/15 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-butter"
          >
            새 창으로 ↗
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="휴대폰 닫기"
            className="grid size-9 cursor-pointer place-items-center rounded-full border-2 border-white/70 text-lg leading-none text-white transition hover:bg-white/15 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-butter pointer-coarse:size-11"
          >
            ✕
          </button>
        </header>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[22px] bg-paper">
          <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-sm leading-relaxed text-haru-800">
            하루들을 불러오는 중이에요.
            <br />
            화면이 계속 비어 있으면 위의 ‘새 창으로’를 눌러 주세요.
          </p>
          {loaded && <HarudleFrame className="relative size-full border-0 bg-transparent" />}
        </div>
      </section>
    </dialog>
  )
}
