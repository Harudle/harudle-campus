import { useCallback, useEffect, useRef, useState } from 'react'

export type GalleryWork = {
  id: string
  authorId: string
  imageUrl: string
  imageUrlExpiresAt: string
  shareUrl: string
  nickname: string
  profileImageUrl: string | null
  category: string
  likeCount: number
  commentCount: number
  publishedAt: string
}

export type GalleryStatus = 'loading' | 'ready' | 'failed'

type FeedItem = {
  id?: string
  imageUrl?: string
  imageUrlExpiresAt?: string
  shareUrl?: string
  publishedAt: string
  likeCount?: number
  commentCount?: number
  author?: { id?: string; nickname?: string; profileImageUrl?: string | null }
  category?: { name?: string }
}

/** 한 작가의 전시실. works는 좋아요가 많은 대표작이고, 나머지 값은 받아온 피드 전체 기준이다. */
export type ArtistZone = {
  authorId: string
  nickname: string
  totalWorks: number
  totalLikes: number
  works: GalleryWork[]
}

export type GalleryExhibition = {
  /** 메인 전시실에 거는 인기순 작품. 첫 작품이 좋아요 1위다. */
  mainWorks: GalleryWork[]
  zones: ArtistZone[]
}

const EMPTY_EXHIBITION: GalleryExhibition = { mainWorks: [], zones: [] }
const TIMEOUT_MS = 8000
const PAGE_SIZE = 50
const MAX_PAGES = 6

function toWork(item: FeedItem): GalleryWork {
  return {
    id: item.id!,
    authorId: item.author?.id ?? item.id!,
    imageUrl: item.imageUrl!,
    imageUrlExpiresAt: item.imageUrlExpiresAt ?? '',
    shareUrl: item.shareUrl!,
    nickname: item.author?.nickname ?? '우리끼리 작가',
    profileImageUrl: item.author?.profileImageUrl ?? null,
    category: item.category?.name ?? '우리끼리',
    likeCount: item.likeCount ?? 0,
    commentCount: item.commentCount ?? 0,
    publishedAt: item.publishedAt,
  }
}

/** 작가별 묶음은 API에 없어서 인기순 피드를 페이지 단위로 받아 직접 묶는다. */
async function fetchWorks(signal: AbortSignal): Promise<GalleryWork[]> {
  const works: GalleryWork[] = []
  let cursor: string | null = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ sort: 'POPULAR', size: String(PAGE_SIZE) })
    if (cursor) query.set('cursor', cursor)

    const response = await fetch(`/api/v1/feeds?${query}`, {
      signal,
      credentials: 'omit',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`feeds ${response.status}`)

    const data = await response.json()
    const items = data.items as FeedItem[]
    works.push(...items.filter((item) => item.id && item.imageUrl && item.shareUrl?.startsWith('https://')).map(toWork))
    if (!data.hasNext) break
    cursor = data.nextCursor
  }

  return works
}

/** 메인은 인기순 그대로 걸고, 받은 좋아요 합이 큰 작가에게 전시실을 하나씩 준다. */
export function buildExhibition(
  works: GalleryWork[],
  mainWorkCount: number,
  zoneCount: number,
  worksPerZone: number,
): GalleryExhibition {
  const byAuthor = new Map<string, GalleryWork[]>()
  for (const work of works) {
    byAuthor.set(work.authorId, [...(byAuthor.get(work.authorId) ?? []), work])
  }

  const zones = [...byAuthor.entries()]
    .map(([authorId, authorWorks]) => ({
      authorId,
      nickname: authorWorks[0].nickname,
      totalWorks: authorWorks.length,
      totalLikes: authorWorks.reduce((sum, work) => sum + work.likeCount, 0),
      works: authorWorks.slice(0, worksPerZone),
    }))
    .sort((a, b) => b.totalLikes - a.totalLikes || b.totalWorks - a.totalWorks)
    .slice(0, zoneCount)

  return { mainWorks: works.slice(0, mainWorkCount), zones }
}

export function isImageUrlExpired(work: GalleryWork) {
  return Date.parse(work.imageUrlExpiresAt) < Date.now() + 30_000
}

/** 이미지 URL이 15분이면 만료되어 refresh로 전시 전체를 다시 받을 수 있게 한다. */
export function useExhibition(mainWorkCount: number, zoneCount: number, worksPerZone: number) {
  const [exhibition, setExhibition] = useState<GalleryExhibition>(EMPTY_EXHIBITION)
  const [status, setStatus] = useState<GalleryStatus>('loading')
  const controllerRef = useRef<AbortController | null>(null)

  const refresh = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    setStatus((current) => (current === 'ready' ? current : 'loading'))
    fetchWorks(controller.signal)
      .then((works) => {
        if (controllerRef.current !== controller) return
        setExhibition(buildExhibition(works, mainWorkCount, zoneCount, worksPerZone))
        setStatus('ready')
      })
      .catch(() => {
        if (controllerRef.current !== controller) return
        setStatus((current) => (current === 'ready' ? current : 'failed'))
      })
      .finally(() => clearTimeout(timeout))
  }, [mainWorkCount, zoneCount, worksPerZone])

  useEffect(() => {
    refresh()
    return () => {
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [refresh])

  return { exhibition, status, refresh }
}
