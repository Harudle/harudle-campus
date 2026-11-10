import { useEffect, useState } from 'react'

export type PopularFeed = {
  imageUrl: string
  shareUrl: string
  nickname: string
  profileImageUrl: string | null
  category: string
  likeCount: number
  commentCount: number
  publishedAt: string
  /** false면 전날 글이 없어 그 이전 날짜의 1위를 보여 주는 경우다. */
  isYesterday: boolean
}

export type PopularFeedState =
  | { status: 'loading' }
  | { status: 'ready'; feed: PopularFeed }
  | { status: 'failed' }

type FeedItem = {
  imageUrl?: string
  shareUrl?: string
  publishedAt: string
  likeCount?: number
  commentCount?: number
  author?: { nickname?: string; profileImageUrl?: string | null }
  category?: { name?: string }
}

const TIMEOUT_MS = 5000
const PAGE_SIZE = 50
const MAX_PAGES = 5
const DAY_MS = 24 * 60 * 60 * 1000

// 배포 환경은 하루들 API를 직접 호출하므로 백엔드 CORS에 이 사이트의 도메인이 허용되어 있어야 한다.

const kstDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })

function dayOf(date: string | number) {
  return kstDay.format(new Date(date))
}

function byPopularity(a: FeedItem, b: FeedItem) {
  return (
    (b.likeCount ?? 0) - (a.likeCount ?? 0) ||
    (b.commentCount ?? 0) - (a.commentCount ?? 0) ||
    Date.parse(a.publishedAt) - Date.parse(b.publishedAt)
  )
}

function isUsable(item: FeedItem) {
  return Boolean(item.imageUrl) && Boolean(item.shareUrl?.startsWith('https://'))
}

/** 오늘을 뺀 가장 최근 날짜(보통 어제)의 글이 모두 모일 때까지 최신순으로 내려받는다. */
async function fetchRecentDayItems(today: string, signal: AbortSignal) {
  const items: FeedItem[] = []
  let cursor: string | null = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ sort: 'LATEST', size: String(PAGE_SIZE) })
    if (cursor) query.set('cursor', cursor)

    const response = await fetch(`/api/v1/feeds?${query}`, {
      signal,
      credentials: 'omit',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`feeds ${response.status}`)

    const data = await response.json()
    items.push(...(data.items as FeedItem[]))

    const targetDay = items.map((item) => dayOf(item.publishedAt)).find((day) => day < today)
    const oldest = items.at(-1)
    const dayComplete = targetDay && oldest && dayOf(oldest.publishedAt) < targetDay
    if (dayComplete || !data.hasNext) break
    cursor = data.nextCursor
  }

  const targetDay = items.map((item) => dayOf(item.publishedAt)).find((day) => day < today)
  return { targetDay, items: items.filter((item) => dayOf(item.publishedAt) === targetDay) }
}

async function fetchDailyTopFeed(signal: AbortSignal): Promise<PopularFeed | null> {
  const now = Date.now()
  const { targetDay, items } = await fetchRecentDayItems(dayOf(now), signal)
  const top = items.filter(isUsable).sort(byPopularity)[0]
  if (!top) return null

  return {
    imageUrl: top.imageUrl!,
    shareUrl: top.shareUrl!,
    nickname: top.author?.nickname ?? '우리끼리 작가',
    profileImageUrl: top.author?.profileImageUrl ?? null,
    category: top.category?.name ?? '우리끼리',
    likeCount: top.likeCount ?? 0,
    commentCount: top.commentCount ?? 0,
    publishedAt: top.publishedAt,
    isYesterday: targetDay === dayOf(now - DAY_MS),
  }
}

/** 이미지 URL이 15분이면 만료되므로 저장하지 않고 모달을 열 때마다 새로 받는다. */
export function usePopularFeed(active: boolean) {
  const [state, setState] = useState<PopularFeedState>({ status: 'loading' })

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    setState({ status: 'loading' })
    fetchDailyTopFeed(controller.signal)
      .then((feed) => {
        if (!cancelled) setState(feed ? { status: 'ready', feed } : { status: 'failed' })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'failed' })
      })
      .finally(() => clearTimeout(timeout))

    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [active])

  return state
}
