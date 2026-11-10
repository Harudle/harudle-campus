import { startCampusLogin, type CampusLogin } from '../data/campusLogin'

/** 하루들 로그인이 필요한 곳(릴레이 올리기·퀴즈 풀기와 걸기)에서 로그인 전에 보이는 안내 */
export function LoginGate({ login, reason }: { login: CampusLogin; reason: string }) {
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border-2 border-ink bg-white p-4 text-center">
      {login.status === 'loading' && <p className="text-haru-800">로그인 상태를 확인하는 중…</p>}
      {login.status === 'off' && <p className="leading-relaxed font-bold">지금은 하루들 로그인을 쓸 수 없어요. 잠시 뒤에 다시 와 주세요.</p>}
      {login.status === 'out' && (
        <>
          <p className="leading-relaxed font-bold">{reason}</p>
          <button
            type="button"
            onClick={startCampusLogin}
            className="block w-full cursor-pointer rounded-xl border-2 border-ink bg-haru-600 px-5 py-3 text-center font-display text-xl text-white shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-haru-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600"
          >
            하루들로 로그인하기
          </button>
        </>
      )}
    </div>
  )
}
