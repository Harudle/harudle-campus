import { useMemo, useState } from 'react'
import { RoundedBox, useCursor } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { RelayEpisode } from '../../data/relayEpisodes'
import { COLORS, FONT_DISPLAY } from '../../lib/brand'
import { Toon } from '../toon'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'
import { useWorkTexture } from '../gallery/Artwork'

const WOOD = '#B9855A'
const LIGHT_COLOR = '#FFE9B5'
const COMIC_SIZE = 3.1
const COMIC_Y = 3.15
const LIGHT_Y = 9

const drawWaiting: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.paper
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = COLORS.lavender300
  ctx.lineWidth = w * 0.012
  ctx.setLineDash([w * 0.04, w * 0.03])
  ctx.strokeRect(w * 0.06, h * 0.06, w * 0.88, h * 0.88)
  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${h * 0.1}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('첫 화를', w / 2, h * 0.43)
  ctx.fillText('기다리고 있어요', w / 2, h * 0.57)
}

/** 가장 최근 화를 올려 둔 이젤. 위에서 핀 조명을 받는다. */
export function RelayEasel({ episode, x, z, disabled, onOpen }: {
  episode: RelayEpisode | null
  x: number
  z: number
  disabled: boolean
  onOpen: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [light] = useState(() => new THREE.SpotLight())
  const work = useWorkTexture(episode?.imageUrl)
  const drawPlaque = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      ctx.fillStyle = COLORS.paper
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = COLORS.primaryDeep
      ctx.font = `${h * 0.56}px ${FONT_DISPLAY}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(episode ? `최신 ${episode.number}화 · ${episode.author} 작가` : '눌러서 1화 올리기', w / 2, h / 2)
    },
    [episode],
  )
  const waiting = useCanvasTexture(drawWaiting, 512, 512)
  const plaque = useCanvasTexture(drawPlaque, 640, 96)

  useCursor(hovered && !disabled)

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.delta > 6 || disabled) return
    onOpen()
  }

  return (
    <group position={[x, 0, z]}>
      {/* 다리 세 개 */}
      <mesh position={[-1.1, 1.9, 0.1]} rotation-z={-0.14} castShadow>
        <boxGeometry args={[0.14, 3.9, 0.14]} />
        <Toon color={WOOD} />
      </mesh>
      <mesh position={[1.1, 1.9, 0.1]} rotation-z={0.14} castShadow>
        <boxGeometry args={[0.14, 3.9, 0.14]} />
        <Toon color={WOOD} />
      </mesh>
      <mesh position={[0, 1.9, -0.6]} rotation-x={0.3} castShadow>
        <boxGeometry args={[0.14, 3.9, 0.14]} />
        <Toon color={WOOD} />
      </mesh>
      <RoundedBox args={[3.4, 0.16, 0.34]} radius={0.04} position={[0, COMIC_Y - COMIC_SIZE / 2 - 0.1, 0.16]} castShadow>
        <Toon color={WOOD} />
      </RoundedBox>

      <RoundedBox args={[COMIC_SIZE + 0.2, COMIC_SIZE + 0.2, 0.08]} radius={0.03} position={[0, COMIC_Y, 0.2]} castShadow>
        <Toon color={COLORS.paper} />
      </RoundedBox>
      <mesh position={[0, COMIC_Y, 0.25]}>
        <planeGeometry args={[COMIC_SIZE, COMIC_SIZE]} />
        <meshBasicMaterial map={work ?? waiting} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.98, 0.32]}>
        <planeGeometry args={[3, 0.45]} />
        <meshBasicMaterial map={plaque} toneMapped={false} />
      </mesh>

      {/* 핀 조명: 실제 빛에 보이는 빛줄기와 바닥 빛 웅덩이를 더한다. */}
      <primitive object={light} position={[0, LIGHT_Y, 2]} color={LIGHT_COLOR} intensity={60} angle={0.42} penumbra={0.5} distance={18} decay={1.6} />
      <primitive object={light.target} position={[0, COMIC_Y, 0]} />
      <mesh position={[0, LIGHT_Y / 2, 0.8]} rotation-x={-0.06}>
        <coneGeometry args={[3.1, LIGHT_Y, 32, 1, true]} />
        <meshBasicMaterial color={LIGHT_COLOR} transparent opacity={0.05} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.03, 0.8]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[3.1, 40]} />
        <meshBasicMaterial color={LIGHT_COLOR} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
      </mesh>

      <mesh
        position={[0, 2.6, 0.2]}
        onPointerOver={(event) => {
          event.stopPropagation()
          if (event.pointerType === 'mouse') setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
      >
        <boxGeometry args={[3.8, 5.2, 1.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
