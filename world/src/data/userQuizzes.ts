import { useCallback, useEffect, useState } from 'react'
import { worldApiUrl } from '../lib/worldApi'
import type { ArcadeRoomId } from './arcadeQuizzes'

export type UserQuiz = {
  id: number
  room: ArcadeRoomId
  hint: string
  createdAt: string
  /** 지금 로그인한 사람이 건 문제(내리기 버튼을 보인다) */
  mine: boolean
  imageUrl: string
  shareUrl: string
  author: string
  category: string
  solverCount: number
  solvers: string[]
}

export type RegisterResult =
  | { ok: true; quiz: UserQuiz }
  | { ok: false; code: 'bad_link' | 'bad_answer' | 'bad_hint' | 'login_required' | 'not_author' | 'duplicate' | 'not_found' | 'rate_limited' | 'unavailable' | 'failed' }

export type RemoveResult = 'ok' | 'wrong_password' | 'login_required' | 'not_owner' | 'rate_limited' | 'failed'

export type AnswerResult =
  | { status: 'correct'; solverCount: number; solvers: string[] }
  | { status: 'wrong' }
  | { status: 'rate_limited' | 'login_required' | 'failed' }

const TIMEOUT_MS = 10_000
const REFRESH_MS = 30_000
const REGISTER_CODES = ['bad_link', 'bad_answer', 'bad_hint', 'login_required', 'not_author', 'duplicate', 'not_found', 'rate_limited', 'unavailable'] as const

export async function registerQuiz(
  room: ArcadeRoomId,
  shareUrl: string,
  answer: string,
  hint: string,
): Promise<RegisterResult> {
  try {
    const response = await fetch(worldApiUrl('/quizzes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, shareUrl, answer, hint }),
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

  /** 로그인해야 푼다. 맞히면 하루들 닉네임이 맞힌 사람에 오른다 */
  const answer = useCallback(async (id: number, value: string): Promise<AnswerResult> => {
    try {
      const response = await fetch(worldApiUrl(`/quizzes/${id}/answer`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: value }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const data = await response.json().catch(() => null)
      if (response.status === 429) return { status: 'rate_limited' }
      if (response.status === 401) return { status: 'login_required' }
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

  /** 내가 건 문제만 내린다(서버가 로그인 쿠키로 확인한다) */
  const remove = useCallback(async (id: number): Promise<RemoveResult> => {
    try {
      const response = await fetch(worldApiUrl(`/quizzes/${id}/remove`), { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (response.status === 401) return 'login_required'
      if (response.status === 403) return 'not_owner'
      if (response.status === 429) return 'rate_limited'
      if (!response.ok && response.status !== 404) return 'failed'
    } catch {
      return 'failed'
    }
    setItems((current) => current.filter((quiz) => quiz.id !== id))
    return 'ok'
  }, [])

  const report = useCallback(async (id: number) => {
    try {
      const response = await fetch(worldApiUrl(`/quizzes/${id}/report`), { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) })
      return response.ok
    } catch {
      return false
    }
  }, [])

  return { items, reload, answer, remove, report }
}

export type UserQuizBoard = ReturnType<typeof useUserQuizzes>
