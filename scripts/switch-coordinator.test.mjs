import assert from "node:assert/strict";
import { test } from "node:test";
import { createSwitchCoordinator } from "../server/media/switch-coordinator.js";

test("기존 참가자 모두가 연결을 정리했다고 알려야 전환을 완료한다", async () => {
  const sent = [];
  const peers = new Map(["a", "b"].map((id) => [id, { mediaProvider: "livekit", ws: { readyState: 1, send: (value) => sent.push({ id, ...JSON.parse(value) }) } }]));
  const c = createSwitchCoordinator(peers, 1000);
  let done = false;
  const prepare = c.prepare({ from: "livekit", to: "daily", revision: 1 }).then(() => { done = true; });
  assert.equal(sent.length, 2);
  c.ack("a", 1); await Promise.resolve(); assert.equal(done, false);
  c.ack("b", 2); await Promise.resolve(); assert.equal(done, false);
  c.ack("b", 1); await prepare; assert.equal(done, true);
  assert.equal(peers.get("a").mediaProvider, null);
});

test("참가자가 응답하지 않거나 연결이 끊기면 전환을 중단한다", async () => {
  const peers = new Map([["a", { mediaProvider: "daily", ws: { readyState: 1, send() {} } }]]);
  const c = createSwitchCoordinator(peers, 20);
  await assert.rejects(c.prepare({ from: "daily", to: "cloudflare", revision: 1 }), /switch_timeout/);
  const next = c.prepare({ from: "daily", to: "cloudflare", revision: 2 });
  c.disconnected("a");
  await assert.rejects(next, /switch_unavailable/);
});

test("참가자가 먼저 연결을 정리하고 나간 경우에는 응답을 기다리지 않는다", async () => {
  const peers = new Map(["a", "b"].map((id) => [id, { mediaProvider: "daily", ws: { readyState: 1, send() {} } }]));
  const c = createSwitchCoordinator(peers, 1000);
  c.left("a");
  const prepare = c.prepare({ from: "daily", to: "cloudflare", revision: 1 });
  c.left("b");
  await prepare;
  assert.equal(peers.get("a").mediaProvider, null);
  assert.equal(peers.get("b").mediaProvider, null);
});
