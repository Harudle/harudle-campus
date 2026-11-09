const PILL =
  'pointer-events-auto min-h-11 cursor-pointer rounded-full border-2 border-ink px-4 py-2 font-display text-ink shadow-[3px_3px_0_var(--color-ink)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600'

type EaselHudProps = {
  /** 내가 붓을 들고 있는지 */
  holding: boolean
  /** 바닥의 붓을 주울 수 있는 거리인지 */
  nearBrush: boolean
  nearEasel: boolean
  onPick: () => void
  onOpenCanvas: () => void
  onDrop: () => void
  onOpenSketchbook: () => void
}

/**
 * 이젤 붓 줍기 버튼과, 붓을 든 동안 쓰는 그림판 열기·내려놓기. 이젤 가까이에서는 누구나 지난 그림 스케치북을 연다.
 * PC는 아래 버튼 줄 위에, 휴대폰은 조작 버튼을 피해 알림 줄 아래에 둔다.
 */
export function EaselHud({ holding, nearBrush, nearEasel, onPick, onOpenCanvas, onDrop, onOpenSketchbook }: EaselHudProps) {
  if (!holding && !nearBrush && !nearEasel) return null
  return (
    <div className="pointer-events-none absolute top-32 right-0 left-0 z-10 flex flex-wrap justify-center gap-2 px-4 pointer-fine:top-auto pointer-fine:bottom-20">
      {nearEasel && (
        <button type="button" onClick={onOpenSketchbook} className={`${PILL} bg-white`}>
          📖 스케치북
        </button>
      )}
      {!holding && nearBrush && (
        <button type="button" onClick={onPick} className={`${PILL} bg-butter`}>
          🖌️ 이젤 붓 줍기
          <span className="pointer-coarse:hidden"> (Space)</span>
        </button>
      )}
      {holding && (
        <>
          {nearEasel ? (
            <button type="button" onClick={onOpenCanvas} className={`${PILL} bg-butter`}>
              🎨 그림판 열기
            </button>
          ) : (
            <p className="pointer-events-none rounded-full border-2 border-ink bg-white px-4 py-2 font-display text-haru-600">이젤로 가서 그려요</p>
          )}
          <button type="button" onClick={onDrop} className={`${PILL} bg-white`}>
            붓 내려놓기
          </button>
        </>
      )}
    </div>
  )
}
