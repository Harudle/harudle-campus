import { areaOf, canHear } from "../../src/media/policy.mjs";
import { managedRoom } from "./managed-providers.js";

// Daily SFU가 허용할 수신 대상을 서버에서 갱신한다. 위치는 여전히 클라이언트가 보낸 값이다.
export function createDailyPermissionManager({ peers, store, namespace, apiKey, onFailure = async () => {}, fetchImpl = fetch, debounceMs = 150 }) {
  if (!peers || !store || !apiKey || !/^[a-z0-9-]{1,24}$/.test(namespace || "")) throw new Error("invalid_daily_permissions");
  const rooms = new Map();
  let timer, retry, running = null, stopped = false, rerun = false, lastSignature = "";
  function groups() {
    const state = store.state();
    if (state.phase !== "active" || state.provider !== "daily") return [];
    const result = new Map();
    for (const [id, peer] of peers) {
      if (peer.mediaProvider !== "daily" || !peer.dailyReady || peer.mediaGeneration !== state.generation || !peer.presence || peer.mediaArea !== areaOf(peer.presence)) continue;
      const name = managedRoom(namespace, state.generation, peer.mediaScope || peer.mediaArea);
      if (!result.has(name)) result.set(name, { name, generation: state.generation, peers: new Map() });
      result.get(name).peers.set(id, peer);
    }
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  function signature(current) {
    return JSON.stringify(current.map((room) => ({ name: room.name, members: [...room.peers].sort(([a], [b]) => a.localeCompare(b)).map(([id, peer]) => ({ id, allowed: [...room.peers].filter(([other, target]) => other !== id && canHear(peer.presence, target.presence)).map(([other]) => other).sort() })) })));
  }
  function queue(delay = debounceMs) {
    if (stopped || timer) return;
    timer = setTimeout(() => { timer = undefined; void syncNow().catch(() => {}); }, delay);
    timer.unref?.();
  }
  async function request(path, method = "GET", body) {
    const response = await fetchImpl(`https://api.daily.co/v1${path}`, {
      method, headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("daily_permissions_unavailable");
    return response.json();
  }
  async function run() {
    const current = groups(), byName = new Map(current.map((room) => [room.name, room]));
    for (const group of current) if (!rooms.has(group.name)) rooms.set(group.name, { ...group, known: new Set(), last: "" });
    let missing = false;
    for (const entry of [...rooms.values()]) {
      const state = store.state();
      if (state.phase !== "active" || state.provider !== "daily" || state.generation !== entry.generation) { rooms.delete(entry.name); continue; }
      const presence = await request(`/rooms/${entry.name}/presence?limit=100`);
      if (!Number.isSafeInteger(presence?.total_count) || !Array.isArray(presence.data) || presence.total_count !== presence.data.length || presence.total_count > 100) throw new Error("daily_permissions_unavailable");
      // 새로운 위치가 도착했다면 오래된 수신 권한을 보내지 않는다.
      const latest = new Map(groups().map((group) => [group.name, group])).get(entry.name);
      const active = latest?.peers || new Map();
      const latestState = store.state();
      if (latestState.phase !== "active" || latestState.provider !== "daily" || latestState.generation !== entry.generation) continue;
      for (const id of active.keys()) entry.known.add(id);
      for (const session of presence.data) {
        if (typeof session?.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(session.id) || typeof session.userId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(session.userId)) throw new Error("daily_permissions_unavailable");
        entry.known.add(session.userId);
      }
      if (entry.known.size > 200) throw new Error("daily_permissions_unavailable");
      const observed = new Set(presence.data.map((item) => item.userId));
      if ([...active.keys()].some((id) => !observed.has(id))) missing = true;
      const data = {};
      for (const session of presence.data) {
        const recipient = active.get(session.userId), byUserId = {};
        for (const id of entry.known) byUserId[id] = !!recipient && id !== session.userId && !!active.get(id) && canHear(recipient.presence, active.get(id).presence);
        data[session.id] = { canReceive: { base: false, byUserId } };
      }
      const key = JSON.stringify(data);
      if (presence.data.length && key !== entry.last) {
        const result = await request(`/rooms/${entry.name}/update-permissions`, "POST", { data });
        if (result?.status !== "sent") throw new Error("daily_permissions_unavailable");
        entry.last = key;
      }
      if (!presence.data.length && !byName.has(entry.name)) rooms.delete(entry.name);
    }
    if (missing && !stopped) {
      clearTimeout(retry);
      retry = setTimeout(() => { retry = undefined; queue(0); }, 1000); retry.unref?.();
    }
  }
  async function syncNow() {
    if (stopped) return;
    if (running) { rerun = true; await running; return; }
    running = run();
    try { await running; }
    catch (error) { void onFailure(error).catch(() => {}); throw error; }
    finally {
      running = null;
      const latest = signature(groups());
      if (rerun || latest !== lastSignature) { rerun = false; lastSignature = latest; queue(0); }
    }
  }
  return {
    changed() {
      if (stopped) return;
      const value = signature(groups());
      if (value !== lastSignature) { lastSignature = value; queue(); }
    },
    async syncNow() { await syncNow(); },
    async close() { stopped = true; clearTimeout(timer); clearTimeout(retry); if (running) await running.catch(() => {}); },
  };
}
