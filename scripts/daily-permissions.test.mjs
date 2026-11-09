import assert from "node:assert/strict";
import { test } from "node:test";
import { createDailyPermissionManager } from "../server/media/daily-permissions.js";
import { managedRoom } from "../server/media/managed-providers.js";

const makePeer = (x) => ({ mediaProvider: "daily", mediaArea: "12:open", mediaGeneration: 4, dailyReady: true, presence: { f: 12, x, y: 10, rm: "" } });
const store = { state: () => ({ provider: "daily", phase: "active", generation: 4 }) };

test("서버는 가까운 사람만 Daily 수신 권한을 주고 멀어지면 권한을 내린다", async () => {
  const peers = new Map([["a", makePeer(10)], ["b", makePeer(12)], ["c", makePeer(30)]]), updates = [];
  const fetchImpl = async (_url, options) => {
    if (options.method === "GET") return new Response(JSON.stringify({ total_count: 3, data: ["a", "b", "c"].map((id) => ({ id: `session-${id}`, userId: id })) }));
    updates.push(JSON.parse(options.body).data); return new Response(JSON.stringify({ status: "sent" }));
  };
  const manager = createDailyPermissionManager({ peers, store, namespace: "campus", apiKey: "secret", fetchImpl });
  await manager.syncNow();
  assert.deepEqual(updates[0]["session-a"].canReceive, { base: false, byUserId: { a: false, b: true, c: false } });
  peers.get("b").presence.x = 25; await manager.syncNow();
  assert.equal(updates[1]["session-a"].canReceive.byUserId.b, false);
  await manager.close();
});

test("참가자 목록이 불완전하거나 권한 갱신에 실패하면 오류로 처리한다", async () => {
  const peers = new Map([["a", makePeer(10)]]); let failure = false;
  const manager = createDailyPermissionManager({ peers, store, namespace: "campus", apiKey: "secret", onFailure: async () => { failure = true; }, fetchImpl: async () => new Response(JSON.stringify({ total_count: 2, data: [] })) });
  await assert.rejects(manager.syncNow(), /daily_permissions_unavailable/);
  await Promise.resolve(); assert.equal(failure, true);
  await manager.close();
});

test("Daily 수신 권한은 같은 위치의 다른 회의까지 섞지 않는다", async () => {
  const a = makePeer(10), b = makePeer(11); a.mediaScope = "meeting:one"; b.mediaScope = "meeting:two";
  const peers = new Map([["a", a], ["b", b]]), updates = [];
  const names = { [managedRoom("campus", 4, a.mediaScope)]: "a", [managedRoom("campus", 4, b.mediaScope)]: "b" };
  const fetchImpl = async (url, options) => {
    const id = names[new URL(url).pathname.split("/")[3]];
    if (options.method === "GET") return new Response(JSON.stringify({ total_count: 1, data: [{ id: `session-${id}`, userId: id }] }));
    updates.push(JSON.parse(options.body).data); return new Response(JSON.stringify({ status: "sent" }));
  };
  const manager = createDailyPermissionManager({ peers, store, namespace: "campus", apiKey: "secret", fetchImpl });
  await manager.syncNow();
  assert.equal(updates.length, 2);
  assert.deepEqual(updates.map((data) => Object.keys(Object.values(data)[0].canReceive.byUserId).length), [1, 1]);
  await manager.close();
});
