import { createHash } from "node:crypto";
import { AccessToken, TrackSource } from "livekit-server-sdk";

// 연결 정보와 토큰 발급은 제공자별 파일에 둔다.
export function createLiveKitProvider(env) {
  const url = env.LIVEKIT_URL || "";
  const apiKey = env.LIVEKIT_API_KEY || "";
  const apiSecret = env.LIVEKIT_API_SECRET || "";
  const namespace = /^[a-z0-9-]{1,24}$/.test(env.MEDIA_NAMESPACE || "") ? env.MEDIA_NAMESPACE : "campus";
  let configured = false;
  try {
    const endpoint = new URL(url);
    const local = endpoint.protocol === "ws:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    configured = !!apiKey && !!apiSecret && (endpoint.protocol === "wss:" || local);
  } catch { }

  const roomName = (scope) => `${namespace}-${createHash("sha256").update(scope).digest("hex").slice(0, 24)}`;
  return {
    configured, roomName,
    async join({ identity, name, area, scope, canShare }) {
      if (!configured) throw new Error("not_configured");
      const room = roomName(scope || area);
      const token = new AccessToken(apiKey, apiSecret, { identity, name, ttl: "10m" });
      token.addGrant({
        roomJoin: true, room, canSubscribe: true, canPublishData: false,
        canPublishSources: canShare
          ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
          : [TrackSource.MICROPHONE],
      });
      return { provider: "livekit", area, canShare, connection: { url, token: await token.toJwt() } };
    },
  };
}
