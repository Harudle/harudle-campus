import { useCallback, useEffect, useState } from 'react'
import { worldApiUrl } from '../lib/worldApi'
import type { RemoveResult } from './userQuizzes'

export type RelayEpisode = {
  id: number
  /** 올라온 순서대로 매긴 화 번호 */
  number: number
  createdAt: string
  imageUrl: string
  shareUrl: string
  author: string
}

export type RegisterEpisodeResult =
  | 'ok'
  | 'bad_link'
  | 'bad_password'
  | 'duplicate'
  | 'not_found'
  | 'rate_limited'
  | 'unavailable'
  | 'failed'

const TIMEOUT_MS = 10_000
const REFRESH_MS = 30_000
const REGISTER_CODES: RegisterEpisodeResult[] = ['bad_link', 'bad_password', 'duplicate', 'not_found', 'rate_limited', 'unavailable']

export async function registerEpisode(fields: { shareUrl: string; password: string }): Promise<RegisterEpisodeResult> {
  try {
    const response = await fetch(worldApiUrl('/relay'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.ok) return 'ok'
    const data = await response.json().catch(() => null)
    return REGISTER_CODES.find((code) => code === data?.code) ?? 'failed'
  } catch {
    return 'failed'
  }
}

/** 1화부터 현재 화까지의 에피소드. 다른 사람이 올린 것도 보이도록 주기적으로 다시 받는다. */
export function useRelayEpisodes() {
  const [episodes, setEpisodes] = useState<RelayEpisode[]>([])

  const reload = useCallback(async () => {
    try {
      const response = await fetch(worldApiUrl('/relay'), { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) return
      const data = await response.json()
      setEpisodes(data.items)
    } catch {
      // 받지 못하면 첫 화를 기다리는 상태로 둔다.
    }
  }, [])

  useEffect(() => {
    reload()
    const timer = setInterval(reload, REFRESH_MS)
    return () => clearInterval(timer)
  }, [reload])

  const remove = useCallback(
    async (id: number, password: string): Promise<RemoveResult> => {
      try {
        const response = await fetch(worldApiUrl(`/relay/${id}/remove`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (response.status === 403) return 'wrong_password'
        if (response.status === 429) return 'rate_limited'
        if (!response.ok && response.status !== 404) return 'failed'
      } catch {
        return 'failed'
      }
      await reload()
      return 'ok'
    },
    [reload],
  )

  const report = useCallback(async (id: number) => {
    try {
      const response = await fetch(worldApiUrl(`/relay/${id}/report`), { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) })
      return response.ok
    } catch {
      return false
    }
  }, [])

  return { episodes, reload, remove, report }
}
