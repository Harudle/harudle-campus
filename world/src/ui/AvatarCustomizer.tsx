import { lazy, Suspense, useEffect, useId, useState } from 'react'
import {
  AVATAR_COLOR_PARTS,
  AVATAR_COLORS,
  AVATAR_OPTIONS,
  AVATAR_PRESETS,
  randomAvatar,
  type AvatarColorKey,
  type AvatarConfig,
  type AvatarPart,
} from '../data/avatar'
import { MAX_NICKNAME_LENGTH } from '../data/nickname'
import { useModalDialog } from './useModalDialog'

const AvatarPreview = lazy(() => import('../scene/AvatarPreview'))

const PART_LABELS: Record<AvatarPart, string> = {
  head: '머리',
  face: '표정',
  eyewear: '안경',
  outfit: '옷',
  neck: '목',
  bag: '가방',
  held: '손에 든 것',
}

const PART_ORDER: AvatarPart[] = ['head', 'face', 'eyewear', 'outfit', 'neck', 'bag', 'held']

const CHIP =
  'cursor-pointer rounded-full border-2 border-ink px-3 py-1 text-sm transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 pointer-coarse:min-h-11 pointer-coarse:px-4'

function chipClass(selected: boolean) {
  return `${CHIP} ${selected ? 'bg-haru-600 text-white' : 'bg-white hover:bg-haru-100'}`
}

/** 붓은 꾸미기를 넘어 다른 사람을 칠할 수 있는 소품이라 알려 준다. 고르기 전에는 선택된 것처럼 보이지 않게 글로만 안내한다. */
function BrushNote({ selected }: { selected: boolean }) {
  if (!selected) {
    return <p className="mt-1.5 text-sm text-haru-800">붓을 들면 다른 사람을 색칠할 수 있어요!</p>
  }
  return (
    <p aria-live="polite" className="mt-2 rounded-xl border-2 border-ink bg-butter px-3 py-2 text-sm text-ink shadow-[2px_2px_0_var(--color-ink)]">
      <span aria-hidden="true">🖌️ </span>
      <strong className="font-display">이제 색칠할 수 있어요!</strong> 가까운 사람을 누르면 얼굴에 붓 색이 묻어요. 붓 색은 아래 소품 색으로 골라요.
    </p>
  )
}

function ColorPicker({ draft, onChange }: {
  draft: AvatarConfig
  onChange: (key: AvatarColorKey, color: string) => void
}) {
  const [target, setTarget] = useState<AvatarColorKey>('outfitColor')
  const current = draft[target]
  const targetLabel = AVATAR_COLOR_PARTS.find((part) => part.key === target)?.label

  return (
    <fieldset>
      <legend className="font-display text-haru-800">색 칠하기</legend>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {AVATAR_COLOR_PARTS.map((part) => (
          <button
            key={part.key}
            type="button"
            aria-pressed={target === part.key}
            onClick={() => setTarget(part.key)}
            className={`${chipClass(target === part.key)} flex items-center gap-1.5`}
          >
            <span aria-hidden="true" style={{ backgroundColor: draft[part.key] }} className="size-3.5 rounded-full border border-ink" />
            {part.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={`${targetLabel} 색 고르기`}>
        {AVATAR_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            aria-label={color.label}
            aria-pressed={current === color.value}
            onClick={() => onChange(target, color.value)}
            style={{ backgroundColor: color.value }}
            className={`size-7 cursor-pointer rounded-full pointer-coarse:size-10 border-2 border-ink transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 ${
              current === color.value ? 'ring-3 ring-haru-600 ring-offset-2' : ''
            }`}
          />
        ))}
        <label className={`${chipClass(false)} ml-1 flex items-center gap-1.5`}>
          <input
            type="color"
            value={current.toLowerCase()}
            onChange={(event) => onChange(target, event.target.value.toUpperCase())}
            className="size-5 cursor-pointer border-0 bg-transparent p-0"
          />
          직접 고르기
        </label>
      </div>
    </fieldset>
  )
}

type AvatarCustomizerProps = {
  open: boolean
  value: AvatarConfig
  doodleFollows: boolean
  nickname: string
  firstVisit: boolean
  onConfirm: (config: AvatarConfig, doodleFollows: boolean, nickname: string) => void
}

export function AvatarCustomizer({ open, value, doodleFollows, nickname, firstVisit, onConfirm }: AvatarCustomizerProps) {
  const { dialogRef, contentRef } = useModalDialog(open)
  const titleId = useId()
  const [draft, setDraft] = useState(value)
  const [withDoodle, setWithDoodle] = useState(doodleFollows)
  const [name, setName] = useState(nickname)
  const [showRotateHint, setShowRotateHint] = useState(true)

  useEffect(() => {
    if (!open) return
    setDraft(value)
    setWithDoodle(doodleFollows)
    setName(nickname)
    setShowRotateHint(true)
  }, [open, value, doodleFollows, nickname])

  const set = <Key extends keyof AvatarConfig>(key: Key, next: AvatarConfig[Key]) =>
    setDraft((current) => ({ ...current, [key]: next }))

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="scoop-dialog"
      style={{ animation: 'none' }}
      onCancel={(event) => {
        // Esc로 닫으면 지금까지 꾸민 내용을 버리고 이전 모습으로 입장한다.
        event.preventDefault()
        onConfirm(value, doodleFollows, nickname)
      }}
    >
      <article ref={contentRef} tabIndex={-1} className="p-4 outline-none sm:p-6">
        <h2 id={titleId} className="font-display text-3xl text-haru-600">
          {firstVisit ? '들어가기 전에, 닉네임과 내 모습을 정해요' : '내 모습 꾸미기'}
        </h2>

        <div className="mt-3 flex items-center gap-3">
          <label className="shrink-0 font-display text-haru-800" htmlFor={`${titleId}-nickname`}>
            닉네임
          </label>
          <input
            id={`${titleId}-nickname`}
            value={name}
            maxLength={MAX_NICKNAME_LENGTH}
            autoComplete="off"
            placeholder="다른 방문자에게 보일 이름"
            onChange={(event) => setName(event.target.value)}
            className="w-full max-w-sm min-w-0 rounded-xl border-2 border-ink bg-white px-3 py-2 text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
          />
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-3">
            <div
              className="relative h-56 overflow-hidden rounded-2xl border-[3px] border-ink sm:h-72 md:h-80"
              onPointerDown={() => setShowRotateHint(false)}
            >
              {open && (
                <Suspense fallback={null}>
                  <AvatarPreview config={draft} withDoodle={withDoodle} />
                </Suspense>
              )}
              {showRotateHint && (
                <p
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border-2 border-ink bg-white px-3 py-1 font-display text-sm whitespace-nowrap text-haru-600"
                >
                  <span className="text-base leading-none">↔</span>
                  <span className="pointer-coarse:hidden">드래그해서 돌려 보세요</span>
                  <span className="hidden pointer-coarse:inline">손가락으로 밀어서 돌려 보세요</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {AVATAR_PRESETS.map((preset) => (
                <button key={preset.label} type="button" onClick={() => setDraft(preset.config)} className={chipClass(false)}>
                  {preset.label}
                </button>
              ))}
              <button type="button" onClick={() => setDraft(randomAvatar())} className={chipClass(false)}>
                랜덤
              </button>
            </div>
            <fieldset className="text-center">
              <legend className="mx-auto font-display text-haru-800">함께 다닐 친구</legend>
              <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                <button type="button" aria-pressed={!withDoodle} onClick={() => setWithDoodle(false)} className={chipClass(!withDoodle)}>
                  혼자 다니기
                </button>
                <button type="button" aria-pressed={withDoodle} onClick={() => setWithDoodle(true)} className={chipClass(withDoodle)}>
                  두들과 함께
                </button>
              </div>
            </fieldset>
          </div>

          <div className="flex flex-col gap-3">
            {PART_ORDER.map((part) => (
              <fieldset key={part}>
                <legend className="font-display text-haru-800">{PART_LABELS[part]}</legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {AVATAR_OPTIONS[part].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={draft[part] === option.value}
                      onClick={() => set(part, option.value as AvatarConfig[typeof part])}
                      className={chipClass(draft[part] === option.value)}
                    >
                      {option.label}
                      {option.value === 'brush' && draft.held !== 'brush' && (
                        <span className="ml-1.5 rounded-full border border-ink bg-butter px-1.5 text-xs text-ink">색칠 가능</span>
                      )}
                    </button>
                  ))}
                </div>
                {part === 'held' && <BrushNote selected={draft.held === 'brush'} />}
              </fieldset>
            ))}
            <ColorPicker draft={draft} onChange={(key, color) => set(key, color)} />
          </div>
        </div>

        <div className="sticky -bottom-4 -mx-4 mt-4 bg-paper px-4 py-3 sm:-bottom-6 sm:-mx-6 sm:px-6">
          <button
            type="button"
            onClick={() => onConfirm(draft, withDoodle, name.trim())}
            className="block w-full cursor-pointer rounded-xl border-2 border-ink bg-haru-600 px-5 py-3 font-display text-xl text-white shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
          >
            {firstVisit ? '이 모습으로 입장' : '적용하기'}
          </button>
        </div>
      </article>
    </dialog>
  )
}
