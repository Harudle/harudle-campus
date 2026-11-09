import { useMemo, useRef, type ReactNode } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS, FONT_DISPLAY, SLOGAN } from '../lib/brand'
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion'
import { PopUp } from './PopUp'
import { cloud, scallopedWall, speechBubble, star } from './shapes'
import { Toon } from './toon'
import { useCanvasTexture, type DrawFn } from './useCanvasTexture'

const FLOOR_WIDTH = 16
const FLOOR_DEPTH = 11

const drawFloor: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.paper
  ctx.fillRect(0, 0, w, h)

  // 네컷 칸을 연상시키는 바닥 격자
  ctx.strokeStyle = COLORS.lavender100
  ctx.lineWidth = 10
  for (let x = 128; x < w; x += 256) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
  for (let y = 88; y < h; y += 256) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  // 책등
  const spine = ctx.createLinearGradient(w / 2 - 70, 0, w / 2 + 70, 0)
  spine.addColorStop(0, 'rgba(115,85,218,0)')
  spine.addColorStop(0.5, 'rgba(115,85,218,0.16)')
  spine.addColorStop(1, 'rgba(115,85,218,0)')
  ctx.fillStyle = spine
  ctx.fillRect(w / 2 - 70, 0, 140, h)

  // 가판대 아래 러그
  ctx.fillStyle = COLORS.lavender200
  ctx.beginPath()
  ctx.ellipse(w / 2, h * 0.56, 500, 400, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = COLORS.paper
  ctx.lineWidth = 12
  ctx.setLineDash([36, 28])
  ctx.beginPath()
  ctx.ellipse(w / 2, h * 0.56, 455, 358, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
}

const drawSlogan: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.primaryDeep
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#ffffff'
  ctx.font = `${h * 0.56}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(SLOGAN, w / 2, h / 2 + h * 0.03)
}

function bubbleTextDraw(text: string, fontScale = 0.72): DrawFn {
  return (ctx, w, h) => {
    ctx.fillStyle = COLORS.ink
    ctx.font = `${h * fontScale}px ${FONT_DISPLAY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h / 2 + h * 0.03)
  }
}

const drawKeke = bubbleTextDraw('ㅋㅋㅋ', 1.1)
const drawMyStory = bubbleTextDraw('내 얘기잖아')

export function PaperCut({ shape, depth = 0.14, color, outlineThickness, castShadow = true }: {
  shape: THREE.Shape
  depth?: number
  color: string
  outlineThickness?: number
  castShadow?: boolean
}) {
  const geometry = useMemo(
    () => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 }),
    [shape, depth],
  )
  return (
    <mesh geometry={geometry} castShadow={castShadow} receiveShadow>
      <Toon color={color} outlineThickness={outlineThickness} />
    </mesh>
  )
}

function SloganBanner() {
  const texture = useCanvasTexture(drawSlogan, 1400, 180)
  return (
    <group position={[0, 5.72, 0.2]}>
      <RoundedBox args={[8.3, 1.06, 0.12]} radius={0.05} castShadow>
        <Toon color={COLORS.primaryDeep} />
      </RoundedBox>
      <mesh position-z={0.065}>
        <planeGeometry args={[8.1, 1.04]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function Tree({ position, scale = 1, color = COLORS.primary }: {
  position: [number, number, number]
  scale?: number
  color?: string
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position-y={0.5} castShadow>
        <cylinderGeometry args={[0.13, 0.18, 1, 6]} />
        <Toon color="#B9916E" />
      </mesh>
      <mesh position-y={1.45} castShadow>
        <icosahedronGeometry args={[0.72, 0]} />
        <Toon color={color} />
      </mesh>
      <mesh position={[0.15, 2.1, 0.05]} rotation={[0.4, 0.6, 0]} castShadow>
        <icosahedronGeometry args={[0.46, 0]} />
        <Toon color={COLORS.lavender300} />
      </mesh>
    </group>
  )
}

function Pencil() {
  return (
    <group position={[4.4, 0.27, 3.3]} rotation={[0, 0.5, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.26, 0.26, 3.2, 6]} />
        <Toon color={COLORS.butter} />
      </mesh>
      <mesh position-y={1.82} castShadow>
        <cylinderGeometry args={[0.27, 0.27, 0.44, 6]} />
        <Toon color={COLORS.blush} />
      </mesh>
      <mesh position-y={-1.87} rotation-x={Math.PI} castShadow>
        <coneGeometry args={[0.26, 0.54, 6]} />
        <Toon color="#F5D9B8" />
      </mesh>
    </group>
  )
}

function ComicStack() {
  const books = [
    { color: COLORS.primaryDeep, y: 0.1, r: 0.12 },
    { color: COLORS.butter, y: 0.3, r: -0.1 },
    { color: COLORS.lavender300, y: 0.5, r: 0.28 },
  ]
  return (
    <group position={[-5.3, 0, 3]}>
      {books.map((book) => (
        <RoundedBox key={book.y} args={[1.7, 0.2, 2.2]} radius={0.04} position-y={book.y} rotation-y={book.r} castShadow receiveShadow>
          <Toon color={book.color} />
        </RoundedBox>
      ))}
    </group>
  )
}

function StandeeBubble({ position, rotationY, width, draw, color }: {
  position: [number, number, number]
  rotationY: number
  width: number
  draw: DrawFn
  color: string
}) {
  const shape = useMemo(() => speechBubble(width, 1.05, 0.34), [width])
  const texture = useCanvasTexture(draw, 512, 128)
  return (
    <group position={position} rotation-y={rotationY}>
      <PopUp delay={0.8}>
        <mesh position={[-0.28, 0.25, -0.02]} castShadow>
          <boxGeometry args={[0.1, 0.5, 0.05]} />
          <Toon color={COLORS.lavender300} />
        </mesh>
        <group position-y={0.45}>
          <PaperCut shape={shape} color={color} />
          <mesh position={[0, 0.34 + 0.525, 0.15]}>
            <planeGeometry args={[width * 0.9, (width * 0.9) / 4]} />
            <meshBasicMaterial map={texture} transparent toneMapped={false} />
          </mesh>
        </group>
      </PopUp>
    </group>
  )
}

function Floating({ position, amplitude = 0.1, speed = 1, phase = 0, children }: {
  position: [number, number, number]
  amplitude?: number
  speed?: number
  phase?: number
  children: ReactNode
}) {
  const ref = useRef<THREE.Group>(null)
  const reducedMotion = usePrefersReducedMotion()
  useFrame(({ clock }) => {
    if (!ref.current || reducedMotion) return
    ref.current.position.y = position[1] + Math.sin(clock.elapsedTime * speed + phase) * amplitude
  })
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  )
}

export function Room() {
  const floorTexture = useCanvasTexture(drawFloor, 2048, 1408)
  const backWall = useMemo(() => scallopedWall(FLOOR_WIDTH, 6.7, 12), [])
  const hills = useMemo(() => scallopedWall(FLOOR_WIDTH, 1.1, 5), [])
  const sideWall = useMemo(() => scallopedWall(5.6, 3, 5), [])
  const cloudShape = useMemo(() => cloud(), [])
  const starShape = useMemo(() => star(0.34, 0.15), [])

  return (
    <group>
      {/* 펼쳐진 책: 표지와 종이 뭉치, 그 위의 바닥 */}
      <RoundedBox args={[FLOOR_WIDTH + 1.1, 0.3, FLOOR_DEPTH + 1]} radius={0.12} position-y={-0.39} receiveShadow>
        <Toon color={COLORS.primaryDeep} outline={false} />
      </RoundedBox>
      <mesh position-y={-0.14}>
        <boxGeometry args={[FLOOR_WIDTH, 0.25, FLOOR_DEPTH]} />
        <Toon color="#ffffff" outline={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[FLOOR_WIDTH, FLOOR_DEPTH]} />
        <Toon map={floorTexture} outline={false} />
      </mesh>

      {/* 뒷벽: 책을 펼치면 일어나는 팝업 페이지 */}
      <group position={[0, 0, -FLOOR_DEPTH / 2 + 0.1]}>
        <PopUp delay={0.05}>
          <group>
            <PaperCut shape={backWall} depth={0.18} color={COLORS.lavender100} />
            <SloganBanner />
            <group position={[-5.9, 5.65, 0.2]}>
              <PaperCut shape={starShape} depth={0.08} color={COLORS.butter} outlineThickness={1.3} />
            </group>
            <group position={[5.9, 5.65, 0.2]}>
              <PaperCut shape={starShape} depth={0.08} color={COLORS.butter} outlineThickness={1.3} />
            </group>
          </group>
        </PopUp>
      </group>

      {/* 앞쪽 언덕 레이어 */}
      <group position={[0, 0, -FLOOR_DEPTH / 2 + 1.25]}>
        <PopUp delay={0.25}>
          <PaperCut shape={hills} color={COLORS.lavender200} />
        </PopUp>
      </group>

      {/* 양옆 날개 벽 */}
      <group position={[-7.4, 0, -2.75]} rotation-y={Math.PI / 2 - 0.18}>
        <PopUp delay={0.2}>
          <PaperCut shape={sideWall} depth={0.16} color={COLORS.lavender200} />
        </PopUp>
      </group>
      <group position={[7.4, 0, -2.75]} rotation-y={-Math.PI / 2 + 0.18}>
        <PopUp delay={0.2}>
          <PaperCut shape={sideWall} depth={0.16} color={COLORS.lavender200} />
        </PopUp>
      </group>

      {/* 소품 */}
      <group position={[-6.3, 0, -3.1]}>
        <PopUp delay={0.65} mode="grow">
          <Tree position={[0, 0, 0]} scale={1.15} />
        </PopUp>
      </group>
      <group position={[5, 0, -3]}>
        <PopUp delay={0.7} mode="grow">
          <Tree position={[0, 0, 0]} scale={1.3} color={COLORS.primaryDeep} />
        </PopUp>
      </group>
      <group position={[-7.1, 0, 2.3]}>
        <PopUp delay={0.75} mode="grow">
          <Tree position={[0, 0, 0]} scale={0.8} color={COLORS.lavender300} />
        </PopUp>
      </group>
      <PopUp delay={0.85} mode="grow">
        <Pencil />
        <ComicStack />
      </PopUp>

      <StandeeBubble position={[-3.8, 0, 0.3]} rotationY={0.3} width={1.8} draw={drawKeke} color="#ffffff" />
      <StandeeBubble position={[3.5, 0, -0.9]} rotationY={-0.3} width={2.5} draw={drawMyStory} color={COLORS.butter} />

      <Floating position={[-6.7, 6.5, -4.9]} amplitude={0.1} speed={0.7}>
        <PaperCut shape={cloudShape} depth={0.2} color="#ffffff" castShadow={false} />
      </Floating>
      <Floating position={[6.9, 6.9, -4.7]} amplitude={0.12} speed={0.55} phase={1.4}>
        <group scale={0.8}>
          <PaperCut shape={cloudShape} depth={0.2} color="#ffffff" castShadow={false} />
        </group>
      </Floating>
    </group>
  )
}
