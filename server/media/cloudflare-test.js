import { randomBytes } from "node:crypto";
import { areaOf, canHear, canShareScreen } from "../../src/media/policy.mjs";
import { createCloudflareSfuClient } from "./cloudflare-sfu.js";
import { openCloudflareTestJournal } from "./cloudflare-test-journal.js";
import { createCloudflareUsageGuard } from "./cloudflare-usage-guard.js";
import { createCloudflareWatchdog } from "./cloudflare-watchdog.js";

// managed-draft는 검증 중인 단일 서버 전용이다. 분석값은 청구 상한을 보장하지 않는다.
export function createCloudflareTestService(env, peers, { client, journal, guard, watchdog, recovery, store, onLimit = async () => {}, durationMs = 180000, now = Date.now } = {}) {
  const managed = env.MEDIA_PROVIDER === "managed-draft" && env.MEDIA_SINGLE_HOST === "1" && !!store;
  const allowed = managed || (["cloudflare-test", "auto-test"].includes(env.MEDIA_PROVIDER) && env.CAMPUS_BIND_HOST === "127.0.0.1" && env.CLOUDFLARE_EXPERIMENTAL === "local-only");
  client ??= createCloudflareSfuClient(env);
  guard ??= createCloudflareUsageGuard(env);
  if (managed) watchdog ??= createCloudflareWatchdog(env);
  if (!allowed || !client.configured || !guard.configured || (managed && !watchdog.configured)) return { configured: false };
  const leaseSeconds = Number(env.CLOUDFLARE_LEASE_SECONDS || 300), maxParticipants = Number(env.MEDIA_MAX_PARTICIPANTS || 20), estimatedBytesPerSecond = Number(env.CLOUDFLARE_RESERVE_BYTES_PER_SECOND || 2000000), watchdogBuffer = Number(env.CLOUDFLARE_WATCHDOG_BUFFER_SECONDS || 120);
  if (managed && (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 900 || !Number.isSafeInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > 20 || !Number.isSafeInteger(estimatedBytesPerSecond) || estimatedBytesPerSecond < 1000000 || estimatedBytesPerSecond > 10000000 || !Number.isSafeInteger(watchdogBuffer) || watchdogBuffer < 120 || watchdogBuffer > 3600)) return { configured: false };
  if (managed) {
    journal ??= {
      add(id, { generation, expiresAt }) { store.assertLeadership(); store.registerResource({ key: `cf:${id}`, provider: "cloudflare", generation, kind: "session", locator: id, expiresAt }); },
      remove(id) { store.assertLeadership(); store.closeResource(`cf:${id}`); },
      pending(id, value) { store.assertLeadership(); store.setPending(`cf:${id}`, value); },
      close() {},
    };
  } else journal ??= openCloudflareTestJournal(env.CLOUDFLARE_TEST_JOURNAL);
  const participants = new Map(), publications = new Map(), cleanups = new Map();
  let deadline = 0, timer, monitor, failed = false;
  const logError = (stage, error) => console.warn(`[cloudflare-test] ${stage}: ${/^[a-z_]+$/.test(error?.message || "") ? error.message : "unavailable"}`);
  const key = () => randomBytes(16).toString("hex");
  const current = (id) => participants.get(id);
  const present = (p) => peers.get(p.id)?.presence;
  const isCurrent = (p) => {
    if (failed || current(p.id) !== p || !present(p) || areaOf(present(p)) !== p.area || now() >= p.expiresAt * 1000) return false;
    if (!managed) return now() < deadline;
    const state = store.state();
    return state.phase === "active" && state.provider === "cloudflare" && state.generation === p.generation;
  };
  const mayReceive = (p, pub) => pub.ready && isCurrent(p) && isCurrent(pub.owner) && p.scope === pub.owner.scope && pub.owner !== p && canHear(present(p), present(pub.owner));

  async function closeSession(p, session) {
    if (session.closing) return session.closing;
    session.closed = true;
    if (session.publication) publications.delete(session.publication);
    session.closing = (async () => {
      // 응답을 잃은 요청이 늦게 끝날 수 있으므로 불확실한 세션은 기록에 남긴다.
      try { await session.pending; } catch { session.uncertain = true; }
      try {
        const tracks = await client.getSession(session.id);
        for (const track of tracks) if (track.status !== "inactive") await client.close(session.id, track.mid);
        const after = await client.getSession(session.id);
        if (after.some((track) => track.status !== "inactive") || session.uncertain) throw new Error("test_cleanup_required");
        // 별도 Worker의 해제 실패는 안전상 무시한다. 남은 알람은 세션을 다시 확인한다.
        if (managed) await watchdog.disarm(session.id).catch(() => {});
        journal.remove(session.id); p.sessions.delete(session.key);
      } catch (error) {
        failed = true; logError("cleanup", error);
        if (managed) void onLimit("cleanup_unavailable").catch(() => {});
        throw new Error("test_cleanup_required");
      }
    })();
    return session.closing;
  }
  function stop(p) {
    if (p.stopping) return p.stopping;
    clearTimeout(p.expiryTimer);
    if (current(p.id) === p) participants.delete(p.id);
    p.stopping = (async () => {
      const results = await Promise.allSettled([...p.sessions.values()].map((s) => closeSession(p, s)));
      if (results.some((r) => r.status === "rejected")) throw new Error("test_cleanup_required");
    })();
    cleanups.set(p.id, p.stopping);
    void p.stopping.finally(() => { if (cleanups.get(p.id) === p.stopping) cleanups.delete(p.id); }).catch(() => {});
    return p.stopping;
  }
  async function newSession(p) {
    if (!isCurrent(p) || p.sessions.size >= 12) throw new Error("test_unavailable");
    const id = await client.createSession();
    try { journal.add(id, { generation: p.generation, expiresAt: p.expiresAt }); } catch { failed = true; throw new Error("test_cleanup_required"); }
    const session = { id, key: key(), pending: Promise.resolve(), closed: false, uncertain: false };
    p.sessions.set(session.key, session);
    if (managed) {
      try { await watchdog.register(id, p.expiresAt); }
      catch (error) { await closeSession(p, session).catch(() => {}); failed = true; void onLimit("watchdog_unavailable").catch(() => {}); throw error; }
    }
    if (!isCurrent(p)) { await closeSession(p, session); throw new Error("test_unavailable"); }
    return session;
  }
  async function mutate(p, session, operation) {
    session.pending = (async () => {
      journal.pending?.(session.id, true);
      if (managed) await watchdog.begin(session.id);
      if (session.closed || !isCurrent(p)) {
        if (managed) await watchdog.finish(session.id);
        journal.pending?.(session.id, false);
        throw new Error("test_unavailable");
      }
      const result = await operation();
      if (managed) await watchdog.finish(session.id);
      journal.pending?.(session.id, false);
      return result;
    })();
    return session.pending;
  }
  async function checkBudget() {
    try {
      const observation = await guard.check();
      if (managed && observation.observedBytes + store.budget("cloudflare").reserved >= observation.limitBytes) throw new Error("budget_exhausted");
    }
    catch (error) {
      failed = true;
      logError("usage", error);
      await Promise.allSettled([...participants.values()].map(stop));
      if (managed) void onLimit(error?.message || "budget_unavailable").catch(() => {});
      throw error;
    }
  }
  function check(p) { if (!p || !isCurrent(p)) throw new Error("test_unavailable"); }
  return {
    configured: true,
    async join({ identity, area, scope, canShare }, context = {}) {
      if (failed || !peers.has(identity) || !peers.get(identity).presence || areaOf(peers.get(identity).presence) !== area) throw new Error("test_unavailable");
      if (managed && recovery) await recovery.ensureClear();
      await checkBudget();
      const previous = current(identity); if (previous) await stop(previous);
      if (cleanups.has(identity)) await cleanups.get(identity);
      if (participants.size >= (managed ? maxParticipants : 2) || (!managed && deadline && now() >= deadline)) throw new Error("test_unavailable");
      if (!deadline) {
        deadline = managed ? Number.MAX_SAFE_INTEGER : now() + Math.min(180000, Math.max(1000, durationMs));
        if (!managed) { timer = setTimeout(() => { for (const p of [...participants.values()]) void stop(p).catch(() => {}); }, deadline - now()); timer.unref(); }
        monitor = setInterval(() => { void checkBudget().catch(() => {}); }, 15000);
        monitor.unref();
      }
      const currentSeconds = Math.floor(now() / 1000);
      const expiresAt = managed ? currentSeconds + leaseSeconds : Math.floor(deadline / 1000);
      if (managed) store.reserve({ provider: "cloudflare", generation: context.generation, amount: 5000000, expiresAt });
      const p = { id: identity, area, scope: scope || area, generation: context.generation, expiresAt, sessions: new Map() };
      participants.set(identity, p);
      if (managed) { p.expiryTimer = setTimeout(() => { void stop(p).catch(() => {}); }, Math.max(0, expiresAt * 1000 - now())); p.expiryTimer.unref(); }
      return { provider: "cloudflare", area, canShare, connection: { expiresAt: String(expiresAt) } };
    },
    async operation(id, op, data = {}) {
      const p = current(id);
      if (op === "leave") { if (p) await stop(p); else if (cleanups.has(id)) await cleanups.get(id); return {}; }
      check(p);
      await checkBudget();
      check(p);
      if (op === "list") return [...publications].filter(([, pub]) => mayReceive(p, pub)).map(([track, pub]) => ({ track, peer: pub.owner.id, kind: pub.kind, name: peers.get(pub.owner.id)?.name || "크루" }));
      if (op === "publish") {
        if (!["audio", "screen", "screenAudio"].includes(data.kind) || (data.kind !== "audio" && !canShareScreen(present(p))) || [...p.sessions.values()].some((s) => s.kind === data.kind && !s.closed)) throw new Error("invalid_media_request");
        const session = await newSession(p), track = key();
        session.kind = data.kind;
        try {
          const result = await mutate(p, session, () => client.publish(session.id, track, data.mid, data.description));
          if (session.closed || !isCurrent(p) || (data.kind !== "audio" && !canShareScreen(present(p)))) throw new Error("test_unavailable");
          session.publication = track;
          publications.set(track, { owner: p, kind: data.kind, session, track, ready: false });
          return { id: session.key, description: result.sessionDescription };
        } catch (error) { await closeSession(p, session).catch(() => {}); throw error; }
      }
      if (op === "subscribe") {
        const pub = publications.get(data.track);
        if (!pub || !mayReceive(p, pub) || [...p.sessions.values()].some((s) => s.subscription === data.track && !s.closed)) throw new Error("invalid_media_request");
        if (managed) {
          try {
            const seconds = p.expiresAt - Math.floor(now() / 1000);
            store.reserve({ provider: "cloudflare", generation: p.generation, amount: (seconds + watchdogBuffer) * estimatedBytesPerSecond + 5000000, expiresAt: p.expiresAt });
            await checkBudget();
          } catch (error) {
            if (error?.message === "budget_exhausted") { failed = true; await Promise.allSettled([...participants.values()].map(stop)); void onLimit("budget_exhausted").catch(() => {}); }
            throw error;
          }
        }
        const session = await newSession(p); session.subscription = data.track;
        try {
          const result = await mutate(p, session, () => client.subscribe(session.id, pub.session.id, pub.track));
          if (!result.requiresImmediateRenegotiation || session.closed || !mayReceive(p, pub)) throw new Error("test_unavailable");
          session.awaitingAnswer = true;
          return { id: session.key, description: result.sessionDescription, mid: result.track.mid };
        } catch (error) { await closeSession(p, session).catch(() => {}); throw error; }
      }
      const session = p.sessions.get(data.id);
      if (op === "close" && !session) return {};
      if (op === "close" && session?.closed) { await session.closing; return {}; }
      if (!session || session.closed) throw new Error("invalid_media_request");
      if (op === "publish-ready") {
        const pub = publications.get(session.publication);
        if (!pub || pub.owner !== p || !isCurrent(p)) throw new Error("invalid_media_request");
        pub.ready = true;
        return {};
      }
      if (op === "answer") {
        const pub = publications.get(session.subscription);
        if (!session.awaitingAnswer || !pub || !mayReceive(p, pub)) throw new Error("invalid_media_request");
        session.awaitingAnswer = false;
        try {
          await mutate(p, session, () => client.answer(session.id, data.description));
          if (session.closed || !mayReceive(p, pub)) throw new Error("test_unavailable");
          return {};
        } catch (error) { await closeSession(p, session).catch(() => {}); throw error; }
      }
      if (op === "close") { await closeSession(p, session); return {}; }
      throw new Error("invalid_media_request");
    },
    presenceChanged() {
      for (const p of [...participants.values()]) {
        if (!isCurrent(p)) { void stop(p).catch(() => {}); continue; }
        for (const session of p.sessions.values()) {
          const pub = session.subscription && publications.get(session.subscription);
          if (session.subscription && (!pub || !mayReceive(p, pub))) void closeSession(p, session).catch(() => {});
        }
      }
    },
    disconnected(id) { const p = current(id); if (p) void stop(p).catch(() => {}); },
    async prepareResume() {
      if (!managed || participants.size || cleanups.size) throw new Error("test_cleanup_required");
      const observation = await guard.check();
      if (observation.observedBytes + store.budget("cloudflare").reserved >= observation.limitBytes) throw new Error("budget_exhausted");
      failed = false;
    },
    async shutdown() {
      clearTimeout(timer);
      clearInterval(monitor);
      const results = await Promise.allSettled([...participants.values()].map(stop).concat([...cleanups.values()]));
      journal.close();
      if (results.some((r) => r.status === "rejected")) throw new Error("test_cleanup_required");
    },
  };
}
