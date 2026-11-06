// 층 격자 · 배치 · 길찾기 · 끼임 탈출 (three.js·DOM 없이 돈다: 배포 전 검사도 이 파일을 쓴다)
export type Floor = { f: number; rooms: any[]; furn: any[]; zones: any[]; portals: any[]; calls: any[]; [k: string]: any };
/* ════════════════ 1. 설정 · 유틸 ════════════════ */
export const W = 56, H = 34;          // 층 격자(칸)
export const S = 1.25;                // 한 칸 = 1.25m (캐릭터 대비 방·통로를 넉넉하게)
export const FH = 4.6;                // 층 높이
export const WALL = 0.9;              // 벽 높이(인형의 집처럼 낮게)
export const DOLL = 1.12;
// 들어가서 볼 때 천장 높이. 12층은 13층과 계단·오픈 천장으로 이어져 13층 바닥 밑까지 탁 트여 있다
export const CEIL = { 11: 3.5, 12: 4.4, 13: 3.5, 14: 3.8 };
export const VIEW = { mode: "top" };            // top 위에서 · third 들어가서(뒤에서) · first 1인칭
export const inside = () => VIEW.mode !== "top";             // 말풍선을 띄울 키
export const INK = 0x111118, BRAND = "#FFD43B", NAVY = "#0E1E46", WEAK = "#FFF6C7";
export const HAND = '"Gaegu","Gowun Dodum",sans-serif';
export const narrow = () => innerWidth < 640;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const hash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export const wx = (tx) => tx * S - (W * S) / 2;            // 격자 → 월드
export const wz = (ty) => ty * S - (H * S) / 2;
export const tX = (x) => (x + (W * S) / 2) / S;            // 월드 → 격자
export const tY = (z) => (z + (H * S) / 2) / S;
export const floorY = (f) => (f - 11) * FH;

/* ════════════════ 2. 층 데이터 (우테코 11·12·13층 공간 선택 도면 + 14층 놀이터) ════════════════ */
export const FLOOR_INFO = { 11: "배움이 시작되는 공간", 12: "함께, 또 따로 학습의 공간", 13: "몰입하고 발표하는 공간", 14: "놀고 쉬어 가는 놀이터" };
// 12층 ㄱ자 계단: 동쪽으로 한 단, 층계참, 남쪽으로 한 단. 12층 바닥(0)에서 13층 바닥(FH)까지
const STEP_LAND = FH * 6 / 27;
const STAIR_L: [number, number, number, number, any][] = [
  [29, 1, 2, 2, { dir: "e", h0: 0, h1: STEP_LAND }], [31, 1, 2, 2, { dir: "e", h0: STEP_LAND, h1: STEP_LAND }], [31, 3, 2, 7, { dir: "s", h0: STEP_LAND, h1: FH }],
];
// 도면(11·12·13층 공간 선택 화면)을 56×34칸으로 옮긴 배치. 1칸 = 0.6m
export function makeFloor(f) {
  const rooms = [], furn = [], zones = [], portals = [], calls = [];
  const R = (x, y, w, h, name, o = {}) => rooms.push({ x, y, w, h, name, ...o });
  const F = (kind, x, y, w, h, o = {}) => furn.push({ kind, x, y, w, h, ...o });
  const Z = (x, y, w, h, name, desc, o = {}) => zones.push({ x, y, w, h, name, desc, ...o });
  const P = (kind, x, y, w, h, to, spawn, label) => portals.push({ kind, x, y, w, h, to, spawn, label });
  const closed = (x, y, w, h, name, tint = "#E6E5EC") => { R(x, y, w, h, name, { closed: true }); Z(x + 1, y + 1, w - 2, h - 2, name, "", { npc: false, tint }); };

  /* 출입구(엘리베이터 홀): 모든 층 같은 자리. 북쪽·남쪽 가운데가 뚫려 있다 */
  R(18, 12, 28, 10, "", { doors: [{ s: "n", from: 11, len: 5 }, { s: "s", from: 11, len: 5 }], core: true });
  Z(19, 13, 26, 8, "엘리베이터 홀", "엘리베이터 6대. 앞에 서서 F를 누르면 다른 층으로 가요.", { npc: false, tint: "#EEF0F5" });
  for (const x of [20, 23, 26, 36, 39, 42]) { F("elev", x, 13, 2, 1); calls.push({ x, y: 14, w: 2, h: 1 }); }
  F("wsign", 30, 18, 3, 1);
  F("sofa", 20, 19, 4, 2); F("sofa", 39, 19, 4, 2); F("plant", 25, 19, 2, 2); F("plant", 36, 19, 2, 2);

  /* 오른쪽 기둥: 공조실 · 화장실(못 들어가는 방) */
  closed(47, 1, 9, 12, "공조실"); F("acunit", 49, 3, 3, 2); F("acunit", 49, 7, 3, 2); F("acunit", 52, 3, 2, 6);
  closed(47, 12, 9, 11, "화장실", "#E3EEF3"); F("door", 47, 15, 1, 2); F("door", 47, 19, 1, 2); F("wc", 49, 14, 5, 7);

  const meetings = (names, desc) => {
    ([[33, 1, "e"], [33, 5, "e"], [41, 1, "w"], [41, 5, "w"]] as [number, number, string][]).forEach(([x, y, s], i) => {
      R(x, y, 6, 5, names[i], { doors: [{ s, from: 2, len: 1 }], planet: true });
      Z(x + 1, y + 1, 4, 3, `회의실 ${names[i]}`, desc, { npc: false, tint: "#F4F2FA" });
      F("tv", x + 1, y + 1, 4, 1); F("mtable", x + 2, y + 2, 2, 1);
    });
  };

  if (f === 11) {
    R(1, 1, 14, 21, "큰 강의실", { doors: [{ s: "e", from: 5, len: 2 }, { s: "e", from: 15, len: 2 }] });
    Z(2, 2, 12, 19, "큰 강의실", "공통 수업과 외부 강연이 열리는 곳. 크루 전원이 한자리에 모여요.");
    F("screen", 4, 2, 7, 1); F("lectern", 12, 3, 1, 1);
    for (const y of [6, 9, 12, 15, 18]) { F("ltable", 3, y, 4, 1); F("ltable", 8, y, 4, 1); }
    Z(16, 1, 17, 10, "코워킹 존", "바퀴 달린 테이블과 천장에서 내려오는 콘센트. 인원에 맞춰 붙였다 떼었다 해요.", { tint: "#FFF8DC" });
    for (const [x, y] of [[17, 3], [21, 3], [17, 7], [21, 7]]) F("wtable", x, y, 2, 2);
    F("counter", 25, 1, 6, 1, { props: ["sink", "coffee", "micro"] }); F("purifier", 31, 1, 1, 1); F("fridge", 32, 1, 1, 1);
    F("bigtable", 25, 6, 7, 2); F("plant", 30, 3, 2, 2);
    Z(25, 2, 8, 7, "우물가", "탕비실 앞 빅테이블. 소문이 퍼지는 곳이라 우물가라고 불러요.", { npc: true });
    meetings(["금성", "수성", "지구", "화성"], "원시부터 우주까지. 11층 회의실은 행성 이름이에요.");
    R(1, 24, 16, 9, "옆 강의실", { doors: [{ s: "n", from: 13, len: 2 }] });
    Z(2, 25, 14, 7, "옆 강의실", "분반 수업과 페어 활동이 열리는 강의실이에요.");
    F("screen", 3, 25, 7, 1); F("lectern", 12, 25, 1, 1);
    for (const y of [27, 30]) { F("ltable", 3, y, 4, 1); F("ltable", 8, y, 4, 1); }
    R(17, 24, 13, 9, "캔틴", { doors: [{ s: "n", from: 9, len: 2 }] });
    Z(18, 25, 11, 7, "캔틴", "간식과 음료를 꺼내 먹는 곳. 정수기와 커피 머신이 있어요.", { tint: "#FFF4E0" });
    F("counter", 18, 25, 5, 1, { props: ["sink", "micro", "coffee"] }); F("purifier", 23, 25, 1, 1); F("fridge", 24, 25, 1, 1); F("vending", 28, 25, 1, 1);
    F("table", 19, 28, 4, 2); F("table", 24, 28, 4, 2);
    R(30, 24, 20, 9, "코치룸", { doors: [{ s: "n", from: 4, len: 2 }, { s: "n", from: 13, len: 2 }] });
    Z(38, 25, 11, 7, "코치룸", "코치들이 일하는 오픈 데스크. 지정석 없이 그날 앉고 싶은 자리에 앉아요.");
    F("desk", 39, 27, 4, 2); F("desk", 44, 27, 4, 2); F("storage", 39, 31, 9, 1); F("plant", 47, 25, 2, 2);
    R(30, 27, 8, 6, "상담실", { doors: [{ s: "n", from: 2, len: 2 }, { s: "e", from: 2, len: 2 }] });
    Z(31, 28, 6, 4, "상담실", "코치와 마주 앉아 고민을 나누는 방이에요.", { npc: false, tint: "#F8EEE2" });
    F("round", 32, 29, 2, 2); F("sofa", 35, 28, 1, 3);
    closed(50, 24, 6, 4, "비상계단"); F("stairsdeco", 51, 25, 4, 2);
    closed(50, 27, 6, 6, "창고"); F("crates", 51, 28, 4, 2); F("crates", 51, 30, 3, 2);
  }

  if (f === 12) {
    Z(1, 1, 5, 21, "페어존", "책상 다섯 개가 한 줄로 늘어선 자리. 두 사람이 모니터 하나를 같이 보며 페어 프로그래밍을 해요.", { tint: "#F4F2FA" });
    for (const y of [2, 6, 10, 14, 18]) F("pairrow", 2, y, 2, 2);   // 책상 하나에 의자 넷·모니터 둘(양쪽 한 쌍씩), 모두 모니터 10대
    R(7, 1, 21, 10, "라이브러리", { doors: [{ s: "w", from: 4, len: 2 }, { s: "s", from: 4, len: 3 }, { s: "s", from: 16, len: 3 }] });
    Z(8, 2, 19, 8, "라이브러리", "12·13층을 잇는 복층 서재. 원형 서가에 기술서와 개발 문화 책이 빼곡해요.", { tint: "#FBF4E6" });
    F("tower", 9, 3, 5, 5, { tall: true }); F("shelf", 14, 2, 13, 1);   // 원형 서가는 13층 천장까지 솟아 있다
    for (const x of [15, 18, 21, 24]) F("beanbag", x, 3, 2, 2);   // 책장 앞에 나란히, 등받이는 책장 쪽
    F("redsteps", 15, 8, 4, 2); F("beanbag", 20, 8, 2, 2); F("beanbag", 8, 8, 2, 2, { yaw: Math.PI / 2 });
    meetings(["보이저", "아폴로", "디스커버리", "허블"], "12층 회의실은 우주 탐사선 이름이에요.");
    // 라이브러리와 보이저·아폴로 사이 ㄱ자 계단: 동쪽으로 오르다 꺾어 남쪽으로 올라 13층 복도에 닿는다
    P("mat", 28, 1, 1, 2, 13, [33.5, 10.5], "13층"); STAIR_L.forEach(([x, y, w, h, o]) => F("flight", x, y, w, h, o));
    Z(7, 12, 10, 11, "코워킹 존", "끝이 안 보이게 긴 테이블 하나와 4인 테이블 셋. 칸막이 너머로 자유롭게 퍼져서 일하는 자리예요.", { tint: "#FFF8DC" });
    F("partition", 8, 13, 1, 8);
    F("bigtable", 14, 13, 2, 9);   // 세로로 길게, 양쪽에 의자가 줄지어 있다
    for (const y of [13, 16, 19]) F("table", 10, y, 2, 2);   // 4인 테이블
    R(1, 24, 17, 9, "작은 강의실", { doors: [{ s: "n", from: 13, len: 2 }] });
    Z(2, 25, 15, 7, "작은 강의실", "작은 규모 수업과 스터디가 열리는 강의실이에요.");
    F("screen", 3, 25, 8, 1); F("lectern", 13, 25, 1, 1);
    for (const y of [27, 30]) { F("ltable", 3, y, 4, 1); F("ltable", 9, y, 4, 1); }
    Z(19, 25, 15, 7, "캔틴", "간식과 음료를 꺼내 먹는 곳. 코치룸 벽을 따라 싱크대·정수기·냉장고가 있고, 흰 2인 책상과 6인 나무 테이블에 앉아 먹어요.", { tint: "#FFF4E0" });
    // 코치룸 벽에 붙여 90도 돌려 세운다(앞이 캔틴 쪽). 창가부터 냉장고 → 정수기 → 싱크대
    F("fridge", 33, 31, 1, 1, { turn: -Math.PI / 2 }); F("purifier", 33, 30, 1, 1, { turn: -Math.PI / 2 }); F("counter", 33, 27, 1, 3, { props: ["sink", "coffee"], turn: -Math.PI / 2 });
    F("table", 20, 26, 2, 3); F("table", 25, 26, 2, 3);   // 6인 나무 테이블(세로)
    for (const x of [20, 23, 26]) F("duo", x, 31, 1, 1);   // 1인용 흰 책상 + 의자 둘
    for (const y of [26, 28]) F("duo", 29, y, 1, 1);
    R(34, 24, 13, 9, "코치룸", { doors: [{ s: "n", from: 3, len: 2 }, { s: "n", from: 9, len: 2 }] });
    Z(35, 25, 11, 7, "코치룸", "코치들이 일하는 오픈 데스크예요.");
    F("desk", 36, 27, 4, 2); F("desk", 41, 27, 4, 2); F("storage", 36, 31, 9, 1);
    closed(47, 22, 9, 11, "서버실", "#E2E4EE"); for (const x of [49, 51, 53]) F("rack", x, 24, 1, 7);
  }

  if (f === 13) {
    R(1, 1, 30, 10, "라이브러리", { doors: [{ s: "s", from: 16, len: 3 }, { s: "s", from: 24, len: 3 }, { s: "e", from: 1, len: 2 }] });
    Z(2, 2, 28, 8, "라이브러리 (위층)", "복층 서재의 위층. 난간 아래로 원형 서가와 12층이 내려다보여요.", { tint: "#FBF4E6" });
    F("void", 8, 2, 7, 7); F("shelf", 16, 2, 14, 1); F("sofa", 17, 6, 5, 2); F("table", 24, 5, 4, 2); F("beanbag", 28, 8, 2, 2); F("beanbag", 3, 7, 2, 2, { yaw: Math.PI / 2 });   // void 자리로 12층 원형 서가가 올라온다
    R(1, 11, 12, 22, "스타트랙", { doors: [{ s: "e", from: 3, len: 2 }, { s: "e", from: 16, len: 3 }] });
    Z(2, 12, 10, 20, "스타트랙", "테코톡과 선배 기수와의 만남이 열리는 계단식 발표 공간이에요.", { tint: "#F2F4E2" });
    F("screenwall", 3, 12, 8, 1); F("bleacher", 4, 15, 8, 13, { axis: "y" });
    F("void", 31, 4, 2, 6); P("mat", 31, 10, 2, 1, 12, [29.5, 4.5], "12층");   // 12층 ㄱ자 계단이 올라오는 구멍
    R(35, 1, 12, 9, "우물가", { doors: [{ s: "s", from: 6, len: 2 }] });
    Z(36, 2, 10, 7, "우물가", "가볍게 모여 수다를 나누는 곳. 탕비실 앞 빅테이블에서 안부를 물어요.", { tint: "#FFF8DC" });
    F("counter", 36, 2, 6, 1, { props: ["sink", "coffee", "micro"] }); F("purifier", 42, 2, 1, 1); F("fridge", 43, 2, 1, 1); F("purifier", 44, 2, 1, 1);
    F("bigtable", 37, 5, 5, 2); F("round", 43, 5, 2, 2);
    Z(14, 23, 20, 10, "코워킹 존", "넓게 퍼져서 일하는 자리. 테이블을 붙여 팀 작업도 해요.", { tint: "#FFF8DC" });
    for (const [x, y] of [[15, 24], [19, 24], [15, 28], [19, 28]]) F("wtable", x, y, 2, 2);
    F("bigtable", 24, 25, 7, 2); F("planter", 24, 31, 9, 1); F("purifier", 32, 24, 1, 1);
    R(35, 23, 21, 5, "포커스 존", { doors: [{ s: "w", from: 1, len: 3 }, { s: "n", from: 6, len: 3 }, ...[2, 5, 8, 11, 14, 17].map((from) => ({ s: "s", from, len: 2 }))] });
    Z(36, 24, 19, 3, "포커스 존", "혼자 깊게 몰입하는 자리. 뒤쪽 페어룸에서는 둘이 붙어 앉아 코드를 짜요.");
    F("focusdesk", 38, 24, 3, 1); F("focusdesk", 45, 24, 3, 1); F("focusdesk", 50, 24, 4, 1);
    [36, 39, 42, 45, 48, 51].forEach((x, i) => {
      R(x, 27, 4, 7, `페어룸 0${i + 1}`, { doors: [{ s: "n", from: 1, len: 2 }], planet: true, small: true });
      Z(x + 1, 28, 2, 5, `페어룸 0${i + 1}`, "두 사람이 한 모니터를 나란히 보는 방이에요.", { npc: i % 2 === 0, tint: "#F4F2FA" });
      F("pairdesk", x + 1, 32, 2, 1);
    });
    R(13, 13, 5, 8, "은하수", { doors: [{ s: "n", from: 1, len: 3 }], planet: true });
    Z(14, 14, 3, 6, "회의실 은하수", "13층의 단 하나뿐인 회의실이에요.", { npc: false, tint: "#F4F2FA" });
    F("mtable", 15, 16, 1, 2); F("tv", 14, 19, 3, 1);
  }

  if (f === 14) {
    R(1, 1, 14, 11, "노래방", { doors: [{ s: "e", from: 7, len: 2 }] });
    Z(2, 2, 12, 9, "노래방", "마이크 두 개와 미러볼. 회식 2차는 여기서 해결해요.", { tint: "#F3E9FF" });
    F("karaoke", 3, 2, 6, 1); F("sofa", 3, 7, 7, 2); F("coffee", 5, 5, 3, 1); F("mirrorball", 6, 4, 1, 1); F("speaker", 11, 2, 1, 1); F("speaker", 2, 2, 1, 1);
    R(1, 12, 14, 11, "게임방", { doors: [{ s: "e", from: 4, len: 2 }] });
    Z(2, 13, 12, 9, "게임방", "오락기와 콘솔 게임. 미션 끝난 날 한 판씩 붙어요.", { tint: "#E8F0FF" });
    for (const x of [3, 5, 7, 9]) F("arcade", x, 13, 1, 1);
    F("tv", 3, 18, 4, 1); F("beanbag", 3, 20, 2, 2, { yaw: Math.PI }); F("beanbag", 6, 20, 2, 2, { yaw: Math.PI }); F("sofa", 9, 19, 4, 2);
    Z(16, 1, 17, 10, "트램펄린", "올라가면 저절로 통통 튀어요. 머리 식히기에 딱이에요.", { tint: "#FFF8DC" });
    F("trampoline", 17, 2, 5, 5); F("trampoline", 23, 2, 5, 5); F("trampoline", 17, 7, 4, 3, { small: true }); F("plant", 30, 2, 2, 2);
    R(34, 1, 13, 9, "볼풀", { doors: [{ s: "s", from: 5, len: 3 }] });
    Z(35, 2, 11, 7, "볼풀", "알록달록 공이 가득한 볼풀. 들어가면 몸이 쏙 잠겨요.", { tint: "#FFF1F0" });
    F("ballpit", 36, 2, 8, 5); F("slide", 44, 2, 2, 5);
    Z(1, 24, 32, 9, "놀이 광장", "탁구, 보드게임, 포토존. 쉬는 시간마다 사람이 모여요.", { tint: "#E9F4E6" });
    F("pingpong", 3, 26, 4, 2); F("pingpong", 9, 26, 4, 2); F("boardgame", 16, 26, 3, 2); F("boardgame", 21, 26, 3, 2);
    F("sculpture", 27, 26, 3, 3); F("planter", 2, 32, 30, 1); F("parasol", 16, 30, 2, 2); F("parasol", 21, 30, 2, 2);
    R(34, 24, 13, 9, "쉼터", { doors: [{ s: "n", from: 5, len: 3 }] });
    Z(35, 25, 11, 7, "쉼터", "조용히 눕거나 기대어 쉬는 방. 빈백이 넉넉해요.", { tint: "#EEF0F8" });
    for (const [x, y] of [[36, 26], [39, 26], [42, 26], [36, 29], [39, 29]]) F("beanbag", x, y, 2, 2, { yaw: Math.PI });
    F("sofa", 42, 29, 4, 2); F("plant", 44, 25, 2, 2);
    closed(47, 23, 9, 10, "창고"); F("crates", 49, 25, 4, 3); F("crates", 49, 29, 3, 2);
  }
  return { f, rooms, furn, zones, portals, calls };
}
export const FLOORS: Record<number, Floor> = {}; for (const f of [11, 12, 13, 14]) FLOORS[f] = makeFloor(f);

/* 충돌 격자 · 단 높이 */
export const WALK_THROUGH = new Set(["bleacher", "redsteps", "mirrorball", "trampoline", "ballpit"]);
export const ELEV_SPAWN: [number, number] = [31.5, 16.5];   // 엘리베이터에서 내리는 자리(칸 한가운데)
for (const fl of Object.values(FLOORS)) {
  const g = new Uint8Array(W * H); const set = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = 1; };
  for (let x = 0; x < W; x++) { set(x, 0); set(x, H - 1); } for (let y = 0; y < H; y++) { set(0, y); set(W - 1, y); }
  for (const r of fl.rooms) {
    const open = (s, i) => (r.doors || []).some((d) => d.s === s && i >= d.from && i < d.from + d.len);
    for (let i = 0; i < r.w; i++) { if (!open("n", i)) set(r.x + i, r.y); if (!open("s", i)) set(r.x + i, r.y + r.h - 1); }
    for (let i = 0; i < r.h; i++) { if (!open("w", i)) set(r.x, r.y + i); if (!open("e", i)) set(r.x + r.w - 1, r.y + i); }
  }
  fl.wgrid = g.slice();
  for (const o of fl.furn) { if (WALK_THROUGH.has(o.kind)) continue; for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) set(x, y); }
  fl.grid = g;
}
// 엘리베이터에서 걸어서 갈 수 있는 칸: 크루 배치와 끼임 탈출에 쓴다
for (const fl of Object.values(FLOORS)) {
  const reach = new Uint8Array(W * H), q = [Math.floor(ELEV_SPAWN[1]) * W + Math.floor(ELEV_SPAWN[0])]; reach[q[0]] = 1;
  for (let i = 0; i < q.length; i++) { const x = q[i] % W, y = (q[i] / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, ni = ny * W + nx; if (nx < 0 || ny < 0 || nx >= W || ny >= H || fl.grid[ni] || reach[ni]) continue; reach[ni] = 1; q.push(ni); } }
  fl.reach = reach;
}
export const solid = (fl, x, y) => { x = Math.floor(x); y = Math.floor(y); return x < 0 || y < 0 || x >= W || y >= H || fl.grid[y * W + x] === 1; };
export const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
export const STEP = 0.13;
export const bleacherLevel = (o, i) => Math.floor((o.down ? (o.axis === "y" ? o.h : o.w) - 1 - i : i) / (o.axis === "y" ? 2 : 1));
export function heightAt(fl, x, y) {
  for (const o of fl.furn) {
    if (!inRect(o, x, y)) continue;
    if (o.kind === "bleacher") return (bleacherLevel(o, Math.floor(o.axis === "y" ? y - o.y : x - o.x)) + 1) * STEP;
    if (o.kind === "redsteps") return (Math.floor(y - o.y) === 0 ? 2 : 1) * 0.1;
    if (o.kind === "trampoline") return 0.2;
    if (o.kind === "ballpit") return -0.22;   // 볼풀에 들어가면 몸이 반쯤 잠긴다
  }
  return 0;
}
// 캐릭터 몸통(반지름 R_ME)이 벽·가구와 겹치지 않는지
export const R_ME = .28;
export const bagSpot = (o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2, yaw: o.yaw || 0 });
// 누운 자세: 몸 전체를 뒤로 눕히고 빈백 위로 올린다(머리는 등받이 쪽)
export function applyLie(doll, lie) {
  const r = doll.root; r.rotation.order = "YXZ";
  if (lie) { r.rotation.set(-Math.PI / 2 + .3, lie.yaw, 0); r.position.x += Math.sin(lie.yaw) * .42; r.position.z += Math.cos(lie.yaw) * .42; r.position.y += .5; doll.blob.visible = false; }   // 빈백 위에 등을 기대고 비스듬히
  else if (r.rotation.x) { r.rotation.set(0, 0, 0); doll.blob.visible = true; }
}
export const fits = (fl, x, y) => !solid(fl, x - R_ME, y - R_ME) && !solid(fl, x + R_ME, y - R_ME) && !solid(fl, x - R_ME, y + R_ME) && !solid(fl, x + R_ME, y + R_ME);
// 겹친 자리에서 가장 가까운, 걸어서 닿는 칸 한가운데
export function nearestFree(fl, x, y) {
  if (fits(fl, x, y) && fl.reach[Math.floor(y) * W + Math.floor(x)]) return [x, y];
  let best = null, bd = Infinity;
  for (let rad = 0; rad < Math.max(W, H) && !best; rad++) for (let ty = Math.floor(y) - rad; ty <= Math.floor(y) + rad; ty++) for (let tx = Math.floor(x) - rad; tx <= Math.floor(x) + rad; tx++) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H || !fl.reach[ty * W + tx]) continue;
    const d = Math.hypot(tx + .5 - x, ty + .5 - y); if (d < bd) { bd = d; best = [tx + .5, ty + .5]; }
  }
  return best || [...ELEV_SPAWN];
}

