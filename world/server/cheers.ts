import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const AUTHOR_PATTERN = /^[A-Za-z0-9-]{1,64}$/
const INVISIBLE_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F​‎‏‪-‮⁠-⁩﻿]/g
export const LINK_PATTERN = /(https?:\/\/|www\.)/i
const MAX_BODY_BYTES = 2048
const MAX_MESSAGE_LENGTH = 200
const MAX_NICKNAME_LENGTH = 12
const DEFAULT_NICKNAME = '익명의 관람객'
const PAGE_SIZE = 30
const HIDE_AT_REPORTS = 3
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const POSTS_PER_MINUTE = 5
const POSTS_PER_HOUR_TOTAL = 600
const REPORTS_PER_HOUR = 20
const MAX_TRACKED_KEYS = 20_000

export type CheersOptions = {
  databasePath: string
  isOriginAllowed: (origin: string | undefined) => boolean
  /** 프록시 뒤에 있을 때만 켠다. 그렇지 않으면 X-Forwarded-For를 위조할 수 있다. */
  trustProxy?: boolean
}

type CheerRow = { id: number; nickname: string; message: string; created_at: string }

function hashToken(token: string) {
  return createHash('sha256').update(token).digest()
}

export function cleanText(value: string) {
  return value.normalize('NFC').replace(INVISIBLE_CHARS, '').replace(/\n{3,}/g, '\n\n').trim()
}

export function charLength(value: string) {
  return [...value].length
}

/** 시간당 횟수만 세면 되어서 메모리에 둔다. 서버가 다시 뜨면 초기화된다. */
export function createLimiter() {
  const windows = new Map<string, { start: number; count: number }>()
  return (key: string, limit: number, windowMs: number) => {
    const now = Date.now()
    if (windows.size > MAX_TRACKED_KEYS) {
      for (const [entryKey, entry] of windows) if (now - entry.start >= HOUR_MS) windows.delete(entryKey)
    }
    const entry = windows.get(key)
    if (!entry || now - entry.start >= windowMs) {
      windows.set(key, { start: now, count: 1 })
      return true
    }
    entry.count += 1
    return entry.count <= limit
  }
}

export function readBody(request: IncomingMessage, maxBytes = MAX_BODY_BYTES) {
  return new Promise<string | null>((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        resolve(null)
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', () => resolve(null))
  })
}

/**
 * 작가 응원 방명록. 로그인이 없어서 글마다 삭제 토큰을 발급해 쓴 사람만 지울 수 있게 하고,
 * 신고가 쌓인 글은 자동으로 가린다. IP는 횟수 제한에만 쓰고 저장하지 않는다.
 * 처리한 요청이면 true를 돌려준다.
 */
export function createCheersHandler({ databasePath, isOriginAllowed, trustProxy = false }: CheersOptions) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cheers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      token_hash BLOB NOT NULL,
      reports INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS cheers_by_author ON cheers (author_id, hidden, id);
  `)
  const listAll = database.prepare(
    'SELECT id, nickname, message, created_at FROM cheers WHERE author_id = ? AND hidden = 0 ORDER BY id DESC LIMIT ?',
  )
  const listBefore = database.prepare(
    'SELECT id, nickname, message, created_at FROM cheers WHERE author_id = ? AND hidden = 0 AND id < ? ORDER BY id DESC LIMIT ?',
  )
  const countAll = database.prepare('SELECT COUNT(*) AS total FROM cheers WHERE author_id = ? AND hidden = 0')
  const insert = database.prepare(
    'INSERT INTO cheers (author_id, nickname, message, created_at, token_hash) VALUES (?, ?, ?, ?, ?)',
  )
  const findToken = database.prepare('SELECT token_hash FROM cheers WHERE id = ?')
  const remove = database.prepare('DELETE FROM cheers WHERE id = ?')
  const addReport = database.prepare(
    `UPDATE cheers SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ${HIDE_AT_REPORTS} THEN 1 ELSE hidden END WHERE id = ?`,
  )

  const limit = createLimiter()
  const reportedBy = new Set<string>()

  const clientKey = (request: IncomingMessage) => {
    const forwarded = trustProxy ? request.headers['x-forwarded-for'] : undefined
    const value = Array.isArray(forwarded) ? forwarded.join(',') : forwarded
    return value?.split(',').pop()?.trim() || request.socket.remoteAddress || 'unknown'
  }

  const toCheer = (row: CheerRow) => ({
    id: row.id,
    nickname: row.nickname,
    message: row.message,
    createdAt: row.created_at,
  })

  const handlePost = async (request: IncomingMessage, response: ServerResponse, respond: (status: number, body?: unknown) => void) => {
    if (!request.headers['content-type']?.startsWith('application/json')) return respond(415, { code: 'invalid' })
    const raw = await readBody(request)
    if (raw === null) {
      // 남은 업로드를 받지 않도록 응답 후 연결을 닫는다.
      response.setHeader('Connection', 'close')
      return respond(413, { code: 'invalid' })
    }

    let body: Record<string, unknown> | null
    try {
      body = JSON.parse(raw)
    } catch {
      return respond(400, { code: 'invalid' })
    }
    const author = body?.author
    if (typeof author !== 'string' || !AUTHOR_PATTERN.test(author)) return respond(400, { code: 'invalid' })
    if (typeof body?.message !== 'string') return respond(400, { code: 'invalid' })

    const message = cleanText(body.message)
    if (!message || charLength(message) > MAX_MESSAGE_LENGTH) return respond(400, { code: 'invalid' })
    if (LINK_PATTERN.test(message)) return respond(400, { code: 'link' })

    const rawNickname = typeof body.nickname === 'string' ? cleanText(body.nickname).replace(/\n/g, ' ') : ''
    if (charLength(rawNickname) > MAX_NICKNAME_LENGTH || LINK_PATTERN.test(rawNickname)) {
      return respond(400, { code: 'invalid' })
    }

    if (!limit(`post:${clientKey(request)}`, POSTS_PER_MINUTE, MINUTE_MS) || !limit('post:all', POSTS_PER_HOUR_TOTAL, HOUR_MS)) {
      return respond(429, { code: 'rate_limited' })
    }

    const nickname = rawNickname || DEFAULT_NICKNAME
    const createdAt = new Date().toISOString()
    const token = randomBytes(24).toString('base64url')
    const { lastInsertRowid } = insert.run(author, nickname, message, createdAt, hashToken(token))
    respond(201, { cheer: { id: Number(lastInsertRowid), nickname, message, createdAt }, deleteToken: token })
  }

  const handleDelete = (request: IncomingMessage, id: number, respond: (status: number, body?: unknown) => void) => {
    const token = request.headers['x-cheer-token']
    const row = findToken.get(id) as { token_hash: Uint8Array } | undefined
    if (typeof token !== 'string' || !row) return respond(404, { code: 'not_found' })
    if (!timingSafeEqual(hashToken(token), row.token_hash)) return respond(403, { code: 'forbidden' })
    remove.run(id)
    respond(204)
  }

  const handleReport = (request: IncomingMessage, id: number, respond: (status: number, body?: unknown) => void) => {
    const key = clientKey(request)
    if (!limit(`report:${key}`, REPORTS_PER_HOUR, HOUR_MS)) return respond(429, { code: 'rate_limited' })
    const reportKey = `${key}:${id}`
    // 같은 사람의 반복 신고로 글이 가려지지 않게 한 번만 센다.
    if (!reportedBy.has(reportKey)) {
      if (reportedBy.size > MAX_TRACKED_KEYS) reportedBy.clear()
      reportedBy.add(reportKey)
      addReport.run(id)
    }
    respond(204)
  }

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const match = /^\/cheers(?:\/(\d{1,15})(\/report)?)?$/.exec(url.pathname)
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
    const id = match[1] ? Number(match[1]) : null
    const isReport = Boolean(match[2])

    if (request.method === 'OPTIONS') {
      if (originAllowed) {
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE')
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cheer-Token')
        response.setHeader('Access-Control-Max-Age', '600')
      }
      respond(204)
      return true
    }

    if (request.method === 'GET' && id === null) {
      const author = url.searchParams.get('author') ?? ''
      if (!AUTHOR_PATTERN.test(author)) {
        respond(400, { code: 'invalid' })
        return true
      }
      const before = Number(url.searchParams.get('before'))
      // 다음 페이지가 있는지 알려고 한 줄 더 읽는다.
      const rows = (
        Number.isSafeInteger(before) && before > 0
          ? listBefore.all(author, before, PAGE_SIZE + 1)
          : listAll.all(author, PAGE_SIZE + 1)
      ) as CheerRow[]
      const { total } = countAll.get(author) as { total: number }
      respond(200, { items: rows.slice(0, PAGE_SIZE).map(toCheer), hasMore: rows.length > PAGE_SIZE, total })
      return true
    }

    // 쓰기는 전시관 페이지에서 온 요청만 받는다.
    if (!originAllowed) {
      respond(403, { code: 'forbidden' })
      return true
    }

    const fail = () => {
      if (!response.headersSent) respond(500, { code: 'failed' })
    }
    try {
      if (request.method === 'POST' && id === null) handlePost(request, response, respond).catch(fail)
      else if (request.method === 'DELETE' && id !== null && !isReport) handleDelete(request, id, respond)
      else if (request.method === 'POST' && id !== null && isReport) handleReport(request, id, respond)
      else respond(405, { code: 'invalid' })
    } catch {
      fail()
    }
    return true
  }

  return { handle, close: () => database.close() }
}
