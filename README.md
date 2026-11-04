# 하루들 우테코 캠퍼스

하루들 캐릭터로 우아한테크코스 판교 캠퍼스 11~14층을 걸어 다니는 3D 메타버스입니다.
크루를 누르면 그 사람의 하루들 공개 피드(네 컷 만화)가 열립니다.

## 기능

- 11~14층 종이 디오라마 (three.js 0.170, 툰 셰이딩 + 먹선 윤곽, 덕후감 3D 서고 방식)
- 입체 하루들 캐릭터와 강아지
- 이동 WASD·방향키·클릭 / 달리기 Shift / 점프 Space / 대화·엘리베이터 F
- 스킬 1 네 컷 그리기 · 2 인사 · 3 하트
- 같이 접속한 크루의 위치·말풍선·스킬 실시간 공유 (WebSocket)
- 하루들 공개 피드 실시간 중계 (`/api/feed`, 4분 캐시)

## 구조

```
server.js          정적 파일 + /api/feed + /ws
public/index.html  페이지 전체 (층 데이터 → 재료 → 월드 → 캐릭터 → 스킬 → UI → 실시간)
deploy/userdata.sh EC2 사용자 데이터 (설치, 서비스 등록, 10분마다 main 반영)
```

## 로컬 실행

```bash
npm install
npm run dev   # http://localhost:8080
```

## 배포

AWS 서울 리전 EC2 (t4g.small, Amazon Linux 2023, Project=harudle).
주소는 https://campus.harudle.com 이고, Caddy가 인증서를 자동으로 받습니다. 앱은 3000번, Caddy가 80·443을 받습니다.
`main`에 푸시하면 서버가 10분 안에 받아서 다시 시작합니다.

층 배치를 바꾸려면 `public/index.html`의 `makeFloor()`만 고치면 됩니다.
