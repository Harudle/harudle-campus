-- 캠퍼스 컷 상점: 보유 목록 · 착용 상태 · 구매 함수 (Supabase SQL 편집기에서 한 번 실행. campus-auth.sql, campus-wallet.sql을 먼저 실행해 둔다)
-- 캠퍼스 서버만 service_role 키로 읽고 쓴다(RLS 켜고 정책 없음). 여러 번 실행해도 된다.

-- 산 것: 한 번 사면 계속 가진다. 상품 이름 · 가격은 서버 코드(server/auth/catalog.js)에 있다
create table if not exists public.campus_inventory (
    harudle_user_id uuid        not null references public.campus_users (harudle_user_id) on delete cascade,
    sku             text        not null check (char_length(sku) between 1 and 40),
    acquired_at     timestamptz not null default now(),
    primary key (harudle_user_id, sku)
);

-- 지금 쓰고 있는 것: { "pet": "pet_cat", "fx": "fx_bang", … } 슬롯마다 하나
create table if not exists public.campus_gear (
    harudle_user_id uuid        primary key references public.campus_users (harudle_user_id) on delete cascade,
    gear            jsonb       not null default '{}'::jsonb,
    updated_at      timestamptz not null default now()
);

alter table public.campus_inventory enable row level security;
alter table public.campus_gear enable row level security;

-- 구매: 지갑 행을 잠그고 차감 · 거래 기록 · 보유 추가를 한 번에 한다
-- 돌려주는 값: { "ok": true|false, "reason": null|"owned"|"insufficient", "balance": 처리 후 잔액 }
create or replace function public.campus_shop_buy(p_user uuid, p_sku text, p_price bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_balance bigint;
begin
    if p_price is null or p_price <= 0 then
        raise exception 'campus_shop_buy: price must be positive';
    end if;

    insert into campus_wallets (harudle_user_id) values (p_user) on conflict (harudle_user_id) do nothing;
    select balance into v_balance from campus_wallets where harudle_user_id = p_user for update;

    if exists (select 1 from campus_inventory where harudle_user_id = p_user and sku = p_sku) then
        return jsonb_build_object('ok', false, 'reason', 'owned', 'balance', v_balance);
    end if;
    if v_balance < p_price then
        return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance);
    end if;

    insert into campus_wallet_entries (harudle_user_id, kind, ref_key, amount, balance_after)
    values (p_user, 'purchase', p_sku, -p_price, v_balance - p_price);
    insert into campus_inventory (harudle_user_id, sku) values (p_user, p_sku);
    update campus_wallets set balance = v_balance - p_price, updated_at = now() where harudle_user_id = p_user;
    return jsonb_build_object('ok', true, 'reason', null, 'balance', v_balance - p_price);
end;
$$;

revoke all on table public.campus_inventory, public.campus_gear from anon, authenticated;
grant select, insert, update, delete on table public.campus_inventory, public.campus_gear to service_role;
revoke all on function public.campus_shop_buy(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.campus_shop_buy(uuid, text, bigint) to service_role;
