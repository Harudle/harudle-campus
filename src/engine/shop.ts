// 컷 상점 창: 펫 · 만화 효과 · 착용 장식 · 감정표현을 컷으로 사고, 가진 것을 쓰거나 벗는다(감정표현은 쓰는 게 아니라 G 감정표현 휠에서 고른다)
// 상품 · 가격 · 가진 것 · 쓰는 것은 모두 서버(/api/shop)가 알려 준 값만 쓴다. 엔진과는 넘겨받은 함수로만 이어진다.
// 컷이 모자란 상품을 누르면 거절하지 않고 "컷 모으는 법" 카드로 하루들 서비스에 네컷만화를 올리러 가게 안내한다.
import type { GearState } from "../scene/Gear";
import { CATALOG as REAL_CATALOG, EMOTES } from "../../server/auth/catalog.js";

// 개발용 가짜 상점(vite 개발 서버에서만, ?nomock이면 끈다): 서버 상점이 꺼져 있거나 하루들과 연동하지 않았으면
// 서버 대신 이 브라우저에 가진 것 · 쓰는 것 · 컷 999를 두고 사고 입어 본다. 내 화면에서만 바뀌고 서버 · DB는 건드리지 않는다
const MOCK_SHOP = import.meta.env.DEV && !new URLSearchParams(location.search).has("nomock"), MOCK_KEY = "ww.mockShop";
type MockState = { owned: string[]; gear: GearState; balance: number };
const mockRead = (): MockState => { try { const v = JSON.parse(localStorage.getItem(MOCK_KEY) || "null"); if (v && Array.isArray(v.owned)) return v; } catch { } return { owned: [], gear: {}, balance: 999 }; };
const mockSave = (v: MockState) => { try { localStorage.setItem(MOCK_KEY, JSON.stringify(v)); } catch { } };

type Item = { sku: string; slot: keyof GearState | "emote"; name: string; price: number; rare?: boolean; ultra?: boolean };
type Deps = {
  showToast: (h: string, p: string, ms?: number) => void;
  requireLogin: (reason: string) => boolean;
  showCuts: (n: number) => void;
  setGear: (g: GearState) => void;
  preview: (slot: string, sku: string, frame?: string) => void;   // 잠깐 입어 보기(내 화면에서만)
  openHarudle: () => void;                        // 하루들 서비스를 새 탭으로
  setEmotes: (ids: string[]) => void;   // 가짜 상점: 가진 감정표현(G 휠). 개발 서버는 서버가 다 열어 주니 이것으로 덮는다
  onOpen: () => void;    // 커서 풀기
  onClose: () => void;   // 커서 되돌리기
};

const TABS: [string, string, (it: Item) => boolean][] = [
  ["pet", "펫", (it) => it.slot === "pet"],
  ["fx", "만화 효과", (it) => it.slot === "fx"],
  ["wear", "착용", (it) => it.slot !== "pet" && it.slot !== "fx" && it.slot !== "emote"],
  ["emote", "감정표현", (it) => it.slot === "emote"],
];
const TIP: Record<string, string> = {
  pet_cat: "새침하게 꼬리를 세우고 따라와요. 멈추면 옆에 엎드려요.", pet_panda: "대나무 잎을 물고 통통통 따라와요.", pet_fox: "풍성한 꼬리를 흔들며 따라와요.",
  pet_zebra: "또각또각, 줄무늬를 뽐내며 따라와요.", pet_emu: "긴 목을 까딱이며 성큼성큼 따라와요.",
  pet_tiger: "이마에 王을 새긴 커다란 호랑이예요. 듬직하게 곁을 지켜요.", pet_bear: "묵직한 발걸음의 커다란 불곰이에요. 멈추면 옆에 털썩 엎드려요.",
  fx_bubble: "머리 위 말풍선에서 점이 톡톡 튀어요.", fx_bang: "머리 위에서 느낌표가 번쩍!", fx_sparkle: "반짝이가 머리 위를 빙글 돌아요.",
  fx_heart: "머리 위에서 하트가 두근두근 뛰어요.", fx_sweat: "만화처럼 땀방울이 또르르 흘러요.",
  head_gradcap: "수료를 꿈꾸는 학사모예요. 술이 달랑거려요.", head_headband: "이번엔 꼭! 합격 머리띠예요.",
  emote_beanbag: "어디서든 폭신한 내 빈백을 펼치고 누워 쿨쿨 자요. G를 꾹 눌러 골라요.",
  emote_club: "발밑에 반짝이는 LED 원판이 깔리고 머리 위로 미러볼이 떠올라요. 그 위에서 미친 듯이 춤춰요. G를 꾹 눌러 골라요.",
  emote_lp: "내 앞에 턴테이블을 놓고 방석에 앉아, 헤드셋을 꽂고 LP를 들으며 고개를 까딱여요. G를 꾹 눌러 골라요.",
  emote_guitar: "통기타를 메고 줄을 튕기며 박자에 맞춰 몸을 흔들어요. G를 꾹 눌러 골라요.",
  pet_duck: "헤드셋을 쓴 고무 오리예요. 막힐 땐 말을 걸어 보세요. 뒤뚱뒤뚱 따라와요.", pet_capybara: "머리에 귤을 얹고 느긋하게 따라와요. 멈추면 식빵처럼 엎드려요.", pet_penguin: "날개를 파닥이며 뒤뚱뒤뚱 따라와요.",
  pet_dragon: "뿔과 볏을 세우고 박쥐 날개를 저으며 떠서 따라오는 커다란 용이에요. 콧김이 모락모락, 앉히면 곁에 내려앉아요.",
  pet_eagle: "하늘을 활공하며 따라오고, 달리면 옆에서 나란히 날아요. 멈추면 내 어깨에 내려앉고, 오래 서 있으면 머리 위를 빙글 돌아요.",
  fx_bulb: "번뜩! 좋은 생각이 난 것처럼 전구가 켜져요.", fx_zzz: "Zzz가 머리 위로 솔솔 떠올라요.", fx_question: "물음표가 갸우뚱갸우뚱 흔들려요.", fx_note: "음표가 박자에 맞춰 통통 튀어요.",
  head_beret: "만화가처럼 비스듬히 눌러쓰는 베레모예요.", head_crown: "보석이 반짝이는 금빛 왕관이에요.",
  neck_scarf: "끝자락이 살랑이는 라벤더 목도리예요.", neck_camera: "오늘의 한 컷을 찍으려고 목에 건 카메라예요. 가끔 플래시가 터져요.",
  held_pen: "펜촉에 잉크가 맺힌 만화 펜이에요.", held_laptop: "하루들 스티커를 붙인 노트북을 옆구리에 껴요.", held_bungeoppang: "김이 모락모락 나는 붕어빵 한 봉지예요.",
  held_myframe: "하루들에 올린 내 네컷만화가 액자에 걸려요. 다른 크루가 나를 누르면 크게 볼 수 있어요.",
  neck_idcard: "출근한 느낌이 나는 하루들 사원증이에요.", held_manuscript: "막 그린 네컷 원고를 들고 다녀요.", held_coffee: "오늘도 아아 한 잔 들고 출근해요.",
};
const S = `fill="none" stroke="#111118" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
const ICON: Record<string, string> = {
  pet_cat: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 17 8 6l8 5h8l8-5-1 11a12 11 0 1 1-22 0Z" fill="#fff" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="15.5" cy="20" r="1.7" fill="#111118"/><circle cx="24.5" cy="20" r="1.7" fill="#111118"/><path d="M18 25h4" ${S}/></svg>`,
  pet_panda: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="10" cy="10" r="5" fill="#111118"/><circle cx="30" cy="10" r="5" fill="#111118"/><circle cx="20" cy="21" r="13" fill="#fff" stroke="#111118" stroke-width="2.2"/><ellipse cx="14.5" cy="20" rx="3.2" ry="4.2" fill="#111118"/><ellipse cx="25.5" cy="20" rx="3.2" ry="4.2" fill="#111118"/><circle cx="20" cy="26" r="1.6" fill="#111118"/></svg>`,
  pet_fox: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 6l9 6h8l9-6-2 13-11 14L9 19Z" fill="#FFB37A" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 22l6 11 6-11-6 3Z" fill="#fff"/><circle cx="15" cy="18" r="1.7" fill="#111118"/><circle cx="25" cy="18" r="1.7" fill="#111118"/><circle cx="20" cy="31" r="1.6" fill="#111118"/></svg>`,
  pet_zebra: `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><clipPath id="zbHead"><path d="M8 38C8 30 9 22 13 15C15 11 17 9 19 9C24 9 29 15 33 21C36 25 36 30 32 31C29 32 26 30 23 29C21 31 20 34 20 38Z"/></clipPath></defs><path d="M18 9 14 5l.5 5L10 9l1.500 5L7 14l2.500 5L5 20l3 4.500L5 26l3 3.500L6 32l2.500 2V38h3V30c0-6 1.500-11 4.500-15 1-1.500 2-3 3-4.500Z" fill="#111118" stroke="#111118" stroke-width="1.200" stroke-linejoin="round"/><path d="M15 12 16 3l5 7Z" fill="#fff" stroke="#111118" stroke-width="2" stroke-linejoin="round"/><path d="M8 38C8 30 9 22 13 15C15 11 17 9 19 9C24 9 29 15 33 21C36 25 36 30 32 31C29 32 26 30 23 29C21 31 20 34 20 38Z" fill="#fff"/><g clip-path="url(#zbHead)" fill="none" stroke="#111118" stroke-width="2.700" stroke-linecap="round"><path d="M9 31q6 1 12 4M10 25q6 1 12 5M12 19.500q5 1 10 5.500M17 13q2 1 3 3M26 12.500q-1.500 4 .500 8M29.500 15.500q-1.200 3 .500 6"/></g><path d="M30.500 18.500C34 22 36 26 34.500 29.500 33.500 31.500 30 31.500 27 30c2-3.500 3.500-7.500 3.500-11.500Z" fill="#111118"/><path d="M8 38C8 30 9 22 13 15C15 11 17 9 19 9C24 9 29 15 33 21C36 25 36 30 32 31C29 32 26 30 23 29C21 31 20 34 20 38Z" fill="none" stroke="#111118" stroke-width="2.200" stroke-linejoin="round"/><ellipse cx="32.800" cy="25.500" rx="1.300" ry="1.700" fill="#fff"/><circle cx="21.500" cy="16" r="1.800" fill="#111118"/><circle cx="22.100" cy="15.400" r=".55" fill="#fff"/></svg>`,
  pet_emu: `<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="17" cy="26" rx="10" ry="8" fill="#D9CEFC" stroke="#111118" stroke-width="2.2"/><path d="M23 22V10" stroke="#111118" stroke-width="5" stroke-linecap="round"/><path d="M23 22V10" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="8" r="4.2" fill="#fff" stroke="#111118" stroke-width="2.2"/><path d="M28 8l5 1.500-5 1.500Z" fill="#FFD97A" stroke="#111118" stroke-width="1.6" stroke-linejoin="round"/><circle cx="24.500" cy="7.500" r="1.100" fill="#111118"/><path d="M14 33v4M20 33v4" ${S}/></svg>`,
  pet_tiger: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="9" cy="9" r="5" fill="#FF9F45" stroke="#111118" stroke-width="2.2"/><circle cx="31" cy="9" r="5" fill="#FF9F45" stroke="#111118" stroke-width="2.2"/><circle cx="20" cy="21" r="14" fill="#FF9F45" stroke="#111118" stroke-width="2.2"/><ellipse cx="20" cy="27" rx="7" ry="5" fill="#fff"/><path d="M16 9h8M17.500 12h5M20 8v6M7 19l4 1.500M7 24l4-.500M33 19l-4 1.500M33 24l-4-.500" ${S.replace("2.2", "1.9")}/><circle cx="14.500" cy="19.500" r="1.700" fill="#111118"/><circle cx="25.500" cy="19.500" r="1.700" fill="#111118"/><ellipse cx="20" cy="25" rx="2.200" ry="1.500" fill="#FFA9BD" stroke="#111118" stroke-width="1"/></svg>`,
  pet_bear: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="9" cy="10" r="5.500" fill="#9A6A45" stroke="#111118" stroke-width="2.2"/><circle cx="31" cy="10" r="5.500" fill="#9A6A45" stroke="#111118" stroke-width="2.2"/><circle cx="20" cy="21" r="14" fill="#9A6A45" stroke="#111118" stroke-width="2.2"/><ellipse cx="20" cy="26" rx="7" ry="5.500" fill="#E8C9A0"/><circle cx="14.500" cy="19" r="1.700" fill="#111118"/><circle cx="25.500" cy="19" r="1.700" fill="#111118"/><ellipse cx="20" cy="24" rx="2.600" ry="1.800" fill="#111118"/><path d="M17.500 28c1.500 1.500 3.500 1.500 5 0" ${S.replace("2.2", "1.6")}/></svg>`,
  pet_duck: `<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="18" cy="27" rx="13" ry="9" fill="#FFD43B" stroke="#111118" stroke-width="2.2"/><circle cx="25" cy="14" r="8" fill="#FFD43B" stroke="#111118" stroke-width="2.2"/><path d="M31 14l6 1.500-6 3Z" fill="#FF9F45" stroke="#111118" stroke-width="1.8" stroke-linejoin="round"/><circle cx="26" cy="12.500" r="1.500" fill="#111118"/><path d="M5 24l-3-4" ${S}/></svg>`,
  pet_capybara: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="7" r="4" fill="#FF9F45" stroke="#111118" stroke-width="1.8"/><rect x="6" y="11" width="28" height="24" rx="10" fill="#B98A5E" stroke="#111118" stroke-width="2.2"/><rect x="12" y="24" width="16" height="9" rx="4.500" fill="#7A5236"/><path d="M11 19h4M25 19h4" ${S}/><circle cx="17.500" cy="27" r="1" fill="#111118"/><circle cx="22.500" cy="27" r="1" fill="#111118"/></svg>`,
  pet_penguin: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4c8 0 12 7 12 17s-4 15-12 15S8 31 8 21 12 4 20 4Z" fill="#2B2140" stroke="#111118" stroke-width="2.2"/><path d="M20 13c5 0 8 4 8 10s-3 11-8 11-8-5-8-11 3-10 8-10Z" fill="#fff"/><circle cx="16" cy="17" r="1.600" fill="#111118"/><circle cx="24" cy="17" r="1.600" fill="#111118"/><path d="M17.500 20h5L20 24Z" fill="#FFD97A" stroke="#111118" stroke-width="1.400" stroke-linejoin="round"/></svg>`,
  pet_dragon: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M16.500 13 7 1.500l3.500 11ZM21.500 11.500 18.500.5l7 9Z" fill="#FFD97A" stroke="#111118" stroke-width="1.800" stroke-linejoin="round"/><path d="M9 18 2 13l3 8-2 4 6-1Z" fill="#B9A6EC" stroke="#111118" stroke-width="1.800" stroke-linejoin="round"/><path d="M6 38c1-8 2-15 6-20 3-5 8-7 13-6 4 .5 7 3 10 6 2 2 3 4 2 6-1 1.500-3 2-5 1.500l-7-1c-1 3-2 6-5 8-2 2-3 4-3 6Z" fill="#8B6FE8" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M24 22.500l3 2 2-2 2.500 2 2-2.500" fill="none" stroke="#111118" stroke-width="1.400" stroke-linejoin="round"/><path d="M27 24.500l.8 2 1-2M31.500 24l.8 1.800" fill="#fff" stroke="#111118" stroke-width=".8" stroke-linejoin="round"/><path d="M9 30l-3-1M10 25l-3-2M12 20l-3-3" stroke="#FFD97A" stroke-width="2.600" stroke-linecap="round"/><ellipse cx="22" cy="16" rx="3" ry="2.400" fill="#FFD97A" stroke="#111118" stroke-width="1.400"/><path d="M22 14v4" stroke="#111118" stroke-width="1.600" stroke-linecap="round"/><path d="M18.500 13.500l6-1.500" stroke="#111118" stroke-width="2" stroke-linecap="round"/><circle cx="34" cy="19" r="1" fill="#111118"/><path d="M34.500 17.500c.5-2.500-.5-4.500-2-6 3.500.5 6 3 5.500 6 1-.8 1.800-1.800 2-3 .8 3.500-1 6.500-4 7-1.200.2-1.800-.8-1.500-4Z" fill="#FF9F45" stroke="#111118" stroke-width="1.200" stroke-linejoin="round"/><path d="M35.500 17.500c.3-1.300 0-2.300-.5-3.200 1.500.6 2.500 1.800 2.200 3.200Z" fill="#FFD43B"/></svg>`,
  pet_eagle: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 21c4-6 10-8 15-7l-3 6c-4-1-8 0-12 1Z" fill="#6B4428" stroke="#111118" stroke-width="1.800" stroke-linejoin="round"/><path d="M37 21c-4-6-10-8-15-7l3 6c4-1 8 0 12 1Z" fill="#6B4428" stroke="#111118" stroke-width="1.800" stroke-linejoin="round"/><path d="M4 21l-2 3M7 20.500l-1.500 3.500M10 20.200l-1 3.500M36 21l2 3M33 20.500l1.500 3.500M30 20.200l1 3.500" stroke="#111118" stroke-width="1.600" stroke-linecap="round"/><path d="M14 22c0-4 2.500-6 6-6s6 2 6 6c0 5-2 9-6 11-4-2-6-6-6-11Z" fill="#6B4428" stroke="#111118" stroke-width="2" stroke-linejoin="round"/><path d="M16 33l4 5 4-5Z" fill="#fff" stroke="#111118" stroke-width="1.600" stroke-linejoin="round"/><circle cx="20" cy="11" r="7" fill="#fff" stroke="#111118" stroke-width="2.2"/><path d="M20 11.500h5c1.500 0 2.500 1.500 1.500 3l-1.500 2-1-1.500H20Z" fill="#FFD97A" stroke="#111118" stroke-width="1.600" stroke-linejoin="round"/><circle cx="18" cy="9.500" r="1.400" fill="#111118"/><path d="M15.500 7l4 1.300" stroke="#111118" stroke-width="1.800" stroke-linecap="round"/><path d="M33 4l.8 2.200L36 7l-2.200.8L33 10l-.8-2.200L30 7l2.200-.8Z" fill="#FFD43B" stroke="#111118" stroke-width=".9" stroke-linejoin="round"/></svg>`,
  fx_bulb: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 6a10 10 0 0 1 6 18v3H14v-3a10 10 0 0 1 6-18Z" fill="#FFD97A" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><rect x="15" y="27" width="10" height="6" rx="2" fill="#C9CDD4" stroke="#111118" stroke-width="2"/><path d="M5 12l3 2M35 12l-3 2M20 1v2" ${S}/></svg>`,
  fx_zzz: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 22h10L6 34h10" ${S.replace("2.2", "2.6")}/><path d="M19 12h8l-8 10h8" ${S}/><path d="M29 4h6l-6 7h6" ${S.replace("2.2", "1.8")}/></svg>`,
  fx_question: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M12 14c0-5 3.500-8 8-8s8 3 8 7.500c0 6-7 5.500-7 11.500h-3c0-8 6-7.500 6-11.500 0-2.500-1.700-4-4-4s-4 1.500-4 4.500Z" fill="#B9A6EC" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="19.500" cy="32" r="3" fill="#B9A6EC" stroke="#111118" stroke-width="2.2"/></svg>`,
  fx_note: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M15 29V8l17-3v20" ${S}/><path d="M15 14l17-3" ${S}/><ellipse cx="10.500" cy="29.500" rx="5" ry="4" fill="#B9A6EC" stroke="#111118" stroke-width="2.2"/><ellipse cx="27.500" cy="25.500" rx="5" ry="4" fill="#FFA9BD" stroke="#111118" stroke-width="2.2"/></svg>`,
  head_beret: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M22 6v5" ${S}/><path d="M4 24c0-9 8-14 17-14s16 4 16 11c0 5-6 6-11 6Z" fill="#8B6FE8" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M6 27c5 2 14 3 22 0" stroke="#111118" stroke-width="3.400" stroke-linecap="round" fill="none"/></svg>`,
  head_crown: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 31 3 11l9 8 8-12 8 12 9-8-2 20Z" fill="#FFD43B" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="20" cy="25" r="2.600" fill="#E5484D" stroke="#111118" stroke-width="1.200"/><circle cx="11" cy="26" r="1.800" fill="#B9A6EC" stroke="#111118" stroke-width="1"/><circle cx="29" cy="26" r="1.800" fill="#B9A6EC" stroke="#111118" stroke-width="1"/></svg>`,
  neck_scarf: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="8" width="32" height="10" rx="5" fill="#B9A6EC" stroke="#111118" stroke-width="2.2"/><path d="M22 17h10v17H22Z" fill="#B9A6EC" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M22 24h10M22 29h10" stroke="#fff" stroke-width="2.400"/><path d="M24.500 34v3M27 34v3M29.500 34v3" ${S.replace("2.2", "1.6")}/></svg>`,
  neck_camera: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M13 12l2-5h10l2 5" fill="#FFD97A" stroke="#111118" stroke-width="2" stroke-linejoin="round"/><rect x="4" y="12" width="32" height="21" rx="4" fill="#2B2140" stroke="#111118" stroke-width="2.2"/><circle cx="20" cy="22.500" r="7" fill="#C9CDD4" stroke="#111118" stroke-width="2"/><circle cx="20" cy="22.500" r="3.600" fill="#8FD3FF"/><circle cx="31" cy="16.500" r="1.400" fill="#fff"/></svg>`,
  held_pen: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M27 4l9 9-17 17-9-9Z" fill="#8B6FE8" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M10 21l9 9-12 4Z" fill="#C9CDD4" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="5" cy="36" r="1.800" fill="#111118"/></svg>`,
  held_laptop: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="7" width="26" height="19" rx="2.500" fill="#D9CEFC" stroke="#111118" stroke-width="2.2"/><circle cx="20" cy="16.500" r="4.200" fill="#fff" stroke="#111118" stroke-width="1.600"/><path d="M3 31h34l-2 3H5Z" fill="#C9CDD4" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  held_bungeoppang: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M4 20c5-9 15-11 23-5l9-6-2 11 2 11-9-6c-8 6-18 4-23-5Z" fill="#E0A458" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="10.500" cy="18.500" r="1.600" fill="#111118"/><path d="M17 15c2 3 2 7 0 10M22 15c2 3 2 7 0 10" stroke="#9A6A45" stroke-width="1.800" stroke-linecap="round" fill="none"/></svg>`,
  held_myframe: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="5" width="32" height="32" rx="4" fill="#8B6FE8" stroke="#111118" stroke-width="2.2"/><rect x="9" y="10" width="22" height="22" fill="#fff"/><rect x="10.500" y="11.500" width="9" height="9" fill="#D9CEFC"/><rect x="20.500" y="21.500" width="9" height="9" fill="#FFD97A"/><path d="M20 10v22M9 21h22" stroke="#111118" stroke-width="1.600"/><circle cx="20" cy="4" r="2.400" fill="#FFD97A" stroke="#111118" stroke-width="1.400"/></svg>`,
  fx_bubble: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 7c8 0 14 5 14 11s-6 11-14 11c-2 0-4 0-5-1l-7 4 2-7c-3-2-4-4-4-7 0-6 6-11 14-11Z" fill="#fff" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="14" cy="18" r="1.8" fill="#111118"/><circle cx="20" cy="18" r="1.8" fill="#111118"/><circle cx="26" cy="18" r="1.8" fill="#111118"/></svg>`,
  fx_bang: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M16 6h8l-2 18h-4Z" fill="#FFD97A" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="20" cy="31" r="3.4" fill="#FFD97A" stroke="#111118" stroke-width="2.2"/></svg>`,
  fx_sparkle: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M17 6l3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#FFD97A" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M30 22l1.6 4.4L36 28l-4.400 1.600L30 34l-1.600-4.400L24 28l4.400-1.600Z" fill="#B9A6EC" stroke="#111118" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  fx_heart: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 33C9 25 5 19 5 13.500 5 9 8.500 6 12.500 6c3 0 5.500 1.500 7.500 4.500C22 7.500 24.500 6 27.500 6 31.500 6 35 9 35 13.500 35 19 31 25 20 33Z" fill="#FFA9BD" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  fx_sweat: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M17 5c5 8 9 12 9 18a9 9 0 0 1-18 0c0-6 4-10 9-18Z" fill="#8FD3FF" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M31 20c2 3.500 4 5.500 4 8a4 4 0 0 1-8 0c0-2.500 2-4.500 4-8Z" fill="#8FD3FF" stroke="#111118" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  head_gradcap: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M3 16l17-8 17 8-17 8Z" fill="#2B2140" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M10 20v7c3 3 17 3 20 0v-7" fill="#2B2140" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><path d="M34 17v10" stroke="#FFD97A" stroke-width="2.4" stroke-linecap="round"/><circle cx="34" cy="29" r="2.2" fill="#FFD97A" stroke="#111118" stroke-width="1.4"/></svg>`,
  head_headband: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M30 20l7-5M30 22l6 4" ${S}/><rect x="3" y="14" width="29" height="12" rx="3" fill="#fff" stroke="#111118" stroke-width="2.2"/><circle cx="8.500" cy="20" r="2.600" fill="#E5484D"/><circle cx="26.500" cy="20" r="2.600" fill="#E5484D"/><path d="M14 17.500h7M17.500 17.500v5.500M14 23h7" ${S.replace('2.2', '1.8')}/></svg>`,
  neck_idcard: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M13 3l7 11 7-11" fill="none" stroke="#8B6FE8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="13" width="22" height="23" rx="3" fill="#fff" stroke="#111118" stroke-width="2.2"/><rect x="9" y="13" width="22" height="6" rx="3" fill="#8B6FE8"/><circle cx="20" cy="25" r="3.2" fill="#111118"/><path d="M14 32h12" ${S}/></svg>`,
  held_manuscript: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="4" width="26" height="32" rx="2.500" fill="#FFFDF7" stroke="#111118" stroke-width="2.2"/><rect x="10" y="7" width="9" height="12" fill="#D9CEFC"/><rect x="21" y="21" width="9" height="12" fill="#D9CEFC"/><path d="M20 6v28M9 20h22" ${S}/></svg>`,
  emote_beanbag: `<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="27" rx="16" ry="8" fill="#C9B8F0" stroke="#111118" stroke-width="2.2"/><path d="M8 25c0-8 6-12 12-12s10 3 11 8" fill="#B39DDB" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><text x="27" y="12" font-size="9" font-weight="800" fill="#111118">z</text><text x="32" y="7" font-size="7" font-weight="800" fill="#111118">z</text></svg>`,
  emote_club: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2v5" stroke="#111118" stroke-width="2"/><circle cx="20" cy="14" r="8" fill="#D9DCE2" stroke="#111118" stroke-width="2.2"/><path d="M13 12h14M14 17h12M20 6v16M16 7c-2 4-2 10 0 14M24 7c2 4 2 10 0 14" stroke="#9EA3AA" stroke-width="1.2" fill="none"/><ellipse cx="20" cy="33" rx="15" ry="5" fill="#B9A6EC" stroke="#111118" stroke-width="2.2"/><path d="M10 33h4M18 33h4M26 33h4" stroke="#FFD43B" stroke-width="2.4" stroke-linecap="round"/><path d="M8 22l-3 3M32 22l3 3" stroke="#FF8FB1" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  emote_lp: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="12" width="32" height="24" rx="3" fill="#C99A62" stroke="#111118" stroke-width="2.2"/><circle cx="18" cy="24" r="9" fill="#2B2733" stroke="#111118" stroke-width="2"/><circle cx="18" cy="24" r="3" fill="#FF8FB1"/><path d="M31 15v11l-6 3" fill="none" stroke="#111118" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 9c0-6 16-6 16 0" fill="none" stroke="#7B5BD6" stroke-width="2.4"/></svg>`,
  emote_guitar: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M24 6l6-3 3 3-3 6-5 1Z" fill="#7A5236" stroke="#111118" stroke-width="2" stroke-linejoin="round"/><path d="M25 12 16 21" stroke="#7A5236" stroke-width="3.4" stroke-linecap="round"/><path d="M16 17c-4-4-11-1-11 6s4 12 11 12 10-6 7-10c-1-2-3-2-4-4s0-3-3-4Z" fill="#E8B26A" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><circle cx="13" cy="26" r="2.8" fill="#3A2A20"/></svg>`,
  held_coffee: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M23 3l-2 8" stroke="#B9A6EC" stroke-width="2.6" stroke-linecap="round"/><path d="M11 13h18l-2.500 22h-13Z" fill="#7A5236" stroke="#111118" stroke-width="2.2" stroke-linejoin="round"/><rect x="9" y="9.500" width="22" height="4.500" rx="2" fill="#fff" stroke="#111118" stroke-width="2.2"/><path d="M12.300 21h15.400l-.800 7H13.100Z" fill="#FFFDF7"/></svg>`,
};
const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function createShopUi(d: Deps) {
  const $ = (id: string) => document.getElementById(id)!;
  const modal = $("shop"), list = $("shopList"), tabs = $("shopTabs"), cuts = $("shopCuts"), entry = $("giftsShop"), earnBox = $("shopEarn");
  let available = false, loggedIn = false, catalog: Item[] = [], owned: string[] = [], gear: GearState = {}, balance = 0, tab = "pet", busy = false;
  let earn = { reward: 0, today: false, welcome: 0 }, short = 0, wentOut = false, mock = false, frameId = "";   // frameId: 내 네컷 액자에 걸릴 내 네컷만화(입어 보기에 쓴다)   // short: 방금 누른 상품에 모자란 컷(0이면 안내 카드를 그냥 "모으는 법"으로)

  function renderEarn(show: boolean) {
    earnBox.hidden = !show; if (!show) return;
    const r = earn.reward;
    const how = !loggedIn ? `${earn.welcome ? `하루들과 처음 연동하면 ${earn.welcome}컷을 선물로 받고, ` : "하루들과 연동하고 "}피드에 네컷만화를 올리면 날마다 컷을 받아요.`
      : earn.today ? `오늘 컷은 이미 받았어요. 내일 하루들 피드에 네컷만화를 올리면 ${r}컷을 또 받아요.`
      : `하루들에서 네컷만화를 만들어 피드에 올리고 돌아오면 ${r}컷을 바로 받아요. 하루에 한 번이고, 연동한 하루들 계정으로 로그인해서 올려야 해요.`;
    earnBox.innerHTML = `<p><b>${short > 0 ? `${short}컷이 모자라요` : "컷 모으는 법"}</b></p><p>${esc(how)}</p><button type="button" class="btn lav" data-earn="go">네컷만화 만들러 가기 ↗</button>`;
  }

  function render() {
    cuts.innerHTML = (mock ? `<b class="mockTag">🧪 개발용 가짜 상점</b> <button type="button" class="linkbtn" data-mock="reset">처음으로</button><br>` : "") + (loggedIn ? `내 컷 <b>${balance.toLocaleString("ko-KR")}</b>컷 <button type="button" class="linkbtn" data-earn="how">모으는 법</button>` : `지금은 구경만 할 수 있어요. 하루들과 ${earn.welcome ? `처음 연동하면 ${earn.welcome}컷 선물!` : "연동하면 컷을 모아 살 수 있어요."}`);
    tabs.innerHTML = TABS.map(([k, label]) => `<button type="button" role="tab" class="dbtn${k === tab ? " on" : ""}" aria-selected="${k === tab}" data-tab="${k}">${label}</button>`).join("");
    const pick = TABS.find(([k]) => k === tab)![2];
    // 레어는 아래로 모으고, 일반과 레어 사이에 구분 띠를 둔다(카탈로그 순서는 그대로 두고 화면에서만)
    const shown = catalog.filter(pick), plain = shown.filter((it) => !it.rare), rares = shown.filter((it) => it.rare && !it.ultra), ultras = shown.filter((it) => it.ultra);
    const head = (cls: string, label: string, note: string) => `<li class="ghead ${cls}" role="presentation"><b>${label}</b><span>${note}</span></li>`;
    const card = (it: Item) => {
      const got = owned.includes(it.sku), emote = it.slot === "emote", on = !emote && gear[it.slot as keyof GearState] === it.sku, pet = it.slot === "pet", lack = loggedIn && !got && balance < it.price, off = busy ? " disabled" : "";
      // 컷이 모자라고 오늘 보상을 아직 안 받았으면: 버튼이 곧 "네컷만화 만들러 가기"다(누르면 하루들 만들기 화면이 열린다)
      const buyLabel = !loggedIn ? `🔒 연동하고 ${pet ? "데려오기" : "사기"}` : lack && !earn.today ? `네컷만화 만들고 ${pet ? "데려오기" : "사기"} ↗` : `${it.price}컷으로 ${pet ? "데려오기" : "사기"}`;
      const act = emote ? (got ? `<button type="button" class="btn ghost" disabled>G를 꾹 눌러 골라요</button>` : `<button type="button" class="btn${lack ? (earn.today ? " lack" : " lav") : ""}" data-buy="${esc(it.sku)}"${off}>${buyLabel}</button>`)   // 감정표현은 입어 보기 · 쓰기가 없다
        : !got ? `<button type="button" class="btn${lack ? (earn.today ? " lack" : " lav") : ""}" data-buy="${esc(it.sku)}"${off}>${buyLabel}</button><button type="button" class="btn ghost" data-try="${esc(it.slot)}" data-sku="${esc(it.sku)}"${off}>${pet ? "미리 만나기" : "입어 보기"}</button>`
        : on ? `<button type="button" class="btn ghost" data-wear="${esc(it.slot)}" data-sku=""${off}>${pet ? "쉬게 하기" : "벗기"}</button>`
        : `<button type="button" class="btn" data-wear="${esc(it.slot)}" data-sku="${esc(it.sku)}"${off}>${pet ? "데리고 다니기" : "쓰기"}</button>`;
      return `<li class="${got ? "got" : ""}${it.ultra ? " ultra" : it.rare ? " rare" : ""}"><span class="gicon">${ICON[it.sku] || ""}</span><div><b>${esc(it.name)}${it.ultra ? `<i class="ultra">초레어</i>` : it.rare ? `<i class="rare">레어</i>` : ""}<em>${on ? (pet ? "함께 있어요" : "쓰는 중") : got ? "가졌어요 ✓" : lack ? `${it.price - balance}컷 모자라요` : `${it.price}컷`}</em></b><p>${esc(TIP[it.sku] || "")}</p><div class="gacts">${act}</div></div></li>`;
    };
    list.innerHTML = rares.length || ultras.length
      ? (plain.length ? head("plain", "일반", `${plain.length}종`) : "") + plain.map(card).join("")
        + (rares.length ? head("rare", "★ 레어", `${rares.length}종 · 더 특별하고 더 비싸요`) + rares.map(card).join("") : "")
        + (ultras.length ? head("ultra", "★★ 초레어", `${ultras.length}종 · 하늘을 나는 단 하나`) + ultras.map(card).join("") : "")
      : shown.map(card).join("");
  }

  function apply(data: any) {
    if (Array.isArray(data.catalog)) catalog = data.catalog;
    if (Array.isArray(data.owned)) { owned = data.owned; if (mock) d.setEmotes(Object.keys(EMOTES).filter((id) => owned.includes(EMOTES[id]))); }
    if (data.gear && typeof data.gear === "object") { gear = data.gear; d.setGear(gear); }
    if (typeof data.balance === "number") { balance = data.balance; d.showCuts(balance); }
    if ("frame" in data) frameId = typeof data.frame === "string" ? data.frame : "";
    if (data.earn && typeof data.earn === "object") earn = { reward: Number(data.earn.reward) || 0, today: !!data.earn.today, welcome: Number(data.earn.welcome) || 0 };
  }

  // 들어올 때 한 번: 상점이 켜져 있는지, (연동했으면) 가진 것 · 쓰는 것 · 잔액
  async function load() {
    try {
      const r = await fetch("/api/shop", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      const data = r?.ok ? await r.json() : null;
      if (MOCK_SHOP && (!data || !data.loggedIn)) { // 개발 서버: 서버 상점이 없거나 연동 전이면 가짜 상점으로
        const m = mockRead(); mock = available = loggedIn = true; entry.hidden = false;
        apply({ catalog: data?.catalog ?? REAL_CATALOG, owned: m.owned, gear: m.gear, balance: m.balance, earn: { reward: 10, today: false } });
        if (!modal.hidden) render();
        return;
      }
      if (!data) return;
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

  // 가짜 상점에서 사고 쓰기: 브라우저에만 남긴다
  function mockBuy(it: Item) {
    const m = mockRead(); if (m.owned.includes(it.sku)) return;
    if (m.balance < it.price) { guide(it.price - m.balance); return; }
    m.balance -= it.price; m.owned.push(it.sku); if (it.slot !== "emote") m.gear = { ...m.gear, [it.slot]: it.sku }; mockSave(m);
    apply({ owned: m.owned, gear: m.gear, balance: m.balance }); renderEarn(false); render();
    d.showToast(`${it.name}를 샀어요 (개발용)`, "이 브라우저에서만 바뀌어요. 상점 위 '처음으로'로 되돌려요.", 3200);
  }
  function mockWear(slot: string, sku: string | null) {
    const m = mockRead(); m.gear = { ...m.gear }; if (sku) m.gear[slot] = sku; else delete m.gear[slot]; mockSave(m);
    apply({ gear: m.gear }); render();
  }

  async function buy(sku: string) {
    const it = catalog.find((c) => c.sku === sku); if (!it || busy) return;
    if (mock) return mockBuy(it);
    if (!d.requireLogin("컷은 하루들과 연동한 크루만 모으고 쓸 수 있어요.")) { close(); return; }
    if (balance < it.price) { guide(it.price - balance); if (!earn.today) { wentOut = true; d.openHarudle(); } return; }   // 오늘 받을 컷이 남았으면 바로 만들기 화면으로
    busy = true; render();
    try {
      const r = await send("POST", "/api/shop/buy", { sku });
      if (r.ok) {
        apply(r.data); renderEarn(false);
        if (it.slot === "emote") { d.showToast(`${it.name}를 샀어요`, "G를 꾹 누르면 나오는 감정표현 휠에서 마우스로 골라요.", 4200); busy = false; render(); return; }
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
    if (mock) return mockWear(slot, sku);
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
    close(); d.preview(slot, sku, frameId || undefined);
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
    if (b.dataset.mock === "reset") { mockSave({ owned: [], gear: {}, balance: 999 }); apply({ owned: [], gear: {}, balance: 999 }); render(); d.showToast("가짜 상점을 처음으로 되돌렸어요", "컷 999, 가진 것 없음", 2200); return; }
    if (b.dataset.tab) { tab = b.dataset.tab; render(); }
    else if (b.dataset.earn === "how") { short = 0; renderEarn(!!earnBox.hidden); }
    else if (b.dataset.earn === "go") { wentOut = true; d.openHarudle(); }
    else if (b.dataset.buy) void buy(b.dataset.buy);
    else if (b.dataset.try) tryOn(b.dataset.try, b.dataset.sku || "");
    else if (b.dataset.wear) void wear(b.dataset.wear, b.dataset.sku || null);
  });

  return {
    open, close, load, isOpen: () => !modal.hidden, isAvailable: () => available, isMock: () => mock,
    /** 하루들에 다녀왔는지(한 번 읽으면 지워진다): 돌아오면 엔진이 바로 정산한다 */
    takeWentOut: () => { const v = wentOut; wentOut = false; return v; },
  };
}
