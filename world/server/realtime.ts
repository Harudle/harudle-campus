import { EASEL_ROOM } from '../src/data/easel.ts'
import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ChatLog } from './chatLog.ts'
import { createEasel } from './easel.ts'
import type { EaselStore } from './easelStore.ts'
import { charLength, cleanText, LINK_PATTERN } from './cheers.ts'
import { sanitizeAvatar, type AvatarConfig } from '../src/data/avatar.ts'
import { isEmote } from '../src/data/emotes.ts'
import { BRUSH_REACH, MAX_SPACE_HALF_X, MAX_SPACE_HALF_Z } from '../src/scene/gallery/layout.ts'

const SNAPSHOT_INTERVAL_MS = 100
const ROSTER_EVERY_TICKS = 3
const LARGE_ROOM_SIZE = 40
const HEARTBEAT_INTERVAL_MS = 30_000
const MAX_PAYLOAD_BYTES = 2048
const MAX_MESSAGES_PER_SECOND = 40
const MAX_BUFFERED_BYTES = 64 * 1024
const ROOM_PATTERN = /^[A-Za-z0-9-]{1,64}$/
const DEFAULT_ROOM = 'main'
const MAX_NICKNAME_LENGTH = 12
const MAX_CHAT_LENGTH = 100
const CHAT_WINDOW_MS = 10_000
const MAX_CHATS_PER_WINDOW = 5
const THROW_WINDOW_MS = 5_000
const MAX_THROWS_PER_WINDOW = 6
const KNOCK_HITS = 1
const KNOCK_HIT_WINDOW_MS = 10_000
// 쓰러져 있는 3.3초에 더해, 일어난 뒤 곧바로 다시 쓰러뜨려 괴롭힐 수 없게 쉬는 시간을 둔다.
const KNOCK_IMMUNE_MS = 8_000
// 던진 종이가 이 거리 안의 사람에게 맞는다. 클라이언트의 비행 속도와 맞춘다.
const PAPER_HIT_RADIUS = 1
const PAPER_FLIGHT_SPEED = 16
const PAPER_MIN_FLIGHT_MS = 250
const PAPER_DROP_HEIGHT = 1.34
const MAX_MUTED_PLAYERS = 200
const BRUSH_INTERVAL_MS = 500
const EMOTE_INTERVAL_MS = 1_000
// 화면의 위치는 서버보다 조금 늦으므로 닿는 거리에 여유를 둔다.
const BRUSH_REACH_SLACK = 1.5
// 열려 있는 화면은 멈춰 있어도 1초마다 위치를 보낸다. 숨긴 탭은 보내지 않으므로 이만큼 지나면 세지 않는다.
const LIVE_SIGNAL_MS = 3 * 60_000
const EASEL_TICK_EVERY = 10
// 거절한 그리기에 그림 전체를 다시 보내는 간격. 그림이 커도 거절 메시지 하나로 서버 전송량이 크게 늘지 않게 한다.
const EASEL_RESYNC_INTERVAL_MS = 2_000
const NON_VISITOR_AGENT = /bot|crawl|spider|headless|lighthouse|playwright|puppeteer|selenium/i

/** 전시관이 가득 찼을 때의 종료 코드. 클라이언트는 이 코드면 재접속하지 않는다. */
export const CLOSE_FULL = 4001
/** 재배포로 서버가 바뀔 때의 종료 코드. 클라이언트는 화면을 유지한 채 바로 다시 붙는다. */
export const CLOSE_RESTART = 1012

export type RealtimeOptions = {
  path: string
  maxPlayers: number
  isOriginAllowed: (origin: string | undefined) => boolean
  /** 있으면 채팅을 저장하고 들어온 사람에게 최근 대화를 보낸다. */
  chatLog?: ChatLog
  /** 있으면 이젤 그림을 저장해 서버가 다시 켜져도 남긴다. */
  easelStore?: EaselStore
}

type Player = {
  id: number
  socket: WebSocket
  avatar: AvatarConfig
  nickname: string
  doodle: boolean
  room: string
  x: number
  z: number
  heading: number
  moving: boolean
  seated: boolean
  jumping: boolean
  doubleJumped: boolean
  placed: boolean
  alive: boolean
  browser: boolean
  lastMoveAt: number
  windowStart: number
  windowCount: number
  chatWindowStart: number
  chatCount: number
  throwWindowStart: number
  throwCount: number
  hitWindowStart: number
  hitCount: number
  knockImmuneUntil: number
  lastBrushAt: number
  lastEmoteAt: number
  lastEaselResyncAt: number
  mutedPlayers: Set<number>
}

function clampNumber(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(Math.max(value, min), max)
}

function sanitizeRoom(value: unknown) {
  return typeof value === 'string' && ROOM_PATTERN.test(value) ? value : DEFAULT_ROOM
}

/** 다른 방문자 머리 위에 뜨므로 길이를 넘거나 링크가 든 이름은 없는 것으로 친다. */
function sanitizeNickname(value: unknown) {
  if (typeof value !== 'string') return ''
  const nickname = cleanText(value).replace(/\n/g, ' ')
  return charLength(nickname) > MAX_NICKNAME_LENGTH || LINK_PATTERN.test(nickname) ? '' : nickname
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

/** 일반 브라우저로 들어온 접속인지 본다. 봇과 테스트 도구는 접속자 수에서 뺀다. */
function isBrowserAgent(agent: string | undefined) {
  return agent !== undefined && agent.startsWith('Mozilla/') && !NON_VISITOR_AGENT.test(agent)
}

/**
 * 전시관과 오락실의 위치 공유 서버. 위치, 아바타 선택값, 닉네임, 채팅, 종이 던지기를 주고받고,
 * 같은 방 사람의 정보만 보내며,
 * 값은 모두 서버에서 검증해 허용된 항목과 전시관 범위 안으로 맞춘다.
 * 채팅은 같은 방에 전달하고 chatLog에 기록해, 나중에 들어온 사람도 최근 대화를 볼 수 있다.
 */
export function attachRealtime(server: Server, { path, maxPlayers, isOriginAllowed, chatLog, easelStore }: RealtimeOptions) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES })
  const players = new Map<WebSocket, Player>()
  let nextId = 1
  const rosterDirty = new Set<string>()
  const positionsDirty = new Set<string>()
  let lastTotal = 0
  let snapshotTick = 0

  const send = (socket: WebSocket, payload: string) => {
    if (socket.readyState === socket.OPEN && socket.bufferedAmount < MAX_BUFFERED_BYTES) socket.send(payload)
  }

  const easel = createEasel((room, payload, exceptId) => {
    for (const member of players.values()) {
      if (member.room === room && member.id !== exceptId) send(member.socket, payload)
    }
  }, easelStore)
  const sendEasel = (player: Player) => {
    for (const payload of easel.snapshotFor(player.room)) send(player.socket, payload)
  }

  /** 접속이 몰려도 명단을 한 번만 보내도록 바뀐 방을 모아 두었다가 주기적으로 보낸다. */
  const markRoster = (room: string) => {
    rosterDirty.add(room)
  }

  const flushRosters = () => {
    const total = players.size
    const totalChanged = total !== lastTotal
    lastTotal = total
    if (rosterDirty.size === 0 && !totalChanged) return

    const rooms = new Map<string, Player[]>()
    for (const player of players.values()) {
      const members = rooms.get(player.room)
      if (members) members.push(player)
      else rooms.set(player.room, [player])
    }
    const countPayload = totalChanged ? JSON.stringify({ t: 'count', total }) : null
    for (const [room, members] of rooms) {
      if (!rosterDirty.has(room)) {
        if (countPayload) for (const member of members) send(member.socket, countPayload)
        continue
      }
      const payload = JSON.stringify({
        t: 'roster',
        total,
        players: members.map(({ id, avatar, nickname, doodle, room: memberRoom }) => ({ id, avatar, nickname, doodle, room: memberRoom })),
      })
      for (const member of members) send(member.socket, payload)
    }
    rosterDirty.clear()
  }

  /** 공간에 들어온 사람에게 최근 대화를 보낸다. 그 사람이 가린 방문자의 글은 뺀다. */
  const sendChatHistory = (player: Player) => {
    if (!chatLog) return
    const items = chatLog.recent(player.room).filter((item) => item.id === null || !player.mutedPlayers.has(item.id))
    send(player.socket, JSON.stringify({ t: 'chat-history', items }))
  }

  const handleChat = (player: Player, value: unknown, now: number) => {
    if (typeof value !== 'string') return
    const text = cleanText(value).replace(/\s*\n\s*/g, ' ')
    if (!text) return
    const reject = (reason: 'long' | 'link' | 'fast') => send(player.socket, JSON.stringify({ t: 'chat-reject', reason }))
    if (charLength(text) > MAX_CHAT_LENGTH) return reject('long')
    if (LINK_PATTERN.test(text)) return reject('link')
    if (now - player.chatWindowStart >= CHAT_WINDOW_MS) {
      player.chatWindowStart = now
      player.chatCount = 0
    }
    if (player.chatCount >= MAX_CHATS_PER_WINDOW) return reject('fast')
    player.chatCount += 1
    chatLog?.add(player.room, player.id, player.nickname, text)
    const payload = JSON.stringify({ t: 'chat', id: player.id, nickname: player.nickname, text })
    for (const member of players.values()) {
      if (member.room === player.room) send(member.socket, payload)
    }
  }

  /** 짧은 시간에 많이 맞으면 쓰러진다. 내가 가린 사람의 종이는 세지 않는다. */
  const countHit = (target: Player, thrower: Player, now: number) => {
    if (target.mutedPlayers.has(thrower.id) || now < target.knockImmuneUntil) return false
    if (now - target.hitWindowStart >= KNOCK_HIT_WINDOW_MS) {
      target.hitWindowStart = now
      target.hitCount = 0
    }
    target.hitCount += 1
    if (target.hitCount < KNOCK_HITS) return false
    target.hitCount = 0
    target.knockImmuneUntil = now + KNOCK_IMMUNE_MS
    return true
  }

  /** 종이가 도착할 때 그 자리에 있는 사람을 맞힌다. 그 사이 비켜나면 피할 수 있다. */
  const landPaper = (thrower: Player, x: number, z: number, flightMs: number) => {
    const timer = setTimeout(() => {
      if (!players.has(thrower.socket)) return
      let hit: Player | null = null
      let nearest = PAPER_HIT_RADIUS
      for (const member of players.values()) {
        if (member === thrower || member.room !== thrower.room || !member.placed || member.mutedPlayers.has(thrower.id)) continue
        const distance = Math.hypot(member.x - x, member.z - z)
        if (distance <= nearest) {
          nearest = distance
          hit = member
        }
      }
      if (!hit) return
      easel.hit(hit, Date.now())
      const knock = countHit(hit, thrower, Date.now())
      const payload = JSON.stringify({ t: 'hit', id: hit.id, from: thrower.id, nickname: thrower.nickname, ...(knock ? { knock: true } : {}) })
      for (const member of players.values()) {
        if (member.room === thrower.room) send(member.socket, payload)
      }
    }, flightMs)
    timer.unref()
  }

  /** 겨냥한 x, z 자리로 던진다. 사람을 따라가지 않으므로 맞았는지는 도착할 때 정한다. */
  const handleThrow = (player: Player, message: Record<string, unknown>, now: number) => {
    if (now - player.throwWindowStart >= THROW_WINDOW_MS) {
      player.throwWindowStart = now
      player.throwCount = 0
    }
    if (player.throwCount >= MAX_THROWS_PER_WINDOW) return

    const x = clampNumber(message.x, -MAX_SPACE_HALF_X, MAX_SPACE_HALF_X)
    const z = clampNumber(message.z, -MAX_SPACE_HALF_Z, MAX_SPACE_HALF_Z)
    if (x === null || z === null) return

    player.throwCount += 1
    const flight = (Math.hypot(x - player.x, z - player.z, PAPER_DROP_HEIGHT) / PAPER_FLIGHT_SPEED) * 1000
    landPaper(player, x, z, Math.max(flight, PAPER_MIN_FLIGHT_MS))
    const payload = JSON.stringify({ t: 'throw', from: player.id, nickname: player.nickname, x: round(x), z: round(z) })
    for (const member of players.values()) {
      if (member.room === player.room) send(member.socket, payload)
    }
  }

  /** 붓을 든 사람만 닿는 거리의 같은 방 사람을 칠할 수 있다. 나를 가린 사람은 칠해지지 않는다. */
  const handleBrush = (player: Player, value: unknown, now: number) => {
    if (player.avatar.held !== 'brush' || !player.placed || now - player.lastBrushAt < BRUSH_INTERVAL_MS) return
    let target: Player | null = null
    for (const member of players.values()) {
      if (member.id === value && member !== player && member.room === player.room && member.placed) target = member
    }
    if (!target || target.mutedPlayers.has(player.id)) return
    if (Math.hypot(target.x - player.x, target.z - player.z) > BRUSH_REACH + BRUSH_REACH_SLACK) return
    player.lastBrushAt = now
    const payload = JSON.stringify({ t: 'brush', from: player.id, nickname: player.nickname, to: target.id, color: player.avatar.heldColor })
    for (const member of players.values()) {
      if (member.room === player.room) send(member.socket, payload)
    }
  }

  const handleMessage = (socket: WebSocket, raw: string, browser: boolean) => {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof message !== 'object' || message === null) return

    const player = players.get(socket)

    if (message.t === 'join' && !player) {
      if (players.size >= maxPlayers) {
        socket.close(CLOSE_FULL, 'full')
        return
      }
      const id = nextId++
      players.set(socket, {
        id,
        socket,
        avatar: sanitizeAvatar(message.avatar),
        nickname: sanitizeNickname(message.nickname),
        doodle: message.doodle === true,
        room: sanitizeRoom(message.room),
        x: 0,
        z: 0,
        heading: 0,
        moving: false,
        seated: false,
        jumping: false,
        doubleJumped: false,
        placed: false,
        alive: true,
        browser,
        lastMoveAt: 0,
        windowStart: Date.now(),
        windowCount: 0,
        chatWindowStart: Date.now(),
        chatCount: 0,
        throwWindowStart: Date.now(),
        throwCount: 0,
        hitWindowStart: Date.now(),
        hitCount: 0,
        knockImmuneUntil: 0,
        lastBrushAt: 0,
        lastEmoteAt: 0,
        lastEaselResyncAt: 0,
        mutedPlayers: new Set(),
      })
      send(socket, JSON.stringify({ t: 'welcome', id }))
      markRoster(sanitizeRoom(message.room))
      const joined = players.get(socket)
      if (joined) {
        sendChatHistory(joined)
        sendEasel(joined)
      }
      return
    }

    if (!player) return

    const now = Date.now()
    if (now - player.windowStart >= 1000) {
      player.windowStart = now
      player.windowCount = 0
    }
    player.windowCount += 1
    if (player.windowCount > MAX_MESSAGES_PER_SECOND) {
      socket.close(1008, 'rate limit')
      return
    }

    if (message.t === 'move') {
      const x = clampNumber(message.x, -MAX_SPACE_HALF_X, MAX_SPACE_HALF_X)
      const z = clampNumber(message.z, -MAX_SPACE_HALF_Z, MAX_SPACE_HALF_Z)
      const heading = clampNumber(message.h, -Math.PI * 2, Math.PI * 2)
      if (x === null || z === null || heading === null) return
      player.x = x
      player.z = z
      player.heading = heading
      player.moving = message.m === true
      player.seated = message.s === true
      player.jumping = message.j === true
      player.doubleJumped = message.d === true
      player.placed = true
      player.lastMoveAt = now
      positionsDirty.add(player.room)
      easel.moved(player)
    } else if (message.t === 'avatar') {
      player.avatar = sanitizeAvatar(message.avatar)
      player.nickname = sanitizeNickname(message.nickname)
      player.doodle = message.doodle === true
      markRoster(player.room)
    } else if (message.t === 'room') {
      markRoster(player.room)
      easel.left(player)
      player.room = sanitizeRoom(message.room)
      player.placed = false
      markRoster(player.room)
      sendChatHistory(player)
      sendEasel(player)
    } else if (message.t === 'chat') {
      handleChat(player, message.text, now)
    } else if (message.t === 'throw') {
      handleThrow(player, message, now)
    } else if (message.t === 'brush') {
      handleBrush(player, message.to, now)
    } else if (message.t === 'emote') {
      if (!isEmote(message.emote) || now - player.lastEmoteAt < EMOTE_INTERVAL_MS) return
      player.lastEmoteAt = now
      const payload = JSON.stringify({ t: 'emote', from: player.id, emote: message.emote })
      for (const member of players.values()) {
        if (member.room === player.room) send(member.socket, payload)
      }
    } else if (typeof message.t === 'string' && message.t.startsWith('easel-')) {
      if (!easel.handle(player, message, now) && now - player.lastEaselResyncAt >= EASEL_RESYNC_INTERVAL_MS) {
        player.lastEaselResyncAt = now
        sendEasel(player)
      }
    } else if (message.t === 'mute' && typeof message.id === 'number' && player.mutedPlayers.size < MAX_MUTED_PLAYERS) {
      player.mutedPlayers.add(message.id)
    }
  }

  sockets.on('connection', (socket, request) => {
    const browser = isBrowserAgent(request.headers['user-agent'])
    socket.on('message', (data, isBinary) => {
      if (!isBinary) handleMessage(socket, data.toString(), browser)
    })
    socket.on('pong', () => {
      const player = players.get(socket)
      if (player) player.alive = true
    })
    socket.on('error', () => socket.terminate())
    socket.on('close', () => {
      const player = players.get(socket)
      if (player && players.delete(socket)) {
        markRoster(player.room)
        easel.left(player)
      }
    })
  })

  const handleUpgrade: Parameters<Server['on']>[1] = (request, socket, head) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost')
    if (pathname !== path) return // Vite HMR처럼 다른 경로는 건드리지 않는다.
    if (!isOriginAllowed(request.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client, request))
  }
  server.on('upgrade', handleUpgrade)

  const snapshotTimer = setInterval(() => {
    snapshotTick += 1
    if (snapshotTick % ROSTER_EVERY_TICKS === 0) flushRosters()
    if (snapshotTick % EASEL_TICK_EVERY === 0) easel.tick(Date.now())
    if (positionsDirty.size === 0) return

    const rooms = new Map<string, Player[]>()
    for (const player of players.values()) {
      if (!positionsDirty.has(player.room)) continue
      const members = rooms.get(player.room)
      if (members) members.push(player)
      else rooms.set(player.room, [player])
    }
    positionsDirty.clear()

    for (const [room, members] of rooms) {
      // 사람이 많은 방은 전송량이 제곱으로 늘어서 위치를 절반 빈도로 보낸다.
      if (members.length > LARGE_ROOM_SIZE && snapshotTick % 2 === 1) {
        positionsDirty.add(room)
        continue
      }
      const payload = JSON.stringify({
        t: 'snapshot',
        players: members
          .filter((player) => player.placed)
          .map(({ id, x, z, heading, moving, seated, jumping, doubleJumped }) => ({ id, x: round(x), z: round(z), h: round(heading), m: moving, s: seated, ...(jumping ? { j: true } : {}), ...(doubleJumped ? { d: true } : {}) })),
      })
      for (const member of members) send(member.socket, payload)
    }
  }, SNAPSHOT_INTERVAL_MS)

  const heartbeatTimer = setInterval(() => {
    for (const player of players.values()) {
      if (!player.alive) {
        player.socket.terminate()
        continue
      }
      player.alive = false
      player.socket.ping()
    }
  }, HEARTBEAT_INTERVAL_MS)

  snapshotTimer.unref()
  heartbeatTimer.unref()

  const close = () => {
    clearInterval(snapshotTimer)
    clearInterval(heartbeatTimer)
    server.off('upgrade', handleUpgrade)
    for (const client of sockets.clients) client.close(CLOSE_RESTART, 'restart')
    sockets.close()
  }
  server.once('close', close)

  /** 밖으로 알리는 접속자 수. 모든 공간을 합치고, 봇과 최근 신호가 없는 접속은 뺀다. */
  const liveCount = () => {
    const since = Date.now() - LIVE_SIGNAL_MS
    let count = 0
    for (const player of players.values()) {
      if (player.browser && player.lastMoveAt >= since) count += 1
    }
    return count
  }

  // 캠퍼스: 14층 이젤 그림을 HTTP로 보여 주려고 지금 상태를 꺼낸다
  const easelSnapshot = () => easel.snapshotFor(EASEL_ROOM).map((payload) => JSON.parse(payload))

  return { close, playerCount: () => players.size, liveCount, easelSnapshot }
}

/** 개발 서버와 로컬 미리보기에서만 쓰는 판별 함수. 같은 와이파이의 휴대폰으로 확인할 수 있게 사설 IP도 받는다. */
export function isLocalOrigin(origin: string | undefined) {
  if (!origin) return false
  try {
    const { hostname } = new URL(origin)
    return (
      ['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+/.test(hostname)
    )
  } catch {
    return false
  }
}
