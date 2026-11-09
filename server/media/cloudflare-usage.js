// GraphQL 분석 수치는 표본과 집계 지연이 있을 수 있다. 청구 금액이나 강제 한도가 아니다.
export async function getCloudflareUsage({ accountId, token, from, to, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/.test(accountId || "") || !token || !/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "") || from > to) throw new Error("invalid_usage_request");
  const query = `query($account:String!,$start:Date!,$end:Date!){viewer{accounts(filter:{accountTag:$account}){sfu:callsUsageAdaptiveGroups(filter:{date_geq:$start,date_leq:$end},limit:1){sum{egressBytes}} turn:callsTurnUsageAdaptiveGroups(filter:{date_geq:$start,date_leq:$end},limit:1){sum{egressBytes}}}}}`;
  const response = await fetchImpl("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { account: accountId, start: from, end: to } }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("cloudflare_usage_unavailable");
  const json = await response.json();
  if (json?.errors?.length || !Array.isArray(json?.data?.viewer?.accounts) || json.data.viewer.accounts.length !== 1) throw new Error("cloudflare_usage_unavailable");
  const account = json.data.viewer.accounts[0];
  const bytes = (rows) => {
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("cloudflare_usage_invalid");
    if (!rows.length) return 0;
    const value = rows[0]?.sum?.egressBytes;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("cloudflare_usage_invalid");
    return value;
  };
  return { from, to, sfuEgressBytes: bytes(account.sfu), turnEgressBytes: bytes(account.turn) };
}
