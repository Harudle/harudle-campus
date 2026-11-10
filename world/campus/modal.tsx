// 캠퍼스 전용: 14층 방에 걸린 월드 내용을 눌렀을 때 그 창만 띄운다(월드 3D 공간 없이).
// 주소의 #으로 무엇을 열지 정한다: #scoop · #author · #artwork=<피드 id> · #relay=<화 번호> · #relay-new · #quiz=<id>&room=<방> · #register=<방>
// 전시관: #phone · #sketchbook · #easel(함께 그리는 이젤) · #crab(그림 속 게임) · #cheers=<작가 id>&name=<닉네임> · #album=<작가 id>&name=<닉네임>(작가 작품 앨범북)
// 창을 닫으면 CLOSED, 새로 올리거나 걸면 CHANGED를 캠퍼스에 알린다.
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/jua/400.css'
import '@fontsource/gowun-dodum/400.css'
import '../src/index.css'
import { ARCADE_ROOMS, type ArcadeRoomId } from '../src/data/arcadeQuizzes'
import { DEFAULT_AVATAR, loadAvatar } from '../src/data/avatar'
import { useCheers } from '../src/data/cheers'
import { EASEL_ROOM } from '../src/data/easel'
import { useExhibition } from '../src/data/galleryWorks'
import { loadNickname } from '../src/data/nickname'
import { CRAB_GAME_WORK_ID } from '../src/data/paintingGames'
import { usePresence } from '../src/data/presence'
import { EASEL_BRUSH_HOME } from '../src/scene/gallery/layout'
import { drawFrame, drawPaper } from '../src/scene/gallery/easelDrawing'
import { CheerBoardModal } from '../src/ui/CheerBoardModal'
import { EaselCanvasModal } from '../src/ui/EaselCanvasModal'
import { HarudlePhoneModal } from '../src/ui/HarudlePhoneModal'
import { PaintingGame } from '../src/ui/PaintingGame'
import { SketchbookModal } from '../src/ui/SketchbookModal'
import { useRelayEpisodes } from '../src/data/relayEpisodes'
import { useUserQuizzes } from '../src/data/userQuizzes'
import { ArtworkModal } from '../src/ui/ArtworkModal'
import { AlbumBookModal } from './AlbumBookModal'
import { AuthorBoothModal } from '../src/ui/AuthorBoothModal'
import { RegisterEpisodeModal } from '../src/ui/RegisterEpisodeModal'
import { RegisterQuizModal } from '../src/ui/RegisterQuizModal'
import { RelayViewerModal } from '../src/ui/RelayViewerModal'
import { ScoopModal } from '../src/ui/ScoopModal'
import { UserQuizModal } from '../src/ui/UserQuizModal'

const CLOSED = 'harudle-world:closed'
const CHANGED = 'harudle-world:changed'
/** 작가 전시실 작품까지 찾도록 받은 작품을 모두 쓴다 */
const ARTWORK_COUNT = 1000

function tell(message: string) {
  if (window.parent !== window) window.parent.postMessage(message, window.location.origin)
}
const close = () => tell(CLOSED)

function readView() {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const roomOf = (value: string | null) => (ARCADE_ROOMS.some((room) => room.id === value) ? (value as ArcadeRoomId) : 'song')
  return {
    scoop: params.has('scoop'),
    author: params.has('author'),
    artwork: params.get('artwork'),
    relay: params.has('relay') ? Number(params.get('relay')) || 1 : null,
    relayNew: params.has('relay-new'),
    quiz: params.has('quiz') ? Number(params.get('quiz')) : null,
    register: params.has('register') ? roomOf(params.get('register')) : null,
    room: roomOf(params.get('room')),
    phone: params.has('phone'),
    sketchbook: params.has('sketchbook'),
    easel: params.has('easel'),
    crab: params.has('crab'),
    cheers: params.get('cheers'),
    album: params.get('album'),
    name: params.get('name') ?? '',
  }
}

function Artwork({ id }: { id: string }) {
  const { exhibition, status } = useExhibition(ARTWORK_COUNT, 0, 0)
  const work = exhibition.mainWorks.find((item) => item.id === id) ?? null
  if (status === 'failed') close()
  return <ArtworkModal work={work} onClose={close} />
}

/** 작가 작품 앨범북: 그 작가의 받은 만화를 모두 넘겨 본다 */
function Album({ id, name }: { id: string; name: string }) {
  const { exhibition, status } = useExhibition(0, ARTWORK_COUNT, ARTWORK_COUNT)
  const zone = exhibition.zones.find((item) => item.authorId === id) ?? null
  return <AlbumBookModal zone={zone} name={name} status={status} onClose={close} />
}

function Cheers({ id, name }: { id: string; name: string }) {
  const cheers = useCheers(id)
  // 글을 남기거나 지우면 캠퍼스에 알려, 작가 작품 자리의 방명록 판에 붙은 쪽지를 새로 그리게 한다
  const board = {
    ...cheers,
    post: async (nickname: string, message: string) => {
      const result = await cheers.post(nickname, message)
      if (result === 'ok') tell(CHANGED)
      return result
    },
    remove: async (cheerId: number) => {
      const removed = await cheers.remove(cheerId)
      if (removed) tell(CHANGED)
      return removed
    },
  }
  return <CheerBoardModal open artist={name} board={board} onClose={close} />
}

/** 그림 속 꽃게 게임. 월드처럼 그 그림의 컷으로 이야기를 보여 주고 게임을 한다 */
function Crab() {
  const { exhibition, status } = useExhibition(ARTWORK_COUNT, 0, 0)
  const work = exhibition.mainWorks.find((item) => item.id === CRAB_GAME_WORK_ID) ?? null
  if (status === 'failed' || (status === 'ready' && !work)) {
    return <Notice text="그림을 불러오지 못했어요. 잠시 뒤에 다시 와 주세요." />
  }
  return <PaintingGame open={Boolean(work)} work={work} nickname={loadNickname() ?? '방문자'} onExit={close} />
}

function Notice({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-[rgb(43_33_64/0.45)] p-4" onClick={(event) => event.target === event.currentTarget && close()}>
      <section role="dialog" aria-modal="true" className="w-full max-w-sm rounded-3xl border-3 border-ink bg-paper p-5 text-center shadow-[6px_6px_0_var(--color-ink)]">
        <p className="font-display text-lg text-ink">{text}</p>
        {children}
        <button type="button" onClick={close} className="mt-4 min-h-11 cursor-pointer rounded-full border-2 border-ink bg-white px-5 py-2 font-display text-haru-600 shadow-[3px_3px_0_var(--color-ink)]">
          닫기
        </button>
      </section>
    </div>
  )
}

/**
 * 메인 전시실의 함께 그리는 네컷 이젤. 월드와 같은 실시간 이젤(EASEL_ROOM)에 붙어서, 붓이 비어 있으면 줍고 그림판을 연다.
 * 서버는 붓 가까이에 있어야 줍고 이젤 가까이에 있어야 그리게 하므로, 보이지 않는 자리 표시로 붓 → 이젤 앞으로 옮긴다.
 */
function Easel() {
  const [avatar] = useState(() => loadAvatar() ?? DEFAULT_AVATAR)
  const [nickname] = useState(() => loadNickname() ?? '방문자')
  const { status, easel, easelArt, sendEasel, sendMove, play, others } = usePresence(true, avatar, false, EASEL_ROOM, nickname)
  const [color, setColor] = useState(1)
  const [size, setSize] = useState(1)
  const picked = useRef(false)
  const holding = easel !== null && play.myId !== null && easel.holder === play.myId
  const holderName = easel?.holder != null && !holding ? (others.find((player) => player.id === easel.holder)?.nickname ?? '다른 방문자') : null
  const stand = (x: number, z: number) => sendMove({ x, z, heading: 0, moving: false, seated: false, jumping: false, doubleJumped: false })

  useEffect(() => {
    if (status !== 'online' || play.myId === null || !easel) return
    if (holding) {
      stand(EASEL_BRUSH_HOME.x, EASEL_BRUSH_HOME.z)
      return
    }
    if (easel.holder === null && !picked.current) {
      picked.current = true
      stand(easel.x, easel.z)
      window.setTimeout(() => sendEasel({ t: 'easel-pick' }), 250)
      window.setTimeout(() => { picked.current = false }, 1500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, play.myId, easel, holding])

  const finish = () => {
    if (holding) sendEasel({ t: 'easel-drop' })
    tell(CHANGED)
    window.setTimeout(close, 150)
  }

  if (status === 'offline' || status === 'full') return <Notice text="지금은 이젤에 연결하지 못했어요. 잠시 뒤에 다시 와 주세요." />
  if (holding)
    return (
      <EaselCanvasModal
        open
        art={easelArt}
        color={color}
        size={size}
        onColorChange={setColor}
        onSizeChange={setSize}
        onDraw={(segment) => sendEasel({ t: 'easel-draw', ...segment })}
        onFull={() => window.alert('종이가 가득 찼어요. 새 종이로 바꿔 주세요')}
        onClear={() => {
          if (window.confirm('다 같이 그린 그림을 스케치북에 넘기고 새 종이로 바꿀까요?')) sendEasel({ t: 'easel-clear' })
        }}
        onClose={finish}
      />
    )
  if (holderName)
    return (
      <Notice text={`지금 ${holderName}님이 붓을 들고 그리는 중이에요. 다 그리면 이어서 그릴 수 있어요.`}>
        <EaselPreview art={easelArt} />
      </Notice>
    )
  return <Notice text="이젤 붓을 집는 중이에요…" />
}

function EaselPreview({ art }: { art: { segments: { current: Parameters<typeof drawPaper>[2] }; version: number } }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    drawPaper(ctx, 320, art.segments.current ?? [])
    drawFrame(ctx, 320)
  }, [art])
  return <canvas ref={canvas} width={320} height={320} aria-label="지금 이젤 그림" className="mx-auto mt-3 aspect-square w-full max-w-64 rounded-lg border-2 border-ink" />
}

function Relay({ start, drawing }: { start: number | null; drawing: boolean }) {
  const { episodes, reload, remove, report } = useRelayEpisodes()
  const [registering, setRegistering] = useState(drawing)
  const latest = episodes.at(-1) ?? null
  return (
    <>
      <RelayViewerModal
        episodes={episodes}
        startEpisode={registering ? null : start}
        onDrawNext={() => setRegistering(true)}
        onRemove={async (id) => {
          const result = await remove(id)
          if (result === 'ok') tell(CHANGED)
          return result
        }}
        onReport={report}
        // 이어 그리기로 넘어가면 보기 창이 닫히면서 close 이벤트가 온다. 그때 캠퍼스 창까지 닫지 않고 올리기 화면을 띄운다
        onClose={registering ? () => {} : close}
      />
      <RegisterEpisodeModal
        open={registering}
        latest={latest}
        onRegistered={() => {
          reload()
          tell(CHANGED)
          close()
        }}
        onClose={() => (start === null ? close() : setRegistering(false))}
      />
    </>
  )
}

function Quiz({ id, room }: { id: number; room: ArcadeRoomId }) {
  const board = useUserQuizzes(room)
  const quiz = board.items.find((item) => item.id === id) ?? null
  return (
    <UserQuizModal
      quiz={quiz}
      board={board}
      onClose={() => {
        tell(CHANGED)
        close()
      }}
    />
  )
}

function CampusModal() {
  const view = useMemo(readView, [])
  if (view.scoop) return <ScoopModal open onClose={close} />
  if (view.phone) return <HarudlePhoneModal open onClose={close} />
  if (view.sketchbook) return <SketchbookModal open onClose={close} />
  if (view.easel) return <Easel />
  if (view.crab) return <Crab />
  if (view.album) return <Album id={view.album} name={view.name} />
  if (view.cheers) return <Cheers id={view.cheers} name={view.name} />
  if (view.author) return <AuthorBoothModal open onClose={close} />
  if (view.artwork) return <Artwork id={view.artwork} />
  if (view.relay !== null || view.relayNew) return <Relay start={view.relay} drawing={view.relayNew} />
  if (view.quiz !== null) return <Quiz id={view.quiz} room={view.room} />
  if (view.register)
    return (
      <RegisterQuizModal
        open
        defaultRoom={view.register}
        onRegistered={() => {
          tell(CHANGED)
          close()
        }}
        onClose={close}
      />
    )
  close()
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CampusModal />
  </StrictMode>,
)
