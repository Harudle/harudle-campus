# 캠퍼스 지갑 '컷'

하루들 연동 크루가 캠퍼스에서 쓰는 재화다. 하루들 서비스의 DB · 백엔드는 건드리지 않고, 캠퍼스 서버와 Supabase에서만 처리한다.

## 받는 법

- **처음 연동하면 연동 선물** `CAMPUS_WALLET_LINK_BONUS`컷(기본 15, 0이면 주지 않음). 연동 뒤 첫 정산 때 하루들 피드와 상관없이 한 번 준다(하루들이 잠깐 응답하지 않아도 들어간다). 이 기능이 생기기 전에 연동한 크루도 다음 정산 때 한 번 받는다. 12층 하루들 부스 컷 상점 앞 둥근 안내판 · 상점 메뉴 입간판 · 상점 창(게스트)에 적혀 있다.
- 하루들 **공개 피드에 네컷만화를 올린 날마다 하루 한 번**(한국 날짜 기준) `CAMPUS_WALLET_FEED_REWARD`컷(기본 10).
- 캠퍼스 서버가 하루들 공개 피드(`GET /api/v1/feeds`, 로그인 없이 누구나 읽는 것)를 직접 읽어 글쓴이 ID가 연동 회원 ID와 같은지 확인한다. 브라우저가 알려 주는 값은 쓰지 않는다.
- 정산은 크루가 캠퍼스에 들어와 `POST /api/me/wallet/settle`을 부를 때 한다. **최근 7일 안에 올린 날짜**까지 한꺼번에 받는다(그보다 오래 안 들어오면 그 전 날짜는 못 받는다).
- 피드에 올리지 않고 만들기만 한 네컷만화는 캠퍼스가 알 수 없어 지급하지 않는다. 올린 뒤 지워도 이미 받은 컷은 그대로다.
- 연동하지 않은 사람(게스트)은 지갑이 없다.

## API (캠퍼스 세션 쿠키 필요)

| 주소 | 하는 일 |
| --- | --- |
| `GET /api/me/wallet` | `{ currency: "컷", balance, entries: [{ kind, refKey, amount, balanceAfter, at }] }`. 읽기만 하고 지급하지 않는다 |
| `POST /api/me/wallet/settle` | 하루들 피드를 확인해 아직 안 받은 날짜를 지급. `{ currency, balance, granted: [{ date, amount }], welcome? }`(welcome: 방금 받은 연동 선물. 받을 때만 있다). 캠퍼스 Origin만, 한 사람당 15초에 한 번 |

오류: 꺼져 있으면 404 `wallet_disabled`, 로그인 없으면 401 `login`, 하루들이 응답하지 않으면 502 `harudle`(그 정산에서 연동 선물을 받았으면 `welcome` · `balance`도), Supabase 오류는 502 `store`.

## 저장

- `docs/supabase/campus-wallet.sql`: `campus_wallets`(잔액), `campus_wallet_entries`(거래 기록), 함수 `campus_wallet_grant`.
- 같은 `(회원, kind, ref_key)`는 고유 제약으로 한 번만 지급된다. 일일 보상은 `kind = feed_daily`, `ref_key = 한국 날짜`. 연동 선물은 `kind = link_first`, `ref_key = first`(DB 바꿀 것 없음).
- 잔액과 거래 기록은 DB 함수 안에서 지갑 행을 잠그고 함께 바뀐다.
- 지갑은 `campus_users`에 매달려 있어 **마지막 로그인 후 90일이 지나 사용자가 지워지면 함께 지워진다.**

## 컷 상점

컷으로 펫 · 만화 효과 · 착용 장식을 산다. 한 번 사면 계속 가지고, 자리(슬롯)마다 하나씩 쓴다.

| 자리 | 상품 | 가격 |
| --- | --- | --- |
| `pet` 따라다니는 펫 | 고양이 · 판다 · 여우 · 얼룩말 · 에뮤 | 각 10컷 |
| `pet` 레어 펫(훨씬 크다) | 호랑이 · 불곰 | 각 30컷 |
| `fx` 머리 위 만화 효과 | 말풍선 · 느낌표 · 반짝 효과선 · 두근 하트 · 땀방울 | 각 3컷 |
| `head` · `neck` · `held` 착용 | 학사모 · 합격 머리띠 · 사원증 · 네컷 원고 · 아아 한 잔 | 각 4컷 |

- 펫은 주인이 멈춰 서 있으면 잠시 뒤 엎드려 쉬며 주인을 올려다보고, 걸으면 꼬리를 더 빨리 흔든다. 효과 · 장식도 가만히 있지 않는다(점이 튀는 말풍선, 번쩍이는 느낌표, 달랑거리는 술 등).
- 상점에서 **입어 보기 / 미리 만나기**를 누르면 사기 전에 8초 동안 내 화면에서만 입혀 본다.
- **컷이 모자란 상품을 누르면** 거절하지 않고 하루들로 안내한다. 오늘 보상을 아직 안 받았으면 버튼이 `네컷만화 만들고 사기 ↗`로 바뀌어 하루들의 네컷만화 만들기 화면(`/diary-write`)을 새 탭으로 열고(징검다리 쪽 `static/harudle-write.html`을 거친다: 하루들 만들기 화면은 뒤로가기와 만든 뒤 이동을 "뒤로 한 칸"으로 해서, 새 탭에서 바로 열면 그 버튼들이 먹지 않는다. 징검다리는 뒤로 돌아오면 하루들 홈으로 바꿔 보낸다), 피드에 올리고 돌아오면(창에 다시 초점) 바로 정산해 컷이 들어온다. 오늘 이미 받았으면 "내일 올리면 또 받아요"를 알려 준다(`/api/shop`의 `earn: { reward, today }`).

- 상품 · 가격은 `server/auth/catalog.js`에 있다. 브라우저가 보낸 가격은 쓰지 않는다. `sku`는 한 번 정하면 바꾸지 않는다.
- **쓰고 있는 것(gear)은 서버가 접속자 목록에 직접 붙인다**(`peers[].g`). 브라우저는 gear를 보내지 않으므로 안 산 것을 낀 척할 수 없다. 44글자 외형(`av`)과는 따로이고, `head` · `neck` · `held`를 쓰면 그 부위는 외형 대신 장식을 그린다.
- 펫을 쓰지 않으면 지금처럼 강아지 두들이 내 화면에만 따라온다. 산 펫은 다른 크루에게도 보인다.
- 그리는 코드는 `src/scene/Pets.tsx` · `src/scene/Gear.tsx`(캠퍼스 것. `src/harudle`는 월드 복사본이라 `Avatar.tsx`에는 붙이는 자리만 넣었다), 상점 창은 `src/engine/shop.ts`.
- 여는 곳: 왼쪽 위 상점 칩(상점 아이콘, 연동했으면 옆에 컷 잔액), 채팅 `/상점`, 12층 하루들 부스 남쪽의 미니어처 가게 같은 컷 상점(간판 · 뒷벽 · 카운터 · 앞 메뉴 입간판을 누르거나 앞에서 F), 선물 입간판 창의 `컷 상점 열기`. 게스트도 칩이 보이고 구경할 수 있지만, 사려 하면(`🔒 연동하고 사기`) 연동 안내가 뜬다.
- 14층 하루들 월드(iframe) 안에서는 펫 · 장식이 보이지 않는다.

| 주소 | 하는 일 |
| --- | --- |
| `GET /api/shop` | `{ catalog, loggedIn }`, 연동했으면 `owned` · `gear` · `balance`도 |
| `POST /api/shop/buy` | `{ sku }` → `{ sku, balance, owned }`. 이미 가졌으면 409 `owned`, 컷이 모자라면 409 `insufficient` |
| `PUT /api/me/gear` | `{ slot, sku \| null }` → `{ gear }`. 안 가진 것은 403 `not_owned` |

저장: `docs/supabase/campus-shop.sql` — `campus_inventory`(가진 것), `campus_gear`(쓰는 것), 함수 `campus_shop_buy`(지갑 행을 잠그고 차감 · 거래 기록 · 보유 추가를 한 번에).

## 켜는 순서

1. Supabase SQL 편집기에서 `docs/supabase/campus-wallet.sql`, 이어서 `docs/supabase/campus-shop.sql` 실행.
2. 캠퍼스 서버 환경에 `CAMPUS_WALLET=on` (필요하면 `CAMPUS_WALLET_FEED_REWARD`).
3. 끄려면 `CAMPUS_WALLET`을 지운다. 잔액과 기록은 남는다.

## 시험

```bash
node --test scripts/wallet.test.mjs scripts/shop.test.mjs
```

## 감정표현

- 컷 상점 「감정표현」 탭의 상품은 쓰는 자리(slot)가 아니라 **가지면 G 감정표현 휠에서 고르는 것**입니다(`slot: "emote"`, `SLOTS`에 없어 `PUT /api/me/gear`로는 못 씁니다). 상품은 「개인 빈백에서 잠자기」(`emote_beanbag`) · 「기타 연주」(`emote_guitar`) · 「LP 감상」(`emote_lp`) · 「클럽 파티」(`emote_club`), 모두 15컷.
- 서버는 로그인할 때와 산 직후 그 크루가 가진 감정표현 목록을 `{ t: "emotes", list }`로 보내고, 위치 정보의 감정표현(`em`, 예: `bag`)은 **가진 사람 것만** 받아 줍니다(`app.js` `emoteOk`). 개발 서버(`NODE_ENV`가 `production`이 아닐 때)는 서버가 모두 열어 두지만, 브라우저(vite 개발 서버)는 개발용 가짜 상점이 켜져 있으면 그 상점에서 산 감정표현만 G 휠에 띄웁니다(`src/engine/shop.ts`, `?nomock`이면 서버 목록 그대로).
- 감정표현 휠: G를 꾹 누르면 **가진 프리미엄 감정표현만** 화면 가운데에 피자 모양으로 나오고, 마우스를 그쪽으로 밀고 G를 떼거나 누르면 합니다(Esc는 닫기). 하나도 없으면 G를 눌러도 아무것도 안 뜹니다. 기본 표현(네 컷 · 인사 · 하트 · 춤)은 1 2 3 Z 그대로입니다.
