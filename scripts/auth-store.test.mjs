// Supabase 저장소가 PostgREST에 보내는 요청 모양 (실제 Supabase 없이 가짜 fetch로 확인)
import assert from "node:assert/strict";
import { test } from "node:test";
import { createSupabaseStore, createMemoryStore, createStoreFromEnv } from "../server/auth/store.js";

function fakeFetch(reply) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null }); const r = reply(url, init) ?? { status: 201 }; return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status }); };
  return { fn, calls };
}

test("Supabase: 사용자 upsert · 세션 생성 · 조회 · 폐기 · 정리", async () => {
  const f = fakeFetch((url, init) => (init.method === "GET" ? { status: 200, body: [{ expires_at: "2026-12-09T00:00:00.000Z", revoked_at: null, campus_users: { harudle_user_id: "u1", nickname: "닉", profile_image_url: null } }] } : { status: 204 }));
  const s = createSupabaseStore({ url: "https://abc.supabase.co/", key: "service-key", fetch: f.fn });
  const at = Date.parse("2026-11-09T00:00:00.000Z");

  await s.upsertUser({ id: "u1", nickname: "닉", profileImageUrl: null, at });
  let c = f.calls.at(-1);
  assert.equal(c.url, "https://abc.supabase.co/rest/v1/campus_users?on_conflict=harudle_user_id");
  assert.equal(c.method, "POST"); assert.equal(c.headers.prefer, "resolution=merge-duplicates,return=minimal");
  assert.equal(c.headers.apikey, "service-key"); assert.equal(c.headers.authorization, "Bearer service-key");
  assert.deepEqual(c.body, { harudle_user_id: "u1", nickname: "닉", profile_image_url: null, last_login_at: "2026-11-09T00:00:00.000Z" });

  await s.createSession({ sidHash: "h".repeat(64), userId: "u1", createdAt: at, expiresAt: at + 1000 });
  c = f.calls.at(-1);
  assert.equal(c.url, "https://abc.supabase.co/rest/v1/campus_sessions");
  assert.deepEqual(c.body, { sid_hash: "h".repeat(64), harudle_user_id: "u1", created_at: "2026-11-09T00:00:00.000Z", expires_at: "2026-11-09T00:00:01.000Z" });

  const got = await s.getSession("h".repeat(64));
  assert.match(f.calls.at(-1).url, /campus_sessions\?sid_hash=eq\.h{64}&select=expires_at,revoked_at,campus_users\(harudle_user_id,nickname,profile_image_url\)&limit=1$/);
  assert.deepEqual(got, { expiresAt: Date.parse("2026-12-09T00:00:00.000Z"), revokedAt: null, user: { id: "u1", nickname: "닉", profileImageUrl: null } });

  await s.revokeSession("h".repeat(64), at);
  c = f.calls.at(-1);
  assert.equal(c.method, "PATCH"); assert.match(c.url, /sid_hash=eq\.h{64}&revoked_at=is\.null$/); assert.deepEqual(c.body, { revoked_at: "2026-11-09T00:00:00.000Z" });

  await s.cleanup({ sessionsBefore: at, usersBefore: at - 90 * 864e5 });
  assert.deepEqual(f.calls.slice(-3).map((x) => [x.method, x.url.split("/rest/v1")[1]]), [
    ["DELETE", "/campus_used_link_tokens?expires_at=lt.2026-11-09T00%3A00%3A00.000Z"],
    ["DELETE", "/campus_sessions?expires_at=lt.2026-11-09T00%3A00%3A00.000Z"],
    ["DELETE", "/campus_users?last_login_at=lt.2026-08-11T00%3A00%3A00.000Z"],
  ]);
});

test("Supabase 오류는 예외로 올린다", async () => {
  const s = createSupabaseStore({ url: "https://abc.supabase.co", key: "k", fetch: fakeFetch(() => ({ status: 500 })).fn });
  await assert.rejects(() => s.getSession("x"), /supabase 500/);
});

test("저장소 고르기: 운영에서는 메모리 저장소를 쓰지 않는다", () => {
  assert.equal(createStoreFromEnv({ CAMPUS_AUTH_STORE: "memory", NODE_ENV: "production" }), null);
  assert.equal(createStoreFromEnv({ CAMPUS_AUTH_STORE: "memory" }).kind, "memory");
  assert.equal(createStoreFromEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }).kind, "supabase");
  assert.equal(createStoreFromEnv({}), null);
});

test("메모리 저장소: 90일 지난 사용자는 세션과 함께 지운다", async () => {
  const s = createMemoryStore();
  await s.upsertUser({ id: "old", nickname: "a", profileImageUrl: null, at: 0 });
  await s.createSession({ sidHash: "x", userId: "old", createdAt: 0, expiresAt: 10 ** 13 });
  await s.cleanup({ sessionsBefore: 5, usersBefore: 1 });
  assert.equal(await s.getSession("x"), null);
});

test("연결 토큰 jti는 한 번만 쓸 수 있다", async () => {
  const m = createMemoryStore();
  assert.equal(await m.useLinkToken("j1", 10), true);
  assert.equal(await m.useLinkToken("j1", 10), false);

  let status = 201;
  const f = fakeFetch(() => ({ status }));
  const s = createSupabaseStore({ url: "https://abc.supabase.co", key: "k", fetch: f.fn });
  assert.equal(await s.useLinkToken("j1", Date.parse("2026-11-09T00:01:00Z")), true);
  assert.equal(f.calls.at(-1).url, "https://abc.supabase.co/rest/v1/campus_used_link_tokens");
  assert.deepEqual(f.calls.at(-1).body, { jti: "j1", expires_at: "2026-11-09T00:01:00.000Z" });
  status = 409;
  assert.equal(await s.useLinkToken("j1", 0), false);
  status = 500;
  await assert.rejects(() => s.useLinkToken("j2", 0), /supabase 500/);
});

test("새 비밀 키(sb_secret_)는 apikey 헤더로만 보낸다", async () => {
  const f = fakeFetch(() => ({ status: 201 }));
  await createSupabaseStore({ url: "https://abc.supabase.co", key: "sb_secret_abc", fetch: f.fn }).useLinkToken("j", 0);
  assert.equal(f.calls.at(-1).headers.apikey, "sb_secret_abc");
  assert.equal(f.calls.at(-1).headers.authorization, undefined);
});

test("캐릭터: Supabase는 처음엔 있으면 두고(ignore), 바꿀 땐 덮어쓰고(merge), 읽는다", async () => {
  const f = fakeFetch((url, init) => (init.method === "GET" ? { status: 200, body: [{ avatar: "AV", unlocks: ["airpods"] }] } : { status: 201 }));
  const s = createSupabaseStore({ url: "https://abc.supabase.co", key: "k", fetch: f.fn });
  const at = Date.parse("2026-11-09T00:00:00.000Z");

  await s.createCharacter({ userId: "u1", av: "AV", unlocks: ["airpods"], at });
  let c = f.calls.at(-1);
  assert.equal(c.url, "https://abc.supabase.co/rest/v1/campus_characters?on_conflict=harudle_user_id");
  assert.equal(c.headers.prefer, "resolution=ignore-duplicates,return=minimal");
  assert.deepEqual(c.body, { harudle_user_id: "u1", avatar: "AV", unlocks: ["airpods"], updated_at: "2026-11-09T00:00:00.000Z" });

  await s.saveCharacter({ userId: "u1", av: "AV2", unlocks: [], at });
  c = f.calls.at(-1);
  assert.equal(c.headers.prefer, "resolution=merge-duplicates,return=minimal");
  assert.deepEqual(c.body, { harudle_user_id: "u1", avatar: "AV2", unlocks: [], updated_at: "2026-11-09T00:00:00.000Z" });

  assert.deepEqual(await s.getCharacter("u1"), { av: "AV", unlocks: ["airpods"] });
  assert.match(f.calls.at(-1).url, /campus_characters\?harudle_user_id=eq\.u1&select=avatar,unlocks&limit=1$/);
});

test("캐릭터: 메모리 저장소도 처음 것만 만들고, 사용자를 지우면 같이 지운다", async () => {
  const s = createMemoryStore();
  assert.equal(await s.getCharacter("u"), null);
  await s.createCharacter({ userId: "u", av: "first", unlocks: [], at: 0 });
  await s.createCharacter({ userId: "u", av: "second", unlocks: [], at: 0 });
  assert.deepEqual(await s.getCharacter("u"), { av: "first", unlocks: [] });
  await s.saveCharacter({ userId: "u", av: "third", unlocks: ["headset"], at: 0 });
  assert.deepEqual(await s.getCharacter("u"), { av: "third", unlocks: ["headset"] });
  await s.upsertUser({ id: "u", nickname: "a", profileImageUrl: null, at: 0 });
  await s.cleanup({ sessionsBefore: 5, usersBefore: 1 });
  assert.equal(await s.getCharacter("u"), null);
});
