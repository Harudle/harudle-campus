import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { sanitizeAvatar, type AvatarConfig } from './avatar'
import { isEmote, type EmoteId } from './emotes'
import { isEaselBrush, sanitizeSegment, type EaselBrush, type EaselSegment } from './easel'

export type PresenceStatus = 'connecting' | 'online' | 'offline' | 'full'

export type RemotePlayer = {
  id: number
  avatar: AvatarConfig
  nickname: string
  doodle: boolean
  room: string
}

export type RemotePosition = {
  x: number
  z: number
  heading: number
  moving: boolean
  seated: boolean
  jumping: boolean
  doubleJumped: boolean
}

export type MoveUpdate = { x: number; z: number; heading: number; moving: boolean; seated: boolean; jumping: boolean; doubleJumped: boolean }

/** historic은 들어오기 전의 대화다. id를 알 수 없는 옛 글은 null이다. */
export type ChatMessage = { key: number; id: number | null; nickname: string; text: string; mine: boolean; at: number; historic: boolean }

export type ChatReject = 'long' | 'link' | 'fast'

/** 머리 위 말풍선 문구. 방문자 id별로 잠깐만 들고 있는다. */
export type SpeechMap = Readonly<Record<number, string>>

/** 날아가는 종이 하나. 겨냥한 x, z 자리로 날아가 떨어지고, 맞았는지는 도착할 때 서버가 알려 준다. */
export type PaperThrow = { key: number; from: number; nickname: string; x: number; z: number }

/** 사람을 직접 눌렀거나, 화면의 한 점(-1~1)을 골랐거나, 마우스가 가리키는 곳으로 던지는 요청 */
export type ThrowRequest = { target: number } | { point: { x: number; y: number } } | { atPointer: true }

/** 붓으로 칠해진 자국 하나 */
export type PaintMark = { color: string; at: number }

/** 지금 머리 위에 띄운 감정 표현 */
export type ActiveEmote = { emote: EmoteId; at: number }

/** 붓을 휘두른 때와 칠한 상대 */
export type BrushSwing = { at: number; to: number }

/** 3D 무대가 함께 쓰는 놀이 상태 */
export type PlayState = {
  myId: number | null
  throws: PaperThrow[]
  /** 방문자 id별로 마지막에 종이에 맞은 시각 */
  hits: RefObject<Map<number, number>>
  /** 방문자 id별로 마지막에 쓰러진 시각 */
  knocks: RefObject<Map<number, number>>
  /** 버튼이나 키, 캐릭터 클릭으로 들어온 던지기 요청 */
  throwRequest: RefObject<ThrowRequest | null>
  /** 내가 붓을 들었으면 가까운 사람에게는 던지는 대신 붓을 쓴다. */
  holdsBrush: boolean
  /** 방문자 id별로 마지막에 붓을 휘두른 때 */
  swings: RefObject<Map<number, BrushSwing>>
  /** 방문자 id별로 칠해진 자국 */
  paints: RefObject<Map<number, PaintMark[]>>
  /** 방문자 id별로 마지막에 고른 감정 표현 */
  emotes: RefObject<Map<number, ActiveEmote>>
  sendEmote: (emote: EmoteId) => void
  sendBrush: (to: number) => void
  sendThrow: (spot: { x: number; z: number }) => void
  finishThrow: (key: number) => void
  /** 화면 위쪽에 잠깐 띄우는 알림 */
  notify: (text: string) => void
}

/** 이젤 붓 줍기, 내려놓기, 칸 칠하기, 새 종이 */
export type EaselAction = { t: 'easel-pick' } | { t: 'easel-drop' } | ({ t: 'easel-draw' } & EaselSegment) | { t: 'easel-clear' }

/** 이젤 그림. 선 조각이 자주 늘어나므로 목록은 ref에 두고, 바뀔 때마다 version만 올린다. */
export type EaselArt = { segments: RefObject<EaselSegment[]>; version: number }

const MAX_FLYING_PAPERS = 40
const MAX_CHAT_MESSAGES = 50
const MAX_PAINT_MARKS = 6
const SPEECH_SECONDS = 6
const CLOSE_FULL = 4001
const CLOSE_RESTART = 1012
/** 재배포 때 모두가 한꺼번에 몰리지 않도록 조금씩 흩어져 다시 붙는다. */
const RESTART_RETRY_MAX_MS = 500
const MIN_RETRY_MS = 1000
const MAX_RETRY_MS = 30_000

function realtimeUrl() {
  const configured = import.meta.env.VITE_REALTIME_URL as string | undefined
  if (configured) return configured
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  // 캠퍼스: /ws는 캠퍼스 실시간 서버가 쓰므로 월드는 /world/ws로 붙는다.
  return `${scheme}://${window.location.host}/world/ws`
}

/**
 * 전시관에 함께 있는 방문자를 동기화한다. 위치는 매 프레임 읽히므로 ref에 두어 리렌더를 막는다.
 * 서버에 닿지 못해도 전시관은 혼자 볼 수 있어서, 조용히 재접속만 시도한다.
 */
export function usePresence(active: boolean, avatar: AvatarConfig, doodle: boolean, room: string, nickname: string) {
  const [status, setStatus] = useState<PresenceStatus>('connecting')
  const [others, setOthers] = useState<RemotePlayer[]>([])
  const [total, setTotal] = useState(1)
  const [myId, setMyId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [speech, setSpeech] = useState<SpeechMap>({})
  const [chatReject, setChatReject] = useState<{ reason: ChatReject; key: number } | null>(null)
  const [throws, setThrows] = useState<PaperThrow[]>([])
  const [hitNotice, setHitNotice] = useState<{ text: string; key: number } | null>(null)
  const [easel, setEasel] = useState<EaselBrush | null>(null)
  const easelSegments = useRef<EaselSegment[]>([])
  const [easelVersion, setEaselVersion] = useState(0)
  const hits = useRef(new Map<number, number>())
  const knocks = useRef(new Map<number, number>())
  const swings = useRef(new Map<number, BrushSwing>())
  const paints = useRef(new Map<number, PaintMark[]>())
  const emotes = useRef(new Map<number, ActiveEmote>())
  const throwRequest = useRef<ThrowRequest | null>(null)
  const myIdRef = useRef<number | null>(null)
  /** 맞은 사람을 휘청이거나 쓰러뜨리고, 나라면 알려 준다. */
  const applyHit = useCallback((id: number, nickname: string, knock: boolean) => {
    hits.current.set(id, performance.now())
    if (knock) knocks.current.set(id, performance.now())
    if (id !== myIdRef.current) return
    chatKey.current += 1
    const thrower = nickname || '누군가'
    setHitNotice({ text: knock ? `${thrower}님이 던진 종이에 맞아 쓰러졌어요!` : `${thrower}님이 던진 종이에 맞았어요!`, key: chatKey.current })
  }, [])
  const muted = useRef(new Set<number>())
  const chatKey = useRef(0)
  const speechTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const positions = useRef(new Map<number, RemotePosition>())
  const socketRef = useRef<WebSocket | null>(null)
  const identity = useRef({ avatar, doodle, room, nickname })
  identity.current = { avatar, doodle, room, nickname }

  useEffect(() => {
    if (!active) return
    let stopped = false
    let retryMs = MIN_RETRY_MS
    let retryTimer: ReturnType<typeof setTimeout>
    let myId: number | null = null
    const timers = speechTimers.current

    const clearSpeech = (id: number) => {
      timers.delete(id)
      setSpeech(({ [id]: _removed, ...rest }) => rest)
    }

    const receiveChat = (id: number, nickname: string, text: string) => {
      if (muted.current.has(id)) return
      chatKey.current += 1
      const message = { key: chatKey.current, id, nickname, text, mine: id === myId, at: Date.now(), historic: false }
      setMessages((current) => [...current, message].slice(-MAX_CHAT_MESSAGES))
      setSpeech((current) => ({ ...current, [id]: text }))
      clearTimeout(timers.get(id))
      timers.set(id, setTimeout(() => clearSpeech(id), SPEECH_SECONDS * 1000))
    }

    const connect = () => {
      let socket: WebSocket
      try {
        socket = new WebSocket(realtimeUrl())
      } catch {
        setStatus('offline')
        return
      }
      socketRef.current = socket

      socket.onopen = () => {
        retryMs = MIN_RETRY_MS
        socket.send(JSON.stringify({ t: 'join', ...identity.current }))
      }

      socket.onmessage = (event) => {
        let message: { t?: string; holder?: unknown; segs?: unknown[]; id?: number; total?: number; players?: unknown[]; nickname?: unknown; text?: unknown; reason?: ChatReject; from?: unknown; to?: unknown; x?: unknown; z?: unknown; knock?: unknown; color?: unknown; emote?: unknown; items?: { id?: unknown; nickname?: unknown; text?: unknown; at?: unknown }[] }
        try {
          message = JSON.parse(event.data)
        } catch {
          return
        }
        if (message.t === 'welcome' && typeof message.id === 'number') {
          myId = message.id
          setMyId(message.id)
          myIdRef.current = message.id
          setStatus('online')
        } else if (message.t === 'chat-history' && Array.isArray(message.items)) {
          // 재접속해도 겹치지 않도록 통째로 바꾼다. 끊긴 사이의 대화도 여기에 들어 있다.
          const history = message.items.flatMap((item): ChatMessage[] => {
            if (typeof item.text !== 'string' || typeof item.at !== 'number') return []
            const id = typeof item.id === 'number' ? item.id : null
            if (id !== null && muted.current.has(id)) return []
            chatKey.current += 1
            return [{ key: chatKey.current, id, nickname: typeof item.nickname === 'string' ? item.nickname : '', text: item.text, mine: id !== null && id === myId, at: item.at, historic: true }]
          })
          setMessages(history)
        } else if (message.t === 'chat' && typeof message.id === 'number' && typeof message.text === 'string') {
          receiveChat(message.id, typeof message.nickname === 'string' ? message.nickname : '', message.text)
        } else if (message.t === 'throw' && typeof message.from === 'number') {
          if (muted.current.has(message.from)) return
          chatKey.current += 1
          const paper: PaperThrow = {
            key: chatKey.current,
            from: message.from,
            nickname: typeof message.nickname === 'string' ? message.nickname : '',
            x: typeof message.x === 'number' ? message.x : 0,
            z: typeof message.z === 'number' ? message.z : 0,
          }
          setThrows((current) => [...current, paper].slice(-MAX_FLYING_PAPERS))
        } else if (message.t === 'hit' && typeof message.id === 'number') {
          if (typeof message.from === 'number' && muted.current.has(message.from)) return
          applyHit(message.id, typeof message.nickname === 'string' ? message.nickname : '', message.knock === true)
        } else if (message.t === 'brush' && typeof message.from === 'number' && typeof message.to === 'number' && typeof message.color === 'string') {
          if (muted.current.has(message.from)) return
          const now = performance.now()
          swings.current.set(message.from, { at: now, to: message.to })
          hits.current.set(message.to, now)
          const marks = paints.current.get(message.to) ?? []
          paints.current.set(message.to, [...marks, { color: message.color, at: now }].slice(-MAX_PAINT_MARKS))
          if (message.to === myId) {
            chatKey.current += 1
            setHitNotice({ text: `${typeof message.nickname === 'string' && message.nickname ? message.nickname : '누군가'}님이 붓으로 칠했어요!`, key: chatKey.current })
          }
        } else if (message.t === 'emote' && typeof message.from === 'number' && isEmote(message.emote)) {
          if (!muted.current.has(message.from)) emotes.current.set(message.from, { emote: message.emote, at: performance.now() })
        } else if (message.t === 'easel') {
          const { t: _type, ...brush } = message
          if (isEaselBrush(brush)) setEasel({ holder: brush.holder, x: brush.x, z: brush.z })
        } else if (message.t === 'easel-art' && Array.isArray(message.segs)) {
          easelSegments.current = message.segs.flatMap((segment) => sanitizeSegment(segment) ?? [])
          setEaselVersion((version) => version + 1)
        } else if (message.t === 'easel-seg') {
          // 내가 그린 선은 보낼 때 이미 넣어 두었다.
          const segment = sanitizeSegment(message)
          if (!segment || message.from === myId) return
          easelSegments.current.push(segment)
          setEaselVersion((version) => version + 1)
        } else if (message.t === 'chat-reject' && message.reason) {
          chatKey.current += 1
          setChatReject({ reason: message.reason, key: chatKey.current })
        } else if (message.t === 'roster' && Array.isArray(message.players)) {
          const next = (message.players as RemotePlayer[])
            .filter((player) => player.id !== myId)
            .map((player) => ({
              id: player.id,
              avatar: sanitizeAvatar(player.avatar),
              nickname: typeof player.nickname === 'string' ? player.nickname : '',
              doodle: player.doodle === true,
              room: String(player.room),
            }))
          const ids = new Set(next.map((player) => player.id))
          for (const id of positions.current.keys()) if (!ids.has(id)) positions.current.delete(id)
          for (const id of paints.current.keys()) if (id !== myId && !ids.has(id)) paints.current.delete(id)
          for (const id of emotes.current.keys()) if (id !== myId && !ids.has(id)) emotes.current.delete(id)
          setOthers(next)
          if (typeof message.total === 'number') setTotal(message.total)
        } else if (message.t === 'count' && typeof message.total === 'number') {
          setTotal(message.total)
        } else if (message.t === 'snapshot' && Array.isArray(message.players)) {
          for (const player of message.players as { id: number; x: number; z: number; h: number; m: boolean; s?: boolean; j?: boolean; d?: boolean }[]) {
            if (player.id === myId) continue
            positions.current.set(player.id, { x: player.x, z: player.z, heading: player.h, moving: player.m, seated: player.s === true, jumping: player.j === true, doubleJumped: player.d === true })
          }
        }
      }

      socket.onclose = (event) => {
        if (socketRef.current === socket) socketRef.current = null
        // 서버만 바뀌는 재배포에서는 화면을 그대로 두고 바로 다시 붙는다.
        if (!stopped && event.code === CLOSE_RESTART) {
          retryTimer = setTimeout(connect, Math.random() * RESTART_RETRY_MAX_MS)
          return
        }
        positions.current.clear()
        setOthers([])
        setTotal(1)
        setEasel(null)
        easelSegments.current = []
        setEaselVersion((version) => version + 1)
        if (stopped) return
        if (event.code === CLOSE_FULL) {
          setStatus('full')
          return
        }
        setStatus('offline')
        retryTimer = setTimeout(connect, retryMs)
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
      }
    }

    // StrictMode의 즉시 재실행에서 접속 도중 끊는 일이 없도록 한 틱 미룬다.
    retryTimer = setTimeout(connect, 0)

    return () => {
      stopped = true
      clearTimeout(retryTimer)
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [active, applyHit])

  useEffect(() => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ t: 'avatar', avatar, doodle, nickname }))
    }
  }, [avatar, doodle, nickname])

  useEffect(() => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'room', room }))
    // 채팅은 방 안 사람끼리의 대화라 다른 방으로 옮기면 비운다.
    setMessages([])
    setSpeech({})
    setThrows([])
    // 이젤 방에 다시 들어오면 서버가 지금 상태를 보내 준다.
    setEasel(null)
    easelSegments.current = []
    setEaselVersion((version) => version + 1)
  }, [room])

  const sendMove = useCallback(({ x, z, heading, moving, seated, jumping, doubleJumped }: MoveUpdate) => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ t: 'move', x, z, h: heading, m: moving, s: seated, j: jumping, d: doubleJumped }))
  }, [])

  const sendChat = useCallback((text: string) => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify({ t: 'chat', text }))
    return true
  }, [])

  /** 이 사람의 채팅을 내 화면에서만 가린다. */
  const muteChat = useCallback((id: number) => {
    muted.current.add(id)
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'mute', id }))
    setMessages((current) => current.filter((message) => message.id !== id))
    setThrows((current) => current.filter((paper) => paper.from !== id))
    setSpeech(({ [id]: _removed, ...rest }) => rest)
  }, [])

  const sendThrow = useCallback((spot: { x: number; z: number }) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'throw', ...spot }))
  }, [])

  const sendEmote = useCallback((emote: EmoteId) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'emote', emote }))
  }, [])

  const sendBrush = useCallback((to: number) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'brush', to }))
  }, [])

  /** 그린 선은 서버 답을 기다리지 않고 내 화면에 먼저 넣는다. 서버가 거절하면 그림 전체를 다시 보내 준다. */
  const sendEasel = useCallback((action: EaselAction) => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(action))
    if (action.t === 'easel-draw') {
      easelSegments.current.push({ c: action.c, w: action.w, p: action.p })
      setEaselVersion((version) => version + 1)
    }
  }, [])

  const finishThrow = useCallback((key: number) => {
    setThrows((current) => current.filter((candidate) => candidate.key !== key))
  }, [])

  const notify = useCallback((text: string) => {
    chatKey.current += 1
    setHitNotice({ text, key: chatKey.current })
  }, [])

  const easelArt = useMemo<EaselArt>(() => ({ segments: easelSegments, version: easelVersion }), [easelVersion])

  const holdsBrush = avatar.held === 'brush'
  const play = useMemo<PlayState>(
    () => ({ myId, throws, hits, knocks, throwRequest, holdsBrush, swings, paints, emotes, sendEmote, sendBrush, sendThrow, finishThrow, notify }),
    [myId, throws, holdsBrush, sendEmote, sendBrush, sendThrow, finishThrow, notify],
  )

  const chat = { status, messages, reject: chatReject, send: sendChat, mute: muteChat, emote: sendEmote }

  return { status, others, total, positions, sendMove, chat, speech, mySpeech: myId === null ? '' : (speech[myId] ?? ''), play, hitNotice, easel, easelArt, sendEasel, notify }
}
