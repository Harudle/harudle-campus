-- 캠퍼스 지갑 '컷': 잔액 · 거래 기록 · 지급 함수 (Supabase SQL 편집기에서 한 번 실행. campus-auth.sql을 먼저 실행해 둔다)
-- 하루들 서비스 DB와는 완전히 따로다. 캠퍼스 서버만 service_role 키로 읽고 쓴다(RLS 켜고 정책 없음).
-- 여러 번 실행해도 된다.

-- 연동한 크루 한 명에 잔액 하나. 사용자가 지워지면(마지막 로그인 후 90일) 지갑도 함께 지워진다
create table if not exists public.campus_wallets (
    harudle_user_id uuid        primary key references public.campus_users (harudle_user_id) on delete cascade,
    balance         bigint      not null default 0 check (balance >= 0),
    updated_at      timestamptz not null default now()
);

-- 거래 기록(원장): 왜 얼마가 늘거나 줄었는지. 고치거나 지우지 않고 더하기만 한다
--   kind = 'feed_daily', ref_key = 한국 날짜(2026-11-10) → 하루 한 번만 지급
create table if not exists public.campus_wallet_entries (
    id              bigint      generated always as identity primary key,
    harudle_user_id uuid        not null references public.campus_users (harudle_user_id) on delete cascade,
    kind            text        not null check (char_length(kind) between 1 and 40),
    ref_key         text        not null check (char_length(ref_key) between 1 and 80),
    amount          bigint      not null check (amount <> 0),
    balance_after   bigint      not null check (balance_after >= 0),
    meta            jsonb       not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    constraint campus_wallet_entries_once unique (harudle_user_id, kind, ref_key)
);

create index if not exists campus_wallet_entries_user_idx on public.campus_wallet_entries (harudle_user_id, id desc);

alter table public.campus_wallets enable row level security;
alter table public.campus_wallet_entries enable row level security;

-- 지급: 같은 (사용자, kind, ref_key)는 한 번만. 지갑 행을 잠가 동시에 와도 잔액과 기록이 어긋나지 않는다
-- 돌려주는 값: { "granted": true|false, "balance": 지급 후 잔액 }
create or replace function public.campus_wallet_grant(p_user uuid, p_kind text, p_ref text, p_amount bigint, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_balance bigint;
    v_entry   bigint;
begin
    if p_amount is null or p_amount <= 0 then
        raise exception 'campus_wallet_grant: amount must be positive';
    end if;

    insert into campus_wallets (harudle_user_id) values (p_user) on conflict (harudle_user_id) do nothing;
    select balance into v_balance from campus_wallets where harudle_user_id = p_user for update;

    insert into campus_wallet_entries (harudle_user_id, kind, ref_key, amount, balance_after, meta)
    values (p_user, p_kind, p_ref, p_amount, v_balance + p_amount, coalesce(p_meta, '{}'::jsonb))
    on conflict on constraint campus_wallet_entries_once do nothing
    returning id into v_entry;

    if v_entry is null then
        return jsonb_build_object('granted', false, 'balance', v_balance);
    end if;

    update campus_wallets set balance = v_balance + p_amount, updated_at = now() where harudle_user_id = p_user;
    return jsonb_build_object('granted', true, 'balance', v_balance + p_amount);
end;
$$;

-- 캠퍼스 서버(service_role)에만 권한을 준다. 브라우저용 역할(anon, authenticated)에는 주지 않는다.
revoke all on table public.campus_wallets, public.campus_wallet_entries from anon, authenticated;
grant select, insert, update, delete on table public.campus_wallets, public.campus_wallet_entries to service_role;
revoke all on function public.campus_wallet_grant(uuid, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.campus_wallet_grant(uuid, text, text, bigint, jsonb) to service_role;
