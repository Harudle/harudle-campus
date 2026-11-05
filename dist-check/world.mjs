// src/engine/world.ts
var W = 56;
var H = 34;
var S = 1.25;
var FH = 4.6;
var WALL = 0.9;
var DOLL = 1.12;
var CEIL = { 11: 3.5, 12: 4.4, 13: 3.5, 14: 3.8 };
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
var FLOOR_INFO = { 11: "\uBC30\uC6C0\uC774 \uC2DC\uC791\uB418\uB294 \uACF5\uAC04", 12: "\uD568\uAED8, \uB610 \uB530\uB85C \uD559\uC2B5\uC758 \uACF5\uAC04", 13: "\uBAB0\uC785\uD558\uACE0 \uBC1C\uD45C\uD558\uB294 \uACF5\uAC04", 14: "\uB180\uACE0 \uC26C\uC5B4 \uAC00\uB294 \uB180\uC774\uD130" };
function makeFloor(f) {
  const rooms = [], furn = [], zones = [], portals = [], calls = [];
  const R = (x, y, w, h, name, o = {}) => rooms.push({ x, y, w, h, name, ...o });
  const F = (kind, x, y, w, h, o = {}) => furn.push({ kind, x, y, w, h, ...o });
  const Z = (x, y, w, h, name, desc, o = {}) => zones.push({ x, y, w, h, name, desc, ...o });
  const P = (kind, x, y, w, h, to, spawn, label) => portals.push({ kind, x, y, w, h, to, spawn, label });
  const closed = (x, y, w, h, name, tint = "#E6E5EC") => {
    R(x, y, w, h, name, { closed: true });
    Z(x + 1, y + 1, w - 2, h - 2, name, "", { npc: false, tint });
  };
  R(18, 12, 28, 10, "", { doors: [{ s: "n", from: 11, len: 5 }, { s: "s", from: 11, len: 5 }], core: true });
  Z(19, 13, 26, 8, "\uC5D8\uB9AC\uBCA0\uC774\uD130 \uD640", "\uC5D8\uB9AC\uBCA0\uC774\uD130 6\uB300. \uC55E\uC5D0 \uC11C\uC11C F\uB97C \uB204\uB974\uBA74 \uB2E4\uB978 \uCE35\uC73C\uB85C \uAC00\uC694.", { npc: false, tint: "#EEF0F5" });
  for (const x of [20, 23, 26, 36, 39, 42]) {
    F("elev", x, 13, 2, 1);
    calls.push({ x, y: 14, w: 2, h: 1 });
  }
  F("wsign", 30, 18, 3, 1);
  F("sofa", 20, 19, 4, 2);
  F("sofa", 39, 19, 4, 2);
  F("plant", 25, 19, 2, 2);
  F("plant", 36, 19, 2, 2);
  closed(47, 1, 9, 12, "\uACF5\uC870\uC2E4");
  F("acunit", 49, 3, 3, 2);
  F("acunit", 49, 7, 3, 2);
  F("acunit", 52, 3, 2, 6);
  closed(47, 12, 9, 11, "\uD654\uC7A5\uC2E4", "#E3EEF3");
  F("door", 47, 15, 1, 2);
  F("door", 47, 19, 1, 2);
  F("wc", 49, 14, 5, 7);
  const meetings = (names, desc) => {
    [[33, 1, "e"], [33, 5, "e"], [41, 1, "w"], [41, 5, "w"]].forEach(([x, y, s], i) => {
      R(x, y, 6, 5, names[i], { doors: [{ s, from: 2, len: 1 }], planet: true });
      Z(x + 1, y + 1, 4, 3, `\uD68C\uC758\uC2E4 ${names[i]}`, desc, { npc: false, tint: "#F4F2FA" });
      F("tv", x + 1, y + 1, 4, 1);
      F("mtable", x + 2, y + 2, 2, 1);
    });
  };
  if (f === 11) {
    R(1, 1, 14, 21, "\uD070 \uAC15\uC758\uC2E4", { doors: [{ s: "e", from: 5, len: 2 }, { s: "e", from: 15, len: 2 }] });
    Z(2, 2, 12, 19, "\uD070 \uAC15\uC758\uC2E4", "\uACF5\uD1B5 \uC218\uC5C5\uACFC \uC678\uBD80 \uAC15\uC5F0\uC774 \uC5F4\uB9AC\uB294 \uACF3. \uD06C\uB8E8 \uC804\uC6D0\uC774 \uD55C\uC790\uB9AC\uC5D0 \uBAA8\uC5EC\uC694.");
    F("screen", 4, 2, 7, 1);
    F("lectern", 12, 3, 1, 1);
    for (const y of [6, 9, 12, 15, 18]) {
      F("ltable", 3, y, 4, 1);
      F("ltable", 8, y, 4, 1);
    }
    Z(16, 1, 17, 10, "\uCF54\uC6CC\uD0B9 \uC874", "\uBC14\uD034 \uB2EC\uB9B0 \uD14C\uC774\uBE14\uACFC \uCC9C\uC7A5\uC5D0\uC11C \uB0B4\uB824\uC624\uB294 \uCF58\uC13C\uD2B8. \uC778\uC6D0\uC5D0 \uB9DE\uCDB0 \uBD99\uC600\uB2E4 \uB5BC\uC5C8\uB2E4 \uD574\uC694.", { tint: "#FFF8DC" });
    for (const [x, y] of [[17, 3], [21, 3], [17, 7], [21, 7]]) F("wtable", x, y, 2, 2);
    F("counter", 25, 1, 6, 1, { props: ["sink", "coffee", "micro"] });
    F("purifier", 31, 1, 1, 1);
    F("fridge", 32, 1, 1, 1);
    F("bigtable", 25, 6, 7, 2);
    F("plant", 30, 3, 2, 2);
    Z(25, 2, 8, 7, "\uC6B0\uBB3C\uAC00", "\uD0D5\uBE44\uC2E4 \uC55E \uBE45\uD14C\uC774\uBE14. \uC18C\uBB38\uC774 \uD37C\uC9C0\uB294 \uACF3\uC774\uB77C \uC6B0\uBB3C\uAC00\uB77C\uACE0 \uBD88\uB7EC\uC694.", { npc: true });
    meetings(["\uAE08\uC131", "\uC218\uC131", "\uC9C0\uAD6C", "\uD654\uC131"], "\uC6D0\uC2DC\uBD80\uD130 \uC6B0\uC8FC\uAE4C\uC9C0. 11\uCE35 \uD68C\uC758\uC2E4\uC740 \uD589\uC131 \uC774\uB984\uC774\uC5D0\uC694.");
    R(1, 24, 16, 9, "\uC606 \uAC15\uC758\uC2E4", { doors: [{ s: "n", from: 13, len: 2 }] });
    Z(2, 25, 14, 7, "\uC606 \uAC15\uC758\uC2E4", "\uBD84\uBC18 \uC218\uC5C5\uACFC \uD398\uC5B4 \uD65C\uB3D9\uC774 \uC5F4\uB9AC\uB294 \uAC15\uC758\uC2E4\uC774\uC5D0\uC694.");
    F("screen", 3, 25, 7, 1);
    F("lectern", 12, 25, 1, 1);
    for (const y of [27, 30]) {
      F("ltable", 3, y, 4, 1);
      F("ltable", 8, y, 4, 1);
    }
    R(17, 24, 13, 9, "\uCE94\uD2F4", { doors: [{ s: "n", from: 9, len: 2 }] });
    Z(18, 25, 11, 7, "\uCE94\uD2F4", "\uAC04\uC2DD\uACFC \uC74C\uB8CC\uB97C \uAEBC\uB0B4 \uBA39\uB294 \uACF3. \uC815\uC218\uAE30\uC640 \uCEE4\uD53C \uBA38\uC2E0\uC774 \uC788\uC5B4\uC694.", { tint: "#FFF4E0" });
    F("counter", 18, 25, 5, 1, { props: ["sink", "micro", "coffee"] });
    F("purifier", 23, 25, 1, 1);
    F("fridge", 24, 25, 1, 1);
    F("vending", 28, 25, 1, 1);
    F("table", 19, 28, 4, 2);
    F("table", 24, 28, 4, 2);
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
    Z(1, 1, 5, 22, "\uC2A4\uD0C0\uD2B8\uB799 \uACC4\uB2E8", "13\uCE35 \uC2A4\uD0C0\uD2B8\uB799\uC73C\uB85C \uC774\uC5B4\uC9C0\uB294 \uACC4\uB2E8\uC2DD \uC88C\uC11D. \uC544\uB798\uCABD \uACC4\uB2E8\uC73C\uB85C \uC62C\uB77C\uAC00\uC694.", { tint: "#F2F4E2" });
    for (const y of [3, 7, 11, 15]) F("bench", 2, y, 3, 1);
    P("stairs", 2, 19, 3, 3, 13, [3.5, 27.5], "13\uCE35 \uC2A4\uD0C0\uD2B8\uB799");
    R(7, 1, 24, 10, "\uB77C\uC774\uBE0C\uB7EC\uB9AC", { doors: [{ s: "w", from: 4, len: 2 }, { s: "s", from: 4, len: 3 }, { s: "s", from: 16, len: 3 }] });
    Z(8, 2, 22, 8, "\uB77C\uC774\uBE0C\uB7EC\uB9AC", "12\xB713\uCE35\uC744 \uC787\uB294 \uBCF5\uCE35 \uC11C\uC7AC. \uC6D0\uD615 \uC11C\uAC00\uC5D0 \uAE30\uC220\uC11C\uC640 \uAC1C\uBC1C \uBB38\uD654 \uCC45\uC774 \uBE7C\uACE1\uD574\uC694.", { tint: "#FBF4E6" });
    F("tower", 23, 3, 5, 5);
    F("shelf", 8, 2, 13, 1);
    F("table", 10, 5, 4, 2);
    F("table", 16, 5, 4, 2);
    F("redsteps", 15, 8, 4, 2);
    F("beanbag", 20, 8, 2, 2);
    F("beanbag", 8, 8, 2, 2, { yaw: Math.PI / 2 });
    meetings(["\uBCF4\uC774\uC800", "\uC544\uD3F4\uB85C", "\uB514\uC2A4\uCEE4\uBC84\uB9AC", "\uD5C8\uBE14"], "12\uCE35 \uD68C\uC758\uC2E4\uC740 \uC6B0\uC8FC \uD0D0\uC0AC\uC120 \uC774\uB984\uC774\uC5D0\uC694.");
    Z(7, 12, 10, 11, "\uCF54\uC6CC\uD0B9 \uC874", "\uCE78\uB9C9\uC774 \uB108\uBA38\uB85C \uC790\uC720\uB86D\uAC8C \uD37C\uC838\uC11C \uC77C\uD558\uB294 \uC790\uB9AC\uC608\uC694.", { tint: "#FFF8DC" });
    F("partition", 8, 13, 1, 8);
    for (const [x, y] of [[10, 13], [13, 13], [10, 17], [13, 17]]) F("wtable", x, y, 2, 2);
    F("plant", 14, 20, 2, 2);
    R(1, 24, 17, 9, "\uC791\uC740 \uAC15\uC758\uC2E4", { doors: [{ s: "n", from: 13, len: 2 }] });
    Z(2, 25, 15, 7, "\uC791\uC740 \uAC15\uC758\uC2E4", "\uC791\uC740 \uADDC\uBAA8 \uC218\uC5C5\uACFC \uC2A4\uD130\uB514\uAC00 \uC5F4\uB9AC\uB294 \uAC15\uC758\uC2E4\uC774\uC5D0\uC694.");
    F("screen", 3, 25, 8, 1);
    F("lectern", 13, 25, 1, 1);
    for (const y of [27, 30]) {
      F("ltable", 3, y, 4, 1);
      F("ltable", 9, y, 4, 1);
    }
    R(18, 24, 10, 9, "\uCE94\uD2F4", { doors: [{ s: "n", from: 4, len: 2 }] });
    Z(19, 25, 8, 7, "\uCE94\uD2F4", "\uAC04\uC2DD\uACFC \uC74C\uB8CC\uB97C \uAEBC\uB0B4 \uBA39\uB294 \uACF3. \uC815\uC218\uAE30\uC640 \uCEE4\uD53C \uBA38\uC2E0\uC774 \uC788\uC5B4\uC694.", { tint: "#FFF4E0" });
    F("fridge", 19, 25, 1, 1);
    F("purifier", 20, 25, 1, 1);
    F("counter", 24, 25, 3, 1, { props: ["sink", "coffee"] });
    F("table", 19, 28, 3, 2);
    F("table", 23, 28, 3, 2);
    Z(28, 24, 6, 9, "\uD3F0\uBD80\uC2A4", "\uC62C\uB9AC\uBE0C\uBE5B \uC720\uB9AC\uBB38 1\uC778 \uBD80\uC2A4. \uD1B5\uD654\uB098 \uD654\uC0C1 \uD68C\uC758\uAC00 \uD544\uC694\uD560 \uB54C \uC3D9 \uB4E4\uC5B4\uAC00\uC694.", { npc: false });
    for (const [x, y] of [[29, 25], [31, 25], [29, 29], [31, 29]]) F("booth", x, y, 2, 3);
    R(34, 24, 13, 9, "\uCF54\uCE58\uB8F8", { doors: [{ s: "n", from: 3, len: 2 }, { s: "n", from: 9, len: 2 }] });
    Z(35, 25, 11, 7, "\uCF54\uCE58\uB8F8", "\uCF54\uCE58\uB4E4\uC774 \uC77C\uD558\uB294 \uC624\uD508 \uB370\uC2A4\uD06C\uC608\uC694.");
    F("desk", 36, 27, 4, 2);
    F("desk", 41, 27, 4, 2);
    F("storage", 36, 31, 9, 1);
    closed(47, 22, 9, 11, "\uC11C\uBC84\uC2E4", "#E2E4EE");
    for (const x of [49, 51, 53]) F("rack", x, 24, 1, 7);
  }
  if (f === 13) {
    R(1, 1, 30, 10, "\uB77C\uC774\uBE0C\uB7EC\uB9AC", { doors: [{ s: "s", from: 16, len: 3 }, { s: "s", from: 24, len: 3 }, { s: "e", from: 4, len: 2 }] });
    Z(2, 2, 28, 8, "\uB77C\uC774\uBE0C\uB7EC\uB9AC (\uC704\uCE35)", "\uBCF5\uCE35 \uC11C\uC7AC\uC758 \uC704\uCE35. \uB09C\uAC04 \uC544\uB798\uB85C \uC6D0\uD615 \uC11C\uAC00\uC640 12\uCE35\uC774 \uB0B4\uB824\uB2E4\uBCF4\uC5EC\uC694.", { tint: "#FBF4E6" });
    F("void", 21, 2, 8, 7);
    F("shelf", 2, 2, 17, 1);
    F("sofa", 3, 6, 5, 2);
    F("table", 11, 5, 4, 2);
    F("beanbag", 14, 8, 2, 2);
    F("beanbag", 8, 8, 2, 2, { yaw: Math.PI / 2 });
    R(1, 11, 12, 22, "\uC2A4\uD0C0\uD2B8\uB799", { doors: [{ s: "e", from: 3, len: 2 }, { s: "e", from: 16, len: 3 }] });
    Z(2, 12, 10, 20, "\uC2A4\uD0C0\uD2B8\uB799", "\uD14C\uCF54\uD1A1\uACFC \uC120\uBC30 \uAE30\uC218\uC640\uC758 \uB9CC\uB0A8\uC774 \uC5F4\uB9AC\uB294 \uACC4\uB2E8\uC2DD \uBC1C\uD45C \uACF5\uAC04\uC774\uC5D0\uC694.", { tint: "#F2F4E2" });
    F("screenwall", 3, 12, 8, 1);
    F("bleacher", 4, 15, 8, 13, { axis: "y" });
    P("stairs", 2, 29, 3, 3, 12, [3.5, 17.5], "12\uCE35 \uACC4\uB2E8");
    R(35, 1, 12, 9, "\uC6B0\uBB3C\uAC00", { doors: [{ s: "s", from: 6, len: 2 }] });
    Z(36, 2, 10, 7, "\uC6B0\uBB3C\uAC00", "\uAC00\uBCCD\uAC8C \uBAA8\uC5EC \uC218\uB2E4\uB97C \uB098\uB204\uB294 \uACF3. \uD0D5\uBE44\uC2E4 \uC55E \uBE45\uD14C\uC774\uBE14\uC5D0\uC11C \uC548\uBD80\uB97C \uBB3C\uC5B4\uC694.", { tint: "#FFF8DC" });
    F("counter", 36, 2, 6, 1, { props: ["sink", "coffee", "micro"] });
    F("purifier", 42, 2, 1, 1);
    F("fridge", 43, 2, 1, 1);
    F("purifier", 44, 2, 1, 1);
    F("bigtable", 37, 5, 5, 2);
    F("round", 43, 5, 2, 2);
    Z(14, 23, 20, 10, "\uCF54\uC6CC\uD0B9 \uC874", "\uB113\uAC8C \uD37C\uC838\uC11C \uC77C\uD558\uB294 \uC790\uB9AC. \uD14C\uC774\uBE14\uC744 \uBD99\uC5EC \uD300 \uC791\uC5C5\uB3C4 \uD574\uC694.", { tint: "#FFF8DC" });
    for (const [x, y] of [[15, 24], [19, 24], [15, 28], [19, 28]]) F("wtable", x, y, 2, 2);
    F("bigtable", 24, 25, 7, 2);
    F("planter", 24, 31, 9, 1);
    F("purifier", 32, 24, 1, 1);
    R(35, 23, 21, 5, "\uD3EC\uCEE4\uC2A4 \uC874", { doors: [{ s: "w", from: 1, len: 3 }, { s: "n", from: 6, len: 3 }, ...[2, 5, 8, 11, 14, 17].map((from) => ({ s: "s", from, len: 2 }))] });
    Z(36, 24, 19, 3, "\uD3EC\uCEE4\uC2A4 \uC874", "\uD63C\uC790 \uAE4A\uAC8C \uBAB0\uC785\uD558\uB294 \uC790\uB9AC. \uB4A4\uCABD \uD398\uC5B4\uB8F8\uC5D0\uC11C\uB294 \uB458\uC774 \uBD99\uC5B4 \uC549\uC544 \uCF54\uB4DC\uB97C \uC9DC\uC694.");
    F("focusdesk", 38, 24, 3, 1);
    F("focusdesk", 45, 24, 3, 1);
    F("focusdesk", 50, 24, 4, 1);
    [36, 39, 42, 45, 48, 51].forEach((x, i) => {
      R(x, 27, 4, 7, `\uD398\uC5B4\uB8F8 0${i + 1}`, { doors: [{ s: "n", from: 1, len: 2 }], planet: true, small: true });
      Z(x + 1, 28, 2, 5, `\uD398\uC5B4\uB8F8 0${i + 1}`, "\uB450 \uC0AC\uB78C\uC774 \uD55C \uBAA8\uB2C8\uD130\uB97C \uB098\uB780\uD788 \uBCF4\uB294 \uBC29\uC774\uC5D0\uC694.", { npc: i % 2 === 0, tint: "#F4F2FA" });
      F("pairdesk", x + 1, 32, 2, 1);
    });
    R(13, 13, 5, 8, "\uC740\uD558\uC218", { doors: [{ s: "n", from: 1, len: 3 }], planet: true });
    Z(14, 14, 3, 6, "\uD68C\uC758\uC2E4 \uC740\uD558\uC218", "13\uCE35\uC758 \uB2E8 \uD558\uB098\uBFD0\uC778 \uD68C\uC758\uC2E4\uC774\uC5D0\uC694.", { npc: false, tint: "#F4F2FA" });
    F("mtable", 15, 16, 1, 2);
    F("tv", 14, 19, 3, 1);
  }
  if (f === 14) {
    R(1, 1, 14, 11, "\uB178\uB798\uBC29", { doors: [{ s: "e", from: 7, len: 2 }] });
    Z(2, 2, 12, 9, "\uB178\uB798\uBC29", "\uB9C8\uC774\uD06C \uB450 \uAC1C\uC640 \uBBF8\uB7EC\uBCFC. \uD68C\uC2DD 2\uCC28\uB294 \uC5EC\uAE30\uC11C \uD574\uACB0\uD574\uC694.", { tint: "#F3E9FF" });
    F("karaoke", 3, 2, 6, 1);
    F("sofa", 3, 7, 7, 2);
    F("coffee", 5, 5, 3, 1);
    F("mirrorball", 6, 4, 1, 1);
    F("speaker", 11, 2, 1, 1);
    F("speaker", 2, 2, 1, 1);
    R(1, 12, 14, 11, "\uAC8C\uC784\uBC29", { doors: [{ s: "e", from: 4, len: 2 }] });
    Z(2, 13, 12, 9, "\uAC8C\uC784\uBC29", "\uC624\uB77D\uAE30\uC640 \uCF58\uC194 \uAC8C\uC784. \uBBF8\uC158 \uB05D\uB09C \uB0A0 \uD55C \uD310\uC529 \uBD99\uC5B4\uC694.", { tint: "#E8F0FF" });
    for (const x of [3, 5, 7, 9]) F("arcade", x, 13, 1, 1);
    F("tv", 3, 18, 4, 1);
    F("beanbag", 3, 20, 2, 2, { yaw: Math.PI });
    F("beanbag", 6, 20, 2, 2, { yaw: Math.PI });
    F("sofa", 9, 19, 4, 2);
    Z(16, 1, 17, 10, "\uD2B8\uB7A8\uD384\uB9B0", "\uC62C\uB77C\uAC00\uBA74 \uC800\uC808\uB85C \uD1B5\uD1B5 \uD280\uC5B4\uC694. \uBA38\uB9AC \uC2DD\uD788\uAE30\uC5D0 \uB531\uC774\uC5D0\uC694.", { tint: "#FFF8DC" });
    F("trampoline", 17, 2, 5, 5);
    F("trampoline", 23, 2, 5, 5);
    F("trampoline", 17, 7, 4, 3, { small: true });
    F("plant", 30, 2, 2, 2);
    R(34, 1, 13, 9, "\uBCFC\uD480", { doors: [{ s: "s", from: 5, len: 3 }] });
    Z(35, 2, 11, 7, "\uBCFC\uD480", "\uC54C\uB85D\uB2EC\uB85D \uACF5\uC774 \uAC00\uB4DD\uD55C \uBCFC\uD480. \uB4E4\uC5B4\uAC00\uBA74 \uBAB8\uC774 \uC3D9 \uC7A0\uACA8\uC694.", { tint: "#FFF1F0" });
    F("ballpit", 36, 2, 8, 5);
    F("slide", 44, 2, 2, 5);
    Z(1, 24, 32, 9, "\uB180\uC774 \uAD11\uC7A5", "\uD0C1\uAD6C, \uBCF4\uB4DC\uAC8C\uC784, \uD3EC\uD1A0\uC874. \uC26C\uB294 \uC2DC\uAC04\uB9C8\uB2E4 \uC0AC\uB78C\uC774 \uBAA8\uC5EC\uC694.", { tint: "#E9F4E6" });
    F("pingpong", 3, 26, 4, 2);
    F("pingpong", 9, 26, 4, 2);
    F("boardgame", 16, 26, 3, 2);
    F("boardgame", 21, 26, 3, 2);
    F("sculpture", 27, 26, 3, 3);
    F("planter", 2, 32, 30, 1);
    F("parasol", 16, 30, 2, 2);
    F("parasol", 21, 30, 2, 2);
    R(34, 24, 13, 9, "\uC27C\uD130", { doors: [{ s: "n", from: 5, len: 3 }] });
    Z(35, 25, 11, 7, "\uC27C\uD130", "\uC870\uC6A9\uD788 \uB215\uAC70\uB098 \uAE30\uB300\uC5B4 \uC26C\uB294 \uBC29. \uBE48\uBC31\uC774 \uB109\uB109\uD574\uC694.", { tint: "#EEF0F8" });
    for (const [x, y] of [[36, 26], [39, 26], [42, 26], [36, 29], [39, 29]]) F("beanbag", x, y, 2, 2, { yaw: Math.PI });
    F("sofa", 42, 29, 4, 2);
    F("plant", 44, 25, 2, 2);
    closed(47, 23, 9, 10, "\uCC3D\uACE0");
    F("crates", 49, 25, 4, 3);
    F("crates", 49, 29, 3, 2);
  }
  return { f, rooms, furn, zones, portals, calls };
}
var FLOORS = {};
for (const f of [11, 12, 13, 14]) FLOORS[f] = makeFloor(f);
var WALK_THROUGH = /* @__PURE__ */ new Set(["bleacher", "redsteps", "mirrorball", "trampoline", "ballpit"]);
var ELEV_SPAWN = [31.5, 16.5];
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
  for (const o of fl.furn) {
    if (WALK_THROUGH.has(o.kind)) continue;
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) set(x, y);
  }
  fl.grid = g;
}
for (const fl of Object.values(FLOORS)) {
  const reach = new Uint8Array(W * H), q = [Math.floor(ELEV_SPAWN[1]) * W + Math.floor(ELEV_SPAWN[0])];
  reach[q[0]] = 1;
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
var solid = (fl, x, y) => {
  x = Math.floor(x);
  y = Math.floor(y);
  return x < 0 || y < 0 || x >= W || y >= H || fl.grid[y * W + x] === 1;
};
var inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
var STEP = 0.13;
var bleacherLevel = (o, i) => Math.floor((o.down ? (o.axis === "y" ? o.h : o.w) - 1 - i : i) / (o.axis === "y" ? 2 : 1));
function heightAt(fl, x, y) {
  for (const o of fl.furn) {
    if (!inRect(o, x, y)) continue;
    if (o.kind === "bleacher") return (bleacherLevel(o, Math.floor(o.axis === "y" ? y - o.y : x - o.x)) + 1) * STEP;
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
var fits = (fl, x, y) => !solid(fl, x - R_ME, y - R_ME) && !solid(fl, x + R_ME, y - R_ME) && !solid(fl, x - R_ME, y + R_ME) && !solid(fl, x + R_ME, y + R_ME);
function nearestFree(fl, x, y) {
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
export {
  BRAND,
  CEIL,
  DOLL,
  ELEV_SPAWN,
  FH,
  FLOORS,
  FLOOR_INFO,
  H,
  HAND,
  INK,
  NAVY,
  R_ME,
  S,
  STEP,
  VIEW,
  W,
  WALK_THROUGH,
  WALL,
  WEAK,
  applyLie,
  bagSpot,
  bleacherLevel,
  clamp,
  fits,
  floorY,
  hash,
  heightAt,
  inRect,
  inside,
  lerp,
  makeFloor,
  narrow,
  nearestFree,
  rng,
  solid,
  tX,
  tY,
  wx,
  wz
};
