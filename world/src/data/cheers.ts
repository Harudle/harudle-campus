import { useCallback, useEffect, useRef, useState } from 'react'
import { worldApiUrl } from '../lib/worldApi'

export const MAX_CHEER_LENGTH = 200
export const MAX_CHEER_NICKNAME_LENGTH = 12

export type Cheer = { id: number; nickname: string; message: string; createdAt: string }
export type CheerStatus = 'loading' | 'ready' | 'failed'
export type CheerPostResult = 'ok' | 'rate_limited' | 'link' | 'invalid' | 'failed'

const TIMEOUT_MS = 8000
const TOKENS_KEY = 'harudle-world.cheer-tokens'
const MAX_SAVED_TOKENS = 100

function cheersUrl(path = '') {
  return worldApiUrl(`/cheers${path}`)
}

function loadTokens(): Record<string, string> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TOKENS_KEY) ?? '{}')
    return stored && typeof stored === 'object' ? stored : {}
  } catch {
    return {}
  }
}

function saveTokens(tokens: Record<string, string>) {
  try {
    const recent = Object.entries(tokens).slice(-MAX_SAVED_TOKENS)
    window.localStorage.setItem(TOKENS_KEY, JSON.stringify(Object.fromEntries(recent)))
  } catch {
    // 저장할 수 없으면 이번 방문 동안에만 내 글을 지울 수 있다.
  }
}

/** 지금 들어와 있는 작가의 방명록. 방을 옮기면 진행 중인 요청을 버리고 새로 받는다. */
export function useCheers(authorId: string | null) {
  const [items, setItems] = useState<Cheer[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [status, setStatus] = useState<CheerStatus>('loading')
  const [tokens, setTokens] = useState(loadTokens)
  const controllerRef = useRef<AbortController | null>(null)

  const fetchPage = useCallback(
    async (before: number | null) => {
      if (!authorId) return
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      const query = new URLSearchParams({ author: authorId })
      if (before !== null) query.set('before', String(before))
      try {
        const response = await fetch(`${cheersUrl()}?${query}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(TIMEOUT_MS)]),
          cache: 'no-store',
        })
        if (!response.ok) throw new Error(`cheers ${response.status}`)
        const data = await response.json()
        if (controllerRef.current !== controller) return
        setItems((current) => (before === null ? data.items : [...current, ...data.items]))
        setTotal(data.total)
        setHasMore(data.hasMore)
        setStatus('ready')
      } catch {
        if (controllerRef.current === controller) setStatus('failed')
      }
    },
    [authorId],
  )

  const reload = useCallback(() => {
    setStatus((current) => (current === 'ready' ? current : 'loading'))
    return fetchPage(null)
  }, [fetchPage])

  useEffect(() => {
    setItems([])
    setTotal(0)
    setHasMore(false)
    setStatus('loading')
    fetchPage(null)
    return () => controllerRef.current?.abort()
  }, [fetchPage])

  const loadMore = useCallback(() => {
    const last = items[items.length - 1]
    if (last) fetchPage(last.id)
  }, [fetchPage, items])

  const post = useCallback(
    async (nickname: string, message: string): Promise<CheerPostResult> => {
      try {
        const response = await fetch(cheersUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ author: authorId, nickname, message }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          return data?.code === 'rate_limited' || data?.code === 'link' || data?.code === 'invalid' ? data.code : 'failed'
        }
        setTokens((current) => {
          const next = { ...current, [data.cheer.id]: data.deleteToken }
          saveTokens(next)
          return next
        })
        setItems((current) => [data.cheer, ...current])
        setTotal((current) => current + 1)
        return 'ok'
      } catch {
        return 'failed'
      }
    },
    [authorId],
  )

  const remove = useCallback(
    async (id: number) => {
      const token = tokens[id]
      if (!token) return false
      try {
        const response = await fetch(cheersUrl(`/${id}`), {
          method: 'DELETE',
          headers: { 'X-Cheer-Token': token },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (!response.ok && response.status !== 404) return false
      } catch {
        return false
      }
      setItems((current) => current.filter((cheer) => cheer.id !== id))
      setTotal((current) => Math.max(current - 1, 0))
      return true
    },
    [tokens],
  )

  const report = useCallback(async (id: number) => {
    try {
      const response = await fetch(cheersUrl(`/${id}/report`), { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) })
      return response.ok
    } catch {
      return false
    }
  }, [])

  const isMine = useCallback((id: number) => Boolean(tokens[id]), [tokens])

  return { items, total, hasMore, status, reload, loadMore, post, remove, report, isMine }
}

export type CheerBoard = ReturnType<typeof useCheers>
