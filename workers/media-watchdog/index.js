const safeId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const response = (status) => new Response(null, { status });

// 외부에는 등록 API만 노출한다. SFU 키는 Worker 비밀값이며 브라우저로 보내지 않는다.
export default {
  async fetch(request, env) {
    const token = env.WATCHDOG_TOKEN || "", authorization = request.headers.get("authorization") || "";
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(token) || authorization.length !== token.length + 7) return response(401);
    const expected = `Bearer ${token}`;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ authorization.charCodeAt(i);
    if (diff) return response(401);
    const action = new URL(request.url).pathname.slice(1);
    if (request.method !== "POST" || !["register", "begin", "finish", "disarm"].includes(action)) return response(404);
    let body;
    try {
      const text = await request.text();
      if (text.length > 512) return response(400);
      body = JSON.parse(text);
    } catch { return response(400); }
    if (!safeId(body?.id)) return response(400);
    if (action === "register" && (!Number.isSafeInteger(body.expiresAt) || body.expiresAt * 1000 <= Date.now() || body.expiresAt * 1000 > Date.now() + 901000)) return response(400);
    const stub = env.LEASES.get(env.LEASES.idFromName(body.id));
    return stub.fetch(new Request(`https://internal/${action}`, { method: "POST", body: JSON.stringify(body) }));
  },
};

// 인스턴스 하나가 SFU 세션 하나를 담당한다. 요청을 보낸 뒤 응답을 잃은 경우는 계속 재확인한다.
export class MediaLease {
  constructor(state, env) { this.storage = state.storage; this.env = env; this.queue = Promise.resolve(); }
  serialize(run) {
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }
  fetch(request) { return this.serialize(() => this.handle(request)); }
  alarm() { return this.serialize(() => this.handleAlarm()); }
  async handle(request) {
    let body;
    try { body = await request.json(); } catch { return response(400); }
    if (!safeId(body?.id)) return response(400);
    const action = new URL(request.url).pathname.slice(1), saved = await this.storage.get("lease");
    if (action === "register") {
      if (!Number.isSafeInteger(body.expiresAt) || body.expiresAt * 1000 <= Date.now() || body.expiresAt * 1000 > Date.now() + 901000) return response(400);
      if (saved && (saved.id !== body.id || saved.expiresAt !== body.expiresAt)) return response(409);
      await this.storage.put("lease", saved || { id: body.id, expiresAt: body.expiresAt, pending: false });
      // 응답이 전달되기 전에 알람까지 저장한다. 이미 등록된 알람은 늦추지 않는다.
      if (await this.storage.getAlarm() === null) await this.storage.setAlarm(body.expiresAt * 1000);
      return response(204);
    }
    if (!saved || saved.id !== body.id) return response(404);
    if (action === "begin") {
      if (saved.pending || Date.now() >= saved.expiresAt * 1000) return response(409);
      await this.storage.put("lease", { ...saved, pending: true });
      return response(204);
    }
    if (action === "finish") {
      if (!saved.pending) return response(409);
      await this.storage.put("lease", { ...saved, pending: false });
      return response(204);
    }
    if (action === "disarm") {
      if (saved.pending) return response(409);
      try {
        const result = await this.cleanup(saved.id);
        if (!result.clean) return response(409);
        await this.storage.deleteAll();
        return response(204);
      } catch { return response(503); }
    }
    return response(404);
  }
  async handleAlarm() {
    const saved = await this.storage.get("lease");
    if (!saved) return;
    let clean = false, gone = false;
    try { ({ clean, gone } = await this.cleanup(saved.id)); } catch {}
    // SFU가 세션을 없앴거나, 결과가 불확실한 요청 없이 트랙이 닫힌 경우에만 끝낸다.
    if (gone || (clean && !saved.pending)) { await this.storage.deleteAll(); return; }
    // 자동 재시도 횟수가 끝나도 다시 시도하도록 알람을 명시적으로 설정한다.
    await this.storage.setAlarm(Date.now() + 60000);
  }
  async cleanup(id) {
    const appId = this.env.SFU_APP_ID || "", secret = this.env.SFU_SECRET || "", fetchImpl = this.env.TEST_FETCH || fetch;
    if (!safeId(id) || !/^[A-Za-z0-9_-]{20,100}$/.test(appId) || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error("config_invalid");
    const base = `https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(appId)}/sessions/${encodeURIComponent(id)}`;
    const call = async (suffix = "", method = "GET", body) => {
      const result = await fetchImpl(`${base}${suffix}`, { method, headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      const data = await result.json();
      if (result.status === 410 && data?.errorCode === "session_error") return { gone: true };
      // 404는 SFU 앱이 잘못되었을 때도 발생한다. 정리 완료로 보지 않는다.
      if (!result.ok) throw new Error("sfu_unavailable");
      if (!data || data.errorCode || data.errorDescription) throw new Error("sfu_unavailable");
      return data;
    };
    const read = async () => {
      const result = await call();
      if (result.gone) return result;
      if (!Array.isArray(result.tracks) || result.tracks.some((t) => !safeId(t?.mid) || !["active", "inactive"].includes(t.status))) throw new Error("sfu_invalid");
      return result;
    };
    let current = await read();
    if (current.gone) return { clean: true, gone: true };
    for (const track of current.tracks) {
      if (track.status === "inactive") continue;
      const result = await call("/tracks/close", "PUT", { force: true, tracks: [{ mid: track.mid }] });
      if (result.gone) return { clean: true, gone: true };
      const item = result.tracks?.[0];
      if (!Array.isArray(result.tracks) || result.tracks.length !== 1 || item?.mid !== track.mid || (item.errorCode && item.errorCode !== "close_track_error") || (item.errorDescription && !item.errorCode)) throw new Error("sfu_invalid");
    }
    current = await read();
    return { gone: !!current.gone, clean: !!current.gone || current.tracks.every((t) => t.status === "inactive") };
  }
}
