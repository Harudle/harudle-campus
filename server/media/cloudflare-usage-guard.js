import { getCloudflareUsage } from "./cloudflare-usage.js";
import { getCloudflareAnalyticsSettings } from "./cloudflare-analytics-settings.js";

// 분석값에는 지연과 표본 오차가 있다. 여유를 두고 중지하는 참고 기준이지 청구 상한은 아니다.
export function createCloudflareUsageGuard(env, { readUsage = getCloudflareUsage, readSettings = getCloudflareAnalyticsSettings, now = Date.now, cacheMs = 10000 } = {}) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || "", token = env.CLOUDFLARE_ANALYTICS_TOKEN || "", limit = Number(env.CLOUDFLARE_BUDGET_BYTES || env.CLOUDFLARE_TEST_BUDGET_BYTES);
  const configured = /^[a-f0-9]{32}$/.test(accountId) && !!token && Number.isSafeInteger(limit) && limit > 0 && limit <= 800000000000;
  let cache, pending;
  return {
    configured,
    async check() {
      if (!configured) throw new Error("budget_unavailable");
      const time = now();
      if (!Number.isFinite(time)) throw new Error("budget_unavailable");
      const date = new Date(time).toISOString().slice(0, 10), from = new Date(time - 31 * 86400000).toISOString().slice(0, 10);
      if (!cache || cache.date !== date || time < cache.at || time - cache.at > cacheMs) {
        if (!pending) {
          pending = (async () => {
            try {
              // 지난 31일과 오늘을 모두 포함한다. 한 달 청구 기간보다 넓게 잡지만 표본 오차는 남는다.
              const settings = await readSettings({ accountId, token });
              const oldestSeconds = Math.ceil((time - Date.parse(`${from}T00:00:00Z`)) / 1000);
              if (settings.notOlderThan < oldestSeconds || settings.maxDuration < 32 * 86400) throw new Error("usage_window_unavailable");
              const usage = await readUsage({ accountId, token, from, to: date });
              const total = usage.sfuEgressBytes + usage.turnEgressBytes;
              if (!Number.isSafeInteger(total) || total < 0) throw new Error("invalid_usage");
              cache = { date, at: time, total };
            } catch { cache = null; throw new Error("budget_unavailable"); }
          })();
        }
        try { await pending; } finally { pending = null; }
      }
      if (cache.total >= limit) throw new Error("budget_exhausted");
      return { observedBytes: cache.total, limitBytes: limit };
    },
  };
}
