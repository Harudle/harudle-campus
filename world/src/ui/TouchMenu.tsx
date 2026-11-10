import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/** 메뉴 안의 항목. 누르면 메뉴가 닫힌다. */
export function TouchMenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      data-menu-close
      onClick={onClick}
      className="min-h-11 w-full cursor-pointer rounded-lg px-3 py-2 text-left font-display text-haru-600 hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600"
    >
      {children}
    </button>
  )
}

/** 휴대폰에서 공간을 가리지 않도록 자주 쓰지 않는 버튼을 모아 두는 메뉴. PC에서는 보이지 않는다. */
export function TouchMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={root} className="pointer-events-auto relative hidden shrink-0 pointer-coarse:block">
      <button
        type="button"
        aria-label="메뉴"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="grid size-11 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-xl leading-none text-haru-600 shadow-[3px_3px_0_var(--color-ink)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
      >
        ☰
      </button>
      {open && (
        <div
          id={panelId}
          onClick={(event) => {
            if ((event.target as Element).closest('[data-menu-close]')) setOpen(false)
          }}
          className="absolute top-full right-0 z-30 mt-2 max-h-[calc(100dvh-6rem)] w-56 overflow-y-auto rounded-2xl border-2 border-ink bg-white p-1.5 text-left shadow-[3px_3px_0_var(--color-ink)]"
        >
          {children}
        </div>
      )}
    </div>
  )
}
