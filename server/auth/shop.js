// 컷 상점 (하루들 연동 크루만 사고 쓴다)
//
//   GET  /api/shop            상품 목록. 연동했으면 가진 것 · 쓰고 있는 것 · 잔액도
//   POST /api/shop/buy        { sku } 컷으로 산다. 가격은 서버 카탈로그의 것만 쓴다
//   PUT  /api/me/gear         { slot, sku | null } 가진 것을 쓰거나 벗는다
//   GET  /api/frame/:feedId   내 네컷 액자에 걸 그림(하루들 공개 피드의 그림을 대신 받아 준다. 하루들 그림 주소는 15분짜리이고 다른 사이트에서 3D에 못 올린다)
//
//   가진 것(보유) · 쓰는 것(착용)은 Supabase에만 있다(docs/supabase/campus-shop.sql).
//   쓰는 것(gear)은 서버가 접속자 목록에 직접 붙인다: 브라우저는 gear를 보내지 않으므로 안 산 것을 낀 척할 수 없다.
//   지갑과 같은 스위치(CAMPUS_WALLET=on)로 켠다.
import { CATALOG, SLOTS, FRAME_SKU, itemOf, cleanGear } from "./catalog.js";
import { CURRENCY, FEED_DAILY, kstDate } from "./wallet.js";

async function readJson(req, max = 512) {
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > max) throw new Error("too_large"); }
  return JSON.parse(body);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FRAME_MAX_BYTES = 3 * 1024 * 1024, FRAME_KEEP = 60, FRAME_PER_MIN = 40;

export function createShop({ env = {}, store, harudle = "", fetch: fetchFn = globalThis.fetch, feedReward = 0, linkBonus = 0, now = () => Date.now(), log = console }) {
  const enabled = env.CAMPUS_WALLET === "on" && !!store?.buyItem;
  const listeners = new Set(), ownedListeners = new Set();
  const notify = (userId, gear) => { for (const fn of listeners) try { fn(userId, gear); } catch (e) { log.error?.("[shop] gear listener failed:", e.message); } };

  // 내 네컷 액자를 들었으면 걸 그림(가장 최근에 컷을 받은 하루들 피드 ID)을 frame으로 붙인다. 저장하는 값이 아니라 보여 줄 때만 붙는다
  async function withFrame(userId, gear) {
    if (gear.held !== FRAME_SKU || !store.latestFeedId) return gear;
    try { const id = await store.latestFeedId(userId); return id && UUID.test(id) ? { ...gear, frame: id } : gear; }
    catch (e) { log.error?.("[shop] frame lookup failed:", e.message); return gear; }
  }

  // 액자 그림: 하루들 공개 피드 한 건을 읽어 그 그림을 받아 둔다(최근 것 몇 장만 기억)
  const frames = new Map(), frameLoads = new Map();
  let frameWindow = { at: 0, n: 0 };
  async function loadFrame(id) {
    const meta = await fetchFn(`${harudle}/api/v1/feeds/${id}`, { headers: { accept: "application/json", "user-agent": "harudle-campus/1.0" }, signal: AbortSignal.timeout(5000) });
    if (meta.status === 404) return null;
    if (!meta.ok) throw new Error(`harudle ${meta.status}`);
    const src = (await meta.json())?.imageUrl;
    if (typeof src !== "string" || !src.startsWith("https://")) return null;
    const img = await fetchFn(src, { signal: AbortSignal.timeout(8000) });
    const type = String(img.headers.get("content-type") || "").split(";")[0];
    if (!img.ok || !/^image\/(webp|png|jpeg)$/.test(type)) throw new Error(`harudle image ${img.status}`);
    const body = Buffer.from(await img.arrayBuffer());
    if (!body.length || body.length > FRAME_MAX_BYTES) throw new Error("harudle image size");
    return { type, body };
  }
  async function frame(id) {
    if (frames.has(id)) return frames.get(id);
    if (!frameLoads.has(id)) {
      const t = now(); if (t - frameWindow.at > 60_000) frameWindow = { at: t, n: 0 };
      if (++frameWindow.n > FRAME_PER_MIN) return "busy";
      frameLoads.set(id, loadFrame(id).then((v) => { frames.set(id, v); if (frames.size > FRAME_KEEP) frames.delete(frames.keys().next().value); return v; }).finally(() => frameLoads.delete(id)));
    }
    return frameLoads.get(id);
  }

  // 이 회원이 지금 쓰고 있는 것(가진 것만). 꺼져 있거나 못 읽으면 빈 것
  async function gearOf(userId) {
    if (!enabled) return {};
    try { const [owned, gear] = await Promise.all([store.getInventory(userId), store.getGear(userId)]); return await withFrame(userId, cleanGear(gear, owned)); }
    catch (e) { log.error?.("[shop] gear lookup failed:", e.message); return {}; }
  }

  // 이 회원이 가진 것(감정표현을 쓸 수 있는지 서버가 본다). 꺼져 있거나 못 읽으면 빈 것
  async function ownedOf(userId) {
    if (!enabled) return [];
    try { return await store.getInventory(userId); } catch (e) { log.error?.("[shop] inventory lookup failed:", e.message); return []; }
  }

  async function handle(req, res, url, { user, origin, json }) {
    const p = url.pathname, m = req.method;
    const list = p === "/api/shop" && m === "GET", buy = p === "/api/shop/buy" && m === "POST", wear = p === "/api/me/gear" && m === "PUT";
    const pic = m === "GET" && p.startsWith("/api/frame/");
    if (!list && !buy && !wear && !pic) return false;
    if (!enabled) { json(res, 404, { error: "shop_disabled" }); return true; }
    if (pic) {
      const id = p.slice("/api/frame/".length);
      if (!UUID.test(id)) { json(res, 400, { error: "id" }); return true; }
      try {
        const f = await frame(id);
        if (f === "busy") { json(res, 429, { error: "busy" }); return true; }
        if (!f) { json(res, 404, { error: "frame" }); return true; }
        res.writeHead(200, { "content-type": f.type, "content-length": f.body.length, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" });
        res.end(f.body);
      } catch (e) { log.error?.("[shop] frame failed:", e.message); json(res, 502, { error: "harudle" }); }
      return true;
    }
    if (!list && req.headers.origin !== origin) { json(res, 403, { error: "origin" }); return true; }
    const u = await user(req);
    // earn: 컷을 받는 법(상점이 컷이 모자랄 때 하루들로 안내하는 데 쓴다). reward = 하루 한 번 받는 컷, today = 오늘 이미 받았는지, welcome = 처음 연동하면 받는 선물(게스트에게만)
    if (list && !u) { json(res, 200, { currency: CURRENCY, catalog: CATALOG, loggedIn: false, earn: { reward: feedReward, ...(linkBonus ? { welcome: linkBonus } : {}) } }); return true; }
    if (!u) { json(res, 401, { error: "login" }); return true; }
    try {
      if (list) {
        const [owned, gear, w, entries, frameId] = await Promise.all([store.getInventory(u.id), store.getGear(u.id), store.getWallet(u.id), store.listWalletEntries(u.id, 20), store.latestFeedId ? store.latestFeedId(u.id).catch(() => null) : null]);
        const today = entries.some((e) => e.kind === FEED_DAILY && e.refKey === kstDate(now()));
        json(res, 200, { currency: CURRENCY, catalog: CATALOG, loggedIn: true, owned, gear: await withFrame(u.id, cleanGear(gear, owned)), balance: w.balance, earn: { reward: feedReward, today }, frame: frameId && UUID.test(frameId) ? frameId : null });   // frame: 내 네컷 액자에 걸릴 내 네컷만화(없으면 null)
        return true;
      }
      let body; try { body = await readJson(req); } catch { json(res, 400, { error: "body" }); return true; }
      if (buy) {
        const it = itemOf(body?.sku);
        if (!it) { json(res, 400, { error: "sku" }); return true; }
        const r = await store.buyItem({ userId: u.id, sku: it.sku, price: it.price, at: now() });
        if (!r.ok) { json(res, 409, { error: r.reason, balance: r.balance }); return true; }
        const owned = await store.getInventory(u.id);
        for (const fn of ownedListeners) try { fn(u.id, owned); } catch (e) { log.error?.("[shop] owned listener failed:", e.message); }   // 산 감정표현을 바로 쓸 수 있게
        json(res, 200, { sku: it.sku, balance: r.balance, owned });
        return true;
      }
      // 쓰기 · 벗기
      const slot = body?.slot, sku = body?.sku ?? null;
      if (!SLOTS.includes(slot)) { json(res, 400, { error: "slot" }); return true; }
      const it = sku === null ? null : itemOf(sku);
      if (sku !== null && (!it || it.slot !== slot)) { json(res, 400, { error: "sku" }); return true; }
      const owned = await store.getInventory(u.id);
      if (it && !owned.includes(it.sku)) { json(res, 403, { error: "not_owned" }); return true; }
      const gear = cleanGear(await store.getGear(u.id), owned);
      if (it) gear[slot] = it.sku; else delete gear[slot];
      await store.saveGear({ userId: u.id, gear, at: now() });
      const shown = await withFrame(u.id, gear);
      notify(u.id, shown);
      json(res, 200, { gear: shown });
    } catch (e) { log.error?.("[shop] failed:", e.message); json(res, 502, { error: "store" }); }
    return true;
  }

  return { enabled, handle, gearOf, ownedOf, onGear: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, onOwned: (fn) => { ownedListeners.add(fn); return () => ownedListeners.delete(fn); } };
}
