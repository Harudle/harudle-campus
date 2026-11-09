import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { normalizeAnswer } from '../src/data/arcadeQuizzes.ts'
import { charLength, cleanText, createLimiter, LINK_PATTERN, readBody } from './cheers.ts'
import { createFeedFetcher, hashPassword, isValidPassword, parseFeedId, verifyPassword, type FeedInfo } from './feedPosts.ts'

const ROOM_PATTERN = /^(song|drama)$/
const MAX_ANSWER_LENGTH = 100
const MAX_ACCEPTED_ANSWERS = 5
const MAX_HINT_LENGTH = 80
const MAX_NICKNAME_LENGTH = 12
const DEFAULT_NICKNAME = '익명의 도전자'
const LIST_SIZE = 30
const SOLVERS_SHOWN = 20
const HIDE_AT_REPORTS = 3
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const REGISTERS_PER_WINDOW = 5
const REGISTER_WINDOW_MS = 10 * MINUTE_MS
const REGISTERS_PER_HOUR_TOTAL = 200
// 정답을 하나씩 대입해 보지 못하도록 문제마다 시도 횟수를 제한한다.
const ANSWERS_PER_MINUTE_PER_QUIZ = 10
const ANSWERS_PER_MINUTE = 40
const REPORTS_PER_HOUR = 20
// 비밀번호를 대입해 보지 못하도록 문제마다 시도 횟수를 제한한다.
const REMOVE_TRIES_PER_WINDOW = 5
const REMOVE_WINDOW_MS = 10 * MINUTE_MS

export type QuizzesOptions = {
  databasePath: string
  isOriginAllowed: (origin: string | undefined) => boolean
  trustProxy?: boolean
  harudleBaseUrl?: string
}

type QuizRow = { id: number; room: string; feed_id: string; hint: string; created_at: string; has_password: number }

function hashToken(token: string) {
  return createHash('sha256').update(token).digest()
}

function parseAcceptedAnswers(value: unknown) {
  if (typeof value !== 'string' || charLength(value) > MAX_ANSWER_LENGTH) return null
  const accepted = [...new Set(cleanText(value).split(/[,，\n]/).map(normalizeAnswer).filter(Boolean))]
  return accepted.length > 0 && accepted.length <= MAX_ACCEPTED_ANSWERS ? accepted : null
}

/**
 * 사용자가 하루들 피드 글로 낸 퀴즈. 정답은 서버에만 두고 채점도 여기서 해서 브라우저로 나가지 않는다.
 * 로그인이 없어서 등록할 때 정한 비밀번호로만 내릴 수 있고, 신고가 쌓이면 가린다.
 */
export function createQuizzesHandler({
  databasePath,
  isOriginAllowed,
  trustProxy = false,
  harudleBaseUrl,
}: QuizzesOptions) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS user_quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT NOT NULL,
      feed_id TEXT NOT NULL UNIQUE,
      answers TEXT NOT NULL,
      hint TEXT NOT NULL,
      created_at TEXT NOT NULL,
      token_hash BLOB NOT NULL,
      reports INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS user_quizzes_by_room ON user_quizzes (room, hidden, id);
    CREATE TABLE IF NOT EXISTS quiz_solvers (
      quiz_id INTEGER NOT NULL REFERENCES user_quizzes (id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      solved_at TEXT NOT NULL,
      PRIMARY KEY (quiz_id, nickname)
    );
  `)
  // 비밀번호를 도입하기 전에 등록한 문제는 값이 비어 있고, 그때 발급한 토큰으로 내린다.
  const columns = database.prepare('PRAGMA table_info(user_quizzes)').all() as { name: string }[]
  if (!columns.some((column) => column.name === 'password_hash')) {
    database.exec('ALTER TABLE user_quizzes ADD COLUMN password_hash BLOB; ALTER TABLE user_quizzes ADD COLUMN password_salt BLOB;')
  }
  const listByRoom = database.prepare(
    'SELECT id, room, feed_id, hint, created_at, password_hash IS NOT NULL AS has_password FROM user_quizzes WHERE room = ? AND hidden = 0 ORDER BY id DESC LIMIT ?',
  )
  const findVisible = database.prepare('SELECT answers FROM user_quizzes WHERE id = ? AND hidden = 0')
  const findCredentials = database.prepare('SELECT token_hash, password_hash, password_salt FROM user_quizzes WHERE id = ?')
  const findFeed = database.prepare('SELECT id FROM user_quizzes WHERE feed_id = ?')
  const insertQuiz = database.prepare(
    'INSERT INTO user_quizzes (room, feed_id, answers, hint, created_at, token_hash, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const removeSolvers = database.prepare('DELETE FROM quiz_solvers WHERE quiz_id = ?')
  const removeQuiz = database.prepare('DELETE FROM user_quizzes WHERE id = ?')
  const addReport = database.prepare(
    `UPDATE user_quizzes SET reports = reports + 1, hidden = CASE WHEN reports + 1 >= ${HIDE_AT_REPORTS} THEN 1 ELSE hidden END WHERE id = ?`,
  )
  const insertSolver = database.prepare('INSERT OR IGNORE INTO quiz_solvers (quiz_id, nickname, solved_at) VALUES (?, ?, ?)')
  const listSolvers = database.prepare('SELECT nickname FROM quiz_solvers WHERE quiz_id = ? ORDER BY solved_at DESC LIMIT ?')
  const countSolvers = database.prepare('SELECT COUNT(*) AS total FROM quiz_solvers WHERE quiz_id = ?')

  const limit = createLimiter()
  const reportedBy = new Set<string>()
  const fetchFeed = createFeedFetcher(harudleBaseUrl)

  const clientKey = (request: IncomingMessage) => {
    const forwarded = trustProxy ? request.headers['x-forwarded-for'] : undefined
    const value = Array.isArray(forwarded) ? forwarded.join(',') : forwarded
    return value?.split(',').pop()?.trim() || request.socket.remoteAddress || 'unknown'
  }

  const solverSummary = (quizId: number) => {
    const { total } = countSolvers.get(quizId) as { total: number }
    const rows = listSolvers.all(quizId, SOLVERS_SHOWN) as { nickname: string }[]
    return { solverCount: total, solvers: rows.map((row) => row.nickname) }
  }

  const toQuiz = (row: QuizRow, feed: FeedInfo) => ({
    id: row.id,
    room: row.room,
    hint: row.hint,
    createdAt: row.created_at,
    hasPassword: row.has_password === 1,
    ...feed,
    ...solverSummary(row.id),
  })

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const match = /^\/quizzes(?:\/(\d{1,15})(\/answer|\/report|\/remove)?)?$/.exec(url.pathname)
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
      const room = url.searchParams.get('room') ?? ''
      if (!ROOM_PATTERN.test(room)) {
        respond(400, { code: 'invalid' })
        return true
      }
      const rows = listByRoom.all(room, LIST_SIZE) as QuizRow[]
      Promise.all(rows.map(async (row) => ({ row, result: await fetchFeed(row.feed_id) })))
        .then((results) => {
          // 하루들에서 지워졌거나 지금 이미지를 받을 수 없는 글은 걸지 않는다.
          const items = results.flatMap(({ row, result }) => (result.status === 'ok' ? [toQuiz(row, result.feed)] : []))
          respond(200, { items })
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
      const { room, shareUrl, answer, hint, password } = body
      if (typeof room !== 'string' || !ROOM_PATTERN.test(room)) return respond(400, { code: 'invalid' })
      const feedId = parseFeedId(shareUrl)
      if (!feedId) return respond(400, { code: 'bad_link' })
      const accepted = parseAcceptedAnswers(answer)
      if (!accepted) return respond(400, { code: 'bad_answer' })
      const cleanHint = typeof hint === 'string' ? cleanText(hint).replace(/\n/g, ' ') : ''
      if (charLength(cleanHint) > MAX_HINT_LENGTH || LINK_PATTERN.test(cleanHint)) return respond(400, { code: 'bad_hint' })
      if (!isValidPassword(password)) return respond(400, { code: 'bad_password' })
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
      // 하루들 응답을 기다리는 사이 같은 글이 먼저 등록됐을 수 있다.
      if (findFeed.get(feedId)) return respond(409, { code: 'duplicate' })

      const { hash: passwordHash, salt } = await hashPassword(password)
      // 비밀번호를 만드는 사이에 같은 글이 먼저 등록됐을 수 있다.
      if (findFeed.get(feedId)) return respond(409, { code: 'duplicate' })
      const createdAt = new Date().toISOString()
      // 토큰 칸은 이전 문제와 표를 같이 쓰려고 남겨 두었고, 아무도 모르는 값을 넣는다.
      const { lastInsertRowid } = insertQuiz.run(
        room,
        feedId,
        JSON.stringify(accepted),
        cleanHint,
        createdAt,
        hashToken(randomBytes(24).toString('base64url')),
        passwordHash,
        salt,
      )
      const row: QuizRow = { id: Number(lastInsertRowid), room, feed_id: feedId, hint: cleanHint, created_at: createdAt, has_password: 1 }
      respond(201, { quiz: toQuiz(row, result.feed) })
    }

    const answerQuiz = async (quizId: number) => {
      const key = clientKey(request)
      if (!limit(`answer:${key}`, ANSWERS_PER_MINUTE, MINUTE_MS) || !limit(`answer:${key}:${quizId}`, ANSWERS_PER_MINUTE_PER_QUIZ, MINUTE_MS)) {
        return respond(429, { code: 'rate_limited' })
      }
      const body = await readJson()
      if (!body) return respond(400, { code: 'invalid' })
      const row = findVisible.get(quizId) as { answers: string } | undefined
      if (!row) return respond(404, { code: 'not_found' })
      if (typeof body.answer !== 'string' || charLength(body.answer) > MAX_ANSWER_LENGTH) return respond(400, { code: 'invalid' })
      const nickname = typeof body.nickname === 'string' ? cleanText(body.nickname).replace(/\n/g, ' ') : ''
      if (charLength(nickname) > MAX_NICKNAME_LENGTH || LINK_PATTERN.test(nickname)) return respond(400, { code: 'bad_nickname' })

      const accepted = JSON.parse(row.answers) as string[]
      if (!accepted.includes(normalizeAnswer(body.answer))) return respond(200, { correct: false })
      insertSolver.run(quizId, nickname || DEFAULT_NICKNAME, new Date().toISOString())
      respond(200, { correct: true, ...solverSummary(quizId) })
    }

    const removeWithPassword = async (quizId: number) => {
      const body = await readJson()
      if (!body) return respond(400, { code: 'invalid' })
      if (!limit(`remove:${clientKey(request)}:${quizId}`, REMOVE_TRIES_PER_WINDOW, REMOVE_WINDOW_MS)) {
        return respond(429, { code: 'rate_limited' })
      }
      const row = findCredentials.get(quizId) as
        | { token_hash: Uint8Array; password_hash: Uint8Array | null; password_salt: Uint8Array | null }
        | undefined
      if (!row) return respond(404, { code: 'not_found' })

      let allowed = false
      if (row.password_hash && row.password_salt) {
        allowed = await verifyPassword(body.password, row.password_salt, row.password_hash)
      } else if (typeof body.token === 'string') {
        allowed = timingSafeEqual(hashToken(body.token), row.token_hash)
      }
      if (!allowed) return respond(403, { code: 'wrong_password' })
      removeSolvers.run(quizId)
      removeQuiz.run(quizId)
      respond(204)
    }

    const report = (quizId: number) => {
      const key = clientKey(request)
      if (!limit(`report:${key}`, REPORTS_PER_HOUR, HOUR_MS)) return respond(429, { code: 'rate_limited' })
      const reportKey = `${key}:${quizId}`
      // 같은 사람의 반복 신고로 문제가 가려지지 않게 한 번만 센다.
      if (!reportedBy.has(reportKey)) {
        reportedBy.add(reportKey)
        addReport.run(quizId)
      }
      respond(204)
    }

    try {
      if (request.method === 'POST' && id === null) register().catch(fail)
      else if (request.method === 'POST' && id !== null && action === '/answer') answerQuiz(id).catch(fail)
      else if (request.method === 'POST' && id !== null && action === '/report') report(id)
      else if (request.method === 'POST' && id !== null && action === '/remove') removeWithPassword(id).catch(fail)
      else respond(405, { code: 'invalid' })
    } catch {
      fail()
    }
    return true
  }

  return { handle, close: () => database.close() }
}
