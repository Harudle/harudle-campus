import { createHash } from "node:crypto";

// Daily는 토큰을 발급하기 전에 사용 시간 예약이 반드시 성공해야 한다.
export function createDailyProvider(env, { budget, fetchImpl = fetch, roomName, aroundIssue, denyReceiveByDefault = false } = {}) {
  const domain = env.DAILY_DOMAIN || "", apiKey = env.DAILY_API_KEY || "";
  const namespace = /^[a-z0-9-]{1,24}$/.test(env.MEDIA_NAMESPACE || "") ? env.MEDIA_NAMESPACE : "campus";
  const configured = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain) && !!apiKey && !!budget;
  const pendingRooms = new Map();

  async function request(path, method = "GET", body) {
    let response;
    try {
      response = await fetchImpl(`https://api.daily.co/v1${path}`, {
        method, headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000),
      });
    } catch { throw new Error("daily_unavailable"); }
    if (response.status === 404 && method === "GET") return null;
    if (!response.ok) throw new Error("daily_unavailable");
    return response.json();
  }

  async function ensureRoom(room) {
    if (pendingRooms.has(room)) return pendingRooms.get(room);
    const pending = (async () => {
      let result = await request(`/rooms/${room}`);
      if (!result) {
        try {
          result = await request("/rooms", "POST", { name: room, privacy: "private", properties: {
            sfu_switchover: 0.5, enforce_unique_user_ids: true, enable_screenshare: true,
            start_video_off: true, start_audio_off: true,
          } });
        } catch {
          // 다른 워커가 동시에 만들었을 수 있다. 기존 방도 아래에서 검증한다.
          result = await request(`/rooms/${room}`);
        }
      }
      // Daily omits the room value when it inherits the domain default. Check
      // the domain as well so P2P mode cannot bypass selective subscriptions.
      let switchover = result?.config?.sfu_switchover;
      if (switchover == null) {
        const domainInfo = await request("/");
        switchover = domainInfo?.config?.sfu_switchover ?? 0.5;
      }
      if (!result || result.name !== room || result.privacy !== "private" ||
          result.config?.enforce_unique_user_ids !== true || switchover !== 0.5 ||
          result.url !== `https://${domain}.daily.co/${room}`) throw new Error("daily_room_invalid");
      return result.url;
    })();
    pendingRooms.set(room, pending);
    try { return await pending; } finally { pendingRooms.delete(room); }
  }

  return {
    configured,
    async join({ identity, name, area, scope, canShare }, context = {}) {
      if (!configured) throw new Error("not_configured");
      const room = roomName ? roomName(scope || area, context.generation) : `${namespace}-${createHash("sha256").update(scope || area).digest("hex").slice(0, 24)}`;
      const lease = await budget.reserve(context);
      if (!Number.isSafeInteger(lease.expiresAt) || lease.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error("budget_unavailable");
      const issue = async () => {
        const url = await ensureRoom(room);
        const result = await request("/meeting-tokens", "POST", { properties: {
          room_name: room, user_id: identity, user_name: name, exp: lease.expiresAt,
          eject_at_token_exp: true, is_owner: false, start_video_off: true, start_audio_off: true,
          enable_screenshare: canShare,
          permissions: { canSend: canShare ? ["audio", "screenVideo", "screenAudio"] : ["audio"], canAdmin: false, ...(denyReceiveByDefault ? { canReceive: { base: false } } : {}) },
        } });
        if (typeof result?.token !== "string" || !result.token) throw new Error("daily_unavailable");
        return { provider: "daily", area, canShare, connection: { url, token: result.token, expiresAt: String(lease.expiresAt) } };
      };
      return aroundIssue ? aroundIssue({ room, generation: context.generation, expiresAt: lease.expiresAt }, issue) : issue();
    },
  };
}
