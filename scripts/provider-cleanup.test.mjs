import assert from "node:assert/strict";
import { test } from "node:test";
import { createProviderCleaners, cleanupDurableResources } from "../server/media/provider-cleanup.js";

const room = `campus-g3-${"a".repeat(24)}`;
const resource = (provider, kind, locator, extra = {}) => ({ resource_key: `${provider}-${kind}`, provider, generation: 3, kind, locator, pending: 0, ...extra });

test("LiveKit 참가자를 먼저 제거하고 해당 방이 없어진 것을 확인한다", async () => {
  const calls = []; let exists = true;
  const livekit = {
    async removeParticipant(name, identity, options) { calls.push(["remove", name, identity, options.revokeTokenTs]); },
    async listRooms() { return exists ? [{ name: room }] : []; },
    async deleteRoom(name) { calls.push(["delete", name]); exists = false; },
  };
  const cleaners = createProviderCleaners({ namespace: "campus", livekit, now: () => 100000 });
  await cleaners.livekit(resource("livekit", "participant", JSON.stringify({ room, identity: "peer-1" })));
  await cleaners.livekit(resource("livekit", "room", room));
  assert.deepEqual(calls, [["remove", room, "peer-1", 130n], ["delete", room]]);
  await assert.rejects(cleaners.livekit(resource("livekit", "room", `other-g3-${"a".repeat(24)}`)), /invalid_resource/);
});

test("Daily 방 삭제와 Cloudflare 트랙 종료가 확인되어야 정리 성공이다", async () => {
  let dailyDeleted = false, active = true;
  const fetchImpl = async (_url, options) => {
    if (options.method === "DELETE") { dailyDeleted = true; return new Response(JSON.stringify({ deleted: true, name: room })); }
    return new Response("{}", { status: dailyDeleted ? 404 : 200 });
  };
  const cloudflare = { async getSession() { return [{ mid: "0", status: active ? "active" : "inactive" }]; }, async close() { active = false; } };
  const cleaners = createProviderCleaners({ namespace: "campus", dailyKey: "secret", cloudflare, fetchImpl });
  await cleaners.daily(resource("daily", "room", room));
  await cleaners.cloudflare(resource("cloudflare", "session", "session-one"));
  assert.equal(dailyDeleted, true); assert.equal(active, false);
});

test("참가자 정리 실패 또는 진행 중인 요청이 있으면 방을 정리 완료로 기록하지 않는다", async () => {
  const participant = resource("livekit", "participant", JSON.stringify({ room, identity: "peer-1" }));
  const r = resource("livekit", "room", room);
  const remaining = [participant, r], attempts = [];
  const store = {
    assertLeadership() {}, state: () => ({ phase: "switching" }), pendingResources: () => remaining.slice(),
    closeResource(key) { remaining.splice(remaining.findIndex((x) => x.resource_key === key), 1); },
  };
  let fail = true;
  const cleaners = { livekit: async (item) => { attempts.push(item.kind); if (item.kind === "participant" && fail) throw new Error("unavailable"); } };
  assert.deepEqual(await cleanupDurableResources(store, cleaners), { unresolved: 2 });
  assert.deepEqual(attempts, ["participant", "room"]);
  assert.equal(remaining.length, 2);
  fail = false; participant.pending = 1;
  assert.deepEqual(await cleanupDurableResources(store, cleaners), { unresolved: 2 });
  participant.pending = 0;
  assert.deepEqual(await cleanupDurableResources(store, cleaners), { unresolved: 0 });
  assert.equal(remaining.length, 0);
});
