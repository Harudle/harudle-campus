import { useRef, type RefObject } from 'react'
import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EMOTES, type EmoteId } from '../../data/emotes'
import type { ActiveEmote } from '../../data/presence'
import { COLORS } from '../../lib/brand'

const EMOTE_Y = 2.95
// 말풍선이 떠 있으면 가리지 않도록 그 위로 올린다.
const EMOTE_Y_ABOVE_SPEECH = 4.3
const EMOTE_SIZE = 0.95
const SHOW_MS = 2500
const POP_MS = 160
const FADE_MS = 300
const RISE = 0.25
const TEXTURE_SIZE = 160

const textures = new Map<EmoteId, THREE.CanvasTexture>()

/** 감정마다 한 장만 그려 모두가 함께 쓴다. */
function emoteTexture(id: EmoteId) {
  const cached = textures.get(id)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_SIZE
  canvas.height = TEXTURE_SIZE
  const ctx = canvas.getContext('2d')!
  const center = TEXTURE_SIZE / 2
  ctx.beginPath()
  ctx.arc(center, center, center - 4, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.paper
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = COLORS.ink
  ctx.stroke()
  ctx.font = `${TEXTURE_SIZE * 0.56}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(EMOTES.find((emote) => emote.id === id)?.symbol ?? '', center, center + TEXTURE_SIZE * 0.03)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  textures.set(id, texture)
  return texture
}

/** 고른 감정을 머리 위에 잠깐 띄운다. */
export function EmoteBubble({ id, emotes, raised }: { id: number; emotes: RefObject<Map<number, ActiveEmote>>; raised: boolean }) {
  const holder = useRef<THREE.Group>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(() => {
    if (!holder.current || !mesh.current || !material.current) return
    const active = emotes.current.get(id)
    const age = active ? performance.now() - active.at : SHOW_MS
    mesh.current.visible = active !== undefined && age < SHOW_MS
    if (!active || age >= SHOW_MS) return
    const map = emoteTexture(active.emote)
    if (material.current.map !== map) {
      material.current.map = map
      material.current.needsUpdate = true
    }
    const pop = Math.min(age / POP_MS, 1)
    mesh.current.scale.setScalar(pop * (1 + Math.sin(pop * Math.PI) * 0.25))
    material.current.opacity = Math.min((SHOW_MS - age) / FADE_MS, 1)
    holder.current.position.y = (raised ? EMOTE_Y_ABOVE_SPEECH : EMOTE_Y) + (age / SHOW_MS) * RISE
  })

  return (
    <group ref={holder}>
      <Billboard>
        <mesh ref={mesh} renderOrder={3} visible={false}>
          <planeGeometry args={[EMOTE_SIZE, EMOTE_SIZE]} />
          <meshBasicMaterial ref={material} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  )
}
