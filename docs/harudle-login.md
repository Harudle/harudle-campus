# 하루들 로그인 연동 (캠퍼스 쪽)

캠퍼스 설정 창의 **[하루들 연동하기]** → 하루들에서 **[연동하기]** → 캠퍼스로 돌아오면 하루들 닉네임으로 들어온다.
하루들은 60초짜리 **서명 토큰**만 발급하고 아무것도 저장하지 않는다. 캠퍼스는 하루들을 호출하지 않고 서명을 직접 확인한다(단방향).
캠퍼스 사용자 · 세션 · 사용한 토큰은 모두 캠퍼스 DB(Supabase)에만 둔다. 하루들 DB와 기존 코드는 바꾸지 않는다.

## 흐름

1. `GET /auth/harudle/start` — state(32바이트)를 `campus_link_state` 쿠키(10분, `/auth/harudle`)에 넣고 `HARUDLE_BASE_URL/campus/connect?state=…`로 보낸다.
2. 하루들 웹 `/campus/connect`: 로그인(새 탭) → [연동하기] → `POST /api/v1/campus/link-tokens` → `redirectUri?token&state`로 이동.
3. `GET /auth/harudle/callback?token&state` — 쿠키 state 비교 → 토큰 확인 → jti 한 번만 쓰기 → 사용자 저장 → `campus_sid`(30일, HttpOnly, SameSite=Lax) → `/?login=ok`. 실패하면 `/?login=fail`.
4. `GET /api/me` — `{enabled, loggedIn, user}`. `POST /auth/logout` — `Origin`이 캠퍼스일 때만.

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
| Supabase (운영) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 표: `docs/supabase/campus-auth.sql`(사용자 · 세션 · 사용한 토큰). RLS 켜고 정책 없음 |
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

- 설정 창: `하루들 연동하기` / `하루들 연동 끊기`, 연동 중이면 `하루들 ○○(으)로 연동됨`.
- 연동하면 이름 칩이 `하루들: 닉네임`이 되고 프로필 이름 수정은 막힌다.
- 연동이 필요한 기능은 엔진의 `requireLogin("이유")`를 먼저 부른다.

## 시험

```bash
node --test scripts/harudle-login.test.mjs scripts/auth-store.test.mjs
```

시험이 하루들과 같은 방식으로 토큰을 직접 서명해, 정상 · 재사용 · 다른 키 · 만료 · state 불일치 · 다른 대상 · `alg: none`을 확인한다.
