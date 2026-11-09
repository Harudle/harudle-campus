import { createHash, randomBytes, randomInt } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CRAB_TICK_RATE, replayCrabRun } from '../src/games/crabSim.ts'
import { charLength, cleanText, createLimiter, LINK_PATTERN, readBody } from './cheers.ts'

const PLAYER_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
const RUN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
const MAX_BODY_BYTES = 64 * 1024
const MAX_NICKNAME_LENGTH = 12
const DEFAULT_NICKNAME = '익명의 관람객'
const TOP_SIZE = 20
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const RUN_TTL_MS = 10 * MINUTE_MS
const CLOCK_MARGIN_MS = 1000
const SLOW_DEVICE_FACTOR = 1.5
const PAUSE_ALLOWANCE_MS = 30_000
const RUNS_PER_MINUTE = 30
const RUNS_PER_HOUR_TOTAL = 20_000
const SUBMITS_PER_MINUTE = 30

export type CrabRankingOptions = {
  databasePath: string
  isOriginAllowed: (origin: string | undefined) => boolean
  /** 프록시 뒤에 있을 때만 켠다. 그렇지 않으면 X-Forwarded-For를 위조할 수 있다. */
  trustProxy?: boolean
}

type ScoreRow = { nickname: string; score: number; crabs: number; created_at: string; mine: number }
type BestRow = { nickname: string; score: number; crabs: number; created_at: string; hidden: number }

function hashPlayer(token: string) {
  return createHash('sha256').update(token).digest()
}

/**
 * 그림 속 게임의 랭킹. 점수를 믿지 않고 시작할 때 준 씨앗과 조작 기록으로 서버가 판을 다시 돌려 계산한다.
 * 로그인이 없어서 브라우저마다 만든 임의 값으로 사람을 구분하고, 사람마다 최고 기록 하나만 남긴다.
 * 그 값은 해시만, IP는 횟수 제한에만 쓰고 저장하지 않는다. 처리한 요청이면 true를 돌려준다.
 */
export function createCrabRankingHandler({ databasePath, isOriginAllowed, trustProxy = false }: CrabRankingOptions) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS crab_scores (
      player_hash BLOB PRIMARY KEY,
      nickname TEXT NOT NULL,
      score INTEGER NOT NULL,
      crabs INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS crab_scores_by_rank ON crab_scores (hidden, score DESC, created_at);
    CREATE TABLE IF NOT EXISTS crab_runs (
      id TEXT PRIMARY KEY,
      seed INTEGER NOT NULL,
      started_at INTEGER NOT NULL
    );
  `)
  const insertRun = database.prepare('INSERT INTO crab_runs (id, seed, started_at) VALUES (?, ?, ?)')
  const takeRun = database.prepare('DELETE FROM crab_runs WHERE id = ? RETURNING seed, started_at')
  const removeOldRuns = database.prepare('DELETE FROM crab_runs WHERE started_at < ?')
  const listTop = database.prepare(
    `SELECT nickname, score, crabs, created_at, player_hash = ? AS mine FROM crab_scores WHERE hidden = 0 ORDER BY score DESC, created_at LIMIT ${TOP_SIZE}`,
  )
  const findBest = database.prepare('SELECT nickname, score, crabs, created_at, hidden FROM crab_scores WHERE player_hash = ?')
  const countAhead = database.prepare(
    'SELECT COUNT(*) AS ahead FROM crab_scores WHERE hidden = 0 AND (score > ? OR (score = ? AND created_at < ?))',
  )
  const countAll = database.prepare('SELECT COUNT(*) AS total FROM crab_scores WHERE hidden = 0')
  const saveBest = database.prepare(`
    INSERT INTO crab_scores (player_hash, nickname, score, crabs, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (player_hash) DO UPDATE SET nickname = excluded.nickname, score = excluded.score, crabs = excluded.crabs, created_at = excluded.created_at
  `)
  const renamePlayer = database.prepare('UPDATE crab_scores SET nickname = ? WHERE player_hash = ?')

  const limit = createLimiter()

  const clientKey = (request: IncomingMessage) => {
    const forwarded = trustProxy ? request.headers['x-forwarded-for'] : undefined
    const value = Array.isArray(forwarded) ? forwarded.join(',') : forwarded
    return value?.split(',').pop()?.trim() || request.socket.remoteAddress || 'unknown'
  }

  const ranking = (playerHash: Uint8Array | null) => {
    const top = (listTop.all(playerHash ?? new Uint8Array()) as ScoreRow[]).map((row, index) => ({
      rank: index + 1,
      nickname: row.nickname,
      score: row.score,
      crabs: row.crabs,
      mine: row.mine === 1,
    }))
    const best = playerHash ? (findBest.get(playerHash) as BestRow | undefined) : undefined
    const me =
      best && best.hidden === 0
        ? {
            rank: (countAhead.get(best.score, best.score, best.created_at) as { ahead: number }).ahead + 1,
            nickname: best.nickname,
            score: best.score,
            crabs: best.crabs,
          }
        : null
    const { total } = countAll.get() as { total: number }
    return { top, me, total }
  }

  const handleSubmit = async (request: IncomingMessage, response: ServerResponse, respond: (status: number, body?: unknown) => void) => {
    if (!request.headers['content-type']?.startsWith('application/json')) return respond(415, { code: 'invalid' })
    const raw = await readBody(request, MAX_BODY_BYTES)
    if (raw === null) {
      response.setHeader('Connection', 'close')
      return respond(413, { code: 'invalid' })
    }
    if (!limit(`submit:${clientKey(request)}`, SUBMITS_PER_MINUTE, MINUTE_MS)) return respond(429, { code: 'rate_limited' })

    let body: Record<string, unknown> | null
    try {
      body = JSON.parse(raw)
    } catch {
      return respond(400, { code: 'invalid' })
    }
    const { runId, player, moves } = body ?? {}
    if (typeof runId !== 'string' || !RUN_PATTERN.test(runId)) return respond(400, { code: 'invalid' })
    if (typeof player !== 'string' || !PLAYER_PATTERN.test(player)) return respond(400, { code: 'invalid' })

    // 한 번 낸 판은 다시 낼 수 없다.
    const run = takeRun.get(runId) as { seed: number; started_at: number } | undefined
    if (!run) return respond(404, { code: 'expired' })
    const outcome = replayCrabRun(run.seed, moves)
    if (!outcome) return respond(400, { code: 'invalid' })

    // 실제로 흐른 시간이 판 길이와 맞아야 한다. 느린 기기와 잠깐 숨긴 탭은 봐준다.
    const playedMs = (outcome.ticks / CRAB_TICK_RATE) * 1000
    const elapsedMs = Date.now() - run.started_at
    if (elapsedMs < playedMs - CLOCK_MARGIN_MS || elapsedMs > playedMs * SLOW_DEVICE_FACTOR + PAUSE_ALLOWANCE_MS) {
      return respond(422, { code: 'rejected' })
    }
    // 브라우저가 본 점수와 다르면 조작이거나 재현이 어긋난 것이므로 올리지 않는다.
    if (body?.score !== outcome.score) return respond(422, { code: 'rejected' })

    const rawNickname = typeof body?.nickname === 'string' ? cleanText(body.nickname).replace(/\n/g, ' ') : ''
    const nickname =
      rawNickname && charLength(rawNickname) <= MAX_NICKNAME_LENGTH && !LINK_PATTERN.test(rawNickname) ? rawNickname : DEFAULT_NICKNAME

    const playerHash = hashPlayer(player)
    const previous = findBest.get(playerHash) as BestRow | undefined
    const isBest = !previous || outcome.score > previous.score
    if (isBest) saveBest.run(playerHash, nickname, outcome.score, outcome.crabs, new Date().toISOString())
    else renamePlayer.run(nickname, playerHash)
    respond(200, { score: outcome.score, crabs: outcome.crabs, isBest, ...ranking(playerHash) })
  }

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost')
    if (pathname !== '/crab-game/runs' && pathname !== '/crab-game/scores') return false

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

    if (request.method === 'OPTIONS') {
      if (originAllowed) {
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST')
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Crab-Player')
        response.setHeader('Access-Control-Max-Age', '600')
      }
      respond(204)
      return true
    }

    const fail = () => {
      if (!response.headersSent) respond(500, { code: 'failed' })
    }
    try {
      if (request.method === 'GET' && pathname === '/crab-game/scores') {
        const player = request.headers['x-crab-player']
        respond(200, ranking(typeof player === 'string' && PLAYER_PATTERN.test(player) ? hashPlayer(player) : null))
        return true
      }
      // 쓰기는 이 사이트 페이지에서 온 요청만 받는다.
      if (!originAllowed) {
        respond(403, { code: 'forbidden' })
        return true
      }
      if (request.method === 'POST' && pathname === '/crab-game/runs') {
        if (!limit(`run:${clientKey(request)}`, RUNS_PER_MINUTE, MINUTE_MS) || !limit('run:all', RUNS_PER_HOUR_TOTAL, HOUR_MS)) {
          respond(429, { code: 'rate_limited' })
          return true
        }
        const now = Date.now()
        removeOldRuns.run(now - RUN_TTL_MS)
        const runId = randomBytes(18).toString('base64url')
        const seed = randomInt(1, 2 ** 31 - 1)
        insertRun.run(runId, seed, now)
        respond(201, { runId, seed })
      } else if (request.method === 'POST' && pathname === '/crab-game/scores') {
        handleSubmit(request, response, respond).catch(fail)
      } else {
        respond(405, { code: 'invalid' })
      }
    } catch {
      fail()
    }
    return true
  }

  return { handle, close: () => database.close() }
}
