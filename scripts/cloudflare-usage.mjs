import { getCloudflareUsage } from "../server/media/cloudflare-usage.js";
import { getCloudflareAnalyticsSettings } from "../server/media/cloudflare-analytics-settings.js";

const now = Date.now(), to = new Date(now).toISOString().slice(0, 10), from = new Date(now - 31 * 86400000).toISOString().slice(0, 10);
try {
  const settings = await getCloudflareAnalyticsSettings({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_ANALYTICS_TOKEN });
  if (settings.notOlderThan < Math.ceil((now - Date.parse(`${from}T00:00:00Z`)) / 1000) || settings.maxDuration < 32 * 86400) throw new Error("usage_window_unavailable");
  const usage = await getCloudflareUsage({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_ANALYTICS_TOKEN, from, to });
  console.log(JSON.stringify({
    ...usage,
    periodNotice: "최근 31일과 오늘을 포함합니다. 청구 기간보다 넓게 확인하며 실제 청구 기간과는 다릅니다.",
    notice: "계정 전체의 분석 수치입니다. 표본과 반영 지연, SFU와 TURN의 중복 경로 때문에 청구서와 다를 수 있습니다.",
    limitNotice: "이 조회는 청구를 중지하거나 무료 한도를 보장하지 않습니다.",
  }, null, 2));
} catch (error) {
  console.error(`사용량 확인 실패: ${error?.message || "unavailable"}`);
  process.exitCode = 1;
}
