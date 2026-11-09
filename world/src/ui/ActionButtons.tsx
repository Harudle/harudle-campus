import { useCallback, useEffect, useLayoutEffect, useState, type ButtonHTMLAttributes, type RefObject } from 'react'
import type { ThrowRequest } from '../data/presence'
import type { JoystickInput } from '../scene/gallery/Player'
import { sceneCanvasOf } from '../scene/WebScreen'

const NOTICE_SECONDS = 2.5
const FOOTER_GAP = 10
const SWALLOW_CLICK_MS = 500
const BUTTON =
  'grid size-14 cursor-pointer touch-none place-items-center rounded-full border-2 border-ink bg-white text-haru-600 shadow-[3px_3px_0_var(--color-ink)] select-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 aria-pressed:bg-haru-600 aria-pressed:text-white'

/** 구겨진 종이 뭉치 */
function PaperIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M7 4.5 13 3l6 3.5 2 6-3 6-6.5 2.5L5 18l-2.5-6z" />
      <path d="m7 4.5 3 6-7.5 1.5M10 10.5l6 2.5 3-6.5M16 13l-4.5 8" />
    </svg>
  )
}

function JumpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M5 12l7-7 7 7M12 5v11M6 20.5h12" />
    </svg>
  )
}

/**
 * 조이스틱을 누른 손가락이 있으면 다른 손가락의 click이 오지 않아서 닿는 순간 반응한다.
 * 키보드로 누른 click(detail 0)만 따로 받는다.
 */
export function pressHandlers(action: () => void): ButtonHTMLAttributes<HTMLButtonElement> {
  return {
    onPointerDown: action,
    onClick: (event) => {
      if (event.detail === 0) action()
    },
  }
}

type ActionButtonsProps = {
  controls: RefObject<JoystickInput>
  throwRequest: RefObject<ThrowRequest | null>
  hitNotice: { text: string; key: number } | null
}

/** 공간마다 아래쪽 버튼 줄 수가 달라서, 겹치지 않게 그 위에 놓을 높이를 잰다. */
function useBottomAboveFooter() {
  const [bottom, setBottom] = useState<number>()

  useLayoutEffect(() => {
    const footer = document.querySelector('footer')
    if (!footer) return
    const measure = () => setBottom(window.innerHeight - footer.getBoundingClientRect().top + FOOTER_GAP)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(footer)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  return bottom
}

/**
 * 던지기 버튼을 누른 뒤의 터치를 조준으로 받는다. 3D 화면을 누른 것만 가로채고, 걷기 조이스틱은 그대로 쓸 수 있다.
 * 이 터치로 캐릭터가 걸어가거나 화면이 돌지 않게 뒤따르는 click까지 막는다.
 */
function useAimTouch(aiming: boolean, onAim: (point: { x: number; y: number }) => void) {
  useEffect(() => {
    if (!aiming) return
    const handlePointerDown = (event: PointerEvent) => {
      const canvas = sceneCanvasOf(event.target)
      if (!canvas) return
      event.stopPropagation()
      event.preventDefault()
      const swallowClick = (click: MouseEvent) => click.stopPropagation()
      window.addEventListener('click', swallowClick, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallowClick, { capture: true }), SWALLOW_CLICK_MS)
      const rect = canvas.getBoundingClientRect()
      onAim({ x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: -((event.clientY - rect.top) / rect.height) * 2 + 1 })
    }
    window.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
  }, [aiming, onAim])
}

/** 휴대폰용 점프와 던지기 버튼, 종이에 맞았다는 알림. 달리기는 조이스틱을 끝까지 밀면 된다. PC는 키보드로 조작한다. */
export function ActionButtons({ controls, throwRequest, hitNotice }: ActionButtonsProps) {
  const [notice, setNotice] = useState('')
  const bottom = useBottomAboveFooter()
  const [aiming, setAiming] = useState(false)
  const handleAim = useCallback(
    (point: { x: number; y: number }) => {
      throwRequest.current = { point }
      setAiming(false)
    },
    [throwRequest],
  )
  useAimTouch(aiming, handleAim)

  useEffect(() => {
    if (!hitNotice) return
    setNotice(hitNotice.text)
    const timer = setTimeout(() => setNotice(''), NOTICE_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [hitNotice])

  return (
    <>
      <p aria-live="polite" className="pointer-events-none absolute top-20 right-0 left-0 text-center">
        {(aiming || notice) && (
          <span className="rounded-full border-2 border-ink bg-white px-4 py-1.5 font-display text-haru-600">
            {aiming ? '던질 사람이나 바닥을 눌러 주세요' : notice}
          </span>
        )}
      </p>
      <div
        role="group"
        aria-label="캐릭터 동작"
        style={{ bottom }}
        className="absolute right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] hidden gap-3 pointer-coarse:flex"
      >
        <button
          type="button"
          aria-label="종이 던지기"
          aria-pressed={aiming}
          {...pressHandlers(() => setAiming((current) => !current))}
          className={BUTTON}
        >
          <PaperIcon />
        </button>
        <button
          type="button"
          aria-label="점프"
          {...pressHandlers(() => {
            controls.current.jump = true
          })}
          className={BUTTON}
        >
          <JumpIcon />
        </button>
      </div>
    </>
  )
}
