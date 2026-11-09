import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeDurableMediaState, openDurableMediaState } from "../server/media/durable-state.js";
import { createCloudflareTestService } from "../server/media/cloudflare-test.js";

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "campus-cf-managed-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "state.sqlite"), period = new Date().toISOString().slice(0, 7);
  initializeDurableMediaState({ path, period, budgets: { livekit: { limit: 60, used: 0 }, livekit_bytes: { limit: 5000000000, used: 0 }, daily: { limit: 60, used: 0 }, cloudflare: { limit: 2000000000, used: 0 } } });
  const store = openDurableMediaState(path); store.acquireLeadership(); store.completeCleanup();
  for (const [provider, generation] of [["livekit", 0], ["daily", 1]]) { const change = store.beginSwitch({ provider, generation }); store.completeCleanup({ transitionId: change.id }); }
  t.after(() => { try { store.releaseLeadership(); store.close(); } catch {} });
  const peers = new Map(["a", "b"].map((id, index) => [id, { name: id, presence: { f: 12, x: 10 + index, y: 5, rm: "" } }]));
  let count = 0; const sessions = new Map();
  const client = {
    configured: true,
    async createSession() { const id = `session-${++count}`; sessions.set(id, []); return id; },
    async publish(id, _name, mid) { sessions.get(id).push({ mid, status: "active" }); return { sessionDescription: { type: "answer", sdp: "v=0" } }; },
    async subscribe(id) { sessions.get(id).push({ mid: "0", status: "active" }); return { requiresImmediateRenegotiation: true, track: { mid: "0" }, sessionDescription: { type: "offer", sdp: "v=0" } }; },
    async answer() {}, async getSession(id) { return sessions.get(id).map((x) => ({ ...x })); }, async close(id, mid) { sessions.get(id).find((x) => x.mid === mid).status = "inactive"; },
  };
  const guard = { configured: true, async check() { return { observedBytes: 0, limitBytes: 2000000000 }; } };
  const watchdog = { configured: true, async register() {}, async begin() {}, async finish() {}, async disarm() {} };
  const env = { MEDIA_PROVIDER: "managed-draft", MEDIA_SINGLE_HOST: "1", MEDIA_MAX_PARTICIPANTS: "2", CLOUDFLARE_LEASE_SECONDS: "300" };
  return { store, peers, client, guard, watchdog, env };
}

test("Cloudflare 초안은 세션 생성 전에 사용량을 예약하고 연결 기록을 유지한다", async (t) => {
  const { store, peers, client, guard, watchdog, env } = fixture(t);
  const service = createCloudflareTestService(env, peers, { store, client, guard, watchdog });
  await service.join({ identity: "a", area: "12:open" }, { generation: 2 });
  await service.join({ identity: "b", area: "12:open" }, { generation: 2 });
  const published = await service.operation("a", "publish", { kind: "audio", mid: "0", description: { type: "offer", sdp: "v=0" } });
  await service.operation("a", "publish-ready", { id: published.id });
  const [track] = await service.operation("b", "list");
  const sub = await service.operation("b", "subscribe", { track: track.track });
  await service.operation("b", "answer", { id: sub.id, description: { type: "answer", sdp: "v=0" } });
  assert.ok(store.budget("cloudflare").reserved >= 600000000);
  assert.deepEqual(store.pendingResources("cloudflare").map((r) => r.pending), [0, 0]);
  await service.operation("a", "leave"); await service.operation("b", "leave");
  assert.equal(store.pendingResources("cloudflare").length, 0);
  await service.shutdown();
});

test("Cloudflare 사용량 조회가 실패하면 연결을 정리하고 새 연결을 막는다", async (t) => {
  const { store, peers, client, guard, watchdog, env } = fixture(t); let limited = false;
  const service = createCloudflareTestService(env, peers, { store, client, guard, watchdog, onLimit: async () => { limited = true; } });
  await service.join({ identity: "a", area: "12:open" }, { generation: 2 });
  guard.check = async () => { throw new Error("budget_unavailable"); };
  await assert.rejects(service.operation("a", "list"), /budget_unavailable/);
  await Promise.resolve(); assert.equal(limited, true);
  await assert.rejects(service.join({ identity: "b", area: "12:open" }, { generation: 2 }), /test_unavailable/);
  await service.shutdown();
});

test("별도 정리 Worker에 등록하지 못하면 SFU에 미디어를 보내지 않는다", async (t) => {
  const { store, peers, client, guard, watchdog, env } = fixture(t);
  let published = false;
  client.publish = async () => { published = true; throw new Error("unexpected"); };
  watchdog.register = async () => { throw new Error("watchdog_unavailable"); };
  const service = createCloudflareTestService(env, peers, { store, client, guard, watchdog });
  await service.join({ identity: "a", area: "12:open" }, { generation: 2 });
  await assert.rejects(service.operation("a", "publish", { kind: "audio", mid: "0", description: { type: "offer", sdp: "v=0" } }), /watchdog_unavailable/);
  assert.equal(published, false);
  assert.equal(store.pendingResources("cloudflare").length, 0);
  await service.shutdown();
});

test("예전 세션의 정리가 확인되기 전에는 Cloudflare 참가를 허용하지 않는다", async (t) => {
  const { store, peers, client, guard, watchdog, env } = fixture(t); let ready = false;
  const recovery = { async ensureClear() { if (!ready) throw new Error("cloudflare_cleanup_required"); } };
  const service = createCloudflareTestService(env, peers, { store, client, guard, watchdog, recovery });
  await assert.rejects(service.join({ identity: "a", area: "12:open" }, { generation: 2 }), /cloudflare_cleanup_required/);
  assert.equal(store.budget("cloudflare").reserved, 0);
  ready = true; assert.equal((await service.join({ identity: "a", area: "12:open" }, { generation: 2 })).provider, "cloudflare");
  await service.shutdown();
});
