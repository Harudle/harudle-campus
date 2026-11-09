import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCheers } from '../data/cheers'
import { EASEL_PALETTE, type EaselSegment } from '../data/easel'
import { usePresence } from '../data/presence'
import { isImageUrlExpired, useExhibition, type GalleryWork } from '../data/galleryWorks'
import { CRAB_GAME_WORK_ID } from '../data/paintingGames'
import {
  ARTIST_ROOM_COUNT,
  artistDoorPosition,
  FACING_FRONT_WALL,
  LOBBY_DOOR_Z,
  MAIN_SLOTS,
  MAX_ROOM_WORKS,
  roomLayout,
  zoneColor,
  type DoorSpot,
} from '../scene/gallery/layout'
import type { EaselNear } from '../scene/gallery/EaselCorner'
import type { JoystickInput, Jump } from '../scene/gallery/Player'
import { ArtworkModal } from './ArtworkModal'
import { AuthorBoothModal } from './AuthorBoothModal'
import { ActionButtons } from './ActionButtons'
import { AvatarCustomizer } from './AvatarCustomizer'
import { ChatPanel } from './ChatPanel'
import { ControlsGuide, useControlsGuide } from './ControlsGuide'
import { useDoorPrompt } from './DoorPrompt'
import { CheerBoardModal } from './CheerBoardModal'
import { EaselCanvasModal } from './EaselCanvasModal'
import { EaselHud } from './EaselHud'
import { SketchbookModal } from './SketchbookModal'
import { GalleryHud } from './GalleryHud'
import { HarudlePhoneModal } from './HarudlePhoneModal'
import { PaintingGame } from './PaintingGame'
import { TouchJoystick } from './TouchJoystick'
import { useVisitor } from './useVisitor'

const GalleryCanvas = lazy(() => import('../scene/gallery/GalleryCanvas'))

const MAIN_ROOM = 'main'
const LOBBY_DOOR_ID = 'lobby'
const DOOR_RETURN_GAP = 2.8
const PAINTING_RETURN_GAP = 5

type PaintingStage = 'idle' | 'diving' | 'inside'

export function GallerySpace({ onExit }: { onExit: () => void }) {
  const { exhibition, status, refresh } = useExhibition(MAIN_SLOTS.length, ARTIST_ROOM_COUNT, MAX_ROOM_WORKS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { avatar, nickname, customizing, setCustomizing, firstVisit, settings, changeSettings, confirmAvatar } = useVisitor()
  const [overview, setOverview] = useState(false)
  const [room, setRoom] = useState(MAIN_ROOM)
  const [jump, setJump] = useState<Jump | null>(null)
  const jumpCount = useRef(0)
  const joystick = useRef<JoystickInput>({ x: 0, y: 0 })
  const guide = useControlsGuide()
  const [cheersOpen, setCheersOpen] = useState(false)
  const [boothOpen, setBoothOpen] = useState(false)
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [paintingStage, setPaintingStage] = useState<PaintingStage>('idle')
  const [nearPainting, setNearPainting] = useState(false)
  const [easelNear, setEaselNear] = useState<EaselNear>({ brush: false, easel: false })
  const [easelColor, setEaselColor] = useState(1)
  const [easelSize, setEaselSize] = useState(1)
  const [easelOpen, setEaselOpen] = useState(false)
  const [sketchbookOpen, setSketchbookOpen] = useState(false)
  const droppingEasel = useRef(false)

  // 꾸미기를 마친 뒤에 입장해야 다른 방문자에게 완성된 모습으로 보인다.
  const {
    status: presenceStatus,
    others,
    total,
    positions,
    sendMove,
    chat,
    speech,
    mySpeech,
    play,
    hitNotice,
    easel,
    easelArt,
    sendEasel,
    notify,
  } = usePresence(!firstVisit, avatar, settings.doodleFollows, room, nickname)
  // 이젤 붓을 든 사람은 다른 소품 대신 붓을 든 모습으로 보인다.
  const easelHolder = easel?.holder ?? null
  const holdingEaselBrush = easelHolder !== null && easelHolder === play.myId
  const othersHere = useMemo(
    () =>
      others
        .filter((player) => player.room === room)
        .map((player) => (player.id === easelHolder ? { ...player, avatar: { ...player.avatar, held: 'brush' as const, heldColor: EASEL_PALETTE[7], easelBrush: true } } : player)),
    [others, room, easelHolder],
  )
  const shownAvatar = useMemo(
    () => (holdingEaselBrush ? { ...avatar, held: 'brush' as const, heldColor: EASEL_PALETTE[easelColor], easelBrush: true } : avatar),
    [avatar, holdingEaselBrush, easelColor],
  )
  const easelHolderName = others.find((player) => player.id === easelHolder)?.nickname ?? ''
  const pickEaselBrush = useCallback(() => sendEasel({ t: 'easel-pick' }), [sendEasel])
  const openEaselCanvas = useCallback(() => setEaselOpen(true), [])
  const notifyEaselFull = useCallback(() => notify('종이가 가득 찼어요. 새 종이로 바꿔 주세요'), [notify])
  const drawEasel = useCallback((segment: EaselSegment) => sendEasel({ t: 'easel-draw', ...segment }), [sendEasel])
  const dropEaselBrush = () => {
    droppingEasel.current = true
    setEaselOpen(false)
    sendEasel({ t: 'easel-drop' })
  }
  // 붓을 주운 순간에 어떻게 쓰는지 알려 준다.
  // 붓을 놓치면(종이에 맞았을 때 등) 그림판을 닫는다. 그리던 선은 그림판이 닫히며 마저 보내져 이젤에 남는다.
  const wasHolding = useRef(false)
  useEffect(() => {
    if (holdingEaselBrush) {
      notify('붓을 주웠어요! 이젤을 누르면 그림판이 열려요')
    } else if (wasHolding.current) {
      setEaselOpen(false)
      if (!droppingEasel.current) notify('붓을 놓쳤어요! 그리던 그림은 이젤에 그대로 남아 있어요')
    }
    wasHolding.current = holdingEaselBrush
    droppingEasel.current = false
  }, [holdingEaselBrush, notify])
  // 바닥의 붓 가까이에 서 있으면 스페이스로 줍는다. 점프보다 먼저 받아서 그 자리에서 뛰지 않게 한다.
  const canPickWithSpace = room === MAIN_ROOM && !overview && easelNear.brush && !holdingEaselBrush
  useEffect(() => {
    if (!canPickWithSpace) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || document.querySelector('dialog[open]')) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      // 키보드로 버튼을 골라 둔 때는 그 버튼을 누르게 둔다.
      if (target instanceof HTMLElement && target !== document.body && target.tagName !== 'CANVAS' && target.matches(':focus-visible')) return
      event.preventDefault()
      event.stopPropagation()
      pickEaselBrush()
    }
    window.addEventListener('keydown', handleKey, { capture: true })
    return () => window.removeEventListener('keydown', handleKey, { capture: true })
  }, [canPickWithSpace, pickEaselBrush])
  const clearEasel = () => {
    if (window.confirm('다 같이 그린 그림을 스케치북에 넘기고 새 종이로 바꿀까요?')) sendEasel({ t: 'easel-clear' })
  }

  const zoneIndex = exhibition.zones.findIndex((zone) => zone.authorId === room)
  const zone = zoneIndex >= 0 ? exhibition.zones[zoneIndex] : null
  const works = zone ? zone.works : exhibition.mainWorks
  const workCount = zone?.works.length
  const currentRoom = useMemo(() => (workCount === undefined ? null : roomLayout(workCount)), [workCount])
  const cheers = useCheers(zone?.authorId ?? null)
  const selected = works.find((work) => work.id === selectedId) ?? null

  // 뛰어들 수 있는 그림은 메인 전시실에 걸려 있을 때만 열린다. 순위가 바뀌면 그 그림이 걸린 자리로 따라간다.
  const paintingIndex = zone ? -1 : works.findIndex((work) => work.id === CRAB_GAME_WORK_ID)
  const paintingWork = paintingIndex >= 0 ? works[paintingIndex] : null
  const paintingSlot = paintingIndex >= 0 ? (MAIN_SLOTS[paintingIndex] ?? null) : null

  const startDive = useCallback(() => setPaintingStage((current) => (current === 'idle' ? 'diving' : current)), [])
  const enterPainting = useCallback(() => {
    setPaintingStage('inside')
    // 그림 이미지 주소는 15분짜리라 오래 머물렀으면 새로 받는다.
    if (paintingWork && isImageUrlExpired(paintingWork)) refresh()
  }, [paintingWork, refresh])
  const exitPainting = () => {
    setPaintingStage('idle')
    if (!paintingSlot) return
    // 마리오처럼 그림 앞으로 튀어나와 그림을 바라본다.
    const normalX = Math.sin(paintingSlot.rotationY)
    const normalZ = Math.cos(paintingSlot.rotationY)
    jumpCount.current += 1
    setJump({
      x: paintingSlot.position[0] + normalX * PAINTING_RETURN_GAP,
      z: paintingSlot.position[2] + normalZ * PAINTING_RETURN_GAP,
      faceX: -normalX,
      faceZ: -normalZ,
      nonce: jumpCount.current,
    })
  }
  // 뛰어드는 중 창이 바뀌어도 멈춰 있지 않게, 방을 옮기면 처음 상태로 돌린다.
  useEffect(() => {
    if (!paintingSlot) setPaintingStage('idle')
  }, [paintingSlot])

  const doors = useMemo<DoorSpot[]>(() => {
    if (currentRoom) return [currentRoom.exitDoor]
    return [
      { id: LOBBY_DOOR_ID, label: '로비로', x: 0, z: LOBBY_DOOR_Z, rotationY: FACING_FRONT_WALL },
      ...exhibition.zones.map((artist, index) => {
        const { x, z, rotationY } = artistDoorPosition(index)
        return { id: artist.authorId, label: '입장', plate: artist.nickname, color: zoneColor(index), x, z, rotationY }
      }),
    ]
  }, [currentRoom, exhibition.zones])

  const select = useCallback(
    (work: GalleryWork) => {
      setSelectedId(work.id)
      if (isImageUrlExpired(work)) refresh()
    },
    [refresh],
  )
  const closeWork = useCallback(() => setSelectedId(null), [])

  const goTo = useCallback(
    (target: string) => {
      if (target === LOBBY_DOOR_ID) {
        onExit()
        return
      }
      // 방을 옮기면 액자를 새로 올리므로 만료된 이미지 URL이 있으면 먼저 갱신한다.
      const nextZone = exhibition.zones.find((artist) => artist.authorId === target)
      const nextWorks = nextZone?.works ?? exhibition.mainWorks
      if (nextWorks.some(isImageUrlExpired)) refresh()

      jumpCount.current += 1
      const nonce = jumpCount.current
      setOverview(false)
      setRoom(target)
      if (target === MAIN_ROOM) {
        // 나온 문 앞에 서서 메인 전시실 쪽을 바라본다.
        const door = artistDoorPosition(Math.max(zoneIndex, 0))
        setJump({ x: door.x - door.side * DOOR_RETURN_GAP, z: door.z, faceX: -door.side, faceZ: 0, nonce })
      } else {
        // 방명록이 화면 가운데에 오도록 정확히 입구 중앙에서 시작한다.
        const { start } = roomLayout(nextWorks.length)
        setJump({ x: start.x, z: start.z, faceX: 0, faceZ: -1, nonce })
      }
    },
    [exhibition, onExit, refresh, zoneIndex],
  )

  const describeDoor = (doorId: string) => {
    if (doorId === LOBBY_DOOR_ID) return '로비로'
    if (doorId === MAIN_ROOM) return '메인 전시실로'
    const artist = exhibition.zones.find((candidate) => candidate.authorId === doorId)
    return artist ? `${artist.nickname} 작가의 방으로` : '다음 방으로'
  }
  const { requestDoor, doorPrompt, doorPromptOpen } = useDoorPrompt(goTo, describeDoor)

  return (
    <>
      <Suspense fallback={null}>
        <GalleryCanvas
          zone={zone}
          roomLayout={currentRoom}
          zoneColor={zoneColor(Math.max(zoneIndex, 0))}
          works={works}
          doors={doors}
          avatar={shownAvatar}
          nickname={nickname}
          doodleFollows={settings.doodleFollows}
          others={othersHere}
          speech={speech}
          mySpeech={mySpeech}
          play={play}
          positions={positions}
          onMove={sendMove}
          showWaitingFrames={status !== 'ready'}
          overview={overview}
          jump={jump}
          paused={Boolean(selected) || customizing || cheersOpen || boothOpen || phoneOpen || easelOpen || sketchbookOpen || doorPromptOpen || paintingStage !== 'idle'}
          onSelect={select}
          onDoor={requestDoor}
          joystick={joystick}
          cheers={cheers.items}
          cheerCount={cheers.total}
          onOpenCheers={() => setCheersOpen(true)}
          onOpenBooth={() => setBoothOpen(true)}
          onOpenPhone={() => setPhoneOpen(true)}
          easel={easel}
          easelArt={easelArt}
          easelHolderName={easelHolderName}
          onEaselPick={pickEaselBrush}
          onOpenEaselCanvas={openEaselCanvas}
          onEaselNear={setEaselNear}
          portalSlot={paintingSlot}
          diving={paintingStage === 'diving'}
          suspended={paintingStage === 'inside'}
          onPortalNear={setNearPainting}
          onDive={startDive}
          onEntered={enterPainting}
        />
      </Suspense>
      <GalleryHud
        zones={exhibition.zones}
        currentZone={zone}
        works={works}
        status={status}
        presenceStatus={presenceStatus}
        visitorCount={total}
        settings={settings}
        onSettingsChange={changeSettings}
        overview={overview}
        cheerCount={cheers.total}
        onOpenCheers={() => setCheersOpen(true)}
        onOpenBooth={() => setBoothOpen(true)}
        onOpenPhone={() => setPhoneOpen(true)}
        onCustomize={() => setCustomizing(true)}
        onOpenGuide={guide.show}
        onOverviewChange={setOverview}
        onRoomSelect={goTo}
        onBackToMain={() => goTo(MAIN_ROOM)}
        onExit={onExit}
        onRetry={refresh}
        onSelect={select}
      />
      {doorPrompt}
      {nearPainting && paintingStage === 'idle' && !overview && (
        <div className="pointer-events-none absolute top-20 right-0 left-0 z-10 flex justify-center px-4">
          <button
            type="button"
            onClick={startDive}
            className="pointer-events-auto min-h-11 cursor-pointer rounded-full border-2 border-ink bg-butter px-4 py-2 font-display text-ink shadow-[3px_3px_0_var(--color-ink)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
          >
            🖼️ 그림 속으로 뛰어들기
            <span className="pointer-coarse:hidden"> (Space)</span>
          </button>
        </div>
      )}
      {!zone && !overview && (
        <EaselHud
          holding={holdingEaselBrush}
          nearBrush={easelNear.brush}
          nearEasel={easelNear.easel}
          onPick={pickEaselBrush}
          onOpenCanvas={openEaselCanvas}
          onDrop={dropEaselBrush}
          onOpenSketchbook={() => setSketchbookOpen(true)}
        />
      )}
      <SketchbookModal open={sketchbookOpen} onClose={() => setSketchbookOpen(false)} />
      <EaselCanvasModal
        open={easelOpen && holdingEaselBrush}
        art={easelArt}
        color={easelColor}
        size={easelSize}
        onColorChange={setEaselColor}
        onSizeChange={setEaselSize}
        onDraw={drawEasel}
        onFull={notifyEaselFull}
        onClear={clearEasel}
        onClose={() => setEaselOpen(false)}
      />
      <TouchJoystick input={joystick} onUse={guide.dismissHint} />
      <ActionButtons controls={joystick} throwRequest={play.throwRequest} hitNotice={hitNotice} />
      <ChatPanel chat={chat} />
      <ControlsGuide guide={guide} tip="액자를 누르면 크게 보고, 벤치에 앉을 수 있어요. 문으로 걸어가면 작가 전시실에 들어가요. 빛나는 그림 앞에서 점프하면 그림 속 게임을 할 수 있어요! 큰 휴대폰 화면을 눌러 하루들을 바로 써 보거나, 옆 받침대로 크게 열 수 있어요. 바닥의 붓 가까이에서 스페이스로 붓을 줍고 이젤을 누르면 네컷 그림판에 함께 그릴 수 있어요." />
      <ArtworkModal work={selected} onClose={closeWork} />
      <AuthorBoothModal open={boothOpen} onClose={() => setBoothOpen(false)} />
      <HarudlePhoneModal open={phoneOpen} onClose={() => setPhoneOpen(false)} />
      <PaintingGame open={paintingStage === 'inside'} work={paintingWork} nickname={nickname} onExit={exitPainting} />
      {zone && (
        <CheerBoardModal open={cheersOpen} artist={zone.nickname} board={cheers} onClose={() => setCheersOpen(false)} />
      )}
      <AvatarCustomizer
        open={customizing}
        value={avatar}
        doodleFollows={settings.doodleFollows}
        nickname={nickname}
        firstVisit={firstVisit}
        onConfirm={confirmAvatar}
      />
    </>
  )
}
