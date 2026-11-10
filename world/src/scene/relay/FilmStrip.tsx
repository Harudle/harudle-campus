import { useMemo, useRef, useState } from 'react'
import { useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { RelayEpisode } from '../../data/relayEpisodes'
import { COLORS, FONT_DISPLAY } from '../../lib/brand'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import { useWorkTexture } from '../gallery/Artwork'
import { Toon } from '../toon'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'
import { isShown } from '../visibility'

const FILM = '#2B2140'
const STRIP_HEIGHT = 3.2
const FRAME_SIZE = 2.5
const HOLE_STEP = 0.5

const drawSprockets: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = FILM
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = COLORS.paper
  const hole = w * 0.5
  ctx.beginPath()
  ctx.roundRect((w - hole) / 2, h * 0.04, hole, h * 0.07, 3)
  ctx.roundRect((w - hole) / 2, h * 0.89, hole, h * 0.07, 3)
  ctx.fill()
}

const drawWaiting: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.lavender200
  ctx.fillRect(0, 0, w, h)
}

/** 필름 칸 하나. 누르면 그 화부터 볼 수 있다. */
function FilmFrame({ episode, offset, disabled, onOpen }: {
  episode: RelayEpisode
  offset: number
  disabled: boolean
  onOpen: (number: number) => void
}) {
  const [hovered, setHovered] = useState(false)
  const comic = useWorkTexture(episode.imageUrl)
  // 재질은 처음부터 텍스처가 있어야 이미지가 도착했을 때 바꿔 끼울 수 있다.
  const waiting = useCanvasTexture(drawWaiting, 64, 64)
  const drawLabel = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      ctx.fillStyle = COLORS.butter
      ctx.font = `${h * 0.8}px ${FONT_DISPLAY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${episode.number}화`, w / 2, h / 2)
    },
    [episode.number],
  )
  const label = useCanvasTexture(drawLabel, 640, 64)

  useCursor(hovered && !disabled)

  return (
    <group position={[offset, 0, 0.03]}>
      <mesh
        scale={hovered && !disabled ? 1.05 : 1}
        onPointerOver={(event) => {
          if (!isShown(event.eventObject)) return
          event.stopPropagation()
          if (event.pointerType === 'mouse') setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          if (!isShown(event.eventObject)) return
          event.stopPropagation()
          if (event.delta > 6 || disabled) return
          onOpen(episode.number)
        }}
      >
        <planeGeometry args={[FRAME_SIZE, FRAME_SIZE]} />
        <meshBasicMaterial map={comic ?? waiting} toneMapped={false} />
      </mesh>
      <mesh position={[0, STRIP_HEIGHT / 2 + 0.28, 0]}>
        <planeGeometry args={[4.4, 0.44]} />
        <meshBasicMaterial map={label} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

function Reel({ x }: { x: number }) {
  const spinner = useRef<THREE.Group>(null)
  const reducedMotion = usePrefersReducedMotion()
  useFrame((_, delta) => {
    if (spinner.current && !reducedMotion) spinner.current.rotation.z -= delta * 0.25
  })
  return (
    <group position={[x, 0, 0.3]}>
      <group ref={spinner}>
        <mesh rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[2.1, 2.1, 0.3, 40]} />
          <Toon color={FILM} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((index) => {
          const angle = (index * Math.PI) / 3
          return (
            <mesh key={index} position={[Math.cos(angle) * 1.25, Math.sin(angle) * 1.25, 0.16]}>
              <circleGeometry args={[0.46, 24]} />
              <meshBasicMaterial color={COLORS.lavender200} toneMapped={false} />
            </mesh>
          )
        })}
        <mesh position-z={0.17}>
          <circleGeometry args={[0.32, 20]} />
          <meshBasicMaterial color={COLORS.butter} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

/** 벽을 따라 길게 이어지는 필름. 양 끝에 큰 릴이 달려 있고, x는 벽 안에서의 가로 위치다. */
export function FilmStrip({ episodes, offsets, length, y, disabled, onOpen }: {
  episodes: RelayEpisode[]
  offsets: number[]
  length: number
  y: number
  disabled: boolean
  onOpen: (number: number) => void
}) {
  const texture = useCanvasTexture(drawSprockets, 64, 256)
  useMemo(() => {
    texture.wrapS = THREE.RepeatWrapping
    texture.repeat.set(length / HOLE_STEP, 1)
  }, [texture, length])

  return (
    <group position={[0, y, 0.04]}>
      <mesh>
        <planeGeometry args={[length, STRIP_HEIGHT]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {episodes.map((episode, index) => (
        <FilmFrame key={episode.number} episode={episode} offset={offsets[index]} disabled={disabled} onOpen={onOpen} />
      ))}
      <Reel x={-length / 2} />
      <Reel x={length / 2} />
    </group>
  )
}
