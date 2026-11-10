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

## 켜는 순서

1. Supabase SQL 편집기에서 `docs/supabase/campus-wallet.sql` 실행.
2. 캠퍼스 서버 환경에 `CAMPUS_WALLET=on` (필요하면 `CAMPUS_WALLET_FEED_REWARD`).
3. 끄려면 `CAMPUS_WALLET`을 지운다. 잔액과 기록은 남는다.

## 시험

```bash
node --test scripts/wallet.test.mjs
```
