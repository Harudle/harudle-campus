// 로그인 사용자 · 세션 저장소
//   - Supabase(운영): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. 표는 docs/supabase/campus-auth.sql
//   - 메모리(로컬 확인·시험): CAMPUS_AUTH_STORE=memory. 운영(NODE_ENV=production)에서는 쓰지 않는다
//     워커가 바뀌면 사라지므로 배포할 때마다 로그아웃된다
// 세션은 sid 원본이 아니라 SHA-256 해시만 저장한다.
// 하루들 연결 토큰은 한 번만 쓰도록 jti를 시간 차이 허용까지 포함한 검증 종료 시각까지 기억한다(하루들은 아무것도 저장하지 않는다).
// 연동한 크루의 캐릭터(외형 44글자 · 푼 장식)도 여기 둔다. 처음 연동할 때 그 브라우저의 캐릭터가 들어가고, 그 뒤로는 이것을 불러온다.

export function createStoreFromEnv(env, { fetch } = {}) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return createSupabaseStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY, fetch });
  if (env.CAMPUS_AUTH_STORE === "memory" && env.NODE_ENV !== "production") return createMemoryStore();
  return null;
}

export function createMemoryStore() {
  const users = new Map(), sessions = new Map(), usedTokens = new Map(), characters = new Map();
  return {
    kind: "memory",
    async useLinkToken(jti, expiresAt) { if (usedTokens.has(jti)) return false; usedTokens.set(jti, expiresAt); return true; },
    async upsertUser({ id, nickname, profileImageUrl, at }) {
      const old = users.get(id);
      users.set(id, { id, nickname, profileImageUrl, firstLoginAt: old?.firstLoginAt ?? at, lastLoginAt: at });
    },
    async createSession({ sidHash, userId, createdAt, expiresAt }) { sessions.set(sidHash, { userId, createdAt, expiresAt, revokedAt: null }); },
    async getSession(sidHash) {
      const s = sessions.get(sidHash), u = s && users.get(s.userId);
      return s && u ? { expiresAt: s.expiresAt, revokedAt: s.revokedAt, user: { id: u.id, nickname: u.nickname, profileImageUrl: u.profileImageUrl } } : null;
    },
    async revokeSession(sidHash, at) { const s = sessions.get(sidHash); if (s && !s.revokedAt) s.revokedAt = at; },
    async getCharacter(userId) { const c = characters.get(userId); return c ? { av: c.av, unlocks: [...c.unlocks] } : null; },
    async saveCharacter({ userId, av, unlocks, at }) { characters.set(userId, { av, unlocks: [...unlocks], updatedAt: at }); },
    async createCharacter({ userId, av, unlocks, at }) { if (!characters.has(userId)) characters.set(userId, { av, unlocks: [...unlocks], updatedAt: at }); },
    async cleanup({ sessionsBefore, usersBefore }) {
      for (const [k, at] of usedTokens) if (at < sessionsBefore) usedTokens.delete(k);
      for (const [k, s] of sessions) if (s.expiresAt < sessionsBefore) sessions.delete(k);
      for (const [id, u] of users) if (u.lastLoginAt < usersBefore) { users.delete(id); characters.delete(id); for (const [k, s] of sessions) if (s.userId === id) sessions.delete(k); }
    },
  };
}

// PostgREST(/rest/v1)를 fetch로 부른다. 비밀 키는 서버에만 있고 브라우저로 나가지 않는다
// 새 비밀 키(sb_secret_…)는 apikey 헤더로만 보낸다(JWT가 아니라 Authorization에 넣으면 안 된다).
// 예전 service_role 키(JWT, 2027년 초 폐기 예정)는 apikey와 Authorization 둘 다 보낸다.
export function createSupabaseStore({ url, key, fetch = globalThis.fetch }) {
  const base = `${String(url).replace(/\/+$/, "")}/rest/v1`;
  const auth = String(key).startsWith("sb_") ? {} : { authorization: `Bearer ${key}` };
  const iso = (ms) => new Date(ms).toISOString();
  async function call(path, init = {}, prefer = "return=minimal") {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { apikey: key, ...auth, "content-type": "application/json", accept: "application/json", prefer, ...(init.headers || {}) },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`supabase ${res.status}`);
    return res.status === 204 ? null : res.json().catch(() => null);
  }
  const eq = (v) => `eq.${encodeURIComponent(v)}`;
  return {
    kind: "supabase",
    // 기본 키(jti)가 겹치면 PostgREST가 409를 돌려준다 → 이미 쓴 토큰
    async useLinkToken(jti, expiresAt) {
      try { await call("/campus_used_link_tokens", { method: "POST", body: JSON.stringify({ jti, expires_at: iso(expiresAt) }) }); return true; }
      catch (e) { if (e.message === "supabase 409") return false; throw e; }
    },
    // first_login_at은 표의 기본값(now())으로 처음 한 번만 들어가고, 다시 로그인하면 닉네임·사진·마지막 로그인만 바뀐다
    upsertUser: ({ id, nickname, profileImageUrl, at }) => call("/campus_users?on_conflict=harudle_user_id", {
      method: "POST", body: JSON.stringify({ harudle_user_id: id, nickname, profile_image_url: profileImageUrl, last_login_at: iso(at) }),
    }, "resolution=merge-duplicates,return=minimal"),
    createSession: ({ sidHash, userId, createdAt, expiresAt }) => call("/campus_sessions", {
      method: "POST", body: JSON.stringify({ sid_hash: sidHash, harudle_user_id: userId, created_at: iso(createdAt), expires_at: iso(expiresAt) }),
    }),
    async getSession(sidHash) {
      const rows = await call(`/campus_sessions?sid_hash=${eq(sidHash)}&select=expires_at,revoked_at,campus_users(harudle_user_id,nickname,profile_image_url)&limit=1`, { method: "GET" }, "count=none");
      const r = Array.isArray(rows) ? rows[0] : null, u = r?.campus_users;
      if (!r || !u) return null;
      return { expiresAt: Date.parse(r.expires_at), revokedAt: r.revoked_at ? Date.parse(r.revoked_at) : null, user: { id: u.harudle_user_id, nickname: u.nickname, profileImageUrl: u.profile_image_url } };
    },
    revokeSession: (sidHash, at) => call(`/campus_sessions?sid_hash=${eq(sidHash)}&revoked_at=is.null`, { method: "PATCH", body: JSON.stringify({ revoked_at: iso(at) }) }),
    async getCharacter(userId) {
      const rows = await call(`/campus_characters?harudle_user_id=${eq(userId)}&select=avatar,unlocks&limit=1`, { method: "GET" }, "count=none");
      const r = Array.isArray(rows) ? rows[0] : null;
      return r ? { av: r.avatar, unlocks: Array.isArray(r.unlocks) ? r.unlocks : [] } : null;
    },
    // 바꿀 때마다 덮어쓴다
    saveCharacter: ({ userId, av, unlocks, at }) => call("/campus_characters?on_conflict=harudle_user_id", {
      method: "POST", body: JSON.stringify({ harudle_user_id: userId, avatar: av, unlocks, updated_at: iso(at) }),
    }, "resolution=merge-duplicates,return=minimal"),
    // 처음 연동할 때만: 이미 있으면 그대로 둔다(다른 브라우저에서 다시 연동해도 저장된 캐릭터가 이긴다)
    createCharacter: ({ userId, av, unlocks, at }) => call("/campus_characters?on_conflict=harudle_user_id", {
      method: "POST", body: JSON.stringify({ harudle_user_id: userId, avatar: av, unlocks, updated_at: iso(at) }),
    }, "resolution=ignore-duplicates,return=minimal"),
    async cleanup({ sessionsBefore, usersBefore }) {
      await call(`/campus_used_link_tokens?expires_at=lt.${encodeURIComponent(iso(sessionsBefore))}`, { method: "DELETE" });
      await call(`/campus_sessions?expires_at=lt.${encodeURIComponent(iso(sessionsBefore))}`, { method: "DELETE" });
      await call(`/campus_users?last_login_at=lt.${encodeURIComponent(iso(usersBefore))}`, { method: "DELETE" });   // 세션 · 캐릭터는 ON DELETE CASCADE
    },
  };
}
