// 컷 상점 창: 펫 · 만화 효과 · 착용 장식을 컷으로 사고, 가진 것을 쓰거나 벗는다
// 상품 · 가격 · 가진 것 · 쓰는 것은 모두 서버(/api/shop)가 알려 준 값만 쓴다. 엔진과는 넘겨받은 함수로만 이어진다.
import type { GearState } from "../scene/Gear";

type Item = { sku: string; slot: keyof GearState; name: string; price: number };
type Deps = {
  showToast: (h: string, p: string, ms?: number) => void;
  requireLogin: (reason: string) => boolean;
  showCuts: (n: number) => void;
  setGear: (g: GearState) => void;
  onOpen: () => void;    // 커서 풀기
  onClose: () => void;   // 커서 되돌리기
};

const TABS: [string, string, (it: Item) => boolean][] = [
  ["pet", "펫", (it) => it.slot === "pet"],
  ["fx", "만화 효과", (it) => it.slot === "fx"],
  ["wear", "착용", (it) => it.slot !== "pet" && it.slot !== "fx"],
];
const TIP: Record<string, string> = {
  pet_cat: "새침하게 꼬리를 세우고 따라와요.", pet_panda: "통통통 굴러오듯 따라와요.", pet_fox: "풍성한 꼬리를 흔들며 따라와요.",
  fx_bubble: "머리 위에 말풍선이 둥실 떠요.", fx_bang: "머리 위에 느낌표가 번쩍!", fx_sparkle: "머리 위에서 반짝이가 빙글 돌아요.",
  head_gradcap: "수료를 꿈꾸는 학사모예요.", neck_idcard: "출근한 느낌이 나는 사원증이에요.", held_manuscript: "막 그린 네컷 원고를 들고 다녀요.",
};
const S = `fill="none" stroke="#111118" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
const ICON: Record<string, string> = {
  pet_cat: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 17 8 6l8 5h8l8-5-1 11a12 11 0 1 1-22 0Z" fill="#fff" ${S.replace('fill="none" ', "")}/><circle cx="15.5" cy="20" r="1.7" fill="#111118"/><circle cx="24.5" cy="20" r="1.7" fill="#111118"/><path d="M18 25h4" ${S}/></svg>`,
  pet_panda: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="10" cy="10" r="5" fill="#111118"/><circle cx="30" cy="10" r="5" fill="#111118"/><circle cx="20" cy="21" r="13" fill="#fff" stroke="#111118" stroke-width="2.2"/><ellipse cx="14.5" cy="20" rx="3.2" ry="4.2" fill="#111118"/><ellipse cx="25.5" cy="20" rx="3.2" ry="4.2" fill="#111118"/><circle cx="20" cy="26" r="1.6" fill="#111118"/></svg>`,
  pet_fox: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 6l9 6h8l9-6-2 13-11 14L9 19Z" fill="#FFB37A" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 22l6 11 6-11-6 3Z" fill="#fff"/><circle cx="15" cy="18" r="1.7" fill="#111118"/><circle cx="25" cy="18" r="1.7" fill="#111118"/><circle cx="20" cy="31" r="1.6" fill="#111118"/></svg>`,
  fx_bubble: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 7c8 0 14 5 14 11s-6 11-14 11c-2 0-4 0-5-1l-7 4 2-7c-3-2-4-4-4-7 0-6 6-11 14-11Z" fill="#fff" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="14" cy="18" r="1.8" fill="#111118"/><circle cx="20" cy="18" r="1.8" fill="#111118"/><circle cx="26" cy="18" r="1.8" fill="#111118"/></svg>`,
  fx_bang: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M16 6h8l-2 18h-4Z" fill="#FFD97A" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="20" cy="31" r="3.4" fill="#FFD97A" stroke="#111118" stroke-width="2.2"/></svg>`,
  fx_sparkle: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M17 6l3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#FFD97A" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M30 22l1.6 4.4L36 28l-4.4 1.6L30 34l-1.6-4.4L24 28l4.4-1.6Z" fill="#B9A6EC" stroke="#111118" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  head_gradcap: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 16l17-8 17 8-17 8Z" fill="#2B2140" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M10 20v7c3 3 17 3 20 0v-7" fill="#2B2140" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M34 17v10" stroke="#FFD97A" stroke-width="2.4" stroke-linecap="round"/><circle cx="34" cy="29" r="2.2" fill="#FFD97A" stroke="#111118" stroke-width="1.4"/></svg>`,
  neck_idcard: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M13 3l7 11 7-11" ${S.replace("#111118", "#8B6FE8")}/><rect x="9" y="13" width="22" height="23" rx="3" fill="#fff" stroke="#111118" stroke-width="2.2"/><rect x="9" y="13" width="22" height="6" rx="3" fill="#8B6FE8"/><circle cx="20" cy="25" r="3.2" fill="#111118"/><path d="M14 32h12" ${S}/></svg>`,
  held_manuscript: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="4" width="26" height="32" rx="2.5" fill="#FFFDF7" stroke="#111118" stroke-width="2.2"/><rect x="10" y="7" width="9" height="12" fill="#D9CEFC"/><rect x="21" y="21" width="9" height="12" fill="#D9CEFC"/><path d="M20 6v28M9 20h22" ${S}/></svg>`,
};
const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function createShopUi(d: Deps) {
  const $ = (id: string) => document.getElementById(id)!;
  const modal = $("shop"), list = $("shopList"), tabs = $("shopTabs"), cuts = $("shopCuts"), entry = $("giftsShop");
  let available = false, loggedIn = false, catalog: Item[] = [], owned: string[] = [], gear: GearState = {}, balance = 0, tab = "pet", busy = false;

  function render() {
    cuts.innerHTML = loggedIn ? `내 컷 <b>${balance.toLocaleString("ko-KR")}</b>컷` : "하루들과 연동하면 컷을 모아 살 수 있어요";
    tabs.innerHTML = TABS.map(([k, label]) => `<button type="button" role="tab" class="dbtn${k === tab ? " on" : ""}" aria-selected="${k === tab}" data-tab="${k}">${label}</button>`).join("");
    const pick = TABS.find(([k]) => k === tab)![2];
    list.innerHTML = catalog.filter(pick).map((it) => {
      const got = owned.includes(it.sku), on = gear[it.slot] === it.sku, pet = it.slot === "pet";
      const act = !got ? `<button type="button" class="btn" data-buy="${esc(it.sku)}"${busy ? " disabled" : ""}>${it.price}컷으로 ${pet ? "데려오기" : "사기"}</button>`
        : on ? `<button type="button" class="btn ghost" data-wear="${esc(it.slot)}" data-sku=""${busy ? " disabled" : ""}>${pet ? "쉬게 하기" : "벗기"}</button>`
        : `<button type="button" class="btn" data-wear="${esc(it.slot)}" data-sku="${esc(it.sku)}"${busy ? " disabled" : ""}>${pet ? "데리고 다니기" : "쓰기"}</button>`;
      return `<li class="${got ? "got" : ""}"><span class="gicon">${ICON[it.sku] || ""}</span><div><b>${esc(it.name)}<em>${on ? (pet ? "함께 있어요" : "쓰는 중") : got ? "가졌어요 ✓" : `${it.price}컷`}</em></b><p>${esc(TIP[it.sku] || "")}</p><div class="gacts">${act}</div></div></li>`;
    }).join("");
  }

  function apply(data: any) {
    if (Array.isArray(data.catalog)) catalog = data.catalog;
    if (Array.isArray(data.owned)) owned = data.owned;
    if (data.gear && typeof data.gear === "object") { gear = data.gear; d.setGear(gear); }
    if (typeof data.balance === "number") { balance = data.balance; d.showCuts(balance); }
  }

  // 들어올 때 한 번: 상점이 켜져 있는지, (연동했으면) 가진 것 · 쓰는 것 · 잔액
  async function load() {
    try {
      const r = await fetch("/api/shop", { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      available = true; loggedIn = !!data.loggedIn; apply(data);
      entry.hidden = false;
      if (!modal.hidden) render();
    } catch { }
  }

  async function send(method: string, path: string, body: unknown) {
    const r = await fetch(path, { method, credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  }

  async function buy(sku: string) {
    const it = catalog.find((c) => c.sku === sku); if (!it || busy) return;
    if (!d.requireLogin("컷은 하루들과 연동한 크루만 모으고 쓸 수 있어요.")) { close(); return; }
    busy = true; render();
    try {
      const r = await send("POST", "/api/shop/buy", { sku });
      if (r.ok) {
        apply(r.data);
        // 산 것은 바로 써 본다
        const w = await send("PUT", "/api/me/gear", { slot: it.slot, sku });
        if (w.ok) apply(w.data);
        d.showToast(it.slot === "pet" ? `${it.name}를 데려왔어요` : `${it.name}를 샀어요`, it.slot === "pet" ? "이제 어디든 따라다녀요. 다른 크루에게도 보여요." : "바로 써 봤어요. 상점에서 언제든 벗을 수 있어요.", 3600);
      } else if (r.data.error === "insufficient") { apply(r.data); d.showToast("컷이 모자라요", "하루들 피드에 네컷만화를 올리면 하루 한 번 받아요.", 3600); }
      else if (r.data.error === "owned") { await load(); d.showToast("이미 가지고 있어요", "", 2200); }
      else if (r.status === 401) { loggedIn = false; d.showToast("연동이 끊겼어요", "설정에서 하루들과 다시 연동해 주세요.", 3600); }
      else d.showToast("지금은 살 수 없어요", "잠시 뒤에 다시 시도해 주세요.", 3200);
    } catch { d.showToast("지금은 살 수 없어요", "잠시 뒤에 다시 시도해 주세요.", 3200); }
    busy = false; render();
  }

  async function wear(slot: string, sku: string | null) {
    if (busy) return;
    busy = true; render();
    try {
      const r = await send("PUT", "/api/me/gear", { slot, sku });
      if (r.ok) apply(r.data); else d.showToast("바꾸지 못했어요", "잠시 뒤에 다시 시도해 주세요.", 3200);
    } catch { d.showToast("바꾸지 못했어요", "잠시 뒤에 다시 시도해 주세요.", 3200); }
    busy = false; render();
  }

  function open() {
    if (!available) { d.showToast("지금은 상점을 쓸 수 없어요", "", 2400); return; }
    d.onOpen(); render(); modal.hidden = false; $("shopClose").focus();
    void load();   // 열 때마다 잔액 · 가진 것을 다시 받는다
  }
  function close() { modal.hidden = true; d.onClose(); }

  $("shopClose").onclick = close;
  entry.onclick = open;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) return close();
    const b = (e.target as HTMLElement).closest("button"); if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; render(); }
    else if (b.dataset.buy) void buy(b.dataset.buy);
    else if (b.dataset.wear) void wear(b.dataset.wear, b.dataset.sku || null);
  });

  return { open, close, load, isOpen: () => !modal.hidden, isAvailable: () => available };
}
