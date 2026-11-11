import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { RoomServiceClient } from "livekit-server-sdk";
import { initializeDurableMediaState, openDurableMediaState } from "../server/media/durable-state.js";
import { createManagedMediaStack } from "../server/media/managed-stack.js";

async function fixture(t, freeOnly = false) {
  const dir = mkdtempSync(join(tmpdir(), "campus-production-media-"));
  const path = join(dir, "state.sqlite"), livekitRooms = new Map(), dailyRooms = new Map(), events = [];
  initializeDurableMediaState({ path, period: new Date().toISOString().slice(0, 7), budgets: {
    livekit: { limit: 330, used: 0 }, livekit_bytes: { limit: 1000000000, used: 0 },
    daily: { limit: 360, used: 0 }, cloudflare: { limit: 1000000000, used: 0 },
  } });
  t.mock.method(RoomServiceClient.prototype, "listRooms", async (names = [...livekitRooms.keys()]) => names.map((name) => livekitRooms.get(name)).filter(Boolean));
  t.mock.method(RoomServiceClient.prototype, "createRoom", async (room) => { livekitRooms.set(room.name, room); return room; });
  t.mock.method(RoomServiceClient.prototype, "removeParticipant", async () => { events.push("livekit:participant-left"); });
  t.mock.method(RoomServiceClient.prototype, "deleteRoom", async (name) => { livekitRooms.delete(name); events.push("livekit:room-deleted"); });
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
  const fetchImpl = t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    const { hostname, pathname } = new URL(url), body = options.body && JSON.parse(options.body);
    if (hostname === "api.cloudflare.com" && pathname === "/client/v4/graphql") {
      const settings = { enabled: true, maxDuration: 35 * 86400, notOlderThan: 35 * 86400 };
      const account = body.query.includes("settings{") ? { settings: { sfu: settings, turn: settings } } : { sfu: [], turn: [] };
      return json({ data: { viewer: { accounts: [account] } } });
    }
    if (hostname === "api.daily.co") {
      if (pathname === "/v1/") return json({});
      if (pathname === "/v1/rooms" && options.method === "POST") {
        assert.equal(livekitRooms.size, 0, "LiveKit 방을 정리한 뒤 Daily 방을 만든다");
        const room = { name: body.name, privacy: body.privacy, config: body.properties, url: `https://campus-test.daily.co/${body.name}` };
        dailyRooms.set(body.name, room); events.push("daily:room-created"); return json(room);
      }
      if (pathname.startsWith("/v1/rooms/")) {
        const name = pathname.slice("/v1/rooms/".length);
        if (options.method === "DELETE") { dailyRooms.delete(name); events.push("daily:room-deleted"); return json({ deleted: true, name }); }
        return json(dailyRooms.get(name) || {}, dailyRooms.has(name) ? 200 : 404);
      }
      if (pathname === "/v1/meeting-tokens") return json({ token: "test-daily-token" });
    }
    throw new Error(`unexpected_request: ${url}`);
  });
  const env = {
    NODE_ENV: "production", MEDIA_PROVIDER: "managed-draft", MEDIA_SINGLE_HOST: "1", MEDIA_STATE_PATH: path,
    MEDIA_NAMESPACE: "prodtest", MEDIA_TEST_FREE_ONLY: freeOnly ? "1" : "0",
    LIVEKIT_URL: "wss://example.invalid", LIVEKIT_API_KEY: "key", LIVEKIT_API_SECRET: "secret",
    DAILY_DOMAIN: "campus-test", DAILY_API_KEY: "test",
    CLOUDFLARE_SFU_APP_ID: "a".repeat(20), CLOUDFLARE_SFU_SECRET: "s".repeat(32),
    CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_ANALYTICS_TOKEN: "test", CLOUDFLARE_BUDGET_BYTES: "1000000000",
    CLOUDFLARE_WATCHDOG_URL: "https://example.invalid", CLOUDFLARE_WATCHDOG_TOKEN: "w".repeat(32),
  };
  const peers = new Map([["peer-1", { name: "크루", presence: { f: 12, x: 2, y: 2, rm: "" } }]]);
  let stack;
  t.after(async () => { try { await stack?.shutdown(); } finally { rmSync(dir, { recursive: true, force: true }); } });
  async function start(overrides = {}) {
    stack = createManagedMediaStack({ ...env, ...overrides }, peers, { fetchImpl, notifySwitch: (change) => events.push(`${change.from}->${change.to}`) });
    for (let i = 0; i < 100 && stack.router.state().phase === "recovering"; i++) await setImmediate();
    return stack;
  }
  return { start, path, events, livekitRooms, dailyRooms, stop: async () => { await stack.shutdown(); stack = null; } };
}

const participant = { identity: "peer-1", name: "크루", area: "12:open", canShare: false };

test("운영 관리 모드에서도 예약 한도마다 LiveKit, Daily, Cloudflare로 전환하고 재시작 뒤 이어 쓴다", async (t) => {
  const f = await fixture(t);
  let stack = await f.start();
  assert.equal((await stack.router.join(participant)).provider, "livekit");
  assert.equal((await stack.router.join(participant)).provider, "daily");
  assert.equal((await stack.router.join(participant)).provider, "cloudflare");
  assert.equal(f.dailyRooms.size, 0);
  assert.deepEqual(f.events, ["livekit->daily", "livekit:participant-left", "livekit:room-deleted", "daily:room-created", "daily->cloudflare", "daily:room-deleted"]);
  await f.stop();
  stack = await f.start();
  assert.equal((await stack.router.join(participant)).provider, "cloudflare");
  const store = openDurableMediaState(f.path);
  try {
    assert.equal(store.budget("livekit").reserved, 330);
    assert.equal(store.budget("daily").reserved, 360);
    assert.equal(store.budget("cloudflare").reserved, 10000000);
  } finally { store.close(); }
});

test("명시적인 LiveKit 단독 시험 설정은 운영 모드에서도 다른 제공자 연결을 막는다", async (t) => {
  const f = await fixture(t, true), stack = await f.start();
  assert.equal((await stack.router.join(participant)).provider, "livekit");
  await assert.rejects(stack.router.join(participant), /media_unavailable/);
  assert.equal(stack.router.state().phase, "blocked");
  assert.equal(f.dailyRooms.size, 0);
  assert.ok(!f.events.includes("daily:room-created"));
});

test("LiveKit 단독 운영에서 이미 한도로 중단했어도 제공자를 늘리면 예약을 보존하고 Daily로 재개한다", async (t) => {
  const f = await fixture(t, true);
  let stack = await f.start();
  await stack.router.join(participant);
  await assert.rejects(stack.router.join(participant), /media_unavailable/);
  await f.stop();

  stack = await f.start({ MEDIA_TEST_FREE_ONLY: "0" });
  await stack.router.checkExpired();
  assert.equal(stack.router.state().phase, "active");
  assert.equal((await stack.router.join(participant)).provider, "daily");
  const store = openDurableMediaState(f.path);
  try { assert.equal(store.budget("livekit").reserved, 330); } finally { store.close(); }
  assert.equal((await stack.router.join(participant)).provider, "cloudflare");
});
