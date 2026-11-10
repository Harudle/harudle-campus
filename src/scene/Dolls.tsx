// 엔진이 만든 캐릭터 자리마다 하루들 월드의 캐릭터를 그린다
import { useRef, useSyncExternalStore } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Avatar, type AvatarPose } from '../harudle/Avatar'
import { Haru, Harudle, type WalkMotion } from '../harudle/Characters'
import { Pet } from './Pets'
import { dollStore, type Doll } from '../engine/dolls'

/** 하루들 월드 캐릭터는 키가 약 1.64라서 캠퍼스(사람 키 ≈ 1.12)에 맞춰 줄인다 */
const AVATAR_SCALE = 0.68
const DOG_SCALE = 0.5
const STEP = { walk: 9.5, run: 15 }

function DollView({ doll }: { doll: Doll }) {
  const motion = useRef<WalkMotion>({ phase: 0, amount: 0, sit: 0, swing: 0 })
  const pose = useRef<AvatarPose>({ act: null, waving: false, air: false, style: 0, actT: 0, noHead: false })
  const bob = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05), a = doll.anim, m = motion.current
    m.amount = THREE.MathUtils.damp(m.amount, a.moving || a.air ? 1 : 0, 10, dt)
    if (a.air) m.phase = Math.PI / 2   // 점프: 다리를 앞뒤로 벌린 채
    else if (a.moving) m.phase += dt * (a.run ? STEP.run : STEP.walk)
    m.sit = THREE.MathUtils.damp(m.sit ?? 0, a.seated ? 1 : 0, 12, dt)
    m.sitH = a.seatH ?? 0.26
    pose.current.act = a.act; pose.current.waving = a.waving; pose.current.air = a.air; pose.current.style = a.style; pose.current.actT = a.actT; pose.current.noHead = a.noHead
    if (bob.current) {
      bob.current.position.y = a.moving && !a.air && !a.seated ? Math.abs(Math.sin(m.phase)) * m.amount * 0.08 : 0
      bob.current.rotation.x = THREE.MathUtils.damp(bob.current.rotation.x, a.moving && a.run ? 0.14 : 0, 10, dt)
    }
  })
  const scale = doll.kind === 'dog' ? DOG_SCALE : AVATAR_SCALE
  return createPortal(
    <group scale={scale}>
      <group ref={bob}>
        {doll.kind === 'dog' ? (
          <Pet kind={doll.pet} motion={motion} />
        ) : doll.kind === 'harudle' ? (
          <Harudle motion={motion} />
        ) : doll.kind === 'haru' ? (
          <Haru motion={motion} waving />
        ) : (
          doll.config && <Avatar config={doll.config} motion={motion} pose={pose} gear={doll.gear} />
        )}
      </group>
    </group>,
    doll.turn,
  )
}

export function Dolls() {
  const dolls = useSyncExternalStore(dollStore.subscribe, dollStore.get)
  return <>{dolls.map((d) => <DollView key={d.id} doll={d} />)}</>
}
