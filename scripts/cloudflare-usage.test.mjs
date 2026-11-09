import assert from "node:assert/strict";
import { test } from "node:test";
import { getCloudflareUsage } from "../server/media/cloudflare-usage.js";

const params = { accountId: "a".repeat(32), token: "secret", from: "2026-11-01", to: "2026-11-09" };
const reply = (body) => new Response(JSON.stringify(body));
test("Cloudflare 계정 전체의 SFU와 TURN 사용량을 따로 읽는다", async () => {
  const usage = await getCloudflareUsage({ ...params, fetchImpl: async (_url, options) => {
    assert.equal(options.headers.authorization, "Bearer secret");
    assert.equal(JSON.parse(options.body).variables.account, params.accountId);
    return reply({ data: { viewer: { accounts: [{ sfu: [{ sum: { egressBytes: 123 } }], turn: [{ sum: { egressBytes: 50 } }] }] } } });
  } });
  assert.deepEqual(usage, { from: params.from, to: params.to, sfuEgressBytes: 123, turnEgressBytes: 50 });
});
test("분석 조회 오류와 잘못된 데이터는 0으로 처리하지 않는다", async () => {
  await assert.rejects(getCloudflareUsage({ ...params, fetchImpl: async () => reply({ errors: [{ message: "denied" }] }) }), /cloudflare_usage_unavailable/);
  await assert.rejects(getCloudflareUsage({ ...params, fetchImpl: async () => reply({ data: { viewer: { accounts: [{ sfu: [{ sum: { egressBytes: -1 } }], turn: [] }] } } }) }), /cloudflare_usage_invalid/);
});
