import { mkdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createLimiter, readBody } from './cheers.ts'
import { createFeedFetcher, hashPassword, isValidPassword, parseFeedId, verifyPassword, type FeedInfo } from './feedPosts.ts'

const LIST_SIZE = 100
const HIDE_AT_REPORTS = 3
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const REGISTERS_PER_WINDOW = 5
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
}

type EpisodeRow = { id: number; feed_id: string; created_at: string }

/**
 * 릴레이 만화 에피소드. 하루들 피드 글을 공유 링크로 받아 올라온 순서대로 이어 붙인다.
 * 로그인이 없어서 올릴 때 정한 비밀번호로만 내릴 수 있고, 신고가 쌓이면 가린다.
 */
export function createRelayHandler({ databasePath, isOriginAllowed, trustProxy = false, harudleBaseUrl }: RelayOptions) {
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
  const list = database.prepare('SELECT id, feed_id, created_at FROM relay_episodes WHERE hidden = 0 ORDER BY id LIMIT ?')
  const findFeed = database.prepare('SELECT id FROM relay_episodes WHERE feed_id = ?')
  const findCredentials = database.prepare('SELECT password_hash, password_salt FROM relay_episodes WHERE id = ?')
  const insert = database.prepare(
    'INSERT INTO relay_episodes (feed_id, created_at, password_hash, password_salt) VALUES (?, ?, ?, ?)',
  )
  const remove = database.prepare('DELETE FROM relay_episodes WHERE id = ?')
  const addReport = database.prepare(
    `UPDATE relay_episodes SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ${HIDE_AT_REPORTS} THEN 1 ELSE hidden END WHERE id = ?`,
  )

  const limit = createLimiter()
  const reportedBy = new Set<string>()
  const fetchFeed = createFeedFetcher(harudleBaseUrl)

  const clientKey = (request: IncomingMessage) => {
    const forwarded = trustProxy ? request.headers['x-forwarded-for'] : undefined
    const value = Array.isArray(forwarded) ? forwarded.join(',') : forwarded
    return value?.split(',').pop()?.trim() || request.socket.remoteAddress || 'unknown'
  }

  const toEpisode = (row: EpisodeRow, feed: FeedInfo, number: number) => ({
    id: row.id,
    number,
    createdAt: row.created_at,
    imageUrl: feed.imageUrl,
    shareUrl: feed.shareUrl,
    author: feed.author,
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
      Promise.all(rows.map(async (row) => ({ row, result: await fetchFeed(row.feed_id) })))
        .then((results) => {
          // 하루들에서 지워졌거나 지금 이미지를 받을 수 없는 글은 빼고 번호를 매긴다.
          const visible = results.flatMap(({ row, result }) => (result.status === 'ok' ? [{ row, feed: result.feed }] : []))
          respond(200, { items: visible.map(({ row, feed }, index) => toEpisode(row, feed, index + 1)) })
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
      const feedId = parseFeedId(body.shareUrl)
      if (!feedId) return respond(400, { code: 'bad_link' })
      if (!isValidPassword(body.password)) return respond(400, { code: 'bad_password' })
      if (findFeed.get(feedId)) return respond(409, { code: 'duplicate' })
      if (
        !limit(`register:${clientKey(request)}`, REGISTERS_PER_WINDOW, REGISTER_WINDOW_MS) ||
        !limit('register:all', REGISTERS_PER_HOUR_TOTAL, HOUR_MS)
      ) {
        return respond(429, { code: 'rate_limited' })
      }

      const result = await fetchFeed(feedId)
      if (result.status === 'missing') return respond(404, { code: 'not_found' })
      if (result.status === 'unavailable') return respond(503, { code: 'unavailable' })
      const { hash, salt } = await hashPassword(body.password)
      // 기다리는 사이 같은 글이 먼저 올라왔을 수 있다.
      if (findFeed.get(feedId)) return respond(409, { code: 'duplicate' })
      insert.run(feedId, new Date().toISOString(), hash, salt)
      respond(201, { ok: true })
    }

    const removeWithPassword = async (episodeId: number) => {
      const body = await readJson()
      if (!body) return respond(400, { code: 'invalid' })
      if (!limit(`remove:${clientKey(request)}:${episodeId}`, REMOVE_TRIES_PER_WINDOW, REMOVE_WINDOW_MS)) {
        return respond(429, { code: 'rate_limited' })
      }
      const row = findCredentials.get(episodeId) as { password_hash: Uint8Array; password_salt: Uint8Array } | undefined
      if (!row) return respond(404, { code: 'not_found' })
      if (!(await verifyPassword(body.password, row.password_salt, row.password_hash))) return respond(403, { code: 'wrong_password' })
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
      else if (request.method === 'POST' && id !== null && action === 'remove') removeWithPassword(id).catch(fail)
      else if (request.method === 'POST' && id !== null && action === 'report') report(id)
      else respond(405, { code: 'invalid' })
    } catch {
      fail()
    }
    return true
  }

  return { handle, close: () => database.close() }
}
