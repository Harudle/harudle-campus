// Cloudflare 계정의 청구 주기 기준 시각을 읽는다. 이것이 현재 주기 시작인지는 별도 확인이 필요하다.
export async function getCloudflareBillingPeriod({ accountId, token, now = Date.now(), fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/.test(accountId || "") || !token || !Number.isFinite(now)) throw new Error("invalid_billing_request");
  const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/billable-usage/info`, {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("cloudflare_billing_unavailable");
  const json = await response.json();
  if (json?.success !== true || json.result?.covered !== true || !Array.isArray(json.result.subscriptions)) throw new Error("cloudflare_billing_unavailable");
  const active = json.result.subscriptions.filter((subscription) => !subscription.end_timestamp);
  if (active.length !== 1 || typeof active[0].billing_cycle_anchor_timestamp !== "string") throw new Error("cloudflare_billing_unavailable");
  const start = Date.parse(active[0].billing_cycle_anchor_timestamp);
  // 기준 시각이 오래되면 현재 주기라고 추정하지 않고 차단한다.
  if (!Number.isFinite(start) || start > now || now - start > 33 * 86400000) throw new Error("cloudflare_billing_unavailable");
  return { start: new Date(start).toISOString(), date: new Date(start).toISOString().slice(0, 10) };
}
