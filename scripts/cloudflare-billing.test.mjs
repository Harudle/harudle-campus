import assert from "node:assert/strict";
import { test } from "node:test";
import { getCloudflareBillingPeriod } from "../server/media/cloudflare-billing.js";
const params = { accountId: "a".repeat(32), token: "secret", now: Date.parse("2026-11-09T00:00:00Z") };
const reply = (result) => new Response(JSON.stringify({ success: true, result }));

test("계정에서 받은 청구 주기 기준 시각을 사용한다", async () => {
  const result = await getCloudflareBillingPeriod({ ...params, fetchImpl: async (_url, options) => {
    assert.equal(options.headers.authorization, "Bearer secret");
    return reply({ covered: true, subscriptions: [{ billing_cycle_anchor_timestamp: "2026-11-02T00:00:00Z" }] });
  } });
  assert.equal(result.date, "2026-11-02");
});
test("청구 주기가 없거나 모호하거나 오래되면 조회를 중단한다", async () => {
  for (const subscriptions of [[], [{ billing_cycle_anchor_timestamp: "2026-09-01T00:00:00Z" }], [{ billing_cycle_anchor_timestamp: "2026-11-01T00:00:00Z" }, { billing_cycle_anchor_timestamp: "2026-11-02T00:00:00Z" }]]) {
    await assert.rejects(getCloudflareBillingPeriod({ ...params, fetchImpl: async () => reply({ covered: true, subscriptions }) }), /cloudflare_billing_unavailable/);
  }
});
