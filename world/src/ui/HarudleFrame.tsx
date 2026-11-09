import { HARUDLE_URL } from '../lib/brand'

/**
 * 하루들 서비스를 그대로 띄우는 iframe. 전시관의 휴대폰 화면과 크게 보기 창이 함께 쓴다.
 * 하루들이 frame-ancestors로 이 사이트를 허용해야 보인다.
 */
export function HarudleFrame({ className }: { className?: string }) {
  return (
    <iframe
      src={HARUDLE_URL}
      title="하루들 서비스 화면"
      // 하루들이 전시관 전체 화면을 다른 주소로 바꾸지 못하게 막고, 로그인 같은 새 창은 열 수 있게 둔다.
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
      allow="clipboard-write"
      referrerPolicy="strict-origin-when-cross-origin"
      className={className}
    />
  )
}
