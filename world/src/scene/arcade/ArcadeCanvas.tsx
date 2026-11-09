import { ARCADE_ROOMS, type ArcadeRoomId } from '../../data/arcadeQuizzes'
import type { UserQuiz } from '../../data/userQuizzes'
import type { WalkStageProps } from '../gallery/WalkStage'
import { WalkStage } from '../gallery/WalkStage'
import { ArcadeHub } from './ArcadeHub'
import { HUB_SPACE, HUB_START, hubDoors, QUIZ_ROOM_EXIT_DOOR, QUIZ_ROOM_SPACE, QUIZ_ROOM_START } from './layout'
import { QuizRoom } from './QuizRoom'

const HUB_DOORS = hubDoors(ARCADE_ROOMS)
const ROOM_DOORS = [QUIZ_ROOM_EXIT_DOOR]

type ArcadeCanvasProps = Omit<WalkStageProps, 'label' | 'space' | 'start' | 'doors' | 'children'> & {
  /** 들어와 있는 퀴즈 방. null이면 입구 홀이다. */
  roomId: ArcadeRoomId | null
  userQuizzes: UserQuiz[]
  onOpenUserQuiz: (id: number) => void
  onRegister: () => void
}

export default function ArcadeCanvas({ roomId, userQuizzes, onOpenUserQuiz, onRegister, ...stage }: ArcadeCanvasProps) {
  const room = ARCADE_ROOMS.find((candidate) => candidate.id === roomId)

  if (!room) {
    return (
      <WalkStage
        {...stage}
        key="hub"
        label="퀴즈 아케이드 입구. 뒷벽의 문 두 개가 노래, 드라마 맞추기 방으로 이어집니다."
        space={HUB_SPACE}
        start={HUB_START}
        doors={HUB_DOORS}
      >
        {({ onFloorClick, onSit }) => (
          <ArcadeHub doors={HUB_DOORS} disabled={stage.paused} onFloorClick={onFloorClick} onSit={onSit} onDoor={stage.onExit} />
        )}
      </WalkStage>
    )
  }

  return (
    <WalkStage
      {...stage}
      key={room.id}
      label={`${room.title}. 방문자가 등록한 문제 만화가 벽에 걸립니다.`}
      space={QUIZ_ROOM_SPACE}
      start={QUIZ_ROOM_START}
      doors={ROOM_DOORS}
    >
      {({ onFloorClick, onSit }) => (
        <QuizRoom
          room={room}
          userQuizzes={userQuizzes}
          disabled={stage.paused}
          onFloorClick={onFloorClick}
          onSit={onSit}
          onOpenUserQuiz={onOpenUserQuiz}
          onRegister={onRegister}
          onDoor={stage.onExit}
        />
      )}
    </WalkStage>
  )
}
