import { cleanupDurableResources } from "./provider-cleanup.js";

// 단일 EC2의 단일 미디어 관리자에서만 사용한다. 상태와 정리 대상은 SQLite에 남긴다.
export function createDurableMediaRouter({ store, providers, cleaners, notifySwitch = () => {}, retryMs = 5000, now = Date.now, resumeMinimums = { livekit: 1, livekit_bytes: 1, daily: 1, cloudflare: 1 } }) {
  const names = ["livekit", "daily", "cloudflare"];
  if (!store || !providers || !cleaners || typeof notifySwitch !== "function" || !names.every((name) => providers[name]?.configured && typeof providers[name].join === "function")) throw new Error("invalid_media_router");
  let closed = false, recovery = null, timer, switching = null, ticking = false, activeTick = null;
  const inflight = new Set(), resourceCleanups = new Map();

  async function removeLivekitParticipant(resource) {
    if (resourceCleanups.has(resource.resource_key)) return resourceCleanups.get(resource.resource_key);
    const running = (async () => {
      const before = store.resource(resource.resource_key);
      if (!before || before.provider !== "livekit" || before.kind !== "participant") throw new Error("invalid_resource");
      if (before.closed) return;
      await cleaners.livekit(before);
      const after = store.resource(resource.resource_key);
      if (!after) throw new Error("cleanup_unconfirmed");
      if (!after.closed) store.closeResource(resource.resource_key);
    })();
    resourceCleanups.set(resource.resource_key, running);
    try { return await running; } finally { if (resourceCleanups.get(resource.resource_key) === running) resourceCleanups.delete(resource.resource_key); }
  }

  async function recover() {
    if (recovery) return recovery;
    recovery = (async () => {
      store.assertLeadership();
      const before = store.state();
      if (before.phase === "active") return true;
      const result = await cleanupDurableResources(store, cleaners);
      if (result.unresolved || store.pendingResources().length) throw new Error("cleanup_unconfirmed");
      if (before.phase === "blocked") return false;
      const after = store.completeCleanup({ transitionId: before.transition_id });
      return after.phase === "active";
    })();
    try { return await recovery; } finally { recovery = null; }
  }
  async function start() {
    store.acquireLeadership();
    try {
      store.beginRecovery();
      try { await recover(); } catch (error) { if (error?.message !== "cleanup_unconfirmed") throw error; }
    } catch (error) { store.releaseLeadership(); throw error; }
    timer = setInterval(() => { void runTick().catch(() => {}); }, retryMs);
    timer.unref?.();
  }
  async function transition(provider, generation, reason) {
    if (switching) return switching;
    switching = (async () => {
      let change;
      try { change = store.beginSwitch({ provider, generation }); }
      catch (error) { if (error?.message === "media_state_changed") return recover(); throw error; }
      try { await notifySwitch({ ...change, revision: change.generation, reason }); } catch { /* 서버 정리가 기준이다. */ }
      await Promise.allSettled([...inflight, ...resourceCleanups.values()]);
      return recover();
    })();
    try { return await switching; } finally { switching = null; }
  }
  async function tick() {
    if (closed || ticking) return;
    ticking = true;
    try {
      store.assertLeadership();
      const s = store.state();
      if (s.phase !== "active") {
        await recover();
        if (store.state().phase === "blocked") {
          // 날짜가 바뀐 것만으로 초기화하지 않는다. 보관 기간이 끝나 예약량이 실제로 줄었을 때만 재개한다.
          const candidate = store.resumeCandidate(resumeMinimums);
          if (candidate) {
            await providers[candidate].prepareResume?.();
            if (!closed) store.resume(candidate, resumeMinimums);
          }
        }
        return;
      }
      // LiveKit 토큰 만료만으로는 연결이 종료되지 않으므로 서버에서 직접 제거한다.
      for (const resource of store.expiredResources("livekit", "participant", Math.floor(now() / 1000))) {
        try { await removeLivekitParticipant(resource); }
        catch { await transition(s.provider, s.generation, "cleanup_unavailable"); return; }
      }
    } finally { ticking = false; }
  }
  async function runTick() {
    if (activeTick) return activeTick;
    activeTick = tick();
    try { return await activeTick; } finally { activeTick = null; }
  }
  return {
    configured: true,
    start,
    state: () => store.state(),
    async join(options) {
      if (closed) throw new Error("media_unavailable");
      for (;;) {
        store.assertLeadership();
        if (switching) await switching;
        const s = store.state();
        if (s.phase === "blocked") throw new Error("media_unavailable");
        if (s.phase !== "active") { await recover(); continue; }
        const provider = providers[s.provider], promise = Promise.resolve().then(() => provider.join(options, { generation: s.generation }));
        inflight.add(promise);
        let joined, error;
        try { joined = await promise; } catch (e) { error = e; } finally { inflight.delete(promise); }
        if (error) {
          if (error?.message === "media_state_changed") continue;
          if (error?.message === "budget_exhausted") { await transition(s.provider, s.generation, "budget_exhausted"); continue; }
          if (["livekit_unavailable", "livekit_room_invalid", "daily_unavailable", "daily_room_invalid"].includes(error?.message)) { await transition(s.provider, s.generation, "provider_unavailable"); continue; }
          throw error;
        }
        const current = store.state();
        if (current.phase !== "active" || current.provider !== s.provider || current.generation !== s.generation) continue;
        return { ...joined, revision: s.generation };
      }
    },
    async markUnavailable(provider) {
      const s = store.state();
      if (s.phase === "active" && s.provider === provider) await transition(provider, s.generation, "provider_unavailable");
    },
    async releaseLivekit(key) {
      if (closed || !key) return;
      store.assertLeadership();
      const resource = store.resource(key), s = store.state();
      if (!resource || resource.provider !== "livekit" || resource.kind !== "participant") throw new Error("invalid_resource");
      if (resource.closed || s.phase !== "active" || s.provider !== "livekit" || s.generation !== resource.generation) return;
      try { await removeLivekitParticipant(resource); }
      catch (error) {
        const latest = store.state();
        if (latest.phase === "active" && latest.provider === "livekit" && latest.generation === resource.generation) await transition("livekit", latest.generation, "cleanup_unavailable");
        throw error;
      }
    },
    async retryCleanup() { return recover(); },
    async checkExpired() { return runTick(); },
    async shutdown({ beforeCleanup } = {}) {
      if (closed) return;
      closed = true; clearInterval(timer);
      store.assertLeadership(); store.beginRecovery();
      let earlyFailure;
      try {
        if (activeTick) await activeTick.catch(() => {});
        await Promise.allSettled([...inflight, ...resourceCleanups.values()]);
        if (beforeCleanup) try { await beforeCleanup(); } catch (error) { earlyFailure = error; }
        await recover();
        if (earlyFailure) throw earlyFailure;
      }
      finally { store.releaseLeadership(); store.close(); }
    },
  };
}
