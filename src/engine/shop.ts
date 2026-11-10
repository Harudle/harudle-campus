// 컷 상점 창: 펫 · 만화 효과 · 착용 장식을 컷으로 사고, 가진 것을 쓰거나 벗는다
// 상품 · 가격 · 가진 것 · 쓰는 것은 모두 서버(/api/shop)가 알려 준 값만 쓴다. 엔진과는 넘겨받은 함수로만 이어진다.
// 컷이 모자란 상품을 누르면 거절하지 않고 "컷 모으는 법" 카드로 하루들 서비스에 네컷만화를 올리러 가게 안내한다.
import type { GearState } from "../scene/Gear";

type Item = { sku: string; slot: keyof GearState; name: string; price: number; rare?: boolean };
type Deps = {
  showToast: (h: string, p: string, ms?: number) => void;
  requireLogin: (reason: string) => boolean;
  showCuts: (n: number) => void;
  setGear: (g: GearState) => void;
  preview: (slot: string, sku: string) => void;   // 잠깐 입어 보기(내 화면에서만)
  openHarudle: () => void;                        // 하루들 서비스를 새 탭으로
  onOpen: () => void;    // 커서 풀기
  onClose: () => void;   // 커서 되돌리기
};

const TABS: [string, string, (it: Item) => boolean][] = [
  ["pet", "펫", (it) => it.slot === "pet"],
  ["fx", "만화 효과", (it) => it.slot === "fx"],
  ["wear", "착용", (it) => it.slot !== "pet" && it.slot !== "fx"],
];
const TIP: Record<string, string> = {
  pet_cat: "새침하게 꼬리를 세우고 따라와요. 멈추면 옆에 엎드려요.", pet_panda: "대나무 잎을 물고 통통통 따라와요.", pet_fox: "풍성한 꼬리를 흔들며 따라와요.",
  pet_zebra: "또각또각, 줄무늬를 뽐내며 따라와요.", pet_emu: "긴 목을 까딱이며 성큼성큼 따라와요.",
  pet_tiger: "이마에 王을 새긴 커다란 호랑이예요. 듬직하게 곁을 지켜요.", pet_bear: "묵직한 발걸음의 커다란 불곰이에요. 멈추면 옆에 털썩 엎드려요.",
  fx_bubble: "머리 위 말풍선에서 점이 톡톡 튀어요.", fx_bang: "머리 위에서 느낌표가 번쩍!", fx_sparkle: "반짝이가 머리 위를 빙글 돌아요.",
  fx_heart: "머리 위에서 하트가 두근두근 뛰어요.", fx_sweat: "만화처럼 땀방울이 또르르 흘러요.",
  head_gradcap: "수료를 꿈꾸는 학사모예요. 술이 달랑거려요.", head_headband: "이번엔 꼭! 합격 머리띠예요.",
  neck_idcard: "출근한 느낌이 나는 하루들 사원증이에요.", held_manuscript: "막 그린 네컷 원고를 들고 다녀요.", held_coffee: "오늘도 아아 한 잔 들고 출근해요.",
};
const S = `fill="none" stroke="#111118" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
const ICON: Record<string, string> = {
  pet_cat: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 17 8 6l8 5h8l8-5-1 11a12 11 0 1 1-22 0Z" fill="#fff" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="15.5" cy="20" r="1.7" fill="#111118"/><circle cx="24.5" cy="20" r="1.7" fill="#111118"/><path d="M18 25h4" ${S}/></svg>`,
  pet_panda: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="10" cy="10" r="5" fill="#111118"/><circle cx="30" cy="10" r="5" fill="#111118"/><circle cx="20" cy="21" r="13" fill="#fff" stroke="#111118" stroke-width="2.2"/><ellipse cx="14.5" cy="20" rx="3.2" ry="4.2" fill="#111118"/><ellipse cx="25.5" cy="20" rx="3.2" ry="4.2" fill="#111118"/><circle cx="20" cy="26" r="1.6" fill="#111118"/></svg>`,
  pet_fox: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 6l9 6h8l9-6-2 13-11 14L9 19Z" fill="#FFB37A" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 22l6 11 6-11-6 3Z" fill="#fff"/><circle cx="15" cy="18" r="1.7" fill="#111118"/><circle cx="25" cy="18" r="1.7" fill="#111118"/><circle cx="20" cy="31" r="1.6" fill="#111118"/></svg>`,
  pet_zebra: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M13 5l3 6M27 5l-3 6" ${S}/><path d="M12 12c0-3 16-3 16 0l1 12c0 6-4 10-9 10s-9-4-9-10Z" fill="#fff" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M13 15h5M22 15h5M12.500 20h4M23.500 20h4" ${S}/><path d="M14 28c2 4 10 4 12 0v3c-2 4-10 4-12 0Z" fill="#111118"/><circle cx="16" cy="24" r="1.5" fill="#111118"/><circle cx="24" cy="24" r="1.5" fill="#111118"/></svg>`,
  pet_emu: `<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="17" cy="26" rx="10" ry="8" fill="#D9CEFC" stroke="#111118" stroke-width="2.2"/><path d="M23 22V10" stroke="#111118" stroke-width="5" stroke-linecap="round"/><path d="M23 22V10" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="8" r="4.2" fill="#fff" stroke="#111118" stroke-width="2.2"/><path d="M28 8l5 1.500-5 1.500Z" fill="#FFD97A" stroke="#111118" stroke-width="1.6" stroke-linejoin="round"/><circle cx="24.500" cy="7.500" r="1.100" fill="#111118"/><path d="M14 33v4M20 33v4" ${S}/></svg>`,
  pet_tiger: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="9" cy="9" r="5" fill="#FF9F45" stroke="#111118" stroke-width="2.2"/><circle cx="31" cy="9" r="5" fill="#FF9F45" stroke="#111118" stroke-width="2.2"/><circle cx="20" cy="21" r="14" fill="#FF9F45" stroke="#111118" stroke-width="2.2"/><ellipse cx="20" cy="27" rx="7" ry="5" fill="#fff"/><path d="M16 9h8M17.500 12h5M20 8v6M7 19l4 1.500M7 24l4-.500M33 19l-4 1.500M33 24l-4-.500" ${S.replace("2.2", "1.9")}/><circle cx="14.500" cy="19.500" r="1.700" fill="#111118"/><circle cx="25.500" cy="19.500" r="1.700" fill="#111118"/><ellipse cx="20" cy="25" rx="2.200" ry="1.500" fill="#FFA9BD" stroke="#111118" stroke-width="1"/></svg>`,
  pet_bear: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="9" cy="10" r="5.500" fill="#9A6A45" stroke="#111118" stroke-width="2.2"/><circle cx="31" cy="10" r="5.500" fill="#9A6A45" stroke="#111118" stroke-width="2.2"/><circle cx="20" cy="21" r="14" fill="#9A6A45" stroke="#111118" stroke-width="2.2"/><ellipse cx="20" cy="26" rx="7" ry="5.500" fill="#E8C9A0"/><circle cx="14.500" cy="19" r="1.700" fill="#111118"/><circle cx="25.500" cy="19" r="1.700" fill="#111118"/><ellipse cx="20" cy="24" rx="2.600" ry="1.800" fill="#111118"/><path d="M17.500 28c1.500 1.500 3.500 1.500 5 0" ${S.replace("2.2", "1.6")}/></svg>`,
  fx_bubble: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 7c8 0 14 5 14 11s-6 11-14 11c-2 0-4 0-5-1l-7 4 2-7c-3-2-4-4-4-7 0-6 6-11 14-11Z" fill="#fff" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="14" cy="18" r="1.8" fill="#111118"/><circle cx="20" cy="18" r="1.8" fill="#111118"/><circle cx="26" cy="18" r="1.8" fill="#111118"/></svg>`,
  fx_bang: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M16 6h8l-2 18h-4Z" fill="#FFD97A" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="20" cy="31" r="3.4" fill="#FFD97A" stroke="#111118" stroke-width="2.2"/></svg>`,
  fx_sparkle: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M17 6l3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#FFD97A" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M30 22l1.6 4.4L36 28l-4.400 1.600L30 34l-1.600-4.400L24 28l4.400-1.600Z" fill="#B9A6EC" stroke="#111118" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  fx_heart: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 33C9 25 5 19 5 13.500 5 9 8.500 6 12.500 6c3 0 5.500 1.500 7.500 4.500C22 7.500 24.500 6 27.500 6 31.500 6 35 9 35 13.500 35 19 31 25 20 33Z" fill="#FFA9BD" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  fx_sweat: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M17 5c5 8 9 12 9 18a9 9 0 0 1-18 0c0-6 4-10 9-18Z" fill="#8FD3FF" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M31 20c2 3.500 4 5.500 4 8a4 4 0 0 1-8 0c0-2.500 2-4.500 4-8Z" fill="#8FD3FF" stroke="#111118" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  head_gradcap: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 16l17-8 17 8-17 8Z" fill="#2B2140" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M10 20v7c3 3 17 3 20 0v-7" fill="#2B2140" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M34 17v10" stroke="#FFD97A" stroke-width="2.4" stroke-linecap="round"/><circle cx="34" cy="29" r="2.2" fill="#FFD97A" stroke="#111118" stroke-width="1.4"/></svg>`,
  head_headband: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M30 20l7-5M30 22l6 4" ${S}/><rect x="3" y="14" width="29" height="12" rx="3" fill="#fff" stroke="#111118" stroke-width="2.2"/><circle cx="8.500" cy="20" r="2.600" fill="#E5484D"/><circle cx="26.500" cy="20" r="2.600" fill="#E5484D"/><path d="M14 17.500h7M17.500 17.500v5.500M14 23h7" ${S.replace('2.2', '1.8')}/></svg>`,
  neck_idcard: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M13 3l7 11 7-11" fill="none" stroke="#8B6FE8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="13" width="22" height="23" rx="3" fill="#fff" stroke="#111118" stroke-width="2.2"/><rect x="9" y="13" width="22" height="6" rx="3" fill="#8B6FE8"/><circle cx="20" cy="25" r="3.2" fill="#111118"/><path d="M14 32h12" ${S}/></svg>`,
  held_manuscript: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="4" width="26" height="32" rx="2.500" fill="#FFFDF7" stroke="#111118" stroke-width="2.2"/><rect x="10" y="7" width="9" height="12" fill="#D9CEFC"/><rect x="21" y="21" width="9" height="12" fill="#D9CEFC"/><path d="M20 6v28M9 20h22" ${S}/></svg>`,
  held_coffee: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M23 3l-2 8" stroke="#B9A6EC" stroke-width="2.6" stroke-linecap="round"/><path d="M11 13h18l-2.500 22h-13Z" fill="#7A5236" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><rect x="9" y="9.500" width="22" height="4.500" rx="2" fill="#fff" stroke="#111118" stroke-width="2.2"/><path d="M12.300 21h15.400l-.800 7H13.100Z" fill="#FFFDF7"/></svg>`,
};
const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function createShopUi(d: Deps) {
  const $ = (id: string) => document.getElementById(id)!;
  const modal = $("shop"), list = $("shopList"), tabs = $("shopTabs"), cuts = $("shopCuts"), entry = $("giftsShop"), earnBox = $("shopEarn");
  let available = false, loggedIn = false, catalog: Item[] = [], owned: string[] = [], gear: GearState = {}, balance = 0, tab = "pet", busy = false;
  let earn = { reward: 0, today: false }, short = 0, wentOut = false;   // short: 방금 누른 상품에 모자란 컷(0이면 안내 카드를 그냥 "모으는 법"으로)

  function renderEarn(show: boolean) {
    earnBox.hidden = !show; if (!show) return;
    const r = earn.reward;
    const how = !loggedIn ? "하루들과 연동하고 피드에 네컷만화를 올리면 컷을 받아요."
      : earn.today ? `오늘 컷은 이미 받았어요. 내일 하루들 피드에 네컷만화를 올리면 ${r}컷을 또 받아요.`
      : `하루들에서 네컷만화를 만들어 피드에 올리고 돌아오면 ${r}컷을 바로 받아요. 하루에 한 번이에요.`;
    earnBox.innerHTML = `<p><b>${short > 0 ? `${short}컷이 모자라요` : "컷 모으는 법"}</b></p><p>${esc(how)}</p><button type="button" class="btn lav" data-earn="go">네컷만화 만들러 가기 ↗</button>`;
  }

  function render() {
    cuts.innerHTML = loggedIn ? `내 컷 <b>${balance.toLocaleString("ko-KR")}</b>컷 <button type="button" class="linkbtn" data-earn="how">모으는 법</button>` : "하루들과 연동하면 컷을 모아 살 수 있어요";
    tabs.innerHTML = TABS.map(([k, label]) => `<button type="button" role="tab" class="dbtn${k === tab ? " on" : ""}" aria-selected="${k === tab}" data-tab="${k}">${label}</button>`).join("");
    const pick = TABS.find(([k]) => k === tab)![2];
    list.innerHTML = catalog.filter(pick).map((it) => {
      const got = owned.includes(it.sku), on = gear[it.slot] === it.sku, pet = it.slot === "pet", lack = loggedIn && !got && balance < it.price, off = busy ? " disabled" : "";
      // 컷이 모자라고 오늘 보상을 아직 안 받았으면: 버튼이 곧 "네컷만화 만들러 가기"다(누르면 하루들 만들기 화면이 열린다)
      const buyLabel = lack && !earn.today ? `네컷만화 만들고 ${pet ? "데려오기" : "사기"} ↗` : `${it.price}컷으로 ${pet ? "데려오기" : "사기"}`;
      const act = !got ? `<button type="button" class="btn${lack ? (earn.today ? " lack" : " lav") : ""}" data-buy="${esc(it.sku)}"${off}>${buyLabel}</button><button type="button" class="btn ghost" data-try="${esc(it.slot)}" data-sku="${esc(it.sku)}"${off}>${pet ? "미리 만나기" : "입어 보기"}</button>`
        : on ? `<button type="button" class="btn ghost" data-wear="${esc(it.slot)}" data-sku=""${off}>${pet ? "쉬게 하기" : "벗기"}</button>`
        : `<button type="button" class="btn" data-wear="${esc(it.slot)}" data-sku="${esc(it.sku)}"${off}>${pet ? "데리고 다니기" : "쓰기"}</button>`;
      return `<li class="${got ? "got" : ""}${it.rare ? " rare" : ""}"><span class="gicon">${ICON[it.sku] || ""}</span><div><b>${esc(it.name)}${it.rare ? `<i class="rare">레어</i>` : ""}<em>${on ? (pet ? "함께 있어요" : "쓰는 중") : got ? "가졌어요 ✓" : lack ? `${it.price - balance}컷 모자라요` : `${it.price}컷`}</em></b><p>${esc(TIP[it.sku] || "")}</p><div class="gacts">${act}</div></div></li>`;
    }).join("");
  }

  function apply(data: any) {
    if (Array.isArray(data.catalog)) catalog = data.catalog;
    if (Array.isArray(data.owned)) owned = data.owned;
    if (data.gear && typeof data.gear === "object") { gear = data.gear; d.setGear(gear); }
    if (typeof data.balance === "number") { balance = data.balance; d.showCuts(balance); }
    if (data.earn && typeof data.earn === "object") earn = { reward: Number(data.earn.reward) || 0, today: !!data.earn.today };
  }

  // 들어올 때 한 번: 상점이 켜져 있는지, (연동했으면) 가진 것 · 쓰는 것 · 잔액
  async function load() {
    try {
      const r = await fetch("/api/shop", { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      available = true; loggedIn = !!data.loggedIn; apply(data);
      entry.hidden = false;
      if (!modal.hidden) { render(); if (!earnBox.hidden) renderEarn(true); }
    } catch { }
  }

  async function send(method: string, path: string, body: unknown) {
    const r = await fetch(path, { method, credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  }

  // 컷이 모자라면: 거절 대신 얼마가 모자란지와 하루들에서 모으는 법을 보여 준다
  function guide(lack: number) { short = Math.max(0, lack); renderEarn(true); earnBox.scrollIntoView({ block: "nearest" }); (earnBox.querySelector("button") as HTMLElement | null)?.focus(); }

  async function buy(sku: string) {
    const it = catalog.find((c) => c.sku === sku); if (!it || busy) return;
    if (!d.requireLogin("컷은 하루들과 연동한 크루만 모으고 쓸 수 있어요.")) { close(); return; }
    if (balance < it.price) { guide(it.price - balance); if (!earn.today) { wentOut = true; d.openHarudle(); } return; }   // 오늘 받을 컷이 남았으면 바로 만들기 화면으로
    busy = true; render();
    try {
      const r = await send("POST", "/api/shop/buy", { sku });
      if (r.ok) {
        apply(r.data); renderEarn(false);
        // 산 것은 바로 써 본다
        const w = await send("PUT", "/api/me/gear", { slot: it.slot, sku });
        if (w.ok) apply(w.data);
        d.showToast(it.slot === "pet" ? `${it.name}를 데려왔어요` : `${it.name}를 샀어요`, it.slot === "pet" ? "이제 어디든 따라다녀요. 다른 크루에게도 보여요." : "바로 써 봤어요. 상점에서 언제든 벗을 수 있어요.", 3600);
      } else if (r.data.error === "insufficient") { apply(r.data); guide(it.price - balance); }
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

  // 사기 전에 잠깐: 창을 닫고 내 캐릭터에 입혀 보여 준다(내 화면에서만, 몇 초 뒤 원래대로)
  function tryOn(slot: string, sku: string) {
    const it = catalog.find((c) => c.sku === sku); if (!it) return;
    close(); d.preview(slot, sku);
    d.showToast(it.slot === "pet" ? `${it.name}를 잠깐 만나 봐요` : `${it.name}를 잠깐 입어 봤어요`, `마음에 들면 컷 상점에서 ${it.price}컷에 ${it.slot === "pet" ? "데려올" : "살"} 수 있어요.`, 5200);
  }

  function open() {
    if (!available) { d.showToast("지금은 상점을 쓸 수 없어요", "", 2400); return; }
    d.onOpen(); short = 0; renderEarn(false); render(); modal.hidden = false; $("shopClose").focus();
    void load();   // 열 때마다 잔액 · 가진 것을 다시 받는다
  }
  function close() { modal.hidden = true; d.onClose(); }

  $("shopClose").onclick = close;
  entry.onclick = open;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) return close();
    const b = (e.target as HTMLElement).closest("button"); if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; render(); }
    else if (b.dataset.earn === "how") { short = 0; renderEarn(!!earnBox.hidden); }
    else if (b.dataset.earn === "go") { wentOut = true; d.openHarudle(); }
    else if (b.dataset.buy) void buy(b.dataset.buy);
    else if (b.dataset.try) tryOn(b.dataset.try, b.dataset.sku || "");
    else if (b.dataset.wear) void wear(b.dataset.wear, b.dataset.sku || null);
  });

  return {
    open, close, load, isOpen: () => !modal.hidden, isAvailable: () => available,
    /** 하루들에 다녀왔는지(한 번 읽으면 지워진다): 돌아오면 엔진이 바로 정산한다 */
    takeWentOut: () => { const v = wentOut; wentOut = false; return v; },
  };
}
