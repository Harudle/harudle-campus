import { isIP } from "node:net";

// 신뢰하는 로컬 프록시가 붙인 마지막 주소만 사용한다.
export function mediaClientAddress(request, trustProxy = false) {
  const remote = request?.socket?.remoteAddress || "";
  if (trustProxy && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) {
    const forwarded = request?.headers?.["x-forwarded-for"];
    if (typeof forwarded === "string") {
      const last = forwarded.split(",").at(-1).trim();
      if (isIP(last)) return last;
    }
  }
  return isIP(remote) ? remote : "unknown";
}

// 사용량 예약 전에 전체 동시 참가와 같은 주소의 반복 발급을 제한한다.
export function createMediaAdmission({ peers, maxParticipants = 20, perAddressPerMinute = 12, now = Date.now } = {}) {
  if (!peers || !Number.isSafeInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > 20 || !Number.isSafeInteger(perAddressPerMinute) || perAddressPerMinute < 2 || perAddressPerMinute > 120) throw new Error("invalid_media_config");
  const requests = new Map();
  return {
    check(id, address) {
      const time = now(); if (!Number.isSafeInteger(time) || time < 0) throw new Error("media_unavailable");
      const active = [...peers].filter(([peerId, peer]) => peerId !== id && (peer.mediaProvider || peer.mediaJoining)).length;
      if (active >= maxParticipants) throw new Error("room_full");
      const key = typeof address === "string" && address.length <= 45 && isIP(address) ? address : "unknown";
      if (!requests.has(key) && requests.size >= 10000) {
        for (const [ip, times] of requests) if (!times.some((t) => time >= t && time - t < 60000)) requests.delete(ip);
        if (requests.size >= 10000) throw new Error("rate_limited");
      }
      const recent = (requests.get(key) || []).filter((t) => time >= t && time - t < 60000);
      if (recent.length >= perAddressPerMinute) throw new Error("rate_limited");
      recent.push(time); requests.set(key, recent);
    },
  };
}
