// 회의실(음성 방 scope) 하나당 화면 공유는 하나만 허용한다.
// grant/revoke가 있으면(자체 호스팅 LiveKit) 공유 권한을 음성 서버에 직접 주고 거둔다. 없으면 서버 메모리의 자리 확인만 한다.
export function createScreenShareRegistry({ grant, revoke } = {}) {
  const sharers = new Map();   // scope -> identity
  return {
    sharerOf(scope) { return sharers.get(scope) || null; },
    // 자리를 먼저 잡고 권한을 준다. 둘이 동시에 눌러도 두 번째는 share_taken
    async start(identity, scope) {
      if (typeof identity !== "string" || !identity || typeof scope !== "string" || !scope) throw new Error("unavailable");
      const current = sharers.get(scope);
      if (current && current !== identity) throw new Error("share_taken");
      if (current === identity) return;
      sharers.set(scope, identity);
      try { if (grant) await grant({ identity, scope }); }
      catch { if (sharers.get(scope) === identity) sharers.delete(scope); throw new Error("unavailable"); }
      // 권한을 주는 사이에 공유를 멈췄거나 나갔으면 바로 거둔다
      if (sharers.get(scope) !== identity && revoke) await revoke({ identity, scope }).catch(() => {});
    },
    // 그 크루가 잡은 자리를 모두 비운다. 거두기 실패는 무시한다(방을 나가면 LiveKit이 입장권 권한으로 되돌린다)
    async stop(identity) {
      const released = [];
      for (const [scope, who] of sharers) if (who === identity) { sharers.delete(scope); released.push(scope); }
      if (revoke) for (const scope of released) await revoke({ identity, scope }).catch(() => {});
      return released.length > 0;
    },
  };
}
