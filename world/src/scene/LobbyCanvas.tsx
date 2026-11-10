import { useEffect, useMemo, useRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { COLORS } from '../lib/brand'
import { Doodle, Haru } from './Characters'
import { NewspaperStand } from './NewspaperStand'
import { PopUp } from './PopUp'
import { PortalDoor } from './PortalDoor'
import { Room } from './Room'

const TARGET: [number, number, number] = [0, 1.75, 0]
const BASE_DISTANCE = 19
const START_AZIMUTH = 0.14
const START_POLAR = 1.27

/** 세로로 좁은 화면에서도 가판대와 방이 잘리지 않게 카메라 거리를 늘린다. */
function CameraRig({ enabled }: { enabled: boolean }) {
  const camera = useThree((state) => state.camera)
  const aspect = useThree((state) => state.viewport.aspect)
  const controls = useRef<OrbitControlsImpl>(null)
  const fit = useMemo(() => Math.min(Math.max(1.85 / aspect, 1), 2.2), [aspect])

  useEffect(() => {
    const distance = BASE_DISTANCE * fit
    camera.position.set(
      TARGET[0] + distance * Math.sin(START_POLAR) * Math.sin(START_AZIMUTH),
      TARGET[1] + distance * Math.cos(START_POLAR),
      TARGET[2] + distance * Math.sin(START_POLAR) * Math.cos(START_AZIMUTH),
    )
    controls.current?.update()
  }, [camera, fit])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={enabled}
      target={TARGET}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={0.7}
      minDistance={BASE_DISTANCE * fit * 0.6}
      maxDistance={BASE_DISTANCE * fit * 1.2}
      minPolarAngle={0.95}
      maxPolarAngle={1.47}
      minAzimuthAngle={-0.62}
      maxAzimuthAngle={0.62}
    />
  )
}

type LobbyCanvasProps = {
  modalOpen: boolean
  showHint: boolean
  onOpenScoop: () => void
  onEnterGallery: () => void
  onEnterArcade: () => void
  onEnterRelay: () => void
}

export default function LobbyCanvas({
  modalOpen,
  showHint,
  onOpenScoop,
  onEnterGallery,
  onEnterArcade,
  onEnterRelay,
}: LobbyCanvasProps) {
  return (
    <Canvas
      className="!absolute inset-0"
      shadows={{ type: THREE.PCFShadowMap }}
      flat
      dpr={[1, 1.75]}
      camera={{ fov: 35, near: 0.5, far: 120, position: [0, 8, 19] }}
      aria-label="하루들 월드 3D 로비. 가운데에 오늘의 특종 신문 가판대가 있고, 왼쪽 문은 퀴즈 아케이드, 뒤쪽 문은 릴레이 소설관, 오른쪽 문은 전시관으로 이어집니다."
    >
      <color attach="background" args={[COLORS.background]} />
      <hemisphereLight args={['#E8DEFF', COLORS.lavender200, 2.5]} />
      <directionalLight
        position={[6, 13, 9]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={5}
      />
      <CameraRig enabled={!modalOpen} />
      <Room />
      <group position={[5.05, 0, 1.75]} rotation-y={-0.35} scale={1.15}>
        <PopUp delay={1.05} mode="grow">
          <Haru waving />
        </PopUp>
      </group>
      <group position={[-2.75, 0, 2.5]} rotation-y={0.55} scale={1.15}>
        <PopUp delay={1.15} mode="grow">
          <Doodle />
        </PopUp>
      </group>
      <group position={[6.55, 0, 0.3]} rotation-y={-0.45}>
        <PopUp delay={0.95} mode="grow">
          <PortalDoor label="입장" sign="전시관" disabled={modalOpen} onEnter={onEnterGallery} />
        </PopUp>
      </group>
      <group position={[-6.55, 0, 0.1]} rotation-y={0.45}>
        <PopUp delay={0.95} mode="grow">
          <PortalDoor label="입장" sign="오락실" innerColor={COLORS.blush} disabled={modalOpen} onEnter={onEnterArcade} />
        </PopUp>
      </group>
      <group position={[3.1, 0, -3.5]} rotation-y={-0.12}>
        <PopUp delay={0.95} mode="grow">
          <PortalDoor label="입장" sign="릴레이 소설관" signColor={COLORS.paper} innerColor={COLORS.lavender200} disabled={modalOpen} onEnter={onEnterRelay} />
        </PopUp>
      </group>
      <NewspaperStand modalOpen={modalOpen} showHint={showHint} onOpen={onOpenScoop} />
    </Canvas>
  )
}
