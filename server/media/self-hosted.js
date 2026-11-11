import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { createLiveKitProvider } from "./livekit.js";
import { createScreenShareRegistry } from "./screen-share.js";

// 자체 호스팅 livekit-server 한 대. 무료량 예약과 제공자 전환이 없다.
// 입장권에는 마이크 권한만 넣고, 화면 공유 권한은 공유를 시작할 때 서버가 LiveKit API로 준다(회의실당 하나).
const permission = (share) => ({
  canSubscribe: true, canPublish: true, canPublishData: false,
  canPublishSources: share ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [TrackSource.MICROPHONE],
});

export function createSelfHostedLiveKitProvider(env, { rooms } = {}) {
  const livekit = createLiveKitProvider(env);
  const client = rooms || (livekit.configured ? new RoomServiceClient(env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET) : null);
  const update = (identity, scope, share) => client.updateParticipant(livekit.roomName(scope), identity, undefined, permission(share));
  const shares = createScreenShareRegistry({
    grant: ({ identity, scope }) => update(identity, scope, true),
    revoke: ({ identity, scope }) => update(identity, scope, false),
  });
  return {
    name: "livekit", configured: livekit.configured, shares,
    async join(options) {
      const join = await livekit.join({ ...options, canShare: false });
      return { ...join, canShare: !!options.canShare };
    },
  };
}
