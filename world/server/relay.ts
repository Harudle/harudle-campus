import { mkdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createLimiter, readBody } from './cheers.ts'
import { createFeedFetcher, parseFeedId, type FeedInfo } from './feedPosts.ts'

const LIST_SIZE = 100
const HIDE_AT_REPORTS = 3
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const REGISTERS_PER_WINDOW = 10
const REGISTER_WINDOW_MS = 10 * MINUTE_MS
const REGISTERS_PER_HOUR_TOTAL = 200
const REPORTS_PER_HOUR = 20
const REMOVE_TRIES_PER_WINDOW = 5
const REMOVE_WINDOW_MS = 10 * MINUTE_MS

export type RelayOptions = {
  databasePath: string
  isOriginAllowed: (origin: string | undefined) => boolean
  trustProxy?: boolean
  harudleBaseUrl?: string
  /** 요청의 하루들 로그인 사용자. 올리기·내리기는 로그인한 작가 본인만 한다 */
  userOf?: (request: IncomingMessage) => Promise<{ id: string } | null>
}

type EpisodeRow = { id: number; feed_id: string; created_at: string; owner_id: string | null }

/**
 * 릴레이 만화 에피소드. 하루들 피드 글을 공유 링크로 받아 올라온 순서대로 이어 붙인다.
 * 하루들에 로그인한 작가가 자기 글만 올리고, 올린 사람(예전 비밀번호 화는 그 글의 작가)만 내린다. 신고가 쌓이면 가린다.
 */
export function createRelayHandler({ databasePath, isOriginAllowed, trustProxy = false, harudleBaseUrl, userOf = async () => null }: RelayOptions) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS relay_episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      password_hash BLOB NOT NULL,
      password_salt BLOB NOT NULL,
      reports INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0
    );
  `)
  // 제목과 결말은 만화 안에 있으므로 따로 받지 않는다. 이전에 만든 표에서는 칸을 없앤다.
  const columns = database.prepare('PRAGMA table_info(relay_episodes)').all() as { name: string }[]
  for (const name of ['title', 'ending']) {
    if (columns.some((column) => column.name === name)) database.exec(`ALTER TABLE relay_episodes DROP COLUMN ${name}`)
  }
  // 올린 사람(하루들 계정 ID). 비밀번호로 올리던 예전 화는 비어 있고, 그 글의 작가가 주인이다
  if (!columns.some((column) => column.name === 'owner_id')) database.exec('ALTER TABLE relay_episodes ADD COLUMN owner_id TEXT')
  const list = database.prepare('SELECT id, feed_id, created_at, owner_id FROM relay_episodes WHERE hidden = 0 ORDER BY id LIMIT ?')
  const findFeed = database.prepare('SELECT id FROM relay_episodes WHERE feed_id = ?')
  const findOwner = database.prepare('SELECT feed_id, owner_id FROM relay_episodes WHERE id = ?')
  // 비밀번호 칸은 예전 표와 맞추려고 남겨 두고 빈 값을 넣는다
  const insert = database.prepare(
    "INSERT INTO relay_episodes (feed_id, created_at, password_hash, password_salt, owner_id) VALUES (?, ?, x'', x'', ?)",
  )
  const remove = database.prepare('DELETE FROM relay_episodes WHERE id = ?')
  const addReport = database.prepare(
    `UPDATE relay_episodes SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ${HIDE_AT_REPORTS} THEN 1 ELSE hidden END WHERE id = ?`,
  )

  const limit = createLimiter()
  const reportedBy = new Set<string>()
  // 올리기 제한은 실제로 올라간 화만 센다. 링크를 잘못 넣어 실패한 시도까지 세면, 한 사람이 몇 번 고쳐 넣다가 다음 화를 못 올린다
  const registered = new Map<string, number[]>()
  const recentRegisters = (key: string, windowMs: number) => {
    const now = Date.now()
    const times = (registered.get(key) ?? []).filter((at) => now - at < windowMs)
    if (times.length) registered.set(key, times)
    else registered.delete(key)
    return times.length
  }
  const noteRegister = (key: string) => registered.set(key, [...(registered.get(key) ?? []), Date.now()])
  const fetchFeed = createFeedFetcher(harudleBaseUrl)

  const clientKey = (request: IncomingMessage) => {
    const forwarded = trustProxy ? request.headers['x-forwarded-for'] : undefined
    const value = Array.isArray(forwarded) ? forwarded.join(',') : forwarded
    return value?.split(',').pop()?.trim() || request.socket.remoteAddress || 'unknown'
  }

  const ownedBy = (row: { owner_id: string | null }, feed: FeedInfo | null, userId: string | undefined) =>
    Boolean(userId) && (row.owner_id ? row.owner_id === userId : feed?.authorId === userId)
  const toEpisode = (row: EpisodeRow, feed: FeedInfo, number: number, userId: string | undefined) => ({
    id: row.id,
    number,
    createdAt: row.created_at,
    imageUrl: feed.imageUrl,
    shareUrl: feed.shareUrl,
    author: feed.author,
    /** 지금 로그인한 사람이 올린 화면 true(내리기 버튼을 보인다) */
    mine: ownedBy(row, feed, userId),
  })

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const match = /^\/relay(?:\/(\d{1,15})\/(report|remove))?$/.exec(url.pathname)
    if (!match) return false

    const origin = request.headers.origin
    const originAllowed = isOriginAllowed(origin)
    const respond = (status: number, body?: unknown) => {
      response.writeHead(status, {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Origin',
        ...(originAllowed && origin ? { 'Access-Control-Allow-Origin': origin } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      })
      response.end(body === undefined ? undefined : JSON.stringify(body))
    }
    const fail = () => {
      if (!response.headersSent) respond(500, { code: 'failed' })
    }
    const readJson = async (): Promise<Record<string, unknown> | null> => {
      if (!request.headers['content-type']?.startsWith('application/json')) return null
      const raw = await readBody(request)
      if (raw === null) {
        response.setHeader('Connection', 'close')
        return null
      }
      try {
        const body = JSON.parse(raw)
        return typeof body === 'object' && body !== null ? body : null
      } catch {
        return null
      }
    }

    const id = match[1] ? Number(match[1]) : null
    const action = match[2]

    if (request.method === 'OPTIONS') {
      if (originAllowed) {
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST')
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        response.setHeader('Access-Control-Max-Age', '600')
      }
      respond(204)
      return true
    }

    if (request.method === 'GET' && id === null) {
      const rows = list.all(LIST_SIZE) as EpisodeRow[]
      Promise.all([userOf(request).catch(() => null), Promise.all(rows.map(async (row) => ({ row, result: await fetchFeed(row.feed_id) })))])
        .then(([user, results]) => {
          // 하루들에서 지워졌거나 지금 이미지를 받을 수 없는 글은 빼고 번호를 매긴다.
          const visible = results.flatMap(({ row, result }) => (result.status === 'ok' ? [{ row, feed: result.feed }] : []))
          respond(200, { items: visible.map(({ row, feed }, index) => toEpisode(row, feed, index + 1, user?.id)) })
        })
        .catch(fail)
      return true
    }

    // 쓰기는 전시관 페이지에서 온 요청만 받는다.
    if (!originAllowed) {
      respond(403, { code: 'forbidden' })
      return true
    }

    const register = async () => {
      const body = await readJson()
      if (!body) return respond(400, { code: 'invalid' })
      const user = await userOf(request)
      if (!user) return respond(401, { code: 'login_required' })
      const feedId = parseFeedId(body.shareUrl)
      if (!feedId) return respond(400, { code: 'bad_link' })
      if (findFeed.get(feedId)) return respond(409, { code: 'duplicate' })
      const key = user.id
      if (recentRegisters(key, REGISTER_WINDOW_MS) >= REGISTERS_PER_WINDOW || recentRegisters('all', HOUR_MS) >= REGISTERS_PER_HOUR_TOTAL) {
        return respond(429, { code: 'rate_limited' })
      }

      const result = await fetchFeed(feedId)
      if (result.status === 'missing') return respond(404, { code: 'not_found' })
      if (result.status === 'unavailable') return respond(503, { code: 'unavailable' })
      // 내가 그린 만화만 올린다: 하루들 글의 작가와 로그인한 사람이 같아야 한다
      if (result.feed.authorId !== user.id) return respond(403, { code: 'not_author' })
      // 기다리는 사이 같은 글이 먼저 올라왔을 수 있다.
      if (findFeed.get(feedId)) return respond(409, { code: 'duplicate' })
      insert.run(feedId, new Date().toISOString(), user.id)
      noteRegister(key)
      noteRegister('all')
      respond(201, { ok: true })
    }

    const removeMine = async (episodeId: number) => {
      const user = await userOf(request)
      if (!user) return respond(401, { code: 'login_required' })
      if (!limit(`remove:${user.id}:${episodeId}`, REMOVE_TRIES_PER_WINDOW, REMOVE_WINDOW_MS)) {
        return respond(429, { code: 'rate_limited' })
      }
      const row = findOwner.get(episodeId) as { feed_id: string; owner_id: string | null } | undefined
      if (!row) return respond(404, { code: 'not_found' })
      const feed = row.owner_id ? null : await fetchFeed(row.feed_id)
      if (!ownedBy(row, feed?.status === 'ok' ? feed.feed : null, user.id)) return respond(403, { code: 'not_owner' })
      remove.run(episodeId)
      respond(204)
    }

    const report = (episodeId: number) => {
      const key = clientKey(request)
      if (!limit(`report:${key}`, REPORTS_PER_HOUR, HOUR_MS)) return respond(429, { code: 'rate_limited' })
      const reportKey = `${key}:${episodeId}`
      // 같은 사람의 반복 신고로 글이 가려지지 않게 한 번만 센다.
      if (!reportedBy.has(reportKey)) {
        reportedBy.add(reportKey)
        addReport.run(episodeId)
      }
      respond(204)
    }

    try {
      if (request.method === 'POST' && id === null) register().catch(fail)
      else if (request.method === 'POST' && id !== null && action === 'remove') removeMine(id).catch(fail)
      else if (request.method === 'POST' && id !== null && action === 'report') report(id)
      else respond(405, { code: 'invalid' })
    } catch {
      fail()
    }
    return true
  }

  return { handle, close: () => database.close() }
}
