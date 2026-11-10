// 컷 상점 상품. 이름 · 가격은 서버가 정한다(브라우저가 보낸 가격은 쓰지 않는다)
//   slot: 한 번에 하나만 쓰는 자리. pet(따라다니는 펫) · fx(머리 위 만화 효과) · head · neck · held(외형 위에 덧씌우는 장식)
//   sku는 한 번 정하면 바꾸지 않는다(보유 기록 · 거래 기록이 이것으로 남는다). 그리는 코드는 src/scene/Pets.tsx · Gear.tsx
export const SLOTS = ["pet", "fx", "head", "neck", "held"];
export const CATALOG = [
  { sku: "pet_cat", slot: "pet", name: "고양이", price: 10 },
  { sku: "pet_panda", slot: "pet", name: "판다", price: 10 },
  { sku: "pet_fox", slot: "pet", name: "여우", price: 10 },
  { sku: "fx_bubble", slot: "fx", name: "말풍선", price: 3 },
  { sku: "fx_bang", slot: "fx", name: "느낌표", price: 3 },
  { sku: "fx_sparkle", slot: "fx", name: "반짝 효과선", price: 3 },
  { sku: "head_gradcap", slot: "head", name: "학사모", price: 4 },
  { sku: "neck_idcard", slot: "neck", name: "사원증", price: 4 },
  { sku: "held_manuscript", slot: "held", name: "네컷 원고", price: 4 },
];
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
