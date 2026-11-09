import { useRef, type PointerEvent, type RefObject } from 'react'
import type { JoystickInput } from '../scene/gallery/Player'

const TRAVEL = 40
const DEAD_ZONE = 0.12
/** 끝까지 밀면 달린다. */
const RUN_STRENGTH = 0.92

/** 터치 화면에서만 보이는 이동 조이스틱. 값은 매 프레임 읽히므로 ref로 넘겨 리렌더를 막는다. */
export function TouchJoystick({ input, onUse }: { input: RefObject<JoystickInput>; onUse?: () => void }) {
  const knob = useRef<HTMLDivElement>(null)
  const pointerId = useRef<number | null>(null)

  const update = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    const scale = Math.min(TRAVEL / (Math.hypot(dx, dy) || 1), 1)
    const x = dx * scale
    const y = dy * scale
    if (knob.current) knob.current.style.transform = `translate(${x}px, ${y}px)`
    const strength = Math.hypot(x, y) / TRAVEL
    input.current.x = strength < DEAD_ZONE ? 0 : x / TRAVEL
    input.current.y = strength < DEAD_ZONE ? 0 : -y / TRAVEL
    input.current.running = strength >= RUN_STRENGTH
    knob.current?.toggleAttribute('data-running', input.current.running)
  }

  const release = () => {
    pointerId.current = null
    input.current.x = 0
    input.current.y = 0
    input.current.running = false
    if (knob.current) {
      knob.current.style.transform = ''
      knob.current.removeAttribute('data-running')
    }
  }

  return (
    <div
      aria-hidden="true"
      data-testid="joystick"
      className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-[calc(1rem+env(safe-area-inset-left))] hidden size-28 touch-none place-items-center rounded-full border-2 border-ink bg-white/60 backdrop-blur-sm select-none pointer-coarse:grid"
      onPointerDown={(event) => {
        if (pointerId.current !== null) return
        pointerId.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        onUse?.()
        update(event)
      }}
      onPointerMove={(event) => {
        if (event.pointerId === pointerId.current) update(event)
      }}
      onPointerUp={(event) => {
        if (event.pointerId === pointerId.current) release()
      }}
      onPointerCancel={(event) => {
        if (event.pointerId === pointerId.current) release()
      }}
    >
      <div ref={knob} className="size-12 rounded-full border-2 border-ink bg-haru-600 shadow-[2px_2px_0_var(--color-ink)] data-running:bg-haru-800" />
    </div>
  )
}
