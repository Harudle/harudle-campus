import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { FONT_BODY, FONT_DISPLAY } from '../lib/brand'

export type DrawFn = (ctx: CanvasRenderingContext2D, width: number, height: number) => void

/** 한글 문구가 들어간 텍스처를 웹폰트로 그린다. 폰트가 늦게 도착하면 한 번 더 그린다. */
export function useCanvasTexture(draw: DrawFn, width: number, height: number) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const result = new THREE.CanvasTexture(canvas)
    result.colorSpace = THREE.SRGBColorSpace
    result.anisotropy = 8
    return result
  }, [width, height])

  useEffect(() => {
    let alive = true
    const canvas = texture.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    const paint = () => {
      ctx.clearRect(0, 0, width, height)
      draw(ctx, width, height)
      texture.needsUpdate = true
    }
    paint()
    Promise.all([
      document.fonts.load(`40px ${FONT_DISPLAY}`, '특종'),
      document.fonts.load(`40px ${FONT_BODY}`, '특종'),
    ]).then(() => {
      if (alive) paint()
    })
    return () => {
      alive = false
      texture.dispose()
    }
  }, [draw, texture, width, height])

  return texture
}
