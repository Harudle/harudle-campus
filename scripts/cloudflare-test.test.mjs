import assert from "node:assert/strict";
import { test } from "node:test";
import { createCloudflareTestService } from "../server/media/cloudflare-test.js";

const env = { MEDIA_PROVIDER: "cloudflare-test", CAMPUS_BIND_HOST: "127.0.0.1", CLOUDFLARE_EXPERIMENTAL: "local-only" };
const peer = (x, rm = "") => ({ name: "크루", presence: { f: 12, x, y: 5, rm } });
function fixture() {
  const peers = new Map([["a", peer(10)], ["b", peer(12)], ["c", peer(13)]]);
  const sessions = new Map(), journalIds = new Set(); let seq = 0;
  const client = {
    configured: true,
    async createSession() { const id = `session-${++seq}`; sessions.set(id, []); return id; },
    async publish(id, _name, mid) { sessions.get(id).push({ mid, status: "active" }); return { sessionDescription: { type: "answer", sdp: "v=0" } }; },
    async subscribe(id) { sessions.get(id).push({ mid: "0", status: "active" }); return { requiresImmediateRenegotiation: true, track: { mid: "0" }, sessionDescription: { type: "offer", sdp: "v=0" } }; },
    async answer() {},
    async getSession(id) { return sessions.get(id).map((t) => ({ ...t })); },
    async close(id, mid) { sessions.get(id).find((t) => t.mid === mid).status = "inactive"; },
  };
  const journal = { add: (id) => journalIds.add(id), remove: (id) => journalIds.delete(id), close() {} };
  const guard = { configured: true, async check() {} };
  return { peers, client, journal, guard, journalIds, service: createCloudflareTestService(env, peers, { client, journal, guard }) };
}
const join = (service, identity) => service.join({ identity, area: "12:open", canShare: false });

test("Cloudflare 시험은 로컬에서만 두 명까지 허용하고 가까운 사람의 소리만 구독한다", async () => {
  const { service, peers, client, journal, guard, journalIds } = fixture();
  assert.equal(createCloudflareTestService({ ...env, CAMPUS_BIND_HOST: "0.0.0.0" }, peers, { client, journal, guard }).configured, false);
  await join(service, "a"); await join(service, "b");
  await assert.rejects(join(service, "c"), /test_unavailable/);
  await assert.rejects(service.operation("a", "publish", { kind: "screen" }), /invalid_media_request/);
  const pub = await service.operation("a", "publish", { kind: "audio", mid: "0", description: { type: "offer", sdp: "v=0" } });
  assert.equal((await service.operation("b", "list")).length, 0);
  await service.operation("a", "publish-ready", { id: pub.id });
  const tracks = await service.operation("b", "list");
  assert.equal(tracks.length, 1); assert.equal(tracks[0].peer, "a");
  const sub = await service.operation("b", "subscribe", { track: tracks[0].track });
  await service.operation("b", "answer", { id: sub.id, description: { type: "answer", sdp: "v=0" } });
  peers.get("b").presence.x = 30; service.presenceChanged();
  assert.equal((await service.operation("b", "list")).length, 0);
  await service.operation("b", "close", { id: sub.id });
  await assert.rejects(service.operation("b", "subscribe", { track: tracks[0].track }), /invalid_media_request/);
  await service.operation("a", "close", { id: pub.id });
  await service.operation("a", "leave"); await service.operation("b", "leave");
  await service.shutdown();
  assert.equal(journalIds.size, 0);
});

test("같은 위치라도 서로 다른 회의의 Cloudflare 트랙을 볼 수 없다", async () => {
  const { service } = fixture();
  await service.join({ identity: "a", area: "12:open", scope: "meeting:one", canShare: false });
  await service.join({ identity: "b", area: "12:open", scope: "meeting:two", canShare: false });
  const pub = await service.operation("a", "publish", { kind: "audio", mid: "0", description: { type: "offer", sdp: "v=0" } });
  await service.operation("a", "publish-ready", { id: pub.id });
  assert.deepEqual(await service.operation("b", "list"), []);
  await service.shutdown();
});

test("분석 사용량이 시험 기준을 넘으면 남은 연결을 닫고 추가 연결을 막는다", async () => {
  const { service, guard, journalIds } = fixture();
  await join(service, "a");
  await service.operation("a", "publish", { kind: "audio", mid: "0", description: { type: "offer", sdp: "v=0" } });
  guard.check = async () => { throw new Error("budget_exhausted"); };
  await assert.rejects(service.operation("a", "list"), /budget_exhausted/);
  assert.equal(journalIds.size, 0);
  await assert.rejects(join(service, "b"), /test_unavailable/);
  await service.shutdown();
});

test("Cloudflare 연결 종료를 확인하지 못하면 시험을 중지하고 기록을 남긴다", async () => {
  const { service, client, journalIds } = fixture();
  await join(service, "a");
  const pub = await service.operation("a", "publish", { kind: "audio", mid: "0", description: { type: "offer", sdp: "v=0" } });
  client.close = async () => { throw new Error("unavailable"); };
  await assert.rejects(service.operation("a", "close", { id: pub.id }), /test_cleanup_required/);
  assert.equal(journalIds.size, 1);
  await assert.rejects(join(service, "b"), /test_unavailable/);
  await assert.rejects(service.shutdown(), /test_cleanup_required/);
});
