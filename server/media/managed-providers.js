import { createHash, randomUUID } from "node:crypto";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { createDailyProvider } from "./daily.js";

export function managedRoom(namespace, generation, area) {
  if (!/^[a-z0-9-]{1,24}$/.test(namespace || "") || !Number.isSafeInteger(generation) || generation < 0 || typeof area !== "string" || !area || area.length > 200) throw new Error("invalid_media_request");
  return `${namespace}-g${generation}-${createHash("sha256").update(area).digest("hex").slice(0, 24)}`;
}

function reserveTime(store, provider, generation, seconds, now, estimatedBytesPerSecond) {
  if (!Number.isSafeInteger(seconds) || seconds < 30 || seconds > 900) throw new Error("invalid_media_config");
  store.assertLeadership();
  const current = Math.floor(now() / 1000);
  const expiresAt = current + seconds;
  // 강제 퇴장 처리 지연과 제공사의 초 단위 올림에 대비해 시간을 더 예약한다.
  const bufferSeconds = provider === "livekit" ? 30 : 60;
  const amount = expiresAt - current + bufferSeconds;
  if (provider === "livekit") {
    if (!Number.isSafeInteger(estimatedBytesPerSecond) || estimatedBytesPerSecond < 0) throw new Error("invalid_media_config");
    store.reserveAmounts({ provider, generation, amounts: { livekit: amount, livekit_bytes: amount * estimatedBytesPerSecond + 5000000 }, expiresAt });
  } else store.reserve({ provider, generation, amount, expiresAt });
  return { expiresAt };
}

export function createManagedLiveKitProvider(env, store, { now = Date.now, roomClient } = {}) {
  const namespace = env.MEDIA_NAMESPACE || "campus", url = env.LIVEKIT_URL || "", apiKey = env.LIVEKIT_API_KEY || "", secret = env.LIVEKIT_API_SECRET || "";
  const leaseSeconds = Number(env.LIVEKIT_LEASE_SECONDS || 300), maxRoomParticipants = Number(env.LIVEKIT_MAX_ROOM_PARTICIPANTS || 8), queues = new Map();
  let configured = false;
  try { configured = new URL(url).protocol === "wss:" && !!apiKey && !!secret && !!roomClient && typeof roomClient.listRooms === "function" && typeof roomClient.createRoom === "function" && /^[a-z0-9-]{1,24}$/.test(namespace) && Number.isSafeInteger(leaseSeconds) && leaseSeconds >= 30 && leaseSeconds <= 900 && Number.isSafeInteger(maxRoomParticipants) && maxRoomParticipants >= 2 && maxRoomParticipants <= 20; } catch {}
  const ensureRoom = async (room, generation, expiresAt) => {
      store.assertLeadership();
      const key = `lk-room:${room}`;
      store.registerResource({ key, provider: "livekit", generation, kind: "room", locator: room, expiresAt });
      let rooms;
      try { rooms = await roomClient.listRooms([room]); } catch { throw new Error("livekit_unavailable"); }
      let existing = rooms.find((r) => r.name === room);
      if (!existing) {
        store.setPending(key, true);
        try { existing = await roomClient.createRoom({ name: room, maxParticipants: maxRoomParticipants, emptyTimeout: 60, departureTimeout: 10 }); }
        catch { throw new Error("livekit_unavailable"); }
        store.setPending(key, false);
      }
      if (existing?.name !== room || existing.maxParticipants !== maxRoomParticipants) throw new Error("livekit_room_invalid");
      store.assertLeadership();
      const current = store.state();
      if (current.phase !== "active" || current.provider !== "livekit" || current.generation !== generation) throw new Error("media_state_changed");
  };
  return {
    configured,
    async join({ identity, name, area, scope, canShare }, { generation }) {
      if (!configured || !/^[a-zA-Z0-9-]{1,60}$/.test(identity || "")) throw new Error("invalid_media_request");
      const room = managedRoom(namespace, generation, scope || area), mediaIdentity = `${identity}__${randomUUID().replaceAll("-", "")}`;
      const previous = queues.get(room) || Promise.resolve();
      const next = previous.catch(() => {}).then(async () => {
        store.assertLeadership();
        const count = store.livekitRoomParticipants(room, generation);
        if (count >= maxRoomParticipants) throw new Error("room_full");
        // 새 참가자와 기존 참가자의 양방향 수신을 함께 예약한다.
        const estimatedBytesPerSecond = 2 * count * (canShare ? 500000 : 64000);
        const lease = reserveTime(store, "livekit", generation, leaseSeconds, now, estimatedBytesPerSecond);
        await ensureRoom(room, generation, lease.expiresAt);
        const resourceKey = `lk-person:${mediaIdentity}`;
        store.registerResource({ key: resourceKey, provider: "livekit", generation, kind: "participant", locator: JSON.stringify({ room, identity: mediaIdentity }), expiresAt: lease.expiresAt });
        const token = new AccessToken(apiKey, secret, { identity: mediaIdentity, name, ttl: "60s" });
        token.addGrant({ roomJoin: true, room, canSubscribe: true, canPublishData: false,
          canPublishSources: canShare ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [TrackSource.MICROPHONE] });
        const jwt = await token.toJwt();
        store.assertLeadership();
        const current = store.state();
        if (current.phase !== "active" || current.provider !== "livekit" || current.generation !== generation) throw new Error("media_state_changed");
        return { provider: "livekit", area, canShare, connection: { url, token: jwt, expiresAt: String(lease.expiresAt), renewable: "1" }, _leaseKey: resourceKey };
      });
      queues.set(room, next);
      void next.finally(() => { if (queues.get(room) === next) queues.delete(room); }).catch(() => {});
      return next;
    },
    renew({ leaseKey, canShare }, { generation }) {
      if (!configured || typeof canShare !== "boolean") throw new Error("invalid_media_request");
      store.assertLeadership();
      const resource = store.resource(leaseKey);
      let room;
      try { room = JSON.parse(resource?.locator || "").room; } catch { throw new Error("invalid_resource"); }
      const participants = store.livekitRoomParticipants(room, generation);
      if (!participants) throw new Error("media_state_changed");
      const expiresAt = Math.floor(now() / 1000) + leaseSeconds, seconds = leaseSeconds + 30;
      // 연결을 끊지 않고 시간을 연장한다. 양방향 전송을 넉넉하게 예약한다.
      const bytesPerSecond = 2 * (participants - 1) * (canShare ? 500000 : 64000);
      store.renewLivekitParticipant({ key: leaseKey, generation, amounts: { livekit: seconds, livekit_bytes: seconds * bytesPerSecond + 5000000 }, expiresAt });
      return { expiresAt };
    },
  };
}

export function createManagedDailyProvider(env, store, { now = Date.now, fetchImpl = fetch } = {}) {
  const namespace = env.MEDIA_NAMESPACE || "campus", leaseSeconds = Number(env.DAILY_LEASE_SECONDS || 300), queues = new Map();
  const budget = { reserve: ({ generation }) => reserveTime(store, "daily", generation, leaseSeconds, now) };
  const aroundIssue = ({ room, generation, expiresAt }, issue) => {
    const previous = queues.get(room) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      store.assertLeadership();
      const key = `daily-room:${room}`;
      store.registerResource({ key, provider: "daily", generation, kind: "room", locator: room, expiresAt });
      store.setPending(key, true);
      const result = await issue();
      store.setPending(key, false);
      store.assertLeadership();
      const current = store.state();
      if (current.phase !== "active" || current.provider !== "daily" || current.generation !== generation) throw new Error("media_state_changed");
      return result;
    });
    queues.set(room, next);
    void next.finally(() => { if (queues.get(room) === next) queues.delete(room); }).catch(() => {});
    return next;
  };
  const daily = createDailyProvider(env, { budget, fetchImpl, roomName: (area, generation) => managedRoom(namespace, generation, area), aroundIssue, denyReceiveByDefault: true });
  return { ...daily, configured: daily.configured && /^[a-z0-9-]{1,24}$/.test(namespace) && Number.isSafeInteger(leaseSeconds) && leaseSeconds >= 30 && leaseSeconds <= 900 };
}
