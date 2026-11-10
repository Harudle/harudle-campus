import { useRef, type RefObject } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { AvatarConfig } from '../data/avatar'
import { COLORS } from '../lib/brand'
import { drawSketch, Ink, INK, Line, Skin, useLegSwing, type WalkMotion } from './Characters'
import { EASEL_BRUSH_SCALE, EaselBrushModel } from './EaselBrushModel'
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
      // 뒤로 쓴 모자라 살짝 뒤로 젖혀 이마가 보이고, 둥근 챙은 뒤통수로 간다.
      <group position-y={0.03} rotation-x={-0.2}>
        <mesh position-y={0.06} castShadow>
          <sphereGeometry args={[0.355, 28, 14, 0, Math.PI * 2, 0, 1.5]} />
          <Skin color={color} />
        </mesh>
        <mesh position-y={0.425}>
          <sphereGeometry args={[0.03, 10, 8]} />
          <Skin color={color} thickness={1.1} />
        </mesh>
        <mesh position={[0, 0.1, -0.39]} rotation-x={0.08} scale={[0.25, 0.028, 0.2]} castShadow>
          <sphereGeometry args={[1, 24, 12]} />
          <Skin color={color} thickness={1.3} />
        </mesh>
        {/* 이마 쪽에는 뒤쪽 조임 구멍과 끈이 보인다. */}
        <group position={[0, 0.105, 0.358]} rotation-x={-0.2}>
          <mesh>
            <circleGeometry args={[0.075, 18, 0, Math.PI]} />
            <meshBasicMaterial color={skinColor} />
          </mesh>
          <mesh position-z={0.002}>
            <torusGeometry args={[0.075, 0.009, 6, 18, Math.PI]} />
            <meshBasicMaterial color={INK} />
          </mesh>
          <mesh position-z={0.006} rotation-z={Math.PI / 2}>
            <capsuleGeometry args={[0.016, 0.14, 4, 8]} />
            <Skin color={color} thickness={1.1} />
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
function BrushArm({ color, motion, easel = false }: { color: string; motion?: RefObject<WalkMotion>; easel?: boolean }) {
  const arm = useRef<THREE.Group>(null)
  useFrame(() => {
    if (arm.current) arm.current.rotation.x = -(motion?.current?.swing ?? 0) * SWING_ANGLE
  })
  return (
    <group ref={arm} position={[0.14, 0.92, 0]}>
      <group rotation-z={1}>
        <Line length={0.38} />
      </group>
      {easel ? (
        // 바닥에 놓여 있던 큰 이젤 붓을 그대로 든다. 손이 막대 아래쪽을 쥔다.
        <group position={[0.3, -0.2, 0.08]} rotation={[0.2, 0, -0.3]}>
          <group position-y={0.45 * EASEL_BRUSH_SCALE}>
            <EaselBrushModel tipColor={color} />
          </group>
        </group>
      ) : (
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
      )}
    </group>
  )
}

/** 화면에서만 덧붙이는 모습. easelBrush면 이젤 붓을 든 모습으로 그리고, 서버로는 보내지 않는다. */
type ShownAvatar = AvatarConfig & { easelBrush?: boolean }

type AvatarProps = {
  config: ShownAvatar
  motion?: RefObject<WalkMotion>
}

/** 시안의 낙서 캐릭터를 기본 몸으로 삼아 고른 악세서리를 입힌 방문자 캐릭터. 발이 원점이고 +z를 바라본다. */
export function Avatar({ config, motion }: AvatarProps) {
  const { left, right } = useLegSwing(motion)
  const holdingBoard = config.held === 'sketch'
  const holdingSide = config.held === 'pencil' || config.held === 'heart'

  return (
    <group>
      <group ref={left} position={[-0.1, 0.46, 0]}>
        <Line length={0.46} />
      </group>
      <group ref={right} position={[0.1, 0.46, 0]}>
        <Line length={0.46} />
      </group>

      <Outfit kind={config.outfit} color={config.outfitColor} />
      <Neckwear kind={config.neck} color={config.neckColor} outfit={config.outfit} overBoard={holdingBoard} />
      <Bag kind={config.bag} color={config.bagColor} />

      {holdingBoard ? (
        <>
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
        </>
      ) : (
        <>
          <group position={[-0.14, 0.92, 0]} rotation-z={-0.35}>
            <Line length={0.38} />
          </group>
          {config.held === 'brush' ? (
            <BrushArm color={config.heldColor} motion={motion} easel={config.easelBrush} />
          ) : (
            <group position={[0.14, 0.92, 0]} rotation-z={holdingSide ? 1 : 0.35}>
              <Line length={0.38} />
            </group>
          )}
          {holdingSide && <HeldItem kind={config.held} color={config.heldColor} />}
        </>
      )}

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
