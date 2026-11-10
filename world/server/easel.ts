import { EASEL_MAX_POINTS, EASEL_ROOM, sanitizeSegment, segmentPoints, type EaselBrush, type EaselSegment } from '../src/data/easel.ts'
import { EASEL_BRUSH_HOME, EASEL_PAINT_REACH, EASEL_PICK_REACH, EASEL_POSITION } from '../src/scene/gallery/layout.ts'
import type { EaselStore } from './easelStore.ts'

// 화면의 위치는 서버보다 조금 늦으므로 닿는 거리에 여유를 둔다.
const REACH_SLACK = 1.5
const CLEAR_INTERVAL_MS = 5_000
// 종이에 맞아 붓을 놓친 사람이 그리던 마지막 선 조각은 조금 늦게 와도 받아 둔다.
const DROP_GRACE_MS = 1_500
// 한 사람이 붓을 들고 자리를 비워도 다른 사람이 쓸 수 있게, 이만큼 그리지 않으면 그 자리에 내려놓는다.
const HOLD_IDLE_MS = 2 * 60_000
// 아무도 그리지 않은 채 이만큼 지나면 다음 사람을 위해 붓을 제자리에 둔다. 그림은 지우기 전까지 남긴다.
const RESET_IDLE_MS = 30 * 60_000

export type EaselPlayer = { id: number; room: string; x: number; z: number; placed: boolean }

/**
 * 메인 전시실에 하나뿐인 이젤 붓과 함께 그리는 네컷 그림판의 상태. 그림은 store에 저장해 서버가 다시 켜져도 남고, 붓은 제자리로 돌아간다.
 * 새 종이를 누르면 그때까지의 그림은 store의 스케치북으로 넘어간다.
 * 붓은 한 사람만 들 수 있고, 든 사람만 이젤 가까이에서 그릴 수 있다. 그린 선은 붓을 놓쳐도 그대로 남는다.
 * 보내는 메시지: easel(붓 상태), easel-art(그림 전체), easel-seg(새 선 조각)
 */
export function createEasel(broadcast: (room: string, payload: string, exceptId?: number) => void, store?: EaselStore) {
  const brush: EaselBrush = { holder: null, x: EASEL_BRUSH_HOME.x, z: EASEL_BRUSH_HOME.z }
  let segments: EaselSegment[] = store?.load() ?? []
  let pointCount = segments.reduce((sum, segment) => sum + segmentPoints(segment), 0)
  let holderX = 0
  let holderZ = 0
  let lastUsedAt = Date.now()
  let lastClearAt = 0
  let dropped: { id: number; until: number } | null = null

  const brushPayload = () => JSON.stringify({ t: 'easel', ...brush })
  const artPayload = () => JSON.stringify({ t: 'easel-art', segs: segments })
  const publishBrush = () => broadcast(EASEL_ROOM, brushPayload())
  const near = (player: EaselPlayer, x: number, z: number, reach: number) =>
    player.room === EASEL_ROOM && player.placed && Math.hypot(player.x - x, player.z - z) <= reach + REACH_SLACK

  const drop = (x: number, z: number) => {
    brush.holder = null
    brush.x = Math.round(x * 100) / 100
    brush.z = Math.round(z * 100) / 100
    publishBrush()
  }

  const pick = (player: EaselPlayer, now: number) => {
    if (brush.holder !== null || !near(player, brush.x, brush.z, EASEL_PICK_REACH)) return
    brush.holder = player.id
    holderX = player.x
    holderZ = player.z
    lastUsedAt = now
    dropped = null
    publishBrush()
  }

  /** 받아들이지 않으면 false. 그린 사람 화면에는 먼저 그려 두므로 그 사람에게 그림 전체를 다시 보내야 한다. */
  const draw = (player: EaselPlayer, message: Record<string, unknown>, now: number) => {
    const holding = brush.holder === player.id
    const graced = dropped !== null && dropped.id === player.id && now < dropped.until
    if (!holding && !graced) return false
    if (holding && !near(player, EASEL_POSITION[0], EASEL_POSITION[2], EASEL_PAINT_REACH)) return false
    const segment = sanitizeSegment(message)
    if (!segment || pointCount + segmentPoints(segment) > EASEL_MAX_POINTS) return false
    segments.push(segment)
    pointCount += segmentPoints(segment)
    lastUsedAt = now
    store?.add(segment)
    broadcast(EASEL_ROOM, JSON.stringify({ t: 'easel-seg', from: player.id, ...segment }), player.id)
    return true
  }

  const clear = (player: EaselPlayer, now: number) => {
    if (brush.holder !== player.id || now - lastClearAt < CLEAR_INTERVAL_MS) return
    if (!near(player, EASEL_POSITION[0], EASEL_POSITION[2], EASEL_PAINT_REACH)) return
    lastClearAt = now
    lastUsedAt = now
    store?.clear(segments)
    segments = []
    pointCount = 0
    broadcast(EASEL_ROOM, artPayload())
  }

  return {
    /** 이젤 방에 들어온 사람에게 보낼 지금 상태 */
    snapshotFor: (room: string) => (room === EASEL_ROOM ? [brushPayload(), artPayload()] : []),

    /** 그리기를 받아들이지 않았으면 false를 돌려준다. */
    handle(player: EaselPlayer, message: Record<string, unknown>, now: number) {
      if (message.t === 'easel-pick') pick(player, now)
      else if (message.t === 'easel-drop' && brush.holder === player.id) drop(player.x, player.z)
      else if (message.t === 'easel-draw') return draw(player, message, now)
      else if (message.t === 'easel-clear') clear(player, now)
      return true
    },

    /** 든 사람의 위치를 따라가 두었다가, 그 사람이 나가면 마지막 자리에 떨어뜨린다. */
    moved(player: EaselPlayer) {
      if (brush.holder !== player.id) return
      holderX = player.x
      holderZ = player.z
    },

    /** 든 사람이 다른 방으로 가거나 접속이 끊기면 붓을 내려놓는다. */
    left(player: EaselPlayer) {
      if (brush.holder === player.id) drop(holderX, holderZ)
    },

    /** 든 사람이 종이에 맞으면 붓을 그 자리에 떨어뜨린다. 그리던 선은 잠깐 더 받아 준다. */
    hit(player: EaselPlayer, now: number) {
      if (brush.holder !== player.id) return
      dropped = { id: player.id, until: now + DROP_GRACE_MS }
      drop(player.x, player.z)
    },

    tick(now: number) {
      if (brush.holder !== null && now - lastUsedAt >= HOLD_IDLE_MS) {
        lastUsedAt = now
        drop(holderX, holderZ)
        return
      }
      if (brush.holder === null && now - lastUsedAt >= RESET_IDLE_MS) {
        lastUsedAt = now
        const moved = brush.x !== EASEL_BRUSH_HOME.x || brush.z !== EASEL_BRUSH_HOME.z
        if (moved) {
          brush.x = EASEL_BRUSH_HOME.x
          brush.z = EASEL_BRUSH_HOME.z
          publishBrush()
        }
      }
    },
  }
}
