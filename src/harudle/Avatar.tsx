import { useRef, type RefObject } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { AvatarConfig } from './avatarData'
import { COLORS } from './brand'
import { drawSketch, Ink, INK, Line, Skin, useLegSwing, type WalkMotion } from './Characters'
import { useCanvasTexture } from './useCanvasTexture'

const HEAD_Y = 1.3
const HEAD_RADIUS = 0.34
const CURLS = [-1.15, -0.72, -0.3, 0.14, 0.58, 1.02]

function FaceFeatures({ face }: { face: AvatarConfig['face'] }) {
  const eyes = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    eyes.current?.scale.setY(clock.elapsedTime % 3.6 < 0.12 ? 0.15 : 1)
  })
  const z = HEAD_RADIUS * 0.95
  const eyeX = HEAD_RADIUS * 0.36
  const eyeY = HEAD_RADIUS * 0.08
  const mouthY = -HEAD_RADIUS * 0.2
  return (
    <group>
      <group ref={eyes} position-y={eyeY}>
        <Ink radius={0.032} position={[-eyeX, 0, z]} />
        {face !== 'wink' && <Ink radius={0.032} position={[eyeX, 0, z]} />}
      </group>
      {face === 'wink' && (
        <mesh position={[eyeX, eyeY - 0.01, z]}>
          <torusGeometry args={[0.04, 0.012, 6, 12, Math.PI]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      )}
      {(face === 'smile' || face === 'wink') && (
        <mesh position={[0, mouthY, z + 0.01]} rotation-z={Math.PI}>
          <torusGeometry args={[0.068, 0.012, 6, 14, Math.PI]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      )}
      {face === 'cat' &&
        [-0.042, 0.042].map((x) => (
          <mesh key={x} position={[x, mouthY, z + 0.01]} rotation-z={Math.PI}>
            <torusGeometry args={[0.042, 0.011, 6, 12, Math.PI]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        ))}
      {face === 'surprised' && (
        <mesh position={[0, mouthY - 0.02, z + 0.01]}>
          <torusGeometry args={[0.042, 0.012, 6, 14]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      )}
    </group>
  )
}

function Eyewear({ kind }: { kind: AvatarConfig['eyewear'] }) {
  if (kind === 'none') return null
  const z = HEAD_RADIUS * 0.97
  const y = HEAD_RADIUS * 0.08
  return (
    <group position={[0, y, z]}>
      {[-0.122, 0.122].map((x) => (
        <group key={x} position-x={x}>
          <mesh>
            <torusGeometry args={[0.078, 0.014, 8, 20]} />
            <meshBasicMaterial color={INK} />
          </mesh>
          {kind === 'sunglasses' && (
            <mesh position-z={0.012}>
              <circleGeometry args={[0.076, 20]} />
              <meshBasicMaterial color={INK} />
            </mesh>
          )}
        </group>
      ))}
      <mesh rotation-z={Math.PI / 2}>
        <capsuleGeometry args={[0.012, 0.05, 4, 6]} />
        <meshBasicMaterial color={INK} />
      </mesh>
    </group>
  )
}

/** 나비 모양의 두 날개. 뾰족한 쪽이 가운데 매듭에서 만나고 바깥으로 넓어진다. */
function BowWings({ length, radius, color }: { length: number; radius: number; color: string }) {
  return (
    <>
      {[-1, 1].map((side) => (
        <mesh key={side} position-x={side * (length / 2 + 0.01)} rotation-z={(side * Math.PI) / 2} scale={[1, 1, 0.5]} castShadow>
          <coneGeometry args={[radius, length, 16]} />
          <Skin color={color} thickness={1.2} />
        </mesh>
      ))}
    </>
  )
}

function Headwear({ kind, color, skinColor }: { kind: AvatarConfig['head']; color: string; skinColor: string }) {
  if (kind === 'beret') {
    return (
      <group>
        <mesh position={[0, 0.25, -0.01]} rotation-z={-0.08} scale={[1.1, 0.4, 1.1]} castShadow>
          <sphereGeometry args={[HEAD_RADIUS, 20, 14]} />
          <Skin color={color} />
        </mesh>
        <mesh position-y={0.42}>
          <capsuleGeometry args={[0.022, 0.07, 4, 6]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      </group>
    )
  }
  if (kind === 'curly') {
    return (
      <group>
        {CURLS.map((angle) => (
          <mesh
            key={angle}
            position={[Math.sin(angle) * HEAD_RADIUS, Math.cos(angle) * HEAD_RADIUS + 0.03, 0.02]}
            rotation-z={-angle}
          >
            <torusGeometry args={[0.075, 0.024, 6, 12, Math.PI * 1.25]} />
            <meshBasicMaterial color={color} />
          </mesh>
        ))}
      </group>
    )
  }
  if (kind === 'cap') {
    return (
      <group>
        <mesh position-y={0.09} castShadow>
          <sphereGeometry args={[0.345, 24, 12, 0, Math.PI * 2, 0, 1.455]} />
          <Skin color={color} />
        </mesh>
        <mesh position-y={0.44}>
          <sphereGeometry args={[0.028, 10, 8]} />
          <Skin color={color} thickness={1.1} />
        </mesh>
        {/* 뒤로 쓴 모자라 챙은 뒤통수로 가고, 이마에는 뒤쪽 조임 구멍이 보인다. */}
        <mesh position={[0, 0.16, -0.22]} rotation-x={-0.12} castShadow>
          <cylinderGeometry args={[0.27, 0.27, 0.025, 24, 1, false, Math.PI / 2, Math.PI]} />
          <Skin color={color} thickness={1.3} />
        </mesh>
        <group position={[0, 0.135, 0.345]} rotation-x={-0.26}>
          <mesh>
            <circleGeometry args={[0.085, 18, 0, Math.PI]} />
            <meshBasicMaterial color={skinColor} />
          </mesh>
          <mesh position-z={0.002}>
            <torusGeometry args={[0.085, 0.01, 6, 18, Math.PI]} />
            <meshBasicMaterial color={INK} />
          </mesh>
          <mesh position={[0, 0.006, 0.004]} rotation-z={Math.PI / 2}>
            <capsuleGeometry args={[0.012, 0.15, 4, 6]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        </group>
      </group>
    )
  }
  if (kind === 'ribbon') {
    return (
      <group position={[0.19, 0.3, 0.1]} rotation-z={-0.5}>
        <BowWings length={0.24} radius={0.12} color={color} />
        <mesh scale={[1, 1, 0.8]}>
          <sphereGeometry args={[0.05, 12, 10]} />
          <Skin color={color} thickness={1.2} />
        </mesh>
      </group>
    )
  }
  if (kind === 'crown') {
    return (
      <group position-y={0.3}>
        <mesh castShadow>
          <cylinderGeometry args={[0.22, 0.2, 0.1, 18]} />
          <Skin color={color} thickness={1.3} />
        </mesh>
        {[0, 1, 2, 3, 4].map((index) => {
          const angle = (index / 5) * Math.PI * 2
          return (
            <mesh key={index} position={[Math.sin(angle) * 0.19, 0.11, Math.cos(angle) * 0.19]} castShadow>
              <coneGeometry args={[0.055, 0.14, 6]} />
              <Skin color={color} thickness={1.1} />
            </mesh>
          )
        })}
      </group>
    )
  }
  if (kind === 'bunny') {
    return (
      <group>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.14, 0.46, -0.02]} rotation-z={side * -0.14} scale={[0.34, 1, 0.3]} castShadow>
            <sphereGeometry args={[0.24, 14, 12]} />
            <Skin color={color} />
          </mesh>
        ))}
      </group>
    )
  }
  return null
}

function Outfit({ kind, color }: { kind: AvatarConfig['outfit']; color: string }) {
  if (kind === 'tunic') {
    return (
      <mesh position-y={0.72} castShadow>
        <cylinderGeometry args={[0.12, 0.25, 0.56, 14]} />
        <Skin color={color} />
      </mesh>
    )
  }
  if (kind === 'tee') {
    return (
      <RoundedBox args={[0.38, 0.5, 0.22]} radius={0.05} position-y={0.72} castShadow>
        <Skin color={color} />
      </RoundedBox>
    )
  }
  return (
    <group position-y={0.96}>
      <Line length={0.5} />
    </group>
  )
}

/** 옷 두께가 달라서 앞면에 붙도록 나비넥타이 자리를 옷마다 정한다. 그림판을 들면 그 위로 올린다. */
const BOWTIE_SPOTS: Record<AvatarConfig['outfit'], [number, number]> = {
  stick: [0.9, 0.05],
  tee: [0.9, 0.13],
  tunic: [0.9, 0.15],
}
const BOWTIE_OVER_BOARD: [number, number] = [0.98, 0.225]

function Neckwear({ kind, color, outfit, overBoard }: { kind: AvatarConfig['neck']; color: string; outfit: AvatarConfig['outfit']; overBoard: boolean }) {
  if (kind === 'scarf') {
    return (
      <group position-y={0.98}>
        <mesh rotation-x={Math.PI / 2} scale={[1, 1, 0.7]} castShadow>
          <torusGeometry args={[0.15, 0.06, 8, 18]} />
          <Skin color={color} thickness={1.3} />
        </mesh>
        <RoundedBox args={[0.1, 0.24, 0.05]} radius={0.02} position={[0.08, -0.14, 0.15]} rotation-z={0.1}>
          <Skin color={color} thickness={1.2} />
        </RoundedBox>
      </group>
    )
  }
  if (kind === 'bowtie') {
    return (
      <group position={[0, ...(overBoard ? BOWTIE_OVER_BOARD : BOWTIE_SPOTS[outfit])]}>
        <BowWings length={0.15} radius={0.08} color={color} />
        <mesh scale={[1, 1, 0.8]}>
          <sphereGeometry args={[0.03, 10, 8]} />
          <Skin color={color} thickness={1.1} />
        </mesh>
      </group>
    )
  }
  return null
}

function Bag({ kind, color }: { kind: AvatarConfig['bag']; color: string }) {
  if (kind === 'messenger') {
    return (
      <group>
        <mesh position={[0.02, 0.76, 0.2]} rotation-z={0.65}>
          <boxGeometry args={[0.05, 0.62, 0.015]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <RoundedBox args={[0.28, 0.24, 0.1]} radius={0.03} position={[0.27, 0.54, 0.14]} rotation-z={-0.2} castShadow>
          <Skin color={color} thickness={1.4} />
        </RoundedBox>
      </group>
    )
  }
  if (kind === 'backpack') {
    return (
      <group>
        <RoundedBox args={[0.38, 0.46, 0.18]} radius={0.06} position={[0, 0.72, -0.22]} castShadow>
          <Skin color={color} />
        </RoundedBox>
        {[-0.14, 0.14].map((x) => (
          <mesh key={x} position={[x, 0.78, 0.13]}>
            <boxGeometry args={[0.04, 0.42, 0.02]} />
            <meshBasicMaterial color={color} />
          </mesh>
        ))}
      </group>
    )
  }
  return null
}

function SketchBoard() {
  const sketch = useCanvasTexture(drawSketch, 256, 256)
  return (
    <group position={[0, 0.72, 0.17]}>
      <RoundedBox args={[0.66, 0.66, 0.05]} radius={0.015} castShadow>
        <Skin />
      </RoundedBox>
      <mesh position-z={0.028}>
        <planeGeometry args={[0.6, 0.6]} />
        <meshBasicMaterial map={sketch} toneMapped={false} />
      </mesh>
    </group>
  )
}

function HeldItem({ kind, color }: { kind: AvatarConfig['held']; color: string }) {
  if (kind === 'pencil') {
    return (
      <group position={[0.42, 0.68, 0.12]} rotation={[0.2, 0, -0.25]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.6, 6]} />
          <Skin color={COLORS.butter} thickness={1.2} />
        </mesh>
        <mesh position-y={0.34}>
          <cylinderGeometry args={[0.052, 0.052, 0.08, 6]} />
          <Skin color={COLORS.blush} thickness={1.1} />
        </mesh>
        <mesh position-y={-0.36} rotation-x={Math.PI}>
          <coneGeometry args={[0.05, 0.12, 6]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      </group>
    )
  }
  if (kind === 'heart') {
    return (
      <group position={[0.42, 0.6, 0.02]}>
        <mesh position-y={0.42}>
          <capsuleGeometry args={[0.008, 0.84, 3, 4]} />
          <meshBasicMaterial color={INK} />
        </mesh>
        <group position-y={1.02}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.075, 0.05, 0]} castShadow>
              <sphereGeometry args={[0.11, 14, 12]} />
              <Skin color={color} thickness={1.2} />
            </mesh>
          ))}
          <mesh position-y={-0.04} rotation-x={Math.PI}>
            <coneGeometry args={[0.165, 0.2, 14]} />
            <Skin color={color} thickness={1.2} />
          </mesh>
        </group>
      </group>
    )
  }
  return null
}

const SWING_ANGLE = 2.2

/** 붓을 든 오른팔. 어깨를 축으로 앞으로 휘둘러 상대를 칠한다. */
function BrushArm({ color, motion }: { color: string; motion?: RefObject<WalkMotion> }) {
  const arm = useRef<THREE.Group>(null)
  useFrame(() => {
    if (arm.current) arm.current.rotation.x = -(motion?.current?.swing ?? 0) * SWING_ANGLE
  })
  return (
    <group ref={arm} position={[0.14, 0.92, 0]}>
      <group rotation-z={1}>
        <Line length={0.38} />
      </group>
      <group position={[0.3, -0.2, 0.08]} rotation={[0.2, 0, -0.3]}>
        <mesh position-y={0.14} castShadow>
          <cylinderGeometry args={[0.026, 0.034, 0.56, 8]} />
          <Skin color={COLORS.butter} thickness={1.1} />
        </mesh>
        <mesh position-y={0.44}>
          <cylinderGeometry args={[0.042, 0.03, 0.07, 8]} />
          <Skin color="#DBD6D1" thickness={1.1} />
        </mesh>
        <mesh position-y={0.53} scale={[1, 1.5, 1]} castShadow>
          <sphereGeometry args={[0.058, 12, 10]} />
          <Skin color={color} thickness={1.2} />
        </mesh>
        <mesh position-y={0.65} castShadow>
          <coneGeometry args={[0.03, 0.1, 8]} />
          <Skin color={color} thickness={1.1} />
        </mesh>
      </group>
    </group>
  )
}

/** 우테코 캠퍼스 확장: 스킬과 점프 자세. 원본 Avatar의 모양은 그대로 두고 팔·소품만 바꾼다. */
export type AvatarPose = { act: 'draw' | 'wave' | 'heart' | 'laptop' | 'coffee' | 'dance' | 'gun' | null; waving: boolean; air: boolean }

type AvatarProps = {
  config: AvatarConfig
  motion?: RefObject<WalkMotion>
  pose?: RefObject<AvatarPose>
}

/** 시안의 낙서 캐릭터를 기본 몸으로 삼아 고른 악세서리를 입힌 방문자 캐릭터. 발이 원점이고 +z를 바라본다. */
export function Avatar({ config, motion, pose }: AvatarProps) {
  const { left, right } = useLegSwing(motion)
  const holdingBoard = config.held === 'sketch'
  const holdingSide = config.held === 'pencil' || config.held === 'heart'
  const boardSet = useRef<THREE.Group>(null)
  const freeSet = useRef<THREE.Group>(null)
  const heldItem = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const restR = holdingSide ? 1 : 0.35
  const actRef = useRef<{ act: string | null; t0: number }>({ act: null, t0: 0 })   // 동작이 시작된 시각(단계가 있는 동작용)

  // 네 컷 그리기는 그림판을 들고, 인사·하트·점프는 팔을 든다. 그림판을 원래 든 캐릭터는 팔을 들 때 잠깐 내려놓는다.
  useFrame(({ clock }) => {
    const p = pose?.current
    const armsUp = !!p && (p.act === 'wave' || p.act === 'heart' || p.act === 'dance' || p.waving || p.air)
    const busy = p?.act === 'laptop' || p?.act === 'coffee' || p?.act === 'gun'   // 노트북·커피를 쓰는 동안엔 원래 든 것을 내려놓는다
    const boardOn = p?.act === 'draw' || (holdingBoard && !armsUp && !busy)
    if (boardSet.current) boardSet.current.visible = boardOn
    if (freeSet.current) freeSet.current.visible = !boardOn
    if (heldItem.current) heldItem.current.visible = !armsUp && !busy
    const l = armL.current
    const r = armR.current
    if (!l || !r) return
    l.rotation.x = 0; r.rotation.x = 0
    if (p?.act !== 'coffee' && actRef.current.act) actRef.current = { act: null, t0: 0 }
    if (p?.act === 'laptop') { // 두 손을 앞으로 뻗어 자판을 번갈아 톡톡
      const tt = clock.elapsedTime * 14
      l.rotation.z = -0.22; r.rotation.z = 0.22
      l.rotation.x = -1.15 + Math.max(0, Math.sin(tt)) * 0.18; r.rotation.x = -1.15 + Math.max(0, Math.sin(tt + Math.PI)) * 0.18
    }
    else if (p?.act === 'coffee') { // 컵을 든 오른팔: 들어 올려 입에 대고(빨대 쪽쪽 따라 살짝 까딱), 다 마시면 내린다
      if (actRef.current.act !== 'coffee') actRef.current = { act: 'coffee', t0: clock.elapsedTime }
      const e = clock.elapsedTime - actRef.current.t0
      const ease = (x: number) => 1 - (1 - x) ** 3
      const k = e < 0.7 ? ease(e / 0.7) : e < 3.4 ? 1 : e < 4 ? 1 - ease((e - 3.4) / 0.6) : 0   // 엔진의 컵 위치와 같은 박자
      const sip = e > 0.7 && e < 3.4 ? Math.sin((e - 0.7) * 9) * 0.04 : 0
      l.rotation.z = -0.35; r.rotation.z = 0.35 - k * 0.55; r.rotation.x = -k * 2.25 + sip
    }
    else if (p?.act === 'gun') { l.rotation.z = -0.35; r.rotation.z = 0.25; r.rotation.x = -1.45 }   // 종이 총: 오른팔을 앞으로 쭉 뻗어 겨눈다
    else if (p?.act === 'dance') { // 춤: 두 팔을 번갈아 위아래로 흔든다(엔진이 몸을 통통 튀기고 좌우로 흔든다)
      const b = clock.elapsedTime * 2.4 * Math.PI
      l.rotation.z = -1.6 - Math.sin(b) * 0.9; r.rotation.z = 1.6 - Math.sin(b) * 0.9
      l.rotation.x = Math.sin(b * 0.5) * 0.3; r.rotation.x = -Math.sin(b * 0.5) * 0.3
    }
    else if (p?.act === 'heart') { l.rotation.z = -2.7; r.rotation.z = 2.7 }
    else if (p?.act === 'wave' || p?.waving) { l.rotation.z = -0.35; r.rotation.z = 2.5 + Math.sin(clock.elapsedTime * 12) * 0.35 }
    else if (p?.air) { l.rotation.z = -1.3; r.rotation.z = 1.3 }
    else { l.rotation.z = -0.35; r.rotation.z = restR }
  })

  return (
    <group>
      <group ref={left} position={[-0.1, 0.46, 0]}>
        <Line length={0.46} />
      </group>
      <group ref={right} position={[0.1, 0.46, 0]}>
        <Line length={0.46} />
      </group>

      <Outfit kind={config.outfit} color={config.outfitColor} />
      <Bag kind={config.bag} color={config.bagColor} />

      <group ref={boardSet} visible={holdingBoard}>
        <Neckwear kind={config.neck} color={config.neckColor} outfit={config.outfit} overBoard />
        <SketchBoard />
        {[-1, 1].map((side) => (
          <group key={side}>
            <group position={[side * 0.14, 0.92, 0.04]} rotation={[-0.5, 0, side * 0.75]}>
              <Line length={0.32} />
            </group>
            <mesh position={[side * 0.37, 0.72, 0.2]} castShadow>
              <sphereGeometry args={[0.06, 12, 10]} />
              <Skin color={config.skinColor} thickness={1.4} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={freeSet} visible={!holdingBoard}>
        <Neckwear kind={config.neck} color={config.neckColor} outfit={config.outfit} overBoard={false} />
        <group ref={armL} position={[-0.14, 0.92, 0]} rotation-z={-0.35}>
          <Line length={0.38} />
        </group>
        {config.held === 'brush' ? (
          <BrushArm color={config.heldColor} motion={motion} />
        ) : (
          <group ref={armR} position={[0.14, 0.92, 0]} rotation-z={restR}>
            <Line length={0.38} />
          </group>
        )}
        <group ref={heldItem}>{holdingSide && <HeldItem kind={config.held} color={config.heldColor} />}</group>
      </group>

      <group position-y={HEAD_Y}>
        <mesh castShadow>
          <sphereGeometry args={[HEAD_RADIUS, 24, 18]} />
          <Skin color={config.skinColor} />
        </mesh>
        <FaceFeatures face={config.face} />
        <Eyewear kind={config.eyewear} />
        <Headwear kind={config.head} color={config.headColor} skinColor={config.skinColor} />
      </group>
    </group>
  )
}
