import { useState } from 'react'
import type { ArtistZone, GalleryStatus, GalleryWork } from '../data/galleryWorks'
import type { PresenceStatus } from '../data/presence'
import type { GallerySettings } from '../data/settings'
import { CharacterFace } from './CharacterFace'
import { TouchMenu, TouchMenuItem } from './TouchMenu'

type GalleryHudProps = {
  zones: ArtistZone[]
  currentZone: ArtistZone | null
  works: GalleryWork[]
  status: GalleryStatus
  presenceStatus: PresenceStatus
  visitorCount: number
  settings: GallerySettings
  onSettingsChange: (settings: GallerySettings) => void
  overview: boolean
  cheerCount: number
  onOpenCheers: () => void
  onOpenBooth: () => void
  onOpenPhone: () => void
  onCustomize: () => void
  onOpenGuide: () => void
  onOverviewChange: (overview: boolean) => void
  onRoomSelect: (authorId: string) => void
  onBackToMain: () => void
  onExit: () => void
  onRetry: () => void
  onSelect: (work: GalleryWork) => void
}

const BUTTON =
  'pointer-events-auto cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-2 font-display text-haru-600 shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:min-h-11'

const PC_BUTTON = `${BUTTON} pointer-coarse:hidden`

/** 작가 전시실 바로가기 목록 */
function RoomList({ zones, onRoomSelect }: { zones: ArtistZone[]; onRoomSelect: (authorId: string) => void }) {
  return (
    <details>
      <summary className="cursor-pointer rounded font-display text-haru-600 focus-visible:outline-3 focus-visible:outline-haru-600 pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center pointer-coarse:px-3">
        작가 전시실 바로가기
      </summary>
      <ol className="mt-1 max-h-[46dvh] overflow-y-auto [@media(max-height:480px)]:max-h-[28dvh]">
        {zones.map((zone) => (
          <li key={zone.authorId}>
            <button
              type="button"
              data-menu-close
              onClick={(event) => {
                // 휴대폰에서 목록이 화면을 가리지 않게 고르면 접는다.
                event.currentTarget.closest('details')?.removeAttribute('open')
                onRoomSelect(zone.authorId)
              }}
              className="w-full cursor-pointer rounded-md px-2 py-1 text-left text-sm hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600 pointer-coarse:min-h-11"
            >
              {zone.nickname} <span className="text-haru-800">· {zone.totalWorks}점</span>
            </button>
          </li>
        ))}
      </ol>
    </details>
  )
}

function DoodleSwitch({ settings, onSettingsChange }: { settings: GallerySettings; onSettingsChange: (settings: GallerySettings) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <CharacterFace kind="doodle" className="size-9 shrink-0" />
      <span className="grow font-display text-ink">두들이 따라다니기</span>
      <input
        type="checkbox"
        role="switch"
        checked={settings.doodleFollows}
        onChange={(event) => onSettingsChange({ ...settings, doodleFollows: event.target.checked })}
        className="size-5 cursor-pointer accent-haru-600 pointer-coarse:size-7"
      />
    </label>
  )
}

export function GalleryHud({
  zones,
  currentZone,
  works,
  status,
  presenceStatus,
  visitorCount,
  settings,
  onSettingsChange,
  overview,
  cheerCount,
  onOpenCheers,
  onOpenBooth,
  onOpenPhone,
  onCustomize,
  onOpenGuide,
  onOverviewChange,
  onRoomSelect,
  onBackToMain,
  onExit,
  onRetry,
  onSelect,
}: GalleryHudProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="pointer-events-auto max-w-[62%] min-w-0 rounded-2xl bg-white/90 px-3 py-2 backdrop-blur-sm sm:max-w-xs">
          <p className="font-display text-2xl leading-none text-haru-600 sm:text-3xl pointer-coarse:text-lg">
            {currentZone ? `${currentZone.nickname} 작가의 방` : '메인 전시실'}
            {presenceStatus === 'online' && <span className="hidden pointer-coarse:inline"> · {visitorCount}명</span>}
          </p>
          <p aria-live="polite" className={`mt-1 text-sm text-haru-800 ${status === 'ready' ? 'pointer-coarse:hidden' : ''}`}>
            {status === 'loading' && '작품을 거는 중이에요…'}
            {status === 'ready' && (currentZone ? (currentZone.totalWorks > works.length ? `작품 ${currentZone.totalWorks}점 중 ${works.length}점 전시` : `작품 ${works.length}점 전시 중`) : `인기 만화 ${works.length}점 전시 중`)}
            {status === 'failed' && '작품을 불러오지 못했어요'}
          </p>
          <p className={`text-sm text-haru-800 ${presenceStatus === 'online' || presenceStatus === 'connecting' ? 'pointer-coarse:hidden' : ''}`}>
            {presenceStatus === 'online' && `지금 ${visitorCount}명 관람 중`}
            {presenceStatus === 'connecting' && '다른 관람객을 찾는 중…'}
            {presenceStatus === 'offline' && '지금은 혼자 관람 중'}
            {presenceStatus === 'full' && '관람객이 많아 혼자 관람 중'}
          </p>
          {zones.length > 0 && (
            <div className="mt-1.5 pointer-coarse:hidden">
              <RoomList zones={zones} onRoomSelect={onRoomSelect} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row pointer-coarse:flex-row pointer-coarse:items-start">
          {status === 'failed' && (
            <button type="button" onClick={onRetry} className={BUTTON}>
              다시 시도
            </button>
          )}
          <button type="button" aria-pressed={overview} onClick={() => onOverviewChange(!overview)} className={overview ? BUTTON : PC_BUTTON}>
            {overview ? '돌아가기' : '전체 보기'}
          </button>
          <button type="button" onClick={currentZone ? onBackToMain : onExit} className={BUTTON}>
            {currentZone ? '메인 전시실로' : '로비로'}
          </button>
          <div className="relative pointer-coarse:hidden">
            <button
              type="button"
              aria-expanded={settingsOpen}
              aria-controls="gallery-settings"
              onClick={() => setSettingsOpen((open) => !open)}
              className={BUTTON}
            >
              설정
            </button>
            {settingsOpen && (
              <div
                id="gallery-settings"
                className="pointer-events-auto absolute top-full right-0 z-10 mt-2 w-60 rounded-2xl border-2 border-ink bg-white p-3 shadow-[3px_3px_0_var(--color-ink)]"
              >
                <DoodleSwitch settings={settings} onSettingsChange={onSettingsChange} />
              </div>
            )}
          </div>
          <TouchMenu>
            {!overview && <TouchMenuItem onClick={() => onOverviewChange(true)}>전체 보기</TouchMenuItem>}
            {zones.length > 0 && <RoomList zones={zones} onRoomSelect={onRoomSelect} />}
            <TouchMenuItem onClick={onCustomize}>내 모습 꾸미기</TouchMenuItem>
            <TouchMenuItem onClick={onOpenBooth}>작가 체험</TouchMenuItem>
            <TouchMenuItem onClick={onOpenPhone}>하루들 열기</TouchMenuItem>
            <TouchMenuItem onClick={onOpenGuide}>조작법</TouchMenuItem>
            <div className="mt-1 border-t-2 border-haru-100 px-2 py-1">
              <DoodleSwitch settings={settings} onSettingsChange={onSettingsChange} />
            </div>
          </TouchMenu>
        </div>
      </header>

      {/* 3D 액자를 고를 수 없는 키보드·스크린 리더 사용자를 위한 작품 목록 */}
      <nav aria-label="전시 작품 목록" className="sr-only focus-within:not-sr-only focus-within:pointer-events-auto">
        <ul className="max-h-[50dvh] overflow-y-auto rounded-xl border-2 border-ink bg-white p-2">
          {works.map((work) => (
            <li key={work.id}>
              <button
                type="button"
                onClick={() => onSelect(work)}
                className="w-full cursor-pointer rounded-md px-3 py-1.5 text-left hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600"
              >
                {work.nickname} · {work.category} · 좋아요 {work.likeCount}개
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="flex flex-col items-center gap-2 pb-[env(safe-area-inset-bottom)] text-center pointer-fine:px-24 min-[1100px]:pointer-fine:px-[19rem] pointer-coarse:items-end pointer-coarse:pl-32 pointer-coarse:text-right">
        <div className="flex flex-wrap justify-center gap-2 pointer-coarse:justify-end">
          {currentZone && (
            <button type="button" onClick={onOpenCheers} className={BUTTON}>
              응원 방명록 {cheerCount > 0 && cheerCount}
            </button>
          )}
          <button type="button" onClick={onCustomize} className={PC_BUTTON}>
            내 모습 꾸미기
          </button>
          <button type="button" onClick={onOpenBooth} className={PC_BUTTON}>
            작가 체험
          </button>
          <button type="button" onClick={onOpenPhone} className={PC_BUTTON}>
            하루들 열기
          </button>
        </div>
      </footer>
    </div>
  )
}
