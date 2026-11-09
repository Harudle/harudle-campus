import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { charLength } from './cheers.ts'

const SHARE_HOSTS = new Set(['harudle.com', 'www.harudle.com'])
const SHARE_PATH_PATTERN = /^\/feeds\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i
const MIN_PASSWORD_LENGTH = 4
export const MAX_PASSWORD_LENGTH = 64
const PASSWORD_KEY_BYTES = 32
// 이미지 주소는 15분이면 만료되므로 그 전에 새로 받는다.
const FEED_CACHE_MS = 10 * 60_000
const FEED_MISSING_CACHE_MS = 60_000
const FEED_TIMEOUT_MS = 5000

export type FeedInfo = { imageUrl: string; shareUrl: string; author: string; category: string }
export type FeedResult = { status: 'ok'; feed: FeedInfo } | { status: 'missing' } | { status: 'unavailable' }

/**
 * 공유 링크에서 글 ID만 꺼낸다. 공유 버튼이 붙이는 ?utm_source 같은 값은 무시한다.
 * 정해진 주소의 글 ID만 쓰므로 사용자가 넣은 주소로 요청이 나가지 않는다.
 */
export function parseFeedId(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || !SHARE_HOSTS.has(url.hostname)) return null
    return SHARE_PATH_PATTERN.exec(url.pathname)?.[1]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

/** 하루들 공개 API로 피드 글을 확인한다. 만료 전까지는 받아 둔 값을 쓴다. */
export function createFeedFetcher(harudleBaseUrl = 'https://www.harudle.com') {
  const cache = new Map<string, { at: number; result: FeedResult }>()

  return async function fetchFeed(feedId: string): Promise<FeedResult> {
    const cached = cache.get(feedId)
    const age = cached ? Date.now() - cached.at : Infinity
    if (cached?.result.status === 'ok' && age < FEED_CACHE_MS) return cached.result
    if (cached?.result.status === 'missing' && age < FEED_MISSING_CACHE_MS) return cached.result
    try {
      const response = await fetch(`${harudleBaseUrl}/api/v1/feeds/${feedId}`, {
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      })
      if (response.status === 404 || response.status === 410) {
        const result: FeedResult = { status: 'missing' }
        cache.set(feedId, { at: Date.now(), result })
        return result
      }
      if (!response.ok) throw new Error(`feed ${response.status}`)
      const data = await response.json()
      if (typeof data?.imageUrl !== 'string' || !data.imageUrl.startsWith('https://')) return { status: 'missing' }
      const result: FeedResult = {
        status: 'ok',
        feed: {
          imageUrl: data.imageUrl,
          shareUrl: `${harudleBaseUrl}/feeds/${feedId}`,
          author: typeof data.author?.nickname === 'string' ? data.author.nickname : '우리끼리 작가',
          category: typeof data.category?.name === 'string' ? data.category.name : '우리끼리',
        },
      }
      cache.set(feedId, { at: Date.now(), result })
      return result
    } catch {
      // 하루들에 닿지 못하면 조금 지난 주소라도 그대로 쓴다.
      return cached?.result.status === 'ok' ? cached.result : { status: 'unavailable' }
    }
  }
}

const deriveKey = promisify(scrypt) as (password: string, salt: Uint8Array, length: number) => Promise<Buffer>

export function isValidPassword(value: unknown): value is string {
  return typeof value === 'string' && charLength(value) >= MIN_PASSWORD_LENGTH && charLength(value) <= MAX_PASSWORD_LENGTH
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  return { salt, hash: await deriveKey(password, salt, PASSWORD_KEY_BYTES) }
}

export async function verifyPassword(value: unknown, salt: Uint8Array, hash: Uint8Array) {
  if (typeof value !== 'string' || charLength(value) > MAX_PASSWORD_LENGTH) return false
  return timingSafeEqual(await deriveKey(value, salt, PASSWORD_KEY_BYTES), hash)
}
