// 캐릭터 꾸미기 창 바로 옆에 지금 내 캐릭터를 크게 보여 준다: 정면을 보고 있고, 끌면 손으로 돌린다
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Avatar } from '../harudle/Avatar'
import { avatarPreview } from './avatarPreviewStore'

function Turntable({ drag, children }: { drag: React.RefObject<{ on: boolean; yaw: number }>; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => { if (g.current) g.current.rotation.y = drag.current.yaw })   // 저절로 돌지 않는다: 끈 만큼만
  return <group ref={g}>{children}</group>
}

export function AvatarPreview() {
  const { open, silent, config, note } = useSyncExternalStore(avatarPreview.subscribe, avatarPreview.get)
  const drag = useRef({ on: false, yaw: 0, x: 0 })
  useEffect(() => { const host = document.getElementById('avPreview'); if (host) { host.hidden = !open; host.classList.toggle('snap', silent) } if (open) drag.current.yaw = 0; if (!open) avatarPreview.setContext(null) }, [open, silent])   // 열 때마다 정면부터. 캡쳐용(silent)이면 보이지 않게
  if (!open || !config) return null
  // 외형이 바뀔 때마다 캐릭터를 새로 만든다(게임 속 캐릭터와 같은 방식). 같은 자리를 재사용하면 R3F가 빠진 위치 값을 되돌리지 않아
  // 예전 장식의 위치가 남는다(캡모자 챙이 발밑에 떨어지는 등)
  const down = (e: React.PointerEvent) => { drag.current.on = true; drag.current.x = e.clientX; (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d.on) return; d.yaw += (e.clientX - d.x) * .012; d.x = e.clientX }
  const up = () => { drag.current.on = false }
  return (
    <>
      <div className="avpv-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <Canvas flat dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ fov: 30, near: .1, far: 50, position: [0, 1.0, 4.2] }} onCreated={({ gl, scene, camera }) => { camera.lookAt(0, .82, 0); avatarPreview.setContext({ gl, scene, camera }) }}>
          <hemisphereLight args={[0xffffff, 0xcfd6e8, 1.6]} />
          <directionalLight position={[2, 4, 3]} intensity={1.5} />
          <Turntable drag={drag}><Avatar key={JSON.stringify(config)} config={config} /></Turntable>
        </Canvas>
      </div>
      <p className="avpv-cap">{note ?? '미리보기 · 끌어서 돌려 보기'}</p>
    </>
  )
}
