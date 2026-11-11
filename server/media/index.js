import { createLiveKitProvider } from "./livekit.js";
import { createDailyProvider } from "./daily.js";
import { createMonthlyBudget } from "./monthly-budget.js";
import { createFailoverRouter } from "./failover.js";
import { createSelfHostedLiveKitProvider } from "./self-hosted.js";
export { areaOf as mediaArea, canShareScreen as canShareInRoom } from "../../src/media/policy.mjs";

// 새 제공자는 같은 join 인터페이스로 여기에 등록한다.
function budgetFromEnv(env, prefix) {
  try {
    return createMonthlyBudget({
      path: env[`${prefix}_BUDGET_FILE`], provider: prefix.toLowerCase(),
      limitSeconds: Number(env[`${prefix}_BUDGET_MINUTES`]) * 60,
      leaseSeconds: Number(env[`${prefix}_LEASE_MINUTES`]) * 60,
    });
  } catch { return null; }
}
export function createMediaService(env = process.env, { onSwitch, cloudflareTest } = {}) {
  if ((env.MEDIA_PROVIDER || "livekit") === "livekit") return createLiveKitProvider(env);
  if (env.MEDIA_PROVIDER === "self-hosted") return createSelfHostedLiveKitProvider(env);   // 직접 띄운 livekit-server: 예약 · 전환 없음
  const localExperiment = env.CAMPUS_BIND_HOST === "127.0.0.1" && env.MEDIA_EXPERIMENTAL === "local-only";
  if (env.MEDIA_PROVIDER === "daily" && localExperiment) {
    return createDailyProvider(env, { budget: budgetFromEnv(env, "DAILY") });
  }
  if (((env.MEDIA_PROVIDER === "auto" && localExperiment) || (env.MEDIA_PROVIDER === "auto-test" && cloudflareTest?.configured)) && typeof onSwitch === "function") {
    const livekit = createLiveKitProvider(env), budget = budgetFromEnv(env, "LIVEKIT");
    const guardedLivekit = {
      name: "livekit", configured: livekit.configured && !!budget,
      async join(options) {
        const lease = await budget.reserve();
        const result = await livekit.join(options);
        return { ...result, connection: { ...result.connection, expiresAt: String(lease.expiresAt) } };
      },
    };
    const daily = createDailyProvider(env, { budget: budgetFromEnv(env, "DAILY") });
    const providers = [guardedLivekit, { ...daily, name: "daily" }];
    if (env.MEDIA_PROVIDER === "auto-test") providers.push({ ...cloudflareTest, name: "cloudflare" });
    return createFailoverRouter({ providers, onSwitch });
  }
  return { configured: false, join: async () => { throw new Error("not_configured"); } };
}
