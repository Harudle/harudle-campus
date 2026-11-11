import assert from "node:assert/strict";
import { test } from "node:test";
import { createMediaAdmission, MAX_MEDIA_PARTICIPANTS, mediaClientAddress } from "../server/media/admission.js";

test("전체 동시 연결 수와 IP별 반복 연결을 제한한다", () => {
  let now = 1000000;
  const peers = new Map([["a", { mediaProvider: "daily" }], ["b", { mediaJoining: true }], ["c", {}]]);
  const limiter = createMediaAdmission({ peers, maxParticipants: 2, perAddressPerMinute: 2, now: () => now });
  assert.throws(() => limiter.check("c", "192.0.2.2"), /room_full/);
  peers.get("b").mediaJoining = false;
  limiter.check("c", "192.0.2.2"); limiter.check("c", "192.0.2.2");
  assert.throws(() => limiter.check("c", "192.0.2.2"), /rate_limited/);
  limiter.check("c", "192.0.2.3");
  now += 60001; limiter.check("c", "192.0.2.2");
});

test("신뢰하는 로컬 프록시의 주소만 클라이언트 주소로 사용한다", () => {
  const req = { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "203.0.113.3, 192.0.2.4" } };
  assert.equal(mediaClientAddress(req, true), "192.0.2.4");
  assert.equal(mediaClientAddress(req, false), "127.0.0.1");
  req.socket.remoteAddress = "192.0.2.5";
  assert.equal(mediaClientAddress(req, true), "192.0.2.5");
  req.socket.remoteAddress = "127.0.0.1"; req.headers["x-forwarded-for"] = "invalid";
  assert.equal(mediaClientAddress(req, true), "127.0.0.1");
});

test("동시 인원 상한은 자체 호스팅 기준 200까지 설정할 수 있다", () => {
  const peers = new Map();
  assert.equal(MAX_MEDIA_PARTICIPANTS, 200);
  createMediaAdmission({ peers, maxParticipants: 200 });
  assert.throws(() => createMediaAdmission({ peers, maxParticipants: 201 }), /invalid_media_config/);
  assert.throws(() => createMediaAdmission({ peers, maxParticipants: 1 }), /invalid_media_config/);
});
