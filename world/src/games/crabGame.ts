import {
  createCrabSim,
  crabPlateHalf,
  CRAB_FIELD_HEIGHT,
  CRAB_FIELD_WIDTH,
  CRAB_GOAL,
  CRAB_GROUND_Y,
  CRAB_HERO_STEP,
  CRAB_MAX_TICKS,
  CRAB_PLATE_Y,
  CRAB_TICK_RATE,
  type CrabDirection,
  type CrabEvent,
} from './crabSim'
import type { EffectName } from './gameAudio'

const INK = '#2F2F2F'
const CRAB_RED = '#D9534F'
const TICK_SECONDS = 1 / CRAB_TICK_RATE
// 탭을 숨겼다가 돌아와도 건너뛰지 않고 그 자리에서 이어진다.
const MAX_FRAME_SECONDS = 0.1

type Floater = { text: string; x: number; y: number; age: number; big?: boolean }

export type CrabStatus = { score: number; crabs: number; combo: number; hearts: number; timeLeft: number; stage: number; fever: boolean }
export type CrabResult = { won: boolean; score: number; crabs: number; bestCombo: number; moves: number[] }

type CrabGameOptions = {
  seed: number
  onStatus: (status: CrabStatus) => void
  onEnd: (result: CrabResult) => void
  onEffect: (name: EffectName) => void
}

/**
 * 떨어지는 게를 쟁반으로 받는 게임. 랭킹이 공평하도록 어느 기기든 같은 크기의 판을 화면에 맞춰 키우거나 줄여 그리고,
 * 컴퓨터는 A·D 키로, 터치 화면은 손가락으로 같은 빠르기로 움직인다.
 */
export function startCrabGame(canvas: HTMLCanvasElement, { seed, onStatus, onEnd, onEffect }: CrabGameOptions) {
  const ctx = canvas.getContext('2d')!
  const sim = createCrabSim(seed)
  let scale = 1
  let offsetX = 0
  let offsetY = 0
  let dpr = 1
  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    scale = Math.min(rect.width / CRAB_FIELD_WIDTH, rect.height / CRAB_FIELD_HEIGHT)
    offsetX = (rect.width - CRAB_FIELD_WIDTH * scale) / 2
    offsetY = (rect.height - CRAB_FIELD_HEIGHT * scale) / 2
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)

  let touchX: number | null = null
  const pressed = new Set<string>()
  const floaters: Floater[] = []
  const moves: number[] = []
  let lastDirection: CrabDirection = 0
  let hurtFlash = 0
  let ended = false
  let frame = 0
  let last = performance.now()
  let pending = 0
  let lastReported = ''

  const handlePointer = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return
    touchX = (event.clientX - canvas.getBoundingClientRect().left - offsetX) / scale
  }
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'KeyA' && event.code !== 'KeyD') return
    event.preventDefault()
    pressed.add(event.code)
    touchX = null
  }
  const handleKeyUp = (event: KeyboardEvent) => pressed.delete(event.code)
  const releaseKeys = () => pressed.clear()
  canvas.addEventListener('pointerdown', handlePointer)
  canvas.addEventListener('pointermove', handlePointer)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', releaseKeys)

  const currentDirection = (): CrabDirection => {
    const keys = Number(pressed.has('KeyD')) - Number(pressed.has('KeyA'))
    if (keys !== 0) return keys as CrabDirection
    if (touchX === null || Math.abs(touchX - sim.heroX) < CRAB_HERO_STEP) return 0
    return touchX > sim.heroX ? 1 : -1
  }

  const addFloater = (text: string, x: number, big = false) => {
    floaters.push({ text, x: big ? CRAB_FIELD_WIDTH / 2 : x, y: big ? CRAB_FIELD_HEIGHT * 0.35 : CRAB_PLATE_Y - 20, age: 0, big })
  }

  const handleEvent = (event: CrabEvent) => {
    if (event.type === 'catch') {
      addFloater(event.combo >= 5 ? `${event.combo}콤보! +${event.points}` : `겟지유! +${event.points}`, event.x)
      onEffect('catch')
    } else if (event.type === 'star') {
      addFloater('별 쟁반! 점수가 두 배!', event.x)
      onEffect('star')
    } else if (event.type === 'hurt') {
      hurtFlash = 0.35
      addFloater('앗, 태블릿!', event.x)
      onEffect('hurt')
    } else if (event.type === 'goal') {
      addFloater(`게 ${CRAB_GOAL}마리! 게찜 완성!`, 0, true)
      onEffect('star')
    } else if (event.type === 'stage') {
      addFloater(`${event.stage}단계! 더 빨라져요`, 0, true)
    }
  }

  const reportStatus = () => {
    const status: CrabStatus = {
      score: sim.score,
      crabs: sim.crabs,
      combo: sim.combo,
      hearts: sim.hearts,
      timeLeft: Math.max(Math.ceil((CRAB_MAX_TICKS - sim.tick) / CRAB_TICK_RATE), 0),
      stage: sim.stage,
      fever: sim.fever > 0,
    }
    const reported = JSON.stringify(status)
    if (reported !== lastReported) {
      lastReported = reported
      onStatus(status)
    }
  }

  const finish = () => {
    ended = true
    const won = sim.crabs >= CRAB_GOAL
    onEffect(won ? 'win' : 'lose')
    onEnd({ won, score: sim.score, crabs: sim.crabs, bestCombo: sim.bestCombo, moves })
  }

  const update = (seconds: number) => {
    hurtFlash = Math.max(hurtFlash - seconds, 0)
    pending += seconds
    while (pending >= TICK_SECONDS && !sim.finished) {
      pending -= TICK_SECONDS
      const direction = currentDirection()
      if (direction !== lastDirection) {
        moves.push(sim.tick, direction)
        lastDirection = direction
      }
      sim.step(direction).forEach(handleEvent)
    }
    for (let index = floaters.length - 1; index >= 0; index -= 1) {
      floaters[index].age += seconds
      floaters[index].y -= 44 * seconds
      if (floaters[index].age > (floaters[index].big ? 1.4 : 0.9)) floaters.splice(index, 1)
    }
    reportStatus()
    if (sim.finished) finish()
  }

  const line = (lineWidth = 3) => {
    ctx.strokeStyle = INK
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  const drawCrab = (x: number, y: number, phase: number, size = 1) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(size, size)
    ctx.strokeStyle = INK
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (const side of [-1, 1]) {
      for (let leg = 0; leg < 3; leg += 1) {
        const wiggle = Math.sin(phase + leg) * 3
        ctx.beginPath()
        ctx.moveTo(side * 16, 3 + leg * 4)
        ctx.lineTo(side * 30, 8 + leg * 6 + wiggle)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(side * 18, -6)
      ctx.lineTo(side * 28, -18)
      ctx.stroke()
      ctx.fillStyle = CRAB_RED
      ctx.beginPath()
      ctx.arc(side * 30, -24 + Math.sin(phase) * 2, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#FFFDF7'
      ctx.beginPath()
      ctx.moveTo(side * 30, -24 + Math.sin(phase) * 2)
      ctx.lineTo(side * 38, -32)
      ctx.lineTo(side * 26, -35)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = CRAB_RED
    ctx.beginPath()
    ctx.ellipse(0, 0, 23, 16, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = INK
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(side * 8, -5, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(0, 2, 6, 0.2, Math.PI - 0.2)
    ctx.stroke()
    ctx.restore()
  }

  const drawStar = (x: number, y: number, phase: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(Math.sin(phase * 0.5) * 0.5)
    ctx.beginPath()
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 === 0 ? 26 : 11
      const angle = (point * Math.PI) / 5 - Math.PI / 2
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    ctx.closePath()
    ctx.fillStyle = '#F5C400'
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.restore()
  }

  const drawTablet = (x: number, y: number, phase: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(Math.sin(phase * 0.4) * 0.35)
    ctx.strokeStyle = INK
    ctx.lineWidth = 3
    ctx.fillStyle = '#8FA3C8'
    ctx.beginPath()
    ctx.roundRect(-24, -30, 48, 60, 7)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(-18, -24, 36, 42)
    ctx.beginPath()
    ctx.arc(0, 24, 2.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  const drawHero = () => {
    const ground = CRAB_GROUND_Y
    const plate = CRAB_PLATE_Y
    const plateHalf = crabPlateHalf(sim.fever > 0, sim.tick)
    const headY = plate + 44
    const shake = hurtFlash > 0 ? Math.sin(hurtFlash * 60) * 5 : 0
    const x = sim.heroX + shake
    const hipY = ground - 42
    ctx.save()
    line(4)
    ctx.beginPath()
    ctx.moveTo(x, headY + 26)
    ctx.lineTo(x, hipY)
    ctx.moveTo(x, hipY)
    ctx.lineTo(x - 15, ground)
    ctx.moveTo(x, hipY)
    ctx.lineTo(x + 15, ground)
    ctx.moveTo(x, headY + 36)
    ctx.lineTo(x - plateHalf * 0.72, plate + 4)
    ctx.moveTo(x, headY + 36)
    ctx.lineTo(x + plateHalf * 0.72, plate + 4)
    ctx.stroke()
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(x, headY, 26, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // 만화 주인공의 곱슬머리
    line(3)
    for (let curl = -2; curl <= 2; curl += 1) {
      ctx.beginPath()
      ctx.arc(x + curl * 10, headY - 27, 5.5, Math.PI * 0.9, Math.PI * 2.2)
      ctx.stroke()
    }
    ctx.fillStyle = INK
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(x + side * 9, headY - 3, 2.8, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.beginPath()
    if (hurtFlash > 0) ctx.arc(x, headY + 14, 7, Math.PI + 0.3, -0.3)
    else ctx.arc(x, headY + 7, 8, 0.3, Math.PI - 0.3)
    ctx.stroke()

    // 받은 게가 쌓이는 쟁반
    ctx.fillStyle = sim.fever > 0 ? '#FFD97A' : '#FFFFFF'
    line(4)
    ctx.beginPath()
    ctx.ellipse(x, plate, plateHalf, 11, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    const pile = Math.min(sim.crabs, 3)
    for (let index = 0; index < pile; index += 1) {
      drawCrab(x + (index - (pile - 1) / 2) * 30, plate - 12, 0, 0.55)
    }
    ctx.restore()
  }

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, CRAB_FIELD_WIDTH, CRAB_FIELD_HEIGHT)
    ctx.clip()
    ctx.fillStyle = hurtFlash > 0 ? '#FFE3E3' : sim.fever > 0 ? '#FFF4CC' : '#FFFFFF'
    ctx.fillRect(0, 0, CRAB_FIELD_WIDTH, CRAB_FIELD_HEIGHT)
    // 만화 칸처럼 바닥선을 긋는다.
    line(4)
    ctx.beginPath()
    ctx.moveTo(0, CRAB_GROUND_Y)
    ctx.lineTo(CRAB_FIELD_WIDTH, CRAB_GROUND_Y)
    ctx.stroke()
    for (const item of sim.items) {
      const phase = sim.tick * 0.15 + item.id
      if (item.kind === 'crab') drawCrab(item.x, item.y, phase)
      else if (item.kind === 'star') drawStar(item.x, item.y, phase)
      else drawTablet(item.x, item.y, phase)
    }
    drawHero()
    ctx.textAlign = 'center'
    for (const floater of floaters) {
      ctx.font = `${floater.big ? 38 : 22}px Jua`
      ctx.globalAlpha = Math.max(1 - floater.age / (floater.big ? 1.4 : 0.9), 0)
      ctx.fillStyle = floater.big ? '#C2410C' : INK
      ctx.fillText(floater.text, floater.x, floater.y)
    }
    ctx.globalAlpha = 1
    ctx.restore()
    // 판의 경계가 보여야 어디까지 움직일 수 있는지 안다.
    line(4)
    ctx.strokeRect(0, 0, CRAB_FIELD_WIDTH, CRAB_FIELD_HEIGHT)
  }

  const tick = (now: number) => {
    const seconds = Math.min((now - last) / 1000, MAX_FRAME_SECONDS)
    last = now
    if (!ended) update(seconds)
    draw()
    if (!ended) frame = requestAnimationFrame(tick)
  }
  reportStatus()
  frame = requestAnimationFrame(tick)

  return () => {
    ended = true
    cancelAnimationFrame(frame)
    observer.disconnect()
    canvas.removeEventListener('pointerdown', handlePointer)
    canvas.removeEventListener('pointermove', handlePointer)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    window.removeEventListener('blur', releaseKeys)
  }
}
