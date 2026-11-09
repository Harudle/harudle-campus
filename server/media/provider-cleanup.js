// 네트워크 호출이 실패하거나 결과가 불확실하면 기록을 남기고 전환을 중단한다.
export function createProviderCleaners({ namespace, livekit, dailyKey, cloudflare, fetchImpl = fetch, now = Date.now }) {
  if (!/^[a-z0-9-]{1,24}$/.test(namespace || "")) throw new Error("invalid_namespace");
  const validRoom = (value, generation) => typeof value === "string" && value.startsWith(`${namespace}-g${generation}-`) && /^[a-z0-9-]{1,100}$/.test(value) && value.slice(`${namespace}-g${generation}-`.length).match(/^[a-f0-9]{24}$/);
  const dailyRequest = async (room, method) => {
    if (!dailyKey) throw new Error("cleanup_unavailable");
    const response = await fetchImpl(`https://api.daily.co/v1/rooms/${room}`, { method, headers: { authorization: `Bearer ${dailyKey}` }, signal: AbortSignal.timeout(8000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("cleanup_unavailable");
    try { return await response.json(); } catch { throw new Error("cleanup_unavailable"); }
  };
  return {
    async livekit(resource) {
      if (!livekit || !["participant", "room"].includes(resource.kind)) throw new Error("cleanup_unavailable");
      if (resource.kind === "participant") {
        let target;
        try { target = JSON.parse(resource.locator); } catch { throw new Error("invalid_resource"); }
        if (!validRoom(target?.room, resource.generation) || !/^[a-zA-Z0-9_-]{1,100}$/.test(target?.identity || "")) throw new Error("invalid_resource");
        // Cloud에서 이전 토큰으로 다시 들어오지 못하도록 명시적인 시각을 지정한다.
        await livekit.removeParticipant(target.room, target.identity, { revokeTokenTs: BigInt(Math.floor(now() / 1000) + 30) });
        return;
      }
      if (!validRoom(resource.locator, resource.generation)) throw new Error("invalid_resource");
      const existing = await livekit.listRooms([resource.locator]);
      if (existing.some((r) => r.name === resource.locator)) await livekit.deleteRoom(resource.locator);
      const after = await livekit.listRooms([resource.locator]);
      if (after.some((r) => r.name === resource.locator)) throw new Error("cleanup_unconfirmed");
    },
    async daily(resource) {
      if (resource.kind !== "room" || !validRoom(resource.locator, resource.generation)) throw new Error("invalid_resource");
      const result = await dailyRequest(resource.locator, "DELETE");
      if (result && (result.deleted !== true || result.name !== resource.locator)) throw new Error("cleanup_unconfirmed");
      if (await dailyRequest(resource.locator, "GET")) throw new Error("cleanup_unconfirmed");
    },
    async cloudflare(resource) {
      if (!cloudflare || resource.kind !== "session" || !/^[a-zA-Z0-9_-]{1,128}$/.test(resource.locator)) throw new Error("invalid_resource");
      const tracks = await cloudflare.getSession(resource.locator);
      for (const track of tracks) if (track.status !== "inactive") await cloudflare.close(resource.locator, track.mid);
      if ((await cloudflare.getSession(resource.locator)).some((track) => track.status !== "inactive")) throw new Error("cleanup_unconfirmed");
    },
  };
}

export async function cleanupDurableResources(store, cleaners) {
  store.assertLeadership();
  const state = store.state();
  if (!["recovering", "switching", "blocked"].includes(state.phase)) throw new Error("invalid_cleanup_phase");
  const resources = store.pendingResources().sort((a, b) => (a.kind === "participant" ? -1 : 0) - (b.kind === "participant" ? -1 : 0));
  let unresolved = 0, unknownLivekitRoom = false;
  const failedLivekitRooms = new Set();
  for (const resource of resources) {
    store.assertLeadership();
    try {
      if (typeof cleaners[resource.provider] !== "function") throw new Error("cleanup_unavailable");
      await cleaners[resource.provider](resource);
      // 이미 보낸 요청이 나중에 끝날 수 있으므로 불확실한 작업은 지우지 않는다.
      if (resource.pending || (resource.provider === "livekit" && resource.kind === "room" && (unknownLivekitRoom || failedLivekitRooms.has(resource.locator)))) throw new Error("cleanup_unconfirmed");
      store.closeResource(resource.resource_key);
    } catch {
      unresolved++;
      if (resource.provider === "livekit" && resource.kind === "participant") {
        try { const target = JSON.parse(resource.locator); if (typeof target?.room !== "string") throw new Error(); failedLivekitRooms.add(target.room); }
        catch { unknownLivekitRoom = true; }
      }
    }
  }
  return { unresolved };
}
