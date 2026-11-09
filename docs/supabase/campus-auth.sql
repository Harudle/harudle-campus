-- 하루들 로그인 연동: 캠퍼스 사용자 · 세션 (Supabase SQL 편집기에서 한 번 실행)
-- 캠퍼스 서버만 service_role 키로 읽고 쓴다. 브라우저(anon 키)는 아무것도 못 읽게 RLS를 켜고 정책은 두지 않는다.
-- 프로젝트를 만들 때 "Automatically expose new tables"를 껐다면 아래 grant가 꼭 필요하다(켜 두었어도 그대로 실행해도 된다).

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

-- 하루들 연결 토큰을 한 번만 쓰도록 jti를 만료 시각까지 기억한다
create table if not exists public.campus_used_link_tokens (
    jti        text        primary key,
    expires_at timestamptz not null
);

create index if not exists campus_sessions_expires_at_idx on public.campus_sessions (expires_at);
create index if not exists campus_sessions_user_idx on public.campus_sessions (harudle_user_id);
create index if not exists campus_users_last_login_at_idx on public.campus_users (last_login_at);

alter table public.campus_users enable row level security;
alter table public.campus_sessions enable row level security;
alter table public.campus_used_link_tokens enable row level security;

-- 캠퍼스 서버(service_role)에만 권한을 준다. 브라우저용 역할(anon, authenticated)에는 주지 않는다.
revoke all on table public.campus_users, public.campus_sessions, public.campus_used_link_tokens from anon, authenticated;
grant select, insert, update, delete on table public.campus_users, public.campus_sessions, public.campus_used_link_tokens to service_role;
