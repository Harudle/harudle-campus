import assert from "node:assert/strict";
import { test } from "node:test";
import { createCloudflareUsageGuard } from "../server/media/cloudflare-usage-guard.js";

test("Cloudflare 분석값을 모아서 기준에 도달하면 연결을 막는다", async () => {
  let used = 90, now = Date.parse("2026-11-09T10:00:00Z"), calls = 0;
  const guard = createCloudflareUsageGuard({ CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_ANALYTICS_TOKEN: "secret", CLOUDFLARE_BILLING_TOKEN: "billing", CLOUDFLARE_TEST_BUDGET_BYTES: "100" }, {
    now: () => now, cacheMs: 1000,
    readSettings: async () => ({ notOlderThan: 32 * 86400, maxDuration: 32 * 86400 }),
    readUsage: async ({ from, to }) => { calls++; assert.equal(from, "2026-10-09"); assert.equal(to, "2026-11-09"); return { sfuEgressBytes: used, turnEgressBytes: 5 }; },
  });
  assert.equal((await guard.check()).observedBytes, 95);
  used = 95; await guard.check(); assert.equal(calls, 1);
  now += 1001;
  await assert.rejects(guard.check(), /budget_exhausted/);
});
test("Cloudflare 분석을 읽을 수 없으면 사용 가능하다고 보지 않는다", async () => {
  const guard = createCloudflareUsageGuard({ CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_ANALYTICS_TOKEN: "secret", CLOUDFLARE_TEST_BUDGET_BYTES: "100" }, { readSettings: async () => ({ notOlderThan: 32 * 86400, maxDuration: 32 * 86400 }), readUsage: async () => { throw new Error("offline"); } });
  await assert.rejects(guard.check(), /budget_unavailable/);
  assert.equal(createCloudflareUsageGuard({}).configured, false);
});
test("분석 기록의 조회 가능 기간이 부족하면 연결하지 않는다", async () => {
  let requested = false;
  const guard = createCloudflareUsageGuard({ CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_ANALYTICS_TOKEN: "secret", CLOUDFLARE_BUDGET_BYTES: "100" }, { now: () => Date.parse("2026-11-09T10:00:00Z"), readSettings: async () => ({ notOlderThan: 30 * 86400, maxDuration: 32 * 86400 }), readUsage: async () => { requested = true; } });
  await assert.rejects(guard.check(), /budget_unavailable/);
  assert.equal(requested, false);
});
