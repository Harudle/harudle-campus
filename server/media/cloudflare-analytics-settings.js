// 두 분석 데이터셋의 조회 가능 기간을 확인한다. 누락된 항목은 사용할 수 없다고 본다.
export async function getCloudflareAnalyticsSettings({ accountId, token, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/.test(accountId || "") || !token) throw new Error("invalid_usage_request");
  const query = `query($account:String!){viewer{accounts(filter:{accountTag:$account}){settings{sfu:callsUsageAdaptiveGroups{enabled maxDuration notOlderThan} turn:callsTurnUsageAdaptiveGroups{enabled maxDuration notOlderThan}}}}}`;
  const response = await fetchImpl("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { account: accountId } }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("cloudflare_usage_unavailable");
  const json = await response.json(), accounts = json?.data?.viewer?.accounts;
  if (json?.errors?.length || !Array.isArray(accounts) || accounts.length !== 1) throw new Error("cloudflare_usage_unavailable");
  const { sfu, turn } = accounts[0]?.settings || {};
  if (![sfu, turn].every((x) => x?.enabled === true && Number.isSafeInteger(x.maxDuration) && Number.isSafeInteger(x.notOlderThan))) throw new Error("cloudflare_usage_unavailable");
  return { maxDuration: Math.min(sfu.maxDuration, turn.maxDuration), notOlderThan: Math.min(sfu.notOlderThan, turn.notOlderThan) };
}
