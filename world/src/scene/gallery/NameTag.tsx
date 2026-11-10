import { useMemo } from 'react'
import { Billboard } from '@react-three/drei'
import { COLORS, FONT_DISPLAY } from '../../lib/brand'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'

const TAG_Y = 2.25
const TAG_HEIGHT = 0.34
const TEXTURE_WIDTH = 320
const TEXTURE_HEIGHT = 64

/** 캐릭터 머리 위 닉네임. 이름이 없으면 그리지 않는다. */
export function NameTag({ name }: { name: string }) {
  const draw = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      ctx.font = `${h * 0.62}px ${FONT_DISPLAY}`
      const width = Math.min(ctx.measureText(name).width + h * 0.7, w)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
      ctx.beginPath()
      ctx.roundRect((w - width) / 2, 0, width, h, h / 2)
      ctx.fill()
      ctx.fillStyle = COLORS.primaryDeep
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(name, w / 2, h / 2 + h * 0.03, w - h * 0.5)
    },
    [name],
  )
  const texture = useCanvasTexture(draw, TEXTURE_WIDTH, TEXTURE_HEIGHT)

  if (!name) return null
  return (
    <Billboard position-y={TAG_Y}>
      <mesh>
        <planeGeometry args={[(TAG_HEIGHT * TEXTURE_WIDTH) / TEXTURE_HEIGHT, TAG_HEIGHT]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </Billboard>
  )
}
