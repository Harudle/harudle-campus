import assert from "node:assert/strict";
import { test } from "node:test";
import { createFailoverRouter } from "../server/media/failover.js";

const provider = (name, join) => ({ name, configured: true, join });

test("한 제공자의 한도가 끝나면 모두에게 전환을 알린 다음 새 제공자를 사용한다", async () => {
  const events = [];
  const router = createFailoverRouter({
    providers: [
      provider("livekit", async () => { throw new Error("budget_exhausted"); }),
      provider("daily", async () => { events.push("join-daily"); return { provider: "daily" }; }),
      provider("cloudflare", async () => ({ provider: "cloudflare" })),
    ],
    onSwitch: async (change) => { events.push(`${change.from}-to-${change.to}`); },
  });
  const [a, b] = await Promise.all([router.join({}), router.join({})]);
  assert.deepEqual(events, ["livekit-to-daily", "join-daily", "join-daily"]);
  assert.equal(a.provider, "daily"); assert.equal(b.provider, "daily");
  assert.equal(a.revision, 1); assert.equal(b.revision, 1);
});

test("전환 중에 완료된 이전 제공자 연결 정보는 사용하지 않는다", async () => {
  let finishOld;
  const old = new Promise((resolve) => { finishOld = resolve; });
  const router = createFailoverRouter({
    providers: [provider("livekit", () => old), provider("daily", async () => ({ provider: "daily" }))],
    onSwitch: async () => {},
  });
  const waiting = router.join({});
  await router.markUnavailable("livekit");
  finishOld({ provider: "livekit" });
  assert.equal((await waiting).provider, "daily");
});

test("전환 정리가 실패하거나 다음 제공자가 없으면 연결을 막는다", async () => {
  const router = createFailoverRouter({
    providers: [provider("livekit", async () => ({ provider: "livekit" })), provider("daily", async () => ({ provider: "daily" }))],
    onSwitch: async () => { throw new Error("cleanup_failed"); },
  });
  await assert.rejects(router.markUnavailable("livekit"), /media_unavailable/);
  await assert.rejects(router.join({}), /media_unavailable/);
  assert.equal(router.state.blocked, true);
  const only = createFailoverRouter({ providers: [provider("livekit", async () => { throw new Error("budget_exhausted"); })], onSwitch: async () => {} });
  await assert.rejects(only.join({}), /media_unavailable/);
  assert.equal(only.state.blocked, true);
});

test("사용자 한 명의 일반적인 연결 오류만으로는 전체 제공자를 바꾸지 않는다", async () => {
  const router = createFailoverRouter({
    providers: [provider("livekit", async () => { throw new Error("network_error"); }), provider("daily", async () => ({ provider: "daily" }))],
    onSwitch: async () => { throw new Error("unexpected_switch"); },
  });
  await assert.rejects(router.join({}), /network_error/);
  assert.equal(router.state.provider, "livekit");
});
