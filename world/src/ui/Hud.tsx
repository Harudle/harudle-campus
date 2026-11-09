import { COLORS, HARUDLE_URL, SLOGAN } from '../lib/brand'
import { BookSymbol } from './CharacterFace'

type HudProps = {
  webgl: boolean
  onOpenScoop: () => void
  onEnterGallery: () => void
  onEnterArcade: () => void
  onEnterRelay: () => void
}

function PlaceCard({ icon, color, name, description, onEnter }: { icon: string; color: string; name: string; description: string; onEnter: () => void }) {
  return (
    <button
      type="button"
      onClick={onEnter}
      className="pointer-events-auto flex h-full w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-ink bg-white p-2 text-left shadow-[3px_3px_0_var(--color-ink)] transition hover:-translate-y-0.5 hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 active:translate-y-0.5 active:shadow-none sm:p-3"
    >
      <span aria-hidden="true" style={{ backgroundColor: color }} className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-ink text-2xl [@media(max-height:480px)]:size-8 [@media(max-height:480px)]:text-base">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-lg leading-tight text-haru-600">{name}</span>
        <span className="block text-sm leading-snug text-haru-800 [@media(max-height:480px)]:hidden">{description}</span>
      </span>
    </button>
  )
}

export function Hud({ webgl, onOpenScoop, onEnterGallery, onEnterArcade, onEnterRelay }: HudProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <a
          href={HARUDLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto flex items-center gap-2 rounded-sm focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-haru-600"
        >
          <BookSymbol className="size-12 shrink-0" />
          <span>
            <span className="block font-display text-3xl leading-none text-haru-600">하루들</span>
            <span className="mt-1 block text-sm text-haru-800">{SLOGAN}</span>
          </span>
        </a>
        <button
          type="button"
          onClick={onOpenScoop}
          className="pointer-events-auto cursor-pointer rounded-full border-2 border-ink bg-white shrink-0 px-4 py-1.5 font-display text-haru-600 shadow-[2px_2px_0_var(--color-ink)] transition hover:-translate-y-0.5 hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:min-h-11"
        >
          오늘의 특종 보기
        </button>
      </header>

      <footer className="flex flex-col items-center gap-2 pb-[env(safe-area-inset-bottom)] text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {webgl ? (
            <p className="rounded-full bg-white/80 px-3 py-1 text-sm text-haru-800 backdrop-blur-sm pointer-coarse:hidden">드래그해서 둘러보고, 휠로 확대할 수 있어요</p>
          ) : (
            <p className="rounded-full bg-white/80 px-3 py-1 text-sm text-haru-800">이 브라우저에서는 3D 공간을 표시할 수 없어요. 특종 신문은 바로 볼 수 있어요.</p>
          )}
        </div>
        <nav aria-label="공간 고르기" className="w-full max-w-3xl">
          <h2 className="mb-1.5 inline-block rounded-full bg-white px-4 py-0.5 font-display text-lg text-haru-600 [@media(max-height:480px)]:hidden">어디로 가 볼까요?</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3 [@media(max-height:480px)]:grid-cols-3">
            <li>
              <PlaceCard icon="🎮" color={COLORS.blush} name="오락실" description="만화 속 노래와 드라마를 맞혀요" onEnter={onEnterArcade} />
            </li>
            <li>
              <PlaceCard icon="📖" color={COLORS.lavender200} name="릴레이 소설관" description="네컷만화를 이어 그려요" onEnter={onEnterRelay} />
            </li>
            {webgl && (
              <li>
                <PlaceCard icon="🖼️" color={COLORS.butter} name="전시관" description="인기 만화와 작가의 방을 구경해요" onEnter={onEnterGallery} />
              </li>
            )}
          </ul>
        </nav>
      </footer>
    </div>
  )
}
