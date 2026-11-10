import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { FONT_DISPLAY } from '../../lib/brand'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'

const TEXTURE_WIDTH = 768

/** 후처리 없이 빛나 보이도록 번진 글자와 가산 합성한 후광을 겹친 네온 간판 */
export function NeonSign({ text, color, position, width, height }: {
  text: string
  color: string
  position: [number, number, number]
  width: number
  height: number
}) {
  const halo = useRef<THREE.MeshBasicMaterial>(null)
  const reducedMotion = usePrefersReducedMotion()
  const textureHeight = Math.round((TEXTURE_WIDTH * height) / width)

  const drawText = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      let size = h * 0.62
      ctx.font = `${size}px ${FONT_DISPLAY}`
      while (size > 12 && ctx.measureText(text).width > w * 0.86) {
        size -= 2
        ctx.font = `${size}px ${FONT_DISPLAY}`
      }
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = color
      ctx.fillStyle = color
      for (const blur of [34, 18]) {
        ctx.shadowBlur = blur
        ctx.fillText(text, w / 2, h / 2)
      }
      ctx.shadowBlur = 6
      ctx.fillStyle = '#ffffff'
      ctx.fillText(text, w / 2, h / 2)
    },
    [text, color],
  )
  const drawHalo = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.scale(w / 2, h / 2)
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
      glow.addColorStop(0, color)
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(-1, -1, 2, 2)
      ctx.restore()
    },
    [color],
  )
  const textTexture = useCanvasTexture(drawText, TEXTURE_WIDTH, textureHeight)
  const haloTexture = useCanvasTexture(drawHalo, 256, 128)

  useFrame(({ clock }) => {
    if (!halo.current) return
    const time = clock.elapsedTime
    // 낡은 네온처럼 가끔 살짝 깜빡인다.
    const flicker = Math.sin(time * 2.1) * 0.06 + (Math.sin(time * 13) > 0.97 ? -0.15 : 0)
    halo.current.opacity = reducedMotion ? 0.5 : 0.5 + flicker
  })

  return (
    <group position={position}>
      <mesh position-z={-0.02} scale={[1.25, 1.9, 1]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          ref={halo}
          map={haloTexture}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={textTexture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
