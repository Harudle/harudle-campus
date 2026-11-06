// 장면 조립: R3F 캔버스 위에서 엔진(층·카메라·이동)이 돌고, 캐릭터는 하루들 월드 컴포넌트가 그린다
import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { bootEngine } from './engine/engine'
import { Dolls } from './scene/Dolls'

function Engine() {
  const { gl, scene, camera, setDpr } = useThree()
  const engine = useRef<ReturnType<typeof bootEngine> | null>(null)
  useEffect(() => {
    if (engine.current) return   // StrictMode에서 두 번 불려도 한 번만 띄운다
    engine.current = bootEngine({ gl, scene, camera: camera as THREE.PerspectiveCamera, setDpr })
  }, [gl, scene, camera, setDpr])
  useFrame((_, dt) => engine.current?.frame(dt))
  return null
}

export function App() {
  return (
    <Canvas flat shadows={{ type: THREE.PCFSoftShadowMap }} dpr={[1, 2]} gl={{ antialias: true }} camera={{ fov: 38, near: 0.1, far: 360, position: [0, 20, 20] }}>
      <Engine />
      <Dolls />
    </Canvas>
  )
}
