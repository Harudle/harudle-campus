const MUTED_KEY = 'harudle-world.game-muted'
const STEP_SECONDS = 60 / 150 / 2
const LOOKAHEAD_SECONDS = 0.25
const TICK_MS = 80

// 음 높이는 MIDI 번호이고 0은 쉼표다. 이 게임을 위해 새로 쓴 곡이라 저작권 걱정이 없다.
const LEAD = [
  72, 0, 76, 79, 81, 0, 79, 76, 77, 0, 74, 77, 76, 72, 74, 0,
  72, 0, 76, 79, 84, 0, 81, 79, 77, 79, 81, 77, 79, 0, 0, 0,
  81, 0, 79, 76, 77, 0, 76, 74, 76, 0, 74, 72, 74, 76, 77, 0,
  79, 0, 81, 79, 77, 76, 74, 76, 72, 0, 74, 0, 72, 0, 0, 0,
]
const BASS_ROOTS = [48, 41, 43, 48, 45, 41, 43, 48]

function loadMuted() {
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

function saveMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTED_KEY, muted ? '1' : '0')
  } catch {
    // 저장하지 못해도 이번 판에는 그대로 적용된다.
  }
}

function frequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12)
}

export type EffectName = 'catch' | 'star' | 'hurt' | 'win' | 'lose' | 'dive'

/** 음원 파일 없이 브라우저에서 바로 만드는 BGM과 효과음. 소리는 사용자가 누른 뒤에만 시작할 수 있다. */
export function createGameAudio() {
  let context: AudioContext | null = null
  let master: GainNode | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let step = 0
  let nextStepAt = 0
  let muted = loadMuted()

  const tone = (type: OscillatorType, note: number, at: number, length: number, volume: number) => {
    if (!context || !master) return
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.value = frequency(note)
    gain.gain.setValueAtTime(volume, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + length)
    oscillator.connect(gain).connect(master)
    oscillator.start(at)
    oscillator.stop(at + length)
  }

  const schedule = () => {
    if (!context) return
    while (nextStepAt < context.currentTime + LOOKAHEAD_SECONDS) {
      const lead = LEAD[step % LEAD.length]
      if (lead) tone('square', lead, nextStepAt, STEP_SECONDS * 1.5, 0.07)
      if (step % 2 === 0) {
        const root = BASS_ROOTS[Math.floor(step / 8) % BASS_ROOTS.length]
        tone('triangle', step % 4 === 0 ? root : root + 7, nextStepAt, STEP_SECONDS * 1.8, 0.16)
      }
      if (step % 4 === 2) tone('square', 96, nextStepAt, 0.03, 0.015)
      step += 1
      nextStepAt += STEP_SECONDS
    }
  }

  return {
    /** 누르거나 키를 칠 때마다 불러 소리를 깨운다. */
    unlock() {
      if (!context) {
        const AudioContextClass = window.AudioContext
        if (!AudioContextClass) return
        context = new AudioContextClass()
        master = context.createGain()
        master.gain.value = muted ? 0 : 1
        master.connect(context.destination)
      }
      if (context.state === 'suspended') void context.resume()
    },
    startMusic() {
      if (!context || timer) return
      step = 0
      nextStepAt = context.currentTime + 0.05
      schedule()
      timer = setInterval(schedule, TICK_MS)
    },
    stopMusic() {
      if (timer) clearInterval(timer)
      timer = null
    },
    effect(name: EffectName) {
      if (!context) return
      const now = context.currentTime
      const melody: Record<EffectName, number[]> = {
        catch: [84, 88],
        star: [79, 84, 88, 91],
        hurt: [52, 47],
        win: [72, 76, 79, 84, 88],
        lose: [67, 64, 60, 55],
        dive: [60, 67, 72, 79, 84],
      }
      melody[name].forEach((note, index) => tone('square', note, now + index * 0.07, 0.14, 0.09))
    },
    isMuted: () => muted,
    setMuted(next: boolean) {
      muted = next
      saveMuted(next)
      if (master) master.gain.value = next ? 0 : 1
    },
    close() {
      if (timer) clearInterval(timer)
      timer = null
      void context?.close()
      context = null
      master = null
    },
  }
}

export type GameAudio = ReturnType<typeof createGameAudio>
