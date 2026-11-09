import { useEffect, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { COLORS } from '../../lib/brand'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'
import type { AvatarConfig } from '../../data/avatar'
import type { PlayState, RemotePosition } from '../../data/presence'
import { Avatar } from '../Avatar'
import { Doodle, type WalkMotion } from '../Characters'
import type { Seat } from '../seats'
import { NameTag } from './NameTag'
import { EmoteBubble } from './EmoteBubble'
import { PaintMarks } from './PaintMarks'
import { SpeechBubble } from './SpeechBubble'
import type { DoorSpot, SpaceBounds } from './layout'

const SPEED = 6
const SPRINT_SPEED = 10
const JUMP_SPEED = 7
const DOUBLE_JUMP_SPEED = 6.5
const GRAVITY = 20
const HIT_WOBBLE_MS = 500
const SWING_MS = 350
const KNOCK_FALL_MS = 300
const KNOCK_HOLD_MS = 2500
const KNOCK_RISE_MS = 500
const KNOCK_LIFT = 0.28
/** 누우면 이름표와 말풍선도 함께 내려온다. */
export const KNOCK_TAG_DROP = 0.8
const ACCELERATION = 10
const BODY_RADIUS = 0.5
export const CHARACTER_SCALE = 0.85
// 낮은 칸막이 위로 시야가 넘어가도록 카메라를 띄워 둔다.
const LOOK_HEIGHT = 1.6
const FOLLOW_CAMERA_DISTANCE = 10.5
// 세로 화면은 좌우로 보이는 폭이 좁아서 조금 더 물러선다.
const PORTRAIT_CAMERA_DISTANCE = 13
const FOLLOW_CAMERA_POLAR = 1.12
const WARP_DISTANCE = 9
const DOOR_REACH = 1.25
const DOOR_REARM_FACTOR = 1.6
const ARRIVE_DISTANCE = 0.15
const FOLLOW_DISTANCE = 1.5
const DOODLE_SIT_GAP = 3
const DOODLE_SIT_SPEED = 0.3
export const STEP_RATE = 2.2
// 벤치 앞까지 걸어가서 자리로 옮겨 앉는다. 벤치 상판 높이에 엉덩이가 오도록 몸을 올린다.
const SEAT_APPROACH = 1.9
const SEAT_REACH = 3.4
export const SEATED_LIFT = 0.34

// e.code는 키보드 위치 기준이라 한글 입력 상태에서도 동작한다.
const FORWARD_KEYS = new Set(['KeyW', 'ArrowUp'])
const BACK_KEYS = new Set(['KeyS', 'ArrowDown'])
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft'])
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight'])
const SPRINT_KEYS = new Set(['ShiftLeft', 'ShiftRight'])
const VIEW_LEFT_KEY = 'KeyQ'
const VIEW_RIGHT_KEY = 'KeyE'
const VIEW_KEYS = new Set([VIEW_LEFT_KEY, VIEW_RIGHT_KEY])
const VIEW_TURN_SPEED = 1.8

function isMoveKey(code: string) {
  return FORWARD_KEYS.has(code) || BACK_KEYS.has(code) || LEFT_KEYS.has(code) || RIGHT_KEYS.has(code) || SPRINT_KEYS.has(code) || VIEW_KEYS.has(code)
}

/** 채팅을 치는 동안에는 WASD와 E가 캐릭터를 움직이지 않게 한다. */
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

/** 점프 궤적. 같은 식을 다른 방문자에게도 써서 같은 높이로 뛰어 보이게 한다. */
export function stepJump(jump: { y: number; speed: number; doubled: boolean }, dt: number) {
  if (jump.y <= 0 && jump.speed <= 0) return
  jump.speed -= GRAVITY * dt
  jump.y = Math.max(jump.y + jump.speed * dt, 0)
  if (jump.y === 0) {
    jump.speed = 0
    jump.doubled = false
  }
}

/** 바닥에서 한 번, 공중에서 한 번 더 뛸 수 있다. */
export function startJump(jump: { y: number; speed: number; doubled: boolean }) {
  const grounded = jump.y <= 0 && jump.speed <= 0
  if (!grounded && jump.doubled) return false
  jump.doubled = !grounded
  jump.speed = grounded ? JUMP_SPEED : DOUBLE_JUMP_SPEED
  return true
}

/** 종이에 맞으면 잠깐 좌우로 휘청인다. */
export function hitWobble(hitAt: number | undefined) {
  if (hitAt === undefined) return 0
  const progress = (performance.now() - hitAt) / HIT_WOBBLE_MS
  return progress >= 1 ? 0 : Math.sin(progress * Math.PI * 4) * 0.35 * (1 - progress)
}

/** 붓을 휘두른 정도. 빠르게 앞으로 뻗었다가 돌아온다. */
export function swingAmount(swungAt: number | undefined) {
  if (swungAt === undefined) return 0
  const progress = (performance.now() - swungAt) / SWING_MS
  return progress >= 1 ? 0 : Math.sin(progress * Math.PI)
}

/** 쓰러진 정도. 넘어가는 동안 0에서 1로, 누워 있는 동안 1, 일어나면서 0으로 돌아온다. */
export function knockAmount(knockedAt: number | undefined) {
  if (knockedAt === undefined) return 0
  const elapsed = performance.now() - knockedAt
  if (elapsed < KNOCK_FALL_MS) return Math.sin(((elapsed / KNOCK_FALL_MS) * Math.PI) / 2)
  if (elapsed < KNOCK_FALL_MS + KNOCK_HOLD_MS) return 1
  const rising = (elapsed - KNOCK_FALL_MS - KNOCK_HOLD_MS) / KNOCK_RISE_MS
  return rising >= 1 ? 0 : 1 - rising * rising
}

/** 뒤로 벌렁 눕힌다. 몸의 기준점이 발이라 발을 축으로 넘어가고, 바닥에 묻히지 않게 살짝 띄운다. */
export function applyKnock(model: THREE.Group, amount: number) {
  model.rotation.x = -amount * (Math.PI / 2)
  model.position.y += amount * KNOCK_LIFT
}

function nearestSeat(seats: Seat[], point: { x: number; z: number }) {
  return seats.reduce((best, candidate) =>
    Math.hypot(candidate.x - point.x, candidate.z - point.z) < Math.hypot(best.x - point.x, best.z - point.z) ? candidate : best,
  )
}

/** 다른 방문자가 앉아 있지 않은 자리 중 point에서 가장 가까운 자리 */
function nearestFreeSeat(seats: Seat[] | undefined, positions: Map<number, RemotePosition>, point: { x: number; z: number }) {
  if (!seats?.length) return null
  const taken = new Set<Seat>()
  for (const other of positions.values()) if (other.seated) taken.add(nearestSeat(seats, other))
  const free = seats.filter((candidate) => !taken.has(candidate) && Math.hypot(candidate.x - point.x, candidate.z - point.z) < SEAT_REACH)
  return free.length > 0 ? nearestSeat(free, point) : null
}

function hasAny(pressed: Set<string>, keys: Set<string>) {
  for (const key of keys) if (pressed.has(key)) return true
  return false
}

export function resolveCollisions(position: THREE.Vector3, space: SpaceBounds) {
  for (const obstacle of space.obstacles) {
    const dx = position.x - obstacle.x
    const dz = position.z - obstacle.z
    const distance = Math.hypot(dx, dz) || 0.0001
    const minimum = obstacle.radius + BODY_RADIUS
    if (distance < minimum) {
      position.x = obstacle.x + (dx / distance) * minimum
      position.z = obstacle.z + (dz / distance) * minimum
    }
  }
  position.x = THREE.MathUtils.clamp(position.x, -space.halfX + BODY_RADIUS, space.halfX - BODY_RADIUS)
  position.z = THREE.MathUtils.clamp(position.z, -space.halfZ + BODY_RADIUS, space.halfZ - BODY_RADIUS)
}

/** 움직이는 방향을 바라보게 하고, 멈추면 천천히 카메라 쪽으로 돌아서 얼굴을 보여 준다. 카메라가 없으면 그대로 서 있는다. */
function animateBody(
  model: THREE.Group | null,
  velocity: THREE.Vector3,
  position: THREE.Vector3,
  camera: THREE.Camera | null,
  motion: WalkMotion,
  reducedMotion: boolean,
  dt: number,
  sitting = false,
) {
  if (!model) return
  const speed = velocity.length()
  const moving = speed > 0.3
  const heading = sitting
    ? 0
    : moving
      ? Math.atan2(velocity.x, velocity.z)
      : camera
        ? Math.atan2(camera.position.x - position.x, camera.position.z - position.z)
        : model.rotation.y
  const turn = Math.atan2(Math.sin(heading - model.rotation.y), Math.cos(heading - model.rotation.y))
  model.rotation.y += turn * (1 - Math.exp(-(moving ? 12 : 3) * dt))

  motion.amount = THREE.MathUtils.damp(motion.amount, reducedMotion ? 0 : Math.min(speed / SPEED, 1), 10, dt)
  motion.phase += speed * STEP_RATE * dt
  motion.sit = THREE.MathUtils.damp(motion.sit ?? 0, sitting ? 1 : 0, 12, dt)
  model.position.y = Math.abs(Math.sin(motion.phase)) * motion.amount * 0.08 + motion.sit * SEATED_LIFT
}

/** 터치 조이스틱 값. x는 오른쪽, y는 앞쪽이 양수이고 길이는 1 이하다. */
export type JoystickInput = { x: number; y: number; running?: boolean; jump?: boolean }

/** 전시실 바로가기 요청. nonce가 바뀌면 같은 곳으로 다시 이동할 수 있다. */
export type Jump = { x: number; z: number; faceX: number; faceZ: number; nonce: number }

function placeFollowCamera(
  camera: THREE.Camera,
  controls: OrbitControlsImpl,
  player: THREE.Vector3,
  towardCameraX: number,
  towardCameraZ: number,
) {
  const distance = (camera as THREE.PerspectiveCamera).aspect < 1 ? PORTRAIT_CAMERA_DISTANCE : FOLLOW_CAMERA_DISTANCE
  const horizontal = distance * Math.sin(FOLLOW_CAMERA_POLAR)
  const vertical = distance * Math.cos(FOLLOW_CAMERA_POLAR)
  controls.target.set(player.x, LOOK_HEIGHT, player.z)
  camera.position.set(player.x + towardCameraX * horizontal, LOOK_HEIGHT + vertical, player.z + towardCameraZ * horizontal)
  controls.update()
}

type PlayerProps = {
  avatar: AvatarConfig
  nickname: string
  /** 머리 위 말풍선에 띄울 내 채팅 */
  speech: string
  position: RefObject<THREE.Vector3>
  space: SpaceBounds
  doors: DoorSpot[]
  onDoor: (id: string) => void
  paused: boolean
  overview: boolean
  jump: Jump | null
  moveTarget: RefObject<THREE.Vector3 | null>
  joystick: RefObject<JoystickInput>
  /** 벤치를 누른 지점. 처리하면 비운다. */
  seatRequest: RefObject<Seat | null>
  /** 다른 방문자에게 알릴 앉은 상태 */
  seated: RefObject<boolean>
  /** 다른 방문자에게 알릴 공중에 뜬 상태 */
  airborne: RefObject<boolean>
  /** 다른 방문자에게 알릴 이단 점프 상태 */
  doubleJumped: RefObject<boolean>
  play: PlayState
  /** 다른 방문자 위치. 앉아 있는 자리를 피하는 데 쓴다. */
  positions: RefObject<Map<number, RemotePosition>>
}

/** 키보드나 바닥 클릭으로 걷는 캐릭터. 카메라도 같은 거리만큼 함께 옮겨 따라오게 한다. */
export function Player({ avatar, nickname, speech, position, space, doors, onDoor, paused, overview, jump, moveTarget, joystick, seatRequest, seated, airborne, doubleJumped, play, positions }: PlayerProps) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const marker = useRef<THREE.Mesh>(null)
  const tags = useRef<THREE.Group>(null)
  const pressed = useRef(new Set<string>())
  const velocity = useRef(new THREE.Vector3())
  const motion = useRef<WalkMotion>({ phase: 0, amount: 0 })
  const seat = useRef<Seat | null>(null)
  const jumpState = useRef({ y: 0, speed: 0, doubled: false })
  const jumpRequested = useRef(false)
  // 물어본 문은 벗어났다 다시 올 때까지 또 묻지 않는다.
  const touchedDoor = useRef<string | null>(null)
  const pendingSeat = useRef<{ seat: Seat; approach: THREE.Vector3 } | null>(null)
  const scratch = useRef({
    forward: new THREE.Vector3(),
    wish: new THREE.Vector3(),
    before: new THREE.Vector3(),
    moved: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    orbit: new THREE.Spherical(),
  })
  const reducedMotion = usePrefersReducedMotion()
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as unknown as OrbitControlsImpl | null

  useEffect(() => {
    if (!controls) return
    if (overview) {
      controls.target.set(0, 0, 0)
      const reach = Math.max(space.halfX, space.halfZ)
      camera.position.set(0, reach * 2.9, reach * 1.7)
      controls.update()
    } else {
      placeFollowCamera(camera, controls, position.current, 0, 1)
    }
  }, [overview, controls, camera, position, space])

  useEffect(() => {
    if (!jump || !controls) return
    position.current.set(jump.x, 0, jump.z)
    seat.current = null
    pendingSeat.current = null
    seated.current = false
    touchedDoor.current = null
    velocity.current.set(0, 0, 0)
    moveTarget.current = null
    placeFollowCamera(camera, controls, position.current, -jump.faceX, -jump.faceZ)
  }, [jump, controls, camera, position, moveTarget, seated])

  useEffect(() => {
    const keys = pressed.current
    const handleDown = (event: KeyboardEvent) => {
      if (!isMoveKey(event.code) || isTyping(event.target) || document.querySelector('dialog[open]')) return
      event.preventDefault()
      keys.add(event.code)
    }
    const handleUp = (event: KeyboardEvent) => keys.delete(event.code)
    const clear = () => keys.clear()
    window.addEventListener('keydown', handleDown)
    window.addEventListener('keyup', handleUp)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', handleDown)
      window.removeEventListener('keyup', handleUp)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useEffect(() => {
    if (paused) {
      pressed.current.clear()
      moveTarget.current = null
      pendingSeat.current = null
    }
  }, [paused, moveTarget])

  // 스페이스로 뛴다. 키보드로 버튼을 고른 때가 아니면 버튼이 눌리지 않게 막는다.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isTyping(event.target) || document.querySelector('dialog[open]')) return
      const target = event.target
      if (target instanceof HTMLElement && target !== document.body && target.tagName !== 'CANVAS') {
        if (target.matches(':focus-visible')) return
        target.blur()
      }
      event.preventDefault()
      jumpRequested.current = true
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // C 키로 가까운 벤치에 앉거나 일어난다.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code !== 'KeyC' || event.repeat || isTyping(event.target) || document.querySelector('dialog[open]')) return
      if (seat.current) {
        seat.current = null
        seated.current = false
        return
      }
      const { x, z } = position.current
      const near = space.seats?.some((candidate) => Math.hypot(candidate.x - x, candidate.z - z) < SEAT_REACH)
      if (near) seatRequest.current = { x, z }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [position, seatRequest, seated, space])

  useFrame(({ camera }, delta) => {
    const player = root.current
    if (!player || !controls) return
    const dt = Math.min(delta, 0.05)
    const current = position.current
    const { forward, wish, before, moved, offset, orbit } = scratch.current

    // 키보드로 시점을 돌린다. 걷는 방향도 카메라를 따르므로 걷기 계산보다 먼저 한다.
    const turn = Number(pressed.current.has(VIEW_LEFT_KEY)) - Number(pressed.current.has(VIEW_RIGHT_KEY))
    if (turn !== 0) {
      orbit.setFromVector3(offset.subVectors(camera.position, controls.target))
      orbit.theta += turn * VIEW_TURN_SPEED * dt
      camera.position.setFromSpherical(orbit).add(controls.target)
    }

    if (seatRequest.current && !paused) {
      const point = seatRequest.current
      const nearest = nearestFreeSeat(space.seats, positions.current, point)
      if (!nearest) {
        play.notify('이 벤치에는 앉을 자리가 없어요')
      } else {
        const approach = new THREE.Vector3(nearest.x, 0, nearest.z + SEAT_APPROACH)
        resolveCollisions(approach, space)
        pendingSeat.current = { seat: nearest, approach }
        seat.current = null
        seated.current = false
        moveTarget.current = approach
      }
    }
    seatRequest.current = null

    forward.set(controls.target.x - camera.position.x, 0, controls.target.z - camera.position.z).normalize()
    const keys = pressed.current
    const knock = play.myId === null ? 0 : knockAmount(play.knocks.current.get(play.myId))
    const knocked = knock > 0
    if (knocked) {
      moveTarget.current = null
      pendingSeat.current = null
      seat.current = null
      seated.current = false
    }
    const stick = paused ? { x: 0, y: 0 } : joystick.current
    const strafe = knocked ? 0 : Number(hasAny(keys, RIGHT_KEYS)) - Number(hasAny(keys, LEFT_KEYS)) + stick.x
    const advance = knocked ? 0 : Number(hasAny(keys, FORWARD_KEYS)) - Number(hasAny(keys, BACK_KEYS)) + stick.y
    wish.set(-forward.z * strafe + forward.x * advance, 0, forward.x * strafe + forward.z * advance)

    if (wish.lengthSq() > 0) {
      moveTarget.current = null
      pendingSeat.current = null
      seat.current = null
      seated.current = false
      // 조이스틱을 살짝 밀면 천천히 걷도록 1보다 짧으면 그대로 둔다.
      wish.clampLength(0, 1)
    } else if (moveTarget.current) {
      wish.subVectors(moveTarget.current, current).setY(0)
      if (wish.length() < ARRIVE_DISTANCE) {
        moveTarget.current = null
        wish.set(0, 0, 0)
      } else {
        wish.normalize()
      }
    }

    // 바닥을 눌러 다른 곳으로 가면 앉으려던 것을 취소하고 일어난다.
    const pending = pendingSeat.current
    if (pending && moveTarget.current && moveTarget.current !== pending.approach) pendingSeat.current = null
    if (seat.current && moveTarget.current) {
      seat.current = null
      seated.current = false
    }
    if (pendingSeat.current && !moveTarget.current) {
      // 걸어오는 사이 누가 앉았으면 옆자리로 가고, 그마저 없으면 서 있는다.
      const target = nearestFreeSeat(space.seats, positions.current, pendingSeat.current.seat)
      if (target && Math.hypot(target.x - current.x, target.z - current.z) < SEAT_REACH) {
        seat.current = target
        seated.current = true
      } else if (!target) {
        play.notify('먼저 앉은 사람이 있어요')
      }
      pendingSeat.current = null
    }

    // 둘이 거의 동시에 같은 자리에 앉으면 번호가 빠른 사람만 남는다.
    if (seat.current && space.seats && play.myId !== null) {
      for (const [id, other] of positions.current) {
        if (id < play.myId && other.seated && nearestSeat(space.seats, other) === seat.current) {
          seat.current = null
          seated.current = false
          play.notify('먼저 앉은 사람이 있어요')
          break
        }
      }
    }

    before.copy(current)
    if (seat.current) {
      velocity.current.set(0, 0, 0)
      current.x = THREE.MathUtils.damp(current.x, seat.current.x, 8, dt)
      current.z = THREE.MathUtils.damp(current.z, seat.current.z, 8, dt)
    } else {
      const sprinting = hasAny(keys, SPRINT_KEYS) || (joystick.current.running === true && !paused)
      velocity.current.lerp(wish.multiplyScalar(sprinting ? SPRINT_SPEED : SPEED), 1 - Math.exp(-ACCELERATION * dt))
      current.addScaledVector(velocity.current, dt)
      resolveCollisions(current, space)
    }
    const wantsJump = jumpRequested.current || joystick.current.jump === true
    jumpRequested.current = false
    joystick.current.jump = false
    if (wantsJump && !paused && !knocked && startJump(jumpState.current)) {
      seat.current = null
      seated.current = false
      pendingSeat.current = null
    }
    stepJump(jumpState.current, dt)
    airborne.current = jumpState.current.y > 0 || jumpState.current.speed > 0
    doubleJumped.current = jumpState.current.doubled
    player.position.copy(current)
    player.position.y = jumpState.current.y
    moved.subVectors(current, before)

    // 걸어서 문에 닿아도 클릭한 것과 똑같이 들어간다.
    if (velocity.current.length() > 1) {
      const door = doors.find((spot) => Math.hypot(current.x - spot.x, current.z - spot.z) < DOOR_REACH)
      if (door && door.id !== touchedDoor.current) {
        touchedDoor.current = door.id
        velocity.current.set(0, 0, 0)
        onDoor(door.id)
      }
    }
    if (touchedDoor.current) {
      const touched = doors.find((spot) => spot.id === touchedDoor.current)
      if (!touched || Math.hypot(current.x - touched.x, current.z - touched.z) > DOOR_REACH * DOOR_REARM_FACTOR) touchedDoor.current = null
    }

    // 장애물에 막혀 더 나아갈 수 없으면 목적지를 포기한다.
    if (moveTarget.current && velocity.current.length() > SPEED * 0.5 && moved.length() < 0.25 * velocity.current.length() * dt) {
      moveTarget.current = null
    }

    if (!overview) {
      controls.target.add(moved)
      camera.position.add(moved)
    }

    // 누워 있는 동안에는 카메라 쪽으로 돌지 않게 몸을 그대로 둔다.
    if (!knocked) animateBody(body.current, velocity.current, current, camera, motion.current, reducedMotion, dt, seat.current !== null)
    if (body.current) {
      body.current.rotation.z = play.myId === null ? 0 : hitWobble(play.hits.current.get(play.myId))
      if (knocked) body.current.position.y = 0
      applyKnock(body.current, knock)
      // 휘두르는 동안에는 칠하는 사람을 바라본다.
      const swing = play.myId === null ? undefined : play.swings.current.get(play.myId)
      motion.current.swing = swingAmount(swing?.at)
      const swingTarget = swing && motion.current.swing > 0 ? positions.current.get(swing.to) : undefined
      if (swingTarget) body.current.rotation.y = Math.atan2(swingTarget.x - current.x, swingTarget.z - current.z)
    }
    if (tags.current) tags.current.position.y = -knock * KNOCK_TAG_DROP

    if (marker.current) {
      const target = moveTarget.current
      marker.current.visible = Boolean(target)
      if (target) marker.current.position.set(target.x, 0.02, target.z)
    }
  })

  return (
    <>
      <group ref={root} position={position.current}>
        <group ref={body} scale={CHARACTER_SCALE} rotation-order="YXZ">
          <Avatar config={avatar} motion={motion} />
          {play.myId !== null && <PaintMarks id={play.myId} paints={play.paints} />}
        </group>
        <group ref={tags}>
          <NameTag name={nickname} />
          {speech && <SpeechBubble text={speech} />}
          {play.myId !== null && <EmoteBubble id={play.myId} emotes={play.emotes} raised={Boolean(speech)} />}
        </group>
      </group>
      <mesh ref={marker} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.28, 0.42, 28]} />
        <meshBasicMaterial color={COLORS.primaryDeep} transparent opacity={0.7} toneMapped={false} />
      </mesh>
    </>
  )
}

type FollowerProps = {
  space: SpaceBounds
  position: RefObject<THREE.Vector3>
  leader: RefObject<THREE.Vector3>
  /** 앞사람이 앉아 있으면 곁에 와서 함께 앉는다. */
  seated: RefObject<boolean>
  /** 내 두들만 내 화면을 돌아본다. 다른 사람의 두들이 내 카메라를 따라 고개를 돌리면 안 된다. */
  faceCamera?: boolean
}

/** 주인과 일정한 거리를 두고 따라 걷는 강아지 두들 */
export function DoodleFollower({ position, leader, seated, space, faceCamera = true }: FollowerProps) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const velocity = useRef(new THREE.Vector3())
  const wish = useRef(new THREE.Vector3())
  const motion = useRef<WalkMotion>({ phase: 0, amount: 0 })
  const settled = useRef(false)
  const reducedMotion = usePrefersReducedMotion()

  useFrame(({ camera }, delta) => {
    if (!root.current) return
    const dt = Math.min(delta, 0.05)
    const current = position.current
    const direction = wish.current.subVectors(leader.current, current).setY(0)
    const gap = direction.length()
    // 바로가기로 앞사람이 멀어지거나 벽에 걸리면 곁으로 옮겨 온다.
    if (gap > WARP_DISTANCE) {
      current.copy(leader.current).add(new THREE.Vector3(Math.sign(current.x - leader.current.x) || 1, 0, 1))
      velocity.current.set(0, 0, 0)
    }
    // 벤치에 막혀 더 못 다가가도 제자리걸음하지 않도록, 곁에서 멈췄으면 그 자리에 앉는다.
    if (!seated.current) settled.current = false
    if (settled.current) {
      direction.set(0, 0, 0)
    } else if (gap > FOLLOW_DISTANCE) {
      direction.normalize().multiplyScalar(Math.min((gap - FOLLOW_DISTANCE) * 5, SPRINT_SPEED * 1.1))
    } else {
      direction.set(0, 0, 0)
    }
    velocity.current.lerp(direction, 1 - Math.exp(-ACCELERATION * dt))
    const beforeX = current.x
    const beforeZ = current.z
    current.addScaledVector(velocity.current, dt)
    resolveCollisions(current, space)
    if (seated.current && gap < DOODLE_SIT_GAP && Math.hypot(current.x - beforeX, current.z - beforeZ) < DOODLE_SIT_SPEED * dt) settled.current = true
    root.current.position.copy(current)
    animateBody(body.current, velocity.current, current, faceCamera ? camera : null, motion.current, reducedMotion, dt)
    motion.current.dogSit = THREE.MathUtils.damp(motion.current.dogSit ?? 0, settled.current ? 1 : 0, 8, dt)
  })

  return (
    <group ref={root} position={position.current}>
      <group ref={body} scale={CHARACTER_SCALE}>
        <Doodle motion={motion} />
      </group>
    </group>
  )
}
