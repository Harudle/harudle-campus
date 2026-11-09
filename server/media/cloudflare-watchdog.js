// EC2가 멈춰도 SFU 연결을 정리할 수 있도록 별도 Worker에 먼저 등록한다.
// Worker와 SFU 자체의 장애까지 막을 수 있는 청구 상한은 아니다.
export function createCloudflareWatchdog(env, { fetchImpl = fetch } = {}) {
  const token = env.CLOUDFLARE_WATCHDOG_TOKEN || "";
  let base;
  try {
    const url = new URL(env.CLOUDFLARE_WATCHDOG_URL || "");
    if (url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) base = url.origin;
  } catch {}
  const configured = !!base && /^[A-Za-z0-9_-]{32,256}$/.test(token);
  const safeId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);
  async function send(action, id, expiresAt) {
    if (!configured || !safeId(id) || (action === "register" && !Number.isSafeInteger(expiresAt))) throw new Error("watchdog_unavailable");
    let response;
    try {
      response = await fetchImpl(`${base}/${action}`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ id, ...(expiresAt === undefined ? {} : { expiresAt }) }), signal: AbortSignal.timeout(8000),
      });
    } catch { throw new Error("watchdog_unavailable"); }
    if (!response.ok) throw new Error("watchdog_unavailable");
  }
  return {
    configured,
    register: (id, expiresAt) => send("register", id, expiresAt),
    begin: (id) => send("begin", id),
    finish: (id) => send("finish", id),
    disarm: (id) => send("disarm", id),
  };
}
