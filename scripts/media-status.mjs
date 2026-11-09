import { openDurableMediaState } from "../server/media/durable-state.js";

let store;
try {
  store = openDurableMediaState(process.env.MEDIA_STATE_PATH);
  const state = store.state(), open = store.pendingResources();
  const budgets = Object.fromEntries(["livekit", "livekit_bytes", "daily", "cloudflare"].map((provider) => {
    const { reserved, limit } = store.budget(provider);
    return [provider, { reserved, limit, unit: ["cloudflare", "livekit_bytes"].includes(provider) ? "bytes_estimated" : "participant_seconds_reserved" }];
  }));
  const unresolved = Object.fromEntries(["livekit", "daily", "cloudflare"].map((provider) => [provider, open.filter((r) => r.provider === provider).length]));
  console.log(JSON.stringify({ provider: state.provider, phase: state.phase, generation: state.generation, budgets, unresolved, externalCloudflareUnresolved: store.externalCloudflareSessions().length,
    notice: "예약과 예상 수치입니다. 제공사의 실제 사용량이나 청구 금액이 아닙니다." }, null, 2));
} catch (error) {
  console.error(`미디어 상태 확인 실패: ${/^[a-z_]+$/.test(error?.message || "") ? error.message : "unavailable"}`);
  process.exitCode = 1;
} finally { store?.close(); }
