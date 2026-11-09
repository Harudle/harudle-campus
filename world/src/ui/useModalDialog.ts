import { useEffect, useRef } from 'react'

/** 네이티브 dialog가 포커스 가두기, Esc 닫기, 포커스 복귀를 처리한다. */
export function useModalDialog(open: boolean) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const contentRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // 닫기 버튼 대신 본문 맨 위부터 읽히도록 포커스를 둔다.
      contentRef.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return { dialogRef, contentRef }
}
