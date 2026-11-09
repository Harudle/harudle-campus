// 같은 프로세스의 캠퍼스 연결을 함께 전환한다. 응답하지 않는 연결이 있으면 전환을 중단한다.
export function createSwitchCoordinator(peers, timeoutMs = 15000) {
  let pending = null;
  function finish(error) {
    const item = pending;
    if (!item) return;
    pending = null; clearTimeout(item.timer);
    if (error) item.reject(error); else item.resolve();
  }
  function left(id) {
    const peer = peers.get(id); if (peer) peer.mediaProvider = null;
    if (pending?.expected.delete(id) && !pending.expected.size) finish();
  }
  return {
    async prepare(change) {
      if (pending) throw new Error("switch_in_progress");
      const expected = new Set([...peers].filter(([, p]) => p.mediaProvider === change.from && p.ws.readyState === 1).map(([id]) => id));
      if (!expected.size) return;
      const promise = new Promise((resolve, reject) => {
        pending = { revision: change.revision, expected, resolve, reject, timer: setTimeout(() => finish(new Error("switch_timeout")), timeoutMs) };
      });
      for (const id of expected) {
        const peer = peers.get(id);
        try { peer.ws.send(JSON.stringify({ t: "media:switch", revision: change.revision })); }
        catch { finish(new Error("switch_unavailable")); break; }
      }
      await promise;
    },
    ack(id, revision) {
      if (!pending || pending.revision !== revision || !pending.expected.has(id)) return;
      left(id);
    },
    left,
    disconnected(id) { if (pending?.expected.has(id)) finish(new Error("switch_unavailable")); },
  };
}
