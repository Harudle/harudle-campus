import type { PresenceStatus } from '../data/presence'
import { TouchMenu, TouchMenuItem } from './TouchMenu'

const BUTTON =
  'pointer-events-auto cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-2 font-display text-haru-600 shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:min-h-11'

type RelayHudProps = {
  /** 지금까지 이어진 화 수 */
  episodeCount: number
  presenceStatus: PresenceStatus
  visitorCount: number
  walkable: boolean
  onOpenEpisode: (number: number) => void
  onRegister: () => void
  onCustomize: () => void
  onOpenGuide: () => void
  onExit: () => void
}

export function RelayHud({ episodeCount, presenceStatus, visitorCount, walkable, onOpenEpisode, onRegister, onCustomize, onOpenGuide, onExit }: RelayHudProps) {
  // 3D 공간이 없으면 필름 칸을 고를 수 없어 휴대폰에서도 버튼을 그대로 둔다.
  const menuButton = walkable ? `${BUTTON} pointer-coarse:hidden` : BUTTON
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="max-w-[62%] rounded-2xl bg-white/90 px-3 py-2 backdrop-blur-sm sm:max-w-xs">
          <h1 className="font-display text-2xl leading-none text-haru-600 sm:text-3xl pointer-coarse:text-lg">
            릴레이 만화 소설관
            {walkable && presenceStatus === 'online' && <span className="hidden pointer-coarse:inline"> · {visitorCount}명</span>}
          </h1>
          <p className={`mt-1 text-sm text-haru-800 ${walkable ? 'pointer-coarse:hidden' : ''}`}>{episodeCount > 0 ? `지금 ${episodeCount}화까지 이어졌어요` : '아직 첫 화를 기다리고 있어요'}</p>
          {walkable && (
            <p className={`text-sm text-haru-800 ${presenceStatus === 'online' || presenceStatus === 'connecting' ? 'pointer-coarse:hidden' : ''}`}>
              {presenceStatus === 'online' && `지금 ${visitorCount}명 접속 중`}
              {presenceStatus === 'connecting' && '다른 방문자를 찾는 중…'}
              {presenceStatus === 'offline' && '지금은 혼자 관람 중'}
              {presenceStatus === 'full' && '방문자가 많아 혼자 관람 중'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <button type="button" onClick={onExit} className={`${BUTTON} shrink-0`}>
            로비로
          </button>
          {walkable && (
            <TouchMenu>
              {episodeCount > 0 && (
                <>
                  <TouchMenuItem onClick={() => onOpenEpisode(1)}>1화부터 정주행</TouchMenuItem>
                  <TouchMenuItem onClick={() => onOpenEpisode(episodeCount)}>최신 화 보기</TouchMenuItem>
                </>
              )}
              <TouchMenuItem onClick={onCustomize}>내 모습 꾸미기</TouchMenuItem>
              <TouchMenuItem onClick={onOpenGuide}>조작법</TouchMenuItem>
            </TouchMenu>
          )}
        </div>
      </header>

      <footer className="flex flex-col items-center gap-2 pb-[env(safe-area-inset-bottom)] text-center pointer-fine:px-24 min-[1100px]:pointer-fine:px-[19rem] pointer-coarse:items-end pointer-coarse:pl-32 pointer-coarse:text-right">
        <div className="flex flex-wrap justify-center gap-2 pointer-coarse:justify-end">
          {episodeCount > 0 && (
            <>
              <button type="button" onClick={() => onOpenEpisode(1)} className={menuButton}>
                1화부터 정주행
              </button>
              <button type="button" onClick={() => onOpenEpisode(episodeCount)} className={menuButton}>
                최신 화 보기
              </button>
            </>
          )}
          <button type="button" onClick={onRegister} className={BUTTON}>
            {episodeCount > 0 ? '다음 화 올리기' : '1화 올리기'}
          </button>
          {walkable && (
            <button type="button" onClick={onCustomize} className={menuButton}>
              내 모습 꾸미기
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
