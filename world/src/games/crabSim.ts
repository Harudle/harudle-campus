// 브라우저와 서버가 같은 판을 똑같이 재현해야 점수를 검증할 수 있다.
// 기기마다 결과가 미세하게 다른 Math.sin, Math.random 등을 이 파일에서 쓰면 안 된다.

export const CRAB_GOAL = 15
export const CRAB_START_HEARTS = 3
export const CRAB_TICK_RATE = 60
export const CRAB_TIME_LIMIT = 60
export const CRAB_MAX_TICKS = CRAB_TIME_LIMIT * CRAB_TICK_RATE
export const CRAB_STAGE_SECONDS = 12
export const CRAB_FIELD_WIDTH = 600
export const CRAB_FIELD_HEIGHT = 800
export const CRAB_GROUND_Y = CRAB_FIELD_HEIGHT - 26
export const CRAB_PLATE_Y = CRAB_GROUND_Y - 128
export const CRAB_HERO_STEP = 640 / CRAB_TICK_RATE

const FEVER_TICKS = 6 * CRAB_TICK_RATE
const PLATE_MARGIN = 16
const HERO_MARGIN = 36
const SPAWN_MARGIN = 40
const CRAB_POINTS = 10
const SURVIVE_HEART_BONUS = 200

export type CrabItemKind = 'crab' | 'star' | 'tablet'
export type CrabDirection = -1 | 0 | 1
export type CrabItem = {
  id: number
  kind: CrabItemKind
  x: number
  y: number
  speed: number
  baseX: number
  swayRange: number
  swayAt: number
  swayStep: number
}
export type CrabEvent =
  | { type: 'catch'; x: number; points: number; combo: number }
  | { type: 'star'; x: number }
  | { type: 'hurt'; x: number }
  | { type: 'miss' }
  | { type: 'goal' }
  | { type: 'stage'; stage: number }
export type CrabOutcome = { score: number; crabs: number; hearts: number; ticks: number }

/** 같은 씨앗이면 어느 기기에서나 같은 수열을 낸다. */
function createRandom(seed: number) {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** -1에서 1 사이를 일정한 빠르기로 오간다. */
function triangleWave(at: number) {
  const within = at - Math.floor(at)
  return within < 0.5 ? within * 4 - 1 : 3 - within * 4
}

function comboMultiplier(combo: number) {
  if (combo >= 20) return 4
  if (combo >= 10) return 3
  if (combo >= 5) return 2
  return 1
}

export function crabPlateHalf(fever: boolean, tick: number) {
  if (fever) return 88
  return 54 - 18 * Math.min(tick / CRAB_MAX_TICKS, 1)
}

/** 60초짜리 한 판. 뒤로 갈수록 빨라지고 함정이 늘어 끝까지 다 받기는 어렵다. */
export function createCrabSim(seed: number) {
  const random = createRandom(seed)
  const items: CrabItem[] = []
  let nextId = 1
  let spawnIn = Math.round(0.8 * CRAB_TICK_RATE)

  const spawnItem = (kind: CrabItemKind, x: number, speed: number, swayRange = 0) => {
    items.push({
      id: nextId,
      kind,
      x,
      y: -30,
      speed,
      baseX: x,
      swayRange,
      swayAt: random(),
      swayStep: swayRange > 0 ? (0.7 + random() * 0.5) / CRAB_TICK_RATE : 0,
    })
    nextId += 1
  }

  const sim = {
    tick: 0,
    heroX: CRAB_FIELD_WIDTH / 2,
    score: 0,
    crabs: 0,
    combo: 0,
    bestCombo: 0,
    hearts: CRAB_START_HEARTS,
    fever: 0,
    stage: 1,
    finished: false,
    items,
    step(direction: CrabDirection): CrabEvent[] {
      if (sim.finished) return []
      const events: CrabEvent[] = []
      sim.tick += 1
      const seconds = sim.tick / CRAB_TICK_RATE
      const progress = Math.min(sim.tick / CRAB_MAX_TICKS, 1)
      sim.fever = Math.max(sim.fever - 1, 0)

      const stage = Math.min(Math.floor(seconds / CRAB_STAGE_SECONDS), 4) + 1
      if (stage !== sim.stage) {
        sim.stage = stage
        events.push({ type: 'stage', stage })
      }

      sim.heroX = Math.min(Math.max(sim.heroX + direction * CRAB_HERO_STEP, HERO_MARGIN), CRAB_FIELD_WIDTH - HERO_MARGIN)

      spawnIn -= 1
      if (spawnIn <= 0) {
        spawnIn = Math.round((0.7 - progress * 0.44) * CRAB_TICK_RATE)
        const speed = (380 + progress * 720) * (0.88 + random() * 0.24)
        const roll = random()
        const tabletChance = seconds < 3 ? 0 : 0.2 + progress * 0.28
        const swayRange = stage >= 2 && random() < 0.2 + progress * 0.4 ? 60 + random() * 70 : 0
        const x = SPAWN_MARGIN + swayRange + random() * (CRAB_FIELD_WIDTH - (SPAWN_MARGIN + swayRange) * 2)
        if (roll < 0.05 && sim.fever === 0) {
          spawnItem('star', x, speed)
        } else if (roll < 0.05 + tabletChance) {
          spawnItem('tablet', x, speed, swayRange)
        } else if (stage >= 3 && random() < 0.4) {
          // 게 바로 옆에 태블릿을 붙여 정확히 받아야 한다.
          const side = x < CRAB_FIELD_WIDTH / 2 ? 1 : -1
          spawnItem('crab', x, speed)
          spawnItem('tablet', x + side * 110, speed)
        } else {
          spawnItem('crab', x, speed, swayRange)
        }
      }

      const fever = sim.fever > 0
      const reach = crabPlateHalf(fever, sim.tick) + PLATE_MARGIN
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index]
        const before = item.y
        item.y += item.speed / CRAB_TICK_RATE
        if (item.swayRange > 0) {
          item.swayAt += item.swayStep
          item.x = item.baseX + triangleWave(item.swayAt) * item.swayRange
        }
        const crossed = before < CRAB_PLATE_Y && item.y >= CRAB_PLATE_Y - 8
        if (crossed && Math.abs(item.x - sim.heroX) < reach) {
          items.splice(index, 1)
          if (item.kind === 'crab') {
            sim.combo += 1
            sim.bestCombo = Math.max(sim.bestCombo, sim.combo)
            const points = CRAB_POINTS * comboMultiplier(sim.combo) * (fever ? 2 : 1)
            sim.score += points
            sim.crabs += fever ? 2 : 1
            events.push({ type: 'catch', x: item.x, points, combo: sim.combo })
            if (sim.crabs >= CRAB_GOAL && sim.crabs - (fever ? 2 : 1) < CRAB_GOAL) events.push({ type: 'goal' })
          } else if (item.kind === 'star') {
            sim.fever = FEVER_TICKS
            events.push({ type: 'star', x: item.x })
          } else {
            sim.hearts -= 1
            sim.combo = 0
            events.push({ type: 'hurt', x: item.x })
          }
          continue
        }
        if (item.kind === 'crab' && before < CRAB_PLATE_Y && item.y >= CRAB_PLATE_Y) {
          sim.combo = 0
          events.push({ type: 'miss' })
        }
        if (item.y > CRAB_FIELD_HEIGHT + 40) items.splice(index, 1)
      }

      if (sim.hearts <= 0) {
        sim.finished = true
      } else if (sim.tick >= CRAB_MAX_TICKS) {
        // 끝까지 버티면 남은 기회만큼 점수를 더 준다.
        sim.score += sim.hearts * SURVIVE_HEART_BONUS
        sim.finished = true
      }
      return events
    },
  }
  return sim
}

export type CrabSim = ReturnType<typeof createCrabSim>

/**
 * 조작 기록은 [틱, 방향, 틱, 방향, …]으로 방향이 바뀐 순간만 담는다.
 * 잘못된 기록이면 null을 돌려준다.
 */
export function replayCrabRun(seed: number, moves: unknown): CrabOutcome | null {
  if (!Array.isArray(moves) || moves.length % 2 !== 0) return null
  const sim = createCrabSim(seed)
  let direction: CrabDirection = 0
  let next = 0
  let previousTick = -1
  for (let index = 0; index < moves.length; index += 2) {
    const tick = moves[index]
    const value = moves[index + 1]
    if (!Number.isSafeInteger(tick) || tick <= previousTick || tick > CRAB_MAX_TICKS) return null
    if (value !== -1 && value !== 0 && value !== 1) return null
    previousTick = tick
  }
  while (!sim.finished) {
    if (next < moves.length && moves[next] === sim.tick) {
      direction = moves[next + 1] as CrabDirection
      next += 2
    }
    sim.step(direction)
  }
  return { score: sim.score, crabs: sim.crabs, hearts: sim.hearts, ticks: sim.tick }
}
