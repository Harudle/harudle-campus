import { useEffect, useMemo, useRef, useState } from 'react'
import { RoundedBox, useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { GalleryWork } from '../../data/galleryWorks'
import { COLORS, FONT_BODY, FONT_DISPLAY } from '../../lib/brand'
import { Toon } from '../toon'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'
import { isShown } from '../visibility'

const TEXTURE_SIZE = 640
const FRAME_COLORS = [COLORS.primaryDeep, COLORS.butter, COLORS.lavender300, COLORS.blush]

// S3 CORS가 harudle.com만 허용해서 3D 텍스처는 우리 서버(개발 중에는 Vite)를 거쳐 받는다.
function textureUrl(imageUrl: string) {
  const url = new URL(imageUrl)
  return `/s3-image${url.pathname}${url.search}`
}

/** 960px 원본은 작품 수만큼 쌓이면 GPU 메모리를 많이 써서 줄여서 올린다. */
export function useWorkTexture(imageUrl: string | undefined) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null)
  const loaded = useRef<THREE.CanvasTexture | null>(null)

  // 이미 올린 텍스처는 URL이 갱신되어도 그대로 쓰고, 실패했던 작품만 새 URL로 다시 시도한다.
  useEffect(() => {
    if (!imageUrl || loaded.current) return
    let cancelled = false
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = textureUrl(imageUrl)
    image
      .decode()
      .then(() => {
        if (cancelled) return
        const canvas = document.createElement('canvas')
        canvas.width = TEXTURE_SIZE
        canvas.height = TEXTURE_SIZE
        canvas.getContext('2d')!.drawImage(image, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
        const next = new THREE.CanvasTexture(canvas)
        next.colorSpace = THREE.SRGBColorSpace
        next.anisotropy = 8
        loaded.current = next
        setTexture(next)
      })
      .catch(() => {
        // 불러오지 못한 작품은 준비 중 그림으로 둔다. 클릭하면 상세 화면에서 볼 수 있다.
      })
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  useEffect(
    () => () => {
      loaded.current?.dispose()
      loaded.current = null
    },
    [],
  )

  return texture
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let result = text
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1)
  return `${result}…`
}

const drawWaiting: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.lavender100
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${h * 0.1}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('작품을 걸고 있어요', w / 2, h / 2)
}

function Plaque({ work, width }: { work: GalleryWork; width: number }) {
  const draw = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      ctx.fillStyle = COLORS.paper
      ctx.fillRect(0, 0, w, h)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = COLORS.ink
      ctx.font = `${h * 0.36}px ${FONT_DISPLAY}`
      ctx.fillText(fitText(ctx, work.nickname, w * 0.92), w / 2, h * 0.33)
      ctx.fillStyle = COLORS.primaryDeep
      ctx.font = `${h * 0.27}px ${FONT_BODY}`
      ctx.fillText(`${work.category} · ♥ ${work.likeCount}`, w / 2, h * 0.73)
    },
    [work.nickname, work.category, work.likeCount],
  )
  const texture = useCanvasTexture(draw, 512, 136)
  const height = (width * 136) / 512
  return (
    <group>
      <mesh>
        <boxGeometry args={[width + 0.08, height + 0.08, 0.05]} />
        <Toon color={COLORS.paper} outlineThickness={1} />
      </mesh>
      <mesh position-z={0.03}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

type ArtworkProps = {
  work: GalleryWork | undefined
  frameIndex: number
  size: number
  position: [number, number, number]
  rotationY: number
  paused: boolean
  onSelect: (work: GalleryWork) => void
}

/** 벽에 거는 액자. 벽 쪽 뒷면이 원점이고 +z 방향을 바라본다. */
export function Artwork({ work, frameIndex, size, position, rotationY, paused, onSelect }: ArtworkProps) {
  const texture = useWorkTexture(work?.imageUrl)
  const waiting = useCanvasTexture(drawWaiting, 512, 512)
  const [hovered, setHovered] = useState(false)
  const root = useRef<THREE.Group>(null)
  const lifted = useRef<THREE.Group>(null)
  const active = hovered && !paused && Boolean(work)

  useCursor(active)

  useFrame(({ camera }, delta) => {
    // 카메라가 벽 뒤로 넘어가면 액자 뒷면 대신 아무것도 보이지 않게 한다.
    if (root.current) {
      const dx = camera.position.x - position[0]
      const dz = camera.position.z - position[2]
      root.current.visible = dx * Math.sin(rotationY) + dz * Math.cos(rotationY) > 0
    }
    if (!lifted.current) return
    const scale = THREE.MathUtils.damp(lifted.current.scale.x, active ? 1.05 : 1, 12, delta)
    lifted.current.scale.setScalar(scale)
  })

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!isShown(event.eventObject)) return
    event.stopPropagation()
    if (event.delta > 6 || !work) return
    onSelect(work)
  }

  const plaqueWidth = Math.min(size * 0.74, 2.2)

  return (
    <group ref={root} position={position} rotation-y={rotationY}>
      <group
        ref={lifted}
        onPointerOver={(event) => {
          if (!isShown(event.eventObject)) return
          event.stopPropagation()
          if (event.pointerType === 'mouse') setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
      >
        <RoundedBox args={[size + 0.3, size + 0.3, 0.14]} radius={0.04} position-z={0.07} castShadow>
          <Toon color={FRAME_COLORS[frameIndex % FRAME_COLORS.length]} />
        </RoundedBox>
        <mesh position-z={0.145}>
          <planeGeometry args={[size, size]} />
          <meshBasicMaterial map={texture ?? waiting} toneMapped={false} />
        </mesh>
      </group>
      {work && (
        <group position={[0, -size / 2 - 0.42, 0.03]}>
          <Plaque work={work} width={plaqueWidth} />
        </group>
      )}
    </group>
  )
}
