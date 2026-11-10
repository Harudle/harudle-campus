import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import type { AvatarConfig } from '../data/avatar'
import { COLORS } from '../lib/brand'
import { Avatar } from './Avatar'
import { Doodle } from './Characters'
import { Toon } from './toon'

export default function AvatarPreview({ config, withDoodle }: { config: AvatarConfig; withDoodle: boolean }) {
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      flat
      dpr={[1, 1.75]}
      camera={{ fov: 32, position: [0, 1.7, 5.4] }}
      aria-label="내 캐릭터 미리보기. 드래그해서 돌려 볼 수 있습니다."
    >
      <color attach="background" args={[COLORS.lavender100]} />
      <hemisphereLight args={['#E8DEFF', COLORS.lavender200, 2.6]} />
      <directionalLight position={[3, 6, 5]} intensity={0.9} castShadow shadow-mapSize={[1024, 1024]} />
      <OrbitControls
        target={[0, 0.95, 0]}
        enablePan={false}
        enableZoom={false}
        minPolarAngle={0.9}
        maxPolarAngle={1.6}
      />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[1.7, 40]} />
        <Toon color={COLORS.paper} outline={false} />
      </mesh>
      <Avatar config={config} />
      {withDoodle && (
        <group position={[1.05, 0, 0.35]} rotation-y={-0.35} scale={0.8}>
          <Doodle />
        </group>
      )}
    </Canvas>
  )
}
