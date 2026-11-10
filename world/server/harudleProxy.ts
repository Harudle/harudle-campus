import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { createLimiter } from './cheers.ts'

const HARUDLE_ORIGIN = 'https://www.harudle.com'
const IMAGE_ORIGIN = 'https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com'
const IMAGE_PATH_PATTERN = /^\/s3-image(\/harudle\/[A-Za-z0-9._~%/-]+)$/
const SORTS = new Set(['LATEST', 'POPULAR'])
const MAX_PAGE_SIZE = 50
const MAX_CURSOR_LENGTH = 300
const MINUTE_MS = 60_000
// 하루들 API에 모든 방문자 요청이 이 서버 IP로 몰리지 않도록 잠깐 저장해 둔다. 이미지 주소가 15분짜리라 짧게 둔다.
const FEED_CACHE_MS = MINUTE_MS
const MAX_CACHED_PAGES = 200
const FEEDS_PER_MINUTE = 120
const IMAGES_PER_MINUTE = 600
const TIMEOUT_MS = 10_000

type CachedPage = { at: number; status: number; body: string }

/**
 * 하루들 CORS 설정을 바꾸지 않아도 되도록 피드 조회와 만화 이미지만 대신 받아 준다.
 * 임의의 주소로 요청이 나가지 않게 경로와 값을 고정된 범위로 제한한다.
 */
export function createHarudleProxy({ trustProxy = false }: { trustProxy?: boolean }) {
  const limit = createLimiter()
  const pages = new Map<string, CachedPage>()
  const pending = new Map<string, Promise<CachedPage>>()

  const clientKey = (request: IncomingMessage) => {
    const forwarded = trustProxy ? request.headers['x-forwarded-for'] : undefined
    const value = Array.isArray(forwarded) ? forwarded.join(',') : forwarded
    return value?.split(',').pop()?.trim() || request.socket.remoteAddress || 'unknown'
  }

  const canonicalQuery = (url: URL) => {
    const sort = url.searchParams.get('sort') ?? 'LATEST'
    const size = Number(url.searchParams.get('size') ?? 20)
    const cursor = url.searchParams.get('cursor')
    if (!SORTS.has(sort) || !Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) return null
    if (cursor && cursor.length > MAX_CURSOR_LENGTH) return null
    const query = new URLSearchParams({ sort, size: String(size) })
    if (cursor) query.set('cursor', cursor)
    return query.toString()
  }

  const loadPage = (query: string) => {
    const cached = pages.get(query)
    if (cached && Date.now() - cached.at < FEED_CACHE_MS) return Promise.resolve(cached)
    const running = pending.get(query)
    if (running) return running
    const task = fetch(`${HARUDLE_ORIGIN}/api/v1/feeds?${query}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const page: CachedPage = { at: Date.now(), status: response.status, body: await response.text() }
        if (response.ok) {
          if (pages.size >= MAX_CACHED_PAGES) pages.clear()
          pages.set(query, page)
        }
        return page
      })
      .finally(() => pending.delete(query))
    pending.set(query, task)
    return task
  }

  const sendFeed = (query: string, response: ServerResponse) => {
    loadPage(query)
      .then((page) => {
        response.writeHead(page.status === 200 ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end(page.status === 200 ? page.body : JSON.stringify({ code: 'upstream' }))
      })
      .catch(() => {
        response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end(JSON.stringify({ code: 'upstream' }))
      })
  }

  const sendImage = async (path: string, search: string, response: ServerResponse) => {
    const upstream = await fetch(`${IMAGE_ORIGIN}${path}${search}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    const type = upstream.headers.get('content-type') ?? ''
    if (!upstream.ok || !type.startsWith('image/') || !upstream.body) {
      await upstream.body?.cancel()
      response.writeHead(502).end()
      return
    }
    response.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'private, max-age=600',
      'X-Content-Type-Options': 'nosniff',
    })
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).on('error', () => response.destroy()).pipe(response)
  }

  return (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const isFeed = url.pathname === '/api/v1/feeds'
    const image = IMAGE_PATH_PATTERN.exec(url.pathname)
    if (!isFeed && !image && !url.pathname.startsWith('/s3-image') && !url.pathname.startsWith('/api/')) return false

    if (request.method !== 'GET' || (!isFeed && (!image || image[1].includes('..')))) {
      response.writeHead(404).end()
      return true
    }
    const key = clientKey(request)
    if (!limit(`${isFeed ? 'feed' : 'image'}:${key}`, isFeed ? FEEDS_PER_MINUTE : IMAGES_PER_MINUTE, MINUTE_MS)) {
      response.writeHead(429).end()
      return true
    }
    if (isFeed) {
      const query = canonicalQuery(url)
      if (query) sendFeed(query, response)
      else response.writeHead(400).end()
    } else {
      sendImage(image![1], url.search, response).catch(() => {
        if (!response.headersSent) response.writeHead(502)
        response.end()
      })
    }
    return true
  }
}
