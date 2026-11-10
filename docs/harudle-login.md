# 하루들 로그인 연동 (캠퍼스 쪽)

캠퍼스 설정 창의 **[하루들 연동하기]** → 하루들에서 **[연동하기]** → 캠퍼스로 돌아오면 하루들 닉네임으로 들어온다.
하루들은 60초짜리 **서명 토큰**만 발급하고 아무것도 저장하지 않는다. 캠퍼스는 하루들을 호출하지 않고 서명을 직접 확인한다(단방향).
캠퍼스 사용자 · 세션 · 사용한 토큰은 모두 캠퍼스 DB(Supabase)에만 둔다. 하루들 DB와 기존 코드는 바꾸지 않는다.

## 흐름

1. `GET /auth/harudle/start?av&ul` — state(32바이트)를 `campus_link_state` 쿠키(10분, `/auth/harudle`)에 넣고 `HARUDLE_BASE_URL/campus/connect?state=…`로 보낸다. 지금 캐릭터(`av` 외형 44글자, `ul` 푼 장식)는 `campus_link_char` 쿠키에 같이 둔다.
2. 하루들 웹 `/campus/connect`: 로그인(새 탭) → [연동하기] → `POST /api/v1/campus/link-tokens` → `redirectUri?token&state`로 이동.
3. `GET /auth/harudle/callback?token&state` — 쿠키 state 비교 → 토큰 확인 → jti 한 번만 쓰기 → 사용자 저장 → `campus_sid`(30일, HttpOnly, SameSite=Lax) → 이 회원의 캐릭터가 아직 없으면 `campus_link_char`로 저장 → `/?login=ok`. 실패하면 `/?login=fail`.
4. `GET /api/me` — `{enabled, loggedIn, user}`. `POST /auth/logout` — `Origin`이 캠퍼스일 때만.
5. `GET /api/me/character` — `{character: {av, unlocks} | null}`. `PUT /api/me/character` — `{av, unlocks}`로 덮어쓰기, `Origin`이 캠퍼스일 때만.

## 캐릭터

연동하지 않은 채 꾸민 캐릭터(외형 · 에어팟 · 헤드셋)는 브라우저에만 있다(`ww.avatar`, `ww.unlock.*`).

- **처음 연동**: [연동하기]를 누른 브라우저의 캐릭터가 캠퍼스 DB(`campus_characters`)에 저장된다.
- **그 뒤**: 들어올 때 DB의 캐릭터로 바꾼다. 다른 브라우저 · 기기에서 연동해도 DB의 캐릭터가 이긴다. 푼 장식은 합친다.
- **연동한 채로 꾸미면**: 0.8초 뒤(창을 닫으면 바로) DB에 저장한다.
- 콜백에서 저장을 못 했거나 이 기능 전에 연동한 크루면, 들어온 화면이 그 브라우저의 캐릭터를 올린다.
- 이름은 그대로 하루들 닉네임이다(따로 저장하지 않는다). 연동을 끊으면 이 브라우저의 마지막 캐릭터 · 이름으로 돌아간다.

## 연결 토큰 (하루들 발급, HS256 JWT)

| 클레임 | 값 | 캠퍼스 확인 |
| --- | --- | --- |
| `alg` | `HS256` | 다른 값(`none` 등) 거절 |
| `iss` / `aud` | `harudle` / `harudle-campus` | 일치 |
| `sub` | 하루들 회원 ID(UUID) | 형식 |
| `exp` / `iat` | 발급 + 60초 | 30초 오차 허용 |
| `state` | 캠퍼스가 만든 값 | 쿠키 · 주소의 state와 일치 |
| `jti` | 무작위 | 캠퍼스 DB에 기록, 두 번째부터 거절 |
| `nickname`, `picture` | 닉네임, 기본 프로필 사진(없을 수 있음) | |

이메일 · 실명 · 하루들 토큰은 담기지 않는다. 서명 키는 하루들 Access Token 키와 따로다.

## 실시간 접속에서

- WebSocket 접속 요청의 `Origin`이 캠퍼스이고 `campus_sid`가 유효하면, 서버가 주소(`h_<회원 ID>`)와 이름(하루들 닉네임)을 정한다. 브라우저가 보낸 `id` · `name`은 무시한다.
- 접속자 목록에서 연동한 크루는 `hv: 1`. 게스트는 브라우저 비밀 uid의 해시(`p_…`)만 공개한다.

## 저장소

| | 설정 | 비고 |
| --- | --- | --- |
| Supabase (운영) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 표: `docs/supabase/campus-auth.sql`(사용자 · 세션 · 사용한 토큰 · 캐릭터). RLS 켜고 정책 없음 |
| 메모리 (로컬) | `CAMPUS_AUTH_STORE=memory` | 운영(`NODE_ENV=production`)에서는 무시. 워커가 바뀌면 로그아웃 |

하루에 한 번 끝난 세션 · 지난 토큰 기록, 마지막 로그인 후 90일 지난 사용자를 지운다(단방향이라 하루들 탈퇴를 알 수 없음).

## 켜는 법

| 캠퍼스 | 하루들 |
| --- | --- |
| `CAMPUS_AUTH_ORIGIN`(없으면 `CAMPUS_PUBLIC_ORIGIN`) | `HARUDLE_CAMPUS_ENABLED=true` |
| `HARUDLE_BASE_URL` | `HARUDLE_CAMPUS_REDIRECT_URI=<캠퍼스>/auth/harudle/callback` |
| `HARUDLE_CAMPUS_SIGNING_KEY` | `HARUDLE_CAMPUS_SIGNING_KEY_BASE64` (같은 값) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | |

키 만들기: `openssl rand -base64 32`. 하나라도 없으면 캠퍼스는 꺼진 채로 돈다(`/api/me`의 `enabled: false`, 연동 버튼 숨김).
운영 캠퍼스 서버에는 셸 접근이 필요하다(systemd `EnvironmentFile`).

## 화면

- 설정 창: `하루들 연동하기`(보라) / `하루들 연동 끊기`, 연동 중이면 `하루들 ○○(으)로 연동됨`.
- 첫 안내: 연동할 수 있고 아직 안 했으면 조작법 다음에 `하루들 서비스에 가입되어 있나요?` 장(외형 저장 · 앞으로 재화 같은 혜택, `하루들 서비스와 연동하기` 버튼)이 하나 더 붙는다.
- 하루들 부스 선물 창 아래: 연동하면 아이템과 캐릭터가 저장된다는 한 줄과 `하루들 연동하기` 버튼(연동 중이면 연동됨).
- 연동하면 이름 칩이 `하루들: 닉네임`이 되고 프로필 이름 수정은 막힌다.
- 연동이 필요한 기능은 엔진의 `requireLogin("이유")`를 먼저 부른다.

## 시험

```bash
node --test scripts/harudle-login.test.mjs scripts/auth-store.test.mjs
```

시험이 하루들과 같은 방식으로 토큰을 직접 서명해, 정상 · 재사용 · 다른 키 · 만료 · state 불일치 · 다른 대상 · `alg: none`을 확인한다.
