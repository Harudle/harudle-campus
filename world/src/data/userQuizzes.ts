import { useCallback, useEffect, useState } from 'react'
import { worldApiUrl } from '../lib/worldApi'
import type { ArcadeRoomId } from './arcadeQuizzes'

export type UserQuiz = {
  id: number
  room: ArcadeRoomId
  hint: string
  createdAt: string
  /** 비밀번호 도입 전에 등록한 문제는 false다. */
  hasPassword: boolean
  imageUrl: string
  shareUrl: string
  author: string
  category: string
  solverCount: number
  solvers: string[]
}

export type RegisterResult =
  | { ok: true; quiz: UserQuiz }
  | { ok: false; code: 'bad_link' | 'bad_answer' | 'bad_hint' | 'bad_password' | 'duplicate' | 'not_found' | 'rate_limited' | 'unavailable' | 'failed' }

export type RemoveResult = 'ok' | 'wrong_password' | 'rate_limited' | 'failed'

export type AnswerResult =
  | { status: 'correct'; solverCount: number; solvers: string[] }
  | { status: 'wrong' }
  | { status: 'rate_limited' | 'bad_nickname' | 'failed' }

const TIMEOUT_MS = 10_000
const REFRESH_MS = 30_000
// 비밀번호 도입 전에 등록한 문제를 내릴 때만 쓴다.
const TOKENS_KEY = 'harudle-world.quiz-tokens'
const REGISTER_CODES = ['bad_link', 'bad_answer', 'bad_hint', 'bad_password', 'duplicate', 'not_found', 'rate_limited', 'unavailable'] as const

function loadTokens(): Record<string, string> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TOKENS_KEY) ?? '{}')
    return stored && typeof stored === 'object' ? stored : {}
  } catch {
    return {}
  }
}

export async function registerQuiz(
  room: ArcadeRoomId,
  shareUrl: string,
  answer: string,
  hint: string,
  password: string,
): Promise<RegisterResult> {
  try {
    const response = await fetch(worldApiUrl('/quizzes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, shareUrl, answer, hint, password }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const known = REGISTER_CODES.find((code) => code === data?.code)
      return { ok: false, code: known ?? 'failed' }
    }
    return { ok: true, quiz: data.quiz }
  } catch {
    return { ok: false, code: 'failed' }
  }
}

/** 지금 방의 사용자 문제. 다른 사람이 맞히거나 등록한 것도 보이도록 주기적으로 다시 받는다. */
export function useUserQuizzes(room: ArcadeRoomId | null) {
  const [items, setItems] = useState<UserQuiz[]>([])
  const [tokens, setTokens] = useState(loadTokens)

  const reload = useCallback(async () => {
    if (!room) return
    try {
      const response = await fetch(`${worldApiUrl('/quizzes')}?room=${room}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) return
      const data = await response.json()
      setItems(data.items)
      setTokens(loadTokens())
    } catch {
      // 받지 못하면 기본 문제만 있는 방으로 둔다.
    }
  }, [room])

  useEffect(() => {
    setItems([])
    if (!room) return
    reload()
    const timer = setInterval(reload, REFRESH_MS)
    return () => clearInterval(timer)
  }, [reload, room])

  const answer = useCallback(async (id: number, value: string, nickname: string): Promise<AnswerResult> => {
    try {
      const response = await fetch(worldApiUrl(`/quizzes/${id}/answer`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: value, nickname }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const data = await response.json().catch(() => null)
      if (response.status === 429) return { status: 'rate_limited' }
      if (data?.code === 'bad_nickname') return { status: 'bad_nickname' }
      if (!response.ok) return { status: 'failed' }
      if (!data.correct) return { status: 'wrong' }
      setItems((current) =>
        current.map((quiz) => (quiz.id === id ? { ...quiz, solverCount: data.solverCount, solvers: data.solvers } : quiz)),
      )
      return { status: 'correct', solverCount: data.solverCount, solvers: data.solvers }
    } catch {
      return { status: 'failed' }
    }
  }, [])

  /** 비밀번호를 확인해 문제를 내린다. 비밀번호가 없는 이전 문제는 등록한 브라우저의 토큰을 쓴다. */
  const remove = useCallback(
    async (id: number, password: string): Promise<RemoveResult> => {
      try {
        const response = await fetch(worldApiUrl(`/quizzes/${id}/remove`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, token: tokens[id] }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (response.status === 403) return 'wrong_password'
        if (response.status === 429) return 'rate_limited'
        if (!response.ok && response.status !== 404) return 'failed'
      } catch {
        return 'failed'
      }
      setItems((current) => current.filter((quiz) => quiz.id !== id))
      return 'ok'
    },
    [tokens],
  )

  const report = useCallback(async (id: number) => {
    try {
      const response = await fetch(worldApiUrl(`/quizzes/${id}/report`), { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) })
      return response.ok
    } catch {
      return false
    }
  }, [])

  const hasLegacyToken = useCallback((id: number) => Boolean(tokens[id]), [tokens])

  return { items, reload, answer, remove, report, hasLegacyToken }
}

export type UserQuizBoard = ReturnType<typeof useUserQuizzes>
