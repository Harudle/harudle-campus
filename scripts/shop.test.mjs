// 컷 상점: 서버 가격으로 사고, 가진 것만 쓸 수 있다 (실제 Supabase 없이 메모리 저장소로 확인)
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuth, sha256 } from "../server/auth/index.js";
import { createMemoryStore, createSupabaseStore } from "../server/auth/store.js";
import { CATALOG, SLOTS, cleanGear, itemOf } from "../server/auth/catalog.js";

const ORIGIN = "http://localhost:8090";
const ME = "6d64421d-6a44-48fa-b917-c1d20f5e5883";
const SID = "s".repeat(43);
const ENV = { CAMPUS_AUTH_ORIGIN: ORIGIN, HARUDLE_CAMPUS_SIGNING_KEY: Buffer.alloc(32, 7).toString("base64"), CAMPUS_WALLET: "on" };
const T0 = Date.parse("2026-11-10T03:00:00.000Z");
const quiet = { error() {}, warn() {} };

async function setup({ env = ENV, cuts = 0 } = {}) {
  const store = createMemoryStore();
  await store.upsertUser({ id: ME, nickname: "눈누난나", profileImageUrl: null, at: T0 });
  await store.createSession({ sidHash: sha256(SID), userId: ME, createdAt: T0, expiresAt: T0 + 30 * 864e5 });
  if (cuts) await store.grantReward({ userId: ME, kind: "test", refKey: "seed", amount: cuts, at: T0 });
  const auth = createAuth(env, { store, fetch: async () => { throw new Error("no network"); }, now: () => T0, log: quiet });
  const gearEvents = [];
  auth.onGear((userId, gear) => gearEvents.push([userId, { ...gear }]));
  async function request(method, path, body, { cookie = `campus_sid=${SID}`, origin = ORIGIN } = {}) {
    const out = { status: 0, body: null };
    const res = { writeHead(s) { out.status = s; }, end(b) { out.body = b ? JSON.parse(b) : null; } };
    const req = { method, headers: { cookie, origin }, async *[Symbol.asyncIterator]() { if (body !== undefined) yield typeof body === "string" ? body : JSON.stringify(body); } };
    assert.equal(await auth.handle(req, res, new URL(path, ORIGIN)), true);
    return out;
  }
  return { auth, store, request, gearEvents };
}

test("카탈로그: 펫 7(레어 2) · 효과 5 · 착용 5, sku는 겹치지 않고 슬롯은 아는 것만", () => {
  assert.equal(CATALOG.length, 17);
  assert.equal(new Set(CATALOG.map((it) => it.sku)).size, 17);
  for (const it of CATALOG) { assert.ok(SLOTS.includes(it.slot)); assert.ok(Number.isInteger(it.price) && it.price > 0); assert.match(it.sku, /^[a-z_]{1,40}$/); }
  assert.deepEqual(CATALOG.filter((it) => it.slot === "pet").map((it) => it.name), ["고양이", "판다", "여우", "얼룩말", "에뮤", "호랑이", "불곰"]);
  assert.deepEqual(CATALOG.filter((it) => it.rare).map((it) => [it.sku, it.price]), [["pet_tiger", 30], ["pet_bear", 30]]);
  assert.equal(CATALOG.filter((it) => it.slot === "fx").length, 5);
  for (const sku of ["pet_cat", "pet_panda", "pet_fox", "fx_bubble", "fx_bang", "fx_sparkle", "head_gradcap", "neck_idcard", "held_manuscript"]) assert.ok(itemOf(sku), `이미 팔린 ${sku}는 없애지 않는다`);
  assert.equal(itemOf("nope"), null); assert.equal(itemOf(null), null);
});

test("cleanGear: 모르는 슬롯 · 슬롯이 다른 상품 · 안 가진 것은 버린다", () => {
  assert.deepEqual(cleanGear({ pet: "pet_cat", fx: "pet_fox", head: "head_gradcap", wing: "x", neck: 3 }, ["pet_cat"]), { pet: "pet_cat" });
  assert.deepEqual(cleanGear({ pet: "pet_cat", head: "head_gradcap" }), { pet: "pet_cat", head: "head_gradcap" });
  assert.deepEqual(cleanGear(null), {});
});

test("꺼져 있으면 상점 주소는 404이고 gear는 비어 있다", async () => {
  const s = await setup({ env: { ...ENV, CAMPUS_WALLET: undefined }, cuts: 50 });
  assert.deepEqual(await s.request("GET", "/api/shop"), { status: 404, body: { error: "shop_disabled" } });
  assert.equal((await s.request("POST", "/api/shop/buy", { sku: "pet_cat" })).status, 404);
  assert.deepEqual(await s.auth.gearOf(ME), {});
});

test("게스트는 상품 목록만 보고, 사거나 쓰지 못한다", async () => {
  const s = await setup({ cuts: 50 });
  const guest = { cookie: "" };
  const list = await s.request("GET", "/api/shop", undefined, guest);
  assert.equal(list.status, 200); assert.equal(list.body.loggedIn, false); assert.equal(list.body.catalog.length, 17); assert.deepEqual(list.body.earn, { reward: 10, welcome: 15 }); assert.equal("balance" in list.body, false);
  assert.equal((await s.request("POST", "/api/shop/buy", { sku: "pet_cat" }, guest)).status, 401);
  assert.equal((await s.request("PUT", "/api/me/gear", { slot: "pet", sku: "pet_cat" }, guest)).status, 401);
  assert.equal((await s.request("POST", "/api/shop/buy", { sku: "pet_cat" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await s.request("PUT", "/api/me/gear", { slot: "pet", sku: null }, { origin: "https://evil.example" })).status, 403);
});

test("구매: 서버 가격으로 차감하고 한 번만 산다", async () => {
  const s = await setup({ cuts: 14 });
  assert.deepEqual((await s.request("GET", "/api/shop")).body.owned, []);

  // 브라우저가 보낸 가격은 무시한다
  const bought = await s.request("POST", "/api/shop/buy", { sku: "pet_cat", price: 0 });
  assert.deepEqual(bought, { status: 200, body: { sku: "pet_cat", balance: 4, owned: ["pet_cat"] } });

  assert.deepEqual(await s.request("POST", "/api/shop/buy", { sku: "pet_cat" }), { status: 409, body: { error: "owned", balance: 4 } });
  assert.deepEqual(await s.request("POST", "/api/shop/buy", { sku: "pet_fox" }), { status: 409, body: { error: "insufficient", balance: 4 } });
  assert.equal((await s.request("POST", "/api/shop/buy", { sku: "fx_bang" })).body.balance, 1);

  assert.equal((await s.request("POST", "/api/shop/buy", { sku: "pet_dragon" })).status, 400);
  assert.equal((await s.request("POST", "/api/shop/buy", "not json")).status, 400);

  const shop = (await s.request("GET", "/api/shop")).body;
  assert.deepEqual(shop.earn, { reward: 10, today: false });
  assert.equal(shop.balance, 1); assert.deepEqual(shop.owned, ["pet_cat", "fx_bang"]);
  const entries = (await s.request("GET", "/api/me/wallet")).body.entries;
  assert.deepEqual(entries.slice(0, 2).map((e) => [e.kind, e.refKey, e.amount, e.balanceAfter]), [["purchase", "fx_bang", -3, 1], ["purchase", "pet_cat", -10, 4]]);
});

test("착용: 가진 것만, 맞는 자리에만. 바뀌면 접속자 목록에 알린다", async () => {
  const s = await setup({ cuts: 20 });
  await s.request("POST", "/api/shop/buy", { sku: "pet_cat" });
  await s.request("POST", "/api/shop/buy", { sku: "fx_bang" });
  assert.deepEqual(s.gearEvents, [], "사기만 해서는 쓰지 않는다");

  assert.deepEqual(await s.request("PUT", "/api/me/gear", { slot: "pet", sku: "pet_fox" }), { status: 403, body: { error: "not_owned" } });
  assert.equal((await s.request("PUT", "/api/me/gear", { slot: "fx", sku: "pet_cat" })).status, 400);
  assert.equal((await s.request("PUT", "/api/me/gear", { slot: "wing", sku: null })).status, 400);
  assert.equal((await s.request("PUT", "/api/me/gear", { slot: "pet", sku: "pet_dragon" })).status, 400);

  assert.deepEqual((await s.request("PUT", "/api/me/gear", { slot: "pet", sku: "pet_cat" })).body, { gear: { pet: "pet_cat" } });
  assert.deepEqual((await s.request("PUT", "/api/me/gear", { slot: "fx", sku: "fx_bang" })).body, { gear: { pet: "pet_cat", fx: "fx_bang" } });
  assert.deepEqual(await s.auth.gearOf(ME), { pet: "pet_cat", fx: "fx_bang" });
  assert.deepEqual((await s.request("GET", "/api/shop")).body.gear, { pet: "pet_cat", fx: "fx_bang" });

  assert.deepEqual((await s.request("PUT", "/api/me/gear", { slot: "pet", sku: null })).body, { gear: { fx: "fx_bang" } });
  assert.deepEqual(s.gearEvents, [[ME, { pet: "pet_cat" }], [ME, { pet: "pet_cat", fx: "fx_bang" }], [ME, { fx: "fx_bang" }]]);
});

test("저장된 착용에 안 가진 것이 섞여 있어도 내보내지 않는다", async () => {
  const s = await setup({ cuts: 10 });
  await s.request("POST", "/api/shop/buy", { sku: "pet_cat" });
  await s.store.saveGear({ userId: ME, gear: { pet: "pet_fox", fx: "fx_bang", head: "pet_cat" }, at: T0 });
  assert.deepEqual(await s.auth.gearOf(ME), {});
  await s.store.saveGear({ userId: ME, gear: { pet: "pet_cat", fx: "fx_bang" }, at: T0 });
  assert.deepEqual(await s.auth.gearOf(ME), { pet: "pet_cat" });
});

test("메모리 저장소: 사용자가 지워지면 가진 것 · 쓰는 것도 지워진다", async () => {
  const s = await setup({ cuts: 10 });
  await s.request("POST", "/api/shop/buy", { sku: "pet_cat" });
  await s.request("PUT", "/api/me/gear", { slot: "pet", sku: "pet_cat" });
  await s.store.cleanup({ sessionsBefore: T0, usersBefore: T0 + 1 });
  assert.deepEqual(await s.store.getInventory(ME), []);
  assert.deepEqual(await s.store.getGear(ME), {});
});

test("Supabase 저장소: 구매는 DB 함수 하나로, 보유 · 착용 요청 모양", async () => {
  const calls = [];
  let buy = { ok: true, reason: null, balance: 4 };
  const fn = async (url, init) => {
    const path = String(url).split("/rest/v1")[1];
    calls.push({ url: path, method: init.method, prefer: init.headers.prefer, body: init.body ? JSON.parse(init.body) : null });
    if (path.startsWith("/rpc/campus_shop_buy")) return Response.json(buy);
    if (path.startsWith("/campus_inventory")) return Response.json([{ sku: "pet_cat" }, { sku: "fx_bang" }]);
    if (path.startsWith("/campus_gear") && init.method === "GET") return Response.json([{ gear: { pet: "pet_cat" } }]);
    return new Response(null, { status: 201 });
  };
  const s = createSupabaseStore({ url: "https://abc.supabase.co", key: "sb_secret_x", fetch: fn });

  assert.deepEqual(await s.buyItem({ userId: ME, sku: "pet_cat", price: 10 }), { ok: true, reason: null, balance: 4 });
  assert.deepEqual(calls.at(-1), { url: "/rpc/campus_shop_buy", method: "POST", prefer: "count=none", body: { p_user: ME, p_sku: "pet_cat", p_price: 10 } });
  buy = { ok: false, reason: "insufficient", balance: 4 };
  assert.deepEqual(await s.buyItem({ userId: ME, sku: "pet_fox", price: 10 }), { ok: false, reason: "insufficient", balance: 4 });
  buy = { oops: 1 };
  await assert.rejects(s.buyItem({ userId: ME, sku: "pet_fox", price: 10 }), /shop_buy/);

  assert.deepEqual(await s.getInventory(ME), ["pet_cat", "fx_bang"]);
  assert.equal(calls.at(-1).url, `/campus_inventory?harudle_user_id=eq.${ME}&select=sku&order=acquired_at.asc`);
  assert.deepEqual(await s.getGear(ME), { pet: "pet_cat" });
  assert.equal(calls.at(-1).url, `/campus_gear?harudle_user_id=eq.${ME}&select=gear&limit=1`);

  await s.saveGear({ userId: ME, gear: { fx: "fx_bang" }, at: T0 });
  assert.deepEqual(calls.at(-1), { url: "/campus_gear?on_conflict=harudle_user_id", method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { harudle_user_id: ME, gear: { fx: "fx_bang" }, updated_at: "2026-11-10T03:00:00.000Z" } });
});

test("상점 응답의 earn.today: 오늘 피드 보상을 받았으면 true", async () => {
  const s = await setup();
  assert.deepEqual((await s.request("GET", "/api/shop")).body.earn, { reward: 10, today: false });
  await s.store.grantReward({ userId: ME, kind: "feed_daily", refKey: "2026-11-09", amount: 10, at: T0 });
  assert.equal((await s.request("GET", "/api/shop")).body.earn.today, false, "어제 것은 오늘이 아니다");
  await s.store.grantReward({ userId: ME, kind: "feed_daily", refKey: "2026-11-10", amount: 10, at: T0 });
  assert.equal((await s.request("GET", "/api/shop")).body.earn.today, true);
});
