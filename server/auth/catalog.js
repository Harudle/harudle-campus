// 컷 상점 상품. 이름 · 가격은 서버가 정한다(브라우저가 보낸 가격은 쓰지 않는다)
//   slot: 한 번에 하나만 쓰는 자리. pet(따라다니는 펫) · fx(머리 위 만화 효과) · head · neck · held(외형 위에 덧씌우는 장식)
//   emote: 감정표현(쓰는 자리가 아니라 가지면 G 감정표현 휠에서 고른다. SLOTS에 없어서 "쓰기"는 안 된다)
//   sku는 한 번 정하면 바꾸지 않는다(보유 기록 · 거래 기록이 이것으로 남는다). 그리는 코드는 src/scene/Pets.tsx · Gear.tsx
export const SLOTS = ["pet", "fx", "head", "neck", "held"];
export const CATALOG = [
  { sku: "pet_cat", slot: "pet", name: "고양이", price: 10 },
  { sku: "pet_panda", slot: "pet", name: "판다", price: 10 },
  { sku: "pet_fox", slot: "pet", name: "여우", price: 10 },
  { sku: "pet_zebra", slot: "pet", name: "얼룩말", price: 10 },
  { sku: "pet_emu", slot: "pet", name: "에뮤", price: 10 },
  { sku: "pet_tiger", slot: "pet", name: "호랑이", price: 30, rare: true },   // 레어: 다른 펫보다 훨씬 크다
  { sku: "pet_bear", slot: "pet", name: "불곰", price: 30, rare: true },
  { sku: "fx_bubble", slot: "fx", name: "말풍선", price: 3 },
  { sku: "fx_bang", slot: "fx", name: "느낌표", price: 3 },
  { sku: "fx_sparkle", slot: "fx", name: "반짝 효과선", price: 3 },
  { sku: "fx_heart", slot: "fx", name: "두근 하트", price: 3 },
  { sku: "fx_sweat", slot: "fx", name: "땀방울", price: 3 },
  { sku: "head_gradcap", slot: "head", name: "학사모", price: 4 },
  { sku: "head_headband", slot: "head", name: "합격 머리띠", price: 4 },
  { sku: "neck_idcard", slot: "neck", name: "사원증", price: 4 },
  { sku: "held_manuscript", slot: "held", name: "네컷 원고", price: 4 },
  { sku: "held_coffee", slot: "held", name: "아아 한 잔", price: 4 },
  { sku: "emote_beanbag", slot: "emote", name: "개인 빈백에서 잠자기", price: 15 },
  { sku: "emote_guitar", slot: "emote", name: "기타 연주", price: 15 },
  { sku: "emote_lp", slot: "emote", name: "LP 감상", price: 15 },
  { sku: "emote_club", slot: "emote", name: "클럽 파티", price: 15 },
];
// 감정표현: 화면 · 위치 정보(em)에서 쓰는 짧은 이름 → 상품. 가진 사람의 em만 서버가 받아 준다(app.js)
export const EMOTES = { bag: "emote_beanbag", guitar: "emote_guitar", lp: "emote_lp", club: "emote_club" };
const BY_SKU = new Map(CATALOG.map((it) => [it.sku, it]));
export const itemOf = (sku) => (typeof sku === "string" ? BY_SKU.get(sku) || null : null);

// 저장된 착용 상태에서 아는 슬롯 · 아는 상품 · (owned가 있으면) 가진 것만 남긴다
export function cleanGear(gear, owned) {
  const out = {};
  if (!gear || typeof gear !== "object") return out;
  for (const slot of SLOTS) {
    const it = itemOf(gear[slot]);
    if (it && it.slot === slot && (!owned || owned.includes(it.sku))) out[slot] = it.sku;
  }
  return out;
}
