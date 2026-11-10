import { worldApiUrl } from '../lib/worldApi'

const PLAYER_KEY = 'harudle-world.crab-player'
const RUN_TIMEOUT_MS = 2500
const REQUEST_TIMEOUT_MS = 8000

export type CrabRankEntry = { rank: number; nickname: string; score: number; crabs: number; mine: boolean }
export type CrabRanking = {
  top: CrabRankEntry[]
  me: { rank: number; nickname: string; score: number; crabs: number } | null
  total: number
}
export type CrabRun = { runId: string; seed: number }
export type CrabSubmitResult = CrabRanking & { score: number; crabs: number; isBest: boolean }

let sessionPlayer: string | null = null

function createPlayerId() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** 로그인이 없어서 이 브라우저에 저장한 임의 값으로 내 기록을 찾는다. 저장할 수 없으면 이번 방문 동안만 쓴다. */
function playerId() {
  if (sessionPlayer) return sessionPlayer
  try {
    sessionPlayer = window.localStorage.getItem(PLAYER_KEY)
    if (!sessionPlayer) {
      sessionPlayer = createPlayerId()
      window.localStorage.setItem(PLAYER_KEY, sessionPlayer)
    }
  } catch {
    sessionPlayer ??= createPlayerId()
  }
  return sessionPlayer
}

export async function fetchCrabRanking(signal?: AbortSignal): Promise<CrabRanking | null> {
  try {
    const response = await fetch(worldApiUrl('/crab-game/scores'), {
      headers: { 'X-Crab-Player': playerId() },
      signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

/** 판을 시작할 때 서버에서 씨앗을 받는다. 연결이 안 되면 null이고, 그 판은 연습으로 칠 수 있다. */
export async function startCrabRun(): Promise<CrabRun | null> {
  try {
    const response = await fetch(worldApiUrl('/crab-game/runs'), { method: 'POST', signal: AbortSignal.timeout(RUN_TIMEOUT_MS) })
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

export async function submitCrabRun(run: CrabRun, score: number, moves: number[], nickname: string): Promise<CrabSubmitResult | null> {
  try {
    const response = await fetch(worldApiUrl('/crab-game/scores'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: run.runId, player: playerId(), score, moves, nickname }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}
