import { useCallback, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'harudle-world.controls-guide-closed'
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches

function wasClosed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function rememberClosed(closed: boolean) {
  try {
    if (closed) window.localStorage.setItem(STORAGE_KEY, '1')
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 저장하지 못해도 이번 방문에서는 그대로 동작한다.
  }
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border-2 border-ink bg-haru-50 px-1.5 font-display text-xs leading-5 text-ink">{children}</kbd>
}

const KEYBOARD_ROWS: { action: string; how: ReactNode }[] = [
  {
    action: '걷기',
    how: (
      <>
        <Key>W</Key> <Key>A</Key> <Key>S</Key> <Key>D</Key> 방향키, 바닥 클릭
      </>
    ),
  },
  {
    action: '달리기',
    how: (
      <>
        <Key>Shift</Key> 누른 채 걷기
      </>
    ),
  },
  {
    action: '점프',
    how: (
      <>
        <Key>Space</Key> 공중에서 한 번 더 누르면 이단 점프
      </>
    ),
  },
  {
    action: '종이 던지기',
    how: (
      <>
        <Key>F</Key> 또는 우클릭, 가리킨 곳 어디든 (사람은 클릭, 비켜나면 피해요)
      </>
    ),
  },
  {
    action: '감정 표현',
    how: (
      <>
        <Key>1</Key>~<Key>6</Key> 또는 채팅 옆 웃는 얼굴 버튼
      </>
    ),
  },
  { action: '붓 칠하기', how: '붓을 들고 가까운 사람 클릭' },
  {
    action: '앉기',
    how: (
      <>
        <Key>C</Key> 또는 벤치 클릭
      </>
    ),
  },
  { action: '채팅', how: <Key>Enter</Key> },
  {
    action: '둘러보기',
    how: (
      <>
        마우스 드래그, <Key>Q</Key> <Key>E</Key> 좌우
      </>
    ),
  },
]

const TOUCH_ROWS: { action: string; how: ReactNode }[] = [
  { action: '걷기', how: '왼쪽 아래 조이스틱' },
  { action: '둘러보기', how: '화면을 밀기' },
  { action: '달리기', how: '조이스틱을 끝까지 밀기' },
  { action: '점프', how: '오른쪽 아래 화살표 버튼, 공중에서 한 번 더 누르면 이단 점프' },
  { action: '종이 던지기', how: '사람 터치, 종이 버튼 뒤 어디든 터치' },
  { action: '감정 표현', how: '채팅 옆 웃는 얼굴 버튼' },
  { action: '붓 칠하기', how: '붓을 들고 가까운 사람 터치' },
  { action: '앉기', how: '벤치 터치' },
]

type GuideState = 'open' | 'hint' | 'closed'

/**
 * 조작법 안내의 상태. 메뉴에서도 열 수 있도록 공간에서 들고 있는다.
 * PC는 처음에 펼쳐 두고, 휴대폰은 공간을 가리지 않게 짧은 힌트만 보여 주다가 걷기 시작하면 닫는다.
 */
export function useControlsGuide() {
  const [state, setState] = useState<GuideState>(() => (wasClosed() ? 'closed' : IS_TOUCH ? 'hint' : 'open'))
  const show = useCallback(() => {
    rememberClosed(false)
    setState('open')
  }, [])
  const close = useCallback(() => {
    rememberClosed(true)
    setState('closed')
  }, [])
  const dismissHint = useCallback(() => {
    setState((current) => {
      if (current !== 'hint') return current
      rememberClosed(true)
      return 'closed'
    })
  }, [])
  return { state, show, close, dismissHint }
}

export function ControlsGuide({ guide, tip }: { guide: ReturnType<typeof useControlsGuide>; tip: string }) {
  const rows = IS_TOUCH ? TOUCH_ROWS : KEYBOARD_ROWS

  if (guide.state === 'hint') {
    return (
      <div className="absolute top-20 left-4 flex max-w-[calc(100vw-2rem)] items-center gap-1 rounded-2xl border-2 border-ink bg-white py-1 pr-1 pl-3 text-sm text-haru-800 shadow-[3px_3px_0_var(--color-ink)]">
        <p>조이스틱으로 걸어 보세요. 조작법은 ☰ 메뉴에 있어요.</p>
        <button
          type="button"
          aria-label="안내 닫기"
          onClick={guide.close}
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-haru-600 hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600"
        >
          ✕
        </button>
      </div>
    )
  }

  if (guide.state === 'closed') {
    return (
      <div className="pointer-events-none absolute top-20 right-4 sm:right-6 pointer-coarse:hidden">
        <button
          type="button"
          onClick={guide.show}
          className="pointer-events-auto cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-2 font-display text-haru-600 shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
        >
          조작법
        </button>
      </div>
    )
  }

  return (
    <section
      aria-label="조작 방법"
      className="absolute z-20 top-20 right-4 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-ink bg-white/95 p-3 shadow-[3px_3px_0_var(--color-ink)] backdrop-blur-sm sm:right-6 pointer-coarse:top-20 pointer-coarse:right-4 pointer-coarse:left-4 pointer-coarse:mx-auto pointer-coarse:max-h-[calc(100dvh-7rem)] pointer-coarse:overflow-y-auto [@media(max-height:480px)]:top-4 [@media(max-height:480px)]:max-h-[calc(100dvh-2rem)]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg text-haru-600">이렇게 움직여요</h2>
        <button
          type="button"
          onClick={guide.close}
          className="cursor-pointer rounded-md px-2 text-sm text-haru-800 underline hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600 pointer-coarse:min-h-11"
        >
          닫기
        </button>
      </div>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
        {rows.map(({ action, how }) => (
          <div key={action} className="contents">
            <dt className="font-display whitespace-nowrap text-ink">{action}</dt>
            <dd className="text-haru-800">{how}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 border-t-2 border-haru-100 pt-2 text-sm text-haru-800">{tip}</p>
    </section>
  )
}
