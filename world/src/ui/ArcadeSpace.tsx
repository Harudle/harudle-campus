import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import { ARCADE_ROOMS, type ArcadeRoomId } from '../data/arcadeQuizzes'
import { usePresence } from '../data/presence'
import { useUserQuizzes } from '../data/userQuizzes'
import { HUB_DOOR_ID, LOBBY_DOOR_ID } from '../scene/arcade/layout'
import type { JoystickInput } from '../scene/gallery/Player'
import { ArcadeHud } from './ArcadeHud'
import { ActionButtons } from './ActionButtons'
import { AvatarCustomizer } from './AvatarCustomizer'
import { ChatPanel } from './ChatPanel'
import { ControlsGuide, useControlsGuide } from './ControlsGuide'
import { useDoorPrompt } from './DoorPrompt'
import { RegisterQuizModal } from './RegisterQuizModal'
import { TouchJoystick } from './TouchJoystick'
import { UserQuizModal } from './UserQuizModal'
import { useVisitor } from './useVisitor'

const ArcadeCanvas = lazy(() => import('../scene/arcade/ArcadeCanvas'))

const HUB_ROOM = 'arcade'

type ArcadeSpaceProps = {
  webgl: boolean
  /** 들어와 있는 퀴즈 방. null이면 입구 홀이다. */
  roomId: ArcadeRoomId | null
  onEnterRoom: (id: ArcadeRoomId) => void
  onLeaveRoom: () => void
  onExit: () => void
}

export function ArcadeSpace({ webgl, roomId, onEnterRoom, onLeaveRoom, onExit }: ArcadeSpaceProps) {
  const { avatar, nickname, customizing, setCustomizing, firstVisit, settings, confirmAvatar } = useVisitor()
  const [userQuizId, setUserQuizId] = useState<number | null>(null)
  const [registering, setRegistering] = useState(false)
  const board = useUserQuizzes(roomId)
  const userQuiz = board.items.find((item) => item.id === userQuizId) ?? null
  const joystick = useRef<JoystickInput>({ x: 0, y: 0 })
  const guide = useControlsGuide()
  const presenceRoom = roomId ? `${HUB_ROOM}-${roomId}` : HUB_ROOM
  const { status, others, total, positions, sendMove, chat, speech, mySpeech, play, hitNotice } = usePresence(webgl && !firstVisit, avatar, settings.doodleFollows, presenceRoom, nickname)

  const handleDoor = useCallback(
    (id: string) => {
      if (id === LOBBY_DOOR_ID) onExit()
      else if (id === HUB_DOOR_ID) onLeaveRoom()
      else onEnterRoom(id as ArcadeRoomId)
    },
    [onEnterRoom, onExit, onLeaveRoom],
  )

  const describeDoor = (doorId: string) => {
    if (doorId === LOBBY_DOOR_ID) return '로비로'
    if (doorId === HUB_DOOR_ID) return '오락실 입구로'
    const room = ARCADE_ROOMS.find((candidate) => candidate.id === doorId)
    return room ? `${room.title}으로` : '다음 방으로'
  }
  const { requestDoor, doorPrompt, doorPromptOpen } = useDoorPrompt(handleDoor, describeDoor)

  const handleRegistered = useCallback(
    (room: ArcadeRoomId) => {
      setRegistering(false)
      // 다른 방에 걸었으면 그 방으로 가서 걸린 것을 보여 준다.
      if (room === roomId) board.reload()
      else onEnterRoom(room)
    },
    [board, onEnterRoom, roomId],
  )

  const modals = (
    <>
      <UserQuizModal quiz={userQuiz} board={board} onClose={() => setUserQuizId(null)} />
      <RegisterQuizModal open={registering} defaultRoom={roomId} onRegistered={handleRegistered} onClose={() => setRegistering(false)} />
    </>
  )

  const hud = (
    <ArcadeHud
      roomId={roomId}
      presenceStatus={webgl ? status : 'offline'}
      visitorCount={total}
      walkable={webgl}
      onEnterRoom={onEnterRoom}
      onLeaveRoom={onLeaveRoom}
      userQuizzes={board.items}
      onOpenUserQuiz={setUserQuizId}
      onRegister={() => setRegistering(true)}
      onCustomize={() => setCustomizing(true)}
      onOpenGuide={guide.show}
      onExit={onExit}
    />
  )

  // WebGL이 없으면 3D 공간 없이 버튼으로 퀴즈만 푼다.
  if (!webgl) {
    return (
      <>
        {hud}
        {modals}
      </>
    )
  }

  return (
    <>
      <Suspense fallback={null}>
        <ArcadeCanvas
          roomId={roomId}
          avatar={avatar}
          nickname={nickname}
          doodleFollows={settings.doodleFollows}
          others={others.filter((player) => player.room === presenceRoom)}
          speech={speech}
          mySpeech={mySpeech}
          play={play}
          positions={positions}
          onMove={sendMove}
          paused={customizing || userQuiz !== null || registering || doorPromptOpen}
          joystick={joystick}
          userQuizzes={board.items}
          onOpenUserQuiz={setUserQuizId}
          onRegister={() => setRegistering(true)}
          onExit={requestDoor}
        />
      </Suspense>
      {hud}
      {doorPrompt}
      <TouchJoystick input={joystick} onUse={guide.dismissHint} />
      <ActionButtons controls={joystick} throwRequest={play.throwRequest} hitNotice={hitNotice} />
      <ChatPanel chat={chat} />
      <ControlsGuide guide={guide} tip={roomId ? '액자를 누르면 문제를 풀고, 빈 액자에 내 문제를 걸 수 있어요.' : '문을 누르거나 걸어가면 퀴즈 방에 들어가요.'} />
      {modals}
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
