import { useRef, type RefObject } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { AvatarConfig } from './avatarData'
import { COLORS } from './brand'
import { drawSketch, Ink, INK, Line, Skin, useLegSwing, type WalkMotion } from './Characters'
import { useCanvasTexture } from './useCanvasTexture'
import { GearFx, GearHead, GearHeld, GearNeck, type GearState } from '../scene/Gear'   // 캠퍼스 확장: 컷 상점 장식

const HEAD_Y = 1.3
const HEAD_RADIUS = 0.34
const CURLS = [-1.15, -0.72, -0.3, 0.14, 0.58, 1.02]

// 기타 연주(소품 감정표현): 경쾌한 100BPM. 오른손(armL)은 울림구멍 앞에서 한 박에 한 번 부드럽게 내렸다 올리고(박마다 세기를 조금씩 달리),
// 왼손(armR)은 넥을 짚은 채 두 마디마다 다음 코드로 스르르 옮긴다
const GUITAR_BPM = 100
function guitarArms(t: number) {   // [armL x, z, armR x, z]
  const beat = t * GUITAR_BPM / 60, accent = [1, .55, .8, .55][Math.floor(beat) % 4]
  const strum = Math.sin(beat * Math.PI * 2) * 0.07 * accent                       // 손목으로 살살(±4도쯤)
  const bar = beat / 8, ci = Math.floor(bar) % 3, k = Math.min(1, (bar % 1) * 8 / 0.5), e = k * k * (3 - 2 * k)   // 코드 바꿀 땐 반 박 동안
  const pos = [0, 0.07, 0.03], shift = pos[(ci + 2) % 3] + (pos[ci] - pos[(ci + 2) % 3]) * e
  return [-1.42 + strum, 0.42 + strum * 0.3, -1.3 - shift, 0.78 + shift * 0.8]
}

function FaceFeatures({ face, pose }: { face: AvatarConfig['face']; pose?: RefObject<AvatarPose> }) {
  const eyes = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    eyes.current?.scale.setY(pose?.current?.sleep || clock.elapsedTime % 3.6 < 0.12 ? 0.15 : 1)   // 자는 중이면 눈을 꼭 감는다
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

/** 귀 장식(머리 장식과 함께 낀다). 머리 그룹 안, 머리 가운데가 원점 */
function Earwear({ kind }: { kind: AvatarConfig['ear'] }) {
  if (kind === 'headset') return <AirPodsMax />
  if (kind !== 'airpods') return null
  // 에어팟(4세대) 착용 모습: 둥근 이어버드가 귓구멍에 쏙 들어가 있고, 바깥 면 위쪽에 세로로 긴 검은 알약 모양 통풍구,
  // 스템은 아래로 내려오며 얼굴 쪽(앞)으로 25도쯤 기울고, 끝면엔 작은 검은 마이크 구멍. 색은 진짜처럼 늘 하얀 유광
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (HEAD_RADIUS - 0.014), -0.025, 0.025]} rotation={[-0.44, 0, side * 0.06]} scale={0.78}>
          <mesh scale={[0.8, 1, 1.05]} castShadow>
            <sphereGeometry args={[0.05, 16, 12]} />
            <Skin color="#F8F8F6" thickness={1} />
          </mesh>
          <mesh position={[side * 0.039, 0.008, 0.004]} scale={[0.35, 1, 1]}>
            <capsuleGeometry args={[0.009, 0.026, 4, 10]} />
            <meshBasicMaterial color={INK} />
          </mesh>
          <mesh position={[side * 0.008, -0.092, 0.006]} castShadow>
            <capsuleGeometry args={[0.016, 0.12, 4, 10]} />
            <Skin color="#F8F8F6" thickness={1} />
          </mesh>
          <mesh position={[side * 0.008, -0.168, 0.006]}>
            <sphereGeometry args={[0.006, 8, 6]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// 에어팟 맥스(실버): 하얀 캐노피 프레임이 머리 위를 넘고(양 가장자리는 굵은 흰 테, 가운데는 니트 메시),
// 프레임 끝의 흰 칼라에서 반짝이는 스테인리스 텔레스코픽 암이 내려와 이어컵 위 가운데에 꽂힌다.
// 이어컵은 둥근 사각(스쿼클) 알루미늄 덩어리, 머리 쪽엔 같은 모양의 니트 메시 쿠션.
// 오른쪽 이어컵 윗면 앞쪽에 디지털 크라운, 뒤쪽에 소음 조절 버튼, 바깥 면 아래쪽에 작은 상태 표시등 틈. 캐릭터의 오른쪽은 -x(앞이 +z)
const MAX_ALU = '#E3E5E8', MAX_FRAME = '#F6F6F4', MAX_STEEL = '#C7CBD1', MAX_KNIT = '#E4E5E7', MAX_CUSHION = '#D6D7DA'
function AirPodsMax() {
  const top = 0.16, r = HEAD_RADIUS + 0.085, cupY = -0.07, cupH = 0.27, cupX = HEAD_RADIUS + 0.09
  return (
    <group>
      {/* 캐노피: 위가 살짝 납작한 아치. 앞뒤 가장자리 흰 테 + 그 사이 니트 메시 */}
      <group position-y={top} scale={[1, 0.88, 1]}>
        {[-1, 1].map((z) => (
          <mesh key={z} position-z={z * 0.065} castShadow>
            <torusGeometry args={[r, 0.02, 10, 48, Math.PI]} />
            <Skin color={MAX_FRAME} thickness={1} />
          </mesh>
        ))}
        <mesh scale={[1, 1, 5.2]}>
          <torusGeometry args={[r - 0.004, 0.012, 6, 48, Math.PI]} />
          <Skin color={MAX_KNIT} thickness={0.8} />
        </mesh>
      </group>
      {[-1, 1].map((side) => (
        <group key={side}>
          {/* 프레임 끝 흰 칼라 + 스테인리스 링, 그 아래로 반짝이는 암 */}
          <mesh position={[side * r, top - 0.03, 0]}>
            <cylinderGeometry args={[0.026, 0.024, 0.07, 14]} />
            <Skin color={MAX_FRAME} thickness={1} />
          </mesh>
          <mesh position={[side * r, top - 0.07, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.012, 14]} />
            <meshStandardMaterial color={MAX_STEEL} metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[side * (r + cupX) / 2, (top - 0.07 + cupY + cupH / 2) / 2, 0]} rotation-z={side * Math.atan2(cupX - r, top - 0.07 - cupY - cupH / 2)}>
            <cylinderGeometry args={[0.011, 0.011, top - 0.07 - cupY - cupH / 2 + 0.02, 10]} />
            <meshStandardMaterial color={MAX_STEEL} metalness={0.95} roughness={0.15} />
          </mesh>
          <group position={[side * cupX, cupY, 0.005]}>
            {/* 이어컵: 둥근 사각 알루미늄, 윗면 가운데 암이 꽂히는 작은 경첩 */}
            <RoundedBox args={[0.1, cupH, 0.22]} radius={0.048} smoothness={4} castShadow>
              <Skin color={MAX_ALU} thickness={1.2} />
            </RoundedBox>
            <mesh position-y={cupH / 2 + 0.004}>
              <cylinderGeometry args={[0.018, 0.022, 0.014, 14]} />
              <meshStandardMaterial color={MAX_STEEL} metalness={0.9} roughness={0.2} />
            </mesh>
            {/* 머리 쪽 니트 메시 쿠션(이어컵보다 살짝 작고 도톰하다) */}
            <RoundedBox args={[0.05, cupH - 0.02, 0.2]} radius={0.024} smoothness={3} position-x={-side * 0.068}>
              <Skin color={MAX_CUSHION} thickness={0.9} />
            </RoundedBox>
            {/* 바깥 면 아래쪽 상태 표시등 틈 */}
            <mesh position={[side * 0.051, -cupH * 0.3, 0.06]} rotation-z={Math.PI / 2} rotation-y={side * Math.PI / 2}>
              <capsuleGeometry args={[0.003, 0.014, 2, 6]} />
              <meshBasicMaterial color={INK} />
            </mesh>
            {side < 0 && (
              <>
                {/* 디지털 크라운(앞) · 소음 조절 버튼(뒤) */}
                <mesh position={[0, cupH / 2 + 0.008, 0.06]}>
                  <cylinderGeometry args={[0.022, 0.022, 0.022, 20]} />
                  <meshStandardMaterial color={MAX_STEEL} metalness={0.9} roughness={0.25} />
                </mesh>
                <mesh position={[0, cupH / 2 + 0.02, 0.06]}>
                  <cylinderGeometry args={[0.018, 0.022, 0.004, 20]} />
                  <meshStandardMaterial color="#E9EBEE" metalness={0.6} roughness={0.35} />
                </mesh>
                <mesh position={[0, cupH / 2 + 0.002, -0.06]} rotation-x={Math.PI / 2}>
                  <capsuleGeometry args={[0.008, 0.035, 4, 8]} />
                  <meshStandardMaterial color={MAX_STEEL} metalness={0.8} roughness={0.3} />
                </mesh>
              </>
            )}
          </group>
        </group>
      ))}
    </group>
  )
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
export type AvatarPose = { act: 'draw' | 'wave' | 'heart' | 'laptop' | 'coffee' | 'dance' | 'gun' | 'read' | null; waving: boolean; air: boolean; style?: number; actT?: number; noHead?: boolean; sleep?: boolean; listen?: boolean; guitar?: boolean; party?: boolean; arms?: number[] | null }

type AvatarProps = {
  config: AvatarConfig
  motion?: RefObject<WalkMotion>
  pose?: RefObject<AvatarPose>
  /** 캠퍼스 확장: 컷 상점에서 사서 쓰고 있는 장식. 있으면 그 부위는 외형 대신 이것을 그린다 */
  gear?: GearState | null
}

/** 시안의 낙서 캐릭터를 기본 몸으로 삼아 고른 악세서리를 입힌 방문자 캐릭터. 발이 원점이고 +z를 바라본다. */
export function Avatar({ config: look, motion, pose, gear }: AvatarProps) {
  // 상점 장식을 쓰면 그 부위의 외형은 비운다. 네컷 원고는 연필처럼 옆으로 든 자세를 쓴다
  const config: AvatarConfig = gear && (gear.head || gear.neck || gear.held)
    ? { ...look, head: gear.head ? 'none' : look.head, neck: gear.neck ? 'none' : look.neck, held: gear.held ? 'pencil' : look.held }
    : look
  const { left, right } = useLegSwing(motion)
  const holdingBoard = config.held === 'sketch'
  const holdingSide = config.held === 'pencil' || config.held === 'heart'
  const boardSet = useRef<THREE.Group>(null)
  const freeSet = useRef<THREE.Group>(null)
  const heldItem = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null), phones = useRef<THREE.Group>(null)
  const restR = holdingSide ? 1 : 0.35
  const actRef = useRef<{ act: string | null; t0: number }>({ act: null, t0: 0 })   // 동작이 시작된 시각(단계가 있는 동작용)

  // 네 컷 그리기는 그림판을 들고, 인사·하트·점프는 팔을 든다. 그림판을 원래 든 캐릭터는 팔을 들 때 잠깐 내려놓는다.
  useFrame(({ clock }) => {
    const p = pose?.current
    if (head.current) { head.current.visible = !p?.noHead; head.current.rotation.x = p?.party ? Math.abs(Math.sin(clock.elapsedTime * Math.PI * 128 / 60)) * .22 - .05 : p?.sleep ? .32 : p?.guitar ? .38 + Math.sin(clock.elapsedTime * Math.PI * GUITAR_BPM / 60) * .025 : p?.listen ? .08 + Math.sin(clock.elapsedTime * 2 * Math.PI * 127 / 60) * .1 : 0 }   // 자는 중이면 고개를 숙이고, LP 감상 중이면 박자(127BPM)에 맞춰 끄덕인다
    if (phones.current) phones.current.visible = !!p?.listen && config.ear !== 'headset'   // LP 감상: 헤드셋(이미 끼고 있으면 그대로)   // 자는 중이면 고개를 숙여 웅크린다
    const armsUp = !!p && (p.act === 'wave' || p.act === 'heart' || p.act === 'dance' || p.waving || p.air)
    const busy = p?.act === 'laptop' || p?.act === 'coffee' || p?.act === 'gun' || p?.act === 'read' || !!p?.arms   // 노트북·커피를 쓰는 동안엔 원래 든 것을 내려놓는다(대결 팔 자세도: 복싱 글러브)
    // 1인칭(noHead)에선 그림판·옆에 든 소품을 생략한다: 눈앞을 통째로 가린다(특히 앉으면). 팔과 노트북·커피·총은 그대로
    const boardOn = !p?.noHead && (p?.act === 'draw' || (holdingBoard && !armsUp && !busy))
    if (boardSet.current) boardSet.current.visible = boardOn
    if (freeSet.current) freeSet.current.visible = !boardOn
    if (heldItem.current) heldItem.current.visible = !armsUp && !busy && !p?.noHead
    const l = armL.current
    const r = armR.current
    if (!l || !r) return
    l.rotation.x = 0; r.rotation.x = 0
    if (p?.act !== 'coffee' && actRef.current.act) actRef.current = { act: null, t0: 0 }
    if (p?.arms) { l.rotation.x = p.arms[0]; l.rotation.z = p.arms[1]; r.rotation.x = p.arms[2]; r.rotation.z = p.arms[3] }   // 대결 종목이 정한 팔(armL이 캐릭터의 오른팔)
    else if (p?.party) { // 클럽 파티: 두 팔을 번갈아 하늘로 찌르고 휘두르다, 네 박마다 양팔을 머리 위로 크게 돌린다(약 128BPM)
      const b = clock.elapsedTime * 2 * Math.PI * 128 / 60, big = Math.floor(clock.elapsedTime * 128 / 60 / 4) % 2 === 1
      if (big) { l.rotation.z = -2.5 + Math.sin(b) * 0.55; r.rotation.z = 2.5 + Math.sin(b) * 0.55; l.rotation.x = Math.cos(b) * 0.5; r.rotation.x = Math.cos(b) * 0.5 }
      else { l.rotation.z = -1.4 - Math.max(0, Math.sin(b)) * 1.3; r.rotation.z = 1.4 + Math.max(0, -Math.sin(b)) * 1.3; l.rotation.x = -0.4 - Math.sin(b * 2) * 0.35; r.rotation.x = -0.4 + Math.sin(b * 2) * 0.35 }
    }
    else if (p?.guitar) { const [lx, lz, rx, rz] = guitarArms(clock.elapsedTime); l.rotation.x = lx; l.rotation.z = lz; r.rotation.x = rx; r.rotation.z = rz }   // 기타 연주
    else if (p?.act === 'read') { l.rotation.z = -0.32; r.rotation.z = 0.32; l.rotation.x = -1.05; r.rotation.x = -1.05 + Math.max(0, Math.sin(clock.elapsedTime * 1.6) - 0.97) * 4 }   // 두 손을 앞으로(빈백에선 책을 받쳐 들고, 책상에선 독서대 양옆에 손을 얹는다)
    else if (p?.act === 'laptop') { // 두 손을 앞으로 뻗어 자판을 번갈아 톡톡
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
      l.rotation.z = -0.35; r.rotation.z = 0.35 - k * 0.6; r.rotation.x = -k * 1.55 + sip   // 컵을 가슴 앞에 세워 들고 빨대로 쪽쪽(팔을 머리 위로 올리지 않는다)
    }
    else if (p?.act === 'gun') { r.rotation.z = restR; l.rotation.z = -0.25; l.rotation.x = -1.45 }   // 종이 총: 오른팔(-x 쪽 armL)을 앞으로 쭉 뻗어 겨눈다
    else if (p?.act === 'dance') { // 춤 열 가지의 팔(몸은 엔진이 같은 번호·박자로 움직인다)
      const b = (p.actT ?? clock.elapsedTime) * 2.4 * Math.PI, s = Math.sin(b)
      switch (p.style ?? 0) {
        case 1: l.rotation.z = -1.5 + Math.sin(b) * 0.45; r.rotation.z = 1.5 + Math.sin(b - 1.4) * 0.45; break   // 파도: 양팔을 옆으로 뻗고 물결이 왼→오로 지나간다
        case 2: l.rotation.z = -1.45; r.rotation.z = 1.45; l.rotation.x = r.rotation.x = Math.sin(b) * 0.15; break   // 빙글빙글: 팔 쫙
        case 3: { const k = Math.abs(Math.sin(b / 2)); l.rotation.z = -0.4 - k * 2.4; r.rotation.z = 0.4 + k * 2.4; break }   // 만세 점프: 뛸 때 만세
        case 4: { const k = Math.floor((p.actT ?? 0) * 2.4) % 2; l.rotation.z = -0.25; r.rotation.z = 0.25; l.rotation.x = k ? -1.57 : 0; r.rotation.x = k ? 0 : -1.57; break }   // 로봇: 팔을 각지게 번갈아 앞으로
        case 5: { const up = Math.sin(b / 2) > 0; r.rotation.z = up ? 2.6 : 0.2; r.rotation.x = up ? 0 : -0.5; l.rotation.z = -0.6; l.rotation.x = 0.3; break }   // 디스코: 오른손 하늘 찌르고 땅 찌르고, 왼손은 허리
        case 6: l.rotation.z = -0.9; r.rotation.z = 0.9; l.rotation.x = -0.9 + s * 0.3; r.rotation.x = -0.9 - s * 0.3; break   // 트위스트: 팔꿈치를 굽힌 듯 앞에서 흔든다
        case 7: { const k = Math.max(0, Math.cos(b)); l.rotation.x = r.rotation.x = -1.35; l.rotation.z = -0.15 - (1 - k) * 0.45; r.rotation.z = 0.15 + (1 - k) * 0.45; break }   // 박수: 앞으로 뻗은 손이 박자마다 짝
        case 8: l.rotation.z = -0.5 - Math.abs(s) * 0.4; r.rotation.z = 2.7; r.rotation.x = Math.abs(s) * 0.3; break   // 헤드뱅: 오른손 번쩍, 왼손은 기타 치듯
        case 9: l.rotation.z = -0.3; r.rotation.z = 0.3; l.rotation.x = -Math.max(0, s) * 1.5; r.rotation.x = -Math.max(0, -s) * 1.5; break   // 셔플: 앞으로 번갈아 주먹질
        default: l.rotation.z = -1.6 - s * 0.9; r.rotation.z = 1.6 - s * 0.9; l.rotation.x = Math.sin(b * 0.5) * 0.3; r.rotation.x = -Math.sin(b * 0.5) * 0.3   // 통통: 두 팔을 번갈아 위아래로
      }
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
        <group ref={heldItem}>{gear?.held ? <GearHeld sku={gear.held} /> : holdingSide && <HeldItem kind={config.held} color={config.heldColor} />}</group>
      </group>

      <group ref={head} position-y={HEAD_Y}>
        <mesh castShadow>
          <sphereGeometry args={[HEAD_RADIUS, 24, 18]} />
          <Skin color={config.skinColor} />
        </mesh>
        <FaceFeatures face={config.face} pose={pose} />
        <Eyewear kind={config.eyewear} />
        <Headwear kind={config.head} color={config.headColor} skinColor={config.skinColor} />
        <Earwear kind={config.ear} />
        <group ref={phones} visible={false}><AirPodsMax /></group>
        <GearHead sku={gear?.head} />
        <GearFx sku={gear?.fx} />
      </group>
      <GearNeck sku={gear?.neck} />
    </group>
  )
}
