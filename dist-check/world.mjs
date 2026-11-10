// src/duel/arena/kit.mjs
var E = Math.PI / 2;
var Wd = -Math.PI / 2;
var N = Math.PI;
var ring = (x, y, w, h, o = {}) => ({ x, y, w, h, name: "", ring: true, wall: 13227758, ...o });
var tint = (x, y, w, h, name, color, o = {}) => ({ x, y, w, h, name, desc: "", npc: false, tint: color, ...o });
function arena(def) {
  return { rooms: [], furn: [], zones: [], watch: [], ...def, starts: def.starts?.length ? def.starts : [...def.watch || [], ...def.spawns || []].map(([x, y]) => [x, y]) };
}

// src/duel/arena/jump.mjs
var JUMP_RUN = 7.3;
var JUMP_BOUNCE = 8;
var STRIP = 9;
var X0 = 2;
var DEFS = [
  { id: "cloud", name: "\uAD6C\uB984 \uACC4\uB2E8", segs: [
    [1, 2, 0.8, 2, 3],
    [2, 2, 1.2, 1, 3],
    [2, 2, 1.6, 3, 3],
    [2, 3, 1.2, 2, 3],
    [2, 3, 1.4, 0, 7, "cp"],
    [2, 1, 1.8, 0, 2],
    [2, 1, 2.2, 2, 2],
    [2, 1, 2.6, 4, 2],
    [2, 2, 2, 2, 3],
    [2, 3, 2, 0, 7, "cp"],
    [2, 2, 0.6, 2, 3, "t"],
    [2, 3, 2.6, 0, 7, "end"]
  ] },
  { id: "stone", name: "\uC9D5\uAC80\uB2E4\uB9AC", segs: [
    [1, 1, 0.7, 1, 2],
    [2, 1, 0.9, 4, 2],
    [2, 1, 1.1, 1, 2],
    [2, 1, 1.3, 4, 2],
    [2, 2, 1, 2, 3],
    [2, 3, 1.2, 0, 7, "cp"],
    [2, 1, 1.5, 0, 2],
    [1, 1, 1.8, 3, 2],
    [1, 1, 2.1, 5, 2],
    [2, 1, 1.6, 2, 2],
    [2, 1, 2, 0, 2],
    [2, 3, 2, 0, 7, "cp"],
    [2, 1, 2.4, 2, 3],
    [2, 1, 2.8, 4, 3],
    [2, 3, 2.8, 0, 7, "end"]
  ] },
  { id: "spring", name: "\uD1B5\uD1B5 \uD2B8\uB7A8\uD384\uB9B0", segs: [
    [2, 2, 0.4, 2, 3, "t"],
    [2, 3, 2, 2, 3],
    [2, 2, 1.2, 1, 3],
    [2, 3, 1.2, 0, 7, "cp"],
    [2, 2, 0.6, 3, 3, "t"],
    [2, 2, 2.6, 1, 3],
    [2, 2, 0.8, 4, 3, "t"],
    [2, 2, 3.2, 2, 3],
    [2, 3, 3, 0, 7, "cp"],
    [2, 2, 2.2, 1, 2],
    [2, 3, 2.6, 0, 7, "end"]
  ] },
  { id: "tower", name: "\uD558\uB298 \uD0D1", segs: [
    [1, 2, 1, 0, 3],
    [1, 2, 1.6, 4, 3],
    [1, 2, 2.2, 0, 3],
    [2, 3, 1.6, 2, 3],
    [2, 3, 1.8, 0, 7, "cp"],
    [2, 1, 2.9, 3, 2],
    [2, 1, 2.3, 0, 2],
    [2, 1, 3.4, 3, 2],
    [2, 2, 2.8, 5, 2],
    [2, 3, 2.6, 0, 7, "cp"],
    [2, 1, 3.2, 1, 2],
    [2, 1, 3.6, 4, 2],
    [2, 3, 3, 0, 7, "end"]
  ] }
];
function course(def, k) {
  const y0 = 1 + k * STRIP, iy = y0 + 1, pads = [{ x: X0, y: iy, w: 3, h: 7, top: 0.5 }], blocks = [];
  let x = X0 + 3;
  for (const [gap, len, top, lane = 0, rows = 7, kind = "b"] of def.segs) {
    x += gap;
    const b = { x, y: iy + lane, w: len, h: rows, top, kind };
    x += len;
    (kind === "cp" || kind === "end" ? pads : blocks).push(b);
  }
  const cx = (r) => r.x + r.w / 2, minT = pads.map((p, i) => i ? Math.round((cx(p) - cx(pads[i - 1])) / JUMP_RUN * 1e3 * 0.7) : 0);
  const spot = (p) => [cx(p), p.y + p.h / 2, E];
  return { id: def.id, name: def.name, k, y0, pads, blocks, minT, spot: pads.map(spot), spawns: [[X0 + 1.5, iy + 1.5, E], [X0 + 1.5, iy + 5.5, E]], watch: [[X0 + 1.5, iy + 3.5, E]] };
}
var JUMP_COURSES = DEFS.map(course);
var JUMP_ARENA = (() => {
  const a = arena({ f: 21, game: "jump", info: "\uC810\uD504\uB9F5 \uB300\uACB0\uC7A5", spawns: JUMP_COURSES[0].spawns, watch: JUMP_COURSES[0].watch, starts: JUMP_COURSES.map((c) => [c.pads[0].x + 3.5, c.pads[0].y + 3.5]) });
  for (const c of JUMP_COURSES) {
    a.rooms.push(ring(1, c.y0, 54, STRIP));
    a.zones.push(tint(2, c.y0 + 1, 52, 7, `${c.name} \uCF54\uC2A4`, "#DCEBFC", { checker: ["#E4F0FD", "#D2E4F9"] }));
    c.pads.forEach((p, i) => a.furn.push({ ...p, kind: "jpad", mark: i === 0 ? "start" : i === c.pads.length - 1 ? "end" : "cp", n: i, course: c.k }));
    for (const b of c.blocks) a.furn.push({ ...b, kind: b.kind === "t" ? "jtramp" : "jblock", ...b.kind === "t" ? { bounce: JUMP_BOUNCE } : {}, course: c.k });
  }
  return a;
})();

// src/duel/arena/shoot.mjs
var SHOOT_FIELD = { x: 18, y: 7, w: 20, h: 20 };
var CX = SHOOT_FIELD.x * 2 + SHOOT_FIELD.w;
var CY = SHOOT_FIELD.y * 2 + SHOOT_FIELD.h;
var HALF = [
  // [x, y, w, h, 모양] 한쪽 절반. 나머지는 돌려서 만든다
  [22, 10, 2, 2, "crate"],
  // 내 자리 앞 상자
  [34, 9, 2, 2, "crate"],
  // 비어 있는 구석 상자
  [30, 10, 3, 1, "wall"],
  // 가로 종이벽
  [23, 14, 1, 3, "wall"],
  // 세로 종이벽
  [27, 12, 1, 1, "barrel"],
  // 가운데 앞 통
  [19, 17, 1, 1, "barrel"]
  // 옆 통
];
var SHOOT_COVER = [
  ...HALF.flatMap(([x, y, w, h, look]) => [{ x, y, w, h, look }, { x: CX - x - w, y: CY - y - h, w, h, look }]),
  { x: 27, y: 16, w: 2, h: 2, look: "crate", big: true }
  // 한가운데 큰 상자
];
var SHOOT_ARENA = arena({
  f: 22,
  game: "shoot",
  info: "\uC0AC\uACA9 \uB300\uACB0\uC7A5",
  rooms: [ring(17, 6, 22, 22, { wall: 15251878 }), ring(17, 28, 22, 5)],
  zones: [
    tint(18, 7, 20, 20, "\uC0AC\uACA9 \uACBD\uAE30\uC7A5", "#F3EEE4"),
    // 바둑판(checker)은 tint 위에 그려져 자리 색을 덮으므로 쓰지 않는다
    tint(18, 7, 3, 3, "\uBE68\uAC15 \uC790\uB9AC", "#F6D3CC"),
    tint(35, 24, 3, 3, "\uD30C\uB791 \uC790\uB9AC", "#CFE0F6"),
    tint(18, 29, 20, 3, "\uAD00\uC804\uC11D", "#ECEAF4")
  ],
  furn: SHOOT_COVER.map((c) => ({ ...c, kind: "scover" })),
  spawns: [[19.5, 8.5, Math.PI / 4], [36.5, 25.5, -Math.PI * 3 / 4]],
  // 북서 구석(남동을 본다) · 남동 구석(북서를 본다)
  watch: [[22.5, 30.5, N], [28, 30.5, N], [33.5, 30.5, N]]
});

// src/duel/arena/target.mjs
var TARGET_ROWS = [10.5, 12.75, 15, 17.25];
var TARGET_RAIL = 19;
var TARGET_BOOTHS = [{ x: 15, y: 19, w: 12, h: 4 }, { x: 29, y: 19, w: 12, h: 4 }];
var TARGET_ARENA = arena({
  f: 23,
  game: "target",
  info: "\uACFC\uB141 \uC0AC\uACA9\uC7A5",
  rooms: [ring(14, 7, 28, 17, { wall: 15325368 }), ring(14, 24, 28, 5)],
  // 마당과 사대는 한 방(난간이 총알을 막으므로), 관전석은 뒤에 따로
  zones: [tint(15, 8, 26, 11, "\uACFC\uB141 \uB9C8\uB2F9", "#EAF3E2"), tint(15, 20, 12, 3, "1\uBC88 \uC0AC\uB300", "#E3ECFA"), tint(29, 20, 12, 3, "2\uBC88 \uC0AC\uB300", "#FBE6E4"), tint(15, 25, 26, 3, "\uAD00\uC804\uC11D", "#ECEAF4")],
  furn: [
    { kind: "tback", x: 15, y: 8, w: 26, h: 1 },
    // 뒷벽(과녁판 · 점수판)
    ...TARGET_ROWS.map((r, i) => ({ kind: "ttrack", x: 15, y: r - 0.5, w: 26, h: 1, walk: true, n: i })),
    // 과녁 레일(밟고 지나감)
    ...TARGET_BOOTHS.map((b, i) => ({ kind: "tcounter", x: b.x, y: TARGET_RAIL, w: b.w, h: 1, top: 0.45, seat: i })),
    // 낮은 카운터: 총알은 위로 지나간다
    { kind: "tdiv", x: 27, y: 19, w: 2, h: 4 }
    // 부스 칸막이
  ],
  spawns: [[21, 21.5, N], [35, 21.5, N]],
  watch: [[20, 26.5, N], [28, 26.5, N], [36, 26.5, N]]
});

// src/duel/arena/box.mjs
var BOX = {
  HP: 100,
  RANGE: 1.3,
  ANGLE: Math.PI / 3,
  GUARD: 0.3,
  GAP: 180,
  // GAP: 잽 · 스트레이트를 섞어도 주먹 사이 최소 간격
  PUNCH: { jab: { dmg: 8, gap: 350 }, str: { dmg: 14, gap: 700 } }
};
var face = (x, y, tx, ty) => Math.atan2(tx - x, ty - y);
var SP = [[26.2, 18.2], [29.8, 21.8]];
var BOX_ARENA = arena({
  f: 24,
  game: "box",
  info: "\uBCF5\uC2F1 \uB9C1",
  rooms: [ring(18, 10, 20, 20, { wall: 14274024 }), ring(24, 16, 8, 8, { wall: 3820154 })],
  zones: [tint(19, 11, 18, 18, "\uAD00\uC804 \uB9C8\uB2F9", "#EFECF6"), tint(25, 17, 6, 6, "\uB9C1", "#F7E7C6")],
  furn: [
    { kind: "boxring", x: 24, y: 16, w: 8, h: 8, walk: true },
    // 관전 의자: 올라서면 링이 잘 보인다(윗면 0.42m, 점프로 올라선다)
    { kind: "boxbench", x: 22, y: 11, w: 12, h: 1, top: 0.42 },
    { kind: "boxbench", x: 22, y: 28, w: 12, h: 1, top: 0.42 },
    { kind: "boxbench", x: 19, y: 14, w: 1, h: 12, top: 0.42 },
    { kind: "boxbench", x: 36, y: 14, w: 1, h: 12, top: 0.42 }
  ],
  spawns: [[...SP[0], face(...SP[0], ...SP[1])], [...SP[1], face(...SP[1], ...SP[0])]],
  watch: [[21.5, 20, E], [34.5, 20, Wd], [28, 13.5, 0], [28, 26.5, Math.PI], [21.5, 15, E], [34.5, 25, Wd]]
});

// src/duel/arena/index.mjs
var ARENAS = [JUMP_ARENA, SHOOT_ARENA, TARGET_ARENA, BOX_ARENA];

// src/engine/world.ts
var W = 56;
var H = 40;
var GROW_AT = 23;
var GROW = 6;
var gy = (y) => y >= GROW_AT ? y + GROW : y;
var S = 1.25;
var FH = 4.6;
var WALL = 0.9;
var DOLL = 1.12;
var CEIL = { 11: 4.4, 12: 4.4, 13: 4.4, 14: 3.8 };
var CAMPUS = [11, 12, 13, 14];
for (const a of ARENAS) CEIL[a.f] = 9;
var VIEW = { mode: "top" };
var inside = () => VIEW.mode !== "top";
var INK = 1118488;
var BRAND = "#FFD43B";
var NAVY = "#0E1E46";
var WEAK = "#FFF6C7";
var HAND = '"Gaegu","Gowun Dodum",sans-serif';
var narrow = () => innerWidth < 640;
var clamp = (v, a, b) => Math.min(b, Math.max(a, v));
var lerp = (a, b, t) => a + (b - a) * t;
var rng = (seed) => () => {
  seed = seed + 1831565813 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
var hash = (str) => {
  let h = 2166136261;
  for (const c of String(str)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
var wx = (tx) => tx * S - W * S / 2;
var wz = (ty) => ty * S - H * S / 2;
var tX = (x) => (x + W * S / 2) / S;
var tY = (z) => (z + H * S / 2) / S;
var floorY = (f) => (f - 11) * FH;
var FLOOR_INFO = { 11: "\uBC30\uC6C0\uC774 \uC2DC\uC791\uB418\uB294 \uACF5\uAC04", 12: "\uD568\uAED8, \uB610 \uB530\uB85C \uD559\uC2B5\uC758 \uACF5\uAC04", 13: "\uBAB0\uC785\uD558\uACE0 \uBC1C\uD45C\uD558\uB294 \uACF5\uAC04", 14: "\uD558\uB8E8\uB4E4 \uC6D4\uB4DC" };
for (const a of ARENAS) FLOOR_INFO[a.f] = a.info;
var DECK_H = 0.25;
var STEP_LAND = FH * 6 / 27;
var STAIR_L = [
  [29, 1, 2, 2, { dir: "e", h0: 0, h1: STEP_LAND }],
  [31, 1, 2, 2, { dir: "e", h0: STEP_LAND, h1: STEP_LAND }],
  [31, 3, 2, 7, { dir: "s", h0: STEP_LAND, h1: FH }]
];
function makeFloor(f) {
  const rooms = [], furn = [], zones = [], portals = [], calls = [];
  const span = (y, h) => ({ y: gy(y), h: gy(y + h) - gy(y) });
  const sideDoors = (y, doors) => doors && doors.map((d) => d.s === "w" || d.s === "e" ? { ...d, from: gy(y + d.from) - gy(y) } : d);
  const shiftO = (o) => ({ ...o, ...o.cy !== void 0 ? { cy: gy(o.cy) } : {} });
  const R = (x, y, w, h, name, o = {}) => rooms.push({ x, ...o.raw ? { y, h } : span(y, h), w, name, ...o, ...o.doors && !o.raw ? { doors: sideDoors(y, o.doors) } : {} });
  const F = (kind, x, y, w, h, o = {}) => furn.push({ kind, x, ...o.raw ? { y, h } : span(y, h), w, ...o.raw ? o : shiftO(o) });
  const Z = (x, y, w, h, name, desc, o = {}) => zones.push({ x, ...o.raw ? { y, h } : span(y, h), w, name, desc, ...o });
  const P = (kind, x, y, w, h, to, spawn, label) => portals.push({ kind, x, ...span(y, h), w, to, spawn: [spawn[0], gy(spawn[1])], label });
  const closed = (x, y, w, h, name, tint2 = "#E6E5EC") => {
    R(x, y, w, h, name, { closed: true });
    Z(x + 1, y + 1, w - 2, h - 2, name, "", { npc: false, tint: tint2 });
  };
  R(28, 12, 10, 14, "", { raw: true, doors: [{ s: "n", from: 3, len: 4 }, { s: "s", from: 3, len: 4 }], core: true, ...f === 13 ? { brick: "w" } : {} });
  Z(29, 13, 8, 12, "\uC5D8\uB9AC\uBCA0\uC774\uD130 \uD640", "\uC11C\uCABD \uC5D8\uB9AC\uBCA0\uC774\uD130 3\uB300\uB9CC \uD0C0\uC694. \uB3D9\uCABD 2\uB300\uB294 \uC6B0\uC544\uD55C\uD14C\uD06C\uCF54\uC2A4 \uD604\uC218\uB9C9\uC73C\uB85C \uB9C9\uD600 \uC788\uC5B4\uC694. \uC55E\uC5D0 \uC11C\uC11C F\uB97C \uB204\uB974\uBA74 \uB2E4\uB978 \uCE35\uC73C\uB85C \uAC00\uC694.", { npc: false, tint: "#EEF0F5", raw: true });
  F("elevbank", 29, 13, 1, 12, { face: "e", raw: true });
  F("elevbank", 36, 13, 1, 12, { face: "w", raw: true });
  for (const y of [15, 18, 21]) {
    F("elev", 29, y, 1, 2, { turn: Math.PI / 2, raw: true });
    calls.push({ x: 30, y, w: 1, h: 2 });
  }
  if (f <= 13) F("duelbanner", 35, 10, 1, 1, { face: "s", raw: true });
  for (const y of [17, 20]) F("poster", 29, y, 1, 1, { face: "e", at: 30 - 0.07 / S, raw: true });
  F("poster", 36, 18.5, 1, 1, { face: "w", at: 36 + 0.07 / S, raw: true });
  [16, 20].forEach((y, i) => {
    F("elev", 36, y, 1, 2, { turn: -Math.PI / 2, raw: true });
    F("xbanner", 35, y, 1, 2, { style: i, turn: Math.PI, raw: true });
  });
  if (f !== 14) {
    closed(51, 1, 5, 12, "\uACF5\uC870\uC2E4");
    F("acunit", 52, 3, 3, 2);
    F("acunit", 52, 7, 3, 2);
    if (f === 13) {
      R(47, 12, 9, 12, "\uD654\uC7A5\uC2E4", { closed: true, raw: true });
      Z(48, 13, 7, 10, "\uD654\uC7A5\uC2E4", "", { npc: false, tint: "#E3EEF3", raw: true });
    } else closed(47, 12, 9, 11, "\uD654\uC7A5\uC2E4", "#E3EEF3");
    F("door", 47, 15, 1, 2);
    F("door", 47, 19, 1, 2);
    F("wc", 49, 14, 5, 7);
  }
  const meetings = (names, desc, wx0 = 33) => {
    const w = 7, ex = wx0 + w + 2;
    [[wx0, 0, "e"], [wx0, 5, "e"], [ex, 0, "w"], [ex, 5, "w"]].forEach(([x, y, s], i) => {
      const win = y === 0, h = win ? 6 : 5;
      R(x, y, w, h, names[i], { doors: [{ s, from: win ? 3 : 2, len: 1 }], planet: true, ...win ? { open: ["n"] } : {} });
      Z(x + 1, y + 1, w - 2, h - 2, `\uD68C\uC758\uC2E4 ${names[i]}`, desc, { npc: false, tint: "#F4F2FA" });
      F("tv", s === "e" ? x + 1 : x + w - 2, y + 1, 1, h - 2, { face: s === "e" ? "e" : "w" });
      F("mtable", x + 2, y + 2, 3, 1, { horiz: true });
    });
  };
  if (f === 11) {
    F("duelbanner", 16, 10, 1, 1, { face: "s", raw: true });
    F("duelbanner", 28, 31, 1, 1, { face: "w", raw: true });
    F("wallpiece", 14, 16, 1, 5, { mural: ["\uD070\uAC15\uC758\uC2E4", "Large Classroom"] });
    F("pillar", 7, 10, 1, 1);
    F("pillar", 7, 17, 1, 1);
    Z(1, 1, 14, 28, "\uD070 \uAC15\uC758\uC2E4", "\uACF5\uD1B5 \uC218\uC5C5\uACFC \uC678\uBD80 \uAC15\uC5F0\uC774 \uC5F4\uB9AC\uB294 \uACF3. \uCC3D\uAC00\uC758 \uD070 \uD654\uBA74 \uB450 \uAC1C\uB97C \uBCF4\uBA70 \uD06C\uB8E8 \uC804\uC6D0\uC774 \uD55C\uC790\uB9AC\uC5D0 \uBAA8\uC5EC\uC694.", { raw: true });
    for (const y of [4, 18]) {
      F("screen", 2, y, 1, 7, { raw: true, big: true });
      F("lectern", 2, y + 8, 1, 1, { raw: true });
    }
    for (const x of [5, 8, 11]) for (const y of [2, 6, 10, 14, 18, 22, 26]) F("ltable", x, y, 1, 3, { turn: Math.PI / 2, raw: true });
    Z(16, 1, 17, 10, "\uCF54\uC6CC\uD0B9 \uC874", "\uBC14\uD034 \uB2EC\uB9B0 \uD14C\uC774\uBE14\uACFC \uCC9C\uC7A5\uC5D0\uC11C \uB0B4\uB824\uC624\uB294 \uCF58\uC13C\uD2B8. \uC778\uC6D0\uC5D0 \uB9DE\uCDB0 \uBD99\uC600\uB2E4 \uB5BC\uC5C8\uB2E4 \uD574\uC694.", { tint: "#FFF8DC" });
    for (const [x, y] of [[17, 3], [21, 3], [17, 7], [21, 7]]) F("wtable", x, y, 2, 2);
    F("fridge", 24, 11, 1, 1, { raw: true, turn: Math.PI, dz: 0.74 });
    F("purifier", 25, 11, 1, 1, { raw: true, turn: Math.PI, dz: 0.8 });
    F("counter", 26, 11, 3, 1, { raw: true, turn: Math.PI, dz: 0.45, props: ["sink", "coffee", "micro"] });
    F("bigtable", 25, 6, 7, 2);
    F("plant", 30, 3, 2, 2);
    Z(25, 2, 8, 7, "\uC6B0\uBB3C\uAC00", "\uD0D5\uBE44\uC2E4 \uC55E \uBE45\uD14C\uC774\uBE14. \uC18C\uBB38\uC774 \uD37C\uC9C0\uB294 \uACF3\uC774\uB77C \uC6B0\uBB3C\uAC00\uB77C\uACE0 \uBD88\uB7EC\uC694.", { npc: true });
    meetings(["\uAE08\uC131", "\uC218\uC131", "\uC9C0\uAD6C", "\uD654\uC131"], "\uC6D0\uC2DC\uBD80\uD130 \uC6B0\uC8FC\uAE4C\uC9C0. 11\uCE35 \uD68C\uC758\uC2E4\uC740 \uD589\uC131 \uC774\uB984\uC774\uC5D0\uC694.");
    R(1, 24, 16, 9, "\uC606 \uAC15\uC758\uC2E4", { doors: [{ s: "n", from: 13, len: 2 }], sign: "Side Classroom" });
    Z(2, 25, 14, 7, "\uC606 \uAC15\uC758\uC2E4", "\uBD84\uBC18 \uC218\uC5C5\uACFC \uD398\uC5B4 \uD65C\uB3D9\uC774 \uC5F4\uB9AC\uB294 \uAC15\uC758\uC2E4\uC774\uC5D0\uC694.");
    F("screen", 2, 25, 1, 7);
    F("lectern", 3, 31, 1, 1);
    for (const x of [5, 9, 13]) for (const y of [25, 29]) F("ltable", x, y, 1, 3, { turn: Math.PI / 2 });
    Z(17, 25, 13, 7, "\uCE94\uD2F4", "\uAC04\uC2DD\uACFC \uC74C\uB8CC\uB97C \uAEBC\uB0B4 \uBA39\uB294 \uACF3. \uCF54\uCE58\uB8F8 \uBCBD\uC744 \uB530\uB77C \uC2F1\uD06C\uB300\xB7\uC815\uC218\uAE30\xB7\uB0C9\uC7A5\uACE0\uAC00 \uC788\uACE0, \uD770 2\uC778 \uCC45\uC0C1\uACFC 6\uC778 \uB098\uBB34 \uD14C\uC774\uBE14\uC5D0 \uC549\uC544 \uBA39\uC5B4\uC694.", { tint: "#FFF4E0" });
    F("fridge", 29, 31, 1, 1, { turn: -Math.PI / 2 });
    F("purifier", 29, 30, 1, 1, { turn: -Math.PI / 2 });
    F("counter", 29, 27, 1, 3, { props: ["sink", "coffee"], turn: -Math.PI / 2 });
    F("greenbox", 17, 31, 1, 7, { turn: Math.PI / 2, raw: true });
    F("brickbench", 18, 31, 1, 7, { raw: true });
    F("table", 19, 31, 2, 3, { raw: true, bench: "w" });
    F("table", 19, 35, 2, 3, { raw: true, bench: "w" });
    for (const x of [23, 26]) for (const y of [32, 34, 36]) F("duo", x, y, 1, 1, { raw: true });
    R(30, 24, 20, 9, "\uCF54\uCE58\uB8F8", { doors: [{ s: "n", from: 4, len: 2 }, { s: "n", from: 13, len: 2 }] });
    Z(38, 25, 11, 7, "\uCF54\uCE58\uB8F8", "\uCF54\uCE58\uB4E4\uC774 \uC77C\uD558\uB294 \uC624\uD508 \uB370\uC2A4\uD06C. \uC9C0\uC815\uC11D \uC5C6\uC774 \uADF8\uB0A0 \uC549\uACE0 \uC2F6\uC740 \uC790\uB9AC\uC5D0 \uC549\uC544\uC694.");
    F("desk", 39, 27, 4, 2);
    F("desk", 44, 27, 4, 2);
    F("storage", 39, 31, 9, 1);
    F("plant", 47, 25, 2, 2);
    R(30, 27, 8, 6, "\uC0C1\uB2F4\uC2E4", { doors: [{ s: "n", from: 2, len: 2 }, { s: "e", from: 2, len: 2 }] });
    Z(31, 28, 6, 4, "\uC0C1\uB2F4\uC2E4", "\uCF54\uCE58\uC640 \uB9C8\uC8FC \uC549\uC544 \uACE0\uBBFC\uC744 \uB098\uB204\uB294 \uBC29\uC774\uC5D0\uC694.", { npc: false, tint: "#F8EEE2" });
    F("round", 32, 29, 2, 2);
    F("sofa", 35, 28, 1, 3);
    closed(50, 24, 6, 4, "\uBE44\uC0C1\uACC4\uB2E8");
    F("stairsdeco", 51, 25, 4, 2);
    closed(50, 27, 6, 6, "\uCC3D\uACE0");
    F("crates", 51, 28, 4, 2);
    F("crates", 51, 30, 3, 2);
  }
  if (f === 12) {
    F("duelbanner", 19, 12, 1, 1, { face: "s", raw: true });
    F("duelbanner", 32, 31, 1, 1, { face: "w", raw: true });
    Z(1, 3, 5, 21, "\uD398\uC5B4\uC874", "\uCC45\uC0C1 \uB2E4\uC12F \uAC1C\uAC00 \uD55C \uC904\uB85C \uB298\uC5B4\uC120 \uC790\uB9AC. \uB450 \uC0AC\uB78C\uC774 \uBAA8\uB2C8\uD130 \uD558\uB098\uB97C \uAC19\uC774 \uBCF4\uBA70 \uD398\uC5B4 \uD504\uB85C\uADF8\uB798\uBC0D\uC744 \uD574\uC694.", { tint: "#F4F2FA" });
    for (const y of [5, 9, 13, 17, 21]) F("pairrow", 2, y, 2, 2, { raw: true });
    Z(7, 1, 21, 11, "\uB77C\uC774\uBE0C\uB7EC\uB9AC", "12\xB713\uCE35\uC744 \uC787\uB294 \uBCF5\uCE35 \uC11C\uC7AC. \uCC3D\uAC00\uC5D4 \uC870\uC57D\uB3CC\uACFC \uD480 \uC704\uC5D0 1\uC778 \uCC45\uC0C1, \uC6D0\uD615 \uC11C\uAC00\uC5D0 \uAE30\uC220\uC11C\uC640 \uAC1C\uBC1C \uBB38\uD654 \uCC45\uC774 \uBE7C\uACE1\uD574\uC694.", { tint: "#FBF4E6" });
    F("tower", 9, 3, 5, 5, { tall: true });
    F("pebbles", 8, 1, 19, 2, { flush: true });
    for (const x of [9, 14, 19, 24]) F("windowseat", x, 1, 2, 2, { beside: true });
    F("shelf", 14, 4, 13, 1);
    F("brickdeck", 14, 5, 13, 3);
    for (const x of [15, 18, 21, 24]) F("beanbag", x, 5, 2, 2, { lift: DECK_H });
    F("greenbox", 14, 8, 4, 1);
    F("greenbox", 23, 8, 4, 1);
    F("halfround", 22, 9, 5, 2);
    meetings(["\uBCF4\uC774\uC800", "\uC544\uD3F4\uB85C", "\uB514\uC2A4\uCEE4\uBC84\uB9AC", "\uD5C8\uBE14"], "12\uCE35 \uD68C\uC758\uC2E4\uC740 \uC6B0\uC8FC \uD0D0\uC0AC\uC120 \uC774\uB984\uC774\uC5D0\uC694.", 35);
    for (const r of rooms) if (r.name === "\uBCF4\uC774\uC800" || r.name === "\uC544\uD3F4\uB85C") r.brick = "w";
    Z(33, 1, 2, 9, "\uACC4\uB2E8 \uC606 \uAE38", "", { npc: false, tint: "#E4E3E0" });
    F("stairbed", 33, 3, 1, 7);
    F("fernbed", 35, 1, 1, 9);
    F("bistro", 33, 1, 2, 1);
    F("linelight", 33, 1, 2, 9);
    STAIR_L.forEach(([x, y, w, h, o]) => F("flight", x, y, w, h, o));
    P("mat", 31, 9, 2, 1, 13, [33.5, 10.5], "13\uCE35");
    F("rail", 29, 3, 2, 1, { edge: "n" });
    F("rail", 30, 4, 1, 6, { edge: "e" });
    F("mtable", 29, 4, 1, 3, { side: "w" });
    F("rail", 31, 10, 2, 1, { edge: "n" });
    F("fridge", 21, 15, 1, 1, { turn: Math.PI });
    F("purifier", 22, 15, 1, 1, { turn: Math.PI });
    F("counter", 23, 15, 4, 1, { props: ["sink", "coffee"], turn: Math.PI });
    Z(7, 13, 10, 15, "\uCF54\uC6CC\uD0B9 \uC874", "\uB05D\uC774 \uC548 \uBCF4\uC774\uAC8C \uAE34 \uD14C\uC774\uBE14 \uD558\uB098\uC640 4\uC778 \uD14C\uC774\uBE14 \uC14B. \uC2DD\uBB3C\uC774 \uC6B0\uAC70\uC9C4 \uBCBD\uB3CC \uD654\uB2E8 \uC55E\uC5D0 \uB098\uBB34 \uD14C\uC774\uBE14\uC774 \uBD99\uC5B4 \uC788\uACE0, \uD654\uB2E8 \uB108\uBA38\uC5D4 \uB3C5\uC11C\uC2E4\uCC98\uB7FC \uD63C\uC790 \uD30C\uACE0\uB4DC\uB294 1\uC778 \uCE78\uB9C9\uC774 \uC790\uB9AC\uAC00 \uC904\uC9C0\uC5B4 \uC788\uC5B4\uC694. \uC791\uC740 \uAC15\uC758\uC2E4 \uCABD \uB098\uBB34 \uBCBD\uC5D4 \uD070 \uD654\uC774\uD2B8\uBCF4\uB4DC\uAC00 \uAC78\uB824 \uC788\uC5B4\uC694.", { tint: "#FFF8DC", raw: true });
    F("partition", 8, 14, 1, 12, { raw: true });
    F("greenbox", 8, 14, 1, 12, { turn: Math.PI / 2, raw: true });
    for (const y of [14, 17, 20, 23]) F("walltable", 9, y, 1, 2, { turn: Math.PI / 2, raw: true });
    F("carrel", 7, 14, 1, 12, { turn: -Math.PI / 2, raw: true });
    F("bigtable", 15, 14, 2, 12, { raw: true });
    F("wbpost", 14, 13, 1, 1, { raw: true, board: "s" });
    F("wbwall", 9, 27, 4, 1, { raw: true, board: "n" });
    Z(21, 18, 5, 9, "\uD558\uB8E8\uB4E4 \uBD80\uC2A4", "\uC6B0\uB9AC\uB07C\uB9AC \uD1B5\uD558\uB294 \uB124\uCEF7\uB9CC\uD654, \uD558\uB8E8\uB4E4. \uBD93 \uAF42\uC774\uC5D0\uC11C \uBD93\uC744 \uB4E4\uACE0(F) \uC774\uC824\uC744 \uB204\uB974\uBA74 \uB2E4 \uAC19\uC774 \uB124\uCEF7\uC744 \uADF8\uB824\uC694. \uB0A8\uCABD \uCEF7 \uC0C1\uC810\uC5D0\uC11C \uD3AB \xB7 \uC7A5\uC2DD\uC744 \uAD6C\uACBD\uD558\uACE0, \uC55E \uC785\uAC04\uD310\uC5D0\uC11C \uADC0 \uC7A5\uC2DD \uBC1B\uB294 \uBC95\uB3C4 \uD655\uC778\uD574\uC694.", { tint: "#EFE7FB", raw: true });
    F("hbmat", 21, 18, 5, 9, { raw: true });
    F("hbwall", 25, 18, 1, 6, { raw: true });
    F("hbcounter", 23, 20, 1, 3, { raw: true });
    F("hbbunting", 25, 18, 1, 6, { raw: true });
    F("hbballoon", 24, 18, 1, 1, { raw: true });
    F("rollup", 24, 19, 1, 1, { seed: 0, raw: true });
    F("hbgifts", 24, 21, 1, 1, { raw: true });
    F("rollup", 24, 23, 1, 1, { seed: 1, raw: true });
    F("brushcup", 21, 18, 1, 1, { raw: true });
    F("painteasel", 22, 19, 1, 1, { raw: true, tilt: 0.45 });
    F("hbshop", 22, 24, 3, 3, { raw: true });
    F("hbmenu", 21, 24, 1, 1, { raw: true, tilt: 0.3 });
    F("photoframe", 21, 26, 1, 1, { raw: true });
    F("linkkiosk", 20, 17, 1, 1, { raw: true, tilt: 0.35 });
    F("instaboard", 20, 27, 1, 1, { raw: true, tilt: -0.35 });
    F("giftsign", 20, 22, 1, 1, { raw: true });
    F("hbwelcome", 20, 25, 1, 1, { raw: true, tilt: -0.25 });
    for (const y of [16, 20, 24]) F("table", 12, y, 2, 2, { raw: true });
    R(1, 24, 17, 9, "\uC791\uC740 \uAC15\uC758\uC2E4", { doors: [{ s: "n", from: 13, len: 2 }], sign: "Small Classroom" });
    Z(2, 25, 15, 7, "\uC791\uC740 \uAC15\uC758\uC2E4", "\uC791\uC740 \uADDC\uBAA8 \uC218\uC5C5\uACFC \uC2A4\uD130\uB514\uAC00 \uC5F4\uB9AC\uB294 \uAC15\uC758\uC2E4\uC774\uC5D0\uC694.");
    F("screen", 2, 25, 1, 7);
    F("lectern", 3, 31, 1, 1);
    for (const x of [5, 9, 13]) for (const y of [25, 29]) F("ltable", x, y, 1, 3, { turn: Math.PI / 2 });
    Z(19, 25, 15, 7, "\uCE94\uD2F4", "\uAC04\uC2DD\uACFC \uC74C\uB8CC\uB97C \uAEBC\uB0B4 \uBA39\uB294 \uACF3. \uCF54\uCE58\uB8F8 \uBCBD\uC744 \uB530\uB77C \uC2F1\uD06C\uB300\xB7\uC815\uC218\uAE30\xB7\uB0C9\uC7A5\uACE0\uAC00 \uC788\uACE0, \uD770 2\uC778 \uCC45\uC0C1\uACFC 6\uC778 \uB098\uBB34 \uD14C\uC774\uBE14\uC5D0 \uC549\uC544 \uBA39\uC5B4\uC694.", { tint: "#FFF4E0" });
    F("fridge", 33, 31, 1, 1, { turn: -Math.PI / 2 });
    F("purifier", 33, 30, 1, 1, { turn: -Math.PI / 2 });
    F("counter", 33, 27, 1, 3, { props: ["sink", "coffee"], turn: -Math.PI / 2 });
    F("greenbox", 19, 31, 1, 7, { turn: Math.PI / 2, raw: true });
    F("brickbench", 20, 31, 1, 7, { raw: true });
    F("table", 21, 31, 2, 3, { raw: true, bench: "w" });
    F("table", 21, 35, 2, 3, { raw: true, bench: "w" });
    for (const x of [26, 29]) for (const y of [32, 34, 36]) F("duo", x, y, 1, 1, { raw: true });
    R(34, 24, 13, 9, "\uCF54\uCE58\uB8F8", { doors: [{ s: "n", from: 3, len: 2 }, { s: "n", from: 9, len: 2 }] });
    Z(35, 25, 11, 7, "\uCF54\uCE58\uB8F8", "\uCF54\uCE58\uB4E4\uC774 \uC77C\uD558\uB294 \uC624\uD508 \uB370\uC2A4\uD06C\uC608\uC694.");
    for (const x of [36, 40, 44]) for (let y = 32; y <= 35; y++) {
      F("solodesk", x, y, 1, 1, { face: "e", raw: true });
      F("solodesk", x + 1, y, 1, 1, { face: "w", raw: true });
    }
    F("storage", 36, 31, 9, 1);
    closed(47, 22, 9, 11, "\uC11C\uBC84\uC2E4", "#E2E4EE");
    for (const x of [49, 51, 53]) F("rack", x, 24, 1, 7);
  }
  if (f === 13) {
    F("duelbanner", 32, 33, 1, 1, { face: "w", raw: true });
    F("void", 1, 1, 30, 9);
    F("railbed", 1, 10, 30, 1);
    F("linelight", 1, 11, 30, 1);
    Z(1, 11, 26, 12, "\uC2A4\uD0C0\uD2B8\uB799", "\uD14C\uCF54\uD1A1\uACFC \uC120\uBC30 \uAE30\uC218\uC640\uC758 \uB9CC\uB0A8\uC774 \uC5F4\uB9AC\uB294 \uBC1C\uD45C \uACF5\uAC04. \uD070 \uD654\uBA74\uC744 \uBC18\uC6D0\uC73C\uB85C \uB458\uB7EC\uC549\uC544\uC694.", { tint: "#F2F4E2" });
    F("screenwall", 13, 19, 1, 11, { face: "w", big: true, wide: 1.65, ratio169: true, raw: true });
    F("arcbleacher", 11, 21, 3, 7, { cx: 13.88, cy: 24.5, stage: 2.8, tiers: 0, raw: true });
    F("arcbleacher", 4, 12, 10, 27, { cx: 12.38, cy: 24.5, sy: 1.5, stage: 0, r0: 4.2, tw: 1.33, tiers: 3, raw: true });
    F("plant", 3, 12, 2, 2);
    F("plant", 3, 20, 2, 2);
    F("pebbles", 1, 16, 2, 9, { turn: Math.PI / 2, raw: true });
    for (const y of [17, 20, 23]) F("windowseat", 1, y, 2, 1, { turn: Math.PI / 2, raw: true });
    Z(1, 29, 13, 10, "\uC2A4\uD0C0\uD2B8\uB799", "", { npc: false, tint: "#F2F4E2", raw: true });
    Z(1, 11, 30, 1, "\uC2A4\uD0C0\uD2B8\uB799 \uAC00\uB294 \uAE38", "", { npc: false, tint: "#E4E3E0" });
    F("pillar", 9, 12, 1, 1);
    F("arcplanter", 18, 14, 4, 4);
    F("poster", 28, 22.5, 1, 1, { face: "w", at: 28.5 - 0.05 / S, raw: true });
    F("walldeco", 27, 17, 1, 2, { item: "door", raw: true });
    F("walldeco", 27, 21, 1, 1, { item: "hydrant", raw: true });
    F("walldeco", 27, 24, 1, 2, { item: "door", raw: true });
    F("ringtable", 22, 19, 3, 3, { raw: true });
    F("hightable", 16, 15, 1, 1, { raw: true });
    for (const y of [4, 6, 8]) F("beanbag", 34, y, 1, 1, { yaw: -Math.PI / 2 });
    F("void", 31, 4, 2, 6, { steel: true });
    P("mat", 31, 10, 2, 1, 12, [32, 7.4], "12\uCE35");
    R(35, 1, 12, 9, "\uC548\uB4DC\uB85C\uBA54\uB2E4 \uAC19\uC740 \uBC29", { doors: [{ s: "s", from: 6, len: 2 }] });
    Z(36, 2, 10, 7, "\uC548\uB4DC\uB85C\uBA54\uB2E4 \uAC19\uC740 \uBC29", "\uC18C\uD30C\uC640 \uC8FC\uBC29\uC774 \uC788\uB294 \uB77C\uC6B4\uC9C0. \uC544\uC77C\uB79C\uB4DC\uC5D0\uC11C \uCEE4\uD53C\uB97C \uB0B4\uB824 \uB9C8\uC2DC\uACE0 \uC18C\uD30C\uC5D0 \uBAA8\uC5EC \uC218\uB2E4\uB97C \uB5A8\uC5B4\uC694.", { tint: "#F6EBDD" });
    F("sofa", 36, 2, 4, 2, { color: 11564618 });
    F("sofa", 36, 4, 2, 3, { color: 11564618 });
    F("coffee", 38, 5, 2, 1);
    F("counter", 45, 2, 1, 5, { face: "w", props: ["coffee", "sink", "micro"] });
    F("island", 43, 3, 1, 4, { turn: -Math.PI / 2 });
    F("table", 38, 7, 3, 2);
    Z(14, 23, 20, 10, "\uC6B0\uBB3C\uAC00", "\uBCBD\uB3CC \uBCBD\uC5D0 \uC3D9 \uB4E4\uC5B4\uAC04 4\uC778 \uBD80\uC2A4 \uC14B\uACFC, \uAE38\uCB49\uD55C \uC2A4\uD14C\uC778\uB9AC\uC2A4 \uCE74\uC6B4\uD130 \uC548 \uCC3D\uAC00 \uBCA4\uCE58\xB7\uC6D0\uD0C1\uC5D0 \uB458\uB7EC\uC549\uB294 \uACF3. \uB05D \uBCBD \uD0D5\uBE44 \uCE74\uC6B4\uD130\uC5D0\uC11C \uCEE4\uD53C\uB97C \uBC1B\uC544 \uC640\uC694.", { tint: "#ECEBEA" });
    for (const x of [18, 22, 26]) F("booth4", x, 29, 4, 3, { raw: true });
    F("fridge", 14, 20, 1, 1, { turn: Math.PI / 2, tall: true, raw: true });
    F("kitchenrow", 14, 21, 1, 3, { raw: true });
    F("pillar", 14, 24, 1, 1, { raw: true });
    F("kitchenrow", 14, 25, 1, 4, { raw: true, upper: true });
    F("mcdesk", 13, 32, 2, 1, { raw: true });
    F("islandbar", 16, 21, 1, 6, { raw: true });
    F("brickwall", 30, 29, 1, 1, { raw: true });
    F("stadium", 15, 33, 15, 6, { raw: true, a: 18, b: 27, cy: 36.2, r: 2.7 });
    F("winbench", 18, 38, 9, 1, { raw: true });
    F("round", 19, 35, 2, 2, { raw: true });
    F("round", 22, 34, 2, 2, { raw: true });
    F("round", 25, 35, 2, 2, { raw: true });
    F("counter", 32, 34, 1, 3, { raw: true, face: "w", props: ["sink", "coffee", "micro"] });
    F("purifier", 32, 37, 1, 1, { raw: true });
    F("fridge", 32, 38, 1, 1, { raw: true });
    R(51, 24, 5, 11, "\uC740\uD558\uC218", { raw: true, doors: [{ s: "w", from: 2, len: 2 }], planet: true });
    Z(52, 25, 3, 9, "\uD68C\uC758\uC2E4 \uC740\uD558\uC218", "\uD654\uC7A5\uC2E4 \uC606 \uAE38\uCB49\uD55C \uC720\uB9AC \uD68C\uC758\uC2E4\uC774\uC5D0\uC694.", { npc: false, tint: "#F4F2FA", raw: true });
    F("tv", 52, 33, 3, 1, { face: "n", raw: true });
    F("mtable", 53, 28, 1, 4, { raw: true });
    R(51, 35, 5, 5, "\uCC3D\uACE0", { closed: true, raw: true });
    Z(52, 36, 3, 3, "\uCC3D\uACE0", "", { npc: false, tint: "#E6E5EC", raw: true });
    F("crates", 52, 36, 2, 2, { raw: true });
    R(33, 29, 19, 11, "\uD3EC\uCEE4\uC2A4 \uC874", { raw: true, open: ["s", "e"], doors: [{ s: "w", from: 1, len: 3 }, { s: "n", from: 5, len: 2 }] });
    Z(34, 30, 17, 9, "\uD3EC\uCEE4\uC2A4 \uC874", "\uAC00\uC6B4\uB370 \uCE78\uB9C9\uC774 \uBD80\uC2A4\uC5D0\uC11C \uB458\uC774 \uB098\uB780\uD788 \uD398\uC5B4 \uD504\uB85C\uADF8\uB798\uBC0D\uC744 \uD558\uACE0, \uCC3D\uAC00 \uD558\uC774 \uCE74\uC6B4\uD130\uB098 \uBD81\uCABD \uBCBD\uC744 \uB530\uB77C \uB744\uC5C4\uB744\uC5C4 \uB193\uC778 \uB4F1\uBC1B\uC774 \uB192\uC740 1\uC778 \uC18C\uD30C\uC5D0\uC11C \uD63C\uC790 \uBAB0\uC785\uD574\uC694.", { raw: true });
    for (const x of [34, 36, 41, 44, 47, 50]) F("pod", x, 30, 1, 1, { raw: true });
    F("whiteboard", 39, 32, 1, 1, { raw: true });
    for (const x of [34, 43, 47]) F("table", x, 32, 2, 1, { raw: true });
    for (const x of [34, 37, 42, 45, 48]) F("pairbooth", x, 34, 3, 2, { raw: true, back: true });
    F("highbar", 34, 38, 17, 1, { raw: true });
  }
  if (f === 14) {
    const R2 = { raw: true };
    Z(1, 1, 54, 10, "\uBA54\uC778 \uC804\uC2DC\uC2E4", "\uD558\uB8E8\uB4E4\uC5D0\uC11C \uC9C0\uAE08 \uAC00\uC7A5 \uC0AC\uB791\uBC1B\uB294 \uB124\uCEF7\uB9CC\uD654\uB97C \uAC70\uB294 \uBA54\uC778 \uC804\uC2DC\uC2E4\uC774\uC5D0\uC694. \uBCF4\uB77C \uCE74\uD3AB \uB05D \uD070 \uC561\uC790\uAC00 1\uC704\uC608\uC694. \uC561\uC790\uB97C \uB204\uB974\uBA74 \uD06C\uAC8C \uBCF4\uACE0, \uC774\uC824\uC5D0 \uB2E4 \uAC19\uC774 \uADF8\uB9BC\uC744 \uADF8\uB9B4 \uC218 \uC788\uC5B4\uC694.", { tint: "#FFF6D6", ...R2 });
    F("runway", 31, 3, 4, 9, R2);
    F("showwall", 29, 1, 8, 1, { src: "work", slots: [0], big: true, sign: "\uAC00\uC7A5 \uC0AC\uB791\uBC1B\uC740 \uB9CC\uD654", ...R2 });
    F("scoopstand", 24, 2, 5, 3, { sign: "\uD558\uB8E8\uB4E4 \uC791\uAC00 \uCCB4\uD5D8", hint: "\uB9CC\uD654 \uADF8\uB9AC\uAE30", view: "author", action: "\uC791\uAC00 \uCCB4\uD5D8\uD558\uAE30", keeper: true, ...R2 });
    F("phonestand", 37, 2, 4, 2, R2);
    F("showwall", 12, 1, 12, 1, { src: "work", slots: [11, 9, 7, 5, 3, 1], ...R2 });
    F("showwall", 42, 1, 12, 1, { src: "work", slots: [2, 4, 6, 8, 10, 12], ...R2 });
    F("showwall", 2, 1, 9, 1, { src: "work", slots: [37, 38, 39], ...R2 });
    [5, 7, 9].forEach((y, i) => {
      F("showframe", 29, y, 1, 1, { src: "work", slot: 13 + i * 2, face: "e", ...R2 });
      F("showframe", 36, y, 1, 1, { src: "work", slot: 14 + i * 2, face: "w", ...R2 });
    });
    F("showwall", 1, 2, 1, 4, { src: "work", slots: [20, 22, 24], face: "e", ...R2 });
    F("showwall", 54, 2, 1, 4, { src: "work", slots: [19, 21, 23], face: "w", ...R2 });
    [11, 13, 15, 17, 19, 21].forEach((x, i) => F("showframe", x, 9, 1, 1, { src: "work", slot: 25 + i * 2, ...R2 }));
    [43, 45, 47, 49, 51, 53].forEach((x, i) => F("showframe", x, 9, 1, 1, { src: "work", slot: 26 + i * 2, ...R2 }));
    F("drawingeasel", 3, 7, 2, 2, R2);
    F("sketchstand", 7, 8, 1, 1, R2);
    for (const x of [14, 19, 44, 49]) F("bench", x, 6, 2, 1, R2);
    F("plant", 29, 3, 1, 1, R2);
    F("plant", 36, 3, 1, 1, R2);
    Z(1, 12, 26, 15, "\uC791\uAC00 \uC804\uC2DC\uC2E4", "\uD558\uB8E8\uB4E4 \uC778\uAE30 \uC791\uAC00 \uC5EC\uB35F \uBA85\uC758 \uC791\uD488\uC744 \uAC70\uB294 \uACF3\uC774\uC5D0\uC694. \uC791\uAC00\uB9C8\uB2E4 \uADF8 \uC791\uAC00\uC758 \uB9CC\uD654\uAC00 \uAC78\uB824 \uC788\uACE0, \uC568\uBC94\uBD81\uC73C\uB85C \uBAA8\uB4E0 \uB9CC\uD654\uB97C \uB118\uACA8 \uBCFC \uC218 \uC788\uACE0, \uBC29\uBA85\uB85D\uC5D0 \uC751\uC6D0\uC744 \uB0A8\uAE38 \uC218 \uC788\uC5B4\uC694.", { tint: "#F7F3FF", npc: false, ...R2 });
    const ZONE_TINTS = ["#E6DDF6", "#FFE9B5", "#FFD9E2", "#D5EFE3", "#D7E8FB", "#FFE2CC", "#DCD3FA", "#F6DFF4"];
    [12, 21].forEach((y, row) => [2, 8, 14, 20].forEach((x, col) => {
      const i = row * 4 + col;
      Z(x + 1, y + 1, 4, 5, `\uC791\uAC00 \uC791\uD488 ${i + 1}`, "", { tint: ZONE_TINTS[i], npc: false, ...R2 });
      F("showwall", x + 1, y + 1, 4, 1, { src: `a${i}`, slots: [0, 1], plate: i, ...R2 });
      F("showframe", x + 4, y + 3, 1, 1, { src: "cheer", slot: i, ...R2 });
      F("albumstand", x + 1, y + 3, 1, 1, { slot: i, ...R2 });
    }));
    Z(11, 28, 7, 11, "\uD034\uC988 \uC544\uCF00\uC774\uB4DC", "\uD558\uB8E8\uB4E4 \uB9CC\uD654\uB85C \uB178\uB798\uC640 \uB4DC\uB77C\uB9C8\xB7\uC601\uD654\uB97C \uB9DE\uD788\uB294 \uD034\uC988 \uC544\uCF00\uC774\uB4DC\uC608\uC694. \uC591\uC606 \uBC29\uC5D0 \uB4E4\uC5B4\uAC00 \uC561\uC790\uB97C \uB204\uB974\uBA74 \uBB38\uC81C\uB97C \uD480\uACE0, \uBE48 \uC561\uC790\uC5D0 \uB0B4 \uBB38\uC81C\uB97C \uAC78\uC5B4\uC694.", { tint: "#EDE6FB", checker: ["#F1EBFC", "#DFD4F6"], ...R2 });
    F("marquee", 11, 28, 7, 1, { text: "\uD034\uC988 \uC544\uCF00\uC774\uB4DC", color: "#9A82E6", post: 16757703, posts: true, size: 3.4, y0: 2.6, ...R2 });
    F("claw", 11, 30, 1, 1, { color: 16757703, ...R2 });
    F("claw", 17, 30, 1, 1, { color: 10275061, ...R2 });
    F("hbballoon", 11, 38, 1, 1, R2);
    F("hbballoon", 17, 38, 1, 1, R2);
    F("beanbag", 12, 33, 2, 2, R2);
    F("beanbag", 15, 33, 2, 2, R2);
    const quizRoom = (x, door, room, title, look) => {
      const inner = x + 1, side = door === "e" ? x + 8 : x + 1, far = door === "e" ? x + 1 : x + 8;
      R(x, 28, 10, 11, "", { raw: true, wall: look.wall, doors: [{ s: door, from: 7, len: 3 }] });
      Z(inner, 29, 8, 9, title, "", { tint: look.floor[0], checker: look.floor, npc: false, ...R2 });
      F("showwall", inner, 29, 8, 1, { src: room, slots: [0, 1, 2, 3], wallColor: 16777215, ...R2 });
      F("marquee", inner, 29, 8, 1, { text: title, color: look.sign, size: 3.6, ...R2 });
      F("showwall", far, 31, 1, 6, { src: room, slots: [4, 5, 6], face: far === x + 1 ? "e" : "w", wallColor: 16777215, ...R2 });
      F("showwall", side, 30, 1, 4, { src: room, slots: [7, 8], face: side === x + 1 ? "e" : "w", wallColor: 16777215, ...R2 });
      const mid = x + 3;
      F("beanbag", mid, 35, 2, 2, R2);
      F("beanbag", mid + 2, 35, 2, 2, R2);
      F("floaters", x + 4, 32, 2, 2, { chars: look.chars, colors: look.charColors, ...R2 });
    };
    quizRoom(1, "e", "song", "\uB178\uB798 \uB9DE\uCD94\uAE30 \uBC29", { wall: 16770026, floor: ["#FFEEF2", "#FFDCE5"], sign: "#FF8FA8", chars: ["\u266A", "\u266B", "\u266A", "\u266C", "\u266B"], charColors: ["#FF7FA3", "#9A82E6", "#FFB84D"] });
    F("jukebox", 2, 30, 1, 1, R2);
    F("mic", 2, 37, 1, 1, R2);
    quizRoom(18, "w", "drama", "\uB4DC\uB77C\uB9C8\xB7\uC601\uD654 \uB9DE\uCD94\uAE30 \uBC29", { wall: 14543867, floor: ["#EAF3FF", "#D6E7FB"], sign: "#6FB2EC", chars: ["\u2605", "\u2726", "\u2605", "\u2727", "\u2605"], charColors: ["#FFC94D", "#6FB2EC", "#9A82E6"] });
    F("clapper", 26, 30, 1, 1, R2);
    F("popcorn", 26, 37, 1, 1, R2);
    R(40, 13, 13, 26, "", { raw: true, wall: 2761784, doors: [{ s: "w", from: 20, len: 4 }] });
    Z(41, 14, 11, 24, "\uB9B4\uB808\uC774 \uB9CC\uD654 \uC0C1\uC601\uAD00", "\uB124\uCEF7\uB9CC\uD654\uB97C \uD55C \uD654\uC529 \uC774\uC5B4 \uADF8\uB9AC\uB294 \uB9B4\uB808\uC774 \uB9CC\uD654 \uC0C1\uC601\uAD00\uC774\uC5D0\uC694. \uC2A4\uD06C\uB9B0\uC5D0\uC11C 1\uD654\uBD80\uD130 \uCD5C\uC2E0 \uD654\uAE4C\uC9C0 \uC774\uC5B4\uC11C \uACC4\uC18D \uC0C1\uC601\uD574\uC694. \uC2A4\uD06C\uB9B0\uC744 \uB204\uB974\uBA74 \uC9C0\uAE08 \uB098\uC624\uB294 \uD654\uB97C \uD06C\uAC8C \uBCF4\uACE0, \uB2E4\uC74C \uD654\uB97C \uC774\uC5B4 \uADF8\uB824\uC694.", { tint: "#2B2540", ...R2 });
    F("cinemascreen", 41, 14, 11, 2, { src: "relay", slot: 29, ...R2 });
    F("runway", 45, 17, 3, 21, { color: 7217715, dash: 16767354, ...R2 });
    for (const y of [19, 22, 25, 28]) {
      F("cinemarow", 41, y, 4, 1, R2);
      F("cinemarow", 48, y, 4, 1, R2);
    }
    F("projector", 46, 36, 1, 1, { to: 15, ...R2 });
    F("showwall", 51, 31, 1, 7, { src: "relay", slots: [3, 2, 1], style: "film", face: "w", ...R2 });
    F("cinemamarquee", 39, 33, 1, 4, { face: "w", ...R2 });
    F("cinemaposter", 39, 31, 1, 1, { face: "w", src: "relay", slot: 0, ...R2 });
    F("cinemaposter", 39, 38, 1, 1, { face: "w", ...R2 });
    F("runway", 37, 33, 3, 4, { color: 10365759, dash: 16767354, ...R2 });
    Z(28, 27, 10, 12, "\uC624\uB298\uC758 \uD2B9\uC885", "\uD558\uB8E8\uB4E4 \uC778\uAE30 \uB9CC\uD654\uB97C \uC2E0\uBB38\uC73C\uB85C \uC5EE\uC740 \uAC00\uD310\uB300\uC608\uC694. \uC55E\uC5D0\uC11C F\uB97C \uB204\uB974\uBA74 \uC624\uB298\uC758 \uD2B9\uC885\uC744 \uD3BC\uCCD0 \uBD10\uC694. \uC11C\uCABD\uC740 \uD034\uC988 \uC544\uCF00\uC774\uB4DC, \uB3D9\uCABD \uBB38\uC740 \uB9B4\uB808\uC774 \uB9CC\uD654 \uC0C1\uC601\uAD00\uC774\uC5D0\uC694.", { tint: "#F8F6FF", npc: false, ...R2 });
    F("bench", 29, 29, 2, 1, { face: "s", ...R2 });
    F("bench", 35, 29, 2, 1, { face: "s", ...R2 });
    F("scoopstand", 30, 33, 6, 3, { face: "n", ...R2 });
    F("plant", 28, 37, 1, 1, R2);
    F("plant", 37, 37, 1, 1, R2);
  }
  return { f, rooms, furn, zones, portals, calls };
}
var FLOORS = {};
for (const f of CAMPUS) FLOORS[f] = makeFloor(f);
for (const a of ARENAS) FLOORS[a.f] = { f: a.f, rooms: a.rooms, furn: a.furn, zones: a.zones, portals: [], calls: [], arena: a, starts: a.starts };
var TOPS = {
  table: 0.44,
  bigtable: 0.44,
  desk: 0.44,
  ltable: 0.44,
  mtable: 0.44,
  wtable: 0.42,
  duo: 0.44,
  pairrow: 0.44,
  pairdesk: 0.44,
  focusdesk: 0.44,
  solo: 0.44,
  walltable: 0.47,
  round: 0.44,
  bistro: 0.47,
  boardgame: 0.44,
  coffee: 0.3,
  bench: 0.3,
  sofa: 0.48,
  winbench: 0.45,
  halfround: 0.5,
  ringtable: 0.48,
  counter: 0.58,
  kitchenrow: 0.62,
  lowcounter: 0.62,
  island: 0.56,
  hightable: 0.66,
  mcdesk: 0.5,
  lectern: 0.66,
  pingpong: 0.66,
  greenbox: 0.55,
  planter: 0.3,
  plant: 0.36,
  crates: 0.5
};
var topOf = (o) => o.lift ? 0 : o.top ?? TOPS[o.kind] ?? 0;
var walkThrough = (o) => WALK_THROUGH.has(o.kind) || !!o.walk;
function furnCells(fl, o, set) {
  if (o.kind === "screenwall") {
    const along = o.face === "w" ? o.h : o.w, len = along * S - 0.2, hh = Math.min(len * 9 / 16, o.big ? CEIL[fl.f] - 0.3 : 2.2), half = Math.min(len, hh * 16 / 9 * (o.wide || 1)) / S / 2, mid = along / 2;
    for (let i = Math.floor(mid - half); i < Math.ceil(mid + half); i++) o.face === "w" ? set(o.x, o.y + i) : set(o.x + i, o.y);
    return;
  }
  if (o.kind === "pairbooth") {
    for (let i = 0; i < 3; i++) set(o.x + i, o.y);
    set(o.x, o.y + 1);
    return;
  }
  if (o.kind === "booth4") {
    for (let i = 0; i < 2; i++) {
      set(o.x, o.y + i);
      set(o.x + 3, o.y + i);
    }
    set(o.x + 1, o.y);
    set(o.x + 2, o.y);
    return;
  }
  if (o.kind === "stadium") {
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (stadiumWall(o, x + 0.5, y + 0.5)) set(x, y);
    return;
  }
  if (walkThrough(o)) return;
  for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) set(x, y);
}
var WALK_THROUGH = /* @__PURE__ */ new Set(["hbmat", "runway", "cinemamarquee", "neonsign", "marquee", "floaters", "wallsign", "poster", "walldeco", "linelight", "bleacher", "arcbleacher", "flight", "brickdeck", "pebbles", "redsteps", "mirrorball", "trampoline", "ballpit"]);
var ELEV_SPAWN = [32.5, 15.5];
for (const fl of Object.values(FLOORS)) {
  const g = new Uint8Array(W * H);
  const set = (x, y) => {
    if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = 1;
  };
  for (let x = 0; x < W; x++) {
    set(x, 0);
    set(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    set(0, y);
    set(W - 1, y);
  }
  for (const r of fl.rooms) {
    const open = (s, i) => (r.doors || []).some((d) => d.s === s && i >= d.from && i < d.from + d.len);
    for (let i = 0; i < r.w; i++) {
      if (!open("n", i)) set(r.x + i, r.y);
      if (!open("s", i)) set(r.x + i, r.y + r.h - 1);
    }
    for (let i = 0; i < r.h; i++) {
      if (!open("w", i)) set(r.x, r.y + i);
      if (!open("e", i)) set(r.x + r.w - 1, r.y + i);
    }
  }
  fl.wgrid = g.slice();
  for (const o of fl.furn) furnCells(fl, o, set);
  fl.grid = g;
  const top = new Float32Array(W * H);
  for (const o of fl.furn) {
    const h = topOf(o);
    if (!h) continue;
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (x >= 0 && y >= 0 && x < W && y < H) top[y * W + x] = Math.max(top[y * W + x], h);
  }
  for (const o of fl.furn) {
    if (topOf(o) || o.lift && TOPS[o.kind] || walkThrough(o)) continue;
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (x >= 0 && y >= 0 && x < W && y < H && g[y * W + x]) top[y * W + x] = 0;
  }
  for (let i = 0; i < W * H; i++) if (fl.wgrid[i]) top[i] = 0;
  fl.top = top;
}
var startCells = (fl) => (fl.starts || [ELEV_SPAWN]).map(([x, y]) => Math.floor(y) * W + Math.floor(x));
for (const fl of Object.values(FLOORS)) {
  const reach = new Uint8Array(W * H), q = startCells(fl);
  for (const i of q) reach[i] = 1;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % W, y = q[i] / W | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, ni = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || fl.grid[ni] || reach[ni]) continue;
      reach[ni] = 1;
      q.push(ni);
    }
  }
  fl.reach = reach;
}
function stadiumWall(o, x, y) {
  const dy = y - o.cy;
  if (dy > 0 && x >= o.a) return false;
  const d = Math.hypot(x - clamp(x, o.a, o.b), dy);
  return d > o.r - 1 && d < o.r + 0.3;
}
var solid = (fl, x, y) => {
  x = Math.floor(x);
  y = Math.floor(y);
  return x < 0 || y < 0 || x >= W || y >= H || fl.grid[y * W + x] === 1;
};
var inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
function roomKeyAt(f, x, y) {
  const floor = FLOORS[f];
  if (!floor || !Number.isFinite(x) || !Number.isFinite(y)) return "";
  let best = null;
  for (const z of floor.zones || []) {
    if (/강의실|회의실|페어룸|상담실/.test(z.name) && inRect(z, x, y) && (!best || z.w * z.h < best.w * best.h)) best = z;
  }
  return best ? `${f}:${best.name}` : "";
}
var STEP = 0.13;
var bleacherLevel = (o, i) => Math.floor((o.down ? (o.axis === "y" ? o.h : o.w) - 1 - i : i) / (o.axis === "y" ? 2 : 1));
var ARC_STEP = 0.22;
var arcLevel = (o, x, y) => {
  if (o.face === "s" ? y < o.cy : x > o.cx) return 0;
  const r = Math.hypot(x - o.cx, (y - o.cy) / (o.sy || 1));
  if (r < o.stage) return 0.5;
  const k = Math.floor((r - o.r0) / o.tw);
  return r >= o.r0 && k < o.tiers ? k + 1 : 0;
};
var flightSteps = (o) => o.h0 === o.h1 ? 1 : (o.dir === "e" ? o.w : o.h) * 3;
function flightHeight(o, x, y) {
  const n = flightSteps(o), t = o.dir === "e" ? (x - o.x) / o.w : (y - o.y) / o.h, i = Math.min(n - 1, Math.floor(t * n));
  return Math.max(0.05, o.h0 + (o.h1 - o.h0) * (i + 1) / n);
}
var topAt = (fl, x, y) => {
  if (fl.fine) {
    let t = 0;
    bodyCells(x, y, (i) => {
      if (i >= 0 && fl.fine[i]) t = Math.max(t, fl.ftop[i]);
    });
    return t;
  }
  x = Math.floor(x);
  y = Math.floor(y);
  return x < 0 || y < 0 || x >= W || y >= H ? 0 : fl.top[y * W + x];
};
var CLIMB = 0.26;
function canStand(fl, x, y, feet) {
  if (fl.fine) {
    let ok = true;
    bodyCells(x, y, (i) => {
      if (ok && (i < 0 || fl.fine[i]) && (i < 0 || !fl.ftop[i] || fl.ftop[i] > feet + CLIMB)) ok = false;
    });
    return ok;
  }
  for (const [cx, cy] of [[x - R_ME, y - R_ME], [x + R_ME, y - R_ME], [x - R_ME, y + R_ME], [x + R_ME, y + R_ME]]) {
    const tx = Math.floor(cx), ty = Math.floor(cy);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
    const i = ty * W + tx;
    if (!fl.grid[i]) continue;
    const t = fl.top[i];
    if (!t || t > feet + CLIMB) return false;
  }
  return true;
}
function heightAt(fl, x, y) {
  for (const o of fl.furn) {
    if (!inRect(o, x, y)) continue;
    if (o.kind === "flight") return flightHeight(o, x, y);
    if (o.kind === "arcbleacher") return arcLevel(o, x, y) * ARC_STEP;
    if (o.kind === "bleacher") return (bleacherLevel(o, Math.floor(o.axis === "y" ? y - o.y : x - o.x)) + 1) * STEP;
    if (o.kind === "brickdeck") return DECK_H;
    if (o.kind === "redsteps") return (Math.floor(y - o.y) === 0 ? 2 : 1) * 0.1;
    if (o.kind === "trampoline") return 0.2;
    if (o.kind === "ballpit") return -0.22;
  }
  return 0;
}
var R_ME = 0.28;
var bagSpot = (o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2, yaw: o.yaw || 0 });
function applyLie(doll, lie) {
  const r = doll.root;
  r.rotation.order = "YXZ";
  if (lie) {
    r.rotation.set(-Math.PI / 2 + 0.3, lie.yaw, 0);
    r.position.x += Math.sin(lie.yaw) * 0.42;
    r.position.z += Math.cos(lie.yaw) * 0.42;
    r.position.y += 0.5;
    doll.blob.visible = false;
  } else if (r.rotation.x) {
    r.rotation.set(0, 0, 0);
    doll.blob.visible = true;
  }
}
var fits = (fl, x, y) => {
  if (fl.fine) {
    let ok = true;
    bodyCells(x, y, (i) => {
      if (i < 0 || fl.fine[i]) ok = false;
    });
    return ok;
  }
  return !solid(fl, x - R_ME, y - R_ME) && !solid(fl, x + R_ME, y - R_ME) && !solid(fl, x - R_ME, y + R_ME) && !solid(fl, x + R_ME, y + R_ME);
};
function sweep(fl, ax, ay, bx, by) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (R_ME * 0.8)));
  for (let k = 0; k <= n; k++) if (!fits(fl, ax + (bx - ax) * k / n, ay + (by - ay) * k / n)) return false;
  return true;
}
function nearestFree(fl, x, y) {
  if (fl.fine) {
    const R = fl.nreach, cx = Math.floor(x), cy = Math.floor(y);
    if (cx >= 0 && cy >= 0 && cx < W && cy < H && R[cy * W + cx] && fits(fl, x, y) && sweep(fl, x, y, cx + 0.5, cy + 0.5)) return [x, y];
    let best2 = null, bd2 = Infinity;
    for (let rad = 0; rad < Math.max(W, H) && !(best2 && bd2 <= rad - 1); rad++) for (let ty = cy - rad; ty <= cy + rad; ty++) for (let tx = cx - rad; tx <= cx + rad; tx++) {
      if (Math.max(Math.abs(tx - cx), Math.abs(ty - cy)) !== rad || tx < 0 || ty < 0 || tx >= W || ty >= H || !R[ty * W + tx]) continue;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const px = tx + (sx + 0.5) / 4, py = ty + (sy + 0.5) / 4, d = Math.hypot(px - x, py - y);
        if (d < bd2 && fits(fl, px, py) && sweep(fl, px, py, tx + 0.5, ty + 0.5)) {
          bd2 = d;
          best2 = [px, py];
        }
      }
    }
    if (best2) return best2;
  }
  if (fits(fl, x, y) && fl.reach[Math.floor(y) * W + Math.floor(x)]) return [x, y];
  let best = null, bd = Infinity;
  for (let rad = 0; rad < Math.max(W, H) && !best; rad++) for (let ty = Math.floor(y) - rad; ty <= Math.floor(y) + rad; ty++) for (let tx = Math.floor(x) - rad; tx <= Math.floor(x) + rad; tx++) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H || !fl.reach[ty * W + tx]) continue;
    const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
    if (d < bd) {
      bd = d;
      best = [tx + 0.5, ty + 0.5];
    }
  }
  return best || [...ELEV_SPAWN];
}
var FN = 8;
var NW = W * FN;
var NH = H * FN;
function bodyCells(x, y, f) {
  const x0 = Math.floor((x - R_ME) * FN), x1 = Math.floor((x + R_ME) * FN), y0 = Math.floor((y - R_ME) * FN), y1 = Math.floor((y + R_ME) * FN), r2 = R_ME * R_ME;
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const dx = x - clamp(x, i / FN, (i + 1) / FN), dy = y - clamp(y, j / FN, (j + 1) / FN);
    if (dx * dx + dy * dy >= r2) continue;
    f(i < 0 || j < 0 || i >= NW || j >= NH ? -1 : j * NW + i);
  }
}
function buildNav(fl) {
  const walk = new Uint8Array(W * H), ex = new Uint8Array(W * H), ey = new Uint8Array(W * H), nreach = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) walk[y * W + x] = fl.fine ? +fits(fl, x + 0.5, y + 0.5) : +!fl.grid[y * W + x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!walk[i]) continue;
    if (x + 1 < W && walk[i + 1]) ex[i] = fl.fine ? +sweep(fl, x + 0.5, y + 0.5, x + 1.5, y + 0.5) : 1;
    if (y + 1 < H && walk[i + W]) ey[i] = fl.fine ? +sweep(fl, x + 0.5, y + 0.5, x + 0.5, y + 1.5) : 1;
  }
  Object.assign(fl, { walk, ex, ey });
  const q = startCells(fl);
  for (const i of q) nreach[i] = 1;
  for (let k = 0; k < q.length; k++) for (const n of navNext(fl, q[k])) if (!nreach[n]) {
    nreach[n] = 1;
    q.push(n);
  }
  fl.nreach = nreach;
}
function navNext(fl, i) {
  const out = [], x = i % W;
  if (fl.ex[i]) out.push(i + 1);
  if (x > 0 && fl.ex[i - 1]) out.push(i - 1);
  if (fl.ey[i]) out.push(i + W);
  if (i >= W && fl.ey[i - W]) out.push(i - W);
  return out;
}
for (const fl of Object.values(FLOORS)) buildNav(fl);
export {
  ARC_STEP,
  BRAND,
  CAMPUS,
  CEIL,
  CLIMB,
  DECK_H,
  DOLL,
  ELEV_SPAWN,
  FH,
  FLOORS,
  FLOOR_INFO,
  FN,
  GROW,
  GROW_AT,
  H,
  HAND,
  INK,
  NAVY,
  NH,
  NW,
  R_ME,
  S,
  STEP,
  TOPS,
  VIEW,
  W,
  WALK_THROUGH,
  WALL,
  WEAK,
  applyLie,
  arcLevel,
  bagSpot,
  bleacherLevel,
  buildNav,
  canStand,
  clamp,
  fits,
  flightHeight,
  flightSteps,
  floorY,
  furnCells,
  gy,
  hash,
  heightAt,
  inRect,
  inside,
  lerp,
  makeFloor,
  narrow,
  navNext,
  nearestFree,
  rng,
  roomKeyAt,
  solid,
  stadiumWall,
  sweep,
  tX,
  tY,
  topAt,
  topOf,
  walkThrough,
  wx,
  wz
};
