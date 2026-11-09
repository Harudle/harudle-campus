import { RoomServiceClient } from "livekit-server-sdk";
import { openDurableMediaState } from "./durable-state.js";
import { createManagedLiveKitProvider, createManagedDailyProvider } from "./managed-providers.js";
import { createCloudflareTestService } from "./cloudflare-test.js";
import { createCloudflareSfuClient } from "./cloudflare-sfu.js";
import { createProviderCleaners } from "./provider-cleanup.js";
import { createDurableMediaRouter } from "./durable-router.js";
import { createDailyPermissionManager } from "./daily-permissions.js";
import { createCloudflareRecovery } from "./cloudflare-recovery.js";

// 아직 운영 전 검증 중인 단일 EC2 구성이다. 로컬 디스크의 DB를 임의로 초기화하지 않는다.
export function createManagedMediaStack(env, peers, { notifySwitch, fetchImpl = fetch } = {}) {
  if (env.MEDIA_PROVIDER !== "managed-draft" || env.MEDIA_SINGLE_HOST !== "1" || typeof notifySwitch !== "function") throw new Error("invalid_media_config");
  const namespace = env.MEDIA_NAMESPACE || "campus";
  if (!/^[a-z0-9-]{1,24}$/.test(namespace)) throw new Error("invalid_media_config");
  const store = openDurableMediaState(env.MEDIA_STATE_PATH);
  try {
    const host = new URL(env.LIVEKIT_URL); host.protocol = "https:";
    const roomClient = new RoomServiceClient(host.toString(), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { requestTimeout: 8 });
    const livekit = createManagedLiveKitProvider(env, store, { roomClient }), daily = createManagedDailyProvider(env, store, { fetchImpl });
    const cloudflareClient = createCloudflareSfuClient(env, fetchImpl);
    const recovery = createCloudflareRecovery({ store, client: cloudflareClient });
    let router;
    const cloudflare = createCloudflareTestService(env, peers, {
      store, client: cloudflareClient, recovery,
      onLimit: async () => { if (router) await router.markUnavailable("cloudflare"); },
    });
    if (!livekit.configured || !daily.configured || !cloudflare.configured) throw new Error("invalid_media_config");
    livekit.prepareResume = async () => { await roomClient.listRooms(); };
    daily.prepareResume = async () => {
      const response = await fetchImpl("https://api.daily.co/v1/", { headers: { authorization: `Bearer ${env.DAILY_API_KEY}` }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("daily_unavailable");
    };
    const cleaners = createProviderCleaners({ namespace, livekit: roomClient, dailyKey: env.DAILY_API_KEY, cloudflare: cloudflareClient, fetchImpl });
    const resumeMinimums = {
      livekit: Number(env.LIVEKIT_LEASE_SECONDS || 300) + 30, daily: Number(env.DAILY_LEASE_SECONDS || 300) + 60,
      livekit_bytes: 5000000,
      cloudflare: (Number(env.CLOUDFLARE_LEASE_SECONDS || 300) + Number(env.CLOUDFLARE_WATCHDOG_BUFFER_SECONDS || 120)) * Number(env.CLOUDFLARE_RESERVE_BYTES_PER_SECOND || 2000000) + 10000000,
    };
    router = createDurableMediaRouter({ store, providers: { livekit, daily, cloudflare }, cleaners, notifySwitch, resumeMinimums });
    const dailyPermissions = createDailyPermissionManager({ peers, store, namespace, apiKey: env.DAILY_API_KEY, fetchImpl, onFailure: async () => router.markUnavailable("daily") });
    let stopping = false, started = false;
    const recoveryTimer = setInterval(() => { if (started && !stopping) void recovery.reconcile().catch(() => {}); }, 60000);
    recoveryTimer.unref?.();
    const starting = (async () => {
      while (!stopping) {
        try { await router.start(); started = true; return; }
        catch (error) {
          // 무중단 배포 중에는 이전 워커가 먼저 정리를 끝내고 관리자 권한을 내려놓는다.
          if (error?.message !== "media_leader_active") throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    })();
    // 준비 중 또는 복구 실패 중에는 join이 차단된다. 캠퍼스 자체는 계속 표시한다.
    void starting.catch((error) => console.error(`[media-managed] startup: ${/^[a-z_]+$/.test(error?.message || "") ? error.message : "unavailable"}`));
    return {
      router, cloudflare, dailyPermissions,
      async shutdown() {
        stopping = true; clearInterval(recoveryTimer); await starting.catch(() => {});
        if (started) await router.shutdown({ beforeCleanup: async () => { await dailyPermissions.close(); await cloudflare.shutdown(); } });
        else { await dailyPermissions.close(); store.close(); }
      },
    };
  } catch (error) { store.close(); throw error; }
}
