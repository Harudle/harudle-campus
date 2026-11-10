# 1:1 대결 설계

크루끼리 1:1로 대결하는 기능의 설계입니다. 구현하는 사람(사람이든 에이전트든)은 이 문서를 기준으로 맞춥니다. 바꿔야 할 결정이 생기면 이 문서도 함께 고칩니다.

## 결정 사항

- 신청: 채팅 `/대결 이름 [종목]`. 종목을 빼면 신청하는 사람에게 종목 고르는 창이 뜹니다. **종목은 신청한 사람이 정합니다.**
- 초대장: 상대 화면에 초대장(종목 포함)이 뜨고 수락·거절합니다. 30초가 지나면 만료됩니다.
- 수락하면 둘 다 대결장으로 이동 → 3·2·1 → 경기 → 결과 → 원래 있던 층·자리로 돌아갑니다.
- 관전: `/관전 이름`으로 진행 중인 경기를 봅니다. 관전자는 경기에 영향을 줄 수 없습니다. `/관전`(이름 없이) 또는 화면의 나가기 버튼으로 돌아갑니다.
- 보상(컷)은 없습니다. 전적(승·패·무)과 점프맵 코스 기록만 남깁니다.
- 종목 4개: 점프맵 빨리 깨기, 사격 대결(서로 맞혀 체력 깎기), 과녁 사격(움직이는 과녁 많이 맞히기), 복싱.

## 공간: 하늘 대결장

캠퍼스 11~13층은 실제 건물을 옮겨 빈 공간이 없어서, 대결장은 **건물 위 하늘에 떠 있는 가상 층**으로 둡니다.

| 층 번호 | 종목 |
|---|---|
| 21 | 점프맵 |
| 22 | 사격 대결 |
| 23 | 과녁 사격 |
| 24 | 복싱 |

- 대결장 층은 `src/engine/world.ts`의 `FLOORS`에 들어가 기존 이동 · 충돌 · 점프 · 층 표시를 그대로 씁니다. 배치는 종목마다 `src/duel/arena/<종목>.mjs`의 순수 데이터(THREE 없이)로 적습니다. **서버 규칙도 같은 배치(부활 자리 · 코스 · 경기장 범위)를 읽어야 해서 `.ts`가 아니라 `.mjs`입니다**(서버에는 빌드 도구가 없다). world.ts는 서버용 `dist-check/world.mjs`로도 묶이므로 무거운 것을 가져오면 안 됩니다.
- 대결장 층은 엘리베이터 · 포털이 없고, 방(난간) 둘레만큼 두꺼운 판으로 떠 있습니다. 바깥 유리벽 · 천장이 없고, 건물(캠퍼스 타워)은 14층 지붕까지 서 있어 그 위 하늘에 뜬 모습입니다. 층 표시는 `⚔️ 점프맵 대결장`처럼 보입니다.
- 엘리베이터 층 목록, NPC 배치, 층 이동 포털에는 대결장 층이 나오지 않습니다.
- **경기 방(인스턴스)**: 같은 대결장 층에서 여러 경기가 동시에 열립니다. 위치 정보(presence)에 경기 방 번호 `ar`를 넣고, 대결장 층에서는 **같은 `ar`인 사람만** 서로 보입니다.
- 서버는 대결장 층의 방 이름(`rm`)을 `duel:<ar>`로 정합니다. 그래서 근처 채팅과 음성은 같은 경기 방(선수 둘 + 관전자) 안에서만 오갑니다(거리 제한 없음). `rm`에 "회의실"이 없으므로 화면 공유는 꺼집니다. 브라우저도 같은 `rm`을 써야 음성 영역(`areaOf`)이 서버와 맞으므로 엔진의 `roomKey()`가 대결 중이면 `duel:<ar>`를 돌려줍니다.
- presence에 서버가 붙이는 것: `ar`(경기 방), `dr`(1 선수 · 2 관전). 크루 목록과 `/찾기`는 층 대신 "⚔️ 대결 중" · "👀 관전 중"으로 보여 줍니다. 대결장 위치일 때만 `u`(올라선 높이)를 12m까지 받습니다(발판이 높다).
- 서버는 지금 경기 중이거나 관전 중인 사람에게만 대결장 층과 그 `ar`를 허락합니다(경기가 닫힌 뒤 5초는 돌아가는 중이라 더 받아 줍니다). 그 밖의 사람이 보낸 대결장 위치는 11층으로 돌립니다.
- 경기에 들어가기 전 층 · 좌표를 브라우저가 기억해 두고(`localStorage ww.duelBack`, 새로고침해도 남는다), 경기가 끝나거나 서버 연결이 끊기면 그 자리로 돌려보냅니다. 연결이 끊기면 20초 기다렸다 돌려보내고, 그 안에 다시 붙어 서버가 경기를 알려 주면 이어서 합니다. 다시 붙었는데 서버가 경기가 없다고 하면(`phase: "none"`, 예: 배포로 서버가 바뀜) 바로 돌려보냅니다.

## 흐름과 규칙

```
invite ─(수락)→ countdown(3초) → playing → result(5초) → 복귀
   └─(거절 · 30초 만료 · 취소)→ 끝
```

- 이미 경기 중 · 초대 대기 중 · 관전 중인 사람에게는 신청할 수 없습니다. 나 자신도 마찬가지입니다.
- 같은 상대에게는 5초에 한 번만 신청할 수 있습니다.
- 설정창(설정 탭)에 "대결 신청 받기" 켜고 끄기를 둡니다(기본 켬, 브라우저에 저장(`ww.duelAccept`), 접속할 때 `duel:hello`로 서버에 알림).
- 초대장은 화면 위쪽 가운데에 뜨고, 버튼이나 **Y 수락 · N 거절**, 채팅 `/수락` · `/거절`로 답합니다. 답하거나 30초가 지날 때까지 남아 있습니다. 보낸 신청은 남은 시간과 취소 버튼으로 보입니다.
- 3 · 2 · 1 동안과 결과 동안 선수는 움직이지 못합니다(종목이 경기 중에 따로 잠글 수도 있다). 수락 뒤 대결장으로 옮겨 가는 1.2초 동안은 "준비"가 뜹니다.
- 경기 중 연결이 끊기면 20초를 기다리고, 돌아오지 않으면 기권패로 처리합니다. 사람은 공개 주소(uid)로 구분합니다. 다시 접속하면 새 peer id를 받기 때문입니다.
- `/기권`으로 언제든 지고 나갈 수 있습니다. 신청한 사람은 `/종료`나 HUD 버튼으로 승패 없이 경기를 끝낼 수 있습니다(전적에 남기지 않음).
- 관전자는 대결장 안을 막힘 없이 다닙니다(벽 · 기둥에 끼지 않고 높은 곳은 그 위로). 선수 화면에서는 관전자가 보이지 않아 총알 · 시야를 가리지 않습니다.
- 서버가 상태와 결과를 정합니다. 승패 판정에 쓰는 사건(맞힘, 도착 등)은 브라우저 한쪽 말만 믿지 않고 서버가 위치 · 시간 · 간격으로 확인합니다.

## 채팅 명령어 (src/chat/commands.ts)

| 명령어 | 동작 |
|---|---|
| `/대결 이름 [종목]` | 신청. 종목 이름: 점프맵 · 사격 · 과녁 · 복싱 (영어 jump · shoot · target · box, 별칭은 `shared.mjs`). 이름에 띄어쓰기가 있어도 된다(끝 단어가 종목이면 종목) |
| `/대결 테스터 [종목]` | **개발 서버만**(`NODE_ENV`가 `production`이 아닐 때): 신청 · 수락 없이 바로 경기. 상대 「테스터」는 경기장 2번 자리에 서 있는 가짜 크루. 종목을 안 쓰면 종목 고르기 창. 운영 서버에선 "찾지 못했어요" |
| `/관전 [이름]` | 그 사람 경기 관전. 이름 없이 쓰면 관전 그만 |
| `/수락 [이름]` · `/거절 [이름]` | 받은 대결 신청에 답하기(이름이 없으면 가장 최근 신청) |
| `/종료` | 경기 끝내기. 신청한 사람만, 모든 종목에서. 승패 없이 끝나고 전적에 남기지 않는다(HUD의 「경기 끝내기」 버튼도 같다) |
| `/기권` | 진행 중인 경기 기권 |
| `/전적 [이름]` | 승 · 패 · 무와 점프맵 최고 기록 |

## 파일 구성

| 파일 | 내용 |
|---|---|
| `src/duel/shared.mjs` | 서버와 브라우저가 같이 쓰는 종목 목록(id · 이름 · 층 · 별칭 · 아이콘), 시간 상수(`DUEL`), `findGame` · `isArena` · `fmtMs` |
| `src/duel/arena/kit.mjs` | 배치 도우미: `arena(def)`, 낮은 난간 방 `ring(x, y, w, h)`, 바닥 색 `tint(...)`, 방향 상수, `rectDist` |
| `src/duel/arena/<종목>.mjs` | 대결장 배치(순수 데이터). world.ts가 층을 만들고 서버 규칙도 읽는다. |
| `src/duel/arena/index.mjs` | 대결장 모음 `ARENAS`, `arenaOfGame(game)` |
| `src/duel/furniture.ts` | 대결장 가구 그리기 등록부 `registerFurn(kind, draw)`. 엔진 buildFurn이 모르는 종류를 여기로 넘긴다 |
| `src/duel/client.ts` | 신청 · 초대장 · 종목 고르기 · 이동/복귀 · 관전 · 경기 HUD 틀 · 결과 화면 |
| `src/duel/games/<종목>.ts` | 종목별 브라우저 쪽 경기(그리기 · 입력 · 서버로 보내기) |
| `src/duel/games/index.ts` | 브라우저 종목 등록(`GAMES`). 여기 없는 종목은 종목 고르기 창에서 "준비 중" |
| `server/duel/index.js` | 서버 상태 · 메시지 · 관전 · 끊김 처리 · 전적 저장 |
| `server/duel/games/<종목>.js` | 종목별 서버 규칙(판정 · 점수 · 승패) |
| `server/duel/games/index.js` | 서버 종목 등록(`SERVER_GAMES`). 여기 없는 종목은 "준비 중"으로 신청을 받지 않는다 |
| `scripts/duel*.test.mjs` | 서버 규칙 시험(`npm test`) |

종목 id: `jump` · `shoot` · `target` · `box`.

## 브라우저 ↔ 서버 메시지

모두 WebSocket JSON입니다. `t`는 `duel:`로 시작합니다.

| 보내는 쪽 | t | 내용 |
|---|---|---|
| 브라우저 | `duel:invite` | `{ to: 상대 peer id, game }` |
| 브라우저 | `duel:cancel` | 보낸 초대 취소 |
| 브라우저 | `duel:answer` | `{ id, ok }` 초대 수락 · 거절 |
| 브라우저 | `duel:watch` | `{ peer }` 관전 시작, `{}` 관전 그만 |
| 브라우저 | `duel:forfeit` | 기권 |
| 브라우저 | `duel:prefs` | `{ accept: boolean }` 신청 받기 설정 |
| 브라우저 | `duel:records` | `{ u? }` 전적 묻기 |
| 브라우저 | `duel:game` | `{ id: 경기 id, ...종목별 내용 }` 선수만(경기 중일 때만 종목 규칙으로 간다) |
| 브라우저 | `duel:hello` | `{ accept }` 접속할 때마다(신청 받기 설정 + 지금 경기 맞추기) |
| 서버 | `duel:invited` | 나에게 온 초대 `{ id, game, from: { peer, u, name }, expiresAt }` |
| 서버 | `duel:invite-state` | 초대 상태 `{ id, role: from(보낸 사람) · to(받은 사람), state: pending · accepted · declined · expired · canceled · busy, game, expiresAt, from: { name }, to: { name } }`. busy는 보낸 사람에게만 |
| 서버 | `duel:match` | 경기 정보 `{ id, game, ar, floor, seat(0 · 1 · null=관전), players: [{ u, peer, name, away? }], phase: countdown · playing · result, startAt, endsAt, state, spawns, watch, watchers, serverTime }` 단계 · 상태가 바뀔 때마다. 경기가 닫히면(또는 관전을 그만두면) `{ id, phase: "closed" }`, hello에 경기가 없으면 `{ id: null, phase: "none" }` |
| 서버 | `duel:game` | `{ id, ...종목별 내용 }` 선수 둘과 관전자 모두에게 |
| 서버 | `duel:end` | `{ id, winner: u · null(무승부), seat: 이긴 자리 · null, reason: finish · timeout · forfeit · disconnect · (종목이 정한 것), summary }` |
| 서버 | `duel:records` | 전적 답 `{ u, mine, name, w, l, d, best: { "jump:<코스 id>": ms }, top: { 키: { ms, u, name } } }` |
| 서버 | `duel:error` | `{ code, text }` 사람이 읽을 안내 |

시각은 모두 서버 시각(ms)입니다. 브라우저는 기존 시계 맞춤(`startrack:clock`)의 답을 같이 받아 서버 시각을 추정합니다(`ctx.now()`). 맞추기 전에는 `duel:match`의 `serverTime`으로 대강 맞춥니다.

- 서버는 접속(peer)마다 대결 메시지를 2초에 60개까지만 받습니다.
- 전적은 `harudle-duels.json`(임시 폴더, 채팅 기록과 같은 곳)에 `{ users: { uid: { name, w, l, d, best } }, best: { 키: { ms, u, name } } }`로 4초마다 바뀐 것만 씁니다. 둘 다 끊겨 끝난 경기는 남기지 않습니다.

## 종목 인터페이스

새 종목은 아래 네 곳에만 파일을 더하고, 등록부 두 곳에 한 줄씩 더합니다. 엔진(`engine.ts`) · `app.js` · `server/duel/index.js` · `src/duel/client.ts`는 고치지 않는 것이 목표입니다(모자란 연결부가 있으면 엔진에 작은 hook을 더하고 이 문서에 적는다).

| 파일 | 등록 |
|---|---|
| `src/duel/arena/<id>.mjs` | 배치를 만들고 `ARENAS`에 넣는다 |
| `server/duel/games/<id>.js` | `server/duel/games/index.js`의 `SERVER_GAMES`에 한 줄 |
| `src/duel/games/<id>.ts` | `src/duel/games/index.ts`의 `GAMES`에 한 줄 |
| `scripts/duel-<id>.test.mjs` | `npm test`가 저절로 돈다 |

### 대결장 배치 (`src/duel/arena/<id>.mjs`)

```js
export const BOX_ARENA = arena({
  f: 24, game: "box", info: "복싱 링",                 // 층 · 종목 · 층 표시 글
  rooms: [ring(18, 10, 20, 20), ring(24, 16, 8, 8)],   // 낮은 난간으로 사방이 막힌 방(문 없음). 바닥판은 방들을 두른 만큼만 그린다
  zones: [tint(25, 17, 6, 6, "링", "#F7E7C6")],        // 바닥 색(checker: [색, 색] 바둑판)
  furn: [{ kind: "jblock", x, y, w, h, top: 1.2 }],     // 가구. top: 올라설 윗면 높이(m) · walk: true 밟고 지나감 · bounce: 올라서면 튕기는 속도
  spawns: [[x, y, 방향], [x, y, 방향]],                 // 선수 자리(서버가 match.spawns로 바꿀 수 있다)
  watch: [[x, y, 방향], ...],                           // 관전 자리(여기서 ±0.6칸 흩어 선다)
  starts: [[x, y], ...],                                // (생략 가능) 걸어서 닿는 칸을 셀 출발점. 없으면 watch + spawns
});
```

- 좌표는 캠퍼스와 같은 56×40칸(한 칸 1.25m), 방향은 엔진의 `me.h`(0 남 · π/2 동 · π 북 · −π/2 서).
- `top`이 있는 가구는 그 높이로 올라섭니다(엔진 `topOf`). 정밀 충돌은 바닥 위 0.06~1.5m 사이 메시를 깎으므로, 높은 발판은 바닥에서 솟은 기둥으로 그립니다(떠 있는 판은 충돌이 안 생긴다).
- 엔진이 모르는 가구 종류는 `registerFurn(kind, draw)`(`src/duel/furniture.ts`)로 종목 파일에서 그립니다. `draw(G, o, k)`의 `k`는 엔진 그리기 도구(`box` · `cyl` · `ball` · `board` · `toon` · `solidMesh` · `canvasTex` · `signTex` · `C` · `S` · `wx` · `wz` · `HAND` · `INK`)와 이 가구의 가운데 `x` · `z`, 크기 `w` · `d`(m), 층 `fl`입니다. `y`는 층 바닥 기준.

### 서버 (`server/duel/games/<id>.js`)

```js
export default {
  id: "jump",
  duration: 180000,                    // 경기 시간(ms). endsAt = startAt + duration
  setup(match, api) {},                // 수락 직후(3·2·1 전) 한 번. match.state(공개) · match.spawns · match.watch를 정하고, 비밀 상태는 match.<id>에
  start(match, api) {},                // (선택) playing이 된 순간
  message(match, seat, payload, api) {},  // 선수가 보낸 duel:game(playing일 때만). payload에는 t · id가 빠져 있다
  tick(match, now, api) {},            // playing 동안 100ms마다. 시간이 다 되면 스스로 api.finish를 부른다(안 부르면 2초 뒤 무승부로 끝난다)
  end(match, api) {},                  // (선택) 결과가 정해진 순간
}
```

`match`: `{ id, game, ar, floor, players: [{ u, peer, name, away, hist }], watchers: Map(uid → peer), phase, startAt, endsAt, state, spawns, watch }`. `match.state`는 `duel:match`로 모두에게 가므로 공개해도 되는 것만 둡니다.

`api`:

| 이름 | 하는 일 |
|---|---|
| `now()` · `random()` | 시계 · 난수(시험에서 바꾼다) |
| `broadcast(match, payload)` | 선수 + 관전자에게 `duel:game { id, ...payload }` |
| `send(match, seat, payload)` | 그 선수에게만 `duel:game` |
| `sync(match)` | `duel:match`를 다시 보낸다(`match.state`를 바꿨을 때) |
| `finish(match, winnerSeat \| null, reason, summary)` | 결과 → 5초 뒤 닫힘. 전적(승 · 패 · 무)은 여기서 남는다 |
| `presence(match, seat)` | 그 선수의 마지막 위치 `{ f, x, y, u, h, jc, fc, fh, hc, …, at }` |
| `history(match, seat, ms = 1000)` | 최근 `ms` 동안의 위치들(오래된 것부터, 3초까지 남긴다). 맞힘 판정용 |
| `at(match, seat, time)` | `time`(서버 ms)에 가장 가까운 위치 |
| `best(match, seat, key, ms)` | 낮을수록 좋은 기록 남기기 → `{ mine: 내 최고 갱신, top: 키 전체 최고 갱신, prev }` |
| `name(match, seat)` | 선수 이름 |

### 브라우저 (`src/duel/games/<id>.ts`)

```ts
export const game: DuelGame = {
  id: "jump",
  start(ctx): DuelRun,   // 대결장에 도착한 뒤(선수 · 관전자 모두). 돌려준 객체가 경기 동안 살아 있다
}
type DuelRun = {
  tick?(dt: number, t: number): void      // 매 프레임(대결장 층에 있을 때)
  message?(payload: any): void            // 서버가 보낸 duel:game(t · id 빠짐)
  match?(match: DuelMatch): void          // 단계 · 상태가 바뀌었을 때
  key?(e: KeyboardEvent): boolean         // keydown · keyup 모두. keydown에서 true면 엔진 기본 동작을 막는다
  pointer?(e: MouseEvent): boolean        // mousedown · mouseup(마우스 고정 중이거나 화면을 눌렀을 때). mousedown에서 true면 엔진은 걷기 · 고르기 · 종이 총 발사를 안 한다
  result?(end: DuelEnd): string           // 결과 카드에 덧붙일 한 줄
  stop(): void                            // 경기 화면을 나갈 때. 만든 것을 모두 치운다
}
```

종목이 던진 오류는 잡아서 그 종목만 멈춥니다(캠퍼스는 계속 돈다). `stop` 뒤에는 틀이 걷기 잠금 · 빠르기 · 총 막기 · 팔 자세를 되돌리고 `onFire` 등 hook을 지웁니다.

`ctx`(정확한 타입은 `src/duel/client.ts`의 `DuelCtx`):

| 이름 | 내용 |
|---|---|
| `THREE` · `scene` · `camera` · `kit` | three.js, 장면, 카메라, 엔진 그리기 도구(가구와 같은 모양새) |
| `match` · `seat` · `mine` · `game` · `floor` | 늘 최신 경기 정보, 내 자리(null 관전), 내가 선수인지 |
| `group` | 대결장 층 묶음(층 높이에 놓여 있다). 여기 붙이면 y 0이 바닥 |
| `grid` | `{ W, H, S, wx, wz, tX, tY, y0, topAt(x, y), fl }` 칸 ↔ 월드 변환, 층 바닥 높이, 올라선 높이 |
| `me` | 읽기 전용 `{ f, x, y, h, up, jz, jv, moving, running, act }` |
| `place(x, y, h?)` | 나를 그 칸으로(발판 위면 그 위에). 들어가서 볼 때는 카메라도 그쪽을 본다 |
| `lock(on)` · `speed(k)` · `canFire(on)` · `doubleJump(on)` | 걷기 · 점프 잠금, 걷기 빠르기 배수, 종이 총 막기, 더블 점프 허락(사격은 끈다) |
| `jump()` · `bounce(v)` | 점프 키와 같게, 위로 튕기기(m/s, 엔진 점프 4.6) |
| `doll(who)` · `pos(who)` · `name(who)` | 캐릭터(`root` · `turn` · `anim`), 위치 `{ f, x, y, h, up, jz, presence }`, 이름. `who`: 0 · 1 · `"me"` · `"foe"`. 캐릭터는 외형이 바뀌면 새로 만들어지므로 붙인 소품은 매 프레임 확인한다 |
| `act(name \| null)` | 내 동작(`"gun"` 종이 총 꺼내기 등). 다른 선수의 동작은 presence(`gn` 등)로 자동으로 보인다 |
| `arms(who, [rx, rz, lx, lz] \| null)` | 팔 자세 덮어쓰기(라디안, 캐릭터의 오른팔 · 왼팔). 쉬는 자세 `[0, -.35, 0, .35]`, 앞으로 뻗기 x = -1.45. 다른 크루 화면에 보이려면 `duel:game`으로 알려 각자 `arms`를 부른다 |
| `fire(aim?)` | 종이 총 한 발(꺼내 들고 있어야 한다, 0.25초 간격). 엔진 기본(고정 중 왼쪽 클릭 · F)도 그대로 쏜다 |
| `shootPaper(x, y, dir, lift, who?)` · `hitReact(who, dir)` | 종이 총알 모양만 · 맞은 흔들림 |
| `onFire(fn)` | 내가 쐈을 때 `{ x, y, dir, lift, at(서버 ms) }` → 서버로 쏜 것을 알릴 때 |
| `onBullet(fn)` | 날아가는 모든 총알의 한 걸음마다 `{ pos(월드), vel, mine, by }`. true면 거기서 맞은 것으로 멈춘다(과녁) |
| `onBulletHit(fn)` | 총알이 사람에게 맞았을 때 `{ ..., target }`. true면 엔진 기본(내가 맞으면 hc로 알림)을 안 한다 |
| `send(payload)` · `sync()` | 서버로 `duel:game`(선수만), 내 위치를 바로 보내기(판정 메시지 직전에) |
| `hud` | 경기 틀 안 종목 HUD 자리(DOM). `stop`에서 비워진다 |
| `myHp(hp, max)` | 아래 독에 내 체력 막대(선수만, null이면 감춘다). 종목 정의의 `keys`(`[{ label, keys }]`)는 선수가 대결장에 있는 동안 독의 표현 버튼(1~4 · Z · 폭죽) 자리에 조작 키로 보인다 |
| `toast(h, p?, ms?)` · `note(text)` · `now()` · `touch` | 안내, 채팅창 안내 줄, 서버 시각 추정, 터치 기기 |

틀(client.ts)이 하는 것: 초대장 · 보낸 신청 · 종목 고르기 창, 대결장으로 옮기기(선수는 `spawns[seat]`, 관전자는 `watch` 중 하나)와 돌아오기, 경기 틀(종목 이름 · 두 선수 · 남은 시간 · 관전 중/나가기), 3·2·1 · 시작!, 결과 카드(승리 · 패배 · 무승부 · 이유 + `result()`), 대결장 안에서는 같은 `ar`인 사람만 보이기.

### 엔진 연결부 (`src/engine/engine.ts`)

엔진은 `duelUi`(`mountDuel(host)`)와 `duelMove = { lock, speed, noFire, jumps }`만 압니다. 연결부(검색어로 찾는다):

- `mountDuel({` — host: 엔진 기능 빌려주기(`cmdHost` 바로 앞)
- `buildFurn`의 `default: drawFurn(G, o, fl)` · `setFurnKit(...)` — 대결 가구 등록부
- `buildFloor`의 `fl.arena` — 떠 있는 판 · 바깥 유리벽 · 천장 없음 / `showFloors`의 `isArena(me.f) ? 15` — 건물을 14층 지붕까지
- `bakeCollision`의 `topOf(o)` · world.ts `topOf` · `walkThrough` — 배치의 `top` · `walk`
- `step`의 `duelMove.lock` · `duelMove.speed`, 트램펄린의 `o.bounce`, `jump()`의 `duelMove.lock`
- `fireFirework`의 `duelMove.noFire` · `duelUi?.fired`(쏜 방향 `fh`는 −π~π로 맞춰 보낸다: 서버 sanitize가 ±50으로 자르고, 사격 판정이 그 값을 쓴다), `tickFireworks`의 `duelUi?.bullet` · `duelUi?.bulletHit`
- keydown `duelUi?.key(e)`(Esc · 창 처리 다음, 게임 키보다 먼저), keyup, `mousedown` · `mouseup` · `contextmenu`, `endDrag`의 `duelUi?.ateClick()`, `uiOpen`의 `duelUi?.modal()`
- `goFloor(f, spawn, exact)` — exact면 그 자리 그대로, `spawn[2]`가 있으면 그쪽을 본다
- `roomKey()` · `updateMediaWorld` · `sendPresence`의 `ar` — 경기 방, `syncPeers`의 `duelUi?.hides(s)`
- `wsRoom`: `duel:*` → `duelUi.net`, `startrack:clock` → `duelUi.clock`, 열리면 `online(true)`(hello), 닫히면 `online(false)`
- 크루 목록 `actIcon`의 `dr` · 층 칸 `⚔️`, `tickFollow`(대결장으로는 따라가지 않는다), 층 표시 `updateFloorHud`
- 캐릭터 팔: `dolls.ts` `anim.arms` → `Dolls.tsx` → `Avatar.tsx` pose `arms`

### 서버 연결부 (`app.js`)

`createDuel({ peers, send })`, `setInterval(duel.tick, 100)`, `sanitize(p, duel.arenaOf(uid))`(대결장 위치 허락 · `rm` · `ar` · `dr`), "p"마다 `duel.presence(id, presence)`, `duel:*`는 uid가 정해진 뒤 `duel.message(id, msg)`, 끊기면 `duel.left(id)`.

## 종목 규칙

### 점프맵 (`jump`, 21층)

- 코스 3~4개 중 서버가 하나를 고릅니다. 두 선수가 같은 코스를 동시에 달리고 서로 부딪히지 않습니다.
- 미니 온리업 탑: 출발대에서 탑 바깥 바퀴(15×15칸 둘레)를 시계 방향으로 돌며 오르고, 체크포인트(안쪽 바퀴 첫 칸, 17~24m)에서 안쪽 바퀴(9×9칸)를 한 번 더 돌아 꼭대기 도착대(26~35m)로 갑니다. 발판은 거의 한 칸짜리이고 틈은 2~3칸, 한 번에 1~1.3m씩 오릅니다(코스마다 가끔 0.5m 내려가거나 트램펄린). 바닥에 떨어지면 체크포인트(지나기 전이면 출발대)로 돌아가고, 떨어지다 아래 바퀴 발판에 걸리면 거기서 다시 오릅니다. 점프 한 번은 약 0.7m, 더블 점프까지 약 1.3m를 올라갑니다. 이 층만 카메라 천장을 40m로 둡니다(`JUMP_CEIL`).
- 체크포인트 통과와 도착은 브라우저가 보내고, 서버가 시작 뒤 지난 시간과 체크포인트 순서, 구간별 최소 시간을 확인합니다.
- 먼저 도착하면 승리합니다. 제한 시간 4분 안에 아무도 못 오면 체크포인트를 더 많이 지난 사람이 이기고, 같으면 무승부입니다.
- 코스별 최고 기록을 남깁니다.
- 구현: 21층을 사분면 넷(난간 안 25×17칸)으로 나눠 사분면마다 탑 하나(`JUMP_COURSES`: 하늘 탑 · 고물 탑 · 통통 탑 · 온리 업). 코스는 `DEFS`의 seed · 오르는 높이 범위 · 내려가는 간격 · 트램펄린 자리로 만들어지고(바퀴 둘레를 3 · 4칸 걸음으로), `path`가 밟는 순서 전체입니다. 발판은 공중에 떠 있는 잡동사니로 그리지만(`look`: crate · pipe · can · books · beam) 부딪히는 것은 바닥까지 이어진 칸 기둥(`jblock`)이라, 떨어지다 옆면에 걸릴 수 있습니다. 트램펄린은 `jtramp`(8m/s로 튕긴다), 출발 · 체크포인트 · 도착은 `jpad`. 바닥(구름)에 발이 닿으면 떨어진 것.
- 발판 번호: `pads[0]` 출발대, 마지막이 도착대. 브라우저는 다음 발판 윗면에 서면 위치를 먼저 보내고 `{ k: "pad", i }`를 보낸다. 서버는 `i = 지금 + 1`, 지난 발판에서 `minT[i]`(밟는 순서대로 간 거리를 달리기 7.3칸/초로 간 시간의 50%) 이상, 최근 1.5초 위치가 그 발판 2.5칸 안인지 본다. 안 맞으면 `{ k: "reject", i: 서버가 아는 발판 }`을 그 선수에게만 보내고 브라우저는 그 발판으로 돌아간다. 받으면 모두에게 `{ k: "pad", seat, i, ms }`.
- `match.state = { course, cp: [선수별 발판], pads }`. 결과 summary: 도착 `{ course, ms, personal, record }` · 시간 종료 `{ course, cp }`. 기록 키는 `jump:<코스 id>`.
- 탑 모양이 깰 수 있는지(밟는 순서대로 오를 높이 · 틈 3칸 이하, 겹치지 않음, 사분면 안, 20m 넘게)는 `scripts/duel.test.mjs`가 봅니다. 구간 최소 시간 `minT`는 밟는 순서대로 간 거리를 달리기 빠르기로 간 시간의 절반입니다.

### 사격 대결 (`shoot`, 22층)

- 높이가 여러 가지인 엄폐물이 놓인 28×24칸(35×30m) 경기장에서 **종이 AK-47**로 서로 쏩니다(FPS 1:1처럼). 선수는 **1인칭만**(V · 시점 버튼 막음), 이 층은 머리 위 이름표를 숨깁니다. 누르고 있으면 연사(0.13초), **탄창 20발**, R이나 다 쓰면 2.2초 장전, 쏠 때마다 시야가 조금 위로 튑니다. 걷기 75% · 달리기 60%, 더블 점프 없음.
- 체력 200, 몸에 맞으면 15, 머리에 맞으면 1.75배인 26입니다(몸만이면 열네 발, 머리만이면 여덟 발). 라운드마다 체력과 탄창이 다시 차고, 3라운드 중 2라운드를 먼저 이기면 승리입니다.
- 헤드샷: 브라우저가 맞은 높이(`hy`, 상대 발에서 m)를 보내고 0.7m 위면 머리로 봅니다. 서버는 쏜 높이(발 + 총구 0.82m) · 위아래(`fp`) · 거리로 셈한 총알 높이와 말이 될 때만 받습니다(상대가 뛰는 중일 수 있어 아래로 1.4m, 위로 0.45m 봐줍니다). `fp`가 없는 예전 버전 발은 몸으로만 칩니다.
- 타격감: 맞힌 순간 조준점 둘레에 히트마커(X, 몸 흰색 · 머리 빨강)와 데미지 숫자, 맞힌 소리(몸 '틱' · 머리 '띵')가 납니다. 쓰러뜨리면 서버가 받은 뒤 큰 빨간 X와 「처치!」. 맞은 쪽은 붉은 테가 뜨고 헤드샷이면 더 진합니다.
- 라운드 제한 60초입니다. 시간이 다 되면 체력이 많은 쪽이 라운드를 이기고, 같으면 다시 합니다.
- 명중은 서버가 판정합니다(지금 캠퍼스의 종이 총은 맞은 사람 브라우저가 판정하므로 그대로 쓰지 않습니다). 쏜 위치 · 방향 · 시각과 상대의 최근 위치로 확인하고, 연사 간격(0.25초)을 지킵니다.
- 구현: 22층 난간 안 28×24칸(`SHOOT_FIELD`)에 엄폐물 25개(`SHOOT_COVER`)와 단상 넷(`SHOOT_DECKS`), 가운데를 두고 180도 돌려도 같은 모양. 엄폐물은 올라설 수 없고 제 높이(`ht`, `COVER_HT`)까지 오는 총알을 막는다: 높은 합판 벽 2.8m · 컨테이너 2.6m · 2단 상자 2.4m는 뛰어도 다 가리고(서버도 늘 막는다), 상자 · 통 1.2m는 뛰면 너머가 보이며(서버는 0.65m 넘게 떠서 쏘면 받는다), 모래주머니 0.8m는 다리만 가린다(서버는 막지 않는다). 단상은 계단 0.45m를 밟고 뛰어 0.9m에 올라서 상자 너머를 쏘는 자리. 엔진은 가구의 `ht`를 칸마다 모아(`coverHt`) 총알과 조준점이 같이 쓴다. 선수 자리는 북서(빨강) · 남동(파랑) 구석, 관전석은 남쪽 난간 너머 따로 둘린 방. 규칙 숫자는 `SHOOT`(arena/shoot.mjs)에 모아 서버 · 브라우저가 같이 쓴다.
- 브라우저: 선수는 3·2·1부터 결과 전까지 늘 종이 총을 든다(넣거나 다른 동작으로 바뀌면 0.5초 뒤 다시 든다, 1~4 · Z 동작 키는 막는다). 쏘기는 엔진 그대로(고정 중 왼쪽 클릭 · F · 모바일 🎆). 라운드가 진행 중일 때만 `canFire`, 관전자는 쏘지 못한다. 경기가 끝나면(`stop`) 총을 넣는다.
- 판정 흐름: `onFire`로 내 발(방향 · 시각 · 높이)을 기억해 두고, `onBulletHit`에서 내 총알이 상대 캐릭터에 닿으면 속도 방향으로 그 발을 찾아 `{ k: "hit", to, dir, at, lift }`를 보낸다. `onBulletHit`은 늘 true를 돌려 맞은 쪽의 엔진 기본 처리(hc)를 막는다.
- 서버(`judge`): 라운드 진행 중 · `to`가 상대 · 시각이 2초 안 · 브라우저 시각 간격 0.23초 이상 → 쏜 사람 위치 기록에서 그 발(fk이고 fc가 바뀐 위치, fh가 dir과 같고, 아직 안 쓴 fc)을 찾는다(위치 · 방향은 이 기록을 쓴다). 서버에 닿은 간격도 0.115초 이상. 그다음 상대의 위치 기록(쏜 때 −1초 ~ +1.6초, 위치 사이 가운데 포함) 중 하나라도 앞쪽 16칸 안 · 쏜 줄에서 옆으로 1칸 안 · 총알이 닿을 시각과 1.1초 안 · 엄폐물에 가리지 않음(0.65m 넘게 뛰어 쏘면 넘어간다)이면 받는다. 안 받으면 그 선수에게만 `{ k: "miss", why }`(round · self · bad · late · fast · shot · behind · far · cover · aim).
- 받으면 모두에게 `{ k: "hit", seat, to, dir, hp }` → 모두 `hitReact`. 체력이 0이면 라운드 끝 `{ k: "round", seat(이긴 자리 · null), why: ko · time · tie, round, wins, hp }`. 다음 판은 3초 3·2·1(`phase: "ready"`) 동안 체력이 차고 선수는 자기 구석으로 옮겨져 제자리. 무승부(tie)면 같은 라운드를 다시 하고, 다시 하는 판까지 6판이 되면 이긴 라운드 수로 끝낸다(같으면 무승부).
- `match.state = { n(몇 번째 판), round, again, phase: ready · go · over, at(그 판 시작 시각), hp: [], wins: [], last }`. 서버는 판마다 `match.endsAt`을 그 라운드 끝으로 바꾼다(틀의 남은 시간이 라운드 남은 시간. 3·2·1 동안은 1:33처럼 3초 더 보인다). 결과: 이유 `ko`(마지막 라운드를 KO로) · `timeout`, summary `{ wins, rounds }`, 결과 카드에 "라운드 2 : 1".
- 화면: 선수는 경기 틀 아래 라운드 · 남은 시간 · 이긴 라운드 점(나 : 상대)과 아래 독의 조작 키 · 내 체력 막대, 화면 오른쪽 아래 탄창(장전 막대), 십자 조준점. **상대 체력은 선수에게 안 보입니다.** 관전자는 두 선수 체력 막대와 머리 위 체력 막대(엄폐물에 가려진다). 라운드 사이 3·2·1, 명중 표시, 맞으면 화면 둘레가 붉게.
- 종목이 엔진에 부탁하는 것(`ctx`): `view("first")` · `tags(false)` · `gun("ak")`(이 층 종이 총 모양, 총알 `bulletSpeed` 34m/s) · `fireGap(130)` · `recoil(k)`. 경기가 끝나면 틀이 모두 되돌린다.
- 탄창은 브라우저가 지킵니다(서버는 연사 간격 `GAP`만 본다).

### 과녁 사격 (`target`, 23층)

- 60초 동안 서버가 움직이는 과녁을 만듭니다(같은 과녁을 둘이 같이 봅니다). 과녁은 정해진 길을 따라 움직이다 사라집니다.
- 먼저 맞힌 사람이 점수를 가져갑니다. 보통 과녁 1점, 금색 과녁 3점입니다.
- 맞힘은 브라우저가 보내고, 서버가 그 과녁이 아직 살아 있었는지, 쏜 위치와 방향이 말이 되는지, 연사 간격을 확인합니다.
- 점수가 높으면 승리, 같으면 무승부입니다.
- 총은 사격 대결과 같은 **종이 AK-47**입니다(`src/duel/games/ak.ts`를 같이 쓴다): 1인칭만, 누르고 있으면 연사(0.13초) · 반동, 탄창 20발과 장전(R · 다 쓰면 2.2초, 장전 모션), 오른쪽 클릭 조준. 총알 34m/s에 맞춰 `TARGET.BULLET` · `RANGE` · `GAP`(110ms)을 정했습니다. 이름표는 그대로 보입니다.
- 구현: 23층은 북쪽 과녁 마당(레일 넷, `TARGET_ROWS`) · 가운데 사대(낮은 줄무늬 카운터 `tcounter` 뒤 부스 둘 `TARGET_BOOTHS`, 칸막이 `tdiv`) · 남쪽 관전석. 뒷벽(`tback`) 위에 점수판을 그려 관전석에서도 보입니다. 종이 총은 위아래로 겨누지 못하고 13칸쯤 가면 떨어지므로 레일은 사대에서 4~12칸 사이이고, 과녁은 바닥에서 1.5m까지 높이 상관없이 가로 거리(0.5m)로만 맞힙니다. 카운터는 0.45m라 총알이 위로 지나갑니다.
- 일정 · 길 · 맞힘 셈은 `src/duel/target-path.mjs`(서버 · 브라우저 같이): `targetPlan(seed)` 0.55~1.2초마다 과녁 하나(보통 3.6~5.6초, 금색은 8개 중 하나꼴로 2.2~2.8초 동안 빠르게), 길은 `slide`(한 번 미끄러지기) · `swing`(오락가락), `targetAt(과녁, 지난 ms)`, `shotHits(과녁, x, y, 방향, 쏜 시각, 허용)`(총알이 날아가는 동안 과녁이 움직인 것까지 셈).
- 서버: setup에서 seed로 일정을 만들고(공개 안 함), 나오기 0.6초 전에 `{ k: "spawn", tgt }`를 모두에게. 브라우저는 내 총알이 과녁에 닿으면(`onBullet`) 그 총알을 쏜 기록(`onFire`)을 찾아 `{ k: "hit", tg, x, y, dir, at }`. 서버는 이미 가져감 · 아직 안 알림 · 쏜 시각(시작 전 · 앞날 · 2.5초 넘게 전 · 끝난 뒤) · 간격(0.24초) · 쏜 자리가 내 부스(0.6칸 여유)이고 최근 1초 안 위치에서 1.5칸 안 · 조준(맞힘 반지름 + 0.35칸 + 과녁 빠르기 × 0.15초)을 보고, 맞으면 `{ k: "take", tg, seat, pts, g, score }`를 모두에게, 아니면 그 선수에게만 `{ k: "miss", tg, why }`. 시간이 다 되고 0.3초 뒤(마지막 총알 몫) 점수로 끝냅니다(reason `timeout`).
- `match.state = { score, hits, gold, live }`. `live`는 지금 알린 과녁이라 관전 · 다시 접속하면 이것부터 그립니다. 결과 summary `{ score, hits, gold }`.
- 브라우저: 경기 동안 선수는 종이 총을 자동으로 들고(넣어도 1초 뒤 다시), 3·2·1과 결과 동안은 못 쏩니다. 카운터를 넘어 과녁 마당이나 옆 부스로 가면 내 부스로 돌려놓습니다. 과녁은 누구 총알이든 닿으면 거기서 멈추고, 점수는 서버 take로만 바뀝니다. 가져간 과녁은 뒤로 넘어가며 선수 색 `+점수 이름` 꼬리표가 뜨고, 경기 틀 아래에 두 선수 점수와 누가 가져갔는지 한 줄이 나옵니다(스타일은 종목 파일이 `<style id="targetDuelCss">`로 넣는다).
- 주의(모든 종목): `duel:game`의 `t` · `id`는 틀이 쓰는 자리(메시지 종류 · 경기 id)라 종목 내용에 같은 이름을 쓰면 덮여서 메시지가 버려집니다. 그래서 과녁 번호는 `tg`, 과녁 정보는 `tgt`로 보냅니다.

### 복싱 (`box`, 24층)

- 6×6칸 링이고, 로프 밖으로 나갈 수 없습니다. 둘 다 글러브를 낍니다.
- 잽(왼쪽 클릭 또는 J) 데미지 8, 0.35초 간격. 스트레이트(오른쪽 클릭 또는 K) 데미지 14, 0.7초 간격. 가드(Shift 또는 L)를 누르고 있으면 받는 데미지가 30%로 줄고 이동이 느려집니다. 모바일은 버튼 셋을 둡니다.
- 체력 100, 3분입니다. 체력이 0이면 KO, 시간이 다 되면 체력이 많은 쪽이 이기고 같으면 무승부입니다.
- 서버가 거리(약 1.3칸 이내) · 앞쪽 각도(60도 이내) · 간격을 확인해 명중을 정합니다. 맞으면 기존 흔들림 반응을 씁니다. 펀치 · 가드 동작은 상대와 관전자에게도 보입니다.
- 구현: 링 `BOX_RING`(25, 17, 6×6) 둘레는 방 벽(난간 0.45m, 남색)이 막고, 그 위에 코너 기둥(북서 파랑 = 자리 0 · 남동 빨강 = 자리 1) · 로프 세 줄 · 매트를 그립니다(`boxring`, 밟고 지나감). 관전 마당 네 변에 관전 의자(`boxbench`, 윗면 0.42m). 선수는 대각선 코너에서 서로를 보고 섭니다. 규칙 수는 `src/duel/arena/box.mjs`의 `BOX`(서버 · 브라우저가 같이 쓴다).
- 브라우저는 `{ k: "punch", kind: "jab" | "str" }`(보내기 직전 `ctx.sync()`), `{ k: "guard", on }`(바뀔 때만)을 보냅니다. 서버는 간격(80%까지 봐줌, 주먹 사이 최소 0.18초) · 가드 중이 아닌지 보고, 내 마지막 위치 · 방향 `h`에서 상대의 최근 0.4초 위치 중 하나가 1.3칸 · 60도 안이면 맞힘. 가드면 데미지 ×0.3(소수 한 자리). 모두에게 `{ k: "punch", seat, kind, hit, dmg?, g?, hp? }`(헛손질도) · `{ k: "guard", seat, on }`. 간격을 어긴 주먹은 아무것도 보내지 않습니다.
- `match.state = { hp: [a, b], guard: [0 | 1, 0 | 1] }`. 결과 summary: KO `{ hp, kind }` · 시간 종료 `{ hp }`. 가드 중에는 칠 수 없습니다.
- 조작: 잽 J · 왼쪽 클릭(마우스 고정 중이거나 위에서 볼 때. 들어가서 볼 때 커서가 풀려 있으면 첫 클릭은 고정), 스트레이트 K · 오른쪽 클릭, 가드 Shift · L 누르고 있기(복싱 중 Shift는 달리기가 아니다). 가드 중 걷기 ×0.5, 달리기는 걷기 빠르기쯤으로. 링 안에서는 Space 점프를 막고, 그래도 로프를 넘으면 링 안으로 되돌립니다(관전자가 링에 들어오면 관전 자리로). 들어가서 볼 때는 주먹을 낼 때 카메라가 보는 쪽으로 몸을 돌립니다(`ctx.place`로 방향만, 엔진은 걸을 때만 방향을 바꾸므로). 모바일은 오른쪽 아래(달리기 · 점프 위)에 가드 · 잽 · 스트레이트 버튼.
- 보이는 것: 글러브(자리 색)는 캐릭터의 `turn`에 붙여 `ctx.arms`로 정한 팔 끝을 따라갑니다(서기 · 가드 · 뻗기 자세를 섞는다). 1인칭(내 몸이 안 보일 때)은 글러브만 화면 앞에. 맞으면 `ctx.hitReact` + 머리 위 데미지 숫자, 경기 틀 안에 두 선수 체력 막대. 화면 모양(CSS)은 `box.ts`가 `<style id="boxStyle">`로 붙입니다.
- 틀 수정: `Avatar.tsx`에서 `pose.arms`가 있으면 든 물건 · 그림판을 내려놓는다(`busy`에 포함). 그림판을 든 캐릭터는 팔이 안 보이던 문제.
- 브라우저에서 맞춰 볼 것: 글러브 위치(Avatar 어깨 · 팔 길이를 손으로 옮겨 적었다), 1.3칸 · 60도가 손맛에 맞는지, 1인칭 글러브 자리.

## 확인 방법

- `npx tsc -p tsconfig.json`, `npm test`, `node --check app.js`
- 서버 규칙은 `scripts/duel*.test.mjs`에서 시험합니다(가짜 시계 · 난수).
- 화면은 헤드리스 브라우저로 띄워 확인하지 않습니다. 정적 검사까지만 합니다.
- `npm run build`는 마지막에 한 번만 합니다(dist가 커밋 대상이라 여러 곳에서 빌드하면 충돌합니다).
