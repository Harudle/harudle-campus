// Cloudflare SFU API는 서버에서만 호출한다. 응답과 오류에 비밀 키를 넣지 않는다.
export function createCloudflareSfuClient(env, fetchImpl = fetch) {
  const appId = env.CLOUDFLARE_SFU_APP_ID || "", secret = env.CLOUDFLARE_SFU_SECRET || "";
  const configured = /^[a-zA-Z0-9_-]{20,100}$/.test(appId) && /^[a-zA-Z0-9_-]{32,256}$/.test(secret);
  const base = `https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(appId)}`;
  const safeId = (s) => typeof s === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(s);
  async function request(path, method, body, allowGone = false) {
    if (!configured) throw new Error("not_configured");
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method, headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      const kind = ["TimeoutError", "AbortError"].includes(error?.name) ? "timeout" : "network";
      console.warn(`[cloudflare-sfu] ${method} transport ${kind}`);
      throw new Error("cloudflare_unavailable");
    }
    let result;
    try { result = await response.json(); } catch { throw new Error("cloudflare_invalid_response"); }
    // 404는 앱 ID 오류일 수도 있다. 세션을 새로 만들어야 하는 410 session_error만 종료로 본다.
    if (allowGone && response.status === 410 && result?.errorCode === "session_error") return { gone: true };
    if (!response.ok || result?.errorCode || result?.errorDescription) {
      const code = /^[a-z_]{1,80}$/.test(result?.errorCode || "") ? result.errorCode : "unknown";
      console.warn(`[cloudflare-sfu] HTTP ${response.status}, ${code}`);
    }
    if (!response.ok || !result || typeof result !== "object" || result.errorCode || result.errorDescription) throw new Error("cloudflare_unavailable");
    return result;
  }
  function validDescription(s, type) {
    return s && s.type === type && typeof s.sdp === "string" && s.sdp.length > 0 && s.sdp.length <= 100000;
  }
  function checkedTrack(result, type) {
    const tracks = result?.tracks;
    if (!Array.isArray(tracks) || tracks.length !== 1 || tracks[0]?.errorCode || tracks[0]?.errorDescription || !safeId(tracks[0]?.mid) || !validDescription(result.sessionDescription, type)) {
      const code = /^[a-z_]{1,80}$/.test(tracks?.[0]?.errorCode || "") ? tracks[0].errorCode : "invalid_track";
      console.warn(`[cloudflare-sfu] track ${code}`);
      throw new Error("cloudflare_track_failed");
    }
    return { track: tracks[0], sessionDescription: result.sessionDescription, requiresImmediateRenegotiation: !!result.requiresImmediateRenegotiation };
  }
  return {
    configured,
    async createSession() {
      const result = await request("/sessions/new", "POST");
      if (!safeId(result.sessionId)) throw new Error("cloudflare_invalid_response");
      return result.sessionId;
    },
    async inspectSession(sessionId) {
      if (!safeId(sessionId)) throw new Error("invalid_media_request");
      const result = await request(`/sessions/${sessionId}`, "GET", undefined, true);
      if (result.gone) return { gone: true, tracks: [] };
      if (!Array.isArray(result.tracks) || result.tracks.some((track) => !safeId(track?.mid) || !["active", "inactive"].includes(track.status))) throw new Error("cloudflare_invalid_response");
      return { gone: false, tracks: result.tracks.map((track) => ({ mid: track.mid, status: track.status })) };
    },
    async getSession(sessionId) { return (await this.inspectSession(sessionId)).tracks; },
    async publish(sessionId, trackName, mid, offer) {
      if (!safeId(sessionId) || !safeId(trackName) || !safeId(mid) || !validDescription(offer, "offer")) throw new Error("invalid_media_request");
      const result = await request(`/sessions/${sessionId}/tracks/new`, "POST", { sessionDescription: offer, tracks: [{ location: "local", mid, trackName }] });
      return checkedTrack(result, "answer");
    },
    async subscribe(sessionId, publisherSessionId, trackName) {
      if (!safeId(sessionId) || !safeId(publisherSessionId) || !safeId(trackName)) throw new Error("invalid_media_request");
      const result = await request(`/sessions/${sessionId}/tracks/new`, "POST", { tracks: [{ location: "remote", sessionId: publisherSessionId, trackName }] });
      return checkedTrack(result, "offer");
    },
    async answer(sessionId, answer) {
      if (!safeId(sessionId) || !validDescription(answer, "answer")) throw new Error("invalid_media_request");
      await request(`/sessions/${sessionId}/renegotiate`, "PUT", { sessionDescription: answer });
    },
    async close(sessionId, mid) {
      if (!safeId(sessionId) || !safeId(mid)) throw new Error("invalid_media_request");
      const result = await request(`/sessions/${sessionId}/tracks/close`, "PUT", { force: true, tracks: [{ mid }] }, true);
      if (result.gone) return;
      const item = result.tracks?.[0];
      if (!Array.isArray(result.tracks) || result.tracks.length !== 1 || item?.mid !== mid ||
          (item.errorCode && item.errorCode !== "close_track_error") || (item.errorDescription && !item.errorCode)) throw new Error("cloudflare_close_failed");
    },
  };
}
