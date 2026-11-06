// 층 격자 · 배치 · 길찾기 · 끼임 탈출 (three.js·DOM 없이 돈다: 배포 전 검사도 이 파일을 쓴다)
export type Floor = { f: number; rooms: any[]; furn: any[]; zones: any[]; portals: any[]; calls: any[]; [k: string]: any };
/* ════════════════ 1. 설정 · 유틸 ════════════════ */
export const W = 56, H = 40;          // 층 격자(칸)
// 남북으로 넓히기: 아래 배치 좌표는 예전 34칸 기준 그대로 쓰고, y가 GROW_AT 이상인 것(남쪽 방들)은 GROW칸 아래로 민다.
// 그래서 북쪽 방들과 남쪽 방들 사이 가운데 통로가 GROW칸 넓어진다. 걸쳐 있는 것은 그만큼 길어진다
export const GROW_AT = 23, GROW = 6;
export const gy = (y) => (y >= GROW_AT ? y + GROW : y);
export const S = 1.25;                // 한 칸 = 1.25m (캐릭터 대비 방·통로를 넉넉하게)
export const FH = 4.6;                // 층 높이
export const WALL = 0.9;              // 벽 높이(인형의 집처럼 낮게)
export const DOLL = 1.12;
// 들어가서 볼 때 천장 높이. 12층은 13층과 계단·오픈 천장으로 이어져 13층 바닥 밑까지 탁 트여 있다
export const CEIL = { 11: 4.4, 12: 4.4, 13: 4.4, 14: 3.8 };   // 11층 큰 강의실·13층 스타트랙 큰 화면이 들어가게 높게
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
export const DECK_H = 0.25;   // 12층 라이브러리 벽돌 단 높이
const STEP_LAND = FH * 6 / 27;
const STAIR_L: [number, number, number, number, any][] = [
  [29, 1, 2, 2, { dir: "e", h0: 0, h1: STEP_LAND }], [31, 1, 2, 2, { dir: "e", h0: STEP_LAND, h1: STEP_LAND }], [31, 3, 2, 7, { dir: "s", h0: STEP_LAND, h1: FH }],
];
// 도면(11·12·13층 공간 선택 화면)을 56×34칸으로 옮긴 배치. 1칸 = 0.6m
export function makeFloor(f) {
  const rooms = [], furn = [], zones = [], portals = [], calls = [];
  // 좌표는 34칸 기준으로 적고, 여기서 gy로 남쪽을 민다(걸친 것은 늘린다). 옆벽 문 위치도 같이 옮긴다
  const span = (y, h) => ({ y: gy(y), h: gy(y + h) - gy(y) });
  const sideDoors = (y, doors) => doors && doors.map((d) => (d.s === "w" || d.s === "e" ? { ...d, from: gy(y + d.from) - gy(y) } : d));
  const shiftO = (o) => ({ ...o, ...(o.cy !== undefined ? { cy: gy(o.cy) } : {}) });
  // raw: true면 이미 넓힌 뒤(40칸) 좌표로 적은 것이라 옮기지 않는다(넓어진 가운데 띠에 놓을 때)
  const R = (x, y, w, h, name, o: any = {}) => rooms.push({ x, ...(o.raw ? { y, h } : span(y, h)), w, name, ...o, ...(o.doors && !o.raw ? { doors: sideDoors(y, o.doors) } : {}) });
  const F = (kind, x, y, w, h, o: any = {}) => furn.push({ kind, x, ...(o.raw ? { y, h } : span(y, h)), w, ...(o.raw ? o : shiftO(o)) });
  const Z = (x, y, w, h, name, desc, o: any = {}) => zones.push({ x, ...(o.raw ? { y, h } : span(y, h)), w, name, desc, ...o });
  const P = (kind, x, y, w, h, to, spawn, label) => portals.push({ kind, x, ...span(y, h), w, to, spawn: [spawn[0], gy(spawn[1])], label });
  const closed = (x, y, w, h, name, tint = "#E6E5EC") => { R(x, y, w, h, name, { closed: true }); Z(x + 1, y + 1, w - 2, h - 2, name, "", { npc: false, tint }); };

  /* 출입구(엘리베이터 홀): 모든 층 같은 자리. 세로로 긴 홀, 양쪽 벽에 엘리베이터 3대씩 마주 본다. 북쪽·남쪽 끝이 뚫려 있다
     13층 ㄱ자 계단(x 31~32) 바로 아래에 둬서, 북쪽 입구가 계단과 일직선이 된다 */
  // 넓힌 뒤 좌표(raw)로 14칸만: 늘어난 만큼 다 쓰면 홀이 너무 길어서, 남쪽을 줄이고 엘리베이터를 홀 한가운데에 둔다
  R(28, 12, 10, 14, "", { raw: true, doors: [{ s: "n", from: 3, len: 4 }, { s: "s", from: 3, len: 4 }], core: true, ...(f === 13 ? { brick: "w" } : {}) });   // 13층은 스타트랙 쪽 바깥벽이 붉은 벽돌
  Z(29, 13, 8, 12, "엘리베이터 홀", "서쪽 엘리베이터 3대만 타요. 동쪽 2대는 우아한테크코스 현수막으로 막혀 있어요. 앞에 서서 F를 누르면 다른 층으로 가요.", { npc: false, tint: "#EEF0F5", raw: true });
  // 엘리베이터는 홀 양쪽의 두꺼운 석재 벽(코어)에 박혀 있다: 홀 벽에서 엘리베이터 문 면까지 한 덩어리로 채운다
  F("elevbank", 29, 13, 1, 12, { face: "e", raw: true }); F("elevbank", 36, 13, 1, 12, { face: "w", raw: true });
  for (const y of [15, 18, 21]) { F("elev", 29, y, 1, 2, { turn: Math.PI / 2, raw: true }); calls.push({ x: 30, y, w: 1, h: 2 }); }   // 서쪽 벽, 동쪽을 본다 — 이것만 탄다
  // 동쪽 벽 2대는 안 쓴다: 문 앞을 X배너 현수막이 막고 있다(돌려 세워 홀 쪽, 서쪽을 본다)
  // 2026 신입생 모집 포스터: 엘리베이터 사이 벽마다 한 장씩(모든 층)
  for (const y of [17, 20]) F("poster", 29, y, 1, 1, { face: "e", at: 30 - .07 / S, raw: true }); F("poster", 36, 18.5, 1, 1, { face: "w", at: 36 + .07 / S, raw: true });   // 엘리베이터 석재 벽 면에
  [16, 20].forEach((y, i) => { F("elev", 36, y, 1, 2, { turn: -Math.PI / 2, raw: true }); F("xbanner", 35, y, 1, 2, { style: i, turn: Math.PI, raw: true }); });   // 홀에서 동쪽 벽을 보면 왼쪽(북)이 검은 배너, 오른쪽이 흰 배너(사진 그대로)

  /* 오른쪽 기둥: 공조실 · 화장실(못 들어가는 방) */
  closed(47, 1, 9, 12, "공조실"); F("acunit", 49, 3, 3, 2); F("acunit", 49, 7, 3, 2); F("acunit", 52, 3, 2, 6);
  closed(47, 12, 9, 11, "화장실", "#E3EEF3"); F("door", 47, 15, 1, 2); F("door", 47, 19, 1, 2); F("wc", 49, 14, 5, 7);

  // 회의실 네 개: 서쪽 줄(문이 동쪽)과 동쪽 줄(문이 서쪽). west = [x, 폭]으로 서쪽 줄만 옮기거나 좁힐 수 있다
  const meetings = (names, desc, west = [33, 6]) => {
    ([[west[0], 1, "e", west[1]], [west[0], 5, "e", west[1]], [41, 1, "w", 6], [41, 5, "w", 6]] as [number, number, string, number][]).forEach(([x, y, s, w], i) => {
      R(x, y, w, 5, names[i], { doors: [{ s, from: 2, len: 1 }], planet: true });
      Z(x + 1, y + 1, w - 2, 3, `회의실 ${names[i]}`, desc, { npc: false, tint: "#F4F2FA" });
      // 들어오는 문 맞은편 벽에 모니터, 그쪽을 향해 테이블이 놓인다(문 앞 한 칸은 비운다)
      F("tv", s === "e" ? x + 1 : x + w - 2, y + 1, 1, 3, { face: s === "e" ? "e" : "w" }); F("mtable", x + 2, y + 2, w - 4, 1);
    });
  };

  if (f === 11) {
    // 큰 강의실: 벽 없이 탁 트였다. 입구 쪽(동남)에만 짧은 벽이 서 있고, 바깥 면에 행성 캐릭터와 "큰강의실" 그림
    F("wallpiece", 14, 16, 1, 5, { mural: ["큰강의실", "Large Classroom"] });
    F("pillar", 7, 10, 1, 1); F("pillar", 7, 17, 1, 1);   // 천장까지 닿는 콘크리트 기둥
    // 옆 강의실 쪽(남쪽)으로 넓어진 가운데 띠까지 늘렸다(넓힌 뒤 좌표, raw). 창가(서쪽)에 큰 화면 둘, 책상·의자는 모두 화면을 본다
    Z(1, 1, 14, 28, "큰 강의실", "공통 수업과 외부 강연이 열리는 곳. 창가의 큰 화면 두 개를 보며 크루 전원이 한자리에 모여요.", { raw: true });
    for (const y of [4, 18]) { F("screen", 2, y, 1, 7, { raw: true, big: true });   // 스타트랙 화면과 같은 크기: 바닥 바로 위부터 천장 바로 아래까지
      F("lectern", 2, y + 8, 1, 1, { raw: true }); }
    for (const x of [5, 8, 11]) for (const y of [2, 6, 10, 14, 18, 22, 26]) F("ltable", x, y, 1, 3, { turn: Math.PI / 2, raw: true });
    Z(16, 1, 17, 10, "코워킹 존", "바퀴 달린 테이블과 천장에서 내려오는 콘센트. 인원에 맞춰 붙였다 떼었다 해요.", { tint: "#FFF8DC" });
    for (const [x, y] of [[17, 3], [21, 3], [17, 7], [21, 7]]) F("wtable", x, y, 2, 2);
    F("counter", 25, 1, 6, 1, { props: ["sink", "coffee", "micro"] }); F("purifier", 31, 1, 1, 1); F("fridge", 32, 1, 1, 1);
    F("bigtable", 25, 6, 7, 2); F("plant", 30, 3, 2, 2);
    Z(25, 2, 8, 7, "우물가", "탕비실 앞 빅테이블. 소문이 퍼지는 곳이라 우물가라고 불러요.", { npc: true });
    meetings(["금성", "수성", "지구", "화성"], "원시부터 우주까지. 11층 회의실은 행성 이름이에요.");
    R(1, 24, 16, 9, "옆 강의실", { doors: [{ s: "n", from: 13, len: 2 }], sign: "Side Classroom" });
    Z(2, 25, 14, 7, "옆 강의실", "분반 수업과 페어 활동이 열리는 강의실이에요.");
    // 12층 작은 강의실과 같은 배치: 화면은 창가(서쪽) 벽에, 책상과 의자는 화면을 본다
    F("screen", 2, 25, 1, 7); F("lectern", 3, 31, 1, 1);
    for (const x of [5, 9, 13]) for (const y of [25, 29]) F("ltable", x, y, 1, 3, { turn: Math.PI / 2 });
    // 12층 캔틴과 같은 구성(벽 없이 트임): 코치룸 벽을 따라 냉장고 → 정수기 → 싱크대, 6인 나무 테이블 둘, 2인 흰 책상
    Z(17, 25, 13, 7, "캔틴", "간식과 음료를 꺼내 먹는 곳. 코치룸 벽을 따라 싱크대·정수기·냉장고가 있고, 흰 2인 책상과 6인 나무 테이블에 앉아 먹어요.", { tint: "#FFF4E0" });
    F("fridge", 29, 31, 1, 1, { turn: -Math.PI / 2 }); F("purifier", 29, 30, 1, 1, { turn: -Math.PI / 2 }); F("counter", 29, 27, 1, 3, { props: ["sink", "coffee"], turn: -Math.PI / 2 });
    F("table", 18, 26, 2, 3); F("table", 22, 26, 2, 3);   // 6인 나무 테이블(세로)
    for (const x of [18, 21, 24]) F("duo", x, 31, 1, 1);   // 1인용 흰 책상 + 의자 둘
    for (const y of [26, 28]) F("duo", 26, y, 1, 1);
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
    Z(1, 3, 5, 21, "페어존", "책상 다섯 개가 한 줄로 늘어선 자리. 두 사람이 모니터 하나를 같이 보며 페어 프로그래밍을 해요.", { tint: "#F4F2FA" });
    for (const y of [5, 9, 13, 17, 21]) F("pairrow", 2, y, 2, 2, { raw: true });   // 작은 강의실 쪽으로 3칸 당겼다   // 책상 하나에 의자 넷·모니터 둘(양쪽 한 쌍씩), 모두 모니터 10대
    Z(7, 1, 21, 11, "라이브러리", "12·13층을 잇는 복층 서재. 창가엔 조약돌과 풀 위에 1인 책상, 원형 서가에 기술서와 개발 문화 책이 빼곡해요.", { tint: "#FBF4E6" });
    F("tower", 9, 3, 5, 5, { tall: true });   // 원형 서가는 13층 천장까지 솟아 있다
    // 창가: 조약돌과 풀이 깔린 띠 위에 창을 보는 1인용 흰 책상, 의자는 띠 위(앉으러 걸어갈 수 있다)
    F("pebbles", 8, 1, 19, 2); for (const x of [9, 12, 15, 18, 21, 24]) F("windowseat", x, 1, 1, 2);   // 이끼·디딤돌·나무 띠 위 흰 의자(방을 본다) + 띠 끝 원기둥 다리 흰 테이블
    // 그 뒤로 통로 한 줄, 책장, 벽돌로 살짝 올라온 단(빈백 넷, 등받이는 책장 쪽), 식물이 우거진 벽돌 화단 둘
    F("shelf", 14, 4, 13, 1);
    F("brickdeck", 14, 5, 13, 3); for (const x of [15, 18, 21, 24]) F("beanbag", x, 5, 2, 2, { lift: DECK_H });
    F("greenbox", 14, 8, 4, 1); F("greenbox", 23, 8, 4, 1);
    F("halfround", 22, 9, 5, 2);   // 화단 앞 나무 반원 테이블: 곧은 쪽이 화단, 둥근 쪽에 의자
    // 보이저·아폴로는 한 칸 좁혀 동쪽으로 붙이고(가운데 복도도 한 칸), 계단과의 사이에 두 칸 틈을 낸다
    meetings(["보이저", "아폴로", "디스커버리", "허블"], "12층 회의실은 우주 탐사선 이름이에요.", [35, 5]);
    // 그 틈은 창으로 뻗은 회색 타일 길: 계단 밑엔 벽돌 화단과 나무 벤치, 맞은편 보이저·아폴로는 붉은 벽돌 벽에 발치 화단, 창가 끝에 작은 원탁
    for (const r of rooms) if (r.name === "보이저" || r.name === "아폴로") r.brick = "w";
    Z(33, 1, 2, 9, "계단 옆 길", "", { npc: false, tint: "#E4E3E0" });
    F("stairbed", 33, 3, 1, 7); F("fernbed", 35, 1, 1, 9); F("bistro", 33, 1, 2, 1); F("linelight", 33, 1, 2, 9);
    // 라이브러리와 보이저·아폴로 사이 ㄱ자 계단: 동쪽으로 오르다 꺾어 남쪽으로 올라 13층 복도에 닿는다
    // 계단은 걸어 올라가고, 맨 윗단을 밟으면 13층으로 넘어간다. 옆으로는 난간이 막는다
    STAIR_L.forEach(([x, y, w, h, o]) => F("flight", x, y, w, h, o)); P("mat", 31, 9, 2, 1, 13, [33.5, 10.5], "13층");   // 맨 윗단. 그 너머(남쪽)는 난간이 막는다
    F("rail", 29, 3, 2, 1, { edge: "n" }); F("rail", 30, 4, 1, 6, { edge: "e" });
    F("mtable", 29, 4, 1, 3, { side: "w" });   // 계단 난간에 딱 붙인 흰 테이블(세로), 의자는 서쪽에만 셋. 서쪽 줄로 계단 발치까지 지나간다
    F("rail", 31, 10, 2, 1, { edge: "n" });   // 계단 꼭대기 끝: 13층에서 막 내려와 발판이 쉬는 동안 남쪽으로 걸어도 계단 끝에서 떨어지지 않게
    // 라이브러리 남쪽, 엘리베이터 홀 가는 길에 캔틴과 같은 냉장고 → 정수기 → 싱크대 한 줄(앞이 남쪽)
    F("fridge", 21, 15, 1, 1); F("purifier", 22, 15, 1, 1); F("counter", 23, 15, 4, 1, { props: ["sink", "coffee"] });   // 반원 테이블과 사이를 넓게(3칸 남쪽)
    // 코워킹 존: 넓힌 뒤 좌표(raw). 작은 강의실 쪽으로 당겨 문 앞에 통로 세 줄만 남긴다. 가운데 칸막이는 벽돌 화단, 그 너머엔 독서실처럼 1인 칸막이 책상이 줄지어 붙어 있다
    Z(7, 15, 10, 14, "코워킹 존", "끝이 안 보이게 긴 테이블 하나와 4인 테이블 셋. 식물이 우거진 벽돌 화단 앞에 나무 테이블이 붙어 있고, 화단 너머엔 독서실처럼 혼자 파고드는 1인 칸막이 자리가 줄지어 있어요.", { tint: "#FFF8DC", raw: true });
    // 가운데 칸막이: 코워킹 쪽은 식물이 우거진 붉은 벽돌 화단, 칸막이 자리 쪽은 베이지 판
    F("partition", 8, 16, 1, 12, { raw: true }); F("greenbox", 8, 16, 1, 12, { turn: Math.PI / 2, raw: true });
    for (const y of [16, 19, 22, 25]) F("walltable", 9, y, 1, 2, { turn: Math.PI / 2, raw: true });   // 화단 앞 나무 테이블, 의자는 화단을 보고 앉는다
    F("carrel", 7, 16, 1, 12, { turn: -Math.PI / 2, raw: true });   // 칸막이 바깥(서쪽) 면에 붙은 1인 칸막이 책상 12자리: 칸막이 너머 코워킹 존 쪽을 보고 앉는다
    F("bigtable", 15, 16, 2, 12, { raw: true });   // 세로로 길게, 양쪽에 의자가 줄지어 있다
    for (const y of [16, 20, 24]) F("table", 12, y, 2, 2, { raw: true });   // 4인 테이블
    R(1, 24, 17, 9, "작은 강의실", { doors: [{ s: "n", from: 13, len: 2 }], sign: "Small Classroom" });
    Z(2, 25, 15, 7, "작은 강의실", "작은 규모 수업과 스터디가 열리는 강의실이에요.");
    // 화면은 창가(서쪽) 벽에, 책상과 의자는 화면을 본다
    F("screen", 2, 25, 1, 7); F("lectern", 3, 31, 1, 1);
    for (const x of [5, 9, 13]) for (const y of [25, 29]) F("ltable", x, y, 1, 3, { turn: Math.PI / 2 });
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
    // 라이브러리 자리는 13층 바닥이 없다: 난간 너머로 12층 라이브러리·페어존이 통째로 내려다보인다
    F("void", 1, 1, 30, 9);
    // 스타트랙 가는 길: 난간 바로 안쪽에 고사리·이끼 화단이 길게 깔리고, 그 옆 회색 타일 길이 창까지 뻗는다. 길 남쪽엔 콘크리트 기둥, 위엔 선형 조명
    F("railbed", 1, 10, 30, 1); F("linelight", 1, 11, 30, 1);
    // 스타트랙: 벽 없이 트인 발표 공간. 엘리베이터 홀 쪽에 큰 화면(서쪽을 본다), 그 앞 반원 무대와 서쪽으로 펼쳐진 반원 객석
    // 화면 뒤는 엘리베이터 홀과 6칸 띄워 넓게 비운다. 화면 뒤·화면과 객석 사이(반원 중심을 화면에서 1.5칸 띄움)·객석과 난간 사이에 걸어 다닐 틈을 둔다
    Z(1, 11, 26, 12, "스타트랙", "테코톡과 선배 기수와의 만남이 열리는 발표 공간. 큰 화면을 반원으로 둘러앉아요.", { tint: "#F2F4E2" });
    F("screenwall", 13, 20, 1, 9, { face: "w", big: true, wide: 1.5, raw: true });   // 넓힌 뒤 좌표. 천장 바로 아래까지 큰 16:9 화면, 반원 무대의 곧은 변이 화면에 붙는다
    F("arcbleacher", 11, 21, 3, 7, { cx: 13.88, cy: 24.5, stage: 2.8, tiers: 0, raw: true });   // 무대: 화면에 붙어 있다
    F("arcbleacher", 4, 12, 10, 27, { cx: 12.38, cy: 24.5, sy: 1.5, stage: 0, r0: 4.2, tw: 1.33, tiers: 3, raw: true });   // 남북(화면 따라)으로 1.5배 늘린 반타원   // 객석: 무대와 사이를 띄우려고 창가 쪽으로 1.5칸 물렸다   // 예전보다 반지름 1.6배쯤(층 폭이 허락하는 만큼)
    F("plant", 3, 12, 2, 2); F("plant", 3, 20, 2, 2);
    // 객석 바깥(서쪽 창가): 이끼·디딤돌·작은 나무 띠와 그 위 1인용 흰 테이블·의자 셋(12층 창가와 같은 것, 창을 등지고 객석 쪽을 본다)
    F("pebbles", 1, 16, 2, 9, { turn: Math.PI / 2, raw: true });
    for (const y of [17, 20, 23]) F("windowseat", 1, y, 2, 1, { turn: Math.PI / 2, raw: true });
    Z(1, 29, 13, 10, "스타트랙", "", { npc: false, tint: "#F2F4E2", raw: true });   // 늘어난 객석 남쪽 끝까지 바닥색
    Z(1, 11, 30, 1, "스타트랙 가는 길", "", { npc: false, tint: "#E4E3E0" });
    F("pillar", 9, 12, 1, 1);
    // 화면 뒤 빈 자리: 스테인리스 곡선 카운터가 나무 한 그루와 풀밭을 둘러싼다(화면 쪽 서쪽이 트였다)
    F("arcplanter", 23, 14, 4, 4);
    // 스타트랙과 엘리베이터 홀 사이 복도(넓힌 뒤 좌표): 왼쪽은 붉은 벽돌 벽(점검문·소화전), 벽을 따라 걷는 길,
    // 스타트랙 쪽엔 가운데 화분이 있는 스테인리스 링 테이블, 북쪽엔 바 스툴 높은 원탁, 벽에 기댄 바퀴 달린 화이트보드
    F("poster", 28, 22.5, 1, 1, { face: "w", at: 28.5 - .05 / S, raw: true });   // 스타트랙 쪽 벽돌 벽에도 모집 포스터
    F("walldeco", 27, 17, 1, 2, { item: "door", raw: true }); F("walldeco", 27, 21, 1, 1, { item: "hydrant", raw: true }); F("walldeco", 27, 24, 1, 2, { item: "door", raw: true });
    F("whiteboard", 26, 14, 1, 1, { raw: true });
    F("ringtable", 22, 19, 3, 3, { raw: true });
    F("hightable", 19, 15, 1, 1, { raw: true });   // 하이 테이블과 링 화단 사이 빈 자리
    // 계단 구멍과 안드로메다 같은 방 벽 사이: 벽에 등을 대고 구멍 너머 12층을 내려다보는 빈백 셋(계단 쪽 한 줄은 지나가는 길)
    for (const y of [4, 6, 8]) F("beanbag", 34, y, 1, 1, { yaw: -Math.PI / 2 });
    // 링 화단 너머: 철제 난간 두른 12층 계단
    F("void", 31, 4, 2, 6, { steel: true }); P("mat", 31, 10, 2, 1, 12, [32, 7.4], "12층");   // 12층 계단 위쪽에 내려서 걸어 내려간다   // 12층 ㄱ자 계단이 올라오는 구멍
    // 안드로메다 같은 방: 창가 ㄱ자 가죽 소파와 낮은 테이블, 안쪽엔 주방과 바 스툴 아일랜드(세로로 돌려 주방 카운터 앞에 둔다)
    R(35, 1, 12, 9, "안드로메다 같은 방", { doors: [{ s: "s", from: 6, len: 2 }] });
    Z(36, 2, 10, 7, "안드로메다 같은 방", "소파와 주방이 있는 라운지. 아일랜드에서 커피를 내려 마시고 소파에 모여 수다를 떨어요.", { tint: "#F6EBDD" });
    F("sofa", 36, 2, 4, 2, { color: 0xB0764A }); F("sofa", 36, 4, 2, 3, { color: 0xB0764A }); F("coffee", 38, 5, 2, 1);
    F("counter", 45, 2, 1, 5, { face: "w", props: ["coffee", "sink", "micro"] }); F("island", 43, 3, 1, 4, { turn: -Math.PI / 2 });   /* 스툴은 서쪽, 카운터와 사이에 한 줄 통로 */ F("table", 38, 7, 3, 2);
    // 우물가(스타트랙 쪽에서 동쪽을 보면): 왼쪽(북)은 붉은 벽돌 벽에 움푹 들어간 4인 부스 셋, 가운데 통로,
    // 길쭉한 스테인리스 카운터가 서쪽 끝에서 둥글게 감싸고(창가 쪽은 트임), 안쪽 창가엔 나무 벤치와 원탁, 맨 끝 벽에 탕비 카운터
    Z(14, 23, 20, 10, "우물가", "벽돌 벽에 쏙 들어간 4인 부스 둘과, 길쭉한 스테인리스 카운터 안 창가 벤치·원탁에 둘러앉는 곳. 끝 벽 탕비 카운터에서 커피를 받아 와요.", { tint: "#ECEBEA" });
    for (const x of [18, 22]) F("booth4", x, 29, 4, 3, { raw: true });   // 스타트랙 화면 옆에서 남쪽으로 곧장 걸어가는 길은 막지 않는다(14~17 비움)
    // 스타트랙 화면 옆에서 남쪽을 보면: 길게 뻗은 스테인리스 하이 테이블(동쪽에 바 스툴), 오른쪽(서) 벽엔 진회색 주방 수납장과 콘크리트 기둥·냉장고,
    // 왼쪽 앞으로 우물가 스테인리스 카운터의 둥근 끝이 살짝 보이고, 멀리 남쪽 창
    F("fridge", 14, 20, 1, 1, { turn: Math.PI / 2, tall: true, raw: true });   // 주방은 스타트랙 화면 바로 뒤(동쪽 면)에 붙어 동쪽을 본다
    F("kitchenrow", 14, 21, 1, 3, { raw: true }); F("pillar", 14, 24, 1, 1, { raw: true }); F("kitchenrow", 14, 25, 1, 4, { raw: true, upper: true });   // 화면을 따라 3칸 남쪽으로
    F("mcdesk", 13, 32, 2, 1, { raw: true });   // MC석: 객석 반타원 남쪽 끝(잘린 면)에 붙어 무대를 본다
    F("islandbar", 16, 21, 1, 6, { raw: true });   // 스타트랙 화면 바로 옆(동쪽)에서 시작해 남쪽으로 뻗는다
    F("brickwall", 26, 29, 2, 1, { raw: true });
    F("stadium", 15, 33, 15, 6, { raw: true, a: 18, b: 27, cy: 36.2, r: 2.7 });   // 동쪽 끝 아래로 드나든다
    F("winbench", 18, 38, 9, 1, { raw: true });
    F("round", 19, 35, 2, 2, { raw: true }); F("round", 22, 34, 2, 2, { raw: true }); F("round", 25, 35, 2, 2, { raw: true });
    F("counter", 32, 34, 1, 3, { raw: true, face: "w", props: ["sink", "coffee", "micro"] }); F("purifier", 32, 37, 1, 1, { raw: true }); F("fridge", 32, 38, 1, 1, { raw: true });
    // 은하수: 화장실 바로 아래 동쪽 끝, 세로로 긴 유리 회의실. 포커스 존 쪽으로 드나든다
    R(51, 23, 5, 11, "은하수", { doors: [{ s: "w", from: 2, len: 2 }], planet: true });
    Z(52, 24, 3, 9, "회의실 은하수", "화장실 옆 길쭉한 유리 회의실이에요.", { npc: false, tint: "#F4F2FA" });
    F("tv", 54, 24, 1, 4, { face: "w" }); F("mtable", 53, 28, 1, 4);   // 문(서쪽) 맞은편 동쪽 벽에 모니터
    // 포커스 존: 은하수 옆 긴 방 하나. 창가(남)엔 긴 나무 하이 카운터와 높은 의자, 맞은편(북) 벽엔 키 큰 칸막이로 나눈 2인 페어 부스
    R(33, 29, 19, 11, "포커스 존", { raw: true, doors: [{ s: "w", from: 1, len: 3 }, { s: "n", from: 5, len: 2 }, { s: "e", from: 2, len: 2 }] });
    Z(34, 30, 17, 9, "포커스 존", "가운데 칸막이 부스에서 둘이 나란히 페어 프로그래밍을 하고, 창가 하이 카운터나 북쪽 벽을 따라 띄엄띄엄 놓인 등받이 높은 1인 소파에서 혼자 몰입해요.", { raw: true });
    // 남북으로 세 띠: 북쪽 띠(30~32)는 띄엄띄엄 놓인 등받이 높은 1인 소파와 화이트보드, 가운데 띠(33~35)는 칸막이 페어 부스, 남쪽 띠(36~38)는 창가 하이 카운터
    for (const x of [34, 36, 41, 44, 47, 50]) F("pod", x, 30, 1, 1, { raw: true });   // 북쪽 벽을 따라 띄엄띄엄(38~39는 북쪽 문 앞)
    F("whiteboard", 39, 32, 1, 1, { raw: true });
    for (const x of [34, 37, 42, 45, 48]) F("pairbooth", x, 33, 3, 2, { raw: true, back: true });   // 40~41은 띠 사이를 건너는 통로
    F("highbar", 34, 38, 17, 1, { raw: true });
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
// 점프로 올라설 수 있는 가구의 윗면 높이(m). 점프는 0.7m쯤까지 닿는다. 여기 없는 가구(책장·냉장고·벽 같은 것)는 못 올라간다
export const TOPS: Record<string, number> = {
  table: .44, bigtable: .44, desk: .44, ltable: .44, mtable: .44, wtable: .42, duo: .44, pairrow: .44, pairdesk: .44, focusdesk: .44, solo: .44,
  walltable: .47, round: .44, bistro: .47, boardgame: .44, coffee: .3, bench: .3, sofa: .48, winbench: .45, halfround: .5, ringtable: .48,
  counter: .58, kitchenrow: .62, lowcounter: .62, island: .56, hightable: .66, mcdesk: .5, lectern: .66, pingpong: .66,
  greenbox: .55, planter: .3, plant: .36, crates: .5,
};
export const WALK_THROUGH = new Set(["poster", "walldeco", "linelight", "bleacher", "arcbleacher", "flight", "brickdeck", "pebbles", "redsteps", "mirrorball", "trampoline", "ballpit"]);
export const ELEV_SPAWN: [number, number] = [32.5, 15.5];   // 엘리베이터에서 내리는 자리(칸 한가운데)
for (const fl of Object.values(FLOORS)) {
  const g = new Uint8Array(W * H); const set = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = 1; };
  for (let x = 0; x < W; x++) { set(x, 0); set(x, H - 1); } for (let y = 0; y < H; y++) { set(0, y); set(W - 1, y); }
  for (const r of fl.rooms) {
    const open = (s, i) => (r.doors || []).some((d) => d.s === s && i >= d.from && i < d.from + d.len);
    for (let i = 0; i < r.w; i++) { if (!open("n", i)) set(r.x + i, r.y); if (!open("s", i)) set(r.x + i, r.y + r.h - 1); }
    for (let i = 0; i < r.h; i++) { if (!open("w", i)) set(r.x, r.y + i); if (!open("e", i)) set(r.x + r.w - 1, r.y + i); }
  }
  fl.wgrid = g.slice();
  for (const o of fl.furn) {
    if (o.kind === "screenwall") { // 16:9 화면은 높이에 맞춰 폭이 정해진다(engine screen169와 같은 셈): 보이는 폭만큼만 막는다
      const along = (o.face === "w" ? o.h : o.w), len = along * S - .2, hh = Math.min(len * 9 / 16, o.big ? CEIL[fl.f] - .3 : 2.2), half = Math.min(len, hh * 16 / 9 * (o.wide || 1)) / S / 2, mid = along / 2;
      for (let i = Math.floor(mid - half); i < Math.ceil(mid + half); i++) o.face === "w" ? set(o.x, o.y + i) : set(o.x + i, o.y);
      continue; }
    if (o.kind === "pairbooth") { for (let i = 0; i < 3; i++) set(o.x + i, o.y); set(o.x, o.y + 1); continue; }   // 책상 줄과 칸막이 옆 한 칸만 막는다(의자 자리는 열어 둔다)
    if (o.kind === "booth4") { for (let i = 0; i < 2; i++) { set(o.x, o.y + i); set(o.x + 3, o.y + i); } set(o.x + 1, o.y); set(o.x + 2, o.y); continue; }   // 벤치·테이블만 막고 부스 입구는 들어간다
    if (o.kind === "stadium") { for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (stadiumWall(o, x + .5, y + .5)) set(x, y); continue; }
    if (WALK_THROUGH.has(o.kind)) continue; for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) set(x, y); }
  fl.grid = g;
  // 점프해서 올라설 수 있는 가구: 칸마다 윗면 높이. 올라설 수 없는 것과 겹친 칸은 0(벽처럼 막힌다)
  const top = new Float32Array(W * H);
  for (const o of fl.furn) { const h = TOPS[o.kind]; if (!h || o.lift) continue; for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (x >= 0 && y >= 0 && x < W && y < H) top[y * W + x] = Math.max(top[y * W + x], h); }
  for (const o of fl.furn) { if (TOPS[o.kind] || WALK_THROUGH.has(o.kind)) continue; for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (x >= 0 && y >= 0 && x < W && y < H && g[y * W + x]) top[y * W + x] = 0; }
  for (let i = 0; i < W * H; i++) if (fl.wgrid[i]) top[i] = 0;
  fl.top = top;
}
// 엘리베이터에서 걸어서 갈 수 있는 칸: 크루 배치와 끼임 탈출에 쓴다
for (const fl of Object.values(FLOORS)) {
  const reach = new Uint8Array(W * H), q = [Math.floor(ELEV_SPAWN[1]) * W + Math.floor(ELEV_SPAWN[0])]; reach[q[0]] = 1;
  for (let i = 0; i < q.length; i++) { const x = q[i] % W, y = (q[i] / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, ni = ny * W + nx; if (nx < 0 || ny < 0 || nx >= W || ny >= H || fl.grid[ni] || reach[ni]) continue; reach[ni] = 1; q.push(ni); } }
  fl.reach = reach;
}
// 우물가 둥근 벽: 반지름 r 둘레 한 칸 두께, 북쪽 gap(라디안, 반각)만큼 트여 있다
// 우물가 길쭉한 카운터: (a, cy)~(b, cy) 선분에서 반지름 r 둘레 한 칸 두께. 남쪽 곧은 변(창가)과 동쪽 끝 아래쪽은 트여 있다
export function stadiumWall(o, x, y) {
  const dy = y - o.cy; if (dy > 0 && x >= o.a) return false;
  const d = Math.hypot(x - clamp(x, o.a, o.b), dy);
  return d > o.r - 1 && d < o.r + .3;
}
export const solid = (fl, x, y) => { x = Math.floor(x); y = Math.floor(y); return x < 0 || y < 0 || x >= W || y >= H || fl.grid[y * W + x] === 1; };
export const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
export const STEP = 0.13;
export const bleacherLevel = (o, i) => Math.floor((o.down ? (o.axis === "y" ? o.h : o.w) - 1 - i : i) / (o.axis === "y" ? 2 : 1));
// 반원 객석: 중심(cx, cy)에서 서쪽으로 펼쳐진다. 0 바닥 · 무대 0.5단 · 바깥으로 갈수록 한 단씩
export const ARC_STEP = 0.22;
export const arcLevel = (o, x, y) => {
  if (o.face === "s" ? y < o.cy : x > o.cx) return 0;   // 객석은 화면 반대쪽 반원에만 있다
  const r = Math.hypot(x - o.cx, (y - o.cy) / (o.sy || 1));   // sy: 화면을 따라(남북) 늘린 반타원
  if (r < o.stage) return 0.5;
  const k = Math.floor((r - o.r0) / o.tw);
  return r >= o.r0 && k < o.tiers ? k + 1 : 0;
};
// 계단 한 줄의 높이: 그리는 단과 똑같이 칸마다 세 단씩 오른다(h0 = h1이면 층계참)
export const flightSteps = (o) => (o.h0 === o.h1 ? 1 : (o.dir === "e" ? o.w : o.h) * 3);
export function flightHeight(o, x, y) {
  const n = flightSteps(o), t = o.dir === "e" ? (x - o.x) / o.w : (y - o.y) / o.h, i = Math.min(n - 1, Math.floor(t * n));
  return Math.max(.05, o.h0 + (o.h1 - o.h0) * (i + 1) / n);
}
// 가구 위에 올라선 높이(몸 한가운데 칸 기준). 0이면 바닥
export const topAt = (fl, x, y) => { x = Math.floor(x); y = Math.floor(y); return x < 0 || y < 0 || x >= W || y >= H ? 0 : fl.top[y * W + x]; };
// 내가 지금 발 높이(feet)에서 (x, y)로 갈 수 있는지: 벽·못 오르는 가구는 막고, 오를 수 있는 가구는 발이 윗면 가까이 닿아야 올라선다
export const CLIMB = .26;   // 그냥 걸어서 넘는 턱(객석 한 단 정도)
export function canStand(fl, x, y, feet) {
  for (const [cx, cy] of [[x - R_ME, y - R_ME], [x + R_ME, y - R_ME], [x - R_ME, y + R_ME], [x + R_ME, y + R_ME]]) {
    const tx = Math.floor(cx), ty = Math.floor(cy); if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
    const i = ty * W + tx; if (!fl.grid[i]) continue; const t = fl.top[i]; if (!t || t > feet + CLIMB) return false;
  }
  return true;
}
export function heightAt(fl, x, y) {
  for (const o of fl.furn) {
    if (!inRect(o, x, y)) continue;
    if (o.kind === "flight") return flightHeight(o, x, y);
    if (o.kind === "arcbleacher") return arcLevel(o, x, y) * ARC_STEP;
    if (o.kind === "bleacher") return (bleacherLevel(o, Math.floor(o.axis === "y" ? y - o.y : x - o.x)) + 1) * STEP;
    if (o.kind === "brickdeck") return DECK_H;
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

