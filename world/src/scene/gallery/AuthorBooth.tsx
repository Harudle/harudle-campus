import { useMemo, useRef, useState } from 'react'
import { Billboard, RoundedBox, useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS, FONT_DISPLAY } from '../../lib/brand'
import { drawSketch, Harudle, Haru } from '../Characters'
import { Awning } from '../NewspaperStand'
import { PaperCut } from '../Room'
import { speechBubble } from '../shapes'
import { Toon } from '../toon'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'
import { BOOTH_POSITION, BOOTH_ROTATION_Y } from './layout'

const drawSign: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.primaryDeep
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#ffffff'
  ctx.font = `${h * 0.54}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('하루들 작가 체험', w / 2, h / 2 + h * 0.03)
}

const drawBubble: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${h * 0.5}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('하루들 작가가 되어 볼래요?', w / 2, h / 2 + h * 0.03)
}

/** 누르면 작가 체험 안내를 여는 부스. 전면이 +z다. */
export function AuthorBooth({ paused, onOpen }: { paused: boolean; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false)
  const lifted = useRef<THREE.Group>(null)
  const sign = useCanvasTexture(drawSign, 800, 160)
  const bubbleText = useCanvasTexture(drawBubble, 720, 128)
  const sketch = useCanvasTexture(drawSketch, 256, 256)
  const bubble = useMemo(() => speechBubble(3.4, 0.82, 0.28), [])
  const active = hovered && !paused

  useCursor(active)

  useFrame((_, delta) => {
    if (!lifted.current) return
    const scale = THREE.MathUtils.damp(lifted.current.scale.x, active ? 1.04 : 1, 12, delta)
    lifted.current.scale.setScalar(scale)
  })

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.delta > 6 || paused) return
    onOpen()
  }

  return (
    <group position={BOOTH_POSITION} rotation-y={BOOTH_ROTATION_Y}>
      <group ref={lifted}>
        <RoundedBox args={[3.9, 0.2, 2.5]} radius={0.06} position-y={0.1} castShadow receiveShadow>
          <Toon color={COLORS.primaryDeep} />
        </RoundedBox>
        <RoundedBox args={[3.3, 1.15, 1.2]} radius={0.08} position={[0, 0.78, 0.3]} castShadow receiveShadow>
          <Toon color={COLORS.primary} />
        </RoundedBox>
        <RoundedBox args={[3.6, 0.14, 1.45]} radius={0.05} position={[0, 1.42, 0.3]} castShadow receiveShadow>
          <Toon color={COLORS.paper} />
        </RoundedBox>

        {/* 책상 위 작은 이젤 */}
        <group position={[1, 1.49, 0.4]} rotation-y={-0.25}>
          <RoundedBox args={[0.95, 0.95, 0.05]} radius={0.015} position={[0, 0.5, 0]} rotation-x={-0.18} castShadow>
            <Toon color="#ffffff" outlineColor={COLORS.charcoal} outlineThickness={1.4} />
          </RoundedBox>
          <mesh position={[0, 0.5, 0.03]} rotation-x={-0.18}>
            <planeGeometry args={[0.86, 0.86]} />
            <meshBasicMaterial map={sketch} toneMapped={false} />
          </mesh>
        </group>

        <group position={[-0.65, 0.42, -0.62]} scale={1.05}>
          <Harudle />
        </group>
        <group position={[2.45, 0, 0.2]} rotation-y={-0.5} scale={1.05}>
          <Haru waving />
        </group>

        {[
          [-1.62, 0.8],
          [1.62, 0.8],
          [-1.62, -0.72],
          [1.62, -0.72],
        ].map(([x, z]) => (
          <mesh key={`${x},${z}`} position={[x, 2.25, z]} castShadow>
            <cylinderGeometry args={[0.065, 0.065, 2.05, 8]} />
            <Toon color={COLORS.paper} outlineThickness={1.2} />
          </mesh>
        ))}
        <Awning />

        <group position={[0, 4.06, -0.55]} rotation-x={-0.08}>
          <RoundedBox args={[3.3, 0.8, 0.14]} radius={0.05} castShadow>
            <Toon color={COLORS.primaryDeep} />
          </RoundedBox>
          <mesh position-z={0.075}>
            <planeGeometry args={[3.15, 0.66]} />
            <meshBasicMaterial map={sign} toneMapped={false} />
          </mesh>
        </group>
      </group>

      <group position={[0, 4.6, 0]}>
        <Billboard>
          <group position-x={-0}>
            <PaperCut shape={bubble} depth={0.06} color="#ffffff" outlineThickness={1.3} />
          </group>
          <mesh position={[0, 0.69, 0.07]}>
            <planeGeometry args={[3.05, 0.54]} />
            <meshBasicMaterial map={bubbleText} transparent toneMapped={false} />
          </mesh>
        </Billboard>
      </group>

      {/* 움직여도 호버가 끊기지 않는 판정 상자 */}
      <mesh
        position={[0.3, 2.5, 0.1]}
        onPointerOver={(event) => {
          event.stopPropagation()
          if (event.pointerType === 'mouse') setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
      >
        <boxGeometry args={[5, 5.2, 3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
