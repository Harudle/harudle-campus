import { useEffect, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { COLORS, FONT_DISPLAY } from '../../lib/brand'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'
import type { ArtSlot } from './layout'

const NEAR_FORWARD = 3.2
const NEAR_SIDE_MARGIN = 0.8
const MARK_FORWARD = 2
const DIVE_SECONDS = 0.85
const DIVE_SECONDS_REDUCED = 0.25
const CAMERA_STOP = 1.2
const RING_COUNT = 3

const drawMark: DrawFn = (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = COLORS.butter
  ctx.strokeStyle = COLORS.ink
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.roundRect(8, 8, w - 16, h - 16, h / 2 - 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = COLORS.ink
  ctx.font = `${h * 0.42}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('여기서 점프!', w / 2, h / 2 + 4)
}

type PaintingPortalProps = {
  slot: ArtSlot
  leader: RefObject<THREE.Vector3>
  airborne: RefObject<boolean>
  /** 다른 창이 떠 있거나 전체 보기 중이면 뛰어들지 않는다. */
  disabled: boolean
  diving: boolean
  onNearChange: (near: boolean) => void
  onDive: () => void
  onEntered: () => void
}

/** 뛰어들 수 있는 그림의 표시와 뛰어드는 연출. 그림 앞에서 점프하면 물결이 일고 카메라가 그림 속으로 들어간다. */
export function PaintingPortal({ slot, leader, airborne, disabled, diving, onNearChange, onDive, onEntered }: PaintingPortalProps) {
  const glow = useRef<THREE.Mesh>(null)
  const rings = useRef<THREE.Group>(null)
  const nearNow = useRef(false)
  const dive = useRef<{ elapsed: number; from: THREE.Vector3 } | null>(null)
  const mark = useCanvasTexture(drawMark, 512, 128)
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as unknown as OrbitControlsImpl | null
  const reducedMotion = usePrefersReducedMotion()
  const [x, y, z] = slot.position
  const normalX = Math.sin(slot.rotationY)
  const normalZ = Math.cos(slot.rotationY)

  useEffect(() => () => onNearChange(false), [onNearChange])

  useFrame(({ clock }, delta) => {
    const offsetX = leader.current.x - x
    const offsetZ = leader.current.z - z
    const forward = offsetX * normalX + offsetZ * normalZ
    const side = offsetX * normalZ - offsetZ * normalX
    const near = forward < NEAR_FORWARD && Math.abs(side) < slot.size / 2 + NEAR_SIDE_MARGIN
    if (near !== nearNow.current) {
      nearNow.current = near
      onNearChange(near)
    }
    if (near && !disabled && !diving && airborne.current) onDive()

    if (glow.current) {
      const material = glow.current.material as THREE.MeshBasicMaterial
      material.opacity = reducedMotion ? 0.7 : 0.45 + Math.sin(clock.elapsedTime * 3) * 0.3
    }

    if (!diving) {
      dive.current = null
      if (rings.current) rings.current.visible = false
      return
    }
    dive.current ??= { elapsed: 0, from: camera.position.clone() }
    const state = dive.current
    const duration = reducedMotion ? DIVE_SECONDS_REDUCED : DIVE_SECONDS
    state.elapsed += Math.min(delta, 0.05)
    const progress = Math.min(state.elapsed / duration, 1)
    const eased = progress * progress
    camera.position.lerpVectors(state.from, new THREE.Vector3(x + normalX * CAMERA_STOP, y, z + normalZ * CAMERA_STOP), eased)
    camera.lookAt(x, y, z)
    if (controls) controls.target.set(x, y, z)
    if (rings.current) {
      rings.current.visible = !reducedMotion
      rings.current.children.forEach((ring, index) => {
        const wave = (progress * 1.6 + index / RING_COUNT) % 1
        ring.scale.setScalar(0.2 + wave * slot.size * 0.8)
        ;((ring as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - wave) * 0.8
      })
    }
    if (progress === 1) onEntered()
  })

  return (
    <>
      <group position={slot.position} rotation-y={slot.rotationY}>
        <mesh ref={glow} position-z={0.01}>
          <planeGeometry args={[slot.size + 0.9, slot.size + 0.9]} />
          <meshBasicMaterial color={COLORS.butter} transparent depthWrite={false} toneMapped={false} />
        </mesh>
        <group ref={rings} position-z={0.17} visible={false}>
          {Array.from({ length: RING_COUNT }, (_, index) => (
            <mesh key={index}>
              <ringGeometry args={[0.46, 0.5, 48]} />
              <meshBasicMaterial color="#FFFFFF" transparent depthWrite={false} toneMapped={false} />
            </mesh>
          ))}
        </group>
      </group>
      <mesh position={[x + normalX * MARK_FORWARD, 0.03, z + normalZ * MARK_FORWARD]} rotation={[-Math.PI / 2, 0, slot.rotationY]}>
        <planeGeometry args={[2.8, 0.7]} />
        <meshBasicMaterial map={mark} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  )
}
