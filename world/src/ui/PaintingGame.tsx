import { useEffect, useId, useRef, useState } from 'react'
import { startCrabGame, type CrabResult, type CrabStatus } from '../games/crabGame'
import { CRAB_GOAL, CRAB_START_HEARTS, CRAB_TIME_LIMIT } from '../games/crabSim'
import { createGameAudio, type GameAudio } from '../games/gameAudio'
import type { GalleryWork } from '../data/galleryWorks'
import { fetchCrabRanking, startCrabRun, submitCrabRun, type CrabRanking, type CrabRun, type CrabSubmitResult } from '../data/crabRanking'
import { CRAB_GAME_PANELS, type ComicPanel } from '../data/paintingGames'
import { useModalDialog } from './useModalDialog'

const BEST_KEY = 'harudle-world.crab-best'
const PRIMARY =
  'min-h-11 cursor-pointer rounded-xl border-2 border-ink bg-haru-600 px-5 py-2 font-display text-lg text-white shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600'
const SECONDARY =
  'min-h-11 cursor-pointer rounded-xl border-2 border-ink bg-white px-4 py-2 font-display text-haru-600 transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600'

const LOCAL_SEED_RANGE = 2 ** 31 - 1

type Stage = 'story' | 'ready' | 'play' | 'result'
type SubmitState = 'none' | 'sending' | 'done' | 'failed'

function loadBest() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function saveBest(score: number) {
  try {
    window.localStorage.setItem(BEST_KEY, String(score))
  } catch {
    // 저장하지 못해도 게임에는 영향이 없다.
  }
}

/** 네 컷 중 한 컷만 잘라 보여 준다. */
function Panel({ imageUrl, panel, alt }: { imageUrl: string; panel: ComicPanel; alt: string }) {
  return (
    <div
      role="img"
      aria-label={alt}
      className="mx-auto w-full max-w-[min(100%,calc(100dvh-16rem))] border-[3px] border-ink bg-white bg-no-repeat"
      style={{
        aspectRatio: `${panel.width} / ${panel.height}`,
        backgroundImage: `url("${imageUrl}")`,
        backgroundSize: `${100 / panel.width}% ${100 / panel.height}%`,
        backgroundPosition: `${(panel.x / (1 - panel.width)) * 100}% ${(panel.y / (1 - panel.height)) * 100}%`,
      }}
    />
  )
}

const STORY_ALT = [
  '첫째 컷: 주인공이 태블릿으로 만화 주인공 체리를 찾아보고 있어요.',
  '둘째 컷: 체리가 가장 좋아하는 음식은 무엇일까 궁금해해요.',
]

function RankingList({ ranking }: { ranking: CrabRanking }) {
  const meInTop = ranking.top.some((entry) => entry.mine)
  return (
    <section aria-label="랭킹" className="w-full max-w-sm rounded-xl border-2 border-ink bg-white p-3 text-left">
      <h3 className="font-display text-lg text-haru-600">🏆 랭킹 <span className="text-sm text-haru-800">{ranking.total}명 참가</span></h3>
      {ranking.top.length === 0 && <p className="mt-1 text-sm text-haru-800">아직 기록이 없어요. 첫 1위가 되어 보세요!</p>}
      <ol className="mt-1 max-h-44 overflow-y-auto text-sm">
        {ranking.top.map((entry) => (
          <li key={entry.rank} className={`flex items-center gap-2 rounded px-1 py-0.5 ${entry.mine ? 'bg-butter font-display' : ''}`}>
            <span className="w-7 shrink-0 text-right">{entry.rank}위</span>
            <span className="min-w-0 grow truncate">{entry.nickname}{entry.mine && ' (나)'}</span>
            <span className="shrink-0">{entry.score.toLocaleString()}점</span>
          </li>
        ))}
      </ol>
      {ranking.me && !meInTop && (
        <p className="mt-1 flex items-center gap-2 rounded bg-butter px-1 py-0.5 font-display text-sm">
          <span className="shrink-0">{ranking.me.rank}위</span>
          <span className="min-w-0 grow truncate">{ranking.me.nickname} (나)</span>
          <span className="shrink-0">{ranking.me.score.toLocaleString()}점</span>
        </p>
      )}
    </section>
  )
}

function CrabPlayfield({ audio, seed, onEnd }: { audio: GameAudio; seed: number; onEnd: (result: CrabResult) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<CrabStatus>({ score: 0, crabs: 0, combo: 0, hearts: CRAB_START_HEARTS, timeLeft: CRAB_TIME_LIMIT, stage: 1, fever: false })
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd

  useEffect(() => {
    if (!canvas.current) return
    return startCrabGame(canvas.current, {
      seed,
      onStatus: setStatus,
      onEnd: (result) => onEndRef.current(result),
      onEffect: audio.effect,
    })
  }, [audio, seed])

  return (
    <div className="flex min-h-0 grow flex-col">
      <p role="status" className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 px-4 py-1 font-display text-ink">
        <span className="text-xl text-haru-600">{status.score.toLocaleString()}점</span>
        <span>🦀 {status.crabs}{status.combo >= 2 && ` · ${status.combo}콤보`}</span>
        <span>{status.stage}단계</span>
        <span aria-label={`남은 기회 ${status.hearts}번`}>{'❤️'.repeat(Math.max(status.hearts, 0))}</span>
        <span>⏱ {status.timeLeft}초</span>
      </p>
      <canvas ref={canvas} aria-label="떨어지는 게를 쟁반으로 받는 게임" className="min-h-0 w-full grow touch-none" />
    </div>
  )
}

type PaintingGameProps = {
  open: boolean
  work: GalleryWork | null
  nickname: string
  onExit: () => void
}

/** 그림 속 세상. 만화의 앞 컷으로 이야기를 보고, 게임을 깨면 마지막 컷을 보여 준다. */
export function PaintingGame({ open, work, nickname, onExit }: PaintingGameProps) {
  const { dialogRef, contentRef } = useModalDialog(open)
  const titleId = useId()
  const [stage, setStage] = useState<Stage>('story')
  const [storyIndex, setStoryIndex] = useState(0)
  const [result, setResult] = useState<CrabResult | null>(null)
  const [best, setBest] = useState(loadBest)
  const [muted, setMuted] = useState(false)
  const [round, setRound] = useState(0)
  const [seed, setSeed] = useState(1)
  const [starting, setStarting] = useState(false)
  const [ranking, setRanking] = useState<CrabRanking | null>(null)
  const [submitState, setSubmitState] = useState<SubmitState>('none')
  const [submitted, setSubmitted] = useState<CrabSubmitResult | null>(null)
  const runRef = useRef<CrabRun | null>(null)
  const roundRef = useRef(0)
  const audioRef = useRef<GameAudio | null>(null)
  const primary = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const audio = createGameAudio()
    audioRef.current = audio
    setMuted(audio.isMuted())
    setStage('story')
    setStoryIndex(0)
    setResult(null)
    setSubmitted(null)
    setSubmitState('none')
    fetchCrabRanking().then(setRanking)
    // 점프 키로 들어온 경우 브라우저가 허락하면 바로 소리가 나고, 아니면 첫 버튼을 누를 때 시작한다.
    audio.unlock()
    audio.effect('dive')
    audio.startMusic()
    return () => {
      audio.close()
      audioRef.current = null
    }
  }, [open])

  // 키보드로 바로 넘길 수 있게 다음 버튼에 포커스를 둔다.
  useEffect(() => {
    if (open && stage !== 'play') primary.current?.focus()
  }, [open, stage, storyIndex])

  const wake = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.unlock()
    audio.startMusic()
  }

  const handleEnd = (next: CrabResult) => {
    setResult(next)
    setStage('result')
    if (next.score > best) {
      setBest(next.score)
      saveBest(next.score)
    }
    const run = runRef.current
    runRef.current = null
    if (!run) {
      setSubmitState('none')
      return
    }
    setSubmitState('sending')
    const thisRound = roundRef.current
    submitCrabRun(run, next.score, next.moves, nickname).then((response) => {
      if (roundRef.current !== thisRound) return
      setSubmitted(response)
      setSubmitState(response ? 'done' : 'failed')
      if (response) setRanking(response)
    })
  }

  const restart = async () => {
    if (starting) return
    setStarting(true)
    roundRef.current += 1
    const thisRound = roundRef.current
    const run = await startCrabRun()
    if (roundRef.current !== thisRound) return
    runRef.current = run
    setSeed(run?.seed ?? Math.floor(Math.random() * LOCAL_SEED_RANGE) + 1)
    setResult(null)
    setSubmitted(null)
    setSubmitState('none')
    setRound((current) => current + 1)
    setStarting(false)
    setStage('play')
  }

  const leave = () => {
    // 진행 중인 시작 요청이 나간 뒤에 게임을 열지 않게 한다.
    roundRef.current += 1
    runRef.current = null
    setStarting(false)
    onExit()
  }

  const audio = audioRef.current

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="painting-game m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-paper p-0 text-ink"
      onCancel={(event) => {
        event.preventDefault()
        leave()
      }}
      onPointerDownCapture={wake}
      onKeyDownCapture={wake}
    >
      <article ref={contentRef} tabIndex={-1} className="flex h-full flex-col outline-none">
        <header className="flex shrink-0 items-center justify-between gap-2 px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
          <h2 id={titleId} className="font-display text-xl text-haru-600">체리의 최애 요리</h2>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              aria-pressed={!muted}
              onClick={() => {
                const next = !muted
                setMuted(next)
                audio?.setMuted(next)
              }}
              className={SECONDARY}
            >
              {muted ? '🔇 음악 꺼짐' : '🔊 음악 켜짐'}
            </button>
            <button type="button" onClick={leave} className={SECONDARY}>
              나가기
            </button>
          </div>
        </header>

        {work && stage === 'story' && (
          <div className="flex min-h-0 grow flex-col items-center justify-center gap-3 overflow-y-auto p-4">
            <Panel imageUrl={work.imageUrl} panel={CRAB_GAME_PANELS[storyIndex]} alt={STORY_ALT[storyIndex]} />
            <button
              ref={primary}
              type="button"
              onClick={() => {
                if (storyIndex + 1 < STORY_ALT.length) setStoryIndex(storyIndex + 1)
                else setStage('ready')
              }}
              className={PRIMARY}
            >
              다음 컷 ▶
            </button>
          </div>
        )}

        {work && stage === 'ready' && (
          <div className="flex min-h-0 grow flex-col items-center gap-3 overflow-y-auto p-4 text-center">
            <div className="w-full max-w-56 shrink-0">
              <Panel imageUrl={work.imageUrl} panel={CRAB_GAME_PANELS[2]} alt="셋째 컷: 체리가 별 지팡이를 들고 노래하며 춤춰요." />
            </div>
            <div>
              <p className="font-display text-2xl text-haru-600">체리에게 줄 게를 겟해 주세요!</p>
              <p className="mt-1 text-sm">{CRAB_TIME_LIMIT}초 동안 뒤로 갈수록 빨라져요. 놓치지 않고 이어 받으면 콤보로 점수가 커지고, 별을 받으면 두 배예요. 태블릿은 피하세요! 게 {CRAB_GOAL}마리를 받으면 게찜이 완성돼요.</p>
              <p className="text-sm text-haru-800">
                <span className="pointer-coarse:hidden"><kbd className="font-display">A</kbd> 왼쪽, <kbd className="font-display">D</kbd> 오른쪽으로 움직여요.</span>
                <span className="hidden pointer-coarse:inline">화면을 밀어서 움직여요.</span>
                {' '}닉네임과 점수는 랭킹에 공개돼요.
              </p>
            </div>
            {ranking && <RankingList ranking={ranking} />}
            <button ref={primary} type="button" onClick={restart} disabled={starting} className={`${PRIMARY} disabled:opacity-60`}>
              게임 시작
            </button>
          </div>
        )}

        {stage === 'play' && audio && <CrabPlayfield key={round} audio={audio} seed={seed} onEnd={handleEnd} />}

        {work && stage === 'result' && result && (
          <div className="flex min-h-0 grow flex-col items-center gap-3 overflow-y-auto p-4 text-center">
            {result.won ? (
              <div className="w-full max-w-56 shrink-0">
                <Panel imageUrl={work.imageUrl} panel={CRAB_GAME_PANELS[3]} alt="마지막 컷: 주인공이 김이 나는 게찜 접시를 들고 웃어요." />
              </div>
            ) : (
              <p aria-hidden="true" className="text-6xl">🦀💨</p>
            )}
            <div role="status">
              <p className="font-display text-2xl text-haru-600">{result.won ? '게찜 완성! 겟지유!' : '게들이 도망갔어요…'}</p>
              <p className="mt-1 font-display text-xl">{result.score.toLocaleString()}점</p>
              <p className="text-sm">
                게 {result.crabs}마리 · 최고 콤보 {result.bestCombo}
                {submitted?.me && ` · ${submitted.isBest ? '새 최고 기록! ' : `내 최고 ${submitted.me.score.toLocaleString()}점, `}지금 ${submitted.me.rank}위`}
              </p>
              {submitState === 'sending' && <p className="text-sm text-haru-800">랭킹에 올리는 중이에요…</p>}
              {submitState === 'failed' && <p className="text-sm text-haru-800">이번 기록은 랭킹에 올리지 못했어요. 다시 도전해 주세요.</p>}
              {submitState === 'none' && <p className="text-sm text-haru-800">랭킹 서버에 연결되지 않아 연습 기록으로 남았어요. 내 최고 {Math.max(best, result.score).toLocaleString()}점</p>}
            </div>
            {ranking && <RankingList ranking={ranking} />}
            <div className="flex flex-wrap justify-center gap-2">
              <button ref={primary} type="button" onClick={restart} disabled={starting} className={`${PRIMARY} disabled:opacity-60`}>
                다시 도전
              </button>
              <button type="button" onClick={leave} className={SECONDARY}>
                그림 밖으로
              </button>
            </div>
            <a href={work.shareUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-haru-800 underline focus-visible:outline-3 focus-visible:outline-haru-600">
              원작: {work.nickname} 작가의 네컷만화 보기
            </a>
          </div>
        )}
      </article>
    </dialog>
  )
}
