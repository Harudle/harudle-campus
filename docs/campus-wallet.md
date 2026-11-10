# 캠퍼스 지갑 '컷'

하루들 연동 크루가 캠퍼스에서 쓰는 재화다. 하루들 서비스의 DB · 백엔드는 건드리지 않고, 캠퍼스 서버와 Supabase에서만 처리한다.

## 받는 법

- 하루들 **공개 피드에 네컷만화를 올린 날마다 하루 한 번**(한국 날짜 기준) `CAMPUS_WALLET_FEED_REWARD`컷(기본 10).
- 캠퍼스 서버가 하루들 공개 피드(`GET /api/v1/feeds`, 로그인 없이 누구나 읽는 것)를 직접 읽어 글쓴이 ID가 연동 회원 ID와 같은지 확인한다. 브라우저가 알려 주는 값은 쓰지 않는다.
- 정산은 크루가 캠퍼스에 들어와 `POST /api/me/wallet/settle`을 부를 때 한다. **최근 7일 안에 올린 날짜**까지 한꺼번에 받는다(그보다 오래 안 들어오면 그 전 날짜는 못 받는다).
- 피드에 올리지 않고 만들기만 한 네컷만화는 캠퍼스가 알 수 없어 지급하지 않는다. 올린 뒤 지워도 이미 받은 컷은 그대로다.
- 연동하지 않은 사람(게스트)은 지갑이 없다.

## API (캠퍼스 세션 쿠키 필요)

| 주소 | 하는 일 |
| --- | --- |
| `GET /api/me/wallet` | `{ currency: "컷", balance, entries: [{ kind, refKey, amount, balanceAfter, at }] }`. 읽기만 하고 지급하지 않는다 |
| `POST /api/me/wallet/settle` | 하루들 피드를 확인해 아직 안 받은 날짜를 지급. `{ currency, balance, granted: [{ date, amount }] }`. 캠퍼스 Origin만, 한 사람당 15초에 한 번 |

오류: 꺼져 있으면 404 `wallet_disabled`, 로그인 없으면 401 `login`, 하루들이 응답하지 않으면 502 `harudle`, Supabase 오류는 502 `store`.

## 저장

- `docs/supabase/campus-wallet.sql`: `campus_wallets`(잔액), `campus_wallet_entries`(거래 기록), 함수 `campus_wallet_grant`.
- 같은 `(회원, kind, ref_key)`는 고유 제약으로 한 번만 지급된다. 일일 보상은 `kind = feed_daily`, `ref_key = 한국 날짜`.
- 잔액과 거래 기록은 DB 함수 안에서 지갑 행을 잠그고 함께 바뀐다.
- 지갑은 `campus_users`에 매달려 있어 **마지막 로그인 후 90일이 지나 사용자가 지워지면 함께 지워진다.**

## 컷 상점

컷으로 펫 · 만화 효과 · 착용 장식을 산다. 한 번 사면 계속 가지고, 자리(슬롯)마다 하나씩 쓴다.

| 자리 | 상품 | 가격 |
| --- | --- | --- |
| `pet` 따라다니는 펫 | 고양이 · 판다 · 여우 | 각 10컷 |
| `fx` 머리 위 만화 효과 | 말풍선 · 느낌표 · 반짝 효과선 | 각 3컷 |
| `head` · `neck` · `held` 착용 | 학사모 · 사원증 · 네컷 원고 | 각 4컷 |

- 상품 · 가격은 `server/auth/catalog.js`에 있다. 브라우저가 보낸 가격은 쓰지 않는다. `sku`는 한 번 정하면 바꾸지 않는다.
- **쓰고 있는 것(gear)은 서버가 접속자 목록에 직접 붙인다**(`peers[].g`). 브라우저는 gear를 보내지 않으므로 안 산 것을 낀 척할 수 없다. 44글자 외형(`av`)과는 따로이고, `head` · `neck` · `held`를 쓰면 그 부위는 외형 대신 장식을 그린다.
- 펫을 쓰지 않으면 지금처럼 강아지 두들이 내 화면에만 따라온다. 산 펫은 다른 크루에게도 보인다.
- 그리는 코드는 `src/scene/Pets.tsx` · `src/scene/Gear.tsx`(캠퍼스 것. `src/harudle`는 월드 복사본이라 `Avatar.tsx`에는 붙이는 자리만 넣었다), 상점 창은 `src/engine/shop.ts`.
- 여는 곳: 왼쪽 위 잔액 칩, 하루들 부스 선물 입간판 창의 `컷 상점 열기`. 게스트는 구경만 하고 사려 하면 연동 안내가 뜬다.
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
