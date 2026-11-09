import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { initializeDurableMediaState, openDurableMediaState } from "../server/media/durable-state.js";
import { createDurableMediaRouter } from "../server/media/durable-router.js";

const TIME = Date.parse("2026-11-09T01:00:00Z"), EXP = TIME / 1000 + 60;
function fixture(t, now = () => TIME) {
  const dir = mkdtempSync(join(tmpdir(), "campus-router-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "media.sqlite"), budgets = { livekit: { limit: 60, used: 0 }, livekit_bytes: { limit: 5000, used: 0 }, daily: { limit: 120, used: 0 }, cloudflare: { limit: 1000, used: 0 } };
  initializeDurableMediaState({ path, period: "2026-11", budgets, now });
  const open = () => openDurableMediaState(path, { now });
  return { path, open };
}
function providers(store) {
  return Object.fromEntries(["livekit", "daily", "cloudflare"].map((provider) => [provider, {
    configured: true,
    async join(_options, { generation }) {
      store.reserve({ provider, generation, amount: provider === "cloudflare" ? 100 : 60, expiresAt: EXP });
      store.registerResource({ key: randomUUID(), provider, generation, kind: provider === "cloudflare" ? "session" : "room", locator: "test-resource", expiresAt: EXP });
      return { provider };
    },
  }]));
}
const cleaners = { livekit: async () => {}, daily: async () => {}, cloudflare: async () => {} };

test("서버 정리 후 세 제공자로 전환하고 현재 제공자와 사용량을 다시 시작한 뒤에도 유지한다", async (t) => {
  const f = fixture(t), db = f.open(), events = [];
  let router = createDurableMediaRouter({ store: db, providers: providers(db), cleaners, notifySwitch: (c) => events.push([c.from, c.to]) });
  await router.start();
  assert.equal((await router.join({})).provider, "livekit");
  assert.equal((await router.join({})).provider, "daily");
  assert.equal((await router.join({})).provider, "daily");
  assert.equal((await router.join({})).provider, "cloudflare");
  assert.deepEqual(events, [["livekit", "daily"], ["daily", "cloudflare"]]);
  await router.shutdown();
  const next = f.open(); router = createDurableMediaRouter({ store: next, providers: providers(next), cleaners });
  await router.start();
  assert.equal(router.state().provider, "cloudflare");
  assert.equal(next.budget("livekit").reserved, 60);
  assert.equal(next.budget("daily").reserved, 120);
  assert.equal(next.budget("cloudflare").reserved, 100);
  await router.shutdown();
});

test("정리 결과가 불확실하면 전환을 중단하고 다시 확인한 뒤에만 진행한다", async (t) => {
  const f = fixture(t), db = f.open(); let block = true;
  const router = createDurableMediaRouter({ store: db, providers: providers(db), cleaners: { ...cleaners, livekit: async () => { if (block) throw new Error("offline"); } } });
  await router.start(); await router.join({});
  await assert.rejects(router.join({}), /cleanup_unconfirmed/);
  assert.equal(router.state().phase, "switching");
  block = false; await router.retryCleanup();
  assert.equal((await router.join({})).provider, "daily");
  await router.shutdown();
});

test("제공자의 서버 오류가 나면 이전 연결 정리 후 다음 제공자를 선택한다", async (t) => {
  const f = fixture(t), db = f.open(), services = providers(db);
  services.livekit.join = async () => { throw new Error("livekit_unavailable"); };
  const router = createDurableMediaRouter({ store: db, providers: services, cleaners });
  await router.start();
  assert.equal((await router.join({})).provider, "daily");
  await router.shutdown();
});

test("갑자기 재시작해도 남아 있는 연결부터 정리한다", async (t) => {
  const f = fixture(t); let db = f.open(); db.completeCleanup();
  db.reserve({ provider: "livekit", generation: 0, amount: 60, expiresAt: EXP });
  db.registerResource({ key: "old-session", provider: "livekit", generation: 0, kind: "room", locator: "test-resource", expiresAt: EXP });
  db.close(); db = f.open(); const closed = [];
  const router = createDurableMediaRouter({ store: db, providers: providers(db), cleaners: { ...cleaners, livekit: async (r) => closed.push(r.resource_key) } });
  await router.start();
  assert.deepEqual(closed, ["old-session"]);
  assert.equal(db.budget("livekit").reserved, 60);
  assert.equal((await router.join({})).provider, "daily");
  await router.shutdown();
});

test("세 제공자를 다 쓴 뒤 예약 보관 기간이 끝나면 확인 후 자동으로 다시 연다", async (t) => {
  let clock = TIME, healthy = false;
  const f = fixture(t, () => clock), db = f.open();
  const services = providers(db);
  services.livekit.prepareResume = async () => { if (!healthy) throw new Error("offline"); };
  const router = createDurableMediaRouter({ store: db, providers: services, cleaners, now: () => clock });
  await router.start();
  for (let i = 0; i < 13; i++) await router.join({});
  await assert.rejects(router.join({}), /media_unavailable/);
  assert.equal(router.state().phase, "blocked");
  clock = TIME + 35 * 86400000;
  await router.checkExpired();
  assert.equal(router.state().phase, "blocked");
  clock += 61000;
  await assert.rejects(router.checkExpired(), /offline/);
  assert.equal(router.state().phase, "blocked");
  healthy = true; await router.checkExpired();
  assert.equal(router.state().phase, "active");
  assert.equal(router.state().provider, "livekit");
  await router.shutdown();
});
