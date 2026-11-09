import type { ThreeEvent } from '@react-three/fiber'
import type { ArcadeRoomInfo } from '../../data/arcadeQuizzes'
import type { UserQuiz } from '../../data/userQuizzes'
import { Bench, WallDoor } from '../gallery/Hall'
import type { Seat } from '../seats'
import { ArcadeShell } from './ArcadeShell'
import { QUIZ_ROOM_BENCHES, QUIZ_ROOM_EXIT_DOOR, QUIZ_ROOM_HALF_X, QUIZ_ROOM_HALF_Z, USER_BACK_X, USER_SIDE_OFFSETS } from './layout'
import { NeonSign } from './NeonSign'
import { EmptyQuizFrame, UserQuizFrame } from './UserQuizFrame'

/** 사용자가 등록한 한 종류의 문제만 모은 방. 뒷벽을 채운 뒤 옆 벽에 건다. */
export function QuizRoom({ room, userQuizzes, disabled, onFloorClick, onSit, onOpenUserQuiz, onRegister, onDoor }: {
  room: ArcadeRoomInfo
  userQuizzes: UserQuiz[]
  disabled: boolean
  onFloorClick: (event: ThreeEvent<MouseEvent>) => void
  onSit: (point: Seat) => void
  onOpenUserQuiz: (id: number) => void
  onRegister: () => void
  onDoor: (id: string) => void
}) {
  const frame = (quiz: UserQuiz, x: number) => (
    <UserQuizFrame key={quiz.id} quiz={quiz} x={x} color={room.color} disabled={disabled} onOpen={() => onOpenUserQuiz(quiz.id)} />
  )
  const sideFrames = (first: number) =>
    USER_SIDE_OFFSETS.map((x, index) => {
      const quiz = userQuizzes[first + index]
      return quiz && frame(quiz, x)
    })

  return (
    <group>
      <ArcadeShell
        halfX={QUIZ_ROOM_HALF_X}
        halfZ={QUIZ_ROOM_HALF_Z}
        onFloorClick={onFloorClick}
        leftWall={sideFrames(USER_BACK_X.length)}
        rightWall={sideFrames(USER_BACK_X.length + USER_SIDE_OFFSETS.length)}
      >
        <NeonSign text={room.title} color={room.color} position={[0, 7.15, 0.1]} width={10} height={1.2} />
        {USER_BACK_X.map((x, index) => {
          const quiz = userQuizzes[index]
          return quiz ? frame(quiz, x) : <EmptyQuizFrame key={`empty-${x}`} x={x} disabled={disabled} onOpen={onRegister} />
        })}
      </ArcadeShell>
      <WallDoor door={QUIZ_ROOM_EXIT_DOOR} paused={disabled} onEnter={onDoor} />
      {QUIZ_ROOM_BENCHES.map((bench) => (
        <Bench key={`${bench.x},${bench.z}`} {...bench} disabled={disabled} onSit={onSit} />
      ))}
    </group>
  )
}
