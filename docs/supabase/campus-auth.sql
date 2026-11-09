-- 하루들 로그인 연동: 캠퍼스 사용자 · 세션 (Supabase SQL 편집기에서 한 번 실행)
-- 캠퍼스 서버만 service_role 키로 읽고 쓴다. 브라우저(anon 키)는 아무것도 못 읽게 RLS를 켜고 정책은 두지 않는다.

create table if not exists public.campus_users (
    harudle_user_id   uuid primary key,
    nickname          text        not null,
    profile_image_url text,
    first_login_at    timestamptz not null default now(),
    last_login_at     timestamptz not null default now()
);

create table if not exists public.campus_sessions (
    sid_hash        char(64)    primary key,   -- 세션 쿠키 원본이 아니라 SHA-256 해시
    harudle_user_id uuid        not null references public.campus_users (harudle_user_id) on delete cascade,
    created_at      timestamptz not null default now(),
    expires_at      timestamptz not null,
    revoked_at      timestamptz
);

create index if not exists campus_sessions_expires_at_idx on public.campus_sessions (expires_at);
create index if not exists campus_sessions_user_idx on public.campus_sessions (harudle_user_id);
create index if not exists campus_users_last_login_at_idx on public.campus_users (last_login_at);

alter table public.campus_users enable row level security;
alter table public.campus_sessions enable row level security;
