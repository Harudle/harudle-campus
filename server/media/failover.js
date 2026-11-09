// 이 라우터는 한 서버 프로세스에서만 사용한다. 여러 서버에서는 공유 상태와 알림이 필요하다.
// onSwitch는 이전 연결을 정리하고 모든 참가자가 새 제공자로 재접속하도록 처리해야 한다.
export function createFailoverRouter({ providers, onSwitch }) {
  if (!Array.isArray(providers) || typeof onSwitch !== "function") throw new Error("invalid_router_config");
  const available = providers.filter((p) => p?.name && p.configured && typeof p.join === "function");
  if (new Set(available.map((p) => p.name)).size !== available.length) throw new Error("invalid_router_config");
  let current = 0, revision = 0, switching = null, blocked = false;

  async function moveFrom(expected, reason) {
    if (switching) { await switching; return; }
    if (current !== expected) return;
    const next = current + 1;
    if (next >= available.length) { blocked = true; throw new Error("media_unavailable"); }
    switching = (async () => {
      const change = { from: available[current].name, to: available[next].name, revision: revision + 1, reason };
      // 정리가 실패하면 새 제공자에 연결하지 않는다.
      try { await onSwitch(change); }
      catch { blocked = true; throw new Error("media_unavailable"); }
      current = next; revision = change.revision;
    })();
    try { await switching; } finally { switching = null; }
  }

  return {
    get configured() { return available.length > 0; },
    get state() { return { provider: available[current]?.name || null, revision, blocked }; },
    async join(options) {
      if (!available.length) throw new Error("not_configured");
      for (;;) {
        if (switching) await switching;
        if (blocked) throw new Error("media_unavailable");
        const selected = current, selectedRevision = revision;
        try {
          const joined = await available[selected].join(options);
          if (selected !== current || selectedRevision !== revision || switching) continue;
          return { ...joined, revision: selectedRevision };
        } catch (error) {
          if (selected !== current || selectedRevision !== revision) continue;
          if (error?.message !== "budget_exhausted") throw error;
          await moveFrom(selected, "budget_exhausted");
        }
      }
    },
    // 클라이언트의 단일 실패가 아니라, 서버가 확인한 제공자 장애만 전달한다.
    async markUnavailable(provider) {
      if (available[current]?.name === provider) await moveFrom(current, "provider_unavailable");
    },
  };
}
