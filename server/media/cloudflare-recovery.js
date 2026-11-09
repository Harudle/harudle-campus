// 외부 시험에서 남긴 세션은 현재 연결과 분리해 확인한다.
// 아직 끝나지 않은 요청은 트랙 목록이 비어 있어도 완료로 판단하지 않는다.
export function createCloudflareRecovery({ store, client }) {
  if (!store || !client || typeof client.inspectSession !== "function") throw new Error("invalid_media_config");
  let running = null;
  async function reconcile() {
    if (running) return running;
    running = (async () => {
      store.assertLeadership();
      for (const row of store.externalCloudflareSessions()) {
        try {
          let state = await client.inspectSession(row.session_id);
          for (const track of state.tracks) if (track.status !== "inactive") await client.close(row.session_id, track.mid);
          if (!state.gone && state.tracks.some((t) => t.status !== "inactive")) state = await client.inspectSession(row.session_id);
          if (state.gone || (!row.pending && state.tracks.every((t) => t.status === "inactive"))) store.closeExternalCloudflareSession(row.session_id);
        } catch { /* 제공사가 확인해 주지 않으면 기록을 남긴다. */ }
      }
      return store.externalCloudflareSessions().length === 0;
    })();
    try { return await running; } finally { running = null; }
  }
  return {
    reconcile,
    async ensureClear() { if (!(await reconcile())) throw new Error("cloudflare_cleanup_required"); },
  };
}
