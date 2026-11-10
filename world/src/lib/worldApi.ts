/** 방명록과 사용자 퀴즈는 실시간 서버에 함께 있어서 배포 주소도 같은 값에서 얻는다. */
export function worldApiUrl(path: string) {
  const configured = import.meta.env.VITE_REALTIME_URL as string | undefined
  if (!configured) return path
  const url = new URL(configured)
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  url.pathname = path
  url.search = ''
  return url.toString()
}
