// 컷 상점 (하루들 연동 크루만 사고 쓴다)
//
//   GET  /api/shop            상품 목록. 연동했으면 가진 것 · 쓰고 있는 것 · 잔액도
//   POST /api/shop/buy        { sku } 컷으로 산다. 가격은 서버 카탈로그의 것만 쓴다
//   PUT  /api/me/gear         { slot, sku | null } 가진 것을 쓰거나 벗는다
//
//   가진 것(보유) · 쓰는 것(착용)은 Supabase에만 있다(docs/supabase/campus-shop.sql).
//   쓰는 것(gear)은 서버가 접속자 목록에 직접 붙인다: 브라우저는 gear를 보내지 않으므로 안 산 것을 낀 척할 수 없다.
//   지갑과 같은 스위치(CAMPUS_WALLET=on)로 켠다.
import { CATALOG, SLOTS, itemOf, cleanGear } from "./catalog.js";
import { CURRENCY } from "./wallet.js";

async function readJson(req, max = 512) {
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > max) throw new Error("too_large"); }
  return JSON.parse(body);
}

export function createShop({ env = {}, store, now = () => Date.now(), log = console }) {
  const enabled = env.CAMPUS_WALLET === "on" && !!store?.buyItem;
  const listeners = new Set();
  const notify = (userId, gear) => { for (const fn of listeners) try { fn(userId, gear); } catch (e) { log.error?.("[shop] gear listener failed:", e.message); } };

  // 이 회원이 지금 쓰고 있는 것(가진 것만). 꺼져 있거나 못 읽으면 빈 것
  async function gearOf(userId) {
    if (!enabled) return {};
    try { const [owned, gear] = await Promise.all([store.getInventory(userId), store.getGear(userId)]); return cleanGear(gear, owned); }
    catch (e) { log.error?.("[shop] gear lookup failed:", e.message); return {}; }
  }

  async function handle(req, res, url, { user, origin, json }) {
    const p = url.pathname, m = req.method;
    const list = p === "/api/shop" && m === "GET", buy = p === "/api/shop/buy" && m === "POST", wear = p === "/api/me/gear" && m === "PUT";
    if (!list && !buy && !wear) return false;
    if (!enabled) { json(res, 404, { error: "shop_disabled" }); return true; }
    if (!list && req.headers.origin !== origin) { json(res, 403, { error: "origin" }); return true; }
    const u = await user(req);
    if (list && !u) { json(res, 200, { currency: CURRENCY, catalog: CATALOG, loggedIn: false }); return true; }
    if (!u) { json(res, 401, { error: "login" }); return true; }
    try {
      if (list) {
        const [owned, gear, w] = await Promise.all([store.getInventory(u.id), store.getGear(u.id), store.getWallet(u.id)]);
        json(res, 200, { currency: CURRENCY, catalog: CATALOG, loggedIn: true, owned, gear: cleanGear(gear, owned), balance: w.balance });
        return true;
      }
      let body; try { body = await readJson(req); } catch { json(res, 400, { error: "body" }); return true; }
      if (buy) {
        const it = itemOf(body?.sku);
        if (!it) { json(res, 400, { error: "sku" }); return true; }
        const r = await store.buyItem({ userId: u.id, sku: it.sku, price: it.price, at: now() });
        if (!r.ok) { json(res, 409, { error: r.reason, balance: r.balance }); return true; }
        json(res, 200, { sku: it.sku, balance: r.balance, owned: await store.getInventory(u.id) });
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
      notify(u.id, gear);
      json(res, 200, { gear });
    } catch (e) { log.error?.("[shop] failed:", e.message); json(res, 502, { error: "store" }); }
    return true;
  }

  return { enabled, handle, gearOf, onGear: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
}
