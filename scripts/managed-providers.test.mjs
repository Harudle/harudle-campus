import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TokenVerifier } from "livekit-server-sdk";
import { initializeDurableMediaState, openDurableMediaState } from "../server/media/durable-state.js";
import { createManagedDailyProvider, createManagedLiveKitProvider, managedRoom } from "../server/media/managed-providers.js";

function fixture(t, now = Date.now) {
  const dir = mkdtempSync(join(tmpdir(), "campus-managed-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "state.sqlite"), period = new Date().toISOString().slice(0, 7);
  initializeDurableMediaState({ path, period, now, budgets: { livekit: { limit: 1800, used: 0 }, livekit_bytes: { limit: 10000000000, used: 0 }, daily: { limit: 1800, used: 0 }, cloudflare: { limit: 1000, used: 0 } } });
  const store = openDurableMediaState(path, { now }); store.acquireLeadership(); store.completeCleanup();
  t.after(() => { try { store.releaseLeadership(); store.close(); } catch {} });
  return store;
}
const env = { MEDIA_NAMESPACE: "campus", LIVEKIT_URL: "wss://example.livekit.cloud", LIVEKIT_API_KEY: "key", LIVEKIT_API_SECRET: "secret", DAILY_DOMAIN: "campus-test", DAILY_API_KEY: "secret", LIVEKIT_LEASE_SECONDS: "300", DAILY_LEASE_SECONDS: "300" };

test("LiveKit은 연결마다 다른 ID와 세대별 방을 발급하고 시간을 먼저 기록한다", async (t) => {
  const rooms = new Map();
  const roomClient = { async listRooms(names) { return names.map((name) => rooms.get(name)).filter(Boolean); }, async createRoom(options) { const room = { name: options.name, maxParticipants: options.maxParticipants }; rooms.set(room.name, room); return room; } };
  const store = fixture(t), p = createManagedLiveKitProvider(env, store, { roomClient }), verifier = new TokenVerifier("key", "secret");
  const a = await p.join({ identity: "peer-1", name: "크루", area: "12:open", canShare: false }, { generation: 0 });
  const b = await p.join({ identity: "peer-1", name: "크루", area: "12:open", canShare: false }, { generation: 0 });
  const ca = await verifier.verify(a.connection.token), cb = await verifier.verify(b.connection.token);
  assert.notEqual(ca.sub, cb.sub); assert.ok(ca.sub.startsWith("peer-1__"));
  assert.equal(ca.video.room, managedRoom("campus", 0, "12:open"));
  assert.notEqual(managedRoom("campus", 0, "12:open"), managedRoom("campus", 1, "12:open"));
  assert.equal(store.budget("livekit").reserved, 660);
  assert.equal(store.budget("livekit_bytes").reserved, 2 * 5000000 + 330 * 2 * 64000);
  assert.equal(store.pendingResources("livekit").length, 3);
});

test("LiveKit 연결을 끊지 않고 예약을 연장하며 한도나 만료 때는 연장을 거절한다", async (t) => {
  let clock = Date.now();
  const store = fixture(t, () => clock), rooms = new Map();
  const roomClient = { async listRooms(names) { return names.map((name) => rooms.get(name)).filter(Boolean); }, async createRoom(options) { const room = { name: options.name, maxParticipants: options.maxParticipants }; rooms.set(room.name, room); return room; } };
  const provider = createManagedLiveKitProvider(env, store, { roomClient, now: () => clock });
  const join = await provider.join({ identity: "peer-1", name: "크루", area: "12:open", canShare: false }, { generation: 0 });
  assert.equal(join.connection.renewable, "1");
  let expiresAt = Number(join.connection.expiresAt);
  for (let i = 0; i < 4; i++) {
    clock += 295000;
    const renewed = provider.renew({ leaseKey: join._leaseKey, canShare: false }, { generation: 0 });
    assert.ok(renewed.expiresAt > expiresAt); expiresAt = renewed.expiresAt;
    assert.equal(store.resource(join._leaseKey).expires_at, expiresAt);
  }
  assert.equal(store.budget("livekit").reserved, 1650);
  clock += 295000;
  assert.throws(() => provider.renew({ leaseKey: join._leaseKey, canShare: false }, { generation: 0 }), /budget_exhausted/);
  assert.equal(store.resource(join._leaseKey).expires_at, expiresAt);
  assert.equal(store.budget("livekit").reserved, 1650);
  clock += 6000;
  assert.throws(() => provider.renew({ leaseKey: join._leaseKey, canShare: false }, { generation: 0 }), /media_state_changed/);
  assert.equal(store.budget("livekit").reserved, 1650);
});

test("Daily 같은 방의 동시 토큰 발급은 차례대로 진행하고 기록을 남긴다", async (t) => {
  const store = fixture(t), transition = store.beginSwitch({ provider: "livekit", generation: 0 }); store.completeCleanup({ transitionId: transition.id });
  let existing = null, tokens = 0, tokenProperties;
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    if (path.startsWith("/v1/rooms/") && options.method === "GET") return new Response(JSON.stringify(existing || {}), { status: existing ? 200 : 404 });
    if (path === "/v1/rooms") { const b = JSON.parse(options.body); existing = { name: b.name, privacy: "private", url: `https://${env.DAILY_DOMAIN}.daily.co/${b.name}`, config: b.properties }; return new Response(JSON.stringify(existing)); }
    if (path === "/v1/meeting-tokens") { tokens++; tokenProperties = JSON.parse(options.body).properties; return new Response(JSON.stringify({ token: `token-${tokens}` })); }
    throw new Error("unexpected_request");
  };
  const p = createManagedDailyProvider(env, store, { fetchImpl });
  const [a,b] = await Promise.all([p.join({ identity: "a", name: "A", area: "12:open", canShare: false }, { generation: 1 }), p.join({ identity: "b", name: "B", area: "12:open", canShare: false }, { generation: 1 })]);
  assert.notEqual(a.connection.token, b.connection.token);
  assert.deepEqual(tokenProperties.permissions.canReceive, { base: false });
  assert.equal(store.budget("daily").reserved, 720);
  assert.deepEqual(store.pendingResources("daily").map((r) => r.pending), [0]);
});

test("Daily 요청 결과가 불확실하면 기록을 남겨 전환을 막는다", async (t) => {
  const store = fixture(t), transition = store.beginSwitch({ provider: "livekit", generation: 0 }); store.completeCleanup({ transitionId: transition.id });
  const p = createManagedDailyProvider(env, store, { fetchImpl: async () => { throw new Error("network"); } });
  await assert.rejects(p.join({ identity: "a", name: "A", area: "12:open", canShare: false }, { generation: 1 }));
  assert.deepEqual(store.pendingResources("daily").map((r) => r.pending), [1]);
  const next = store.beginSwitch({ provider: "daily", generation: 1 });
  assert.throws(() => store.completeCleanup({ transitionId: next.id }), /cleanup_unconfirmed/);
});
