import assert from "node:assert/strict";
import { test } from "node:test";
import { getCloudflareAnalyticsSettings } from "../server/media/cloudflare-analytics-settings.js";

const accountId = "a".repeat(32), token = "secret";
const reply = (settings) => Response.json({ data: { viewer: { accounts: [{ settings }] } } });
test("SFU와 TURN 중 더 짧은 조회 가능 기간을 사용한다", async () => {
  const result = await getCloudflareAnalyticsSettings({ accountId, token, fetchImpl: async () => reply({ sfu: { enabled: true, notOlderThan: 300, maxDuration: 200 }, turn: { enabled: true, notOlderThan: 250, maxDuration: 190 } }) });
  assert.deepEqual(result, { notOlderThan: 250, maxDuration: 190 });
});
test("제공사가 조회 제한이나 데이터셋 상태를 알려주지 않으면 실패한다", async () => {
  await assert.rejects(getCloudflareAnalyticsSettings({ accountId, token, fetchImpl: async () => reply({ sfu: { enabled: true }, turn: null }) }), /cloudflare_usage_unavailable/);
});
