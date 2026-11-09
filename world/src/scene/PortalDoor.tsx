import { useMemo, useRef, useState } from 'react'
import { Billboard, useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS, FONT_DISPLAY } from '../lib/brand'
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion'
import { PaperCut } from './Room'
import { Toon } from './toon'
import { useCanvasTexture } from './useCanvasTexture'
import { isShown } from './visibility'

function archShape(width: number, height: number) {
  const half = width / 2
  const shape = new THREE.Shape()
  shape.moveTo(-half, 0)
  shape.lineTo(-half, height - half)
  shape.absarc(0, height - half, half, Math.PI, 0, true)
  shape.lineTo(half, 0)
  shape.closePath()
  return shape
}

const SIGN_Y = 3.95
const SIGN_WIDTH = 2.4
const SIGN_BOB = 0.08

/** 처음 온 사람도 문을 알아보도록 문 위에 띄우는 표지판. 항상 카메라를 본다. */
function DoorSign({ text, color }: { text: string; color: string }) {
  const sign = useRef<THREE.Group>(null)
  const reducedMotion = usePrefersReducedMotion()
  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const boxHeight = h - 34
      ctx.beginPath()
      ctx.roundRect(5, 5, w - 10, boxHeight - 5, 28)
      ctx.moveTo(w / 2 - 20, boxHeight)
      ctx.lineTo(w / 2, h - 5)
      ctx.lineTo(w / 2 + 20, boxHeight)
      ctx.fillStyle = color
      ctx.strokeStyle = COLORS.ink
      ctx.lineWidth = 6
      ctx.stroke()
      ctx.fill()
      ctx.fillStyle = COLORS.ink
      ctx.font = `${boxHeight * 0.58}px ${FONT_DISPLAY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, w / 2, boxHeight / 2 + 5, w - 40)
    },
    [text, color],
  )
  const texture = useCanvasTexture(draw, 384, 176)

  useFrame(({ clock }) => {
    if (sign.current) sign.current.position.y = SIGN_Y + (reducedMotion ? 0 : Math.sin(clock.elapsedTime * 2.4) * SIGN_BOB)
  })

  return (
    <Billboard ref={sign} position-y={SIGN_Y}>
      <mesh>
        <planeGeometry args={[SIGN_WIDTH, (SIGN_WIDTH * 176) / 384]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </Billboard>
  )
}

type PortalDoorProps = {
  label: string
  /** 문 위 표지판 글자. 로비처럼 멀리서 보는 문에만 단다. */
  sign?: string
  signColor?: string
  innerColor?: string
  disabled?: boolean
  onEnter: () => void
}

/** 다른 공간으로 넘어가는 아치형 문. 밑변 중앙이 원점이고 +z를 바라본다. */
export function PortalDoor({ label, sign, signColor, innerColor = COLORS.butter, disabled = false, onEnter }: PortalDoorProps) {
  const [hovered, setHovered] = useState(false)
  const scaler = useRef<THREE.Group>(null)
  const outer = useMemo(() => archShape(2.1, 3.1), [])
  const inner = useMemo(() => archShape(1.5, 2.65), [])
  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.fillStyle = COLORS.primaryDeep
      ctx.font = `${h * 0.68}px ${FONT_DISPLAY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, w / 2, h / 2 + h * 0.03)
    },
    [label],
  )
  const texture = useCanvasTexture(draw, 256, 96)
  const active = hovered && !disabled

  useCursor(active)

  useFrame((_, delta) => {
    if (!scaler.current) return
    const scale = THREE.MathUtils.damp(scaler.current.scale.x, active ? 1.06 : 1, 12, delta)
    scaler.current.scale.setScalar(scale)
  })

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!isShown(event.eventObject)) return
    event.stopPropagation()
    if (event.delta > 6 || disabled) return
    onEnter()
  }

  return (
    <group
      onPointerOver={(event) => {
        if (!isShown(event.eventObject)) return
        event.stopPropagation()
        if (event.pointerType === 'mouse') setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
      onClick={handleClick}
    >
      <group ref={scaler}>
        <PaperCut shape={outer} depth={0.14} color={COLORS.primaryDeep} />
        <group position-z={0.15}>
          <PaperCut shape={inner} depth={0.04} color={innerColor} outlineThickness={1.2} />
        </group>
        <mesh position={[0.5, 1.2, 0.23]}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <Toon color={COLORS.primaryDeep} outlineThickness={1} />
        </mesh>
        <mesh position={[0, 1.95, 0.2]}>
          <planeGeometry args={[1.35, 0.5]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
      </group>
      {sign && <DoorSign text={sign} color={signColor ?? innerColor} />}
    </group>
  )
}
