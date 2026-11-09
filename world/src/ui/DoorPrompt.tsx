import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useModalDialog } from './useModalDialog'

function DoorPrompt({ destination, onConfirm, onCancel }: { destination: string | null; onConfirm: () => void; onCancel: () => void }) {
  const { dialogRef, contentRef } = useModalDialog(destination !== null)
  const titleId = useId()
  const confirmButton = useRef<HTMLButtonElement>(null)
  const lastDestination = useRef(destination)
  if (destination !== null) lastDestination.current = destination
  const isOpen = destination !== null

  // Enter로 바로 들어갈 수 있게 이동 버튼에 포커스를 둔다.
  useEffect(() => {
    if (isOpen) confirmButton.current?.focus()
  }, [isOpen])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-80 max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-ink bg-paper p-0 shadow-[4px_4px_0_var(--color-ink)] backdrop:bg-ink/25"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <article ref={contentRef} tabIndex={-1} className="p-4 text-center outline-none">
        <h2 id={titleId} className="font-display text-xl text-haru-600">
          {lastDestination.current} 이동할까요?
        </h2>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="grow cursor-pointer rounded-xl border-2 border-ink bg-white px-4 py-2 font-display text-haru-600 transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:min-h-11"
          >
            머무르기
          </button>
          <button
            ref={confirmButton}
            type="button"
            onClick={onConfirm}
            className="grow cursor-pointer rounded-xl border-2 border-ink bg-haru-600 px-4 py-2 font-display text-white transition hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:min-h-11"
          >
            이동하기
          </button>
        </div>
      </article>
    </dialog>
  )
}

/**
 * 문으로 들어가기 전에 한 번 묻는다. describe는 "로비로"처럼 조사까지 붙인 목적지를 돌려준다.
 * 화면 버튼으로 옮기는 것은 이미 고른 것이라 묻지 않고, 3D 공간의 문에만 쓴다.
 */
export function useDoorPrompt(go: (doorId: string) => void, describe: (doorId: string) => string) {
  const [pending, setPending] = useState<string | null>(null)
  const request = useCallback((doorId: string) => setPending((current) => current ?? doorId), [])
  const prompt = (
    <DoorPrompt
      destination={pending === null ? null : describe(pending)}
      onConfirm={() => {
        if (pending !== null) go(pending)
        setPending(null)
      }}
      onCancel={() => setPending(null)}
    />
  )
  return { requestDoor: request, doorPrompt: prompt, doorPromptOpen: pending !== null }
}
