import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion'

function easeOutBack(t: number) {
  const overshoot = 1.9
  const x = t - 1
  return 1 + (overshoot + 1) * x * x * x + overshoot * x * x
}

type PopUpProps = {
  delay?: number
  /** fold: 책을 펼칠 때처럼 밑변을 축으로 일어선다. grow: 바닥에서 솟아오른다. */
  mode?: 'fold' | 'grow'
  children: ReactNode
}

const DURATION = 0.75

export function PopUp({ delay = 0, mode = 'fold', children }: PopUpProps) {
  const ref = useRef<THREE.Group>(null)
  const elapsed = useRef(0)
  const reducedMotion = usePrefersReducedMotion()

  useFrame((_, delta) => {
    const group = ref.current
    if (!group || elapsed.current >= delay + DURATION) return
    elapsed.current = reducedMotion ? delay + DURATION : elapsed.current + Math.min(delta, 0.05)
    const t = THREE.MathUtils.clamp((elapsed.current - delay) / DURATION, 0, 1)
    const eased = easeOutBack(t)
    if (mode === 'fold') {
      group.rotation.x = -Math.PI / 2 * (1 - eased)
    } else {
      group.scale.setScalar(Math.max(eased, 0.0001))
    }
  })

  return (
    <group ref={ref} rotation-x={mode === 'fold' ? -Math.PI / 2 : 0} scale={mode === 'grow' ? 0.0001 : 1}>
      {children}
    </group>
  )
}
