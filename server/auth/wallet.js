// 캠퍼스 지갑 '컷' (하루들 연동 크루만)
//
//   하루들 공개 피드에 네컷만화를 올린 날마다 하루 한 번 컷을 준다(한국 날짜 기준).
//   캠퍼스 서버가 하루들 공개 피드(GET /api/v1/feeds)를 직접 읽어 글쓴이 ID가 연동 회원 ID와 같은지 본다.
//   브라우저가 "올렸어요"라고 알리는 값은 믿지 않는다. 하루들 서비스 DB · 백엔드는 건드리지 않는다.
//
//   잔액 · 거래 기록은 Supabase에만 있다(docs/supabase/campus-wallet.sql). 같은 날짜는 DB 고유 제약으로 한 번만 지급된다.
//   CAMPUS_WALLET=on 이고 로그인 연동이 켜져 있을 때만 동작한다. 꺼져 있으면 /api/me/wallet은 404다.
const WINDOW_MS = 7 * 864e5;      // 최근 7일 안에 올린 것만 본다(오래 안 들어오면 그 전 날짜는 못 받는다)
const MAX_PAGES = 8;              // 50개씩 최대 400개
const SCAN_TTL_MS = 60_000;       // 하루들 피드는 1분에 한 번만 다시 읽는다
const SETTLE_GAP_MS = 15_000;     // 한 사람의 정산 요청 간격
const FUTURE_SKEW_MS = 5 * 60_000;
const KST_MS = 9 * 3600e3;
export const CURRENCY = "컷";
export const FEED_DAILY = "feed_daily";

export const kstDate = (ms) => new Date(ms + KST_MS).toISOString().slice(0, 10);

function readAmount(value) {
  const n = Number(value ?? 10);
  if (!Number.isInteger(n) || n < 1 || n > 1000) throw new Error("invalid_campus_wallet_feed_reward");
  return n;
}

export function createWallet({ env = {}, store, harudle, fetch: fetchFn = globalThis.fetch, now = () => Date.now(), log = console }) {
  const enabled = env.CAMPUS_WALLET === "on" && !!store?.grantReward;
  const amount = readAmount(env.CAMPUS_WALLET_FEED_REWARD);
  let scan = { at: 0, feeds: null, pending: null };
  const settled = new Map();   // "회원|날짜" → 이 워커가 이미 DB에 확인한 것(같은 요청을 되풀이하지 않으려고)
  const lastSettle = new Map();

  // 최근 공개 피드: [{ id, author, at }] (최신순으로 읽다가 7일보다 오래된 것이 나오면 멈춘다)
  async function fetchFeeds() {
    const out = [], t = now(), since = t - WINDOW_MS;
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${harudle}/api/v1/feeds?sort=LATEST&size=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetchFn(url, { headers: { accept: "application/json", "user-agent": "harudle-campus/1.0" }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`harudle ${res.status}`);
      const body = await res.json();
      let old = false;
      for (const f of Array.isArray(body?.items) ? body.items : []) {
        const at = Date.parse(f?.publishedAt), author = f?.author?.id;
        if (!Number.isFinite(at) || typeof author !== "string" || typeof f.id !== "string" || at > t + FUTURE_SKEW_MS) continue;
        if (at < since) { old = true; continue; }
        out.push({ id: f.id, author: author.toLowerCase(), at });
      }
      if (old || !body?.hasNext || !body?.nextCursor) break;
      cursor = body.nextCursor;
    }
    return out;
  }
  async function feeds() {
    if (scan.feeds && now() - scan.at < SCAN_TTL_MS) return scan.feeds;
    if (!scan.pending) {
      scan.pending = fetchFeeds()
        .then((list) => { scan = { at: now(), feeds: list, pending: null }; return list; })
        .catch((e) => { scan.pending = null; throw new Error(String(e?.message).startsWith("harudle") ? e.message : `harudle ${e?.message}`); });
    }
    return scan.pending;
  }

  // 이 회원이 피드를 올린 한국 날짜마다 한 번씩 지급한다. 이미 준 날짜는 DB가 걸러 낸다
  async function settle(userId) {
    const me = String(userId).toLowerCase(), days = new Map();
    for (const f of await feeds()) {
      if (f.author !== me) continue;
      const date = kstDate(f.at), first = days.get(date);
      if (!first || f.at < first.at) days.set(date, f);
    }
    const granted = [];
    let balance = null;
    for (const [date, f] of [...days].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const key = `${me}|${date}`;
      if (settled.has(key)) continue;
      const r = await store.grantReward({ userId, kind: FEED_DAILY, refKey: date, amount, meta: { feedId: f.id }, at: now() });
      settled.set(key, 1); if (settled.size > 20000) settled.clear();
      balance = r.balance;
      if (r.granted) granted.push({ date, amount });
    }
    if (balance === null) balance = (await store.getWallet(userId)).balance;
    return { balance, granted };
  }

  // GET /api/me/wallet (읽기만) · POST /api/me/wallet/settle (정산: 캠퍼스 Origin만)
  async function handle(req, res, url, { user, origin, json }) {
    const p = url.pathname;
    const read = p === "/api/me/wallet" && req.method === "GET", pay = p === "/api/me/wallet/settle" && req.method === "POST";
    if (!read && !pay) return false;
    if (!enabled) { json(res, 404, { error: "wallet_disabled" }); return true; }
    if (pay && req.headers.origin !== origin) { json(res, 403, { error: "origin" }); return true; }
    const u = await user(req);
    if (!u) { json(res, 401, { error: "login" }); return true; }
    try {
      if (read) {
        const [w, entries] = await Promise.all([store.getWallet(u.id), store.listWalletEntries(u.id, 20)]);
        json(res, 200, { currency: CURRENCY, balance: w.balance, entries });
        return true;
      }
      const t = now(), last = lastSettle.get(u.id) || 0;
      if (t - last < SETTLE_GAP_MS) { json(res, 200, { currency: CURRENCY, balance: (await store.getWallet(u.id)).balance, granted: [] }); return true; }
      lastSettle.set(u.id, t); if (lastSettle.size > 5000) lastSettle.clear();
      let result;
      try { result = await settle(u.id); }
      catch (e) {
        lastSettle.delete(u.id);
        const upstream = String(e?.message).startsWith("harudle");
        log.error?.(`[wallet] settle failed: ${e?.message}`);
        json(res, 502, { error: upstream ? "harudle" : "store" });
        return true;
      }
      json(res, 200, { currency: CURRENCY, ...result });
    } catch (e) { log.error?.("[wallet] failed:", e.message); json(res, 502, { error: "store" }); }
    return true;
  }

  return { enabled, amount, handle, settle };
}
