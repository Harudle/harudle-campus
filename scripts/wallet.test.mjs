// 캠퍼스 지갑 '컷': 하루들 공개 피드에 올린 날마다 하루 한 번 지급 (실제 하루들 · Supabase 없이 가짜 fetch와 메모리 저장소로 확인)
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuth, sha256 } from "../server/auth/index.js";
import { createMemoryStore, createSupabaseStore } from "../server/auth/store.js";
import { kstDate } from "../server/auth/wallet.js";

const ORIGIN = "http://localhost:8090";
const ME = "6d64421d-6a44-48fa-b917-c1d20f5e5883", OTHER = "0550bf07-01ce-4d68-87e8-a2fa70486a25";
const SID = "s".repeat(43);
const ENV = { CAMPUS_AUTH_ORIGIN: ORIGIN, HARUDLE_CAMPUS_SIGNING_KEY: Buffer.alloc(32, 7).toString("base64"), CAMPUS_WALLET: "on" };
const T0 = Date.parse("2026-11-10T03:00:00.000Z");   // 한국 시간 11월 10일 낮 12시
const quiet = { error() {}, warn() {} };

const feed = (id, author, publishedAt) => ({ id, author: { id: author, nickname: "닉" }, publishedAt });

// 하루들 공개 피드 흉내: pages[0]이 첫 장. 호출한 주소를 남긴다
function harudle(pages, status = 200) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    if (status !== 200) return new Response("{}", { status });
    const cursor = new URL(url).searchParams.get("cursor"), i = cursor ? Number(cursor) : 0;
    return Response.json({ items: pages[i] || [], hasNext: i + 1 < pages.length, nextCursor: i + 1 < pages.length ? String(i + 1) : null });
  };
  return { fn, calls };
}

async function setup({ pages = [[]], status = 200, env = ENV, store = createMemoryStore(), clock = { t: T0 } } = {}) {
  const h = harudle(pages, status);
  if (!(await store.getSession(sha256(SID)))) {
    await store.upsertUser({ id: ME, nickname: "눈누난나", profileImageUrl: null, at: clock.t });
    await store.createSession({ sidHash: sha256(SID), userId: ME, createdAt: clock.t, expiresAt: clock.t + 30 * 864e5 });
  }
  const auth = createAuth(env, { store, fetch: h.fn, now: () => clock.t, log: quiet });
  async function request(method, path, { cookie = `campus_sid=${SID}`, origin = ORIGIN } = {}) {
    const out = { status: 0, body: null };
    const res = { writeHead(s) { out.status = s; }, end(b) { out.body = b ? JSON.parse(b) : null; } };
    const handled = await auth.handle({ method, headers: { cookie, origin } }, res, new URL(path, ORIGIN));
    assert.equal(handled, true);
    return out;
  }
  return { auth, store, clock, calls: h.calls, request };
}

test("한국 날짜: 자정 경계", () => {
  assert.equal(kstDate(Date.parse("2026-11-09T14:59:59Z")), "2026-11-09");
  assert.equal(kstDate(Date.parse("2026-11-09T15:00:00Z")), "2026-11-10");
});

test("CAMPUS_WALLET이 꺼져 있으면 지갑 주소는 404", async () => {
  const s = await setup({ env: { ...ENV, CAMPUS_WALLET: undefined } });
  assert.equal(s.auth.walletEnabled, false);
  assert.deepEqual(await s.request("GET", "/api/me/wallet"), { status: 404, body: { error: "wallet_disabled" } });
  assert.equal((await s.request("POST", "/api/me/wallet/settle")).status, 404);
});

test("로그인하지 않았거나 다른 사이트에서 온 정산은 거절", async () => {
  const s = await setup();
  assert.equal((await s.request("GET", "/api/me/wallet", { cookie: "" })).status, 401);
  assert.equal((await s.request("POST", "/api/me/wallet/settle", { cookie: "" })).status, 401);
  assert.deepEqual(await s.request("POST", "/api/me/wallet/settle", { origin: "https://evil.example" }), { status: 403, body: { error: "origin" } });
  assert.equal(s.calls.length, 0);
});

test("내가 피드를 올린 한국 날짜마다 한 번씩만 지급", async () => {
  const s = await setup({ pages: [[
    feed("f5", ME, "2026-11-10T02:00:00Z"),      // 11/10 두 번째
    feed("f4", OTHER, "2026-11-10T01:00:00Z"),   // 남의 것
    feed("f3", ME, "2026-11-09T16:00:00Z"),      // 11/10 첫 번째 (한국 시간 새벽 1시)
  ], [
    feed("f2", ME.toUpperCase(), "2026-11-08T05:00:00Z"),   // 11/8 (대문자 ID도 같은 사람)
    feed("f1", ME, "2026-11-01T05:00:00Z"),      // 7일보다 오래됨 → 안 줌
    feed("f0", ME, "not-a-date"),
  ]] });

  assert.deepEqual((await s.request("GET", "/api/me/wallet")).body, { currency: "컷", balance: 0, entries: [] });
  assert.equal(s.calls.length, 0, "잔액 조회는 하루들을 부르지 않고 지급도 하지 않는다");

  const paid = await s.request("POST", "/api/me/wallet/settle");
  assert.deepEqual(paid, { status: 200, body: { currency: "컷", balance: 20, granted: [{ date: "2026-11-08", amount: 10 }, { date: "2026-11-10", amount: 10 }] } });
  assert.equal(s.calls.length, 2);
  assert.match(s.calls[0], /^https:\/\/www\.harudle\.com\/api\/v1\/feeds\?sort=LATEST&size=50$/);

  const wallet = (await s.request("GET", "/api/me/wallet")).body;
  assert.equal(wallet.balance, 20);
  assert.deepEqual(wallet.entries.map((e) => [e.kind, e.refKey, e.amount, e.balanceAfter]), [["feed_daily", "2026-11-10", 10, 20], ["feed_daily", "2026-11-08", 10, 10]]);
  assert.deepEqual((await s.store.listWalletEntries(OTHER)), [], "연동하지 않은 글쓴이에게는 아무것도 만들지 않는다");
});

test("바로 다시 누르면 하루들을 다시 읽지 않고, 워커가 바뀌어도 같은 날짜는 다시 주지 않는다", async () => {
  const pages = [[feed("f1", ME, "2026-11-10T02:00:00Z")]];
  const s = await setup({ pages });
  assert.equal((await s.request("POST", "/api/me/wallet/settle")).body.balance, 10);
  assert.deepEqual((await s.request("POST", "/api/me/wallet/settle")).body, { currency: "컷", balance: 10, granted: [] });
  assert.equal(s.calls.length, 1);

  // 새 워커(메모리 기억 없음) + 같은 날 피드를 하나 더 올림 → DB의 고유 제약이 막는다
  const again = await setup({ pages: [[feed("f2", ME, "2026-11-10T02:30:00Z"), ...pages[0]]], store: s.store, clock: { t: T0 + 3600e3 } });
  assert.deepEqual((await again.request("POST", "/api/me/wallet/settle")).body, { currency: "컷", balance: 10, granted: [] });

  // 다음 날 올리면 다시 받는다
  const next = await setup({ pages: [[feed("f3", ME, "2026-11-11T01:00:00Z")]], store: s.store, clock: { t: T0 + 864e5 } });
  assert.deepEqual((await next.request("POST", "/api/me/wallet/settle")).body, { currency: "컷", balance: 20, granted: [{ date: "2026-11-11", amount: 10 }] });
});

test("하루들이 응답하지 않으면 502이고 잔액은 그대로, 곧바로 다시 시도할 수 있다", async () => {
  const s = await setup({ status: 503 });
  assert.deepEqual(await s.request("POST", "/api/me/wallet/settle"), { status: 502, body: { error: "harudle" } });
  assert.deepEqual(await s.request("POST", "/api/me/wallet/settle"), { status: 502, body: { error: "harudle" } });
  assert.equal(s.calls.length, 2);
  assert.equal((await s.request("GET", "/api/me/wallet")).body.balance, 0);
});

test("지급량 설정: 기본 10, 잘못된 값이면 서버가 뜨지 않는다", async () => {
  const s = await setup({ pages: [[feed("f1", ME, "2026-11-10T02:00:00Z")]], env: { ...ENV, CAMPUS_WALLET_FEED_REWARD: "3" } });
  assert.equal((await s.request("POST", "/api/me/wallet/settle")).body.balance, 3);
  for (const bad of ["0", "-1", "1.5", "abc", "1001"]) assert.throws(() => createAuth({ ...ENV, CAMPUS_WALLET_FEED_REWARD: bad }, { store: createMemoryStore() }), /invalid_campus_wallet_feed_reward/);
});

test("메모리 저장소: 사용자가 지워지면 지갑도 지워진다", async () => {
  const store = createMemoryStore();
  await store.upsertUser({ id: ME, nickname: "닉", profileImageUrl: null, at: T0 });
  assert.deepEqual(await store.grantReward({ userId: ME, kind: "feed_daily", refKey: "2026-11-10", amount: 10, at: T0 }), { granted: true, balance: 10 });
  assert.deepEqual(await store.grantReward({ userId: ME, kind: "feed_daily", refKey: "2026-11-10", amount: 10, at: T0 }), { granted: false, balance: 10 });
  await assert.rejects(store.grantReward({ userId: OTHER, kind: "feed_daily", refKey: "2026-11-10", amount: 10, at: T0 }), /no_user/);
  await store.cleanup({ sessionsBefore: T0, usersBefore: T0 + 1 });
  assert.deepEqual(await store.getWallet(ME), { balance: 0 });
  assert.deepEqual(await store.listWalletEntries(ME), []);
});

test("Supabase 저장소: 지급은 DB 함수 하나로, 조회는 본인 행만", async () => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url).split("/rest/v1")[1], method: init.method, body: init.body ? JSON.parse(init.body) : null });
    if (String(url).includes("/rpc/campus_wallet_grant")) return Response.json({ granted: true, balance: 30 });
    if (String(url).includes("/campus_wallets")) return Response.json([{ balance: 30 }]);
    return Response.json([{ kind: "feed_daily", ref_key: "2026-11-10", amount: 10, balance_after: 30, created_at: "2026-11-10T03:00:00.000Z" }]);
  };
  const s = createSupabaseStore({ url: "https://abc.supabase.co", key: "sb_secret_x", fetch: fn });

  assert.deepEqual(await s.grantReward({ userId: ME, kind: "feed_daily", refKey: "2026-11-10", amount: 10, meta: { feedId: "f1" } }), { granted: true, balance: 30 });
  assert.deepEqual(calls.at(-1), { url: "/rpc/campus_wallet_grant", method: "POST", body: { p_user: ME, p_kind: "feed_daily", p_ref: "2026-11-10", p_amount: 10, p_meta: { feedId: "f1" } } });

  assert.deepEqual(await s.getWallet(ME), { balance: 30 });
  assert.equal(calls.at(-1).url, `/campus_wallets?harudle_user_id=eq.${ME}&select=balance&limit=1`);

  assert.deepEqual(await s.listWalletEntries(ME, 5), [{ kind: "feed_daily", refKey: "2026-11-10", amount: 10, balanceAfter: 30, at: T0 }]);
  assert.equal(calls.at(-1).url, `/campus_wallet_entries?harudle_user_id=eq.${ME}&select=kind,ref_key,amount,balance_after,created_at&order=id.desc&limit=5`);

  const broken = createSupabaseStore({ url: "https://abc.supabase.co", key: "sb_secret_x", fetch: async () => Response.json({ oops: 1 }) });
  await assert.rejects(broken.grantReward({ userId: ME, kind: "feed_daily", refKey: "2026-11-10", amount: 10 }), /wallet_grant/);
});
