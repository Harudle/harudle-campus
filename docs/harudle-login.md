# 하루들 로그인 연동 (캠퍼스 쪽)

캠퍼스 설정 창의 **[하루들 연동하기]** → 하루들에서 **[연동하기]** → 캠퍼스로 돌아오면 하루들 닉네임으로 들어온다.
캠퍼스는 하루들 토큰을 받지 않는다. 하루들이 알려 주는 것은 회원 ID · 닉네임 · 프로필 사진뿐이다(단방향).
설계 전체: 「우테코 캠퍼스 × 하루들 로그인 연동 설계」 문서.

## 흐름

1. `GET /auth/harudle/start` — state(32바이트)를 `campus_link_state` 쿠키(10분, `/auth/harudle`)에 넣고 `HARUDLE_BASE_URL/campus/connect?state=…`로 보낸다.
2. 하루들 웹이 로그인 · 확인 화면을 거쳐 `CAMPUS_REDIRECT_URI?code&state`로 돌려보낸다. (하루들 쪽 작업)
3. `GET /auth/harudle/callback` — 쿠키의 state와 비교 → `POST HARUDLE_BASE_URL/api/v1/campus/link-codes/exchange`
   (`Authorization: Basic base64(campus:<비밀값>)`, 본문 `{code, state}`) → `{userId, nickname, profileImageUrl, profileImageUrlExpiresAt}`
   → 사용자 저장 → `campus_sid` 쿠키(30일, HttpOnly, SameSite=Lax) → `/?login=ok`. 실패하면 `/?login=fail`.
4. `GET /api/me` — `{enabled, loggedIn, user}`. 화면이 연동 버튼을 보일지 정한다.
5. `POST /auth/logout` — `Origin`이 캠퍼스일 때만. 세션 폐기.

## 실시간 접속에서

- WebSocket 접속 요청의 `Origin`이 캠퍼스이고 `campus_sid`가 유효하면, 서버가 주소(`h_<회원 ID>`)와 이름(하루들 닉네임)을 정한다. 브라우저가 보낸 `id` · `name`은 무시한다.
- 접속자 목록에서 연동한 크루는 `hv: 1`.
- 게스트는 예전처럼 브라우저 비밀 uid를 보내고, 서버는 그 해시(`p_…`)만 공개한다.

## 저장소

| | 설정 | 비고 |
| --- | --- | --- |
| Supabase (운영) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 표: `docs/supabase/campus-auth.sql`. RLS 켜고 정책 없음 |
| 메모리 (로컬) | `CAMPUS_AUTH_STORE=memory` | 운영(`NODE_ENV=production`)에서는 무시. 워커가 바뀌면 로그아웃 |

세션은 쿠키 원본이 아니라 SHA-256 해시만 저장한다. 하루에 한 번 끝난 세션과 마지막 로그인 후 90일 지난 사용자를 지운다(단방향이라 하루들 탈퇴를 알 수 없음).

## 켜는 법

필요한 환경 변수: `CAMPUS_AUTH_ORIGIN`(없으면 `CAMPUS_PUBLIC_ORIGIN`), `HARUDLE_CAMPUS_CLIENT_SECRET`, 저장소 설정. 하나라도 없으면 꺼진 채로 돈다(`/api/me`의 `enabled: false`, 연동 버튼 숨김).

운영 서버에는 셸 접근이 필요하다(비밀값을 systemd `EnvironmentFile`로 넣는다). 설계 문서의 「운영 전제」 참고.

## 화면

- 설정 창: `하루들 연동하기` / `하루들 연동 끊기`, 연동 중이면 `하루들 ○○(으)로 연동됨`.
- 연동하면 이름 칩이 `하루들: 닉네임`이 되고 프로필 이름 수정은 막힌다.
- 연동이 필요한 기능은 엔진의 `requireLogin("이유")`를 먼저 부른다. 연동돼 있으면 `true`, 아니면 안내 창을 띄우고 `false`.

## 시험

```bash
node --test scripts/harudle-login.test.mjs scripts/auth-store.test.mjs
```

가짜 하루들 서버로 시작 → state 불일치 거절 → 교환 → 세션 → 같은 코드 재사용 거절 → WebSocket 신원(다른 Origin은 게스트) → 로그아웃까지 확인한다.
