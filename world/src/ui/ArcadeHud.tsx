import { ARCADE_ROOMS, type ArcadeRoomId } from '../data/arcadeQuizzes'
import type { PresenceStatus } from '../data/presence'
import type { UserQuiz } from '../data/userQuizzes'
import { TouchMenu, TouchMenuItem } from './TouchMenu'

const BUTTON =
  'pointer-events-auto cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-2 font-display text-haru-600 shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:min-h-11'

type ArcadeHudProps = {
  roomId: ArcadeRoomId | null
  presenceStatus: PresenceStatus
  visitorCount: number
  walkable: boolean
  onEnterRoom: (id: ArcadeRoomId) => void
  onLeaveRoom: () => void
  userQuizzes: UserQuiz[]
  onOpenUserQuiz: (id: number) => void
  onRegister: () => void
  onCustomize: () => void
  onOpenGuide: () => void
  onExit: () => void
}

/** 3D 문과 액자를 고를 수 없는 키보드·스크린 리더 사용자도 같은 곳으로 갈 수 있게 버튼을 함께 둔다. */
export function ArcadeHud({
  roomId,
  presenceStatus,
  visitorCount,
  walkable,
  onEnterRoom,
  onLeaveRoom,
  userQuizzes,
  onOpenUserQuiz,
  onRegister,
  onCustomize,
  onOpenGuide,
  onExit,
}: ArcadeHudProps) {
  const room = ARCADE_ROOMS.find((candidate) => candidate.id === roomId)
  // 3D 공간이 없으면 문을 고를 수 없어 휴대폰에서도 버튼을 그대로 둔다.
  const menuButton = walkable ? `${BUTTON} pointer-coarse:hidden` : BUTTON
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="max-w-[62%] rounded-2xl bg-white/90 px-3 py-2 backdrop-blur-sm sm:max-w-xs">
          <h1 className="font-display text-2xl leading-none text-haru-600 sm:text-3xl pointer-coarse:text-lg">
            {room ? room.title : '퀴즈 아케이드'}
            {walkable && presenceStatus === 'online' && <span className="hidden pointer-coarse:inline"> · {visitorCount}명</span>}
          </h1>
          <p className={`mt-1 text-sm text-haru-800 ${walkable ? 'pointer-coarse:hidden' : ''}`}>{room ? (userQuizzes.length > 0 ? '벽에 걸린 네 컷을 보고 맞혀 보세요' : '아직 문제가 없어요. 첫 문제를 걸어 보세요!') : '어떤 방에 들어가 볼까요?'}</p>
          {walkable && (
            <p className={`text-sm text-haru-800 ${presenceStatus === 'online' || presenceStatus === 'connecting' ? 'pointer-coarse:hidden' : ''}`}>
              {presenceStatus === 'online' && `지금 ${visitorCount}명 접속 중`}
              {presenceStatus === 'connecting' && '다른 방문자를 찾는 중…'}
              {presenceStatus === 'offline' && '지금은 혼자 플레이 중'}
              {presenceStatus === 'full' && '방문자가 많아 혼자 플레이 중'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <button type="button" onClick={room ? onLeaveRoom : onExit} className={`${BUTTON} shrink-0`}>
            {room ? '오락실로' : '로비로'}
          </button>
          {walkable && (
            <TouchMenu>
              {!room &&
                ARCADE_ROOMS.map((candidate) => (
                  <TouchMenuItem key={candidate.id} onClick={() => onEnterRoom(candidate.id)}>
                    {candidate.label}
                  </TouchMenuItem>
                ))}
              <TouchMenuItem onClick={onCustomize}>내 모습 꾸미기</TouchMenuItem>
              <TouchMenuItem onClick={onOpenGuide}>조작법</TouchMenuItem>
            </TouchMenu>
          )}
        </div>
      </header>

      {/* 3D 액자를 고를 수 없는 키보드·스크린 리더 사용자와 벽에 다 걸리지 못한 문제를 위한 목록 */}
      {userQuizzes.length > 0 && (
        <nav aria-label="사용자 문제 목록" className="sr-only focus-within:not-sr-only focus-within:pointer-events-auto">
          <ul className="max-h-[40dvh] overflow-y-auto rounded-xl border-2 border-ink bg-white p-2">
            {userQuizzes.map((quiz) => (
              <li key={quiz.id}>
                <button
                  type="button"
                  onClick={() => onOpenUserQuiz(quiz.id)}
                  className="w-full cursor-pointer rounded-md px-3 py-1.5 text-left hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600"
                >
                  {quiz.author} 작가의 문제 · 맞힌 사람 {quiz.solverCount}명
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <footer className="flex flex-col items-center gap-2 pb-[env(safe-area-inset-bottom)] text-center pointer-fine:px-24 min-[1100px]:pointer-fine:px-[19rem] pointer-coarse:items-end pointer-coarse:pl-32 pointer-coarse:text-right">
        <nav aria-label={room ? '퀴즈' : '퀴즈 방 고르기'} className="flex flex-wrap justify-center gap-2 pointer-coarse:justify-end">
          {!room &&
            ARCADE_ROOMS.map((candidate) => (
              <button key={candidate.id} type="button" onClick={() => onEnterRoom(candidate.id)} className={menuButton}>
                {candidate.label}
              </button>
            ))}
          <button type="button" onClick={onRegister} className={BUTTON}>
            문제 등록하기
          </button>
          {walkable && (
            <button type="button" onClick={onCustomize} className={menuButton}>
              내 모습 꾸미기
            </button>
          )}
        </nav>
      </footer>
    </div>
  )
}
