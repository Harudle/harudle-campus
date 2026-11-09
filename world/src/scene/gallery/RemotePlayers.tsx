import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { MoveUpdate, PlayState, RemotePlayer as RemotePlayerData, RemotePosition, SpeechMap } from '../../data/presence'
import { COLORS } from '../../lib/brand'
import { Avatar } from '../Avatar'
import type { WalkMotion } from '../Characters'
import { Toon } from '../toon'
import type { SpaceBounds } from './layout'
import { NameTag } from './NameTag'
import { EmoteBubble } from './EmoteBubble'
import { PaintMarks } from './PaintMarks'
import { SpeechBubble } from './SpeechBubble'
import { applyKnock, CHARACTER_SCALE, DoodleFollower, hitWobble, KNOCK_TAG_DROP, knockAmount, SEATED_LIFT, startJump, STEP_RATE, stepJump, swingAmount } from './Player'

const SEND_INTERVAL = 0.1
const KEEP_ALIVE_INTERVAL = 1
const MIN_MOVE = 0.02
const SNAP_DISTANCE = 6
// 전신 아바타는 메시와 외곽선이 많아서 가까운 사람만 그리고, 나머지는 인스턴싱으로 한 번에 그린다.
const DETAIL_LIMIT = window.matchMedia('(pointer: coarse)').matches ? 10 : 24
const DETAIL_RECHECK_SECONDS = 0.8
const CROWD_CAPACITY = 160
const CROWD_HEAD_Y = 1.32
const CROWD_BODY_Y = 0.62

/** 내 위치를 초당 10번 이내로 보낸다. 재접속 직후에도 보이도록 멈춰 있어도 1초마다 보낸다. */
export function PresenceSender({ position, seated, airborne, doubleJumped, onMove }: {
  position: RefObject<THREE.Vector3>
  seated: RefObject<boolean>
  airborne: RefObject<boolean>
  doubleJumped: RefObject<boolean>
  onMove: (update: MoveUpdate) => void
}) {
  const last = useRef({ x: Number.NaN, z: Number.NaN, heading: 0, moving: false, seated: false, jumping: false, doubleJumped: false, sinceSend: 0, sinceAlive: 0 })

  useFrame((_, delta) => {
    const state = last.current
    state.sinceSend += delta
    state.sinceAlive += delta
    if (state.sinceSend < SEND_INTERVAL) return
    state.sinceSend = 0

    const { x, z } = position.current
    const dx = x - state.x
    const dz = z - state.z
    const moving = Math.hypot(dx, dz) > MIN_MOVE
    if (moving) state.heading = Math.atan2(dx, dz)
    if (seated.current) state.heading = 0
    const changed = moving || moving !== state.moving || seated.current !== state.seated || airborne.current !== state.jumping || doubleJumped.current !== state.doubleJumped || Number.isNaN(state.x)
    if (!changed && state.sinceAlive < KEEP_ALIVE_INTERVAL) return

    state.x = x
    state.z = z
    state.moving = moving
    state.seated = seated.current
    state.jumping = airborne.current
    state.doubleJumped = doubleJumped.current
    state.sinceAlive = 0
    onMove({ x, z, heading: state.heading, moving, seated: seated.current, jumping: airborne.current, doubleJumped: doubleJumped.current })
  })

  return null
}

function RemotePlayer({ player, speech, play, positions, space, leader }: {
  player: RemotePlayerData
  speech: string | undefined
  play: PlayState
  positions: RefObject<Map<number, RemotePosition>>
  space: SpaceBounds
  leader: RefObject<THREE.Vector3>
}) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const tags = useRef<THREE.Group>(null)
  const current = useRef(new THREE.Vector3())
  const companion = useRef(new THREE.Vector3())
  const placed = useRef(false)
  const motion = useRef<WalkMotion>({ phase: 0, amount: 0 })
  const ownerSeated = useRef(false)
  const jump = useRef({ y: 0, speed: 0, doubled: false, wasJumping: false, wasDoubled: false })

  useFrame((_, delta) => {
    const group = root.current
    const model = body.current
    if (!group || !model) return
    const target = positions.current.get(player.id)
    group.visible = Boolean(target)
    if (!target) return
    ownerSeated.current = target.seated

    const dt = Math.min(delta, 0.05)
    const position = current.current
    const beforeX = position.x
    const beforeZ = position.z
    if (!placed.current || Math.hypot(target.x - position.x, target.z - position.z) > SNAP_DISTANCE) {
      position.set(target.x, 0, target.z)
      companion.current.set(target.x + 1, 0, target.z + 1)
      placed.current = true
    } else {
      position.x = THREE.MathUtils.damp(position.x, target.x, 10, dt)
      position.z = THREE.MathUtils.damp(position.z, target.z, 10, dt)
    }
    group.position.copy(position)
    if (target.jumping && !jump.current.wasJumping) startJump(jump.current)
    if (target.doubleJumped && !jump.current.wasDoubled) startJump(jump.current)
    jump.current.wasJumping = target.jumping
    jump.current.wasDoubled = target.doubleJumped
    stepJump(jump.current, dt)
    group.position.y = jump.current.y

    const turn = Math.atan2(Math.sin(target.heading - model.rotation.y), Math.cos(target.heading - model.rotation.y))
    model.rotation.y += turn * (1 - Math.exp(-10 * dt))
    motion.current.amount = THREE.MathUtils.damp(motion.current.amount, target.moving ? 1 : 0, 10, dt)
    // 달리면 발도 빨라지도록 실제로 움직인 거리만큼 걸음을 옮긴다.
    motion.current.phase += Math.min(Math.hypot(position.x - beforeX, position.z - beforeZ), 1) * STEP_RATE
    motion.current.sit = THREE.MathUtils.damp(motion.current.sit ?? 0, target.seated ? 1 : 0, 12, dt)
    model.position.y = Math.abs(Math.sin(motion.current.phase)) * motion.current.amount * 0.08 + motion.current.sit * SEATED_LIFT
    model.rotation.z = hitWobble(play.hits.current.get(player.id))
    const knock = knockAmount(play.knocks.current.get(player.id))
    applyKnock(model, knock)
    // 휘두르는 동안에는 칠하는 사람을 바라본다.
    const swing = play.swings.current.get(player.id)
    motion.current.swing = swingAmount(swing?.at)
    const swingTarget = swing && motion.current.swing > 0 ? (swing.to === play.myId ? leader.current : positions.current.get(swing.to)) : undefined
    if (swingTarget) model.rotation.y = Math.atan2(swingTarget.x - position.x, swingTarget.z - position.z)
    if (tags.current) tags.current.position.y = -knock * KNOCK_TAG_DROP
  })

  return (
    <>
      <group
        ref={root}
        visible={false}
        onClick={(event) => {
          event.stopPropagation()
          if (event.delta <= 6) play.throwRequest.current = { target: player.id }
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = ''
        }}
      >
        <group ref={body} scale={CHARACTER_SCALE} rotation-order="YXZ">
          <Avatar config={player.avatar} motion={motion} />
          <PaintMarks id={player.id} paints={play.paints} />
        </group>
        <group ref={tags}>
          <NameTag name={player.nickname} />
          {speech && <SpeechBubble text={speech} />}
          <EmoteBubble id={player.id} emotes={play.emotes} raised={Boolean(speech)} />
        </group>
      </group>
      {player.doodle && <DoodleFollower position={companion} leader={current} seated={ownerSeated} space={space} faceCamera={false} />}
    </>
  )
}

/** 멀리 있는 방문자. 머리와 옷 색만 보이는 작은 인형으로 그린다. */
function Crowd({ players, positions }: {
  players: RemotePlayerData[]
  positions: RefObject<Map<number, RemotePosition>>
}) {
  const heads = useRef<THREE.InstancedMesh>(null)
  const bodies = useRef<THREE.InstancedMesh>(null)
  const smoothed = useRef(new Map<number, { x: number; z: number }>())
  const scratch = useMemo(() => new THREE.Object3D(), [])
  const tint = useMemo(() => new THREE.Color(), [])

  useEffect(() => {
    const mesh = bodies.current
    if (!mesh) return
    players.slice(0, CROWD_CAPACITY).forEach((player, index) => mesh.setColorAt(index, tint.set(player.avatar.outfitColor)))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [players, tint])

  useFrame((_, delta) => {
    const head = heads.current
    const body = bodies.current
    if (!head || !body) return
    const dt = Math.min(delta, 0.05)
    let count = 0
    for (const player of players) {
      if (count >= CROWD_CAPACITY) break
      const target = positions.current.get(player.id)
      if (!target) continue
      let position = smoothed.current.get(player.id)
      if (!position || Math.hypot(target.x - position.x, target.z - position.z) > SNAP_DISTANCE) {
        position = { x: target.x, z: target.z }
        smoothed.current.set(player.id, position)
      } else {
        position.x = THREE.MathUtils.damp(position.x, target.x, 10, dt)
        position.z = THREE.MathUtils.damp(position.z, target.z, 10, dt)
      }
      const lift = target.seated ? SEATED_LIFT : 0
      scratch.position.set(position.x, CROWD_HEAD_Y + lift, position.z)
      scratch.updateMatrix()
      head.setMatrixAt(count, scratch.matrix)
      scratch.position.y = CROWD_BODY_Y + lift
      scratch.updateMatrix()
      body.setMatrixAt(count, scratch.matrix)
      count += 1
    }
    head.count = count
    body.count = count
    head.instanceMatrix.needsUpdate = true
    body.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={heads} args={[undefined, undefined, CROWD_CAPACITY]} frustumCulled={false} castShadow>
        <sphereGeometry args={[0.42, 12, 10]} />
        <Toon color={COLORS.paper} outline={false} />
      </instancedMesh>
      <instancedMesh ref={bodies} args={[undefined, undefined, CROWD_CAPACITY]} frustumCulled={false} castShadow>
        <cylinderGeometry args={[0.2, 0.36, 1, 8]} />
        <Toon color="#ffffff" outline={false} />
      </instancedMesh>
    </>
  )
}

export function RemotePlayers({ players, speech, play, positions, space, leader }: {
  players: RemotePlayerData[]
  speech: SpeechMap
  play: PlayState
  positions: RefObject<Map<number, RemotePosition>>
  space: SpaceBounds
  leader: RefObject<THREE.Vector3>
}) {
  const [nearIds, setNearIds] = useState<ReadonlySet<number>>(new Set())
  const sinceCheck = useRef(DETAIL_RECHECK_SECONDS)

  useFrame((_, delta) => {
    if (players.length <= DETAIL_LIMIT) return
    sinceCheck.current += delta
    if (sinceCheck.current < DETAIL_RECHECK_SECONDS) return
    sinceCheck.current = 0
    const { x, z } = leader.current
    const nearest = players
      .flatMap((player) => {
        const target = positions.current.get(player.id)
        return target ? [{ id: player.id, distance: Math.hypot(target.x - x, target.z - z) }] : []
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, DETAIL_LIMIT)
    setNearIds((current) => {
      const unchanged = nearest.length === current.size && nearest.every(({ id }) => current.has(id))
      return unchanged ? current : new Set(nearest.map(({ id }) => id))
    })
  })

  const crowded = players.length > DETAIL_LIMIT
  const near = crowded ? players.filter((player) => nearIds.has(player.id)) : players
  const far = useMemo(() => (crowded ? players.filter((player) => !nearIds.has(player.id)) : []), [crowded, players, nearIds])

  return (
    <>
      {near.map((player) => (
        <RemotePlayer key={player.id} player={player} speech={speech[player.id]} play={play} positions={positions} space={space} leader={leader} />
      ))}
      {far.length > 0 && <Crowd players={far} positions={positions} />}
    </>
  )
}
