import assert from "node:assert/strict";
import { test } from "node:test";
import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { createScreenShareRegistry } from "../server/media/screen-share.js";
import { createSelfHostedLiveKitProvider } from "../server/media/self-hosted.js";
import { createMediaService } from "../server/media/index.js";

test("회의실(scope) 하나에 화면 공유는 하나만 잡는다", async () => {
  const shares = createScreenShareRegistry();
  await shares.start("a", "meeting:1");
  await shares.start("a", "meeting:1");   // 같은 크루는 다시 잡아도 그대로
  await assert.rejects(shares.start("b", "meeting:1"), /share_taken/);
  await shares.start("b", "meeting:2");   // 다른 회의실은 따로
  assert.equal(shares.sharerOf("meeting:1"), "a");
  assert.equal(await shares.stop("a"), true);
  assert.equal(shares.sharerOf("meeting:1"), null);
  await shares.start("b", "meeting:1");
  assert.equal(await shares.stop("c"), false);
});

test("권한 주기에 실패하면 자리를 돌려주고, 주는 사이 나갔으면 바로 거둔다", async () => {
  const calls = [];
  let fail = true, release;
  const shares = createScreenShareRegistry({
    grant: async (p) => { calls.push(["grant", p.identity]); if (fail) throw new Error("boom"); await new Promise((r) => { release = r; }); },
    revoke: async (p) => { calls.push(["revoke", p.identity]); },
  });
  await assert.rejects(shares.start("a", "meeting:1"), /unavailable/);
  assert.equal(shares.sharerOf("meeting:1"), null);
  fail = false;
  const starting = shares.start("a", "meeting:1");
  await Promise.resolve();
  await shares.stop("a");   // 권한을 받는 중에 나감
  release(); await starting;
  assert.deepEqual(calls, [["grant", "a"], ["grant", "a"], ["revoke", "a"], ["revoke", "a"]]);
  assert.equal(shares.sharerOf("meeting:1"), null);
});

test("자체 호스팅 LiveKit: 입장권은 마이크만, 공유 자리를 잡을 때 LiveKit 권한을 준다", async (t) => {
  const updates = [];
  t.mock.method(RoomServiceClient.prototype, "updateParticipant", async (room, identity, metadata, permission) => { updates.push({ room, identity, permission }); return {}; });
  const env = { MEDIA_PROVIDER: "self-hosted", LIVEKIT_URL: "wss://voice.example.test", LIVEKIT_API_KEY: "key", LIVEKIT_API_SECRET: "secret-secret-secret-secret-secret", MEDIA_NAMESPACE: "campus" };
  const service = createMediaService(env);
  assert.equal(service.configured, true);
  const join = await service.join({ identity: "a", name: "크루", area: "11:회의실 금성", scope: "meeting:1", canShare: true });
  assert.equal(join.provider, "livekit"); assert.equal(join.canShare, true);
  assert.equal(join.connection.expiresAt, undefined, "예약과 만료가 없다");
  const payload = JSON.parse(Buffer.from(join.connection.token.split(".")[1], "base64url").toString());
  assert.deepEqual(payload.video.canPublishSources, ["microphone"], "화면 공유 권한은 입장권에 넣지 않는다");
  await service.shares.start("a", "meeting:1");
  await assert.rejects(service.shares.start("b", "meeting:1"), /share_taken/);
  await service.shares.stop("a");
  assert.equal(updates.length, 2);
  assert.equal(updates[0].room, payload.video.room);
  assert.deepEqual(updates[0].permission.canPublishSources, [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]);   // API는 번호값
  assert.deepEqual(updates[1].permission.canPublishSources, [TrackSource.MICROPHONE]);
  for (const u of updates) { assert.equal(u.permission.canPublish, true); assert.equal(u.permission.canSubscribe, true); }
});

test("설정이 없으면 자체 호스팅도 음성을 열지 않는다", async () => {
  const service = createSelfHostedLiveKitProvider({ MEDIA_PROVIDER: "self-hosted" });
  assert.equal(service.configured, false);
  await assert.rejects(service.join({ identity: "a", area: "11:open", scope: "11:open" }), /not_configured/);
});
