// 우테코 캠퍼스 엔진: 층·가구·카메라·이동·스킬·실시간·화면 UI
// 원래 public/index.html 한 파일에 있던 스크립트를 옮겼다. 캐릭터 모양만 React(하루들 월드 컴포넌트)가 그린다.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { AVATAR_COLOR_PARTS, AVATAR_COLORS, AVATAR_OPTIONS, AVATAR_PRESETS, sanitizeAvatar, type AvatarConfig } from "../harudle/avatarData";
import { dropDoll, makeDoll } from "./dolls";
import recruitPosterUrl from "../assets/recruit-poster-2026.png";
import { W, H, S, FH, WALL, DOLL, CEIL, VIEW, inside, INK, BRAND, NAVY, WEAK, HAND, narrow, clamp, lerp, rng, hash, wx, wz, tX, tY, floorY, FLOOR_INFO, makeFloor, FLOORS, WALK_THROUGH, ELEV_SPAWN, solid, inRect, STEP, ARC_STEP, bleacherLevel, flightSteps, DECK_H, heightAt, topAt, canStand, R_ME, bagSpot, applyLie, fits, nearestFree } from "./world";

// 아티팩트 런타임(window.claude)과 가벼운 DOM 도우미
declare global { interface Window { claude?: any } }
const claude: any = typeof window !== "undefined" ? window.claude : undefined;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const $q = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $all = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

export type R3FContext = { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; setDpr?: (dpr: number) => void };

export function bootEngine(R3F: R3FContext) {
let ready = false;
// 터치 기기(휴대폰·태블릿): 조이스틱과 버튼으로 조작한다
const TOUCH = typeof matchMedia !== "undefined" && (matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && !matchMedia("(pointer: fine)").matches));
if (TOUCH) { document.body.classList.add("touch"); const si = document.getElementById("sayInput") as HTMLInputElement; if (si) si.placeholder = "말풍선으로 한마디"; }


/* ════════════════ 3. 재료 (덕후감 3D 서고 방식: 툰 3단 + 먹선 + 종이결) ════════════════ */
const canvasTex = (w, h, draw, { repeat = null } = {}) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
};
const grain = canvasTex(128, 128, (g, w, h) => {
  const img = g.createImageData(w, h); const r = rng(5);
  for (let i = 0; i < img.data.length; i += 4) { const v = 232 + r() * 23; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = Math.min(255, v + 2); img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
}, { repeat: [2, 2] });
const gradient = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.needsUpdate = true;
const blobTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(14,30,70,.45)"); r.addColorStop(.6, "rgba(14,30,70,.18)"); r.addColorStop(1, "rgba(14,30,70,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });

const mats = new Map();
const toon = (color, o: { map?: THREE.Texture; opacity?: number } = {}) => {
  const key = `${color}|${o.map ? o.map.uuid : ""}|${o.opacity || 1}`;
  if (mats.has(key)) return mats.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient, map: o.map || grain });
  if (o.opacity) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
  mats.set(key, m); return m;
};
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
const inkSoft = new THREE.MeshBasicMaterial({ color: 0x8F8BA0, side: THREE.BackSide });
// 손그림 윤곽: 같은 모양을 조금 키워 뒷면만 먹색으로 그린다
const solidMesh = (geo, color, { line = 0.025, mat = null, cast = true, soft = false } = {}) => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat || toon(color)); m.castShadow = cast; m.receiveShadow = true; g.add(m);
  if (line) {
    geo.computeBoundingBox(); const s = geo.boundingBox.getSize(new THREE.Vector3());
    const o = new THREE.Mesh(geo, soft ? inkSoft : inkMat);
    o.scale.set(s.x > .001 ? (s.x + line * 2) / s.x : 1, s.y > .001 ? (s.y + line * 2) / s.y : 1, s.z > .001 ? (s.z + line * 2) / s.z : 1);
    g.add(o);
  }
  return g;
};
const box = (parent, w, h, d, color, x, y, z, o = {}) => { const s = solidMesh(new THREE.BoxGeometry(w, h, d), color, o); s.position.set(x, y + h / 2, z); parent.add(s); return s; };
// 둘레 조각 수는 크기에 맞춘다: 가는 기둥·작은 컵은 8조각이면 충분하다(툰 셰이딩이라 차이가 안 보인다)
const segFor = (r) => (r < .06 ? 8 : r < .2 ? 12 : r < .5 ? 16 : 24);
const cyl = (parent, rt, rb, h, color, x, y, z, o: any = {}) => { const s = solidMesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || segFor(Math.max(rt, rb)), 1, !!o.open), color, o); s.position.set(x, y + h / 2, z); parent.add(s); return s; };
const ball = (parent, r, color, x, y, z, o = {}) => { const s = solidMesh(r < .1 ? new THREE.SphereGeometry(r, 8, 6) : r < .25 ? new THREE.SphereGeometry(r, 10, 7) : new THREE.SphereGeometry(r, 14, 10), color, o); s.position.set(x, y, z); parent.add(s); return s; };
const signTex = (text, { bg = "#FFFFFF", fg = "#111118", size = 64, w = 512, h = 128 } = {}) => canvasTex(w, h, (g) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = "#111118"; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = fg; g.font = `700 ${size}px ${HAND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2 + 4);
});
// 벽에 그린 강의실 이름: 왼쪽에 한글·영문, 오른쪽에 고리 두른 행성 캐릭터(검은 선)
const muralTex = (name, en) => canvasTex(512, 256, (g) => {
  const font = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';   // 바탕은 투명: 벽에 바로 그린 것처럼
  g.fillStyle = "#111118"; g.textBaseline = "middle"; g.font = `800 30px ${font}`; g.fillText(name, 24, 112); g.font = `700 17px ${font}`; g.fillText(en, 24, 142);
  g.strokeStyle = "#111118"; g.lineWidth = 7; g.lineCap = "round";
  g.beginPath(); g.arc(340, 118, 66, 0, Math.PI * 2); g.fillStyle = "#FBFBF9"; g.fill(); g.stroke();
  g.beginPath(); g.ellipse(340, 136, 118, 26, -.08, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(340, 118, 62, .25, Math.PI - .25); g.fill();   // 고리가 몸 앞을 지나가게 아래 반을 다시 덮는다
  g.beginPath(); g.ellipse(340, 136, 118, 26, -.08, .15, Math.PI - .15); g.stroke();
  g.beginPath(); g.arc(340, 118, 66, .3, Math.PI - .3); g.stroke();
  g.fillStyle = "#111118"; for (const [dx, dy] of [[-20, -30], [12, -22], [-2, -6]]) { g.beginPath(); g.arc(340 + dx, 118 + dy, 4, 0, 7); g.fill(); }
  g.beginPath(); g.moveTo(326, 186); g.lineTo(326, 214); g.quadraticCurveTo(326, 222, 334, 222); g.moveTo(352, 186); g.lineTo(352, 214); g.quadraticCurveTo(352, 222, 344, 222); g.stroke();
});
// 강의실 입구 표지판(블레이드 사인): 진회색 판에 흰 글씨 한글 이름 · 영문 이름 · 아래에 행성 캐릭터
const roomSignTex = (name, en) => canvasTex(200, 280, (g) => {
  g.fillStyle = "#2E3034"; g.fillRect(0, 0, 200, 280);
  g.fillStyle = "#FFFFFF"; g.textBaseline = "top"; const font = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  g.font = `800 40px ${font}`; name.split(" ").forEach((t, i) => g.fillText(t, 22, 26 + i * 48));
  g.font = `700 17px ${font}`; en.split(" ").forEach((t, i) => g.fillText(t, 24, 136 + i * 24));
  g.strokeStyle = "#FFFFFF"; g.lineWidth = 3; g.lineCap = "round";
  g.beginPath(); g.arc(100, 238, 13, Math.PI, 0); g.lineTo(113, 244); g.lineTo(87, 244); g.closePath(); g.stroke();   // 동그란 몸
  g.beginPath(); g.ellipse(100, 241, 25, 6, 0, 0, Math.PI * 2); g.stroke();                                            // 고리
  g.beginPath(); g.moveTo(95, 247); g.lineTo(95, 256); g.moveTo(105, 247); g.lineTo(105, 256); g.stroke();             // 다리
  g.fillStyle = "#FFFFFF"; for (const dx of [-5, 5]) { g.beginPath(); g.arc(100 + dx, 232, 2, 0, 7); g.fill(); }
});
// 우아한테크코스 X배너(사진 두 장): 0 밤하늘에 행성 모자 쓴 친구가 노트북을 펼친다, 1 흰 바탕에 초록 행성 친구
const xbannerTex = (style) => canvasTex(512, 1280, (g) => {
  const ink = "#16161A"; g.lineCap = "round"; g.lineJoin = "round";
  g.fillStyle = "#F1F1EE"; g.fillRect(0, 0, 512, 1280);
  const star = (cx, cy, r, fill) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } else g.stroke(); };
  const title = (x, y, size, align) => { g.fillStyle = ink; g.font = `800 ${size}px "Gowun Dodum", sans-serif`; g.textAlign = align; g.textBaseline = "alphabetic"; g.fillText("우아한", x, y); g.fillText("테크코스", x, y + size * 1.12); };
  if (style === 0) {
    g.fillStyle = ink; g.beginPath(); g.moveTo(0, 0); g.lineTo(512, 0); g.lineTo(512, 560); g.bezierCurveTo(380, 640, 200, 600, 0, 660); g.fill();
    star(70, 110, 30, "#FFFFFF"); star(420, 190, 22, "#FFFFFF"); star(80, 520, 20, "#FFFFFF");
    // 행성 캐릭터: 동그란 얼굴을 고리가 비스듬히 감싼다. 고리 뒤쪽 반 → 얼굴 → 고리 앞쪽 반 순서로 그려 고리가 얼굴을 두르게
    const hx = 262, hy = 450, hr = 128, rx = 215, ry = 50, tilt = -.18;
    const ring = (a0, a1) => { for (const [col, lw] of [[ink, 26], ["#FFFFFF", 13]] as [string, number][]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.ellipse(hx, hy + 10, rx, ry, tilt, a0, a1); g.stroke(); } };
    ring(Math.PI, Math.PI * 2);   // 뒤쪽(위) 반
    g.fillStyle = "#FFFFFF"; g.strokeStyle = ink; g.lineWidth = 12; g.beginPath(); g.arc(hx, hy, hr, 0, Math.PI * 2); g.fill(); g.stroke();   // 얼굴
    ring(0, Math.PI);             // 앞쪽(아래) 반: 얼굴 위로 지나간다
    g.fillStyle = ink; for (const ex of [-42, 42]) { g.beginPath(); g.ellipse(hx + ex, hy - 18, 10, 13, 0, 0, 7); g.fill(); }   // 눈
    g.lineWidth = 8; g.strokeStyle = ink; g.beginPath(); g.arc(hx, hy + 4, 16, .2, Math.PI - .2); g.stroke();   // 웃는 입(고리 위)
    g.fillStyle = "#F7A6A0"; for (const ex of [-70, 70]) { g.beginPath(); g.ellipse(hx + ex, hy + 2, 16, 9, 0, 0, 7); g.fill(); }   // 볼
    // 몸통 + 펼친 노트북(두 손으로 든다)
    g.strokeStyle = ink; g.lineWidth = 12; g.fillStyle = "#FFFFFF";
    g.beginPath(); g.moveTo(hx - 70, hy + 112); g.quadraticCurveTo(hx - 100, hy + 230, hx - 90, hy + 300); g.lineTo(hx + 90, hy + 300); g.quadraticCurveTo(hx + 100, hy + 230, hx + 70, hy + 112); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(hx - 150, hy + 200); g.lineTo(hx + 150, hy + 200); g.lineTo(hx + 135, hy + 330); g.lineTo(hx - 135, hy + 330); g.closePath(); g.fill(); g.stroke();   // 노트북 화면(뒷면)
    g.fillStyle = ink; g.beginPath(); g.arc(hx, hy + 265, 14, 0, 7); g.fill();   // 뒷면 로고
    g.fillStyle = "#FFFFFF"; for (const sx of [-1, 1]) { g.beginPath(); g.arc(hx + sx * 150, hy + 268, 20, 0, 7); g.fill(); g.stroke(); }   // 양손
    title(70, 1000, 92, "left");
  } else {
    title(48, 150, 84, "left");
    g.fillStyle = "#55555C"; for (let i = 0; i < 6; i++) g.fillRect(52, 330 + i * 46 + (i % 2) * 6, i % 2 ? 300 : 380, 14);
    g.strokeStyle = ink; g.lineWidth = 9; star(410, 700, 46, null);
    g.fillStyle = "#4E9A5B"; g.beginPath(); g.arc(250, 900, 120, 0, 7); g.fill(); g.lineWidth = 11; g.stroke();   // 초록 행성
    g.fillStyle = "#3C7F48"; for (const [dx, dy, r] of [[-50, -40, 18], [40, 30, 14], [-10, 60, 12], [60, -60, 10]]) { g.beginPath(); g.arc(250 + dx, 900 + dy, r, 0, 7); g.fill(); }
    g.strokeStyle = ink; g.lineWidth = 11; g.beginPath(); g.ellipse(250, 900, 200, 52, -.35, .15, Math.PI - .15); g.stroke();
    g.strokeStyle = "#FFFFFF"; g.lineWidth = 7; g.beginPath(); g.ellipse(250, 900, 200, 52, -.35, .2, Math.PI - .2); g.stroke();
    g.fillStyle = ink; g.beginPath(); g.arc(215, 880, 9, 0, 7); g.arc(285, 880, 9, 0, 7); g.fill();
    g.strokeStyle = ink; g.lineWidth = 11; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(250 + s * 45, 1012); g.lineTo(250 + s * 55, 1080); g.lineTo(250 + s * 85, 1084); g.stroke(); }   // 다리
  }
  g.fillStyle = ink; g.font = `700 30px "Gowun Dodum", sans-serif`; g.textAlign = "right"; g.fillText("우아한테크코스", 470, 1220);
  g.strokeStyle = ink; g.lineWidth = 4; g.beginPath(); g.arc(245, 1210, 13, 0, 7); g.stroke(); g.beginPath(); g.ellipse(245, 1210, 24, 7, -.3, 0, 7); g.stroke();
});
// 붉은 벽돌: 가로로 긴 벽돌을 반씩 엇갈려 쌓는다. 한 장 = 가로 0.3m, 들어가서 볼 때(천장까지 늘어날 때) 한 단이 0.09m쯤
const brickTex = (len, tall) => canvasTex(128, 64, (g) => {
  g.fillStyle = "#B4573F"; g.fillRect(0, 0, 128, 64); const r = rng(len * 7 + 3);
  for (let row = 0; row < 4; row++) for (let i = -1; i < 3; i++) { const bx = i * 64 + (row % 2) * 32;
    g.fillStyle = ["#C0644A", "#B95E44", "#C76D52", "#AE553E"][Math.floor(r() * 4)]; g.fillRect(bx + 2, row * 16 + 2, 60, 12); }
}, { repeat: [Math.max(1, len / .6), tall ? 12 : 3] });
const brickMat = (len, tall = true) => toon(0xFFFFFF, { map: brickTex(len, tall) });
const board = (parent, w, h, tex, x, y, z, ry = 0) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
};

/* ════════════════ 4. 월드 빌더: 층 하나 = 종이 디오라마 한 판 ════════════════ */
const C = { white: 0xffffff, wood: 0xEBD3AE, woodD: 0xC99E6B, gray: 0xCFCBD6, grayD: 0x9A97A3, dark: 0x2E2C38, brick: 0xE2A08A, leaf: 0x8FCFA3, olive: 0xB9C27A, sofa: 0xD9A877, mint: 0xD7E4DD, lav: 0xFFE27A, glass: 0xBFD9F0, red: 0xE46F6F, coffee: 0x8C6A4F };
function floorTexture(fl) {
  const P = 32;
  return canvasTex(W * P, H * P, (g) => {
    g.fillStyle = "#FBFAFD"; g.fillRect(0, 0, W * P, H * P);
    for (const z of fl.zones) if (z.tint) { g.fillStyle = z.tint; g.fillRect(z.x * P, z.y * P, z.w * P, z.h * P); }
    for (const r of fl.rooms) if (r.closed) { g.fillStyle = "#E6E5EC"; g.fillRect(r.x * P, r.y * P, r.w * P, r.h * P); }
    g.fillStyle = "#E3E0EA"; for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) g.fillRect(x * P - 1.5, y * P - 1.5, 3, 3);
    for (const z of fl.zones) if (z.name === "엘리베이터 홀") { g.strokeStyle = "rgba(150,150,160,.35)"; g.lineWidth = 1.5; for (let ty = z.y; ty <= z.y + z.h; ty += 1.5) { g.beginPath(); g.moveTo(z.x * P, ty * P); g.lineTo((z.x + z.w) * P, ty * P); g.stroke(); } for (let tx = z.x; tx <= z.x + z.w; tx += 1.5) { g.beginPath(); g.moveTo(tx * P, z.y * P); g.lineTo(tx * P, (z.y + z.h) * P); g.stroke(); } }   // 큰 석재 타일
    for (const k of fl.calls) { // 문 앞 점자 블록: 노란 판에 점이 촘촘히
      const bx = k.x * P + 4, by = (k.y + k.h / 2 - .4) * P, bw = k.w * P - 8, bh = .8 * P;
      g.fillStyle = "#F2C14E"; g.fillRect(bx, by, bw, bh); g.fillStyle = "#D9A632";
      for (let yy = by + 3; yy < by + bh - 1; yy += 4) for (let xx = bx + 3; xx < bx + bw - 1; xx += 4) g.fillRect(xx - 1, yy - 1, 2, 2);
    }
    for (const p of fl.portals) { g.fillStyle = "#FFF3B0"; g.fillRect(p.x * P, p.y * P, p.w * P, p.h * P); }
    // 방 이름은 바닥에 쓰지 않는다 (벽 위 이름표로만)
  });
}
function wallSegs(r) {
  const out = [];
  for (const [s, len] of [["n", r.w], ["s", r.w], ["w", r.h], ["e", r.h]]) {
    let start = null;
    for (let i = 0; i <= len; i++) {
      const op = i < len && (r.doors || []).some((d) => d.s === s && i >= d.from && i < d.from + d.len);
      if (i < len && !op) { if (start === null) start = i; } else if (start !== null) { out.push([s, start, i]); start = null; }
    }
  }
  // 벽은 가장자리 칸의 한가운데 선을 따라 선다. 모서리에서는 맞닿는 벽의 중심선까지만(+두께 절반) 그어야
  // 바깥으로 반 칸씩 튀어나온 꼬리가 생기지 않는다
  const cap = .04;
  return out.map(([s, a, b]) => { const len = s === "n" || s === "s" ? r.w : r.h; return [s, a === 0 ? .5 - cap : a, b === len ? len - .5 + cap : b]; }).filter(([, a, b]) => b - a > .05);
}
function buildFloor(fl) {
  const G = new THREE.Group(); G.position.y = floorY(fl.f);
  // 바닥판: 오픈 천장 자리는 구멍
  const shape = new THREE.Shape(); shape.moveTo(wx(0), -wz(0)); shape.lineTo(wx(W), -wz(0)); shape.lineTo(wx(W), -wz(H)); shape.lineTo(wx(0), -wz(H)); shape.closePath();
  for (const v of fl.furn.filter((o) => o.kind === "void")) { const hole = new THREE.Path(); hole.moveTo(wx(v.x), -wz(v.y)); hole.lineTo(wx(v.x), -wz(v.y + v.h)); hole.lineTo(wx(v.x + v.w), -wz(v.y + v.h)); hole.lineTo(wx(v.x + v.w), -wz(v.y)); hole.closePath(); shape.holes.push(hole); }
  const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false }); fg.rotateX(-Math.PI / 2); fg.translate(0, -0.18, 0);
  const pos = fg.attributes.position, uv = fg.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, tX(pos.getX(i)) / W, 1 - tY(pos.getZ(i)) / H);
  const slab = new THREE.Mesh(fg, new THREE.MeshToonMaterial({ map: floorTexture(fl), gradientMap: gradient })); slab.receiveShadow = true; G.add(slab);
  G.add(new THREE.LineSegments(new THREE.EdgesGeometry(fg, 30), new THREE.LineBasicMaterial({ color: INK })));
  fl.slab = slab;
  // 바깥벽: 서쪽은 벽, 나머지는 낮은 창턱 + 유리
  const L = W * S, D = H * S;
  const WG = new THREE.Group(); G.add(WG); fl.walls = WG;   // 들어가서 볼 때 천장까지 늘린다
  { const G = WG;
  const sides = [[L, .1, 0, wz(0.5), true], [L, .1, 0, wz(H - 0.5), true], [.1, D, wx(W - 0.5), 0, false], [.1, D, wx(0.5), 0, false]] as [number, number, number, number, boolean][];
  if (fl.f === 14) for (const [w, d, x, z] of sides) box(G, w, WALL, d, C.white, x, 0, z);
  else for (const [w, d, x, z, horiz] of sides) { // 바닥부터 천장까지 통유리 + 얇은 창틀
    box(G, w, .06, d, 0x2E3A5C, x, 0, z, { line: .008 });
    box(G, horiz ? w : .03, WALL - .1, horiz ? .03 : d, C.glass, x, .06, z, { mat: toon(C.glass, { opacity: .14 }), line: 0, cast: false });
    box(G, w, .04, d, 0x2E3A5C, x, WALL - .04, z, { line: 0, cast: false });
    const n = Math.round((horiz ? W : H) / 4);
    for (let i = 0; i <= n; i++) { const t = -.5 + i / n; box(G, .05, WALL, .05, 0x2E3A5C, horiz ? t * w : x, 0, horiz ? z : t * d, { line: 0, cast: false }); }
  }
  // 방 벽(행성 회의실은 유리)
  for (const r of fl.rooms) {
    const col = r.ring ? C.grayD : r.closed ? 0xD5D3DD : C.white, h = r.ring ? 0.45 : WALL;
    for (const [s, a, b] of wallSegs(r)) {
      const len = (b - a) * S; let x, z, w, d;
      if (s === "n" || s === "s") { x = wx(r.x + (a + b) / 2); z = wz((s === "n" ? r.y : r.y + r.h - 1) + 0.5); w = len; d = 0.1; }
      else { z = wz(r.y + (a + b) / 2); x = wx((s === "w" ? r.x : r.x + r.w - 1) + 0.5); w = 0.1; d = len; }
      if (r.brick === s) box(G, w, h, d, 0xB4573F, x, 0, z, { mat: brickMat(len), line: .01 });   // 복도 쪽 한 면만 붉은 벽돌 벽
      else if (r.planet) { box(G, w, 0.25, d, C.white, x, 0, z); box(G, w, h - 0.25, d, C.lav, x, 0.25, z, { mat: toon(C.lav, { opacity: .35 }), line: 0.012, soft: true, cast: false }); }
      else box(G, w, h, d, col, x, 0, z);
    }
  }
  }
  // 강의실 입구 위 표지판: 문 바로 옆 벽에서 복도 쪽으로 직각으로 튀어나온 판. 들어가서 볼 때는 위로 올려 단다(showFloors)
  const SG = new THREE.Group(); G.add(SG); fl.signs = SG;
  for (const r of fl.rooms) if (r.sign) for (const d of r.doors || []) {
    const tex = roomSignTex(r.name, r.sign), bw = .5, bh = .7, horizWall = d.s === "n" || d.s === "s";
    const out = d.s === "n" || d.s === "w" ? -1 : 1;                         // 방 바깥쪽
    const along = (horizWall ? r.x : r.y) + d.from - .12;                    // 문 바로 앞(시작 쪽) 벽 위
    const line = d.s === "n" ? r.y + .5 : d.s === "s" ? r.y + r.h - .5 : d.s === "w" ? r.x + .5 : r.x + r.w - .5;
    const off = out * (.05 + bw / 2);                                       // 벽 면에서 바깥으로
    const px = horizWall ? wx(along) : wx(line) + off, pz = horizWall ? wz(line) + off : wz(along), y0 = .22;
    box(SG, horizWall ? .05 : bw, bh, horizWall ? bw : .05, 0x2E3034, px, y0, pz, { line: .008, cast: false });
    for (const sd of [-1, 1]) board(SG, bw - .04, bh - .04, tex, px + (horizWall ? sd * .028 : 0), y0 + bh / 2, pz + (horizWall ? 0 : sd * .028), horizWall ? sd * Math.PI / 2 : (sd < 0 ? Math.PI : 0));
  }
  // 천장: 들어가서 볼 때만. 오픈 천장 자리는 뚫려 있고, 12층은 천장 없이 13층 바닥 밑까지 높다
  if (fl.f !== 12) {
    const cs = new THREE.Shape(); cs.moveTo(wx(0), wz(0)); cs.lineTo(wx(W), wz(0)); cs.lineTo(wx(W), wz(H)); cs.lineTo(wx(0), wz(H)); cs.closePath();
    const up = FLOORS[fl.f + 1]?.furn || [];   // 천장 구멍은 위층 바닥이 뚫린 자리
    for (const v of up.filter((o) => o.kind === "void")) { const h = new THREE.Path(); h.moveTo(wx(v.x), wz(v.y)); h.lineTo(wx(v.x + v.w), wz(v.y)); h.lineTo(wx(v.x + v.w), wz(v.y + v.h)); h.lineTo(wx(v.x), wz(v.y + v.h)); h.closePath(); cs.holes.push(h); }
    const cg = new THREE.ShapeGeometry(cs); cg.rotateX(Math.PI / 2);
    const ceil = new THREE.Group(); ceil.position.y = CEIL[fl.f]; ceil.visible = false; G.add(ceil); fl.ceil = ceil;
    ceil.add(new THREE.Mesh(cg, new THREE.MeshToonMaterial({ color: 0xF1F0F5, gradientMap: gradient, map: grain, side: THREE.DoubleSide })));
    const lamp = new THREE.MeshBasicMaterial({ color: 0xFFFDF2, side: THREE.DoubleSide }), lg = new THREE.PlaneGeometry(.9, .3); lg.rotateX(Math.PI / 2);
    for (let y = 4; y < H - 2; y += 5) for (let x = 4; x < W - 2; x += 6) { if (up.some((o) => o.kind === "void" && inRect(o, x, y))) continue; const m = new THREE.Mesh(lg, lamp); m.position.set(wx(x), -.02, wz(y)); ceil.add(m); }
  }
  const LG = new THREE.Group(); LG.visible = false; G.add(LG); fl.lamps = LG;   // 천장에 매단 조명: 들어가서 볼 때만
  SEAT_SINK = fl.seats = [];
  for (const o of fl.furn) { if (!o.lift) { buildFurn(G, o, fl); continue; } const g = new THREE.Group(); g.position.y = o.lift; G.add(g); buildFurn(g, o, fl); }   // lift: 단 위에 올린 가구
  SEAT_SINK = null;
  for (const p of fl.portals) buildPortal(G, p, fl);
  return G;
}
const spinners = [];
const BOOKS = ["#0E1E46", "#2F8A62", "#F15B5B", "#111118", "#F5C85C", "#7DB3F0"];
const glassMat = () => toon(C.glass, { opacity: .3 });
// 의자: 방향(rot)에 맞춰 앉는 면 + 등받이
let SEAT_SINK = null;
const chair = (G, x, z, rot = 0, color = C.white) => {
  if (SEAT_SINK) SEAT_SINK.push({ x: tX(x), y: tY(z), yaw: rot });
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; G.add(g);
  box(g, .34, .26, .34, color, 0, 0, 0, { line: .012 }); box(g, .34, .3, .06, color, 0, .26, -.15, { line: .012 }); return g;
};
const monitor = (G, x, y, z, rot = 0, w = .42) => {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; G.add(g);
  box(g, w, .26, .04, C.dark, 0, .06, 0, { line: .01 }); board(g, w - .06, .2, screenTex, 0, .19, .025, 0); box(g, .05, .06, .05, C.dark, 0, 0, 0, { line: 0 }); return g;
};
const screenTex = canvasTex(128, 72, (g) => { g.fillStyle = "#1C2B55"; g.fillRect(0, 0, 128, 72); const r = rng(9); for (let i = 0; i < 7; i++) { g.fillStyle = ["#FFD43B", "#7FCFAE", "#F7A6A0", "#7DB3F0", "#ffffff"][i % 5]; g.fillRect(10 + (i % 2) * 8, 10 + i * 8, 30 + r() * 70, 3); } });
const slideTex = canvasTex(512, 288, (g) => { g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, 512, 288); g.fillStyle = "#0E1E46"; g.fillRect(0, 0, 512, 58); g.fillStyle = "#FFD43B"; g.font = `700 34px ${HAND}`; g.textBaseline = "middle"; g.fillText("우아한테크코스", 22, 30); g.fillStyle = "#0E1E46"; g.font = `700 30px ${HAND}`; for (const [i, t] of ["오늘의 미션: 페어로 함께 풀기", "· 테스트 먼저, 작게 커밋", "· 질문은 언제든 환영"].entries()) g.fillText(t, 28, 112 + i * 56); });
const moonTex = canvasTex(512, 512, (g) => {
  const ink = "#16182E", yel = "#FFE94A"; g.lineCap = "round"; g.lineJoin = "round";
  g.fillStyle = yel; g.beginPath(); g.arc(300, 230, 190, 0, 7); g.fill();
  g.strokeStyle = yel; g.lineWidth = 10; for (const s of [0, 1]) { g.beginPath(); g.moveTo(120 + s * 60, 520); g.lineTo(200 + s * 60, 330); g.stroke(); }   // 달까지 걸친 사다리
  for (let i = 0; i < 6; i++) { const t = i / 6; g.beginPath(); g.moveTo(120 + t * 80, 520 - t * 190); g.lineTo(180 + t * 80, 520 - t * 190); g.stroke(); }
  g.fillStyle = ink; g.font = `900 150px "Gowun Dodum", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.save(); g.translate(320, 175); g.rotate(-.12); g.fillText("도전", 0, 0); g.restore();
  g.strokeStyle = ink; g.lineWidth = 7; g.fillStyle = "#FFFFFF";   // 행성 친구(얼굴 + 고리)
  g.beginPath(); g.arc(230, 330, 62, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(230, 345, 105, 26, -.25, .2, Math.PI - .2); g.stroke();
  g.fillStyle = ink; g.beginPath(); g.arc(212, 318, 5, 0, 7); g.arc(242, 318, 5, 0, 7); g.fill();
  g.beginPath(); g.moveTo(275, 300); g.lineTo(330, 245); g.stroke();   // 붓 든 팔
  g.fillStyle = "#FFFFFF"; g.save(); g.translate(338, 236); g.rotate(-.8); g.fillRect(-10, -26, 20, 30); g.strokeRect(-10, -26, 20, 30); g.fillStyle = ink; g.fillRect(-10, -42, 20, 16); g.restore();
  for (const [x, y, r] of [[70, 70, 22], [470, 470, 18], [60, 300, 14]]) { g.fillStyle = yel; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); }
});
// 2026 신입생 모집 포스터: 한 장의 그림을 여러 벽에 붙인다
const recruitPosterTex = new THREE.TextureLoader().load(recruitPosterUrl); recruitPosterTex.colorSpace = THREE.SRGBColorSpace; recruitPosterTex.anisotropy = 4;
const tekoTexOf = (cw) => canvasTex(cw, 288, (g) => { g.fillStyle = "#0E1E46"; g.fillRect(0, 0, cw, 288); g.fillStyle = "#FFD43B"; g.font = `700 80px ${HAND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("테코톡", cw / 2, 118); g.fillStyle = "#fff"; g.font = `700 30px ${HAND}`; g.fillText("오늘 발표: 나의 첫 리팩터링", cw / 2, 212); });
const tekoTex = tekoTexOf(512), tekoWideTex = tekoTexOf(768);   // wide: 폭만 1.5배 늘린 화면에 글자가 늘어나지 않게
const karaokeTex = canvasTex(512, 256, (g) => { const gr = g.createLinearGradient(0, 0, 512, 256); gr.addColorStop(0, "#3B2A7A"); gr.addColorStop(1, "#C2477F"); g.fillStyle = gr; g.fillRect(0, 0, 512, 256); g.textAlign = "center"; g.textBaseline = "middle"; g.font = `700 40px ${HAND}`; g.fillStyle = "#FFD43B"; g.fillText("♪ 하루 한 컷 ♪", 256, 96); g.fillStyle = "#fff"; g.font = `700 30px ${HAND}`; g.fillText("반주 시작 · 마이크 두 개", 256, 170); });
const arcadeTex = (hue) => canvasTex(128, 96, (g) => { g.fillStyle = "#111118"; g.fillRect(0, 0, 128, 96); g.fillStyle = hue; for (let i = 0; i < 6; i++) g.fillRect(14 + i * 18, 20 + (i % 3) * 14, 10, 10); g.fillStyle = "#FFD43B"; g.fillRect(56, 70, 16, 10); });
// 납작하게 눌러 쓰는 잎·조약돌: 위에서 보면 타원, 얇아서 조각이 적어도 모양이 같다(80 → 24 삼각형). 모두 같은 것을 나눠 쓴다
const LEAF_GEO = new THREE.SphereGeometry(1, 6, 3);
// 식물 한 포기: 줄기 하나에 잎 여섯 장이 사방으로 뻗는다
const bush = (G, px, pz, base, tall, rr, i) => {
  cyl(G, .015, .02, tall, 0x5E7F43, px, base, pz, { line: 0 });
  for (let j = 0; j < 6; j++) { const a = rr() * Math.PI * 2, len = .18 + rr() * .2, hy = base + tall * (.45 + rr() * .55);
    const leaf = solidMesh(LEAF_GEO, [0x2F7A4C, 0x3F8F5A, 0x5DB075, 0x6E9E3A][(i + j) % 4], { line: .01 });
    leaf.scale.set(len * .3, .03, len); leaf.position.set(px + Math.sin(a) * len * .6, hy, pz + Math.cos(a) * len * .6); leaf.rotation.set(-.5 - rr() * .4, a, 0, "YXZ"); G.add(leaf); }
};
const BALLS = [0xF15B5B, 0xFFD43B, 0x7DB3F0, 0x7FCFAE, 0xF7A6A0, 0xFFFFFF];
// 화면: 놓을 자리 길이(len) 안에서 16:9 직사각형으로, 높이는 maxH까지. 바닥에서 bottom 높이에 걸고 다리로 받친다. rot 방향(+z 기준)을 본다
function screen169(G, len, maxH, bottom, tex, cx, cz, rot, wide = 1) {   // wide: 높이는 그대로 두고 폭만 늘린다(천장에 막힐 때)
  const h = Math.min(len * 9 / 16, maxH), w = Math.min(len, h * 16 / 9 * wide), g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = rot; G.add(g);
  box(g, w + .08, h + .08, .06, C.dark, 0, bottom - .04, -.03, { line: .01 }); board(g, w, h, tex, 0, bottom + h / 2, .005);
  if (bottom > .1) box(g, .12, bottom - .04, .08, C.dark, 0, 0, -.05, { line: 0 });
}
function buildFurn(G, o, fl) {
  if (o.turn && !o.turned) {   // turn: 가로로 만든 모양을 제자리에서 돌려 세운다(앞면이 +z → turn만큼 회전)
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, g = new THREE.Group(), inner = new THREE.Group();
    g.position.set(wx(cx), 0, wz(cy)); g.rotation.y = o.turn; inner.position.set(-wx(cx), 0, -wz(cy)); g.add(inner); G.add(g);
    const flip = Math.abs(Math.sin(o.turn)) > .5, n0 = SEAT_SINK ? SEAT_SINK.length : 0;
    buildFurn(inner, { ...o, turned: true, ...(flip ? { w: o.h, h: o.w, x: cx - o.h / 2, y: cy - o.w / 2 } : {}) }, fl);
    if (SEAT_SINK) for (let i = n0; i < SEAT_SINK.length; i++) {   // 앉는 자리도 같이 돌린다(의자는 돌리기 전 자리로 등록된다)
      const st = SEAT_SINK[i], dx = st.x - cx, dy = st.y - cy, c = Math.cos(o.turn), sn = Math.sin(o.turn);
      st.x = cx + dx * c + dy * sn; st.y = cy - dx * sn + dy * c; st.yaw += o.turn;
    }
    return;
  }
  const x = wx(o.x + o.w / 2), z = wz(o.y + o.h / 2), w = o.w * S, d = o.h * S, horiz = o.w >= o.h;
  const chairs = (row, off) => { for (let i = 0; i < o.w; i++) chair(G, wx(o.x + i + .5), wz(row) + off, Math.PI); };
  switch (o.kind) {
    case "xbanner": { // X배너 현수막: 쓰지 않는 엘리베이터 문 앞을 막는다(동쪽, 홀 쪽을 본다). 뒤에 X자 살, 아래 받침
      const px = wx(o.x) + .32, h = 1.5, bw = .6, rod = 0x8C8E94;
      box(G, .05, .03, bw + .06, rod, px, 0, z, { line: .004 });   // 바닥 받침
      for (const s of [-1, 1]) { const r = box(G, .015, Math.hypot(h, bw) - .05, .015, rod, px - .04, .05, z, { line: 0 }); r.position.y = .05 + h / 2; r.rotation.x = s * Math.atan2(bw, h); }   // X자 살
      board(G, bw, h, xbannerTex(o.style || 0), px, .06 + h / 2, z, Math.PI / 2);
      break; }
    case "elevbank": { // 엘리베이터가 박힌 석재 벽: 홀 벽 안쪽 면부터 엘리베이터 문 면까지. 문 높이까지는 그대로, 그 위는 들어가서 볼 때 천장까지 늘어난다
      const stone = 0x9C9A95, seam = 0x7E7C78, e = o.face === "e", front = e ? wx(o.x + 1) - .07 : wx(o.x) + .07, back = e ? wx(o.x) - S / 2 + .05 : wx(o.x + 1) + S / 2 - .05;
      const bx = (front + back) / 2, bw = Math.abs(front - back), z0 = wz(o.y) - S / 2 + .05, z1 = wz(o.y + o.h) + S / 2 - .05, bd = z1 - z0, bz = (z0 + z1) / 2, low = 1.66;
      box(G, bw, low, bd, stone, bx, 0, bz, { line: .01 }); box(G, bw + .02, .04, bd + .02, 0xE4E2DC, bx, low, bz, { line: .006, cast: false });   // 위에서 볼 때 벽 윗면처럼 밝은 갓돌
      const y0 = low * WALL / CEIL[fl.f]; box(fl.walls, bw, WALL - y0, bd, stone, bx, y0, bz, { line: .01, cast: false });   // 홀 벽처럼 천장까지(위에서 볼 땐 아래 덩어리에 묻힌다)
      for (let k = 1; k < o.h * 2; k++) box(G, .005, low, .012, seam, front + (e ? .003 : -.003), 0, z0 + k * bd / (o.h * 2), { line: 0, cast: false });   // 석재 판 이음새
      box(G, .005, .012, bd, seam, front + (e ? .003 : -.003), .82, bz, { line: 0, cast: false });
      box(G, .02, .1, bd, 0x6E6C68, front + (e ? .01 : -.01), 0, bz, { line: 0, cast: false });   // 걸레받이
      break; }
    case "elev": { // 회색 석재 벽 + 짙은 문틀·두 짝 문 + 호출 버튼·표시등 + 문 위 층 표시
      const zf = wz(o.y + 1) - .06, ow = 1.12, oh = 1.3, stone = 0x9C9A95;
      box(G, w - .02, 1.66, .12, stone, x, 0, zf - .06, { line: .01 });
      for (const sx of [-w / 2 + .02, -w / 4, w / 4, w / 2 - .02]) box(G, .012, 1.66, .005, 0x7E7C78, x + sx, 0, zf + .002, { line: 0, cast: false });   // 판 이음새
      box(G, w - .02, .012, .005, 0x7E7C78, x, .82, zf + .002, { line: 0, cast: false });
      box(G, ow + .16, oh + .08, .02, 0x5E5C58, x, 0, zf + .01, { line: .008 });   // 문틀
      for (const s of [-1, 1]) box(G, ow / 2 - .015, oh, .03, 0x2B2A28, x + s * ow / 4, 0, zf + .03, { line: .006 });   // 두 짝 문
      box(G, .01, oh, .005, 0x1A1918, x, 0, zf + .047, { line: 0, cast: false });
      const bx = x + ow / 2 + .26;
      box(G, .07, .17, .02, 0x1E1E22, bx, .58, zf + .01, { line: .004 }); for (const by of [.62, .69]) ball(G, .016, 0xE9E7E1, bx, by, zf + .025, { line: 0 });   // 호출 버튼
      box(G, .08, .26, .02, 0xEDEDE9, bx, 1.08, zf + .01, { line: .004 }); box(G, .03, .05, .005, 0x2A2A2E, bx, 1.12, zf + .022, { line: 0 });   // 표시등
      board(G, .42, .12, signTex(`${fl.f}F ▲▼`, { bg: "#16161A", fg: "#FFB547", size: 70 }), x, oh + .18, zf + .03);
      break; }
    case "screen": case "tv": { // 강의실 큰 화면(screen)·회의실 TV(tv). 가로로 놓이면 북쪽 벽에서 남쪽을, 세로면 face 쪽을 본다
      const big = o.kind === "screen", maxH = o.big ? CEIL[fl.f] - .3 : big ? 1.6 : .8, bottom = o.big ? .15 : big ? .55 : .4, tex = big ? slideTex : screenTex;   // o.big: 스타트랙 화면처럼 천장 바로 아래까지
      if (horiz) screen169(G, w * .9, maxH, bottom, tex, x, wz(o.y) + .15, 0);
      else { const f = o.face === "w" ? -1 : 1; screen169(G, d * .9, maxH, bottom, tex, f > 0 ? wx(o.x) + .15 : wx(o.x + o.w) - .15, z, f * Math.PI / 2); }
      break; }
    case "screenwall": // 스타트랙 발표 화면: 16:9 큰 화면
      if (o.face === "w") screen169(G, d - .2, o.big ? CEIL[fl.f] - .3 : 2.2, o.big ? .15 : .45, o.wide ? tekoWideTex : tekoTex, wx(o.x + o.w) - .1, z, -Math.PI / 2, o.wide || 1);   // big: 천장 바로 아래까지
      else screen169(G, w - .2, 2.2, .45, tekoTex, x, wz(o.y) + .1, 0);
      break;
    case "arcbleacher": { // 화면을 중심으로 반원(기본 서쪽, face: "s"면 남쪽): 낮은 무대 + 바깥으로 갈수록 높아지는 객석
      const ring = (r0, r1, hh, col) => { // 서쪽 반쪽 고리를 바닥 모양으로 그려 위로 밀어 올린다: 잘린 양 끝도 막혀 속이 비쳐 보이지 않는다
        const sh = new THREE.Shape(); sh.moveTo(0, r1); sh.absarc(0, 0, r1, Math.PI / 2, Math.PI * 1.5, false); sh.lineTo(0, -r0); if (r0 > .02) sh.absarc(0, 0, r0, Math.PI * 1.5, Math.PI / 2, true); sh.closePath();
        const geo = new THREE.ExtrudeGeometry(sh, { depth: hh, bevelEnabled: false, curveSegments: 48 }); geo.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(geo, toon(col)); m.receiveShadow = true; m.position.set(wx(o.cx), 0, wz(o.cy)); if (o.sy) m.scale.z = o.sy; if (o.face === "s") m.rotation.y = Math.PI / 2; G.add(m);   // 기본은 서쪽 반원, face s면 남쪽 반원
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: INK })); edge.position.copy(m.position); edge.scale.copy(m.scale); edge.rotation.copy(m.rotation); G.add(edge); };   // 윤곽은 모서리 선으로(뒤집어 키운 외곽선은 반쪽 고리에서 끝이 검게 비친다)
      if (o.stage) ring(.01, o.stage * S, .5 * ARC_STEP, 0x8A7F76);
      for (let k = 0; k < o.tiers; k++) ring((o.r0 + k * o.tw) * S, (o.r0 + (k + 1) * o.tw) * S - .02, (k + 1) * ARC_STEP, k % 2 ? C.olive : 0xC9D08A);
      break; }
    case "lectern": box(G, w * .7, .62, d * .6, C.woodD, x, 0, z); box(G, w * .8, .04, d * .7, C.wood, x, .62, z); break;
    case "ltable": box(G, w - .12, .44, d * .55, C.white, x, 0, z); chairs(o.y + 1, .12);
      for (let i = 0; i < o.w; i += 2) box(G, .3, .02, .2, 0xE7E2D6, wx(o.x + i + .5), .44, z, { line: .006 }); break;
    case "storage": box(G, w, 1.05, d * .7, C.gray, x, 0, z); for (let i = 1; i < o.w; i += 2) box(G, .02, .9, .02, C.grayD, wx(o.x + i), .07, z + d * .36, { line: 0 }); break;
    case "desk": { box(G, w - .12, .44, d - .2, C.white, x, 0, z); const n = Math.max(1, Math.round(w / 1.3));
      for (let k = 0; k < n; k++) { const px = wx(o.x) + (k + .5) * w / n; for (const s of [-1, 1]) { monitor(G, px, .44, z + s * .1, s < 0 ? 0 : Math.PI); chair(G, px, z + s * (d / 2 + .02), s < 0 ? 0 : Math.PI); } } break; }
    case "booth": box(G, w - .08, 1.25, d - .1, 0xB0B256, x, 0, z, { mat: toon(0xB0B256, { opacity: .45 }), line: .015, cast: false }); box(G, w - .08, .06, d - .1, C.white, x, 1.25, z); box(G, w * .5, .4, d * .3, C.wood, x, 0, z - d * .2, { line: .01 }); chair(G, x, z + d * .1, Math.PI, 0x6E7A3A); break;
    case "mtable": box(G, w - .1, .44, d - .2, C.white, x, 0, z);
      if (horiz) for (let i = 0; i < o.w; i++) { chair(G, wx(o.x + i + .5), wz(o.y) - .12, 0); chair(G, wx(o.x + i + .5), wz(o.y + o.h) + .12, Math.PI); }
      else for (let i = 0; i < o.h; i++) { if (o.side !== "e") chair(G, wx(o.x) - .12, wz(o.y + i + .5), Math.PI / 2); if (o.side !== "w") chair(G, wx(o.x + o.w) + .12, wz(o.y + i + .5), -Math.PI / 2); }   // side: 한쪽에만 의자
      break;
    case "wtable": box(G, w - .3, .42, d - .3, C.white, x, 0, z); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ball(G, .04, C.dark, x + a * (w / 2 - .2), .04, z + b * (d / 2 - .2), { line: 0 });
      chair(G, x - w / 2 + .05, z, Math.PI / 2); chair(G, x + w / 2 - .05, z, -Math.PI / 2); monitor(G, x - .1, .42, z, Math.PI / 2, .3); cyl(G, .015, .015, 1.6, C.grayD, x, .42, z, { line: 0, cast: false }); break;
    case "counter": { // 탕비 카운터: 위에 개수대 · 커피 머신 · 전자레인지가 실제로 놓인다
      box(G, w - .05, .55, d - .05, C.gray, x, 0, z); box(G, w - .05, .03, d - .02, 0xF4F3F7, x, .55, z, { line: .008 });
      const props = o.props || ["sink"]; const n = props.length;
      props.forEach((p, i) => {
        const along = (i + .5) / n, pg = new THREE.Group(); G.add(pg);   // 기본은 남쪽을 본다. 세로 카운터는 face 쪽(w/e)으로 돌린다
        pg.position.set(horiz ? wx(o.x) + along * w : x, 0, horiz ? z : wz(o.y) + along * d); pg.rotation.y = horiz ? (o.face === "n" ? Math.PI : 0) : o.face === "e" ? Math.PI / 2 : -Math.PI / 2;
        if (p === "sink") { box(pg, .42, .03, .3, 0xBFC6D2, 0, .58, 0, { line: .008 }); cyl(pg, .02, .02, .22, 0xA5ADBB, 0, .58, -.12, { line: 0 }); box(pg, .03, .03, .12, 0xA5ADBB, 0, .78, -.07, { line: 0 }); }
        if (p === "coffee") { box(pg, .26, .36, .24, C.dark, 0, .58, 0, { line: .01 }); box(pg, .2, .06, .02, 0xFFD43B, 0, .82, .125, { line: 0 }); cyl(pg, .045, .04, .08, C.white, 0, .58, .05, { line: .006 }); }
        if (p === "micro") { box(pg, .4, .24, .3, C.white, 0, .58, 0, { line: .01 }); box(pg, .24, .16, .01, C.dark, -.05, .62, .155, { line: 0 }); }
      });
      // 컵 몇 개
      for (let i = 0; i < 3; i++) cyl(G, .03, .025, .07, [0xF7A6A0, 0xFFD43B, 0x7DB3F0][i], (horiz ? wx(o.x) + .2 + i * .1 : x - .1 + i * .1), .58, horiz ? z + .17 : wz(o.y) + .2, { line: .005 });
      break; }
    case "purifier": { // 정수기: 흰 몸통 + 물통 + 출수구 + 종이컵
      box(G, .38, .95, .34, C.white, x, 0, z); box(G, .3, .1, .2, 0xE7EAF0, x, .45, z + .1, { line: .008 });
      cyl(G, .14, .14, .3, 0x9FD3F5, x, .95, z, { mat: toon(0x9FD3F5, { opacity: .7 }), line: .01, cast: false }); cyl(G, .05, .05, .06, 0x5AA6D6, x, 1.25, z, { line: 0 });
      for (const [s, c] of [[-1, 0x7DB3F0], [1, 0xF15B5B]]) box(G, .05, .05, .04, c, x + s * .07, .66, z + .18, { line: 0 });
      cyl(G, .04, .03, .2, 0xF4EFE6, x + .23, .55, z + .05, { line: .006 }); break; }
    case "fridge": box(G, .5, 1.5, .5, 0xE9ECF2, x, 0, z); box(G, .48, .01, .02, C.grayD, x, 1.0, z + .26, { line: 0 }); box(G, .03, .3, .03, C.grayD, x + .18, 1.12, z + .27, { line: 0 }); box(G, .03, .45, .03, C.grayD, x + .18, .4, z + .27, { line: 0 }); break;
    case "vending": box(G, .54, 1.55, .5, 0xF15B5B, x, 0, z); box(G, .38, .9, .02, C.glass, x - .04, .5, z + .26, { mat: glassMat(), line: .005, cast: false });
      for (let r2 = 0; r2 < 3; r2++) for (let c = 0; c < 3; c++) cyl(G, .035, .035, .14, [0xFFD43B, 0x7FCFAE, 0x7DB3F0][c], x - .16 + c * .12, .55 + r2 * .3, z + .18, { line: .005 }); break;
    case "bigtable": case "table": box(G, w - .12, .44, d - .12, C.wood, x, 0, z);
      if (horiz) { const n = o.kind === "bigtable" ? o.w : Math.max(1, Math.round(w / 1.2)); for (let k = 0; k < n; k++) for (const s of [-1, 1]) chair(G, wx(o.x) + (k + .5) * w / n, z + s * (d / 2 + .02), s < 0 ? 0 : Math.PI, o.kind === "bigtable" ? 0xFFD43B : C.white);
        for (let k = 0; k < n; k += (o.kind === "bigtable" ? 2 : 1)) cyl(G, .04, .035, .09, k % 2 ? 0x7DB3F0 : C.white, wx(o.x) + (k + .5) * w / n, .44, z + (k % 4 ? .1 : -.1), { line: .006 }); }
      else { const n = o.kind === "bigtable" ? o.h : Math.max(1, Math.round(d / 1.2)); for (let k = 0; k < n; k++) for (const s of [-1, 1]) chair(G, x + s * (w / 2 + .02), wz(o.y) + (k + .5) * d / n, s < 0 ? Math.PI / 2 : -Math.PI / 2, o.kind === "bigtable" ? 0xFFD43B : C.white);   // 세로로 놓인 테이블: 양옆에 의자
        for (let k = 0; k < n; k += (o.kind === "bigtable" ? 2 : 1)) cyl(G, .04, .035, .09, k % 2 ? 0x7DB3F0 : C.white, x + (k % 4 ? .1 : -.1), .44, wz(o.y) + (k + .5) * d / n, { line: .006 }); }
      break;
    case "pebbles": { // 창가 띠: 이끼 깔린 흙에 넓적한 디딤돌, 창 쪽엔 작은 나무와 풀이 우거진다
      box(G, w, .03, d, 0x6F8F4F, x, 0, z, { line: 0, cast: false });
      const rr = rng(o.x * 17 + o.y * 3);
      for (let i = 0; i < o.w * 1.6; i++) { const sx = wx(o.x) + (i + .3 + rr() * .4) / 1.6 * S, sz = wz(o.y) + d * (.45 + rr() * .35);   // 디딤돌
        const st = box(G, .5 + rr() * .25, .04, .38 + rr() * .2, [0xA8A6A0, 0x9A9890, 0xB6B3AB][i % 3], sx, .02, sz, { line: .006, cast: false }); st.rotation.y = (rr() - .5) * .8; }
      for (let i = 0; i < o.w * .8; i++) { const tx = wx(o.x) + (i + .5) / (o.w * .8) * w + (rr() - .5) * .3, tz = wz(o.y) + .25 + rr() * .2, th = .9 + rr() * .7;   // 창가 작은 나무
        cyl(G, .025, .03, th, 0x6B5A44, tx, 0, tz, { line: 0 });
        for (let k = 0; k < 4; k++) ball(G, .16 + rr() * .1, k % 2 ? 0x3F8F5A : 0x5DB075, tx + (rr() - .5) * .35, th * (.55 + k * .14), tz + (rr() - .5) * .3, { line: .008 }); }
      for (let i = 0; i < o.w * o.h * 2; i++) { const px = wx(o.x) + rr() * w, pz = wz(o.y) + rr() * d;   // 풀 포기
        for (let j = 0; j < 5; j++) { const bl = solidMesh(new THREE.ConeGeometry(.025, .16 + rr() * .14, 4), j % 2 ? 0x5DB075 : 0x7FBF5A, { line: 0, cast: false }); bl.position.set(px + (rr() - .5) * .12, .1, pz + (rr() - .5) * .12); bl.rotation.set((rr() - .5) * .7, 0, (rr() - .5) * .7); G.add(bl); } }
      break; }
    case "windowseat": { // 창가 띠 위 흰 의자(창을 등지고 방 쪽을 본다) + 띠 끝의 원기둥 다리 흰 사각 테이블
      const cz = wz(o.y) + .45, tz = wz(o.y + o.h) - .4, chrome = 0xC9CDD3;
      chair(G, x, cz, 0);
      box(G, .62, .035, .62, C.white, x, .46, tz, { line: .01 }); cyl(G, .03, .03, .46, chrome, x, 0, tz, { line: 0 });
      for (let k = 0; k < 4; k++) { const leg = box(G, .36, .025, .04, chrome, x, 0, tz, { line: 0 }); leg.rotation.y = k * Math.PI / 2 + Math.PI / 4; leg.translateX(.16); }
      break; }
    case "solo": // 창을 보는 1인용 흰 책상, 의자는 남쪽 칸에
      box(G, w - .2, .44, d - .35, C.white, x, 0, z - .1); box(G, .26, .02, .1, 0xE6E4EC, x, .44, z, { line: .005 }); chair(G, x, z + d / 2 + .12, Math.PI); break;
    case "halfround": { // 나무 반원 테이블: 북쪽이 곧은 변, 남쪽 둥근 변을 따라 의자가 가운데를 본다
      const R = o.w / 2 * S - .3, cx = x, cz = wz(o.y);
      const top = solidMesh(new THREE.CylinderGeometry(R, R, .06, 36, 1, false, -Math.PI / 2, Math.PI), C.woodD, { line: .012 }); top.position.set(cx, .44, cz); G.add(top);
      const base = solidMesh(new THREE.CylinderGeometry(R * .55, R * .55, .44, 24, 1, false, -Math.PI / 2, Math.PI), C.wood, { line: .01 }); base.position.set(cx, .22, cz + .05); G.add(base);
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i + .5) / 6 * Math.PI; chair(G, cx + Math.sin(a) * (R + .15), cz + Math.cos(a) * (R + .15), a + Math.PI); }
      break; }
    case "brickdeck": { // 살짝 올라온 벽돌 단: 붉은 벽돌 옆면에 줄눈
      box(G, w, DECK_H, d, 0xB5583F, x, 0, z, { line: .012, cast: false }); box(G, w - .04, .015, d - .04, 0xF2E6D2, x, DECK_H, z, { line: 0, cast: false });
      for (const s of [-1, 1]) box(G, w + .01, .012, .01, 0x8E3F2C, x, DECK_H / 2, z + s * (d / 2 + .003), { line: 0, cast: false });
      for (const s of [-1, 1]) box(G, .01, .012, d + .01, 0x8E3F2C, x + s * (w / 2 + .003), DECK_H / 2, z, { line: 0, cast: false });
      break; }
    case "greenbox": { // 벽돌 화단에 키 큰 잎·야자잎·고사리가 우거진다
      const bh = .55; box(G, w - .04, bh, d - .1, 0xB5583F, x, 0, z, { line: .012 });
      for (let k = 1; k < 4; k++) box(G, w - .03, .012, d - .09, 0x8E3F2C, x, k * bh / 4, z, { line: 0, cast: false });
      box(G, w - .14, .02, d - .2, 0x5A4636, x, bh, z, { line: 0 });
      const rr = rng(o.x * 31 + o.y * 7);
      for (let i = 0; i < o.w * 3; i++) bush(G, wx(o.x) + (i + .5) / (o.w * 3) * w + (rr() - .5) * .2, z + (rr() - .5) * (d - .4), bh, .35 + rr() * .75, rr, i);
      break; }
    case "stairbed": { // 계단 동쪽 옆(세로): 계단 쪽엔 식물이 우거진 붉은 벽돌 화단, 복도 쪽엔 한 단 낮은 벽돌 위에 나무 벤치. 계단 가장자리엔 유리 난간
      const x0 = wx(o.x), bw = .68, bh = .55, sw = S - bw - .04, sx = x0 + bw + sw / 2;
      box(G, bw, bh, d - .04, 0xB4573F, x0 + bw / 2, 0, z, { mat: brickMat(d, false), line: .012 });
      box(G, bw - .1, .02, d - .14, 0x5A4636, x0 + bw / 2, bh, z, { line: 0 });
      box(G, sw - .06, .25, d - .04, 0xB4573F, sx - .03, 0, z, { mat: brickMat(d, false), line: .01 });
      box(G, sw + .02, .05, d - .04, C.wood, sx, .25, z, { line: .008 });   // 벽돌보다 살짝 내민 나무 상판
      const rr = rng(o.x * 29 + o.y);
      for (let i = 0; i < o.h * 3; i++) bush(G, x0 + bw / 2 + (rr() - .5) * .3, wz(o.y) + (i + .5) / (o.h * 3) * d + (rr() - .5) * .2, bh, .3 + rr() * .8, rr, i);
      if (SEAT_SINK) for (let i = 0; i < o.h; i += 2) SEAT_SINK.push({ x: tX(sx), y: o.y + i + .5, yaw: Math.PI / 2 });   // 벤치에 걸터앉아 복도를 본다
      for (let y = o.y; y < o.y + o.h; y++) { const hn = heightAt(fl, o.x - .5, y + .5);   // 계단 높이를 따라 오르는 유리 난간 + 검은 손잡이
        box(G, .03, .9, S - .02, C.glass, x0, hn, wz(y + .5), { mat: glassMat(), line: .006, cast: false }); box(G, .05, .04, S, C.dark, x0, hn + .9, wz(y + .5), { line: 0 }); }
      break; }
    case "fernbed": { // 벽돌 벽 발치(벽 칸의 복도 쪽 반)에 이끼를 깔고 고사리·관엽을 낮게 심은 화단
      const x0 = wx(o.x) + .02, bw = S / 2 - .1, rr = rng(o.y * 13 + o.x);
      box(G, bw, .06, d - .1, 0x4F7A3A, x0 + bw / 2, 0, z, { line: .008, cast: false });
      for (let i = 0; i < o.h * 3; i++) bush(G, x0 + bw * (.35 + rr() * .4), wz(o.y) + (i + .5) / (o.h * 3) * d + (rr() - .5) * .2, .06, .12 + rr() * .45, rr, i);
      break; }
    case "bistro": { // 창가 끝 작은 흰 원탁: 검은 기둥 다리, 흰 의자 둘이 마주 본다
      cyl(G, .32, .32, .03, C.white, x, .44, z, { seg: 24 }); cyl(G, .025, .025, .44, C.dark, x, 0, z, { line: 0 });
      for (const a of [0, Math.PI / 2]) box(G, .5, .02, .04, C.dark, x, 0, z, { line: 0 }).rotation.y = a + Math.PI / 4;
      chair(G, x - .58, z + .1, Math.PI / 2); chair(G, x + .58, z - .1, -Math.PI / 2); break; }
    case "linelight": { // 복도를 따라 길게 매단 선형 조명(층 천장 바로 밑)
      const hy = CEIL[fl.f] - .25, lamp = new THREE.MeshBasicMaterial({ color: 0xFFFDF2 }), L = (horiz ? w : d) - .3;
      const lx = horiz ? x : x + .15, lz = horiz ? z + .15 : z;   // horiz면 동서로 길게
      box(fl.lamps, horiz ? L : .1, .05, horiz ? .1 : L, C.dark, lx, hy, lz, { line: 0, cast: false });
      const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? L - .06 : .06, .01, horiz ? .06 : L - .06), lamp); m.position.set(lx, hy - .005, lz); fl.lamps.add(m);
      for (const s of [-1, 1]) cyl(fl.lamps, .006, .006, CEIL[fl.f] - hy + .3, C.dark, lx + (horiz ? s * (L / 2 - .5) : 0), hy + .05, lz + (horiz ? 0 : s * (L / 2 - .5)), { line: 0, cast: false });
      break; }
    case "planter": box(G, w, .3, d * .8, C.brick, x, 0, z); for (let i = 0; i < o.w; i++) ball(G, .18 + (i % 3) * .03, C.leaf, wx(o.x + i + .5), .4, z, { line: .012 }); break;
    case "plant": { cyl(G, .22, .16, .36, 0xD98E64, x, 0, z, { seg: 16 }); cyl(G, .2, .2, .02, 0x5A4636, x, .35, z, { line: 0 }); cyl(G, .025, .03, .5, 0x6B8F4E, x, .36, z, { line: 0 });
      const rr = rng(o.x * 11 + o.y); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + rr() * .4, tilt = .5 + rr() * .5, len = .32 + rr() * .14;
        const leaf = solidMesh(LEAF_GEO, i % 3 ? 0x3F8F5A : 0x5DB075, { line: .012 }); leaf.scale.set(len * .32, .03, len); leaf.position.set(x + Math.sin(a) * len * .75, .62 + (i % 3) * .1 + Math.cos(tilt) * .08, z + Math.cos(a) * len * .75); leaf.rotation.set(-tilt * .5, a, 0, "YXZ"); G.add(leaf); }
      break; }
    case "tower": { const r = w / 2 - .1, n = o.tall ? Math.floor((FH + CEIL[13]) / .4) : 3;   // tall: 12층 바닥부터 13층 천장까지
      for (let k = 0; k <= n; k++) cyl(G, r, r, .05, C.gray, x, k * .4, z, { seg: 28 });
      const rr = rng(o.x * 13);
      for (let k = 0; k < n; k++) for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; const bh = .22 + rr() * .1; const b = new THREE.Mesh(new THREE.BoxGeometry(.06, bh, .16), toon(new THREE.Color(BOOKS[(i + k) % BOOKS.length]).getHex())); b.position.set(x + Math.cos(a) * (r - .1), k * .4 + .05 + bh / 2, z + Math.sin(a) * (r - .1)); b.rotation.y = -a; b.castShadow = true; G.add(b); }
      cyl(G, .12, .12, n * .4 + .05, C.grayD, x, 0, z); break; }
    case "shelf": { box(G, w - .06, 1.0, d - .06, 0xF4EFE6, x, 0, z); const rr = rng(o.x * 7 + o.y); const n = Math.max(o.w, o.h) * 4;
      for (let k = 0; k < 2; k++) for (let i = 0; i < n; i++) { const bh = .22 + rr() * .08; const along = (i + .5) / n;
        const geo = horiz ? new THREE.BoxGeometry(w / n * .8, bh, .05) : new THREE.BoxGeometry(.05, bh, d / n * .8);
        const b = new THREE.Mesh(geo, toon(new THREE.Color(BOOKS[Math.floor(rr() * BOOKS.length)]).getHex()));
        b.position.set(horiz ? wx(o.x) + along * w : x + w / 2 + .01, .15 + k * .45 + bh / 2, horiz ? z + d / 2 + .01 : wz(o.y) + along * d); G.add(b); }
      break; }
    case "redsteps": box(G, w, .1, d, C.red, x, 0, z, { line: .015 }); box(G, w, .1, d / 2, C.red, x, .1, wz(o.y + .5), { line: .015 }); break;
    case "stadium": { // 스테인리스 벽 + 나무 상판 + 안쪽 벤치: 서쪽 끝은 반원, 북쪽 곧은 변, 동쪽 끝은 북→동 4분원(남쪽은 트임)
      const R = o.r * S, ax = wx(o.a), bx = wx(o.b), cz = wz(o.cy);
      for (const [r0, r1, y0, hh, col] of [[R - .12, R, 0, .9, 0xA9ADB3], [R - .22, R + .02, .9, .04, 0xD9B98A], [R - .7, R - .12, 0, .42, 0xD9B98A]]) {
        const pr = [new THREE.Vector2(r0, y0), new THREE.Vector2(r1, y0), new THREE.Vector2(r1, y0 + hh), new THREE.Vector2(r0, y0 + hh), new THREE.Vector2(r0, y0)];
        for (const [px, a0, len] of [[ax, Math.PI, Math.PI], [bx, Math.PI / 2, Math.PI / 2]]) { const m = solidMesh(new THREE.LatheGeometry(pr, 32, a0, len), col, { line: .01, cast: false }); m.position.set(px, 0, cz); G.add(m); }
        box(G, bx - ax, hh, r1 - r0, col, (ax + bx) / 2, y0, cz - (r0 + r1) / 2, { line: .01, cast: false });
      }
      break; }
    case "booth4": { // 벽돌 벽에 움푹 들어간 4인 부스: 뒤·양옆 벽돌, 양옆에 마주 보는 초록 벤치, 가운데 벤치와 나란한 스테인리스 테이블
      const zb = wz(o.y), bh = 1.6, dd = 2 * S;
      box(G, w, bh, .14, 0xB4573F, x, 0, zb + .07, { mat: brickMat(w), line: .01 });
      for (const s of [-1, 1]) box(G, .14, bh, d, 0xB4573F, x + s * (w / 2 - .07), 0, z, { mat: brickMat(d), line: .01 });
      box(G, w, .3, .14, 0xB4573F, x, bh, wz(o.y + o.h) - .07, { mat: brickMat(w, false), line: .01 });   // 앞쪽 위 벽돌 인방
      for (const s of [-1, 1]) { const bx = x + s * (w / 2 - .14 - S / 2);
        box(G, S - .1, .42, dd - .1, 0x8E9A6E, bx, 0, zb + dd / 2 + .07, { line: .01 }); box(G, .16, .5, dd - .1, 0x7C8A5E, bx + s * (S / 2 - .12), .42, zb + dd / 2 + .07, { line: .01 });
        if (SEAT_SINK) for (let i = 0; i < 2; i++) SEAT_SINK.push({ x: tX(bx), y: o.y + i + .5, yaw: s < 0 ? Math.PI / 2 : -Math.PI / 2 }); }
      { const tz = zb + dd / 2 + .07, steel = 0xC3C7CD;   // 스테인리스 테이블: 벤치와 나란히 길게(남북), 판 다리 둘
        box(G, 1.0, .05, dd - .35, steel, x, .42, tz, { line: .008 }); for (const s2 of [-1, 1]) box(G, .7, .42, .03, 0xB2B6BC, x, 0, tz + s2 * (dd / 2 - .45), { line: .005 }); }
      break; }
    case "pairbooth": { // 2인 페어 부스: 서쪽 경계에 키 큰 회색 칸막이, 북쪽 벽에 붙은 나무 책상, 모니터 하나에 의자 둘(벽을 본다)
      const zb = wz(o.y), dz = zb + S / 2;
      box(G, .1, 1.7, S * 2, 0xC9C7C2, wx(o.x) + .06, 0, zb + S, { line: .01 });
      if (o.back) box(G, w, 1.7, .1, 0xC9C7C2, x, 0, zb + .05, { line: .01 });   // 방 가운데에 설 때는 책상 뒤에도 칸막이
      box(G, w - .2, .05, S - .3, C.wood, x + .05, .44, dz - .1, { line: .01 }); box(G, .05, .44, S - .4, C.grayD, wx(o.x) + .2, 0, dz - .1, { line: 0 }); box(G, .05, .44, S - .4, C.grayD, wx(o.x + o.w) - .1, 0, dz - .1, { line: 0 });
      monitor(G, wx(o.x + 2), .49, zb + .3, 0, .5);
      for (const k of [1, 2]) chair(G, wx(o.x + k + .5), wz(o.y + 1) + .3, Math.PI);
      break; }
    case "mcdesk": { // MC석: 가는 철제 프레임 위 흰 상판, 모니터 둘은 남쪽(앉는 쪽)을 보고, 남쪽에 동그란 의자 둘
      const steel = 0xB7BCC6, zt = z - .1;
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(G, .04, .72, .04, steel, x + a * (w / 2 - .12), 0, zt + b * (d / 2 - .2), { line: 0 });
      box(G, w - .15, .04, d - .3, steel, x, .2, zt, { line: .006 }); box(G, w - .1, .05, d - .3, C.white, x, .72, zt, { line: .01 });
      for (const s of [-1, 1]) monitor(G, x + s * .45, .77, zt - .12, 0, .5);
      for (const s of [-1, 1]) { const sx = x + s * .45, sz = wz(o.y + 1) + .25;
        cyl(G, .03, .03, .55, steel, sx, 0, sz, { line: 0 }); cyl(G, .16, .16, .05, 0xB7BCC6, sx, .55, sz, { line: .006 }); cyl(G, .14, .17, .02, steel, sx, 0, sz, { line: 0 });
        if (SEAT_SINK) SEAT_SINK.push({ x: tX(sx), y: o.y + 1.2, yaw: Math.PI }); }
      break; }
    case "poster": { // 벽에 붙인 모집 포스터(face e: 벽 동쪽 면, w: 서쪽 면). at = 붙일 벽 면의 격자 x
      const f = o.face === "w" ? -1 : 1, px = wx(o.at) + f * .02, ph = 1.05, pw = ph * 530 / 750;
      box(G, .02, ph + .04, pw + .04, 0xFFFFFF, px, .3, z, { line: .006, cast: false });
      board(G, pw, ph, recruitPosterTex, px + f * .012, .32 + ph / 2, z, f * Math.PI / 2);
      break; }
    case "pod": { // 등받이·옆판이 높은 크림색 1인 소파(남쪽을 본다), 한쪽 팔걸이에 나무 받침
      const cr = 0xEDE6D6, zb = wz(o.y);
      box(G, w - .14, .36, d - .2, cr, x, 0, z + .04, { line: .01 });
      box(G, w - .14, 1.15, .14, cr, x, 0, zb + .12, { line: .01 });
      for (const s of [-1, 1]) box(G, .12, 1.0, d - .2, cr, x + s * (w / 2 - .13), 0, z + .04, { line: .01 });
      box(G, .3, .04, .42, C.woodD, x + w / 2 - .2, .62, z + .1, { line: .008 });
      if (SEAT_SINK) SEAT_SINK.push({ x: o.x + .5, y: o.y + .55, yaw: 0 });
      break; }
    case "highbar": { // 창가 긴 나무 하이 카운터: 검은 다리, 앞에 높은 검은 의자
      box(G, w - .1, .05, d - .5, C.wood, x, .78, z + .15, { line: .01 });
      for (let i = 0; i <= o.w; i += 4) box(G, .04, .78, .04, C.dark, wx(o.x) + .1 + Math.min(i, o.w - .2) * S, 0, z + .15, { line: 0 });
      for (let i = 0; i < o.w; i += 2) { const sx = wx(o.x + i + .5), sz = wz(o.y) - .05;
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(G, .025, .6, .025, C.dark, sx + a * .12, 0, sz + b * .12, { line: 0 });
        box(G, .32, .04, .3, 0x26262B, sx, .6, sz, { line: .006 }); box(G, .32, .3, .04, 0x26262B, sx, .64, sz - .15, { line: .006 });
        if (SEAT_SINK) SEAT_SINK.push({ x: o.x + i + .5, y: o.y - .1, yaw: 0 }); }
      break; }
    case "brickwall": box(G, w, 1.9, .14, 0xB4573F, x, 0, wz(o.y) + .07, { mat: brickMat(w), line: .01 }); break;
    case "winbench": { // 창가 나무 벤치: 앉으면 카운터 안쪽(북)을 본다
      box(G, w - .1, .42, d - .4, 0xD9B98A, x, 0, z + .15, { line: .01 });
      if (SEAT_SINK) for (let i = 0; i < o.w; i++) SEAT_SINK.push({ x: o.x + i + .5, y: o.y + .55, yaw: Math.PI });
      break; }
    case "island": // 주방 아일랜드: 허리 높이 상판, 남쪽에 바 스툴
      box(G, w - .1, .56, d - .2, 0xE6D8C3, x, 0, z, { line: .012 });
      for (let i = 0; i < o.w; i++) { const sx = wx(o.x + i + .5), sz = wz(o.y + o.h) + .15; cyl(G, .02, .02, .5, 0xC9CCD3, sx, 0, sz, { line: 0 }); cyl(G, .14, .14, .04, 0xB7BCC6, sx, .5, sz, { line: .006 }); }
      break;
    case "coffee": box(G, w - .12, .22, d - .12, C.dark, x, 0, z); cyl(G, .05, .04, .08, C.white, x - .2, .22, z, { line: .006 }); break;
    case "bleacher": { // 두 칸마다 한 단씩 올라가는 객석 (axis y: 앞쪽 화면을 바라본다)
      const n = o.axis === "y" ? o.h : o.w;
      for (let i = 0; i < n; i++) { const k = bleacherLevel(o, i); const hh = (k + 1) * STEP;
        if (o.axis === "y") box(G, w, hh, S, k % 2 ? C.olive : 0xC9D08A, x, 0, wz(o.y + i + .5), { line: .012, cast: false });
        else box(G, S, hh, d, k % 2 ? C.olive : 0xC9D08A, wx(o.x + i + .5), 0, z, { line: .012, cast: false }); }
      if (o.axis === "y") for (let i = 1; i < n; i += 2) { const k = bleacherLevel(o, i); for (const c of [1, 4, 6]) if (c < o.w) box(G, .28, .07, .28, [0xFFD43B, 0xF7A6A0, 0x7DB3F0][c % 3], wx(o.x + c + .5), (k + 1) * STEP, wz(o.y + i + .5), { line: .008 }); }
      break; }
    case "void": if (o.steel) { // 철제 난간: 기둥 + 위·가운데 가로대
        const st = 0xA9AEB5, hh = .95;
        for (const [ax, az, len, horiz2] of [[x, wz(o.y), w, true], [x, wz(o.y + o.h), w, true], [wx(o.x), z, d, false], [wx(o.x + o.w), z, d, false]] as [number, number, number, boolean][]) {
          for (const yy of [hh, hh * .5]) box(G, horiz2 ? len : .04, .04, horiz2 ? .04 : len, st, ax, yy, az, { line: .004 });
          const n = Math.max(1, Math.round(len / .9)); for (let i = 0; i <= n; i++) { const t = -len / 2 + i * len / n; box(G, .045, hh, .045, st, horiz2 ? ax + t : ax, 0, horiz2 ? az : az + t, { line: .004 }); }
        }
        break; }
      { const rail = (w2, d2, x2, z2) => box(G, w2, .5, d2, C.glass, x2, 0, z2, { mat: glassMat(), line: .012, cast: false });
      rail(w, .04, x, wz(o.y)); rail(w, .04, x, wz(o.y + o.h)); rail(.04, d, wx(o.x), z); rail(.04, d, wx(o.x + o.w), z);
      for (const [w2, d2, x2, z2] of [[w, .06, x, wz(o.y)], [w, .06, x, wz(o.y + o.h)], [.06, d, wx(o.x), z], [.06, d, wx(o.x + o.w), z]]) box(G, w2, .04, d2, C.woodD, x2, .5, z2, { line: 0 });   // 나무 손잡이
      break; }
    case "railbed": { // 난간 안쪽에 길게 깔린 이끼 화단: 흰 턱 위로 고사리가 길 쪽으로 늘어진다
      const vert = o.h > o.w, rr = rng(o.x * 19 + o.y * 5), n = Math.max(o.w, o.h) * 3;
      box(G, w - .04, .07, d - .3, 0x4F7A3A, x, 0, vert ? z : z - .1, { line: .008, cast: false });
      box(G, vert ? .04 : w, .1, vert ? d : .04, C.white, vert ? x + w / 2 - .1 : x, 0, vert ? z : wz(o.y + o.h) - .2, { line: .006, cast: false });
      for (let i = 0; i < n; i++) { const t = (i + .5) / n, side = (rr() - .5) * .45;
        bush(G, vert ? x + side : wx(o.x) + t * w, vert ? wz(o.y) + t * d : z - .1 + side, .07, .12 + rr() * (i % 4 ? .35 : .75), rr, i); }
      break; }
    case "arcplanter": { // 곡선 스테인리스 카운터(서쪽이 트인 C자) 안에 조약돌·풀밭과 가는 나무 한 그루
      const R = Math.min(w, d) / 2 - .1, a0 = -Math.PI * .25, len = Math.PI * 1.5;   // 동·남·북을 감싼다
      const ring = (r0, r1, y0, hh, col) => { const pr = [new THREE.Vector2(r0, 0), new THREE.Vector2(r1, 0), new THREE.Vector2(r1, hh), new THREE.Vector2(r0, hh), new THREE.Vector2(r0, 0)];   // 안쪽 벽까지 닫고, 바닥에서 만들어 올린다(먹선이 위로 뜨지 않게)
        const m = solidMesh(new THREE.LatheGeometry(pr, 40, a0, len), col, { line: .01, cast: false }); m.position.set(x, y0, z); G.add(m); };
      ring(R - .45, R, .42, .05, 0xC4C8CE); ring(R - .4, R - .3, 0, .42, 0x9EA3AA);   // 상판 + 안쪽으로 들인 받침
      const bed = solidMesh(new THREE.CylinderGeometry(R - .5, R - .5, .08, 32), 0x5E8A44, { line: .01, cast: false }); bed.position.set(x, .04, z); G.add(bed);
      const rr = rng(o.x * 23 + o.y);
      for (let i = 0; i < 14; i++) { const a = rr() * Math.PI * 2, rad = rr() * (R - .7); const st = solidMesh(LEAF_GEO, [0xE4E1DA, 0xBDB8AE, 0xF2EFE8][i % 3], { line: .004, cast: false }); const r = .06 + rr() * .06; st.scale.set(r * 1.3, r * .45, r); st.position.set(x + Math.cos(a) * rad, .08, z + Math.sin(a) * rad); G.add(st); }
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + rr(); bush(G, x + Math.cos(a) * (R - .9), z + Math.sin(a) * (R - .9), .08, .15 + rr() * .3, rr, i); }
      cyl(G, .3, .24, .3, C.white, x, 0, z, { seg: 18 });   // 흰 화분에 가는 나무
      cyl(G, .03, .045, 1.9, 0x7A6248, x, .3, z, { line: 0 });
      for (let i = 0; i < 26; i++) { const a = rr() * Math.PI * 2, hy = 1.1 + rr() * 1.2, rad = .12 + rr() * .45, len = .14 + rr() * .1;
        const leaf = solidMesh(LEAF_GEO, [0x3F8F5A, 0x5DB075, 0x7FBF5A][i % 3], { line: .008 }); leaf.scale.set(len * .5, .03, len); leaf.position.set(x + Math.cos(a) * rad, hy, z + Math.sin(a) * rad); leaf.rotation.set(-.4, a, 0, "YXZ"); G.add(leaf); }
      break; }
    case "sofa": { // 패브릭 소파: 앉는 면 + 등받이 + 팔걸이 + 쿠션
      const col = o.color || 0x4A5C94; box(G, w - .1, .24, d - .1, col, x, 0, z);
      if (horiz) { box(G, w - .1, .3, .16, col, x, .24, wz(o.y) + .13); for (const s3 of [-1, 1]) box(G, .14, .18, d - .1, col, x + s3 * (w / 2 - .12), .24, z); }
      else { box(G, .16, .3, d - .1, col, wx(o.x) + .13, .24, z); for (const s3 of [-1, 1]) box(G, w - .1, .18, .14, col, x, .24, z + s3 * (d / 2 - .12)); }
      for (let i = 0; i < Math.max(o.w, o.h) - 1; i += 2) ball(G, .1, [0xFFD43B, 0xF7A6A0][i / 2 % 2], horiz ? wx(o.x + i + 1) : wx(o.x) + .32, .4, horiz ? wz(o.y) + .32 : wz(o.y + i + 1), { line: .008 }); break; }
    case "round": cyl(G, w / 2 - .12, w / 2 - .12, .04, C.white, x, .4, z); cyl(G, .04, .04, .4, C.dark, x, 0, z, { line: 0 });
      for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + .3; chair(G, x + Math.sin(a) * (w / 2 + .05), z + Math.cos(a) * (w / 2 + .05), a + Math.PI); } break;
    case "door": box(G, .1, 1.3, d - .1, 0xE7E6EC, x, 0, z); board(G, .3, .3, signTex(o.y < 17 ? "남" : "여", { size: 90, w: 128, h: 128 }), x - .07, 1.05, z, -Math.PI / 2); break;
    case "acunit": box(G, w - .1, .9, d - .1, 0xDADCE3, x, 0, z); for (let i = 0; i < Math.max(1, Math.floor(o.w / 2)); i++) cyl(G, .2, .2, .03, C.grayD, wx(o.x + 1 + i * 2), .9, z, { line: .008 }); box(G, .05, .5, .05, C.grayD, x + w / 2 - .2, .9, z, { line: 0 }); break;
    case "wc": { // 화장실 칸막이와 세면대
      for (let i = 0; i < 3; i++) { const sx = wx(o.x + 1 + i * 1.6); box(G, .05, 1.0, d * .45, 0xBFD9F0, sx + .4, 0, wz(o.y) + d * .22, { line: .008 }); cyl(G, .14, .12, .3, C.white, sx, 0, wz(o.y) + .3, { line: .008 }); }
      box(G, w * .7, .55, .4, C.white, x, 0, wz(o.y + o.h) - .3); for (let i = 0; i < 3; i++) box(G, .3, .04, .25, 0xBFC6D2, x - .7 + i * .7, .55, wz(o.y + o.h) - .3, { line: .006 }); break; }
    case "rack": box(G, w - .1, 1.6, d - .1, C.dark, x, 0, z); { const rr = rng(o.x * 31); for (let i = 0; i < o.h * 3; i++) box(G, .02, .02, .02, rr() > .4 ? 0x7FCFAE : 0xFFD43B, x + w / 2 - .04, .2 + (i % 6) * .22, wz(o.y) + .3 + Math.floor(i / 6) * .5, { line: 0, cast: false }); } break;
    case "crates": { const rr = rng(o.x * 17 + o.y); for (let i = 0; i < o.w; i++) for (let j = 0; j < o.h; j++) { const hh = .3 + rr() * .3; box(G, .5, hh, .5, 0xD8B48A, wx(o.x + i + .5), 0, wz(o.y + j + .5), { line: .01 }); if (rr() > .5) box(G, .4, .25, .4, 0xE6C9A3, wx(o.x + i + .5), hh, wz(o.y + j + .5), { line: .01 }); } break; }
    case "flight": { // 오르는 계단 한 줄(dir 쪽으로 높아진다). h0 = h1이면 층계참
      const n = flightSteps(o);
      for (let i = 0; i < n; i++) { const hh = Math.max(.05, o.h0 + (o.h1 - o.h0) * (i + 1) / n);
        // 검은 철판 계단에 밝은 나무 디딤판
        if (o.dir === "e") { const sx = wx(o.x) + (i + .5) * w / n; box(G, w / n, hh - .03, d - .1, 0x34333B, sx, 0, z, { line: .01 }); box(G, w / n, .03, d - .1, C.wood, sx, hh - .03, z, { line: .006 }); }
        else { const sz = wz(o.y) + (i + .5) * d / n; box(G, w - .1, hh - .03, d / n, 0x34333B, x, 0, sz, { line: .01 }); box(G, w - .1, .03, d / n, C.wood, x, hh - .03, sz, { line: .006 }); } }
      break; }
    case "rail": // 계단 옆 난간: 맞닿은 계단 높이 + 손잡이 높이까지 올라오는 얇은 판
      for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) {
        const hn = o.edge === "e" ? heightAt(fl, x + 1.5, y + .5) : heightAt(fl, x + .5, y - .5);
        if (o.edge === "e") box(G, .06, hn + .9, S, 0xC9CCD3, wx(x + 1) - .03, 0, wz(y + .5), { line: .008 });
        else box(G, S, hn + .9, .06, 0xC9CCD3, wx(x + .5), 0, wz(y) + .03, { line: .008 });
      } break;
    case "stairsdeco": for (let i = 0; i < o.h; i++) box(G, w - .1, (i % 4 + 1) * .12, S, 0xDCDAE3, x, 0, wz(o.y + i + .5), { line: .01, cast: false }); break;
    case "bench": box(G, w - .1, .3, d * .6, C.wood, x, 0, z); for (const s of [-1, 1]) box(G, .06, .3, d * .5, C.woodD, x + s * (w / 2 - .2), 0, z, { line: 0 }); ball(G, .12, 0xFFD43B, x - .3, .4, z, { line: .008 }); break;
    case "beanbag": { // 누울 수 있는 큰 빈백: 납작한 몸통 + 등받이 쪽 볼록
      const c = [0xFFD43B, 0xF7A6A0, 0x7DB3F0, 0xC9B8F0][(o.x + o.y) % 4], r = Math.min(w, d) / 2 - .06, yaw = o.yaw || 0;
      const s2 = solidMesh(new THREE.SphereGeometry(r, 20, 12), c, { line: .02 }); s2.scale.set(1, .26, 1.05); s2.position.set(x, r * .14, z); G.add(s2);
      const back = solidMesh(new THREE.SphereGeometry(r * .7, 16, 10), c, { line: .02 }); back.scale.set(1.15, .42, .55); back.position.set(x - Math.sin(yaw) * r * .62, r * .32, z - Math.cos(yaw) * r * .62); back.rotation.y = yaw; G.add(back); break; }
    case "partition": box(G, .12, .95, d - .1, 0xD9D2C3, wx(o.x) + .08, 0, z); break;   // 칸막이 자리 쪽 베이지 판(코워킹 쪽은 greenbox 화단이 덮는다)
    case "walltable": { // 화단에 붙인 나무 테이블(가로로 만들어 turn으로 돌린다): 철제 다리, 의자는 남쪽에서 북쪽(화단)을 본다
      const tz = wz(o.y) + d * .4; box(G, w - .1, .05, d * .7, C.wood, x, .42, tz, { line: .008 });
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(G, .04, .42, .04, 0x9EA3AA, x + a * (w / 2 - .12), 0, tz + b * (d * .35 - .08), { line: 0 });
      for (let i = 0; i < o.w; i++) chair(G, wx(o.x + i + .5), wz(o.y + 1) + .05, Math.PI, C.wood);
      break; }
    case "focusdesk": box(G, w - .08, .44, d - .2, C.white, x, 0, wz(o.y) + d / 2 - .05);
      for (let i = 0; i < o.w; i++) { const px = wx(o.x + i + .5); monitor(G, px, .44, wz(o.y) + .15, 0, .36); chair(G, px, wz(o.y + 1) + .1, Math.PI); if (i) box(G, .03, .3, d - .2, 0x7A9A7E, wx(o.x + i), .44, wz(o.y) + d / 2 - .05, { line: .005 }); } break;
    case "carrel": { // 독서실 칸막이 책상(가로로 만들어 turn으로 돌린다): 북쪽이 칸막이 벽, 나무 상판, 칸마다 높은 철판 옆판, 의자는 남쪽
      const steel = 0xB9BDC3, dz = wz(o.y) + d * .3;
      for (let i = 0; i < o.w; i++) {
        const px = wx(o.x + i + .5);
        box(G, S - .08, .05, d * .55, C.wood, px, .42, dz, { line: .006 });                 // 나무 상판(벽에 매단 것처럼 다리 없이)
        box(G, .22, .02, .16, 0xF4F1EA, px - .1, .47, dz + .05, { line: .004 });            // 펼친 책
        chair(G, px, wz(o.y + 1) + .1, Math.PI, C.wood);                                      // 나무 의자
      }
      for (let i = 0; i <= o.w; i++) box(G, .04, 1.05, d * .85, steel, wx(o.x + i), .08, wz(o.y) + d * .43, { line: .006 });   // 철판 옆판(상판보다 앞으로 길게)
      break; }
    case "wallpiece": { // 홀로 선 짧은 벽(방 벽처럼 들어가서 볼 때 천장까지 늘어난다). mural이면 동쪽 면에 그림
      const vert = o.h > o.w; box(fl.walls, vert ? .1 : w, WALL, vert ? d : .1, C.white, x, 0, z);
      if (o.mural) { const mw = Math.min(vert ? d : w, 1.7) - .1; const m = board(fl.signs, mw, mw / 2, muralTex(o.mural[0], o.mural[1]), vert ? x + .06 : x, .45, vert ? z : z + .06, vert ? Math.PI / 2 : 0); m.material.transparent = true; }
      break; }
    case "pillar": box(fl.walls, w * .45, WALL, d * .45, 0xBDBDBA, x, 0, z, { line: .01 }); break;   // 콘크리트 기둥(천장까지)
    case "walldeco": { // 동쪽 벽(벽돌)에 붙은 것: 서쪽을 본다. door 흰 점검문, hydrant 빨간 띠 두른 흰 소화전함
      const fx = wx(o.x + o.w) - .1;
      if (o.item === "door") { box(G, .05, 1.35, d - .5, 0xF2F1EE, fx, 0, z, { line: .01, cast: false }); box(G, .03, .05, .1, C.grayD, fx - .04, .65, z - (d - .5) / 2 + .1, { line: 0 }); }
      else { box(G, .06, .95, .5, 0xF4F3F0, fx, .25, z, { line: .01, cast: false }); box(G, .065, .07, .5, 0xD9342B, fx, 1.13, z, { line: 0 }); ball(G, .035, 0xD9342B, fx - .05, 1.0, z - .15, { line: 0 }); }
      break; }
    case "whiteboard": { // 바퀴 달린 화이트보드: 두 다리 사이에 흰 판, 아래 바퀴
      box(G, .04, .62, .9, C.white, x, .55, z, { line: .01 }); for (const s of [-1, 1]) { box(G, .03, 1.2, .03, C.grayD, x, 0, z + s * .46, { line: 0 }); box(G, .3, .03, .03, C.grayD, x, .02, z + s * .46, { line: 0 }); }
      for (const [a, b] of [["#2F6FD6", .1], ["#D9342B", -.15]]) box(G, .045, .015, .25, new THREE.Color(a as string).getHex(), x + .01, .95 + (b as number), z, { line: 0 });
      break; }
    case "ringtable": { // 스테인리스 링 테이블: 가운데가 뚫린 고리 상판 + 판 다리, 가운데 화분
      const r1 = Math.min(w, d) / 2 - .05, r0 = r1 * .5, steel = 0xC3C7CD;
      const prof = [new THREE.Vector2(r0, 0), new THREE.Vector2(r1, 0), new THREE.Vector2(r1, .06), new THREE.Vector2(r0, .06)];
      const top = solidMesh(new THREE.LatheGeometry(prof, 48), steel, { line: .012 }); top.position.set(x, .42, z); G.add(top);
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + .4, rm = (r0 + r1) / 2, leg = box(G, .03, .42, r1 - r0 - .06, steel, x + Math.sin(a) * rm, 0, z + Math.cos(a) * rm, { line: .006 }); leg.rotation.y = a; }
      cyl(G, r0 * .7, r0 * .6, .35, 0x9EA3AA, x, 0, z, { seg: 20, line: .008 }); ball(G, r0 * .6, C.leaf, x, .5, z, { line: .01 }); ball(G, r0 * .45, 0x5DB075, x + .1, .72, z - .05, { line: .01 });
      break; }
    case "tvstand": { // 바퀴 달린 스탠드에 큰 모니터(동쪽, 링 테이블 쪽을 본다)
      cyl(G, .03, .03, 1.0, C.dark, x, 0, z, { line: 0 }); box(G, .5, .03, .5, C.dark, x, 0, z, { line: 0 });
      screen169(G, .95, .6, .8, screenTex, x + .04, z, Math.PI / 2); break; }
    case "hightable": { // 스테인리스 기둥 높은 원탁 + 바 스툴 둘
      cyl(G, .16, .16, .62, 0xC3C7CD, x, 0, z, { seg: 20, line: .008 }); cyl(G, .3, .3, .04, 0xC3C7CD, x, .62, z, { seg: 24, line: .008 });
      for (const s of [-1, 1]) { const sx = x + s * .5; cyl(G, .02, .02, .45, C.dark, sx, 0, z, { line: 0 }); cyl(G, .13, .13, .04, C.dark, sx, .45, z, { line: .006 }); }
      break; }
    case "steelrack": { // 철제 프레임 선반: 가는 기둥 넷, 칸마다 얇은 철판, 위에 상자 몇 개
      const st = 0xA9AEB5, H2 = 1.9, ww = w - .1, dd = d - .2;
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(G, .04, H2, .04, st, x + a * ww / 2, 0, z + b * dd / 2, { line: .004 });
      for (const yy of [.05, .65, 1.25, 1.85]) box(G, ww, .03, dd, st, x, yy, z, { line: .004, cast: false });
      box(G, .4, .3, .35, 0xD9C7A8, x - ww / 4, .68, z, { line: .006 }); box(G, .3, .2, .3, C.white, x + ww / 4, 1.28, z, { line: .006 }); break; }
    case "lowcounter": // 허리 높이 흰 카운터 위에 모니터 둘과 프린터
      box(G, w - .1, .62, d - .2, C.white, x, 0, z, { line: .01 });
      monitor(G, x - w * .15, .62, z, 0, .42); monitor(G, x + w * .15, .62, z, 0, .42); box(G, .34, .16, .26, 0xE6E4EC, x + w * .38, .62, z, { line: .006 }); break;
    case "kitchenrow": { // 서쪽 벽 주방: 진회색 하부장 + 스테인리스 상판 + 뒤 벽판(upper면 위에 상부장과 붙인 사진), 동쪽을 본다
      const bx = wx(o.x) + .05, gray = 0x5B5F66, steel = 0xB9BDC3;
      box(G, .58, .58, d - .06, gray, bx + .3, 0, z, { line: .01 }); box(G, .62, .04, d - .04, steel, bx + .31, .58, z, { line: .008 });
      for (let i = 1; i < o.h * 2; i++) box(G, .01, .5, .01, 0x3F4248, bx + .6, .04, wz(o.y) + i * d / (o.h * 2), { line: 0 });
      box(G, .04, .9, d - .04, steel, bx + .02, .62, z, { line: .006, cast: false });
      if (o.upper) { box(G, .34, .55, d - .06, gray, bx + .17, 1.55, z, { line: .01 }); for (let i = 0; i < 4; i++) box(G, .01, .12, .1, [0xF7A6A0, 0x7DB3F0, 0xFFD43B, 0xffffff][i], bx + .35, 1.75 + (i % 2) * .14, z + .5 + (i >> 1) * .13, { line: 0 }); }
      else { box(G, .3, .14, .22, C.white, bx + .3, .62, z - .3, { line: .006 }); cyl(G, .05, .04, .1, C.white, bx + .3, .62, z + .2, { line: .005 }); }
      break; }
    case "islandbar": { // 길쭉한 스테인리스 하이 테이블: 남북으로 뻗고 북쪽 끝이 둥글다, 동쪽에 바 스툴
      const steel = 0xC3C7CD, tw = .62, hh = .7, len = d - .3, r = tw / 2;
      const body = new THREE.Group(); body.position.set(x, 0, z + .05); G.add(body);
      box(body, tw - .06, hh, len - r, steel, 0, 0, r / 2, { line: .01 }); const cap = solidMesh(new THREE.CylinderGeometry(r - .03, r - .03, hh, 24, 1, false, Math.PI / 2, Math.PI), steel, { line: .01 }); cap.position.set(0, hh / 2, -len / 2 + r); body.add(cap);
      box(body, tw, .04, len - r, 0xD6D9DE, 0, hh, r / 2, { line: .006 }); const cap2 = solidMesh(new THREE.CylinderGeometry(r, r, .04, 24, 1, false, Math.PI / 2, Math.PI), 0xD6D9DE, { line: .006 }); cap2.position.set(0, hh + .02, -len / 2 + r); body.add(cap2);
      for (let i = 0; i < 3; i++) { const sz = wz(o.y) + (i + .8) * d / 3.4, sx = x + tw / 2 + .32; cyl(G, .02, .02, .5, C.dark, sx, 0, sz, { line: 0 }); box(G, .3, .04, .28, C.dark, sx, .5, sz, { line: .006 }); box(G, .04, .28, .26, C.dark, sx + .14, .54, sz, { line: .006 }); }
      break; }
    case "duo": // 1인용 흰 책상에 의자 둘이 마주 붙어 있다
      box(G, w - .4, .44, d - .4, C.white, x, 0, z); for (const s of [-1, 1]) chair(G, x, z + s * (d / 2 - .1), s < 0 ? 0 : Math.PI); break;
    case "pairrow": // 띄엄띄엄 놓은 페어 책상: 남북 양쪽에 둘씩 앉아 한 모니터를 같이 본다(모니터는 등을 맞대고 둘)
      box(G, w - .06, .44, d - .04, C.wood, x, 0, z);
      for (const s of [-1, 1]) {
        monitor(G, x, .44, z + s * .08, s < 0 ? Math.PI : 0, .55);
        box(G, .3, .02, .1, C.white, x, .44, z + s * (d / 2 - .3), { line: .005 });
        for (const k of [-1, 1]) chair(G, x + k * .4, z + s * (d / 2 + .1), s < 0 ? 0 : Math.PI);
      } break;
    case "pairdesk": // 안쪽 벽에 붙은 책상 하나, 모니터 하나, 의자 둘
      box(G, w - .1, .44, d - .2, C.wood, x, 0, z); monitor(G, x, .44, z + .08, Math.PI, .55); box(G, .3, .02, .1, C.white, x - .18, .44, z - .1, { line: .005 }); box(G, .3, .02, .1, C.white, x + .18, .44, z - .1, { line: .005 });
      chair(G, x - .25, z - d / 2 - .1, 0); chair(G, x + .25, z - d / 2 - .1, 0); break;
    case "karaoke": box(G, w * .9, .9, .1, C.dark, x, .1, wz(o.y) + .15); board(G, w * .9 - .1, .8, karaokeTex, x, .55, wz(o.y) + .21); box(G, .7, .35, .4, C.dark, x, 0, wz(o.y) + .5);
      for (const s of [-1, 1]) { cyl(G, .03, .03, .2, 0x2E2C38, x + s * .2, .35, wz(o.y) + .55, { line: 0 }); ball(G, .05, 0xC0C4D0, x + s * .2, .58, wz(o.y) + .55, { line: .005 }); } break;
    case "mirrorball": { cyl(G, .01, .01, .7, C.dark, x, 1.7, z, { line: 0, cast: false }); const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 1), new THREE.MeshStandardMaterial({ color: 0xE8ECF5, metalness: .9, roughness: .15, flatShading: true })); m.position.set(x, 1.6, z); G.add(m); m.userData.noMerge = true; spinners.push(m);
      for (let i = 0; i < 9; i++) { const a = i * 2.39, rr = .5 + i * .18; const s2 = new THREE.Mesh(new THREE.CircleGeometry(.09, 10), new THREE.MeshBasicMaterial({ color: [0xFFD43B, 0xF7A6A0, 0x7DB3F0][i % 3], transparent: true, opacity: .55 })); s2.rotation.x = -Math.PI / 2; s2.position.set(x + Math.cos(a) * rr, .012, z + Math.sin(a) * rr); G.add(s2); } break; }
    case "speaker": box(G, .4, 1.1, .36, C.dark, x, 0, z); for (const yy of [.35, .8]) cyl(G, .12, .12, .02, 0x55525F, x, yy, z + .19, { line: 0 }).rotation.x = Math.PI / 2; break;
    case "arcade": { const c = [0xF15B5B, 0x7DB3F0, 0xFFD43B, 0x7FCFAE][(o.x >> 1) % 4]; box(G, .5, 1.25, .5, c, x, 0, z); box(G, .44, .36, .02, C.dark, x, .75, z + .26, { line: .005 }); board(G, .4, .3, arcadeTex(["#F15B5B", "#7DB3F0", "#FFD43B", "#7FCFAE"][(o.x >> 1) % 4]), x, .93, z + .28);
      box(G, .5, .06, .22, C.dark, x, .58, z + .34, { line: .005 }); cyl(G, .015, .015, .1, C.dark, x - .1, .64, z + .34, { line: 0 }); ball(G, .035, 0xF15B5B, x - .1, .76, z + .34, { line: 0 }); ball(G, .03, 0xFFD43B, x + .1, .66, z + .34, { line: 0 }); break; }
    case "trampoline": { const r = Math.min(w, d) / 2 - .1; cyl(G, r, r, .14, 0x2F6FDB, x, .04, z, { seg: 32 }); const mat2 = new THREE.Mesh(new THREE.CircleGeometry(r - .12, 32), toon(0x1C1C26)); mat2.rotation.x = -Math.PI / 2; mat2.position.set(x, .19, z); mat2.receiveShadow = true; G.add(mat2);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; cyl(G, .03, .03, .06, C.dark, x + Math.cos(a) * (r - .05), 0, z + Math.sin(a) * (r - .05), { line: 0 }); } break; }
    case "ballpit": { box(G, w, .35, .08, 0x7DB3F0, x, 0, wz(o.y) + .04); box(G, w, .35, .08, 0x7DB3F0, x, 0, wz(o.y + o.h) - .04); box(G, .08, .35, d, 0x7DB3F0, wx(o.x) + .04, 0, z); box(G, .08, .35, d, 0x7DB3F0, wx(o.x + o.w) - .04, 0, z);
      const n = Math.floor(o.w * o.h * 7), geo = new THREE.SphereGeometry(.07, 8, 6), inst = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ gradientMap: gradient }), n); const rr = rng(o.x * 5 + 1), m4 = new THREE.Matrix4(), col = new THREE.Color();
      for (let i = 0; i < n; i++) { m4.makeTranslation(wx(o.x) + .12 + rr() * (w - .24), .03 + rr() * .2, wz(o.y) + .12 + rr() * (d - .24)); inst.setMatrixAt(i, m4); inst.setColorAt(i, col.setHex(BALLS[i % BALLS.length])); }
      G.add(inst); break; }
    case "slide": { box(G, w - .1, 1.0, .4, 0xFFD43B, x, 0, wz(o.y) + .2); const s2 = solidMesh(new THREE.BoxGeometry(w - .2, .06, d * .95), 0xF15B5B, { cast: false }); s2.rotation.x = .38; s2.position.set(x, .55, z + .1); G.add(s2); for (let i = 0; i < 4; i++) box(G, w - .1, .04, .04, C.dark, x, .2 + i * .22, wz(o.y) + .02, { line: 0 }); break; }
    case "pingpong": box(G, w - .3, .5, d - .3, 0x2F8A62, x, 0, z); box(G, .02, .01, d - .3, C.white, x, .5, z, { line: 0 }); box(G, .04, .12, d - .2, C.white, x, .5, z, { mat: toon(C.white, { opacity: .6 }), line: .005, cast: false });
      for (const s of [-1, 1]) { cyl(G, .07, .07, .015, 0xF15B5B, x + s * (w / 2 - .4), .5, z + s * .2, { line: .004 }); } ball(G, .03, C.white, x + .3, .62, z, { line: 0 }); break;
    case "boardgame": box(G, w - .3, .28, d - .3, C.wood, x, 0, z); box(G, .5, .02, .5, 0xFFF6C7, x, .28, z, { line: .006 }); for (let i = 0; i < 4; i++) cyl(G, .03, .04, .09, [0xF15B5B, 0x7DB3F0, 0xFFD43B, 0x7FCFAE][i], x - .15 + i * .1, .3, z - .05 + (i % 2) * .1, { line: .004 });
      for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) box(G, .3, .08, .3, 0xF7A6A0, x + a * (w / 2 - .05), 0, z + b * (d / 2 - .05), { line: .008 }); break;
    case "sculpture": { // 놀이 광장 한가운데 커다란 하루들 얼굴
      cyl(G, .5, .6, .3, C.gray, x, 0, z); const h = solidMesh(new THREE.SphereGeometry(.6, 24, 18), C.white, { line: .03 }); h.position.set(x, .9, z); G.add(h);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), new THREE.MeshBasicMaterial({ color: INK })); e.scale.set(1, 1.4, .5); e.position.set(x + s * .2, .98, z + .56); G.add(e); }
      const sm = new THREE.Mesh(new THREE.TorusGeometry(.18, .025, 6, 16, Math.PI * .7), new THREE.MeshBasicMaterial({ color: INK })); sm.rotation.z = Math.PI + Math.PI * .15; sm.position.set(x, .86, z + .57); G.add(sm);
      { const be = solidMesh(new THREE.SphereGeometry(.34, 16, 10), 0xFFD43B, { line: .015 }); be.scale.set(1, .35, 1); be.position.set(x - .12, 1.45, z - .05); be.rotation.z = .25; G.add(be); } break; }
    case "parasol": cyl(G, .02, .02, 1.5, C.grayD, x, 0, z, { line: 0 }); { const c = solidMesh(new THREE.ConeGeometry(.75, .3, 8), 0xFFD43B, { line: .015 }); c.position.set(x, 1.55, z); G.add(c); }
      cyl(G, .32, .32, .04, C.white, x, .42, z); for (let k = 0; k < 2; k++) chair(G, x + (k ? .5 : -.5), z, k ? -Math.PI / 2 : Math.PI / 2); break;
  }
}
function buildPortal(G, p, fl) {
  const x = wx(p.x + p.w / 2), z = wz(p.y + p.h / 2), w = p.w * S, d = p.h * S;
  if (p.kind === "mat") { // 계단 모양은 따로 있고(flight) 여기는 밟으면 넘어가는 발판
    box(G, w - .1, .03, d - .1, 0xFFF3B0, wx(p.x + p.w / 2), 0, wz(p.y + p.h / 2), { line: .012, cast: false });
  } else if (p.kind === "stairs") {
    const up = p.to > fl.f, n = 6;
    for (let i = 0; i < n; i++) { const hh = up ? (i + 1) * .12 : .03; box(G, w - .1, hh, d / n, 0xFFF3B0, x, 0, wz(p.y) + (i + .5) * d / n, { line: .012, cast: false }); }
  } else {
    const g = new THREE.Group(); g.position.set(x, 0, z); G.add(g);
    const ramp = solidMesh(new THREE.BoxGeometry(w - .2, .06, d * 1.02), 0xDCEFE3, { cast: false }); ramp.rotation.x = -.18; ramp.position.y = .3; g.add(ramp);
    for (const s of [-1, 1]) { const rail = solidMesh(new THREE.BoxGeometry(.08, .35, d * 1.02), 0x2F8A62); rail.rotation.x = -.18; rail.position.set(s * (w / 2 - .06), .5, 0); g.add(rail); }
  }
}

/* ════════════════ 5. 하루들 캐릭터 (입체) ════════════════ */
const ACC = ["#FFD43B", "#0E1E46", "#F7A6A0", "#7FCFAE", "#7DB3F0", "#FF9F43"];
const HAIRS = ["curl", "beret", "cap", "bun", "spiky", "none", "bob"];
const lookFrom = (seed) => { const h = hash(seed); return { hair: HAIRS[h % HAIRS.length], acc: ACC[(h >>> 4) % ACC.length], prop: ["bag", "glasses", "scarf", "bag", "none"][(h >>> 8) % 5] }; };
const lookKey = (l) => `${l.hair}|${l.acc}|${l.prop}`;
function drawChar(c, look) { // 하루들 그림체: 동그란 얼굴, 흰 몸통, 검은 선, 라벤더 소품, 손 흔들기
  c.save(); c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#111118"; c.lineWidth = 1.9;
  c.beginPath(); c.moveTo(-3, -6); c.lineTo(-3, 1); c.lineTo(-5, 1); c.moveTo(3, -6); c.lineTo(3, 1); c.lineTo(5, 1); c.stroke();
  c.beginPath(); c.moveTo(-5, -17); c.quadraticCurveTo(-8.5, -8, -7.5, -6); c.lineTo(7.5, -6); c.quadraticCurveTo(8.5, -8, 5, -17); c.closePath(); c.fillStyle = "#fff"; c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-5, -15); c.quadraticCurveTo(-9, -12, -9.5, -9); c.moveTo(5, -15); c.quadraticCurveTo(9, -18, 10, -21); c.stroke();
  c.beginPath(); c.arc(10.4, -22, 1.6, 0, 7); c.fillStyle = "#fff"; c.fill(); c.stroke();
  if (look.prop === "bag") { c.beginPath(); c.moveTo(-4, -16.5); c.lineTo(4, -9); c.stroke(); c.fillStyle = look.acc; c.beginPath(); c.rect(2, -10.5, 6, 5); c.fill(); c.stroke(); }
  if (look.prop === "scarf") { c.fillStyle = look.acc; c.fillRect(-5.5, -18, 11, 3); c.strokeRect(-5.5, -18, 11, 3); }
  const hy = -24.5; c.beginPath(); c.arc(0, hy, 7.2, 0, Math.PI * 2); c.fillStyle = "#fff"; c.fill(); c.stroke();
  c.fillStyle = "#111118"; c.beginPath(); c.ellipse(-2.6, hy - .4, .9, 1.2, 0, 0, 7); c.ellipse(2.6, hy - .4, .9, 1.2, 0, 0, 7); c.fill();
  c.lineWidth = 1.3; c.beginPath(); c.arc(0, hy + 1.4, 2.6, .18 * Math.PI, .82 * Math.PI); c.stroke(); c.lineWidth = 1.9;
  if (look.prop === "glasses") { c.lineWidth = 1.1; c.beginPath(); c.arc(-2.6, hy - .4, 2.2, 0, 7); c.moveTo(4.8, hy - .4); c.arc(2.6, hy - .4, 2.2, 0, 7); c.stroke(); c.lineWidth = 1.9; }
  switch (look.hair) {
    case "curl": c.beginPath(); for (let i = 0; i < 4; i++) { c.moveTo(-6 + i * 4, hy - 5); c.arc(-4 + i * 4, hy - 6.5, 2, Math.PI, 0); } c.stroke(); break;
    case "beret": c.fillStyle = look.acc; c.beginPath(); c.ellipse(-1, hy - 6, 8, 3.8, -.1, Math.PI, 0); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-1, hy - 9.8); c.lineTo(-.4, hy - 11.4); c.stroke(); break;
    case "cap": c.fillStyle = look.acc; c.beginPath(); c.arc(0, hy - 2, 7.2, Math.PI, 0); c.lineTo(11, hy - 2); c.closePath(); c.fill(); c.stroke(); break;
    case "bun": c.fillStyle = "#111118"; c.beginPath(); c.arc(0, hy - 9, 2.8, 0, 7); c.fill(); c.beginPath(); c.arc(0, hy, 7.2, 1.15 * Math.PI, 1.85 * Math.PI); c.lineWidth = 2.6; c.stroke(); break;
    case "spiky": c.beginPath(); c.moveTo(-6, hy - 4); for (let i = 0; i < 5; i++) { c.lineTo(-5 + i * 2.6, hy - 9.5); c.lineTo(-3.7 + i * 2.6, hy - 5); } c.stroke(); break;
    case "bob": c.fillStyle = "#111118"; c.beginPath(); c.arc(0, hy - 1, 8, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(8, hy + 2.5); c.lineTo(5.6, hy + 2.5); c.lineTo(5.6, hy - 3); c.lineTo(-5.6, hy - 3); c.lineTo(-5.6, hy + 2.5); c.lineTo(-8, hy + 2.5); c.closePath(); c.fill(); break;
  }
  c.restore();
}
function drawDog(c) { // 하루들 강아지: 흰 몸, 처진 귀, 라벤더 목줄
  c.save(); c.strokeStyle = "#111118"; c.lineWidth = 1.8; c.lineCap = "round"; c.fillStyle = "#fff";
  c.beginPath(); for (const lx of [-5, -2, 3, 6]) { c.moveTo(lx, -4); c.lineTo(lx, 1); } c.stroke();
  c.beginPath(); c.ellipse(1, -6.5, 7.5, 3.8, 0, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(7.5, -7.5); c.quadraticCurveTo(10.5, -11.5, 9.5, -14.5); c.stroke();
  c.beginPath(); c.arc(-6, -11, 5, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(-10.4, -11, 1.7, 3, .3, 0, 7); c.ellipse(-1.6, -11, 1.7, 3, -.3, 0, 7); c.fill(); c.stroke();
  c.fillStyle = "#111118"; c.beginPath(); c.arc(-7.6, -11.5, .8, 0, 7); c.arc(-4.4, -11.5, .8, 0, 7); c.arc(-6, -9.6, .9, 0, 7); c.fill();
  c.strokeStyle = BRAND; c.lineWidth = 2.2; c.beginPath(); c.arc(-5, -6.5, 3.6, .3 * Math.PI, .9 * Math.PI); c.stroke(); c.restore();
}
// ─── 입체 하루들: 동그란 흰 얼굴 + 흰 몸통 + 검은 막대 팔다리 + 라벤더 소품. 덕후감처럼 툰 + 먹선 윤곽 ───
const turnTo = (from, to) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const blackMat = new THREE.MeshToonMaterial({ color: INK, gradientMap: gradient });
const blobGeo = new THREE.CircleGeometry(.3, 24); blobGeo.rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
const stick = (len, r = .022) => { const g = new THREE.CylinderGeometry(r, r, len, 8); g.translate(0, -len / 2, 0); const m = new THREE.Mesh(g, blackMat); m.castShadow = true; return m; };
const part = (geo, color, line = .014) => solidMesh(geo, color, { line });
const black = (geo) => { const m = new THREE.Mesh(geo, blackMat); m.castShadow = true; return m; };
const accHex = (c) => new THREE.Color(c).getHex();
// ─── 하루들 캐릭터: 모양은 Harudle/harudle-world의 <Avatar>·<Doodle>을 그대로 쓴다 (src/harudle) ───
// 엔진은 자리·방향·자세만 맡고, 그리는 일은 src/scene/Dolls.tsx가 한다.
const AV: Record<string, string[]> = Object.fromEntries(Object.entries(AVATAR_OPTIONS).map(([k, opts]) => [k, opts.map((o) => o.value)]));
const PART_LABELS = { head: "머리", face: "표정", eyewear: "안경", outfit: "옷", neck: "목", bag: "가방", held: "손에 든 것" };   // 하루들 월드 AvatarCustomizer와 같은 이름
const AV_LABEL: Record<string, Record<string, string>> = Object.fromEntries(Object.entries(AVATAR_OPTIONS).map(([k, opts]) => [k, { _: PART_LABELS[k], ...Object.fromEntries(opts.map((o) => [o.value, o.label])) }]));
const AV_COLORS = AVATAR_COLORS.map((c) => c.value as string);
const AV_SKINS = AVATAR_COLORS.filter((c) => c.label.startsWith("피부") && c.label !== "피부 4").map((c) => c.value as string);
const AV_COLOR_PARTS = AVATAR_COLOR_PARTS.map((p) => [p.key, p.label] as const);
const AV_PARTS = Object.keys(AV);
const AV_PRESETS = AVATAR_PRESETS.map((p) => [p.label, p.config] as const);
const DEFAULT_AV: AvatarConfig = AVATAR_PRESETS[0].config;
// 다른 크루에게 보낼 43글자: 부위 7개(한 글자씩) + 색 6개(16진수 여섯 글자씩, 직접 고른 색도 된다)
const avEncode = (c: AvatarConfig) => AV_PARTS.map((p) => Math.max(0, AV[p].indexOf(c[p])).toString(36)).join("") + AV_COLOR_PARTS.map(([k]) => (c[k] || "#FFFFFF").slice(1).toUpperCase()).join("");
function avDecode(s: unknown): AvatarConfig | null {
  if (typeof s !== "string" || !/^[0-9a-z]{7}([0-9A-F]{6}){6}$/.test(s)) return null;
  return sanitizeAvatar({ ...Object.fromEntries(AV_PARTS.map((p, i) => [p, AV[p][parseInt(s[i], 36)]])), ...Object.fromEntries(AV_COLOR_PARTS.map(([k], i) => [k, "#" + s.slice(7 + i * 6, 13 + i * 6)])) });
}
// 하루들 월드 randomAvatar와 같은 규칙 (피부는 밝은 색에서만). 크루는 닉네임으로 정해져 누가 봐도 같은 모습
function avRandom(r = Math.random): AvatarConfig {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)], c: Record<string, string> = {};
  for (const p of AV_PARTS) c[p] = pick(AV[p]);
  for (const [k] of AV_COLOR_PARTS) c[k] = pick(AV_COLORS);
  c.skinColor = pick(AV_SKINS); return sanitizeAvatar(c);
}
const avFromSeed = (seed: string) => { const h = hash(seed), r = rng(h); if (h % 6 === 0) return { ...AVATAR_PRESETS[0].config }; if (h % 6 === 1) return { ...AVATAR_PRESETS[1].config }; return avRandom(r); };
const avKey = (c: AvatarConfig) => avEncode(c);
// 피드 창 2D 얼굴용으로 대략 옮긴 모습
const avToLook = (c: AvatarConfig) => ({ hair: { beret: "beret", curly: "curl", cap: "cap" }[c.head] || "none", acc: c.headColor, prop: c.bag !== "none" ? "bag" : c.eyewear !== "none" ? "glasses" : c.neck === "scarf" ? "scarf" : "none" });
function makeChar(cfg: AvatarConfig) { const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = .012; blob.renderOrder = 1; return makeDoll("avatar", { ...DEFAULT_AV, ...cfg }, blob); }
function makeDog() { const blob = new THREE.Mesh(blobGeo, blobMat); blob.scale.setScalar(.9); blob.position.y = .012; blob.renderOrder = 1; return makeDoll("dog", null, blob); }
// 피드 창 얼굴 사진은 2D 하루들 낙서로
const avatarCache = new Map();
const avatarURL = (look) => { const k = lookKey(look); if (avatarCache.has(k)) return avatarCache.get(k); const cv = document.createElement("canvas"); cv.width = cv.height = 128; const g = cv.getContext("2d"); g.fillStyle = WEAK; g.fillRect(0, 0, 128, 128); g.translate(64, 122); g.scale(3.4, 3.4); drawChar(g, look); const u = cv.toDataURL(); avatarCache.set(k, u); return u; };

/* ════════════════ 5-2. 스킬: 네 컷 그리기 · 인사 · 하트 ════════════════ */
const SKILLS = { draw: { label: "네 컷 그리기", dur: 5.4 }, wave: { label: "인사", dur: 2 }, heart: { label: "하트", dur: 2 }, laptop: { label: "노트북", dur: 1e9 }, coffee: { label: "아이스 아메리카노", dur: 4.6 } };   // laptop은 일어날 때까지 펼쳐 둔다
const easeOut = (x) => 1 - (1 - x) ** 3;
// 하루들 낙서 한 칸씩(0~108 좌표). 같은 seed면 누가 봐도 같은 네 컷이 나온다
const DOODLES = [
  (g) => { g.beginPath(); g.arc(40, 40, 15, 0, 7); g.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.moveTo(40 + Math.cos(a) * 21, 40 + Math.sin(a) * 21); g.lineTo(40 + Math.cos(a) * 29, 40 + Math.sin(a) * 29); } g.stroke(); g.beginPath(); g.moveTo(8, 88); for (let x = 8; x <= 100; x += 12) g.quadraticCurveTo(x + 6, 80, x + 12, 88); g.stroke(); },
  (g) => { for (const cx of [36, 72]) { g.beginPath(); g.arc(cx, 34, 11, 0, 7); g.stroke(); g.beginPath(); g.moveTo(cx, 45); g.lineTo(cx, 72); g.moveTo(cx, 72); g.lineTo(cx - 9, 94); g.moveTo(cx, 72); g.lineTo(cx + 9, 94); g.stroke(); } g.beginPath(); g.moveTo(24, 58); g.lineTo(36, 52); g.lineTo(72, 52); g.lineTo(84, 58); g.stroke(); },
  (g) => { g.beginPath(); g.arc(54, 56, 26, 0, 7); g.stroke(); g.beginPath(); g.ellipse(28, 54, 7, 16, .3, 0, 7); g.ellipse(80, 54, 7, 16, -.3, 0, 7); g.stroke(); g.fillStyle = "#111118"; g.beginPath(); g.arc(45, 52, 2.6, 0, 7); g.arc(63, 52, 2.6, 0, 7); g.arc(54, 61, 3.4, 0, 7); g.fill(); g.beginPath(); g.arc(54, 64, 8, .2 * Math.PI, .8 * Math.PI); g.stroke(); },
  (g) => { g.strokeRect(22, 28, 64, 42); g.beginPath(); g.moveTo(12, 78); g.lineTo(96, 78); g.stroke(); g.font = "700 22px monospace"; g.fillStyle = "#0E1E46"; g.textAlign = "center"; g.fillText("</>", 54, 56); },
  (g) => { g.beginPath(); g.moveTo(32, 46); g.lineTo(36, 88); g.lineTo(68, 88); g.lineTo(72, 46); g.closePath(); g.stroke(); g.beginPath(); g.arc(76, 62, 9, -1.2, 1.2); g.stroke(); for (const x of [44, 54, 64]) { g.beginPath(); g.moveTo(x, 38); g.quadraticCurveTo(x - 6, 28, x, 18); g.stroke(); } },
  (g) => { g.fillStyle = "#FFD43B"; g.beginPath(); g.moveTo(54, 86); g.bezierCurveTo(14, 58, 26, 22, 54, 40); g.bezierCurveTo(82, 22, 94, 58, 54, 86); g.fill(); g.stroke(); },
  (g) => { g.beginPath(); g.arc(54, 54, 20, 0, 7); g.stroke(); g.beginPath(); g.ellipse(54, 57, 40, 10, -.25, 0, 7); g.stroke(); g.fillStyle = "#111118"; g.beginPath(); g.arc(47, 52, 2, 0, 7); g.arc(61, 52, 2, 0, 7); g.fill(); },
  (g) => { g.beginPath(); g.moveTo(54, 34); g.quadraticCurveTo(32, 26, 14, 34); g.lineTo(14, 84); g.quadraticCurveTo(32, 76, 54, 84); g.quadraticCurveTo(76, 76, 94, 84); g.lineTo(94, 34); g.quadraticCurveTo(76, 26, 54, 34); g.lineTo(54, 84); g.stroke(); for (const y of [46, 56, 66]) { g.beginPath(); g.moveTo(22, y); g.lineTo(46, y - 2); g.moveTo(62, y - 2); g.lineTo(86, y); g.stroke(); } },
  (g) => { g.strokeRect(34, 22, 40, 28); for (const cx of [38, 70]) { g.beginPath(); g.arc(cx, 68, 10, 0, 7); g.stroke(); g.beginPath(); g.moveTo(cx - 12, 96); g.quadraticCurveTo(cx, 76, cx + 12, 96); g.stroke(); } },
  (g) => { g.beginPath(); g.arc(40, 40, 14, Math.PI, 0); g.arc(60, 36, 16, Math.PI, 0); g.arc(78, 44, 11, Math.PI * 1.2, Math.PI * .5); g.lineTo(28, 55); g.arc(28, 46, 9, Math.PI * .5, Math.PI * 1.5); g.stroke(); g.strokeStyle = "#7DB3F0"; for (const x of [36, 52, 68]) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x - 4, 76); g.moveTo(x + 6, 82); g.lineTo(x + 2, 94); g.stroke(); } },
];
function drawComic(g, seed, prog, npc = false) {
  const r = rng(seed), picks = []; while (picks.length < 4) { const i = Math.floor(r() * DOODLES.length); if (!picks.includes(i)) picks.push(i); }
  g.clearRect(0, 0, 256, 256); g.save(); g.lineJoin = "round"; g.lineCap = "round";
  g.fillStyle = "rgba(17,17,24,.35)"; g.fillRect(6, 8, 248, 246); g.fillStyle = "#fff"; g.fillRect(2, 2, 248, 246); g.strokeStyle = "#111118"; g.lineWidth = 4; g.strokeRect(2, 2, 248, 246);
  for (let i = 0; i < 4; i++) {
    const px = 10 + (i % 2) * 120, py = 10 + Math.floor(i / 2) * 120, p = clamp(prog - i, 0, 1);
    g.lineWidth = 3; g.strokeStyle = p > 0 ? "#111118" : "#E3E7F1"; g.strokeRect(px, py, 112, 112);
    if (p <= 0) continue;
    g.save(); g.beginPath(); g.rect(px, py, 112 * p, 112); g.clip(); g.translate(px + 2, py + 2); g.strokeStyle = "#111118"; g.lineWidth = 3.2; DOODLES[picks[i]](g); g.restore();
    if (p < 1) { g.fillStyle = BRAND; g.beginPath(); g.arc(px + 112 * p, py + 56 + Math.sin(p * 30) * 30, 5, 0, 7); g.fill(); }
  }
  if (prog >= 4) { g.fillStyle = NAVY; g.font = `700 30px ${HAND}`; g.textAlign = "right"; g.fillText("하루들!", 244, 242); }
  if (npc) { g.fillStyle = NAVY; g.fillRect(2, 2, 58, 26); g.fillStyle = "#FFD43B"; g.font = `700 20px ${HAND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("NPC", 31, 16); }   // NPC가 든 그림은 왼쪽 위에 표시
  g.restore();
}
const fxTex = (draw) => canvasTex(64, 64, draw);
const heartTex = fxTex((g) => { g.fillStyle = "#F7A6A0"; g.strokeStyle = "#111118"; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(4, 34, 12, 8, 32, 22); g.bezierCurveTo(52, 8, 60, 34, 32, 54); g.fill(); g.stroke(); });
const starTex = fxTex((g) => { g.fillStyle = "#FFD43B"; g.strokeStyle = "#111118"; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 11 : 26; g.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke(); });
const fx = [];
function spawnFx(tex, at, n = 1, spread = .4, up = 1.1) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.2, .2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(at.x + (Math.random() - .5) * spread, at.y + up + Math.random() * .3, at.z + (Math.random() - .5) * spread); m.renderOrder = 5; scene.add(m);
    fx.push({ m, vy: .5 + Math.random() * .5, vx: (Math.random() - .5) * .4, life: 1.4 });
  }
}
function tickFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.life -= dt; f.m.position.y += f.vy * dt; f.m.position.x += f.vx * dt; f.m.rotation.y = cam.yaw; f.m.material.opacity = clamp(f.life / .6, 0, 1); f.m.scale.setScalar(1 + (1.4 - f.life) * .4);
    if (f.life <= 0) { f.m.removeFromParent(); f.m.geometry.dispose(); f.m.material.dispose(); fx.splice(i, 1); } }
}
function makeBoard(seed) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 256; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.95, .95), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })); mesh.renderOrder = 4;
  return { mesh, g: cv.getContext("2d"), tex, seed, last: -1, sparked: false, npc: false };
}
// actor: { doll, act, board } — 나, 크루(NPC), 같이 있는 크루 모두 같은 방식
function startAct(a, name, seed?) {
  if (!SKILLS[name]) return; endAct(a);
  a.act = { name, t: 0, seed: seed ?? Math.floor(Math.random() * 1e6) };
  if (name === "draw") { a.board = makeBoard(a.act.seed); a.board.npc = NPCS.includes(a); scene.add(a.board.mesh); }
  if (name === "laptop" || name === "coffee") { a.prop = name === "laptop" ? makeLaptop() : makeIcedCoffee(); scene.add(a.prop); }
}
// 인벤토리 물건: 노트북(펼친 화면에 코드), 아이스 아메리카노(투명 컵에 얼음·빨대)
function makeLaptop() { // 맥북: 은색 알루미늄 몸체, 검은 테두리 화면(코드가 흘러간다), 검은 자판·트랙패드, 뚜껑 뒤 로고. 화면은 앉은 사람 쪽(+z)을 본다
  const g = new THREE.Group(), alu = 0xC9CCD2;
  box(g, .34, .016, .24, alu, 0, 0, 0, { line: .004, cast: false });
  box(g, .29, .002, .1, 0x2A2B30, 0, .016, -.035, { line: 0, cast: false });   // 자판
  for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) box(g, .022, .002, .018, 0x3A3B42, -.12 + k * .0267, .018, -.075 + r * .022, { line: 0, cast: false });
  box(g, .11, .002, .065, 0xB9BCC3, 0, .017, .07, { line: 0, cast: false });   // 트랙패드
  const lid = new THREE.Group(); lid.position.set(0, .016, -.115); lid.rotation.x = -.22; g.add(lid);
  box(lid, .34, .22, .008, alu, 0, 0, 0, { line: .004, cast: false });
  box(lid, .325, .205, .002, 0x0E0E12, 0, .008, .005, { line: 0, cast: false });   // 검은 테두리
  const tex = codeTex(); const scr = board(lid, .3, .18, tex, 0, .112, .0065); g.userData.code = tex;
  const logo = new THREE.Mesh(new THREE.CircleGeometry(.018, 20), new THREE.MeshBasicMaterial({ color: 0xF2F3F6 })); logo.position.set(0, .11, -.0045); logo.rotation.y = Math.PI; lid.add(logo);
  return g;
}
// 노트북 화면: 에디터에 코드 줄이 계속 흘러간다(세로로 반복되는 그림을 조금씩 올린다)
const codeTex = () => { const t = canvasTex(256, 256, (g) => { g.fillStyle = "#1C1F2B"; g.fillRect(0, 0, 256, 256); const r = rng(77), cols = ["#FFD43B", "#7FCFAE", "#F7A6A0", "#7DB3F0", "#E8E6EB", "#C9B8F0"];
  for (let y = 8; y < 256; y += 14) { let x = 10 + Math.floor(r() * 3) * 14; const n = 1 + Math.floor(r() * 3); for (let k = 0; k < n && x < 240; k++) { const w = 18 + r() * 60; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, y, w, 6); x += w + 8; } } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, .6); return t; };
function makeIcedCoffee() { // 테이크아웃 아이스 아메리카노: 위가 넓은 투명 컵, 테두리 링, 납작 뚜껑에 꽂은 검은 빨대, 진한 커피 위로 얼음이 동동, 겉에 물방울
  const g = new THREE.Group(), H = .15, rt = .05, rb = .036;
  const clear = new THREE.MeshPhysicalMaterial({ color: 0xF4FAFF, transparent: true, opacity: .32, roughness: .08, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, H, 28, 1, true), clear); cup.position.y = H / 2; cup.renderOrder = 3; g.add(cup);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(rb, 24), clear); bottom.rotation.x = -Math.PI / 2; bottom.position.y = .002; g.add(bottom);
  const lvl = new THREE.Group(); g.add(lvl); g.userData.level = lvl;   // 커피 높이: 마시면 줄어든다(바닥 기준으로 줄인다)
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(rt * .93 - .002, rb * .95, H * .8, 24), new THREE.MeshToonMaterial({ color: 0x2B160B, gradientMap: gradient })); coffee.position.y = H * .4; lvl.add(coffee);
  const crema = new THREE.Mesh(new THREE.CircleGeometry(rt * .9, 24), new THREE.MeshBasicMaterial({ color: 0x5A3720 })); crema.rotation.x = -Math.PI / 2; crema.position.y = H * .8 + .001; lvl.add(crema);
  const ice = new THREE.MeshPhysicalMaterial({ color: 0xFFFFFF, transparent: true, opacity: .75, roughness: .2 });
  for (const [x, y, z, r] of [[-.018, .118, .012, .3], [.02, .112, -.01, .9], [0, .1, .022, 1.5], [-.012, .07, -.02, .6], [.022, .06, .015, 2.1]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(.026, .024, .026), ice); c.position.set(x, y, z); c.rotation.set(r, r * .7, r * .3); g.add(c); }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rt + .001, .0035, 6, 32), new THREE.MeshBasicMaterial({ color: 0xE6EEF4 })); rim.rotation.x = Math.PI / 2; rim.position.y = H; g.add(rim);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(rt + .003, rt + .003, .008, 28), new THREE.MeshPhysicalMaterial({ color: 0xF6FAFD, transparent: true, opacity: .55, roughness: .1 })); lid.position.y = H + .004; g.add(lid);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(.0045, .0045, .25, 10), toon(0x1A1A1E)); straw.position.set(.012, H * .55 + .07, .006); straw.rotation.z = -.12; g.add(straw);
  const drop = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: .7 });
  for (let k = 0; k < 9; k++) { const a = k * 2.4, y = .03 + (k * .037) % .1, rr = rb + (rt - rb) * (y / H) + .001; const d = new THREE.Mesh(new THREE.SphereGeometry(.0028, 6, 4), drop); d.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr); g.add(d); }   // 겉면 물방울
  return g;
}
function endAct(a) { if (a.prop) { a.prop.removeFromParent(); a.prop = null; } if (a.board) { a.board.mesh.removeFromParent(); a.board.tex.dispose(); a.board.mesh.geometry.dispose(); a.board.mesh.material.dispose(); a.board = null; } a.act = null; }
function tickAct(a, dt) {
  if (!a.act) return null;
  const prev = a.act.t; a.act.t += dt; const e = a.act.t, s = SKILLS[a.act.name], p = a.doll.root.position;
  if (a.board) {
    const b = a.board; b.mesh.visible = a.doll.root.visible; b.mesh.position.set(p.x, p.y + 1.6, p.z); b.mesh.rotation.y = cam.yaw;
    const prog = Math.min(4, Math.max(0, (e - .4) / .9));
    if (Math.abs(prog - b.last) > .03 || (prog >= 4 && b.last < 4)) { drawComic(b.g, b.seed, prog, b.npc); b.tex.needsUpdate = true; b.last = prog; }
    b.mesh.scale.setScalar(.25 + .75 * easeOut(clamp(e / .35, 0, 1)));
    if (prog >= 4 && !b.sparked) { b.sparked = true; if (a.doll.root.visible) spawnFx(starTex, p, 7, 1.2, 1.5); }
    b.mesh.material.opacity = clamp((s.dur - e) / .5, 0, 1);
  }
  if (a.prop) { // 노트북은 앉은 무릎 앞 책상 높이에, 커피는 오른손에 들고 입으로 가져간다
    const h = a.doll.turn.rotation.y, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h); a.prop.visible = a.doll.root.visible; a.prop.rotation.y = h;
    if (a.act.name === "laptop") { a.prop.position.set(p.x + fx * .42, p.y + .46, p.z + fz * .42); a.prop.rotation.y = h + Math.PI; const ct = a.prop.userData.code; if (ct) ct.offset.y = (ct.offset.y - dt * .06) % 1; }   // 화면이 나를 본다, 코드는 위로 흘러간다
    else { // 마시기: 0~.7초 컵을 입까지 들고, ~3.4초 빨대로 쪽쪽(커피가 줄고 볼이 오물), ~4초 내리고, 끝에 "캬" 반짝
      const k = e < .7 ? easeOut(e / .7) : e < 3.4 ? 1 : e < 4 ? 1 - easeOut((e - 3.4) / .6) : 0, suck = e > .7 && e < 3.4 ? Math.sin((e - .7) * 9) * .5 + .5 : 0;
      const side = lerp(.26, .05, k), fwd = lerp(.16, .23, k), up = lerp(.5, .69, k) - suck * .006;
      a.prop.position.set(p.x + rx * side + fx * fwd, p.y + up, p.z + rz * side + fz * fwd); a.prop.rotation.x = -k * .28; a.prop.rotation.z = -k * .1;
      const lvl = a.prop.userData.level; if (lvl) lvl.scale.y = clamp(1 - clamp((e - .7) / 2.7, 0, 1) * .45, .05, 1);
      if (e >= 4.05 && prev < 4.05 && a.doll.root.visible) spawnFx(starTex, p, 4, .5, 1.05);
    }
  }
  if (a.act.name === "heart" && Math.floor(e * 3) !== Math.floor(prev * 3) && a.doll.root.visible) spawnFx(heartTex, p, 2, .3, 1.15);
  if (e >= s.dur) { endAct(a); return null; }
  return a.act.name;
}

/* ════════════════ 6. 사람들 (하루들 공개 피드 작성자) ════════════════ */
const ROSTER = [["이기적인 고양이",32],["이산",30],["쿠다",12],["코브아님",9],["아이큐",9],["새로운 에뮤",8],["초록",6],["캐모",5],["로맨틱한 지렁이",5],["콘티",5],["믿음직한 고양이",5],["경상북도",5],["용감한 쿠ㅋl",4],["눈누난나",3],["부기",3],["민첩한 앵무새",3],["긍정적인 들소",3],["귤은 한자로 귤 귤",3],["용감한 쿠키",3],["성실한 매",3],["낭만파",2],["쑤",2],["싱그러운 긴팔원숭이",2],["미소짓는 카피바라",2],["싸피대전9기",2],["조용한 개미핥기",2],["파동",2],["용감한 독수리",2],["똥만 싸는 사람",2],["향긋한 판다",1],["라멘조아토리",1],["포근한 족제비",1],["슬기로운 라쿤",1],["재빠른 얼룩말",1],["배고픈 거위",1],["독창적인 반달곰",1],["상냥한 친칠라",1],["소박한 박쥐",1],["늠름한 긴팔원숭이",1],["튼튼한 황새",1],["대견한 거위",1],["싱그러운 수달",1],["고운 말",1],["바르고 고운 말",1],["삼웰",1],["꾸준한 고양이",1],["용감한 웜뱃",1],["발랄한 두루미",1],["비비빙",1],["시원한 여우",1],["너그러운 돌고래",1],["송송",1],["내가 누구게",1]];
const PEOPLE = ROSTER.map(([nick, total]) => ({ nick, total, feeds: [], avatar: null }));
const NPCS = [];
function placeNPCs() {
  for (const n of NPCS) dropDoll(n.doll); NPCS.length = 0;
  const r = rng(4242); const used = { 11: [], 12: [], 13: [], 14: [] };
  PEOPLE.forEach((p, i) => {
    const f = [11, 12, 13, 14][i % 4], fl = FLOORS[f]; const zs = fl.zones.filter((z) => z.desc && z.npc !== false);
    for (let k = 0; k < 400; k++) {
      const z = zs[Math.floor(r() * zs.length)]; const x = z.x + Math.floor(r() * z.w), y = z.y + Math.floor(r() * z.h);
      if (solid(fl, x, y) || !fl.reach[y * W + x] || fl.furn.some((o) => WALK_THROUGH.has(o.kind) && !o.kind.endsWith("bleacher") && inRect(o, x, y)) || fl.portals.some((pp) => inRect(pp, x, y)) || fl.calls.some((c) => inRect(c, x, y))) continue;
      if (used[f].some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 3)) continue;
      used[f].push([x, y]);
      const look = avFromSeed(String(p.nick)); const doll = makeChar(look);
      doll.root.userData.npc = NPCS.length;
      NPCS.push({ p, f, hx: x + .5, hy: y + .5, x: x + .5, y: y + .5, tx: x + .5, ty: y + .5, look, doll, wait: r() * 4, h: r() * Math.PI * 2, moving: false, seed: i, say: "", sayAt: 0 });
      scene.add(doll.root); break;
    }
  });
  for (const fl of Object.values(FLOORS)) for (const st of fl.seats || []) st.taken = false;
  for (const f of [11, 12, 13, 14]) if (floorGroups[f]) seatNPCs(f);
  for (const fl of Object.values(FLOORS)) for (const o of fl.furn) {
    if (o.kind !== "beanbag") continue; o.taken = false; if (r() > .5) continue;
    const pool = NPCS.filter((n) => n.f === fl.f && !n.lie && !n.seat); const n = pool[Math.floor(r() * pool.length)]; if (!n) continue;
    n.lie = bagSpot(o); n.x = n.hx = n.tx = n.lie.x; n.y = n.hy = n.ty = n.lie.y; o.taken = true;
  }
  refreshTags(); showFloors();
}
function seatNPCs(f) {
  const fl = FLOORS[f]; if (!fl.seats) return; const r = rng(f * 101);
  for (const n of NPCS) {
    if (n.f !== f || n.lie || n.seat || r() > .45) continue;
    let best = null, bd = 3.2; for (const st of fl.seats) { if (st.taken) continue; const d = Math.hypot(st.x - n.hx, st.y - n.hy); if (d < bd) { bd = d; best = st; } }
    if (!best) continue; best.taken = true; n.seat = best; n.x = n.hx = n.tx = best.x; n.y = n.hy = n.ty = best.y; n.h = best.yaw;
  }
}
function applyFeed(data) {
  if (!Array.isArray(data) || !data.length || !data[0].nick) return false;
  const byNick = new Map(data.map((d) => [d.nick, d]));
  for (const p of PEOPLE) { const d = byNick.get(p.nick); if (d) { p.feeds = d.feeds || []; p.avatar = d.avatar || null; p.total = d.total || p.total; } }
  let added = false; for (const d of data) if (!PEOPLE.some((p) => p.nick === d.nick)) { PEOPLE.push({ nick: d.nick, total: d.total, feeds: d.feeds || [], avatar: d.avatar }); added = true; }
  if (added) placeNPCs();
  feedBtn.hidden = true; return true;
}

/* ════════════════ 7. 렌더러 · 장면 · 카메라 ════════════════ */
const renderer = R3F.gl, canvas = renderer.domElement;
canvas.id = "stage"; canvas.setAttribute("aria-label", "우아한테크코스 판교 캠퍼스 11~14층 3D 지도. 방향키로 움직이고 Shift로 달리고 Space로 점프하며, 캐릭터 옆에서 F로 대화합니다.");
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = R3F.scene; scene.background = new THREE.Color(0x0E1E46);
// 캠퍼스 바깥은 우테코 밤하늘: 노란 별 + 흰 별 + 큰 노란 달
{ const r = rng(77); for (const [n, color, size] of [[520, 0xFFE27A, .5], [380, 0xFFFFFF, .32]]) { const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, e = .03 + r() * 1.25, d = 70 + r() * 40; pos.set([Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d, Math.sin(a) * Math.cos(e) * d], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: true, depthWrite: false }))); }
  // 달 이스터에그: 2026 모집 포스터처럼 노란 달에 행성 친구가 사다리를 타고 올라 붓으로 "도전"을 써 놓았다(늘 카메라를 본다)
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, depthWrite: false })); moon.scale.set(26, 26, 1); moon.position.set(-55, 30, -70); scene.add(moon); }
// 판교 야경: 캠퍼스는 11~14층, 아래로 빌딩 숲과 거리 불빛
const GROUND = -34;
let campusTower = null;
{ const r = rng(2026);
  const winTex = canvasTex(64, 128, (g) => { g.fillStyle = "#14224A"; g.fillRect(0, 0, 64, 128); for (let y = 4; y < 124; y += 8) for (let x = 4; x < 60; x += 8) { const v = r(); g.fillStyle = v > .6 ? (v > .9 ? "#FFF4C2" : "#FFD86B") : "#1E2E5C"; g.fillRect(x, y, 5, 5); } });
  const roof = new THREE.MeshBasicMaterial({ color: 0x0C1838 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(230, 48), new THREE.MeshBasicMaterial({ color: 0x08122C })); ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND; scene.add(ground);
  const tower = (x, z, w, d, h, ry) => { const t = winTex.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 6))); t.needsUpdate = true; const side = new THREE.MeshBasicMaterial({ map: t });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]); m.position.set(x, GROUND + h / 2, z); m.rotation.y = ry; scene.add(m); return m; };
  campusTower = tower(0, 0, W * S - .4, H * S - .4, -GROUND - .2, 0);   // 우리 건물 아래층들 (보고 있는 층 바로 밑까지)
  for (let i = 0; i < 90; i++) { const a = r() * Math.PI * 2, d = 60 + r() * 90; tower(Math.cos(a) * d, Math.sin(a) * d, 5 + r() * 10, 5 + r() * 10, 10 + r() * (d < 85 ? 30 : 48), r() * Math.PI); }
  const n = 900, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d = 22 + r() * 140; pos.set([Math.cos(a) * d, GROUND + .3, Math.sin(a) * d], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xFFC94D, size: .7, sizeAttenuation: true, depthWrite: false })));
}
// 별똥별: 몇 초에 한 번, 지금 보고 있는 하늘 쪽으로 긴 꼬리를 그으며 떨어진다
const meteorTex = canvasTex(256, 16, (g) => { const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(.5, "rgba(255,236,170,.5)"); gr.addColorStop(.85, "rgba(255,246,210,.95)"); gr.addColorStop(1, "rgba(255,255,255,1)"); g.fillStyle = gr; g.fillRect(0, 4, 256, 8); const hg = g.createRadialGradient(248, 8, 0, 248, 8, 8); hg.addColorStop(0, "rgba(255,255,255,1)"); hg.addColorStop(1, "rgba(255,240,190,0)"); g.fillStyle = hg; g.fillRect(232, 0, 24, 16); });
const meteors = []; let meteorT = 2.5;
const _mx = new THREE.Vector3(), _my = new THREE.Vector3(), _mz = new THREE.Vector3(), _mm = new THREE.Matrix4();
function spawnMeteor() {
  const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
  const right = new THREE.Vector3(-f.z, 0, f.x), e = (inside() ? .05 : .15) + Math.random() * .22, side = (Math.random() - .5) * 1.4;
  const dir = f.clone().multiplyScalar(Math.cos(e)).addScaledVector(right, side).setY(Math.sin(e)).normalize();
  const pos = camera.position.clone().addScaledVector(dir, 80);
  const vel = right.clone().multiplyScalar(Math.random() < .5 ? -1 : 1).add(new THREE.Vector3(0, -.55 - Math.random() * .3, 0)).normalize().multiplyScalar(38 + Math.random() * 18);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(14 + Math.random() * 8, .8), new THREE.MeshBasicMaterial({ map: meteorTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(pos); m.renderOrder = 5; scene.add(m); meteors.push({ m, vel, age: 0, life: 1.2 + Math.random() * .8 });
}
function tickMeteors(dt) {
  meteorT -= dt; if (meteorT <= 0) { meteorT = 3 + Math.random() * 6; spawnMeteor(); if (Math.random() < .2) setTimeout(spawnMeteor, 350); }
  for (let i = meteors.length - 1; i >= 0; i--) { const s = meteors[i]; s.age += dt; s.m.position.addScaledVector(s.vel, dt);
    const k = s.age / s.life; s.m.material.opacity = k < .2 ? k / .2 : Math.max(0, 1 - (k - .2) / .8);
    _mx.copy(s.vel).normalize(); _mz.copy(camera.position).sub(s.m.position).normalize(); _my.crossVectors(_mz, _mx).normalize(); _mz.crossVectors(_mx, _my); _mm.makeBasis(_mx, _my, _mz); s.m.quaternion.setFromRotationMatrix(_mm);
    if (k >= 1) { scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); meteors.splice(i, 1); } }
}
// 화질 자동 조절: 처음엔 최고 화질. 프레임이 3초 넘게 계속 낮으면 한 단계씩 내린다(좋은 기기는 그대로)
//   1단계 픽셀 비율 1 · 2단계 그림자 해상도 절반 · 3단계 부드러운 그림자 대신 보통 그림자
const Q = { level: 0, acc: 0, n: 0, low: 0, max: 3 };
function adaptQuality(dt) {
  if (Q.level >= Q.max || document.hidden) return;
  Q.acc += dt; Q.n++; if (Q.acc < 1) return;
  const fps = Q.n / Q.acc; Q.acc = 0; Q.n = 0;
  Q.low = fps < 45 ? Q.low + 1 : 0; if (Q.low < 3) return;
  Q.low = 0; Q.level++;
  if (Q.level === 1) { if (R3F.setDpr) R3F.setDpr(1); else renderer.setPixelRatio(1); }
  if (Q.level === 2) { const m = sun.shadow.mapSize.x / 2; sun.shadow.mapSize.set(m, m); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  if (Q.level === 3) { renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.needsUpdate = true; scene.traverse((o: any) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); }
}
const camera = R3F.camera; camera.fov = 38; camera.near = .1; camera.far = 360; camera.updateProjectionMatrix();
scene.add(new THREE.HemisphereLight(0xffffff, 0xCFD6E8, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.castShadow = true; sun.shadow.mapSize.set(narrow() ? 1024 : 2048, narrow() ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 28, bottom: -28, near: 1, far: 95 }); sun.shadow.bias = -.0006; scene.add(sun, sun.target);
const cam = { eye: undefined as number | undefined, close: false, ip: .3, ipT: .3, id: 3.2, idT: 3.2, look: 0, lookT: 0, yaw: -.35, pitch: .95, dist: narrow() ? 24 : 29, yawT: -.35, pitchT: .95, distT: narrow() ? 24 : 29, target: new THREE.Vector3() };
const eyeV = new THREE.Vector3(), lookV = new THREE.Vector3(); let fpDt = 0;
// 들어가서 볼 때: 내 뒤(또는 눈높이)에서, 벽 앞에서 멈추고 천장 아래에 머문다
function placeInside() {
  const base = floorY(me.f) + heightAt(floor, me.x, me.y) + me.up + me.jz, ceil = Math.max(floorY(me.f) + CEIL[me.f] - .12, base + 1.4);   // 계단 위에서는 머리 위로 비켜 준다
  if (VIEW.mode === "first") {
    // 1인칭은 어지럽지 않게: 기울임·흔들림 없이, 눈높이는 계단·단을 오를 때 툭툭 끊기지 않게 부드럽게 따라가고, 고개는 제자리에서 돈다
    const eyeT = base + (me.lie ? .45 : me.seat ? .72 : .92);
    cam.eye = cam.eye === undefined || Math.abs(cam.eye - eyeT) > 2 ? eyeT : lerp(cam.eye, eyeT, Math.min(1, fpDt * 12));
    const eye = cam.eye;
    camera.position.set(wx(me.x), eye, wz(me.y));
    lookV.set(camera.position.x - Math.sin(cam.yaw) * Math.cos(cam.look), eye + Math.sin(cam.look), camera.position.z - Math.cos(cam.yaw) * Math.cos(cam.look));
    camera.lookAt(lookV); return;
  }
  const head = base + (me.lie ? .5 : me.seat ? .75 : .9);
  const c = Math.cos(cam.ip), dirX = Math.sin(cam.yaw), dirZ = Math.cos(cam.yaw);
  // 뒤쪽 벽까지 거리: 벽에 막히면 그 앞까지만 물러난다
  let d = cam.id; const flat = d * c / S;
  for (let k = .2; k <= flat + .3; k += .08) { const ix = Math.floor(me.x + dirX * k), iy = Math.floor(me.y + dirZ * k); if (ix < 0 || iy < 0 || ix >= W || iy >= H || floor.wgrid[iy * W + ix]) { d = Math.max(.15, (k - .3) * S / c); break; } }
  cam.close = d < .95;   // 너무 가까우면 내 캐릭터를 숨겨 시야를 가리지 않게
  camera.position.set(wx(me.x) + dirX * c * d, Math.min(ceil, head + .25 + Math.sin(cam.ip) * d), wz(me.y) + dirZ * c * d);
  eyeV.set(wx(me.x) - dirX * 1.4, head - .05, wz(me.y) - dirZ * 1.4); camera.lookAt(eyeV);   // 내 앞쪽을 바라본다
}
function setView(mode) {
  VIEW.mode = mode;
  document.getElementById("viewBtn").textContent = { top: "들어가기", third: "1인칭", first: "위에서 보기" }[mode];
  if (mode === "third") { cam.ipT = cam.ip = .3; cam.idT = cam.id = 3.2; }
  if (mode === "first") { cam.lookT = cam.look = 0; }
  if (mode !== "top") { cam.yawT = cam.yaw = me.h + Math.PI; lockMouse(); }    // 내가 바라보는 쪽이 정면, 바로 마우스 고정
  else if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  document.getElementById("cross").hidden = !(mode === "first" || locked());
  showFloors(); showToast({ top: "위에서 보기", third: "들어가서 보기", first: "1인칭으로 보기" }[mode], mode === "top" ? "캠퍼스를 한눈에 내려다봐요. V로 다시 들어갈 수 있어요." : "마우스로 둘러봐요(커서는 숨겨져요). Esc로 커서를 다시 꺼내요.", 3200);
}
function placeCamera() { const c = Math.cos(cam.pitch); camera.position.set(cam.target.x + Math.sin(cam.yaw) * c * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * c * cam.dist); camera.lookAt(cam.target); }
const floorGroups = {};
const groupOf = (f) => floorGroups[f] || (floorGroups[f] = (() => { const fl = FLOORS[f], g = buildFloor(fl); batchFloor(fl, g); scene.add(g); tagCull(fl, g); seatNPCs(f); return g; })());
// 정적 묶기: 층을 지은 뒤 움직이지 않는 메시(가구 몸통·먹선 윤곽·판)를 재질·그림자·구역(8칸)별로 한 메시로 합친다.
// 모양·색은 그대로이고 그리기 호출만 수천 → 수백으로 준다. 따로 움직이거나 켜고 끄는 묶음(벽·표지판·천장·조명)은 그 안에서만 합친다
const BATCH_CELL = 4;
function batchStatic(root, skip) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), c = new THREE.Vector3();
  const walk = (o) => { for (const ch of [...o.children]) {
    if (skip.has(ch) || ch.userData.noMerge) continue;
    const m = ch as any;
    if (m.isMesh && !m.isInstancedMesh && !Array.isArray(m.material) && m.geometry?.attributes?.position) {
      const geo = m.geometry; if (!geo.boundingSphere) geo.computeBoundingSphere();
      c.copy(geo.boundingSphere.center).applyMatrix4(m.matrixWorld);
      const key = [m.material.uuid, m.castShadow, m.receiveShadow, geo.index ? 1 : 0, m.renderOrder, Math.floor(tX(c.x) / BATCH_CELL), Math.floor(tY(c.z) / BATCH_CELL)].join("|");
      let bk = buckets.get(key); if (!bk) buckets.set(key, (bk = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, order: m.renderOrder, items: [] }));
      bk.items.push({ m, mat: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) });
    }
    walk(ch);
  } };
  walk(root);
  for (const bk of buckets.values()) {
    if (bk.items.length < 2) continue;
    const geos = bk.items.map(({ m, mat }) => {
      const src = m.geometry, g = new THREE.BufferGeometry();
      g.setAttribute("position", src.attributes.position.clone()); if (src.attributes.normal) g.setAttribute("normal", src.attributes.normal.clone()); else g.computeVertexNormals();
      g.setAttribute("uv", src.attributes.uv ? src.attributes.uv.clone() : new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
      if (src.index) g.setIndex(src.index.clone());
      return g.applyMatrix4(mat);
    });
    const merged = mergeGeometries(geos, false); geos.forEach((g) => g.dispose()); if (!merged) continue;
    const mesh = new THREE.Mesh(merged, bk.mat); mesh.castShadow = bk.cast; mesh.receiveShadow = bk.recv; mesh.renderOrder = bk.order; root.add(mesh);
    for (const { m } of bk.items) m.parent.remove(m);
  }
  // 비어 버린 묶음 정리
  const prune = (o) => { for (const ch of [...o.children]) { if (skip.has(ch)) continue; prune(ch); if (ch.type === "Group" && !ch.children.length && !ch.userData.noMerge) o.remove(ch); } };
  prune(root);
}
function batchFloor(fl, g) {
  const special = new Set([fl.slab, fl.walls, fl.signs, fl.ceil, fl.lamps].filter(Boolean));
  for (const ch of g.children) if ((ch as any).isLineSegments) special.add(ch);   // 바닥 윤곽선
  batchStatic(g, special);
  for (const sub of [fl.walls, fl.signs, fl.ceil, fl.lamps]) if (sub) batchStatic(sub, new Set());
}
// 위·아래층은 뚫린 자리(void) 너머로만 보인다: 그 둘레(여유 칸 포함) 밖의 가구·벽은 그리지 않는다(그림자도 안 진다)
const CULL_PAD = 3, cullBox = new THREE.Box3();
function tagCull(fl, g) {
  g.updateMatrixWorld(true); fl.cull = [];
  const add = (o) => { cullBox.setFromObject(o); if (cullBox.isEmpty()) return; fl.cull.push({ o, b: [tX(cullBox.min.x), tY(cullBox.min.z), tX(cullBox.max.x), tY(cullBox.max.z)] }); };
  for (const c of g.children) { if (c === fl.slab || c === fl.ceil || (c as any).isLineSegments) continue; if (c === fl.walls || c === fl.signs) c.children.forEach(add); else add(c); }
}
const voidsOf = (fl) => fl.furn.filter((o) => o.kind === "void");
const nearRects = (rects, x0, y0, x1, y1) => rects.some((r) => x1 > r.x - CULL_PAD && x0 < r.x + r.w + CULL_PAD && y1 > r.y - CULL_PAD && y0 < r.y + r.h + CULL_PAD);
function setCull(fl, rects) { for (const { o, b } of fl.cull || []) o.visible = !rects || nearRects(rects, b[0], b[1], b[2], b[3]); }
function showFloors() {
  for (const n of NPCS) endAct(n);
  for (const f of [11, 12, 13, 14]) if (floorGroups[f]) floorGroups[f].visible = false;
  groupOf(me.f).visible = true;
  const below = FLOORS[me.f].furn.some((o) => o.kind === "void") && FLOORS[me.f - 1];
  if (below) groupOf(me.f - 1).visible = true;   // 오픈 천장 아래층이 내려다보인다
  const above = inside() && me.f === 12;           // 12층에서 올려다보면 13층 난간과 서가가 보인다
  if (above) groupOf(13).visible = true;
  // 12층에서 올려다볼 때 13층 가구 그림자가 바닥을 뚫고 12층에 떨어지지 않게
  if (floorGroups[13]) floorGroups[13].traverse((o) => { if (!o.isMesh) return; if (o.userData.cs === undefined) o.userData.cs = o.castShadow; o.castShadow = above ? false : o.userData.cs; });
  for (const f of [11, 12, 13, 14]) { const fl = FLOORS[f]; if (!floorGroups[f]) continue; fl.walls.scale.y = inside() ? CEIL[f] / WALL : 1; fl.signs.position.y = inside() ? 1.15 : 0; if (fl.ceil) fl.ceil.visible = inside() && (f === me.f || (above && f === 13)); fl.lamps.visible = inside(); }
  const holes = below ? voidsOf(FLOORS[me.f]) : above ? voidsOf(FLOORS[13]) : null;
  for (const f of [11, 12, 13, 14]) if (floorGroups[f]) setCull(FLOORS[f], f === me.f ? null : holes);
  for (const n of NPCS) n.doll.root.visible = n.f === me.f || (((below && n.f === me.f - 1) || (above && n.f === 13)) && nearRects(holes, n.x, n.y, n.x, n.y));
  if (campusTower) { const low = Math.min(...[11, 12, 13, 14].filter((f) => floorGroups[f]?.visible)), top = floorY(low) - .2; campusTower.scale.y = (top - GROUND) / (-GROUND - .2); campusTower.position.y = GROUND + (top - GROUND) / 2; }
}

/* ════════════════ 8. 나 · 강아지 · 다른 크루 ════════════════ */
const LS = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { } } };
// 내 캐릭터: 하루들 월드와 같은 부위·색 조합. 이 브라우저에 저장
let myAv = (() => { try { return avDecode(LS.get("ww.avatar")) || { ...DEFAULT_AV }; } catch { return { ...DEFAULT_AV }; } })();
const lookOf = (i) => ({ hair: HAIRS[i % HAIRS.length], acc: ACC[Math.floor(i / HAIRS.length) % ACC.length], prop: "bag" });
const me = { jumps: 0, prop: null, goal: null, lie: null, seat: null, f: 11, x: ELEV_SPAWN[0], y: ELEV_SPAWN[1], h: Math.PI / 2, up: 0, jz: 0, jv: 0, jc: 0, ac: 0, an: null, as: 0, act: null, board: null, runHold: false, runToggle: false, moving: false, say: "", sayAt: 0, path: null };
let floor = FLOORS[11];
let meDoll = makeChar(myAv); scene.add(meDoll.root);
Object.defineProperty(me, "doll", { get: () => meDoll });
const running = () => me.runHold || me.runToggle;
function jump() { // 땅에서 한 번, 공중에서 한 번 더(더블 점프)
  if (me.lie || me.seat) { standUp(); return; }
  const air = me.jz > .001 || me.jv > 0; if (air && me.jumps >= 2) return;
  me.jumps = air ? 2 : 1; me.jv = air ? 4.2 : 4.6; if (air) spawnFx(starTex, meDoll.root.position, 3, .5, .2); me.jc++; sendPresence(true);
}
function useSkill(name) { if (!SKILLS[name]) return; if (me.lie) standUp(); me.path = null; startAct(me, name); me.ac++; me.an = name; me.as = me.act.seed; sendPresence(true); }
const dog = { x: ELEV_SPAWN[0] - 1, y: ELEV_SPAWN[1] + 1, moving: false, h: 0, doll: makeDog() }; scene.add(dog.doll.root);
const peers = new Map();
const setPos = (d, f, x, y) => d.root.position.set(wx(x), floorY(f) + heightAt(FLOORS[f], x, y), wz(y));

/* ════════════════ 9. 글자 겹(HTML: 한글이 또렷하게) ════════════════ */
const labelsEl = document.getElementById("labels");
const v3 = new THREE.Vector3();
function project(el, x, y, z, below = false) {
  v3.set(x, y, z).project(camera);
  if (v3.z > 1 || v3.z < -1 || Math.abs(v3.x) > 1.2 || Math.abs(v3.y) > 1.2) { el.style.display = "none"; return; }
  el.style.display = ""; el.style.transform = `translate(${(v3.x * .5 + .5) * innerWidth}px,${(-v3.y * .5 + .5) * innerHeight}px) translate(-50%,${below ? "0" : "-100%"})`;
}
const mkLabel = (cls, text) => { const e = document.createElement("div"); e.className = `lbl ${cls}`; e.textContent = text; labelsEl.append(e); return e; };
let roomTags = [];
function refreshRoomTags() {
  roomTags.forEach((t) => t.el.remove()); roomTags = [];
  for (const r of floor.rooms) if (r.name) roomTags.push({ el: mkLabel(`room-tag${r.planet ? " planet" : ""}`, r.name), x: wx(r.x + r.w / 2), y: WALL + .35, z: wz(r.y + .5) });
  for (const z of floor.zones) if (z.desc && !floor.rooms.some((r) => r.name && z.name.includes(r.name)) && !["엘리베이터 홀", "회의실"].includes(z.name)) roomTags.push({ el: mkLabel("room-tag", z.name), x: wx(z.x + z.w / 2), y: .9, z: wz(z.y + z.h / 2) });
  for (const p of floor.portals) roomTags.push({ el: mkLabel("room-tag port", "⇅ " + p.label), x: wx(p.x + p.w / 2), y: 1.1, z: wz(p.y + p.h / 2) });
  roomTags.push({ el: mkLabel("room-tag", "엘리베이터"), x: wx(ELEV_SPAWN[0]), y: 2.0, z: wz(13.5) });
}
const myTag = mkLabel("name-tag me", "나"), myBub = mkLabel("bub", ""); myBub.hidden = true;
const hintBub = mkLabel("bub hint", ""); hintBub.hidden = true;
let npcTags = [];
function refreshTags() { npcTags.forEach((t) => { t.tag.remove(); t.bub.remove(); }); npcTags = NPCS.map((n) => { const tag = mkLabel("name-tag", `${n.p.nick} (NPC)`); const bub = mkLabel("bub", ""); bub.hidden = true; return { n, tag, bub }; }); }

/* ════════════════ 10. 입력 (키보드 · 끌어 돌리기 · 휠/핀치 · 클릭 이동) ════════════════ */
const keys = new Set();
// 한글 입력 상태에서는 e.key가 ㅈ·ㅁ·ㄴ·ㅇ로 들어와서 WASD가 안 먹었다 → 자판 위치(e.code)로 읽는다
const MOVE = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", ArrowUp: "arrowup", ArrowDown: "arrowdown", ArrowLeft: "arrowleft", ArrowRight: "arrowright" };
const SKILL_KEY = { Digit1: "draw", Digit2: "wave", Digit3: "heart", Numpad1: "draw", Numpad2: "wave", Numpad3: "heart" };
addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  const c = e.code;
  if (!tour.hidden) { // 안내 중: ←→로 넘기고 Enter·Space·F로 다음, Esc로 건너뛰기
    e.preventDefault();
    if (c === "Escape") closeTour(); else if (c === "ArrowLeft" || c === "KeyA") showTourStep(tourAt - 1); else if (c === "ArrowRight" || c === "KeyD" || c === "Enter" || c === "Space" || c === "KeyF") tourNext.click();
    return;
  }
  if (!guide.hidden) { if (c === "Escape" || c === "Enter" || c === "Space" || c === "KeyF") { e.preventDefault(); closeGuide(); } return; }
  if (c === "Escape") { const was = uiOpen(); closePanel(); picker.hidden = true; inv.hidden = true; closeAvPanel(); lb.hidden = true; if (was) syncCursor(); return; }   // 창이 없을 때 Esc는 그냥 커서 꺼내기
  if (!picker.hidden) { // 층 고르기 창: 숫자키로 바로, W/S로 옮기고 F·Space로 고른다(Enter는 버튼이 직접 받는다)
    const bs = $all<HTMLButtonElement>("#pickList button:not([disabled])"), at = bs.indexOf(document.activeElement as HTMLButtonElement);   // 커서로 눌러도 되고 키로 골라도 된다
    const n = { Digit1: 11, Digit2: 12, Digit3: 13, Digit4: 14, Numpad1: 11, Numpad2: 12, Numpad3: 13, Numpad4: 14 }[c];
    if (n) { e.preventDefault(); if (n !== me.f) { closePicker(); goFloor(n, ELEV_SPAWN); } return; }
    if (c === "KeyW" || c === "ArrowUp" || c === "KeyS" || c === "ArrowDown") { e.preventDefault(); const d = c === "KeyW" || c === "ArrowUp" ? -1 : 1; bs[(Math.max(0, at) + d + bs.length) % bs.length]?.focus(); return; }
    if (c === "KeyF" || c === "Space") { e.preventDefault(); (bs[at] || bs[0])?.click(); return; }
    return;
  }
  if (!lb.hidden) return;
  if (c === "Tab") { e.preventDefault(); if (!e.repeat) toggleInv(); return; }
  if (!inv.hidden) { const k = { Digit1: 0, Digit2: 1, Numpad1: 0, Numpad2: 1 }[c]; if (k !== undefined) { e.preventDefault(); useItem(ITEMS[k].id); return; } }   // 인벤토리를 연 채로도 걷기·점프는 그대로
  if (c === "Space") { e.preventDefault(); if (!e.repeat) jump(); return; }
  if (c === "KeyF") { e.preventDefault(); if (!e.repeat) interact(); return; }
  if (c === "Enter" || c === "NumpadEnter") { e.preventDefault(); if (!e.repeat) openChat(); return; }   // Enter: 채팅창으로 들어간다
  if (c === "ShiftLeft" || c === "ShiftRight") { me.runHold = true; return; }
  if (SKILL_KEY[c]) { if (!e.repeat) useSkill(SKILL_KEY[c]); return; }
  if (c === "KeyV") { if (!e.repeat) setView({ top: "third", third: "first", first: "top" }[VIEW.mode]); return; }
  if (c === "KeyQ") { cam.yawT += Math.PI / 4; return; } if (c === "KeyE") { cam.yawT -= Math.PI / 4; return; }
  if (MOVE[c]) { keys.add(MOVE[c]); me.path = null; me.goal = null; e.preventDefault(); }
});
addEventListener("keyup", (e) => { if (MOVE[e.code]) keys.delete(MOVE[e.code]); if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.key === "Shift") me.runHold = false; });
$all(".skill[data-skill]").forEach((b) => (b.onclick = () => useSkill(b.dataset.skill)));
// 인벤토리(Tab): 마인크래프트처럼 칸에 든 물건을 눌러 쓴다
const ICON = { // 하루들 낙서체 아이콘(검은 선 + 노랑·하늘 포인트)
  laptop: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 12h26v18H11z" fill="#1C2B55" stroke="#111118" stroke-width="2.5" stroke-linejoin="round"/><path d="M15 17h9M15 21h14M15 25h7" stroke="#FFD43B" stroke-width="2" stroke-linecap="round"/><path d="M6 33h36l-3 5H9z" fill="#fff" stroke="#111118" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
  coffee: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M27 4l-3 12" stroke="#111118" stroke-width="2.5" stroke-linecap="round"/><path d="M13 14h22l-3 28H16z" fill="#E8F3FB" stroke="#111118" stroke-width="2.5" stroke-linejoin="round"/><path d="M15 22h18l-2 19H17z" fill="#5A3A24"/><rect x="18" y="18" width="6" height="6" rx="1" fill="#fff" stroke="#111118" stroke-width="1.5"/><rect x="25" y="20" width="5" height="5" rx="1" fill="#fff" stroke="#111118" stroke-width="1.5"/></svg>`,
};
const ITEMS = [
  { id: "laptop", name: "노트북", tip: "앉아서 펼치기" },
  { id: "coffee", name: "아아", tip: "아이스 아메리카노", title: "아이스 아메리카노 · 언제든 한 모금" },
];
const inv = document.getElementById("inv");
const invGrid = document.getElementById("invGrid");
invGrid.innerHTML = Array.from({ length: 9 }, (_, i) => { const it = ITEMS[i]; return it ? `<button type="button" class="slot" data-item="${it.id}" title="${it.title || `${it.name} · ${it.tip}`}"><kbd>${i + 1}</kbd>${ICON[it.id]}<span class="nm">${it.name}</span><span class="tip">${it.tip}</span></button>` : `<div class="slot vacant"></div>`; }).join("");
$all<HTMLButtonElement>("#invGrid [data-item]").forEach((b) => (b.onclick = () => useItem(b.dataset.item)));
function toggleInv() { inv.hidden = !inv.hidden; syncCursor(); }
function useItem(id) {
  if (id === "laptop") {
    if (!me.seat) { showToast("노트북은 앉아서 펼쳐요", "의자 앞에서 F로 앉은 다음 다시 눌러 보세요.", 2600); return; }
    if (me.act?.name === "laptop") { endAct(me); sendPresence(true); inv.hidden = true; syncCursor(); return; }   // 한 번 더 누르면 덮는다
    useSkill("laptop"); showToast("노트북을 펼쳤어요", "일어나면 덮어요. 오늘도 커밋 하나!", 2400);
  } else if (id === "coffee") useSkill("coffee");
  inv.hidden = true; syncCursor();
}
document.getElementById("jumpBtn").onclick = jump;
const runBtn = document.getElementById("runBtn"); runBtn.onclick = () => { me.runToggle = !me.runToggle; runBtn.setAttribute("aria-pressed", String(me.runToggle)); mRun.setAttribute("aria-pressed", String(me.runToggle)); };
/* ───── 모바일: 조이스틱 · 버튼 묶음 ───── */
const mRun = document.getElementById("mRun");
const joy = { on: false, x: 0, y: 0, id: -1, cx: 0, cy: 0 };
{
  const pad = document.getElementById("joy"), knob = document.getElementById("joyKnob"), R = 46;
  const move = (e) => { let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } joy.x = dx / R; joy.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; };
  const end = (e) => { if (e.pointerId !== joy.id) return; joy.on = false; joy.x = joy.y = 0; joy.id = -1; pad.classList.remove("on"); knob.style.transform = ""; };
  pad.addEventListener("pointerdown", (e) => { e.preventDefault(); pad.setPointerCapture(e.pointerId); const r = pad.getBoundingClientRect(); joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2; joy.on = true; joy.id = e.pointerId; me.path = null; me.goal = null; pad.classList.add("on"); move(e); });
  pad.addEventListener("pointermove", (e) => { if (e.pointerId === joy.id) move(e); });
  pad.addEventListener("pointerup", end); pad.addEventListener("pointercancel", end);
  mRun.onclick = () => runBtn.click();
  document.getElementById("mJump").addEventListener("pointerdown", (e) => { e.preventDefault(); jump(); });
  document.getElementById("mInv").onclick = () => toggleInv();
  $all("#mPad [data-skill]").forEach((b) => (b.onclick = () => useSkill(b.dataset.skill)));
  const chatBtn = document.getElementById("mChat"), sayIn = $<HTMLInputElement>("sayInput");
  chatBtn.onclick = () => { if (document.body.classList.toggle("chatting")) sayIn.focus(); else sayIn.blur(); };
  sayIn.addEventListener("blur", () => { if (TOUCH) setTimeout(() => document.body.classList.remove("chatting"), 150); });
}
addEventListener("blur", () => { keys.clear(); me.runHold = false; if (me.moving) { me.moving = false; wasMoving = false; sendPresence(true); } pointers.clear(); drag = null; canvas.classList.remove("dragging"); });   // 알트탭: 떼지 못한 클릭이 남아 다음 클릭을 막지 않게
document.getElementById("viewBtn").onclick = () => setView({ top: "third", third: "first", first: "top" }[VIEW.mode]);
document.getElementById("rotL").onclick = () => (cam.yawT += Math.PI / 4);
document.getElementById("rotR").onclick = () => (cam.yawT -= Math.PI / 4);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let drag = null; const pointers = new Map();
const pinchDist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY, moved: pointers.size > 1, yaw: cam.yawT, pitch: cam.pitchT, ip: cam.ipT, look: cam.lookT, pinch: pointers.size === 2 ? pinchDist() : 0, dist: cam.distT, id: cam.idT }; });
canvas.addEventListener("pointermove", (e) => {
  if (!drag || !pointers.has(e.pointerId)) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { if (!drag.pinch) { drag.pinch = pinchDist(); drag.dist = cam.distT; drag.id = cam.idT; } const ratio = drag.pinch / Math.max(1, pinchDist()); if (inside()) cam.idT = clamp(drag.id * ratio, 1.2, 6); else cam.distT = clamp(drag.dist * ratio, 6, 66); drag.moved = true; return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 6) { drag.moved = true; canvas.classList.add("dragging"); }
  if (drag.moved) { cam.yawT = drag.yaw - dx * .006; if (VIEW.mode === "first") cam.lookT = clamp(drag.look + dy * .004, -1.0, 1.1); else if (inside()) cam.ipT = clamp(drag.ip + dy * .004, -.05, 1.1); else cam.pitchT = clamp(drag.pitch + dy * .004, .45, 1.35); }   // 고정이 안 될 때(터치 등) 끌어서 돌린다
});
const endDrag = (e) => {
  pointers.delete(e.pointerId); canvas.classList.remove("dragging");
  if (drag && !drag.moved && pointers.size === 0) {
    if (inside() && e.pointerType === "mouse" && !locked()) lockMouse();   // 들어가서 볼 때 누르면 커서를 숨기고 고정
    else if (locked()) { if (picker.hidden) clickAt(innerWidth / 2, innerHeight / 2); }   // 고정 중엔 화면 가운데(조준점)를 누른 것으로(층 고르는 중엔 무시)
    else clickAt(e.clientX, e.clientY);
  }
  if (pointers.size === 0) drag = null;
};
// 배그처럼: 들어가서 볼 때는 커서를 숨기고 화면에 고정한다. 마우스를 움직인 만큼(화면 끝 없이) 고개가 돌고, 가운데 조준점이 뜬다. Esc로 풀린다
let lockFailed = false;
const locked = () => document.pointerLockElement === canvas;
// 경계: 창(층 고르기·크루 피드·사진·캐릭터 꾸미기·조작법)이 떠 있는 동안은 커서를 꺼내 두고, 다 닫히면 게임으로 돌아와 다시 고정한다.
// 채팅은 게임 안의 일이라 고정을 유지한다
const uiOpen = () => !tour.hidden || !inv.hidden || !picker.hidden || panel.classList.contains("open") || !avPanel.hidden || !guide.hidden || !lb.hidden;
function syncCursor() { if (uiOpen()) { if (locked()) document.exitPointerLock(); } else lockMouse(); }
function lockMouse() {
  if (TOUCH) return;   // 터치 기기는 고정하지 않는다(화면을 끌어서 둘러본다)
  if (lockFailed || locked() || !canvas.requestPointerLock || !inside() || uiOpen()) return;
  // 가속 없는 원본 움직임을 먼저 청하고, 안 되는 브라우저면 보통 고정으로. 사용자 조작 없이 불려 거절되면 조용히 넘긴다(다음 클릭에 다시)
  const plain = () => { try { (canvas.requestPointerLock() as any)?.catch?.(() => {}); } catch { lockFailed = true; } };
  try { const r: any = (canvas as any).requestPointerLock({ unadjustedMovement: true }); if (r?.catch) r.catch((e) => { if (e?.name === "NotSupportedError") plain(); }); } catch { plain(); }
}
document.addEventListener("mousemove", (e) => {
  if (!locked() || !inside()) return;
  const dx = clamp(e.movementX || 0, -200, 200), dy = clamp(e.movementY || 0, -200, 200);   // 고정 직후 튀는 값은 자른다
  cam.yawT -= dx * .0032;
  if (VIEW.mode === "first") cam.lookT = clamp(cam.lookT - dy * .0026, -1.0, 1.1); else cam.ipT = clamp(cam.ipT + dy * .0026, -.05, 1.1);
});
// 고정이 거절돼도(조작 없이 불렸거나 막 풀린 직후) 다음 클릭에 다시 시도한다. 아예 지원 안 하는 브라우저만 끄기(lockMouse 안에서)
document.addEventListener("pointerlockerror", () => {});
document.addEventListener("pointerlockchange", () => {
  document.getElementById("cross").hidden = !(VIEW.mode === "first" || locked());
  if (!locked() && inside() && !uiOpen()) showToast("커서가 나왔어요", "화면을 한 번 누르면 다시 둘러봐요.", 2600);   // Esc·알트탭으로 풀렸을 때
});
canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (VIEW.mode === "top") cam.distT = clamp(cam.distT * (1 + e.deltaY * .0012), 6, 66);
  else if (VIEW.mode === "third") { cam.idT = clamp(cam.idT * (1 + e.deltaY * .0012), 1.2, 6); }
}, { passive: false });
function clickAt(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(NPCS.filter((n) => n.f === me.f && n.doll.root.visible).map((n) => n.doll.root), true).find((h) => h.object !== (h.object.parent as any)?.userData?.blob && !(h.object as any).isPoints);
  let npcIdx = -1; for (let q: THREE.Object3D | null = hit ? hit.object : null; q; q = q.parent) if (q.userData.npc !== undefined) { npcIdx = q.userData.npc; break; }
  if (hit && npcIdx >= 0) { const n = NPCS[npcIdx]; n.say = "반가워!"; n.sayAt = performance.now(); NPCS.forEach((o) => (o.talk = o === n)); openPanel(n.p); return; }
  const g = ray.intersectObject(FLOORS[me.f].slab, false)[0];
  const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  const hitAny = ray.intersectObject(groupOf(me.f), true).find((h) => shown(h.object) && !(h.object as any).material?.transparent && (h.object as any).material !== inkMat), pt = hitAny || g;
  if (pt) { // 누른 자리에 빈백이나 의자가 있으면 그쪽으로 걸어가서 눕기·앉기
    const px = tX(pt.point.x), py = tY(pt.point.z);
    const bag = floor.furn.find((o) => o.kind === "beanbag" && !o.taken && inRect({ x: o.x - .3, y: o.y - .3, w: o.w + .6, h: o.h + .6 }, px, py));
    let seat = null, bd = .75; for (const st of floor.seats || []) { if (st.taken) continue; const d = Math.hypot(st.x - px, st.y - py); if (d < bd) { bd = d; seat = st; } }
    const goal = bag ? { bag, ...bagSpot(bag) } : seat ? { seat, x: seat.x, y: seat.y } : null;
    if (goal) {
      if (me.lie || me.seat) standUp();
      const [fx, fy] = nearestFree(floor, goal.x, goal.y); me.goal = goal;
      me.path = findPath(Math.floor(me.x), Math.floor(me.y), Math.floor(fx), Math.floor(fy)) || []; return;
    }
  }
  me.goal = null;
  if (g) me.path = findPath(Math.floor(me.x), Math.floor(me.y), Math.floor(tX(g.point.x)), Math.floor(tY(g.point.z)));
}
function findPath(sx, sy, gx, gy) {
  if (solid(floor, gx, gy)) return null; const prev = new Int32Array(W * H).fill(-1); const q = [sy * W + sx]; prev[sy * W + sx] = sy * W + sx; let qi = 0;
  while (qi < q.length) { const cur = q[qi++]; if (cur === gy * W + gx) break; const x = cur % W, y = (cur / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (solid(floor, nx, ny)) continue; const ni = ny * W + nx; if (prev[ni] !== -1) continue; prev[ni] = cur; q.push(ni); } }
  if (prev[gy * W + gx] === -1) return null; const out = []; let c = gy * W + gx; while (c !== sy * W + sx) { out.push({ x: c % W + .5, y: ((c / W) | 0) + .5 }); c = prev[c]; } return out.reverse();
}

/* ════════════════ 11. 화면 UI: 피드 · 층 이동 · 말풍선 ════════════════ */
const panel = document.getElementById("panel"), pGrid = document.getElementById("pGrid"), lb = document.getElementById("lightbox"), picker = document.getElementById("picker");
const lbImg = $<HTMLImageElement>("lbImg"), lbCap = document.getElementById("lbCap");
const feedBtn = document.getElementById("feedBtn"), feedFile = $<HTMLInputElement>("feedFile");
const fmtDate = (s) => { const d = new Date(s); return isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`; };
const greeting = (p) => { const cats = [...new Set(p.feeds.map((f) => f.cat).filter(Boolean))]; return p.feeds.length ? `안녕! 나는 ${p.nick}. ${cats.slice(0, 2).join(", ") || "하루"} 이야기를 네 컷으로 그렸어. 구경해 볼래?` : `안녕! 나는 ${p.nick}. 하루들에 그림일기 ${p.total}편을 올렸어.`; };
function nearNPC() { let best = null, bd = 1.9; for (const n of NPCS) { if (n.f !== me.f) continue; const d = Math.hypot(n.x - me.x, n.y - me.y); if (d < bd) { bd = d; best = n; } } return best; }
function nearSeat() { if (me.lie || me.seat) return null; let best = null, bd = 1.0; for (const st of floor.seats || []) { if (st.taken) continue; const d = Math.hypot(st.x - me.x, st.y - me.y); if (d < bd) { bd = d; best = st; } } return best; }
function sitDown(st) { me.seat = st; st.taken = "me"; me.x = st.x; me.y = st.y; showToast("의자에 앉았어요", "앉은 채로 1번을 누르면 네 컷을 그려요. 움직이면 일어나요.", 2600); me.h = st.yaw; me.path = null; if (me.act) endAct(me); sendPresence(true); }
function nearBag() { if (me.lie || me.seat) return null; let best = null, bd = 1.9; for (const o of floor.furn) { if (o.kind !== "beanbag" || o.taken) continue; const s = bagSpot(o), d = Math.hypot(s.x - me.x, s.y - me.y); if (d < bd) { bd = d; best = o; } } return best; }
function lieDown(o) { const s = bagSpot(o); me.lie = s; me.x = s.x; me.y = s.y; me.path = null; if (me.act) endAct(me); o.taken = "me"; sendPresence(true); showToast("빈백에 누웠어요", "움직이거나 F를 누르면 일어나요.", 2600); }
function standUp() {
  if (me.act?.name === "laptop") endAct(me);   // 일어나면 노트북을 덮는다
  if (me.seat) { me.seat.taken = false; [me.x, me.y] = nearestFree(floor, me.x + Math.sin(me.seat.yaw) * .5, me.y + Math.cos(me.seat.yaw) * .5); me.seat = null; sendPresence(true); return; }
  if (!me.lie) return; for (const o of floor.furn) if (o.taken === "me") o.taken = false; [me.x, me.y] = nearestFree(floor, me.x + Math.sin(me.lie.yaw) * 1.2, me.y + Math.cos(me.lie.yaw) * 1.2); me.lie = null; sendPresence(true);
}
const atCall = () => floor.calls.some((k) => inRect({ x: k.x - .2, y: k.y - .3, w: k.w + .4, h: k.h + .6 }, me.x, me.y));
function interact() { if (me.lie || me.seat) { standUp(); return; } const st = nearSeat(); if (st && !(nearNPC() && Math.hypot(st.x - me.x, st.y - me.y) > .55)) { sitDown(st); return; } const n = nearNPC(); if (n) { n.say = "반가워!"; n.sayAt = performance.now(); NPCS.forEach((o) => (o.talk = o === n)); openPanel(n.p); return; } const bag = nearBag(); if (bag) { lieDown(bag); return; } if (atCall()) openPicker(); }
let openP = null;
function openPanel(p) {
  if (locked()) document.exitPointerLock();
  openP = p;
  document.getElementById("pName").textContent = `${p.nick} (NPC)`;
  $<HTMLImageElement>("pAvatar").src = p.avatar || avatarURL(avToLook(avFromSeed(String(p.nick))));
  const cats = [...new Set(p.feeds.map((f) => f.cat).filter(Boolean))];
  document.getElementById("pMeta").textContent = `하루들 공개 피드 ${p.total}편${cats.length ? " · " + cats.join(" · ") : ""}`;
  document.getElementById("pSay").textContent = greeting(p);
  pGrid.replaceChildren();
  if (!p.feeds.length) {
    const e = document.createElement("div"); e.className = "empty";
    const t = document.createElement("span"); t.textContent = "네 컷 사진이 아직 연결되지 않았어요. 다운로드 폴더의 harudle-feed-bundle.json을 불러오면 바로 보여요.";
    const b = document.createElement("button"); b.className = "btn"; b.type = "button"; b.textContent = "네 컷 사진 불러오기"; b.onclick = () => feedFile.click();
    e.append(t, b); pGrid.append(e);
  }
  for (const f of p.feeds) {
    const b = document.createElement("button"); b.className = "card"; b.type = "button";
    const img = document.createElement("img"); img.src = f.img; img.alt = `${p.nick}의 네 컷 만화 (${f.cat})`; img.loading = "lazy";
    const meta = document.createElement("div"); const l = document.createElement("span"); l.textContent = `${f.cat} · ${fmtDate(f.at)}`; const r = document.createElement("b"); r.textContent = `♥ ${f.likes}`; meta.append(l, r);
    b.append(img, meta);
    b.onclick = () => { lbImg.src = f.img; lbImg.alt = img.alt; lbCap.replaceChildren(); const s = document.createElement("span"); s.textContent = `${p.nick} · ${f.cat} · ${fmtDate(f.at)} · ♥ ${f.likes} · 댓글 ${f.comments}`; const a = document.createElement("a"); a.href = f.share; a.target = "_blank"; a.rel = "noopener"; a.textContent = "하루들에서 보기 ↗"; lbCap.append(s, a); lb.hidden = false; };
    pGrid.append(b);
  }
  if (p.feeds.length && p.total > p.feeds.length) { const m = document.createElement("div"); m.className = "more"; m.textContent = `최근 ${p.feeds.length}편이에요. 전체 ${p.total}편은 하루들 공개 피드에서 볼 수 있어요.`; pGrid.append(m); }
  panel.classList.add("open"); panel.setAttribute("aria-hidden", "false");
}
function closePanel() { const was = panel.classList.contains("open"); openP = null; NPCS.forEach((o) => (o.talk = false)); panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); if (was) syncCursor(); }
document.getElementById("pClose").onclick = closePanel;
lb.addEventListener("click", (e) => { if (e.target === lb || e.target === lbImg) { lb.hidden = true; syncCursor(); } });
// 엘리베이터 층 고르기: 창이니 커서를 꺼낸다. 마우스로 누르거나 숫자 1~4·W/S·F로 고르고, 닫히면 다시 고정
function openPicker() {
  if (locked()) document.exitPointerLock();
  const list = document.getElementById("pickList"); list.replaceChildren();
  for (const f of [14, 13, 12, 11]) { const b = document.createElement("button"); b.type = "button"; b.disabled = f === me.f; const l = document.createElement("b"); l.textContent = f + "F"; const s = document.createElement("span"); s.textContent = f === me.f ? "지금 있는 층" : FLOOR_INFO[f]; b.append(l, s); b.onclick = () => { closePicker(); goFloor(f, ELEV_SPAWN); }; list.append(b); }
  picker.hidden = false; $q("button:not([disabled])", list)?.focus();
}
function closePicker() { picker.hidden = true; (document.activeElement as HTMLElement)?.blur?.(); syncCursor(); }
document.getElementById("pickClose").onclick = closePicker;
picker.addEventListener("click", (e) => { if (e.target === picker) closePicker(); });
const fade = document.getElementById("fade"); let lastPortal = 0;
function goFloor(f, spawn) {
  fade.style.opacity = "1";
  setTimeout(() => { standUp(); me.f = f; floor = FLOORS[f]; [me.x, me.y] = nearestFree(floor, spawn[0], spawn[1]); me.jz = 0; me.jv = 0; me.up = 0; dog.x = me.x - 1; dog.y = me.y + .5; me.path = null; curZone = null; showFloors(); refreshRoomTags(); updateFloorHud(); sendPresence(true); cam.target.set(wx(me.x), floorY(f), wz(me.y)); fade.style.opacity = "0"; }, 250);
}
// 층 바로가기 버튼은 없다: 다른 층은 엘리베이터나 계단으로만 간다
function updateFloorHud() { document.querySelector("#floorBadge b").textContent = me.f + "F"; document.querySelector("#floorBadge span").textContent = FLOOR_INFO[me.f]; }
// 처음 온 사람에게 세 장짜리 안내: F 상호작용 → V 시점 → Tab 인벤토리
const tour = document.getElementById("tour"), tourStep = document.getElementById("tourStep"), tourDots = document.getElementById("tourDots");
const tourNext = document.getElementById("tourNext") as HTMLButtonElement, tourPrev = document.getElementById("tourPrev") as HTMLButtonElement;
const TOUR = [
  { title: "가까이 가서 F", art: `<div class="tart tart-f"><svg viewBox="0 0 120 90" aria-hidden="true"><rect x="8" y="10" width="44" height="66" rx="3" fill="#9C9A95" stroke="#111118" stroke-width="2.5"/><rect x="16" y="20" width="28" height="56" fill="#2B2A28" stroke="#111118" stroke-width="2"/><path d="M30 20v56" stroke="#5E5C58" stroke-width="2"/><rect x="22" y="13" width="16" height="5" rx="1" fill="#16161A"/><path d="M27 16l3-2 3 2" stroke="#FFB547" stroke-width="1.5" fill="none"/><path d="M78 40h28v8H78z" fill="#fff" stroke="#111118" stroke-width="2.5" stroke-linejoin="round"/><path d="M80 48v26M104 48v26M100 22v18" stroke="#111118" stroke-width="2.5" stroke-linecap="round"/><path d="M84 22h20" stroke="#111118" stroke-width="2.5" stroke-linecap="round"/></svg><kbd class="tkey">F</kbd></div>`,
    kb: "엘리베이터 앞이나 의자 가까이에서 <kbd>F</kbd>를 누르면 다른 층으로 가거나 앉아요. 크루 옆에서 누르면 말을 걸고, 빈백에서는 누워요.", touch: "엘리베이터·의자·크루 가까이 가면 버튼이 떠요. 눌러서 층을 옮기고, 앉고, 말을 걸어요." },
  { title: "V로 시점 바꾸기", art: `<div class="tart tart-v"><div class="tview"><b>위에서</b><svg viewBox="0 0 40 30"><rect x="4" y="6" width="32" height="20" fill="#F2F4E2" stroke="#111118" stroke-width="2"/><circle cx="20" cy="16" r="3" fill="#B6A6E8" stroke="#111118" stroke-width="1.5"/></svg></div><span class="tarrow">→</span><div class="tview"><b>들어가서</b><svg viewBox="0 0 40 30"><path d="M4 26L14 8h12l10 18z" fill="#F2F4E2" stroke="#111118" stroke-width="2" stroke-linejoin="round"/><circle cx="20" cy="20" r="4" fill="#B6A6E8" stroke="#111118" stroke-width="1.5"/></svg></div><span class="tarrow">→</span><div class="tview"><b>1인칭</b><svg viewBox="0 0 40 30"><rect x="4" y="4" width="32" height="22" rx="2" fill="#1C2B55" stroke="#111118" stroke-width="2"/><circle cx="20" cy="15" r="2.5" fill="#fff" stroke="#111118" stroke-width="1.5"/></svg></div><kbd class="tkey">V</kbd></div>`,
    kb: "<kbd>V</kbd>를 누를 때마다 위에서 보기 → 들어가서 보기 → 1인칭으로 바뀌어요. 들어가서 볼 때는 마우스로 둘러보고, <kbd>Esc</kbd>로 커서를 꺼내요.", touch: "오른쪽 아래 시점 버튼으로 위에서·들어가서·1인칭을 오가요. 화면을 끌어서 둘러봐요." },
  { title: "Tab으로 가방 열기", art: `<div class="tart tart-tab"><div class="tbar"><span class="tslot"><i>1</i>${ICON.laptop}</span><span class="tslot"><i>2</i>${ICON.coffee}</span><span class="tslot vacant"></span><span class="tslot vacant"></span></div><kbd class="tkey wide">Tab</kbd></div>`,
    kb: "<kbd>Tab</kbd>을 누르면 인벤토리가 열려요. 칸을 누르거나 숫자키로 써요. 노트북은 의자에 앉아서 펼치고, 아이스 아메리카노는 언제든 한 모금!", touch: "🎒 버튼으로 인벤토리를 열고 칸을 눌러 써요. 노트북은 앉아서 펼치고, 아이스 아메리카노는 언제든 한 모금!" },
];
let tourAt = 0;
tourDots.innerHTML = TOUR.map(() => "<i></i>").join("");
function showTourStep(i) {
  tourAt = clamp(i, 0, TOUR.length - 1); const st = TOUR[tourAt];
  tourStep.innerHTML = `<p class="tcount">${tourAt + 1} / ${TOUR.length}</p>${st.art}<h4 id="tourTitle">${st.title}</h4><p class="tdesc kb-only">${st.kb}</p><p class="tdesc touch-only">${st.touch}</p>`;
  tourStep.classList.remove("in"); void tourStep.offsetWidth; tourStep.classList.add("in");   // 장이 넘어갈 때 살짝 올라온다
  [...tourDots.children].forEach((d, k) => d.classList.toggle("on", k === tourAt));
  tourPrev.hidden = tourAt === 0; tourNext.textContent = tourAt === TOUR.length - 1 ? "시작하기" : "다음"; tourNext.focus();
}
function openTour() { tour.hidden = false; if (locked()) document.exitPointerLock(); showTourStep(0); }
function closeTour() { tour.hidden = true; LS.set("ww.tour", "1"); syncCursor(); }
tourNext.onclick = () => (tourAt === TOUR.length - 1 ? closeTour() : showTourStep(tourAt + 1));
tourPrev.onclick = () => showTourStep(tourAt - 1);
document.getElementById("tourSkip").onclick = closeTour;
const guide = document.getElementById("guide");
function openGuide() { guide.hidden = false; if (locked()) document.exitPointerLock(); document.getElementById("guideOk").focus(); }
function closeGuide() { guide.hidden = true; LS.set("ww.guide", "1"); syncCursor(); }
document.getElementById("guideOk").onclick = closeGuide; document.getElementById("guideBtn").onclick = openGuide;
guide.addEventListener("click", (e) => { if (e.target === guide) closeGuide(); });
// 걷기만 하고 달려 본 적이 없으면 한 번 알려 준다
let walkFor = 0, runTipShown = false;
const actBtn = document.getElementById("act"); actBtn.onclick = interact;
function setMyAv(c) { myAv = { ...c }; LS.set("ww.avatar", avEncode(myAv)); const vis = meDoll.root.visible; dropDoll(meDoll); meDoll = makeChar(myAv); meDoll.root.visible = vis; scene.add(meDoll.root); sendPresence(true); renderAvPanel(); }
// 캐릭터 꾸미기 (하루들 월드의 AvatarCustomizer와 같은 항목)
const avPanel = document.getElementById("avPanel"); let avColorPart = "headColor", avCamBack = null;
function renderAvPanel() {
  if (avPanel.hidden) return;
  const rows = AV_PARTS.map((part) => `<div class="avrow"><b>${AV_LABEL[part]._}</b><div class="avchips">${AV[part].map((v) => `<button type="button" data-part="${part}" data-v="${v}" aria-pressed="${myAv[part] === v}">${AV_LABEL[part][v]}</button>`).join("")}</div></div>`).join("");
  const tabs = AV_COLOR_PARTS.map(([k, l]) => `<button type="button" data-cpart="${k}" aria-pressed="${avColorPart === k}">${l}</button>`).join("");
  const sw = (avColorPart === "skinColor" ? AV_SKINS.concat(AV_COLORS.filter((c) => !AV_SKINS.includes(c))) : AV_COLORS).map((c) => `<button type="button" class="sw" data-color="${c}" style="background:${c}" aria-label="${c}" aria-pressed="${myAv[avColorPart] === c}"></button>`).join("");
  document.getElementById("avBody").innerHTML = `<div class="avchips presets">${AV_PRESETS.map(([l], i) => `<button type="button" data-preset="${i}">${l}</button>`).join("")}<button type="button" data-random="1">랜덤</button></div>${rows}<div class="avrow"><b>색</b><div class="avchips">${tabs}</div><div class="swatches">${sw}</div><label class="custom">직접 고르기 <input type="color" data-custom="1" value="${String(myAv[avColorPart]).toLowerCase()}"></label></div>`;
}
avPanel.addEventListener("change", (e) => { const t = e.target as HTMLInputElement; if (t.dataset.custom) setMyAv({ ...myAv, [avColorPart]: t.value.toUpperCase() }); });
avPanel.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button"); if (!b) return;
  if (b.id === "avDone") return closeAvPanel();
  if (b.dataset.part) setMyAv({ ...myAv, [b.dataset.part]: b.dataset.v });
  else if (b.dataset.cpart) { avColorPart = b.dataset.cpart; renderAvPanel(); }
  else if (b.dataset.color) setMyAv({ ...myAv, [avColorPart]: b.dataset.color });
  else if (b.dataset.preset) setMyAv(AV_PRESETS[+b.dataset.preset][1]);
  else if (b.dataset.random) setMyAv(avRandom());
});
function openAvPanel() { if (locked()) document.exitPointerLock(); avPanel.hidden = false; renderAvPanel(); if (!inside()) { avCamBack = cam.distT; cam.distT = 6; cam.yawT = me.h; cam.pitchT = .5; } /* 얼굴이 보이게 앞쪽에서 */ document.getElementById("avDone").focus(); }
function closeAvPanel() { const was = !avPanel.hidden; avPanel.hidden = true; if (was) syncCursor(); if (avCamBack !== null) { cam.distT = avCamBack; avCamBack = null; } }
document.getElementById("lookBtn").onclick = () => (avPanel.hidden ? openAvPanel() : closeAvPanel());
// 채팅: Enter로 들어가고, 쓰고 Enter면 보내고 나온다(빈 채로 Enter·Esc면 그냥 나온다). 나오면 다시 마우스를 고정한다
const sayInput = $<HTMLInputElement>("sayInput");
function openChat() { keys.clear(); me.runHold = false; sayInput.focus(); }
function closeChat() { sayInput.blur(); lockMouse(); }
document.getElementById("sayForm").addEventListener("submit", (e) => { e.preventDefault(); const v = sayInput.value.trim(); if (v) { me.say = v.slice(0, 40); me.sayAt = Date.now(); sayInput.value = ""; sendPresence(true); } closeChat(); });
sayInput.addEventListener("keydown", (e) => { if (e.code === "Escape") { e.preventDefault(); sayInput.value = ""; closeChat(); } });
let curZone = null, toastTimer = 0; const toast = document.getElementById("zoneToast");
function showToast(h, p, ms = 3800) { toast.querySelector("h2").textContent = h; toast.querySelector("p").textContent = p; toast.style.opacity = "1"; clearTimeout(toastTimer); toastTimer = setTimeout(() => (toast.style.opacity = "0"), ms); }
function checkZone() {
  let z = null; for (const zz of floor.zones) if (inRect(zz, me.x, me.y) && zz.desc) { if (!z || zz.w * zz.h < z.w * z.h) z = zz; }
  if (z !== curZone) { curZone = z; if (z) showToast(z.name, z.desc); }
}
/* 피드 묶음: 함께 올린 feed.json → 없으면 이 브라우저에 불러 둔 파일(IndexedDB) */
const idb = {
  open() { return new Promise((res, rej) => { try { const r = indexedDB.open("ww-feed", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); },
  async get(k) { const db = await this.open(); return new Promise((res) => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => res(t.result); t.onerror = () => res(null); }); },
  async set(k, v) { const db = await this.open(); return new Promise((res) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => res(true); t.onerror = () => res(false); }); },
};
feedBtn.onclick = () => feedFile.click();
feedFile.addEventListener("change", async () => {
  const file = feedFile.files[0]; if (!file) return;
  try { const data = JSON.parse(await file.text()); if (applyFeed(data)) { idb.set("bundle", data).catch(() => { }); showToast("네 컷 사진을 불러왔어요", "캐릭터를 눌러 피드를 구경해 보세요."); if (openP) openPanel(openP); } else throw 0; }
  catch { showToast("파일을 읽지 못했어요", "harudle-feed-bundle.json 파일이 맞는지 확인해 주세요.", 4200); }
  feedFile.value = "";
});
const STANDALONE = !window.claude?.use;
async function loadFeed() {
  if (STANDALONE) try { const r = await fetch("/api/feed"); if (r.ok && applyFeed(await r.json())) return; } catch { }
  try { const r = await fetch("feed.json"); if (r.ok && applyFeed(await r.json())) return; } catch { }
  try { const d = await idb.get("bundle"); if (d && applyFeed(d)) return; } catch { }
  feedBtn.hidden = false;
}

/* ════════════════ 12. 같이 있는 크루 (room presence) ════════════════ */
let room = null, user = null, peerList = [], names = {}, lastSent = 0;
const online = document.getElementById("online");
let wasMoving = false;
// 다른 탭으로 가면 그림이 멈춰 멈춤 신호를 못 보낸다: 숨기 전에 보낸다
document.addEventListener("visibilitychange", () => { if (document.hidden && me.moving) { me.moving = false; wasMoving = false; sendPresence(true); } });
function sendPresence(force) {
  if (!room) return; const now = performance.now(); if (!force && now - lastSent < 90) return; lastSent = now;
  room.presence({ f: me.f, x: Math.round(me.x * 100) / 100, y: Math.round(me.y * 100) / 100, u: Math.round(me.up * 100) / 100, h: Math.round(me.h * 100) / 100, m: me.moving ? 1 : 0, r: running() ? 1 : 0, l: me.lie ? 1 : 0, st: me.seat ? 1 : 0, ly: me.lie ? Math.round(me.lie.yaw * 100) / 100 : 0, jc: me.jc, ac: me.ac, an: me.an, as: me.as, look: 0, av: avEncode(myAv), say: me.say && Date.now() - me.sayAt < 6000 ? me.say : null }).catch(() => { });
}
// EC2에서는 직접 만든 WebSocket 서버가 room 역할을 한다
function wsRoom() {
  let ws = null, handler = null, last = null, retry = 800;
  const nameKey = "ww.name";
  let myName = LS.get(nameKey) || `크루${Math.floor(Math.random() * 900 + 100)}`; LS.set(nameKey, myName);
  const nameBtn = document.getElementById("nameBtn"), nameForm = document.getElementById("nameForm"), nameInput = $<HTMLInputElement>("nameInput");
  nameBtn.hidden = false; nameBtn.textContent = `이름: ${myName}`; myTag.textContent = myName;
  nameBtn.onclick = () => { nameBtn.hidden = true; nameForm.hidden = false; nameInput.value = myName; nameInput.focus(); nameInput.select(); };
  const saveName = () => { const v = nameInput.value.trim().slice(0, 16); if (v) { myName = v; LS.set(nameKey, v); send({ t: "name", name: v }); } nameForm.hidden = true; nameBtn.hidden = false; nameBtn.textContent = `이름: ${myName}`; myTag.textContent = myName; };
  nameForm.addEventListener("submit", (e) => { e.preventDefault(); saveName(); }); nameInput.addEventListener("blur", saveName);
  const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  let myId = null, firstV = null;
  // 서버가 새 버전으로 바뀌면 페이지는 그대로 두고, 새로고침을 권하는 버튼만 띄운다
  const showUpdate = () => { if (document.getElementById("updateChip")) return; const b = document.createElement("button"); b.id = "updateChip"; b.type = "button"; b.textContent = "새 버전이 나왔어요 · 새로고침"; b.onclick = () => location.reload(); document.body.append(b); };
  const connect = () => {
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.onopen = () => { retry = 800; send({ t: "name", name: myName }); if (last) send({ t: "p", p: last }); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "hello") { myId = m.id; if (m.v) { if (!firstV) firstV = m.v; else if (m.v !== firstV) showUpdate(); } }
      if (m.t === "bye") retry = 150; /* 서버가 새 버전으로 바뀌는 중: 곧바로 다시 붙는다 */ if (m.t === "peers" && handler) handler({ peers: m.peers.map((p) => ({ ...p, kind: "viewer", sameTab: p.peer === myId })) }); };
    ws.onclose = () => { setTimeout(connect, retry); retry = Math.min(10000, retry * 1.6); };
  };
  connect();
  return { presence: async (p) => { last = p; send({ t: "p", p }); }, onPeers: (fn) => { handler = fn; } };
}
async function joinRoom() {
  try {
    if (STANDALONE) {
      room = wsRoom();
      room.onPeers((ch) => {
        peerList = ch.peers.filter((p) => !p.sameTab);
        for (const [k, v] of peers) if (!peerList.some((p) => p.peer === k)) { endAct(v); dropDoll(v.doll); v.tag.remove(); v.bub.remove(); peers.delete(k); }
        online.textContent = peerList.length ? `같이 있는 크루 ${peerList.length + 1}명` : "혼자 둘러보는 중";
      });
      sendPresence(true); return;
    }
    if (!window.claude?.use) return;
    [room, user] = await Promise.all([claude.use("room"), claude.use("user")]); if (!room) return;
    room.onPeers(async (ch) => {
      peerList = ch.peers.filter((p) => !p.sameTab && p.kind === "viewer");
      const ids = peerList.map((p) => p.by).filter(Boolean); if (user && ids.length) { const ps = await user.profiles(ids); for (const id of ids) names[id] = ps[id]?.name || ""; }
      for (const [k, v] of peers) if (!peerList.some((p) => p.peer === k)) { endAct(v); dropDoll(v.doll); v.tag.remove(); v.bub.remove(); peers.delete(k); }
      online.textContent = peerList.length ? `같이 있는 크루 ${peerList.length + 1}명` : "혼자 둘러보는 중";
    }, () => { });
    sendPresence(true);
  } catch { }
}
function syncPeers(dt, t) {
  for (const p of peerList) {
    const s = p.presence || {}; if (typeof s.x !== "number" || !FLOORS[s.f]) continue;
    const l = avDecode(s.av) || avFromSeed(p.peer), key = avKey(l);
    let v = peers.get(p.peer);
    if (!v) { v = { doll: makeChar(l), key, x: s.x, y: s.y, tag: mkLabel("name-tag peer", "크루"), bub: mkLabel("bub", "") }; v.bub.hidden = true; scene.add(v.doll.root); peers.set(p.peer, v); }
    if (v.key !== key) { const vis0 = v.doll.root.visible; dropDoll(v.doll); v.doll = makeChar(l); v.doll.root.visible = vis0; scene.add(v.doll.root); v.key = key; }
    v.x = lerp(v.x, s.x, Math.min(1, dt * 10)); v.y = lerp(v.y, s.y, Math.min(1, dt * 10));
    if (s.jc !== v.jc) { if (v.jc !== undefined) v.jv = 4.6; v.jc = s.jc; }
    if (s.ac !== v.ac) { if (v.ac !== undefined && typeof s.an === "string") startAct(v, s.an, s.as | 0); v.ac = s.ac; }
    if ((s.m || (!s.st && v.act?.name === "laptop")) && v.act) endAct(v);
    v.jz = v.jz || 0; v.jv = v.jv || 0; if (v.jz > 0 || v.jv > 0) { v.jv -= 15 * dt; v.jz += v.jv * dt; if (v.jz <= 0) { v.jz = 0; v.jv = 0; } }
    const vis = s.f === me.f; v.doll.root.visible = vis; setPos(v.doll, s.f, v.x, v.y); v.doll.root.position.y += (+s.u || 0) + v.jz; v.doll.blob.position.y = .012 - v.jz; applyLie(v.doll, s.l ? { yaw: +s.ly || 0 } : null); v.doll.setSeated(s.st);
    // 받는 쪽 안전장치: "걷는 중"이라고 와도 위치가 0.5초 넘게 그대로면 멈춘 것으로 본다(멈춤 신호가 빠졌거나 그 사람이 다른 탭으로 갔을 때)
    if (s.x !== v.sx || s.y !== v.sy) { v.sx = s.x; v.sy = s.y; v.movedAt = t; }
    const walking = (v.walking = !!s.m && t - (v.movedAt ?? -9) < .5);
    v.doll.update(dt, t, walking, typeof s.h === "number" ? s.h : null, 0, false, tickAct(v, dt), v.jz > .01, walking && !!s.r);
    v.tag.textContent = p.name || (p.by && names[p.by]) || "크루";
    const rp = v.doll.root.position;
    if (vis) project(v.tag, rp.x, rp.y - .05, rp.z, true); else v.tag.style.display = "none";
    const say = typeof s.say === "string" ? s.say.slice(0, 40) : ""; v.bub.hidden = !(vis && say); if (!v.bub.hidden) { v.bub.textContent = say; project(v.bub, rp.x, rp.y + DOLL, rp.z); }
  }
}

/* ════════════════ 13. 한 프레임 ════════════════ */
let last = performance.now(), npcSkillTimer = 4;
function step(dt, t) {
  let ix = 0, iy = 0, amag = 1;
  if (joy.on) { const m = Math.hypot(joy.x, joy.y); if (m > .18) { ix = joy.x; iy = joy.y; amag = clamp(m, .45, 1); } }   // 조이스틱: 민 만큼 빠르게
  if (keys.has("arrowleft") || keys.has("a")) ix -= 1; if (keys.has("arrowright") || keys.has("d")) ix += 1;
  if (keys.has("arrowup") || keys.has("w")) iy -= 1; if (keys.has("arrowdown") || keys.has("s")) iy += 1;
  let vx = 0, vy = 0;
  // 걷는 방향은 지금 시야 기준
  const ry = inside() ? cam.yawT : cam.yaw;
  if (ix || iy) { const fx = -Math.sin(ry), fz = -Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry); vx = rx * ix - fx * iy; vy = rz * ix - fz * iy; }
  else if (me.path && me.path.length) { const n = me.path[0]; const dx = n.x - me.x, dy = n.y - me.y, d = Math.hypot(dx, dy); if (d < .15) me.path.shift(); else { vx = dx / d; vy = dy / d; } }
  if (me.lie || me.seat) { if ((ix || iy) || (me.path && me.path.length)) standUp(); else { vx = vy = 0; } }
  if (me.goal && !(me.path && me.path.length)) { // 도착: 앉거나 눕기
    const gl = me.goal; me.goal = null;
    if (gl.bag && !gl.bag.taken && Math.hypot(gl.x - me.x, gl.y - me.y) < 2.2) lieDown(gl.bag);
    else if (gl.seat && !gl.seat.taken && Math.hypot(gl.x - me.x, gl.y - me.y) < 1.4) sitDown(gl.seat);
  }
  const sp = (running() ? 7.3 : 3.2) * amag, len = Math.hypot(vx, vy) || 1; vx = vx / len * sp * dt; vy = vy / len * sp * dt;
  // 걷기: 발 높이(올라선 가구 + 점프)에서 갈 수 있는지 본다. 책상·화분 같은 건 점프해서 올라서고, 가장자리를 넘으면 떨어진다
  const feet = me.up + me.jz, free = (x, y) => (me.lie || me.seat ? fits(floor, x, y) : canStand(floor, x, y, feet));
  // 끼임 방지: 몸이 벽·가구와 겹친 채 시작하면(예전 에스컬레이터 도착 자리) 어떤 방향으로도 못 움직였다 → 가장 가까운 빈 칸으로 옮긴다
  if (!me.lie && !me.seat && !free(me.x, me.y)) { [me.x, me.y] = nearestFree(floor, me.x, me.y); me.path = null; }
  if (vx && free(me.x + vx, me.y)) me.x += vx; if (vy && free(me.x, me.y + vy)) me.y += vy;
  { const up = me.lie || me.seat ? 0 : topAt(floor, me.x, me.y), z = feet - up;   // 올라서면 그 위가 바닥, 내려서면 떨어진다
    if (up !== me.up) { me.up = up; me.jz = Math.max(0, z); if (z < 0) me.jv = Math.max(0, me.jv); sendPresence(true); } }
  me.moving = !!(vx || vy);
  if (!runTipShown) { if (me.moving && running()) runTipShown = true; else if (me.moving) { walkFor += dt; if (walkFor > 5) { runTipShown = true; showToast("더 빨리 가고 싶다면", "Shift를 누른 채로 걸으면 달리고, Space를 누르면 점프해요.", 4200); } } }
  if (me.moving) { me.h = Math.atan2(vx, vy); if (me.act) endAct(me); sendPresence(false); }
  else if (wasMoving) sendPresence(true);   // 멈춘 순간은 꼭 보낸다(안 보내면 남들 화면에서 제자리걸음이 남는다)
  wasMoving = me.moving;
  // 시야는 몸 방향을 따라가지 않는다: 마우스로만 돈다
  if (me.jz > 0 || me.jv > 0) { me.jv -= 15 * dt; me.jz += me.jv * dt; if (me.jz <= 0) { me.jz = 0; me.jv = 0; me.jumps = 0; } }
  // 트램펄린 위에서는 저절로 통통
  if (me.jz <= 0 && me.jv <= 0 && floor.furn.some((o) => o.kind === "trampoline" && inRect(o, me.x, me.y))) { me.jv = 6.4; me.jc++; sendPresence(true); }
  $all(".skill[data-skill], .mBtn[data-skill]").forEach((b) => b.classList.toggle("on", me.act?.name === b.dataset.skill));
  npcSkillTimer -= dt; if (npcSkillTimer <= 0) { npcSkillTimer = 8 + Math.random() * 12; const idle = NPCS.filter((n) => n.f === me.f && !n.moving && !n.act && !n.talk && !n.lie); const n = idle[Math.floor(Math.random() * idle.length)]; if (n) startAct(n, ["draw", "draw", "wave", "heart"][Math.floor(Math.random() * 4)]); }
  if (t * 1000 - lastPortal > 1400) for (const p of floor.portals) if (inRect(p, me.x, me.y)) { lastPortal = t * 1000; goFloor(p.to, p.spawn); break; }
  // 강아지는 내 옆을 졸졸
  const ddx = me.x - Math.sin(me.h) * .9 + Math.cos(me.h) * .35 - dog.x, ddy = me.y - Math.cos(me.h) * .9 - Math.sin(me.h) * .35 - dog.y, dd = Math.hypot(ddx, ddy); dog.moving = dd > .35;
  if (dd > 6) { dog.x = me.x; dog.y = me.y; } else if (dog.moving) { const s = Math.min(dd, 6 * dt); dog.x += ddx / dd * s; dog.y += ddy / dd * s; dog.h = Math.atan2(ddx, ddy); }
  // 크루들은 제자리 근처를 서성인다
  for (const n of NPCS) {
    if (n.f !== me.f) continue; const fl = FLOORS[n.f];
    if (n.lie || n.seat || n.act || n.wait > 0) { n.wait -= dt; n.moving = false; continue; }
    const dx = n.tx - n.x, dy = n.ty - n.y, d = Math.hypot(dx, dy);
    if (d < .08) { n.wait = 2 + Math.random() * 5; const a = Math.random() * Math.PI * 2, rr = Math.random() * 1.6; const tx = n.hx + Math.cos(a) * rr, ty = n.hy + Math.sin(a) * rr; if (!solid(fl, tx, ty)) { n.tx = tx; n.ty = ty; } n.moving = false; continue; }
    const s = Math.min(d, 1.3 * dt); const nx = n.x + dx / d * s, ny = n.y + dy / d * s; if (solid(fl, nx, ny)) { n.tx = n.hx; n.ty = n.hy; n.wait = 1; continue; }
    n.x = nx; n.y = ny; n.moving = true; n.h = Math.atan2(dx, dy);
  }
  checkZone();
  const near = nearNPC(), call = atCall(), bag = nearBag(), seat = nearSeat();
  actBtn.hidden = !(me.lie || me.seat || near || bag || call || seat); actBtn.textContent = me.lie || me.seat ? "일어나기" : seat && !(near && Math.hypot(seat.x - me.x, seat.y - me.y) > .55) ? "앉기" : near ? `${near.p.nick}와 대화하기` : bag ? "빈백에 눕기" : "엘리베이터 타기";
  if (me.say && Date.now() - me.sayAt > 6000) { me.say = ""; sendPresence(true); }
}
const tgt = new THREE.Vector3();
function render(dt, t) {
  fpDt = dt;
  // 1인칭 고개는 마우스를 그대로 따른다(뒤따라 미끄러지는 느낌이 어지럽다). Q·E처럼 크게 돌릴 때만 부드럽게
  if (VIEW.mode === "first" && Math.abs(cam.yawT - cam.yaw) < .35) cam.yaw = cam.yawT; else cam.yaw = lerp(cam.yaw, cam.yawT, Math.min(1, dt * 8));
  if (VIEW.mode === "first") cam.look = cam.lookT;
  const fov = VIEW.mode === "first" ? 62 : 38; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }   // 1인칭은 넓게 봐야 덜 어지럽다 cam.pitch = lerp(cam.pitch, cam.pitchT, Math.min(1, dt * 8)); cam.dist = lerp(cam.dist, cam.distT, Math.min(1, dt * 8));
  cam.ip = lerp(cam.ip, cam.ipT, Math.min(1, dt * 8)); cam.id = lerp(cam.id, cam.idT, Math.min(1, dt * 8)); cam.look = lerp(cam.look, cam.lookT, Math.min(1, dt * 10));
  tgt.set(wx(me.x), floorY(me.f) + .4, wz(me.y)); cam.target.lerp(tgt, Math.min(1, dt * 6));
  if (inside()) { cam.target.copy(tgt); placeInside(); } else placeCamera();
  sun.position.set(cam.target.x + 8, cam.target.y + 18, cam.target.z + 10); sun.target.position.copy(cam.target);
  // 그림자 범위: 들어가서 볼 때는 내 둘레만 보이니 좁힌다(그릴 것이 줄고 그림자는 더 또렷해진다)
  const sx = inside() ? 18 : 40, sz = inside() ? 18 : 28, sc = sun.shadow.camera;
  if (sc.right !== sx || sc.top !== sz) { Object.assign(sc, { left: -sx, right: sx, top: sz, bottom: -sz }); sc.updateProjectionMatrix(); }
  adaptQuality(dt);
  setPos(meDoll, me.f, me.x, me.y); meDoll.root.position.y += me.up + me.jz; meDoll.blob.position.y = .012 - me.jz; meDoll.blob.scale.setScalar(1 - Math.min(.5, me.jz)); applyLie(meDoll, me.lie); meDoll.setSeated(me.seat); meDoll.root.visible = VIEW.mode === "top" || (VIEW.mode === "third" && !cam.close);
  meDoll.update(dt, t, me.moving, me.lie ? 0 : me.seat ? me.seat.yaw : me.h, 0, !!(me.say && Date.now() - me.sayAt < 2500), tickAct(me, dt), me.jz > .01, running() && me.moving);
  setPos(dog.doll, me.f, dog.x, dog.y); dog.doll.update(dt, t, dog.moving, dog.h);
  for (const n of NPCS) if (n.doll.root.visible) { setPos(n.doll, n.f, n.x, n.y); applyLie(n.doll, n.lie); n.doll.setSeated(n.seat); n.doll.update(dt, t, n.moving, n.lie ? 0 : n.seat ? n.seat.yaw : n.talk ? Math.atan2(me.x - n.x, me.y - n.y) : n.h, n.seed, performance.now() - n.sayAt < 2500, tickAct(n, dt)); }
  tickFx(dt); tickMeteors(dt);
  for (const s of spinners) s.rotation.y += dt * .9;
  syncPeers(dt, t);
  const mp = meDoll.root.position;
  if (VIEW.mode === "first" || (VIEW.mode === "third" && cam.close)) myTag.style.display = "none"; else project(myTag, mp.x, mp.y - .05, mp.z, true);
  myBub.hidden = !(me.say && Date.now() - me.sayAt < 6000); if (!myBub.hidden) { myBub.textContent = me.say; project(myBub, mp.x, mp.y + DOLL, mp.z); }
  for (const { n, tag, bub } of npcTags) {
    if (n.f !== me.f) { tag.style.display = "none"; bub.hidden = true; continue; }
    const p = n.doll.root.position; const d = Math.hypot(n.x - me.x, n.y - me.y);
    if (inside() && d > 14) { tag.style.display = "none"; bub.hidden = true; continue; }
    project(tag, p.x, p.y - .05, p.z, true); tag.style.opacity = d < 9 ? 1 : .55;
    bub.hidden = !(n.say && performance.now() - n.sayAt < 2500); if (!bub.hidden) { bub.textContent = n.say; project(bub, p.x, p.y + DOLL, p.z); }
  }
  for (const rt of roomTags) { // 들어가 있으면 가까운 이름표만
    if (inside() && Math.hypot(rt.x - wx(me.x), rt.z - wz(me.y)) > 12) { rt.el.style.display = "none"; continue; }
    project(rt.el, rt.x, floorY(me.f) + (inside() && rt.y === WALL + .35 ? 1.6 : rt.y), rt.z); }
  const near = nearNPC();
  if (near && !openP) { hintBub.hidden = false; hintBub.textContent = "F · 대화하기"; const p = near.doll.root.position; project(hintBub, p.x, p.y + DOLL + .15, p.z); }
  else if (nearSeat()) { hintBub.hidden = false; hintBub.textContent = "F · 앉기"; project(hintBub, mp.x, mp.y + DOLL + .15, mp.z); }
  else if (!me.lie && nearBag()) { hintBub.hidden = false; hintBub.textContent = "F · 빈백에 눕기"; project(hintBub, mp.x, mp.y + DOLL + .15, mp.z); }
  else if (atCall()) { hintBub.hidden = false; hintBub.textContent = "F · 엘리베이터"; project(hintBub, mp.x, mp.y + DOLL + .15, mp.z); }
  else hintBub.hidden = true;
}

/* ════════════════ 시작 ════════════════ */
const fontsReady = document.fonts ? Promise.race([document.fonts.load(`700 40px Gaegu`), new Promise((r) => setTimeout(r, 2500))]).catch(() => { }) : Promise.resolve();
fontsReady.then(() => {
  placeNPCs(); refreshRoomTags(); updateFloorHud();
  cam.target.set(wx(me.x), 0, wz(me.y)); placeCamera();
  const ld = document.getElementById("loading"); ld.style.opacity = "0"; setTimeout(() => ld.remove(), 450);
  showToast("11층에 도착했어요", "1번을 눌러 네 컷을 그려 보세요. 캐릭터를 누르면 그 크루의 하루들 피드가 열려요.", 5000);
  if (!LS.get("ww.tour")) openTour();   // 처음 오면 세 장짜리 안내(전체 조작법은 「조작법」 버튼)
  loadFeed(); joinRoom();
  ready = true;
  // 화면 점검용 손잡이: 주소 끝에 ?debug를 붙였을 때만
  if (new URLSearchParams(location.search).has("debug")) (window as any).__t = { peers, gl: renderer, Q, me, NPCS, cam, goFloor, setView, setMyAv, useSkill, jump, lieDown, sitDown, nearSeat, AVATAR_PRESETS, get floor() { return floor; } };
});

return { frame(dt: number) { if (!ready) return; const t = performance.now() / 1000; step(Math.min(.05, dt), t); render(Math.min(.05, dt), t); } };
}
