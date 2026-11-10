import { useEffect, useState } from 'react'

/**
 * 캠퍼스 하루들 로그인 상태(/api/me). 릴레이 만화는 로그인한 작가 본인만 올리고 내린다.
 * off: 캠퍼스에 하루들 로그인이 꺼져 있다(그때는 올릴 수 없다)
 */
export type CampusLogin = { status: 'loading' } | { status: 'off' } | { status: 'out' } | { status: 'in'; nickname: string }

export function useCampusLogin(active: boolean) {
  const [login, setLogin] = useState<CampusLogin>({ status: 'loading' })
  useEffect(() => {
    if (!active) return
    let cancelled = false
    fetch('/api/me', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(8000) })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return
        if (!data?.enabled) setLogin({ status: 'off' })
        else if (data.user) setLogin({ status: 'in', nickname: String(data.user.nickname ?? '') })
        else setLogin({ status: 'out' })
      })
      .catch(() => !cancelled && setLogin({ status: 'off' }))
    return () => {
      cancelled = true
    }
  }, [active])
  return login
}

/** 하루들 로그인으로 보낸다. 캠퍼스 창(iframe) 안이면 캠퍼스 전체를 옮긴다 */
export function startCampusLogin() {
  const target = window.top ?? window
  target.location.href = '/auth/harudle/start'
}
