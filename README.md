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
- 판교 캠퍼스 기준 실제 시간에 따른 하늘과 빛, 날씨 예보에 따른 창밖 비와 눈
- **14층 하루들 월드**: 14층은 [하루들 월드](https://github.com/Harudle/harudle-world)를 옮긴 층이라 엘리베이터 홀 말고는 월드 공간만 있습니다. 북쪽 전체가 메인 전시실(보라 카펫 끝 "가장 사랑받은 만화", 벽과 앞줄 이젤 액자에 인기 네컷만화, 작가 체험 부스, 다 같이 그리는 네컷 이젤과 지난 그림 스케치북, 큰 하루들 휴대폰, 꽃게 게임 만화가 걸린 액자 앞에서 점프하면 그림 속으로 뛰어들어 게임 시작), 서쪽 위가 작가 전시실 여덟 곳(작가 만화, 그 작가 만화를 모두 넘겨 보는 앨범북, 응원 방명록), 서쪽 아래가 퀴즈 아케이드(파스텔 바둑판 바닥과 전구 간판, 인형 뽑기·주크박스·팝콘 수레 같은 소품, 가운데 입구 홀 양옆에 노래 맞추기 방·드라마·영화 맞추기 방, 방마다 뒷벽과 옆 벽에 문제 액자), 동쪽이 릴레이 만화 소설관(나무 바닥 긴 복도, 보라 카펫 끝 이젤에 최신 화, 왼쪽 벽 필름에 지난 화, 오른쪽 벽 두루마리)입니다. 엘리베이터 홀 남쪽 문 앞 광장에는 오늘의 특종 가판대가 홀 쪽을 보고 서 있어, 남쪽 문을 나서면 앞면이 바로 보입니다. 액자·부스·이젤·가판대를 누르거나 앞에서 F를 누르면 월드의 그 창이 그대로 열립니다. 이젤은 월드와 같은 실시간 이젤이라 여러 사람이 같은 그림에 그리고, 14층 이젤 판에는 15초마다 지금 그림(`/easel/art`)이 보입니다. 응원글·퀴즈·이어 그리기·이젤 그림은 캠퍼스 서버에 따로 저장되고, world.harudle.com과는 섞이지 않습니다

## 구조

Vite + React + TypeScript + React Three Fiber. 캐릭터는 [하루들 월드](https://github.com/Harudle/harudle-world)의 컴포넌트를 그대로 씁니다.

```
index.html             화면 틀(HUD·패널 마크업)
src/
├─ main.tsx · App.tsx  R3F 캔버스 위에 엔진과 캐릭터를 올린다
├─ harudle/            하루들 월드에서 가져온 캐릭터 (Avatar, Characters, toon, avatar 데이터)
│                      Avatar.tsx만 스킬·점프 자세(pose)를 받도록 늘렸다
├─ scene/Dolls.tsx     엔진이 정한 자리·자세로 캐릭터를 그린다
├─ engine/
│  ├─ world.ts         층 격자·배치·길찾기·끼임 탈출 (three.js 없이 돈다)
│  ├─ engine.ts        가구·카메라·이동·스킬·실시간·화면 UI
│  └─ dolls.ts         엔진 ↔ 캐릭터 다리
└─ styles.css
server.js              감독: 포트를 쥐고 워커를 띄우며, main을 지켜보다 무중단으로 교체
app.js                 워커: dist/ + /api/feed + /ws + /healthz(버전)
weather.js             판교 날씨 예보 중계와 15분 캐시 (`/api/environment`)
scripts/check.mjs      배포 전 검사 (빌드 최신 여부 · 문법 · 층 배치 · 끼임)
dist/ · dist-check/    빌드 결과. 서버에는 빌드 도구가 없어서 저장소에 함께 올린다
src/worldShowcase.ts   14층 액자에 거는 내용(인기 만화·작가 방·방명록·최신 화·사용자 퀴즈)을 받는다
src/worldFloor.ts      14층 액자·가판대를 누르면 월드 창(/world/campus.html)을 캠퍼스 위에 띄운다
world/                 하루들 월드 소스를 그대로 옮긴 것 (src/, server/, index.html)
├─ server/campus.ts    캠퍼스 전용: 월드 서버를 app.js에 붙인다 (월드의 server/index.ts 대신)
├─ campus/modal.tsx    캠퍼스 전용: 월드 3D 공간 없이 특종·만화·릴레이·퀴즈 창만 띄우는 페이지(campus.html)
dist-server/world.mjs  world/server를 묶은 결과. app.js가 불러 쓴다
```

### 14층 하루들 월드

- 14층 배치는 `src/engine/world.ts`의 `f === 14`에 있습니다. 전시관과 소설관은 벽 없는 구역이고, 액자는 세워 두는 `showframe`과 벽에 거는 `showwall`(흰 전시 벽, `style: "film"`이면 필름 띠)로 `src`(work·a0~a7(작가 방)·cheer·crab·relay·song·drama)와 `slot`(몇 번째)을 정합니다. 위에서 보는 카메라가 남쪽에 있어서 액자는 되도록 남쪽을 보게 둡니다. 가판대는 `scoopstand`입니다. `showwall`·`showframe`·`relayscroll`에 `face: "e"|"w"`를 주면 옆 벽에 세워 안쪽을 봅니다. 방 벽색은 `R(..., { wall })`, 바닥 무늬는 구역의 `checker`(바둑판)·`planks`(나무판)입니다. 액자 그림은 14층에 처음 올 때와 10분마다, 무언가 올리거나 건 뒤에 다시 받습니다.
- 액자를 누르면 `/world/campus.html#artwork=…`처럼 그 창만 캠퍼스 위에 띄웁니다(바탕이 비어 14층이 비쳐 보임). 월드의 Tailwind 스타일이 캠퍼스와 섞이지 않게 같은 주소의 페이지로 따로 엽니다. 하루들 월드 전체 화면(`/world/`)도 함께 빌드되지만 캠퍼스에서는 쓰지 않습니다. 월드의 Tailwind 스타일과 키 조작이 캠퍼스와 섞이지 않게 하려는 것입니다. 같은 주소라 저장 공간을 함께 쓰므로, 처음 들어가면 캠퍼스 캐릭터와 이름을 월드에 넘겨줍니다.
- 월드 실시간 접속은 `/world/ws`, API는 월드와 같은 경로(`/cheers`, `/quizzes`, `/relay`, `/crab-game`, `/easel`, `/api/v1/feeds` 등)를 `app.js`가 받습니다. DB는 `.data/world/`(`WORLD_DATA_DIR`)에 두며 git에 올라가지 않고 배포(`git reset`)에도 지워지지 않습니다. 허용 주소는 `WORLD_ORIGINS`(기본 campus.harudle.com과 localhost)입니다.
- **서버 Node 22.13 이상이 필요합니다** (`node:sqlite`). 그보다 낮으면 캠퍼스는 그대로 돌고, 14층 월드만 연결 안 됨으로 보입니다. 워커 로그에 `[world] 14층 하루들 월드를 켜지 못했어요`가 찍힙니다.
- 월드의 큰 휴대폰 화면(하루들 바로 쓰기)은 www.harudle.com을 띄우는데, 하루들이 world.harudle.com에서만 띄우도록 허용해 두어서 캠퍼스에서는 비어 보입니다. 아래 `하루들 열기` 버튼은 동작합니다. 하루들 쪽 `frame-ancestors`에 campus.harudle.com을 더하면 풀립니다.
- 월드가 바뀌면 하루들 월드 저장소의 `src/`, `server/`(`index.ts`·`metamoa.ts`·`staticSite.ts` 제외)를 `world/`에 다시 복사하고, 아래 캠퍼스 수정만 다시 붙인 뒤 `npm run build` 하면 됩니다.
  - `world/src/data/presence.ts`: 실시간 주소 `/ws` → `/world/ws`
  - `world/src/index.css`: `@import 'tailwindcss' source('..');`
  - `world/index.html`: 스크립트 경로 `/world/src/main.tsx`, 제목


하루들 월드 캐릭터가 바뀌면 `src/harudle/`의 파일을 다시 복사하고, `Avatar.tsx`의 pose 부분만 다시 붙이면 됩니다.

## 로컬 실행

```bash
npm install
npm run serve   # 다른 창에서: 피드·실시간·14층 월드 서버 (http://localhost:8080)
npm run dev     # 화면 개발 (Vite)
npm run build   # tsc → dist/ → dist-artifact/(아티팩트용 한 파일) → 지문
npm run check   # 배포 전 검사
```

**커밋 전에 꼭 `npm run build`.** 소스와 dist가 다르면 서버가 배포하지 않습니다.

## 시간과 날씨

- 시간은 서버 시각과 판교 위치를 기준으로 흐릅니다. 해의 높이에 따라 하늘, 주변 건물, 실내 빛이 천천히 바뀝니다. 날씨 제공 서비스가 응답하지 않아도 시간은 계속 흐릅니다.
- Open-Meteo의 판교 근처 **예보 모델**을 사용합니다. 관측값이 아니므로 실제 날씨와 다르거나 늦을 수 있습니다. 서버에서 15분 동안 응답을 보관하고, 실패하면 마지막 정보를 최대 2시간 동안 사용합니다. 날씨는 안내 상자 없이 하늘과 창밖에 반영합니다.
- 기본 Open-Meteo API는 비상업적 이용과 평가용입니다. 상업적 운영에는 사용 조건을 확인하고 구독이 필요하면 `OPEN_METEO_API_KEY` 환경 변수에 키를 넣습니다. 키가 있으면 서버가 고객용 주소로 요청하며, 키는 브라우저에 전달하지 않습니다. 데이터 출처는 화면에 표시합니다.

## 배포 (무중단)

AWS 서울 리전 EC2 (t4g.small, Amazon Linux 2023, Project=harudle).
주소는 https://campus.harudle.com 이고, Caddy가 인증서를 자동으로 받습니다. 앱은 3000번, Caddy가 80·443을 받습니다.

`main`에 푸시하면 끝입니다. 서버의 감독 프로세스가 20초 안에 알아채고 아래 순서로 바꿉니다.

1. **검사**: 새 커밋을 임시 폴더에 풀어 `scripts/check.mjs`를 돌립니다. 실패하면 배포하지 않습니다.
2. **새 워커**: 같은 포트에 새 버전 워커를 띄우고, 피드를 미리 받아 둔 뒤 "준비됐어요"를 받을 때까지 기다립니다.
3. **옛 워커 비우기**: 새 연결을 끊고, 처리 중인 요청을 마친 뒤 내려갑니다. 접속 중인 크루는 WebSocket이 끊기자마자 새 워커로 다시 붙습니다 (0.2초 안팎).
4. **되돌리기**: 새 워커가 30초 안에 준비되지 않거나 죽으면, 옛 워커를 그대로 두고 작업 폴더를 이전 커밋으로 돌립니다. 그 커밋은 다시 시도하지 않습니다.

페이지를 열어 둔 사람에게는 "새 버전이 나왔어요 · 새로고침" 버튼이 뜹니다. 강제로 새로고침하지는 않습니다.

- 지금 어떤 버전이 돌고 있는지: `curl https://campus.harudle.com/healthz` → `ok <커밋>`
- 되돌리고 싶으면: `git revert` 후 푸시하면 같은 방식으로 무중단 반영됩니다.
- `server.js`(감독) 자체를 바꾼 커밋은 워커만 먼저 바뀌고, 감독은 다음 재시작 때 반영됩니다.
- 끄려면 서비스 환경 변수에 `AUTO_DEPLOY=0`.

### 검증한 것

로컬에서 가짜 원격 저장소로 세 가지 커밋을 차례로 밀어 넣는 동안, `/healthz`를 50ms마다 1,316번 두드려 실패 0번이었습니다.

| 커밋 | 결과 |
| --- | --- |
| 정상 변경 | 무중단 교체, WebSocket은 0.2초 만에 새 워커로 재접속 |
| 실행하자마자 죽는 코드 | 새 워커만 죽고 옛 워커 유지, 작업 폴더 되돌림 |
| 엘리베이터 홀이 막히는 배치 | 검사에서 걸러져 배포 안 됨 |

층 배치를 바꾸려면 `src/engine/world.ts`의 `makeFloor()`만 고치면 됩니다. (`public/`은 예전 서버용 단일 HTML 버전이 남아 있는 자리이고, 사이트 정적 파일은 `static/`에 둡니다.)
