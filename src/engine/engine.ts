// 우테코 캠퍼스 엔진: 층·가구·카메라·이동·스킬·실시간·화면 UI
// 원래 public/index.html 한 파일에 있던 스크립트를 옮겼다. 캐릭터 모양만 React(하루들 월드 컴포넌트)가 그린다.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { AVATAR_COLOR_PARTS, AVATAR_COLORS, AVATAR_OPTIONS, AVATAR_PRESETS, LOCKED_OPTIONS, sanitizeAvatar, type AvatarConfig } from "../harudle/avatarData";
import { dropDoll, makeDoll } from "./dolls";
import { avatarPreview } from "../scene/avatarPreviewStore";
import { createEnvironment } from "./environment";
import { openWorldWindow } from "../worldFloor";
import { loadShowcase, type ShowItem } from "../worldShowcase";
import { drawFrame as drawEaselFrame, drawPaper as drawEaselPaper } from "../../world/src/scene/gallery/easelDrawing";
import { createCityscape } from "./cityscape";
import { mountMediaControls } from "../media/controller";
import { mountStartrack } from "../startrack/controller";
import { canControlStartrack, startrackScreenSize } from "../startrack/shared.mjs";
import { screenProjection } from "../startrack/screen";
import type { MediaJoin } from "../media/types";
import recruitPosterUrl from "../assets/recruit-poster-2026.png";
import comicWinterUrl from "../assets/booth/comic-winter.jpg";
import comicCastellaUrl from "../assets/booth/comic-castella.jpg";
import comicDanceUrl from "../assets/booth/comic-dance.jpg";
import comicPassUrl from "../assets/booth/comic-pass.jpg";
import boothBannerUrl from "../assets/booth/banner.jpg";
import { W, H, S, FH, WALL, DOLL, CEIL, VIEW, inside, INK, BRAND, NAVY, WEAK, HAND, narrow, clamp, lerp, rng, hash, wx, wz, tX, tY, floorY, FLOOR_INFO, makeFloor, FLOORS, WALK_THROUGH, ELEV_SPAWN, solid, inRect, roomKeyAt, STEP, ARC_STEP, bleacherLevel, flightSteps, DECK_H, heightAt, topAt, canStand, R_ME, bagSpot, applyLie, fits, nearestFree, furnCells, TOPS, FN, NW, NH, navNext, sweep, buildNav } from "./world";

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
if (TOUCH) { document.body.classList.add("touch"); const vb = document.getElementById("viewBtn"); if (vb) vb.textContent = "시점 변환"; const si = document.getElementById("sayInput") as HTMLInputElement; if (si) si.placeholder = "말풍선으로 한마디"; }


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

/* 14층 하루들 월드 액자(showframe): 그림은 내용(showcase)이 오면 캔버스에 그린다. 층을 짓기 전에 쓰이므로 여기 둔다 */
const SHOW_W = 512, SHOW_H = 600, SHOW_BAND = 88;
// 작가 전시실(a0~a7)은 월드 작가 방 바닥색(ZONE_COLORS)과 같은 색 액자
const ZONE_FRAMES = [0xE6DDF6, 0xFFE9B5, 0xFFD9E2, 0xD5EFE3, 0xD7E8FB, 0xFFE2CC, 0xDCD3FA, 0xF6DFF4];
const SHOW_FRAME: Record<string, number> = { work: 0xFFD97A, relay: 0xB9A6EC, song: 0xF7A6B5, drama: 0x7DB3F0, cheer: 0xFFE9B5, ...Object.fromEntries(ZONE_FRAMES.map((c, i) => [`a${i}`, c])) };
const SHOW_EMPTY: Record<string, string> = { work: "전시 준비 중", relay: "다음 화를 기다려요", song: "불러오는 중", drama: "불러오는 중", cheer: "작가를 기다려요" };
const showSlots: any[] = [];
// 작가 방 문패: 작가 이름은 내용이 와야 알아서 나중에 그린다
const showPlates: { cv: HTMLCanvasElement; tex: any; slot: number }[] = [];
let showcase: Record<string, ShowItem[]> | null = null, showcaseAt = 0, showcaseLoading = false;
const showItem = (slot) => slot.fixed ?? showcase?.[slot.src]?.[slot.slot] ?? null;
const showImages = new Map<string, Promise<HTMLImageElement>>();
const showImage = (url) => { if (!showImages.has(url)) { const img = new Image(); img.crossOrigin = "anonymous"; img.src = url; showImages.set(url, img.decode().then(() => img)); } return showImages.get(url); };
// 액자 그림 판 하나를 parent에 붙이고 등록한다. 위치(격자)는 nearShow가 처음 쓸 때 실제 자리에서 읽는다(돌려 세운 벽도 그대로 맞는다)
function showSlot(parent, src, index, fw, x, y, z, reach = 2) {
  const cv = document.createElement("canvas"); cv.width = SHOW_W; cv.height = SHOW_H;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = board(parent, fw, fw * SHOW_H / SHOW_W, tex, x, y, z); m.userData.noMerge = true;
  const slot = { src, slot: index, x: undefined, y: undefined, reach, cv, tex, mesh: m, url: null };
  m.userData.show = slot; showSlots.push(slot); paintShow(slot);
}
// 내용이 정해진 자리(큰 휴대폰처럼): 데이터를 받지 않고 그 항목을 그대로 쓴다
function fixedSlot(mesh, item, reach = 2) { const slot = { fixed: item, x: undefined, y: undefined, reach, mesh }; mesh.userData.show = slot; showSlots.push(slot); }
// 하루들 월드 큰 휴대폰 화면: 월드는 하루들을 화면에 그대로 띄우지만, 3D 판에는 웹을 못 넣어서 하루들 피드처럼 그린다(인기 만화가 오면 그 그림으로)
const PHONE_W = 360, PHONE_H = 720;
const phoneCanvas = document.createElement("canvas"); phoneCanvas.width = PHONE_W; phoneCanvas.height = PHONE_H;
const phoneTex = new THREE.CanvasTexture(phoneCanvas); phoneTex.colorSpace = THREE.SRGBColorSpace; phoneTex.anisotropy = 4;
function paintPhone() { // 하루들 모바일 첫 화면 모양(월드 휴대폰은 이 화면을 실제로 띄운다): 위에 + 버튼·Harudle 로고, 분류 탭, 한 편씩 크게 내려가는 피드, 아래 메뉴
  const g = phoneCanvas.getContext("2d"), w = PHONE_W, h = PHONE_H, works = showcase?.work ?? [], ink = "#2B2140", gray = "#8F8BA0", purple = "#7355DA", navTop = h - 64;
  const font = (size, weight = 700) => `${weight} ${size}px ${HAND}`;
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#E9E2FC"; g.beginPath(); g.arc(42, 34, 27, 0, Math.PI * 2); g.fill(); g.fillStyle = "#FFFFFF"; g.beginPath(); g.arc(42, 34, 21, 0, Math.PI * 2); g.fill();   // 만들기(+) 버튼
  g.strokeStyle = purple; g.lineWidth = 3; g.beginPath(); g.moveTo(34, 34); g.lineTo(50, 34); g.moveTo(42, 26); g.lineTo(42, 42); g.stroke();
  g.fillStyle = ink; g.font = font(30, 800); g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("Harudle", w / 2, 34);   // 로고
  g.font = font(15); g.textAlign = "left";
  ["전체", "일상", "연애", "직장", "학교"].forEach((t, i) => { g.fillStyle = i ? gray : purple; g.fillText(t, 20 + i * 44, 84); });
  g.fillStyle = purple; g.fillRect(18, 98, 30, 3); g.fillStyle = "#ECE8F4"; g.fillRect(16, 106, w - 32, 1);
  g.fillStyle = gray; g.textAlign = "right"; g.fillText("↻   최신순 ⌄", w - 18, 84);
  const post = (it, y) => { // 글쓴이 줄 → 네컷 → 좋아요·댓글·보내기
    const p = it?.post; g.fillStyle = "#F1ECFF"; g.beginPath(); g.arc(38, y + 14, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = ink; g.font = font(15); g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(`${p?.nickname ?? "하루들 작가"}  ›  ${p?.category ?? "일상"}`, 60, y + 14, w - 110);
    g.fillStyle = gray; g.textAlign = "right"; g.fillText("···", w - 20, y + 12);
    const iy = y + 40, side = w - 56; g.fillStyle = "#FAFAFC"; g.fillRect(28, iy, side, side); g.strokeStyle = "#E3DEEE"; g.lineWidth = 1; g.strokeRect(28, iy, side, side);
    if (it?.image) showImage(it.image).then((img) => { g.save(); g.beginPath(); g.rect(0, 0, w, navTop); g.clip(); g.drawImage(img, 28, iy, side, side); g.restore(); phoneTex.needsUpdate = true; }).catch(() => {});
    const ay = iy + side + 28; g.fillStyle = ink; g.font = font(17); g.textAlign = "left";
    g.fillText(`♡ ${p?.likes ?? 0}`, 24, ay); g.fillText(`▢ ${p?.comments ?? 0}`, 88, ay); g.fillText("➤", 150, ay);
    return ay + 34;
  };
  const next = post(works[0], 118); post(works[1], next);
  g.fillStyle = "#FFFFFF"; g.fillRect(0, navTop, w, h - navTop); g.fillStyle = "#ECE8F4"; g.fillRect(0, navTop, w, 1);   // 아래 메뉴
  [["⌂", "홈"], ["▦", "네컷 모아보기"], ["⚙", "설정"]].forEach(([icon, t], i) => { const cx = w * (i + .5) / 3; g.fillStyle = i ? gray : purple; g.textAlign = "center"; g.font = font(20); g.fillText(icon, cx, navTop + 22); g.font = font(12); g.fillText(t, cx, navTop + 48); });
  phoneTex.needsUpdate = true;
}
paintPhone();
// 휴대폰 옆 "크게 열기" 받침대 판, 휴대폰 위 말풍선
const phoneKioskTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#7355DA"; g.fillRect(0, 0, w, h); g.fillStyle = "#FFFFFF"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `800 ${h * .34}px ${HAND}`; g.fillText("⤢", w / 2, h * .3); g.font = `800 ${h * .22}px ${HAND}`; g.fillText("크게 열기", w / 2, h * .72); });
const phoneBubbleTex = canvasTex(640, 200, (g, w, h) => {
  g.fillStyle = "#FFFFFF"; g.strokeStyle = "#2B2140"; g.lineWidth = 8; g.beginPath(); g.roundRect(6, 6, w - 12, h - 60, 50); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(w / 2 - 34, h - 58); g.lineTo(w / 2, h - 10); g.lineTo(w / 2 + 34, h - 58); g.fill(); g.stroke(); g.fillRect(w / 2 - 30, h - 66, 60, 12);
  g.fillStyle = "#7355DA"; g.font = `800 66px ${HAND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("하루들 직접 써 보기", w / 2, (h - 54) / 2 + 4, w - 60);
});
function paintShow(slot) {
  if (slot.fixed) return;
  if (slot.paint) { slot.paint(slot); return; }
  const item = showItem(slot), g = slot.cv.getContext("2d"), w = SHOW_W, h = SHOW_H;
  const text = (t, y, size, color = "#111118") => { g.fillStyle = color; g.font = `700 ${size}px ${HAND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, w / 2, y, w - 40); };
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, w, h);
  if (!item) { text(showcase ? SHOW_EMPTY[slot.src] ?? "작가를 기다려요" : "불러오는 중…", h / 2, 40, "#8F8BA0"); slot.tex.needsUpdate = true; return; }
  g.fillStyle = "#FFF8DC"; g.fillRect(0, h - SHOW_BAND, w, SHOW_BAND); g.fillStyle = "#111118"; g.fillRect(0, h - SHOW_BAND - 3, w, 3);
  text(item.caption, h - SHOW_BAND / 2, 34);
  if (!item.image) { text(item.caption.startsWith("+") ? "+" : "✎", (h - SHOW_BAND) / 2, 160, "#B9A6EC"); slot.tex.needsUpdate = true; return; }
  text("그림 불러오는 중…", (h - SHOW_BAND) / 2, 34, "#8F8BA0"); slot.tex.needsUpdate = true;
  slot.url = item.image;
  showImage(item.image).then((img) => { if (slot.url !== item.image) return; g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, w, h - SHOW_BAND - 3); const side = h - SHOW_BAND - 3; g.drawImage(img, (w - side) / 2, 0, side, side); slot.tex.needsUpdate = true; }).catch(() => {});
}

function plateSlot(parent, index, w, x, y, z) {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = board(parent, w, w * 96 / 512, tex, x, y, z); m.userData.noMerge = true;
  const plate = { cv, tex, slot: index }; showPlates.push(plate); paintPlate(plate);
}
function paintPlate(plate) {
  const g = plate.cv.getContext("2d"), name = showcase?.plate?.[plate.slot]?.caption ?? `작가 전시실 ${plate.slot + 1}`;
  g.fillStyle = "#7355DA"; g.fillRect(0, 0, 512, 96); g.fillStyle = "#FFFFFF"; g.font = `700 48px ${HAND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, 256, 50, 480);
  plate.tex.needsUpdate = true;
}
// 메인 전시실의 함께 그리는 이젤: 월드 서버의 지금 그림(/easel/art)을 판에 그린다
const EASEL_PX = 512;
const easelCanvas = document.createElement("canvas"); easelCanvas.width = EASEL_PX; easelCanvas.height = EASEL_PX;
const easelTex = new THREE.CanvasTexture(easelCanvas); easelTex.colorSpace = THREE.SRGBColorSpace;
let easelAt = 0, easelLoading = false;
function paintEasel(segs) { const g = easelCanvas.getContext("2d"); drawEaselPaper(g, EASEL_PX, segs); drawEaselFrame(g, EASEL_PX); easelTex.needsUpdate = true; }
paintEasel([]);
function refreshEasel() {
  if (easelLoading) return; easelLoading = true; easelAt = performance.now();
  fetch("/easel/art", { cache: "no-store", credentials: "omit" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && Array.isArray(d.segs)) paintEasel(d.segs); }).catch(() => {}).finally(() => { easelLoading = false; });
}

/* ════════════════ 4. 월드 빌더: 층 하나 = 종이 디오라마 한 판 ════════════════ */
const C = { white: 0xffffff, wood: 0xEBD3AE, woodD: 0xC99E6B, gray: 0xCFCBD6, grayD: 0x9A97A3, dark: 0x2E2C38, brick: 0xE2A08A, leaf: 0x8FCFA3, olive: 0xB9C27A, sofa: 0xD9A877, mint: 0xD7E4DD, lav: 0xFFE27A, glass: 0xBFD9F0, red: 0xE46F6F, coffee: 0x8C6A4F };
function floorTexture(fl) {
  const P = 32;
  return canvasTex(W * P, H * P, (g) => {
    g.fillStyle = "#FBFAFD"; g.fillRect(0, 0, W * P, H * P);
    for (const z of fl.zones) if (z.tint) { g.fillStyle = z.tint; g.fillRect(z.x * P, z.y * P, z.w * P, z.h * P); }
    // 14층 월드 바닥 무늬: checker는 퀴즈 아케이드 두 칸 바둑판, planks는 릴레이 소설관 세로 나무판
    for (const z of fl.zones) if (z.checker) for (let yy = 0; yy < z.h; yy += 2) for (let xx = 0; xx < z.w; xx += 2) { g.fillStyle = z.checker[((xx + yy) / 2) % 2]; g.fillRect((z.x + xx) * P, (z.y + yy) * P, Math.min(2, z.w - xx) * P, Math.min(2, z.h - yy) * P); }
    for (const z of fl.zones) if (z.planks) for (let xx = 0; xx < z.w; xx++) { g.fillStyle = z.planks[xx % 2]; g.fillRect((z.x + xx) * P, z.y * P, P, z.h * P); g.fillStyle = "rgba(120,80,40,.18)"; for (let yy = (xx * 3) % 5; yy < z.h; yy += 5) g.fillRect((z.x + xx) * P, (z.y + yy) * P, P, 2); }
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
    if ((r.open || []).includes(s)) continue;   // open: 그 면은 벽 없이 바깥 통유리창이 바로 보인다(충돌은 바깥 테두리가 막는다)
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
    const col = r.wall ?? (r.ring ? C.grayD : r.closed ? 0xD5D3DD : C.white), h = r.ring ? 0.45 : WALL;   // wall: 14층 월드 방 벽색
    for (const [s, a, b] of wallSegs(r)) {
      // 층 바깥 테두리와 겹치는 면은 그리지 않는다: 바깥 통유리 창틀과 같은 자리라 겹쳐서 깜빡인다(충돌은 바깥 테두리가 막는다)
      if ((s === "e" && r.x + r.w === W) || (s === "w" && r.x === 0) || (s === "n" && r.y === 0) || (s === "s" && r.y + r.h === H)) continue;
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
    if (fl.f === 13) { // 높은 스타트랙 화면이 천장에 가려지지 않도록 객석 위를 연다.
      const h = new THREE.Path(); h.moveTo(wx(1), wz(10)); h.lineTo(wx(15), wz(10)); h.lineTo(wx(15), wz(39.5)); h.lineTo(wx(1), wz(39.5)); h.closePath(); cs.holes.push(h);
    }
    const cg = new THREE.ShapeGeometry(cs); cg.rotateX(Math.PI / 2);
    const ceil = new THREE.Group(); ceil.position.y = CEIL[fl.f]; ceil.visible = false; G.add(ceil); fl.ceil = ceil;
    ceil.add(new THREE.Mesh(cg, new THREE.MeshToonMaterial({ color: 0xF1F0F5, gradientMap: gradient, map: grain, side: THREE.DoubleSide })));
    if (fl.f === 13) {
      const screen = fl.furn.find((o) => o.kind === "screenwall" && o.ratio169);
      if (screen) {
        const { height } = startrackScreenSize(screen.h * S - .2, CEIL[13] - .3, screen.wide || 1);
        const rise = Math.max(0, height + .45 - CEIL[13]);
        const roof = new THREE.Mesh(new THREE.PlaneGeometry(14 * S, 29.5 * S), new THREE.MeshToonMaterial({ color: 0xF1F0F5, gradientMap: gradient, map: grain, side: THREE.DoubleSide }));
        roof.rotation.x = Math.PI / 2; roof.position.set(wx(8), rise, wz(24.75)); ceil.add(roof);
        for (const x of [1, 15]) box(ceil, .06, rise, 29.5 * S, 0xF1F0F5, wx(x), 0, wz(24.75), { line: 0, cast: false });
        for (const y of [10, 39.5]) box(ceil, 14 * S, rise, .06, 0xF1F0F5, wx(8), 0, wz(y), { line: 0, cast: false });
      }
    }
    const lamp = new THREE.MeshBasicMaterial({ color: 0xFFFDF2, side: THREE.DoubleSide }), lg = new THREE.PlaneGeometry(.9, .3); lg.rotateX(Math.PI / 2);
    for (let y = 4; y < H - 2; y += 5) for (let x = 4; x < W - 2; x += 6) { if ((fl.f === 13 && x >= 1 && x <= 15 && y >= 10 && y <= 39.5) || up.some((o) => o.kind === "void" && inRect(o, x, y))) continue; const m = new THREE.Mesh(lg, lamp); m.position.set(wx(x), -.02, wz(y)); ceil.add(m); }
  }
  const LG = new THREE.Group(); LG.visible = false; G.add(LG); fl.lamps = LG;   // 천장에 매단 조명: 들어가서 볼 때만
  SEAT_SINK = fl.seats = [];
  fl.furnRoots = new Map();   // 가구마다 그린 것들: 정밀 충돌을 깎을 때 쓴다
  for (const o of fl.furn) { const n0 = G.children.length; if (!o.lift && !o.dz) buildFurn(G, o, fl); else { const g = new THREE.Group(); g.position.set(0, o.lift || 0, (o.dz || 0) * S); G.add(g); buildFurn(g, o, fl); } fl.furnRoots.set(o, G.children.slice(n0)); }   // lift: 단 위에 올린 가구 · dz: 칸에서 남쪽으로 조금 민다(벽에 붙일 때)
  SEAT_SINK = null;
  for (const p of fl.portals) buildPortal(G, p, fl);
  return G;
}
const spinners = [];
// 냉장고: 앞에서 F로 문을 연다(내 화면에서만). 멀어지면 저절로 닫힌다
const FRIDGES: { o: any; f: number; doors: THREE.Group[]; k: number; want: boolean }[] = [];
const fridgeFront = (fr) => { const t = fr.o.turn || 0; return [fr.o.x + fr.o.w / 2 + Math.sin(t) * .85, fr.o.y + fr.o.h / 2 + (fr.o.dz || 0) + Math.cos(t) * .85]; };
function nearFridge() { if (me.lie || me.seat) return null; let best = null, bd = .9; for (const fr of FRIDGES) { if (fr.f !== me.f) continue; const [fx, fy] = fridgeFront(fr), d = Math.hypot(fx - me.x, fy - me.y); if (d < bd) { bd = d; best = fr; } } return best; }
function tickFridges(dt) {
  for (const fr of FRIDGES) {
    if (fr.want) { const [fx, fy] = fridgeFront(fr); if (fr.f !== me.f || Math.hypot(fx - me.x, fy - me.y) > 2.6) fr.want = false; }
    const k0 = fr.k; fr.k = clamp(fr.k + (fr.want ? dt : -dt) * 2.4, 0, 1); if (k0 === fr.k) continue;
    const e = 1 - (1 - fr.k) ** 3; fr.doors[0].rotation.y = -1.85 * e; fr.doors[1].rotation.y = -1.85 * clamp(e * 1.15 - .15, 0, 1);   // 아래 문이 살짝 늦게
  }
}
const BOOKS = ["#0E1E46", "#2F8A62", "#F15B5B", "#111118", "#F5C85C", "#7DB3F0"];
const glassMat = () => toon(C.glass, { opacity: .3 });
// 의자: 방향(rot)에 맞춰 앉는 면 + 등받이
let SEAT_SINK = null;
// 앉는 자리마다 앉는 면 높이(h)와 앞 책상 높이(desk, 없으면 null)를 적는다. 기본 의자는 .26·.44
// 캐릭터는 기본 의자 높이에 맞춰 앉으므로, 더 높은 자리는 그만큼 몸을 올린다
const SEAT_H0 = .26, seatLift = (st) => (st && typeof st === "object" ? Math.max(0, (st.h ?? SEAT_H0) - SEAT_H0) : 0);
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
// 달의 밝은 부분은 판교의 날짜와 위치에 따라 environment.ts에서 그린다.
const moonTex = canvasTex(96, 96, () => {});
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
function screen169(G, len, maxH, bottom, tex, cx, cz, rot, wide = 1, ratio169 = false) {
  const oldH = Math.min(len * 9 / 16, maxH), w = Math.min(len, oldH * 16 / 9 * wide), h = ratio169 ? startrackScreenSize(len, maxH, wide).height : oldH, g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = rot; G.add(g);
  box(g, w + .08, h + .08, .06, C.dark, 0, bottom - .04, -.03, { line: .01 }); board(g, w, h, tex, 0, bottom + h / 2, .005);
  if (bottom > .1) box(g, .12, bottom - .04, .08, C.dark, 0, 0, -.05, { line: 0 });
}
// 하루들 부스: 완성된 네 컷 만화(시드별로 한 번만 그려 둔다)와 뒷벽 현수막
// 부스에 거는 하루들 네 컷(@harudle.official): 갑자기 찾아온 겨울 · 카스테라의 비밀 · 우사기의 우냐냐 댄스 · 날아갈 것 같은 날
// 원본 해상도(960px) 그대로 + 비스듬히 봐도 흐려지지 않게 이방성 필터를 기기 최대로
const MAX_ANISO = Math.max(8, R3F.gl.capabilities.getMaxAnisotropy());
const sharpTex = (u) => { const t = new THREE.TextureLoader().load(u); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; return t; };
const BOOTH_COMICS = [comicWinterUrl, comicCastellaUrl, comicDanceUrl, comicPassUrl].map(sharpTex);
const comicTex = (i) => BOOTH_COMICS[((i % 4) + 4) % 4];
const BOOTH_FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
// 카운터 앞판: 넓은 고해상도 캔버스에 굵은 글씨(흐리지 않게), 양옆에 별
const counterSignTex = (w, h) => canvasTex(2048, Math.round(2048 * h / w), (g, cw, ch) => {
  const gr = g.createLinearGradient(0, 0, cw, 0); gr.addColorStop(0, "#B39DDB"); gr.addColorStop(1, "#9B7FE0"); g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
  g.strokeStyle = "#111118"; g.lineWidth = 16; g.strokeRect(8, 8, cw - 16, ch - 16);
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#FFFFFF"; g.font = `800 ${Math.round(ch * .44)}px ${BOOTH_FONT}`; g.fillText("우리끼리 통하는 네컷만화", cw / 2, ch * .5);
  g.fillStyle = "#FFD43B"; for (const sx of [.06, .94]) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? .45 : 1) * ch * .2; g.lineTo(cw * sx + Math.cos(a) * r, ch * .5 + Math.sin(a) * r); } g.fill(); }
});
// 롤업 배너: 보라 바탕에 Harudle·태그라인, 가운데 네 컷 한 장
const rollupTex = (i) => canvasTex(600, 1950, (g, cw, ch) => {
  const gr = g.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, "#EFE7FB"); gr.addColorStop(1, "#B39DDB"); g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#111118"; g.font = `800 96px ${BOOTH_FONT}`; g.fillText("Harudle", cw / 2, 170);
  g.font = `800 64px ${BOOTH_FONT}`; g.fillText("우리끼리 통하는", cw / 2, 330); g.fillStyle = "#7B5BD6"; g.font = `900 100px ${BOOTH_FONT}`; g.fillText("네컷만화", cw / 2, 450);
  g.fillStyle = "#FFFFFF"; g.fillRect(50, 560, cw - 100, cw - 100); g.fillStyle = "#111118"; g.font = `700 40px ${BOOTH_FONT}`; g.fillText(i ? "#친구와" : "#동료와", cw / 2, 1110);
  g.fillStyle = "#4A3A80"; g.font = `600 44px ${BOOTH_FONT}`; g.fillText("함께 있었던 순간을 적으면", cw / 2, 1300); g.fillText("네컷만화로 만들어 드려요", cw / 2, 1370);
  g.fillStyle = "#111118"; g.font = `800 48px ${BOOTH_FONT}`; g.fillText("harudle.com", cw / 2, 1800);
});
const photoFrameTex = canvasTex(900, 700, (g, cw, ch) => {   // 가운데가 뚫린 보라 틀: 위에 "하루들 네컷", 아래 #오늘의한컷
  g.fillStyle = "#8E6FD8"; g.fillRect(0, 0, cw, ch); g.clearRect(70, 110, cw - 140, ch - 220);
  g.strokeStyle = "#111118"; g.lineWidth = 10; g.strokeRect(5, 5, cw - 10, ch - 10); g.strokeRect(70, 110, cw - 140, ch - 220);
  g.fillStyle = "#FFFFFF"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `800 64px ${BOOTH_FONT}`; g.fillText("하루들 네컷 📸", cw / 2, 58);
  g.fillStyle = "#FFD43B"; g.font = `800 50px ${BOOTH_FONT}`; g.fillText("#오늘의한컷", cw / 2, ch - 55);
});
const boothBannerTex = sharpTex(boothBannerUrl);
// 라이브러리 책장의 개발서: [제목, 책 색, 글자 색]. 책등(세로 글씨)과 표지는 제목마다 한 번만 그려 나눠 쓴다
const DEV_BOOKS: [string, number, string][] = [
  ["클린 코드", 0x2F3B52, "#FFFFFF"], ["리팩터링", 0xE9E4D4, "#B23A2E"], ["오브젝트", 0x1E5B4F, "#FFFFFF"], ["이펙티브 자바", 0xF2F0EA, "#1C3F94"],
  ["객체지향의 사실과 오해", 0xF5C85C, "#2A2A2A"], ["테스트 주도 개발", 0x3C3C3C, "#F5C85C"], ["실용주의 프로그래머", 0xD94F3D, "#FFFFFF"], ["도메인 주도 설계", 0x0E1E46, "#FFD43B"],
  ["토비의 스프링", 0x5B8C3A, "#FFFFFF"], ["모던 자바 인 액션", 0xC8102E, "#FFFFFF"], ["HTTP 완벽 가이드", 0x7A5230, "#FFFFFF"], ["함께 자라기", 0xFFFFFF, "#2F8A62"],
  ["소프트웨어 장인", 0x22252B, "#E8C07A"], ["Real MySQL 8.0", 0x1F5E8C, "#FFFFFF"], ["엘레강트 오브젝트", 0xEDEBE6, "#111118"], ["클린 아키텍처", 0x6E2E7A, "#FFFFFF"],
  ["단위 테스트", 0x2B6CB0, "#FFFFFF"], ["자바 ORM 표준 JPA 프로그래밍", 0x2E7D32, "#FFFFFF"], ["데이터 중심 애플리케이션 설계", 0xB8462F, "#FFFFFF"], ["모던 자바스크립트 Deep Dive", 0xF0DB4F, "#222222"],
  ["이펙티브 타입스크립트", 0x2F74C0, "#FFFFFF"], ["좋은 코드, 나쁜 코드", 0xF7A6A0, "#2A2A2A"], ["읽기 좋은 코드가 좋은 코드다", 0x4A4E69, "#FFFFFF"], ["개발자의 글쓰기", 0xFBF4E6, "#7B5BD6"],
  ["구글 엔지니어는 이렇게 일한다", 0x1A73E8, "#FFFFFF"], ["가상 면접 사례로 배우는 대규모 시스템 설계", 0x111118, "#7FCFAE"], ["코틀린 인 액션", 0x7F52FF, "#FFFFFF"], ["컴퓨터 밑바닥의 비밀", 0x30343F, "#F15B5B"],
  ["만들면서 배우는 클린 아키텍처", 0x0B7285, "#FFFFFF"], ["자바의 정석", 0x8E2B2B, "#F5E6C8"],
  // 소프트 스킬
  ["소프트 스킬", 0xF15B5B, "#FFFFFF"], ["피플웨어", 0x3E7CB1, "#FFFFFF"], ["맨먼스 미신", 0xE8DCC2, "#5A3E2B"], ["프로그래머의 뇌", 0x8E44AD, "#FFFFFF"],
  ["몰입", 0x1D3557, "#F1FAEE"], ["그릿", 0xFF8C42, "#FFFFFF"], ["회복탄력성", 0x7FCFAE, "#1B4332"], ["생각에 관한 생각", 0xFFFFFF, "#C1121F"],
  ["결정적 순간의 대화", 0xFFD43B, "#111118"], ["린 스타트업", 0x2D6A4F, "#FFFFFF"], ["도둑맞은 집중력", 0x111118, "#FFD43B"], ["아주 작은 습관의 힘", 0xF4EFE6, "#D94F3D"],
];
// 원형 서가 맨 아래 칸 보드게임: [이름, 상자 색, 글자 색]
const BOARD_GAMES: [string, number, string][] = [
  ["루미큐브", 0xE63946, "#FFFFFF"], ["할리갈리", 0xFFD43B, "#C1121F"], ["스플렌더", 0x1D3557, "#F1C40F"], ["카탄", 0xD9822B, "#FFFFFF"], ["다빈치 코드", 0x111118, "#FFFFFF"], ["코드네임", 0xB23A48, "#FFFFFF"],
  ["딕싯", 0x6A4C93, "#FFE27A"], ["티켓 투 라이드", 0x2B6CB0, "#FFFFFF"], ["부루마불", 0x2E7D32, "#FFFFFF"], ["젠가", 0xE9C46A, "#5A3E2B"], ["뱅!", 0x8B5A2B, "#FFE27A"], ["우노", 0xF15B5B, "#FFD43B"],
  ["클루", 0x3C3C3C, "#E9C46A"], ["아줄", 0x0B7285, "#FFFFFF"], ["보난자", 0x7FBF5A, "#1B4332"], ["체스", 0xF4EFE6, "#111118"],
];
const BOOK_FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
const coverMats = [];
const bookHex = (k) => "#" + DEV_BOOKS[k][1].toString(16).padStart(6, "0");
// 글씨 아틀라스: 책등 제목(개발서)과 보드게임 상자 이름을 한 장에 한 줄씩. 책장 글씨가 모두 이 재질 하나로 그려진다
const ATLAS_ROW = 56, ATLAS_N = DEV_BOOKS.length + BOARD_GAMES.length;
let atlasMat = null;
const labelAtlas = () => atlasMat || (atlasMat = new THREE.MeshBasicMaterial({ map: canvasTex(320, ATLAS_ROW * ATLAS_N, (g, cw) => {
  const fit = (t, max, w) => { let fs = max; g.font = `800 ${fs}px ${BOOK_FONT}`; while (g.measureText(t).width > w && fs > 12) { fs--; g.font = `800 ${fs}px ${BOOK_FONT}`; } };
  g.textBaseline = "middle";
  DEV_BOOKS.forEach(([t, c, fg], k) => { const y = k * ATLAS_ROW;   // 책등: 긴 쪽으로 제목(책장에서는 90도 돌려 세로로 읽힌다)
    g.fillStyle = bookHex(k); g.fillRect(0, y, cw, ATLAS_ROW); g.fillStyle = fg; g.fillRect(0, y + 4, cw, 3); g.fillRect(0, y + ATLAS_ROW - 7, cw, 3);
    fit(t, 30, cw - 34); g.textAlign = "left"; g.fillText(t, 14, y + ATLAS_ROW / 2 + 1); g.fillRect(cw - 14, y + ATLAS_ROW / 2 - 5, 8, 10); });
  BOARD_GAMES.forEach(([t, c, fg], i) => { const y = (DEV_BOOKS.length + i) * ATLAS_ROW;   // 보드게임 상자 옆면
    g.fillStyle = "#" + c.toString(16).padStart(6, "0"); g.fillRect(0, y, cw, ATLAS_ROW); g.fillStyle = fg; fit(t, 34, cw - 24); g.textAlign = "center"; g.fillText(t, cw / 2, y + ATLAS_ROW / 2 + 1); });
}) }));
// 원형 서가는 책을 한 권씩 세우고 제목마다 따로 그린 재질을 쓴다(아틀라스보다 글씨가 또렷하다)
const spineMats = [], gameMats = [];
const spineMat = (k) => spineMats[k] || (spineMats[k] = new THREE.MeshBasicMaterial({ map: canvasTex(320, 56, (g, cw, ch) => {
  const [t, , fg] = DEV_BOOKS[k]; g.fillStyle = bookHex(k); g.fillRect(0, 0, cw, ch); g.fillStyle = fg; g.fillRect(0, 4, cw, 3); g.fillRect(0, ch - 7, cw, 3);
  let fs = 30; g.font = `800 ${fs}px ${BOOK_FONT}`; while (g.measureText(t).width > cw - 34 && fs > 12) { fs--; g.font = `800 ${fs}px ${BOOK_FONT}`; }
  g.textBaseline = "middle"; g.fillText(t, 14, ch / 2 + 1); g.fillRect(cw - 14, ch / 2 - 5, 8, 10);
}) }));
const gameMat = (k) => gameMats[k] || (gameMats[k] = new THREE.MeshBasicMaterial({ map: canvasTex(256, 48, (g, cw, ch) => {
  const [t, c, fg] = BOARD_GAMES[k]; g.fillStyle = "#" + c.toString(16).padStart(6, "0"); g.fillRect(0, 0, cw, ch); g.fillStyle = fg;
  let fs = 30; g.font = `900 ${fs}px ${BOOK_FONT}`; while (g.measureText(t).width > cw - 20 && fs > 12) { fs--; g.font = `900 ${fs}px ${BOOK_FONT}`; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, cw / 2, ch / 2 + 1);
}) }));
// 책 묶음: 책장 하나의 책·상자는 정점 색 상자 한 메시, 글씨는 아틀라스 한 메시, 먹선 윤곽 한 메시로 모은다(책이 몇 권이든 그리기 세 번)
// 안 보이는 바닥면은 빼고, 그림자는 드리우지 않는다
const bookMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradient, map: grain });
const BOX_FACES = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
function bookBatch() {
  const B = { p: [], n: [], c: [], u: [], i: [] }, L = { p: [], u: [], i: [] }, O = { p: [], i: [] }, col = new THREE.Color();
  // (lx, ly, lz) 상자 안 좌표 → y축으로 r만큼 돌려 (cx, cy, cz)에 놓는다
  const put = (arr, cx, cy, cz, r, lx, ly, lz) => { const c = Math.cos(r), sn = Math.sin(r); arr.push(cx + lx * c + lz * sn, cy + ly, cz - lx * sn + lz * c); };
  const quads = (G, n) => { const b = G.p.length / 3 - 4 * n; for (let q = 0; q < n; q++) { const o = b + q * 4; G.i.push(o, o + 1, o + 2, o, o + 2, o + 3); } };
  return {
    // 바닥 가운데 (cx, y0, cz), 크기 w(돌린 뒤 접선)·h·d(앞뒤), y축 회전 r
    box(cx, y0, cz, w, h, d, r, color, line = .006) {
      col.set(color); const c = Math.cos(r), sn = Math.sin(r);
      for (const [N, U, V] of BOX_FACES) {
        for (const [S, hw, hh, hd] of [[B, w / 2, h / 2, d / 2], ...(line ? [[O, w / 2 + line, h / 2 + line, d / 2 + line]] : [])] as any) {
          for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const lx = (N[0] + a * U[0] + bb * V[0]) * hw, ly = (N[1] + a * U[1] + bb * V[1]) * hh, lz = (N[2] + a * U[2] + bb * V[2]) * hd;
            put(S.p, cx, y0 + h / 2, cz, r, lx, ly, lz);
            if (S === B) { B.n.push(N[0] * c + N[2] * sn, N[1], -N[0] * sn + N[2] * c); B.c.push(col.r, col.g, col.b); B.u.push((a + 1) / 2, (bb + 1) / 2); }
          }
          quads(S, 1);
        }
      }
    },
    // 글씨 판: 상자 앞면(안쪽 좌표 z = zf) 위 반폭 ht·반높이 hh. vertical이면 제목이 위에서 아래로 읽힌다. row: 아틀라스 줄
    label(cx, cy, cz, r, zf, ht, hh, row, vertical) {
      const v0 = 1 - (row + 1) / ATLAS_N;
      for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        put(L.p, cx, cy, cz, r, a * ht, bb * hh, zf);
        if (vertical) L.u.push((1 - bb) / 2, v0 + (a + 1) / 2 / ATLAS_N); else L.u.push((a + 1) / 2, v0 + (bb + 1) / 2 / ATLAS_N);
      }
      quads(L, 1);
    },
    // 다 모았으면 parent에 메시 셋으로 붙인다(정적 묶기에서 다시 합치지 않는다)
    flush(parent) {
      const mk = (S, mat, attrs) => { if (!S.i.length) return; const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(S.p, 3));
        for (const [k, arr, n] of attrs) g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n)); g.setIndex(S.i); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = mat === bookMat; m.userData.noMerge = true; parent.add(m); };
      mk(B, bookMat, [["normal", B.n, 3], ["color", B.c, 3], ["uv", B.u, 2]]); mk(L, labelAtlas(), [["uv", L.u, 2]]); mk(O, inkMat, []);
    },
  };
}
// 표지: 위에 제목(줄바꿈), 가운데 굵은 띠, 아래 작은 무늬
const coverMat = (k) => coverMats[k] || (coverMats[k] = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: canvasTex(200, 284, (g, cw, ch) => {
  const [t, , fg] = DEV_BOOKS[k]; g.fillStyle = bookHex(k); g.fillRect(0, 0, cw, ch); g.fillStyle = fg; g.globalAlpha = .18; g.fillRect(0, ch * .58, cw, ch * .14); g.beginPath(); g.arc(cw * .72, ch * .84, 34, 0, 7); g.fill(); g.globalAlpha = 1;
  g.font = `800 28px ${BOOK_FONT}`; g.textBaseline = "top"; const lines = []; let cur = "";
  for (const wd of t.split(" ")) { const nx = cur ? cur + " " + wd : wd; if (g.measureText(nx).width > cw - 32 && cur) { lines.push(cur); cur = wd; } else cur = nx; } lines.push(cur);
  lines.forEach((l, i) => g.fillText(l, 16, 22 + i * 34)); g.fillRect(16, 26 + lines.length * 34, 40, 4);
}) }));
// 남쪽을 보게 만든 14층 월드 벽(showwall·relayscroll)을 face e/w면 돌려 세운다: 칸 가운데에 돌린 묶음을 두고 그 안에서는 길이·두께를 바꿔 쓴다
function facing(G, o, x, z, w, d) {
  if (o.face !== "e" && o.face !== "w") return [G, x, z, w, d];
  const P = new THREE.Group(); P.position.set(x, 0, z); P.rotation.y = o.face === "e" ? Math.PI / 2 : -Math.PI / 2; G.add(P);
  return [P, 0, 0, d, w];
}
// 퀴즈 아케이드 네온 간판: 번진 색 글자 위에 흰 글자(월드 NeonSign처럼)
function neonTex(text, color) {
  return canvasTex(768, 128, (g, w, h) => {
    let size = 78; g.font = `800 ${size}px ${HAND}`; while (size > 20 && g.measureText(text).width > w * .88) { size -= 2; g.font = `800 ${size}px ${HAND}`; }
    g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = color; g.fillStyle = color;
    for (const blur of [30, 16]) { g.shadowBlur = blur; g.fillText(text, w / 2, h / 2); }
    g.shadowBlur = 5; g.fillStyle = "#FFFFFF"; g.fillText(text, w / 2, h / 2);
  });
}
function neon(parent, text, color, w, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 6), new THREE.MeshBasicMaterial({ map: neonTex(text, color), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.position.set(x, y, z); m.userData.noMerge = true; parent.add(m); return m;
}
// 퀴즈 아케이드 전구 간판: 둥근 파스텔 판에 흰 글씨(진한 테두리), 가장자리를 따라 전구가 붙는다
function marqueeTex(text, bg) {
  return canvasTex(1024, 204, (g, w, h) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 60); g.fill();
    g.strokeStyle = "#FFFFFF"; g.lineWidth = 6; g.setLineDash([18, 14]); g.beginPath(); g.roundRect(30, 30, w - 60, h - 60, 40); g.stroke(); g.setLineDash([]);
    let size = 96; g.font = `800 ${size}px ${HAND}`; while (size > 24 && g.measureText(text).width > w * .8) { size -= 2; g.font = `800 ${size}px ${HAND}`; }
    g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round"; g.lineWidth = 14; g.strokeStyle = "#2B2140"; g.strokeText(text, w / 2, h / 2 + 4); g.fillStyle = "#FFFFFF"; g.fillText(text, w / 2, h / 2 + 4);
  });
}
// 투명 바탕에 기호 하나(떠다니는 음표·별)
const glyphTex = (ch, color) => canvasTex(128, 128, (g, w, h) => { g.font = `800 104px ${HAND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round"; g.lineWidth = 10; g.strokeStyle = "#FFFFFF"; g.strokeText(ch, w / 2, h / 2); g.fillStyle = color; g.fillText(ch, w / 2, h / 2); });
const glyph = (parent, ch, color, size, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glyphTex(ch, color), transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.position.set(x, y, z); m.userData.noMerge = true; parent.add(m); return m; };
const jukeboxTex = canvasTex(256, 320, (g, w, h) => {
  const cols = ["#FF9EB5", "#FFD97A", "#9FE0C2", "#9CC8F5", "#C9B8F0"]; g.fillStyle = "#FFF6EC"; g.fillRect(0, 0, w, h);
  cols.forEach((c, i) => { g.strokeStyle = c; g.lineWidth = 16; g.beginPath(); g.arc(w / 2, h * .42, 100 - i * 18, Math.PI, 0); g.stroke(); });
  g.fillStyle = "#2B2140"; g.font = `800 64px ${HAND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("♪", w / 2, h * .36);
  g.fillStyle = "#7355DA"; g.fillRect(w * .16, h * .55, w * .68, h * .2); g.fillStyle = "#FFFFFF"; g.font = `700 30px ${HAND}`; g.fillText("오늘의 노래", w / 2, h * .65);
  g.fillStyle = "#2B2140"; for (let i = 0; i < 5; i++) g.fillRect(w * .2, h * .8 + i * 12, w * .6, 5);
});
const popcornTex = canvasTex(256, 256, (g, w, h) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#FFFFFF" : "#FF8FA8"; g.fillRect(i * w / 8, 0, w / 8, h); }
  g.fillStyle = "#FFD97A"; g.beginPath(); g.roundRect(w * .12, h * .34, w * .76, h * .32, 24); g.fill(); g.strokeStyle = "#2B2140"; g.lineWidth = 6; g.stroke();
  g.fillStyle = "#2B2140"; g.font = `800 50px ${HAND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("팝콘", w / 2, h / 2 + 2);
});
const clapperTex = canvasTex(256, 220, (g, w, h) => {
  g.fillStyle = "#2B2140"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? "#2B2140" : "#FFFFFF"; g.beginPath(); g.moveTo(i * 48, 0); g.lineTo(i * 48 + 40, 0); g.lineTo(i * 48 + 24, 46); g.lineTo(i * 48 - 16, 46); g.fill(); }
  g.fillStyle = "#FFFFFF"; g.font = `700 30px ${HAND}`; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText("SCENE 1", 18, 90); g.fillText("TAKE 4", 18, 130); g.fillStyle = "#9CC8F5"; g.fillText("하루들 극장", 18, 175);
});
function buildFurn(G, o, fl) {
  if (o.bench === "w" && !o.shifted) { // 벤치에 붙인 테이블: 앉을 다리 자리만큼 동쪽으로 살짝 띄워 그린다(앉는 자리도 같이 옮긴다)
    const g = new THREE.Group(); g.position.x = .35; G.add(g); const n0 = SEAT_SINK ? SEAT_SINK.length : 0;
    buildFurn(g, { ...o, shifted: true }, fl);
    if (SEAT_SINK) for (let i = n0; i < SEAT_SINK.length; i++) SEAT_SINK[i].x += .35 / S;
    return;
  }
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
    case "screen": case "tv": { // 강의실 큰 화면(screen)·회의실 TV(tv). 가로로 놓이면 북쪽 벽에서 남쪽을(face "n"이면 남쪽 벽에서 북쪽을), 세로면 face 쪽을 본다
      const big = o.kind === "screen", maxH = o.big ? CEIL[fl.f] - .3 : big ? 1.6 : .8, bottom = o.big ? .15 : big ? .55 : .4, tex = big ? slideTex : screenTex;   // o.big: 스타트랙 화면처럼 천장 바로 아래까지
      if (horiz) { if (o.face === "n") screen169(G, w * .9, maxH, bottom, tex, x, wz(o.y + o.h) - .15, Math.PI); else screen169(G, w * .9, maxH, bottom, tex, x, wz(o.y) + .15, 0); }
      else { const f = o.face === "w" ? -1 : 1; screen169(G, d * .9, maxH, bottom, tex, f > 0 ? wx(o.x) + .15 : wx(o.x + o.w) - .15, z, f * Math.PI / 2); }
      break; }
    case "screenwall": // 스타트랙 발표 화면: 16:9 큰 화면
      if (o.face === "w") screen169(G, d - .2, o.big ? CEIL[fl.f] - .3 : 2.2, o.big ? .15 : .45, o.ratio169 ? tekoTex : o.wide ? tekoWideTex : tekoTex, wx(o.x + o.w) - .1, z, -Math.PI / 2, o.wide || 1, !!o.ratio169);
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
    case "solodesk": { // 1인 책상: 한 칸 안에 책상(face 쪽 절반)과 의자. 앉으면 face 쪽 모니터를 본다
      const f = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] }[o.face || "s"], rot = Math.atan2(f[0], f[1]), across = f[0] ? [.55, S - .2] : [S - .2, .55];
      box(G, across[0], .44, across[1], C.white, x + f[0] * .3, 0, z + f[1] * .3);
      monitor(G, x + f[0] * .42, .44, z + f[1] * .42, rot + Math.PI); chair(G, x - f[0] * .22, z - f[1] * .22, rot); break; }
    case "booth": box(G, w - .08, 1.25, d - .1, 0xB0B256, x, 0, z, { mat: toon(0xB0B256, { opacity: .45 }), line: .015, cast: false }); box(G, w - .08, .06, d - .1, C.white, x, 1.25, z); box(G, w * .5, .4, d * .3, C.wood, x, 0, z - d * .2, { line: .01 }); chair(G, x, z + d * .1, Math.PI, 0x6E7A3A); break;
    case "mtable": box(G, w - .1, .44, d - .2, C.white, x, 0, z);
      if (horiz || o.horiz) for (let i = 0; i < o.w; i++) { chair(G, wx(o.x + i + .5), wz(o.y) - .12, 0); chair(G, wx(o.x + i + .5), wz(o.y + o.h) + .12, Math.PI); }
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
    case "fridge": { // 2도어 냉장고(앞 +z): 위 냉동칸·아래 냉장칸. 속이 비어 있어 문을 열면 하얀 안쪽에 선반·음식이 보인다. 문은 왼쪽 경첩, 앞에서 F로 연다
      const FW = .62, FD = .58, FH2 = o.tall ? 1.8 : 1.6, fz = Math.round(FH2 * .64 * 100) / 100, body = 0xE9ECF2, t = .03, bz = z - .04, front = bz + FD / 2;
      const lin = new THREE.MeshBasicMaterial({ color: 0xF4F8FC }), inner = FW - 2 * t;
      box(G, FW, FH2, t, body, x, 0, bz - FD / 2 + t / 2); for (const s2 of [-1, 1]) box(G, t, FH2, FD, body, x + s2 * (FW / 2 - t / 2), 0, bz);
      box(G, FW, t, FD, body, x, FH2 - t, bz); box(G, FW, .08, FD, 0xB9BDC4, x, 0, bz); box(G, inner, .03, FD - t, body, x, fz, bz + t / 2);   // 위·아래 걸레받이·칸 나눔
      box(G, inner - .01, FH2 - .14, .01, 0xF4F8FC, x, .09, bz - FD / 2 + t + .006, { mat: lin, line: 0, cast: false });   // 안쪽 벽(불 켜진 듯 하얗게)
      for (const sy of [.44, .78]) box(G, inner - .02, .012, FD - .12, C.glass, x, sy, bz - .03, { mat: lin, line: 0, cast: false });   // 냉장칸 선반 둘(안쪽과 같은 하얀 판)
      box(G, inner - .02, .012, FD - .12, C.glass, x, fz + (FH2 - fz) / 2, bz - .03, { mat: lin, line: 0, cast: false });   // 냉동칸 선반
      // 음식: 맨 아래 채소 칸, 첫 선반 우유·주스·달걀, 둘째 선반 사과·캔, 냉동칸 아이스크림·얼음 통
      const iz = bz - .06;
      box(G, inner - .04, .15, FD - .18, 0xDDF0E4, x, .08, iz, { line: .005, cast: false }); ball(G, .06, 0x7CC36E, x - .1, .27, iz, { line: .004 }); ball(G, .05, 0xF2913D, x + .08, .26, iz + .04, { line: .004 });
      box(G, .08, .17, .08, 0xFFFFFF, x - .17, .45, iz, { line: .005 }); box(G, .081, .04, .081, 0x7DB3F0, x - .17, .58, iz, { line: 0 });   // 우유팩
      cyl(G, .035, .04, .2, 0xF7A23B, x - .05, .45, iz + .02, { line: .005 }); box(G, .16, .03, .1, 0xE8D9B8, x + .12, .45, iz, { line: .004 });
      for (let k = 0; k < 6; k++) ball(G, .018, 0xFFF6E4, x + .06 + (k % 3) * .055, .49, iz - .025 + Math.floor(k / 3) * .05, { line: .002 });   // 달걀
      ball(G, .045, 0xE04A3F, x - .14, .835, iz + .02, { line: .004 }); ball(G, .045, 0xE95B4C, x - .06, .835, iz - .03, { line: .004 });
      for (let k = 0; k < 3; k++) cyl(G, .028, .028, .1, [0xD9342B, 0x7FCFAE, 0xFFD43B][k], x + .05 + k * .065, .79, iz, { line: .004 });
      cyl(G, .07, .065, .1, 0xF7B6C8, x - .1, fz + .03, iz, { line: .005 }); box(G, .17, .07, .12, 0xBFD9F0, x + .1, fz + .03, iz, { line: .005 });
      const door = (y0, hh, handleY) => {   // 경첩(왼쪽 앞 모서리)이 원점인 문: 바깥 판 + 손잡이 + 안쪽 문 칸
        const g = new THREE.Group(); g.position.set(x - FW / 2, y0, front); g.userData.noMerge = true; G.add(g);
        box(g, FW, hh, .05, body, FW / 2, 0, .025, { line: .008 }); box(g, .025, Math.min(.36, hh * .5), .03, 0xB9BDC4, FW - .07, handleY, .07, { line: .004 });
        box(g, FW - .12, .04, .07, 0xF4F8FC, FW / 2, hh * .35, -.035, { line: .004, cast: false }); for (let k = 0; k < 3; k++) cyl(g, .022, .022, .12, [0x2F8A62, 0xFFFFFF, 0x7DB3F0][k], .17 + k * .14, hh * .35 + .04, -.035, { line: .003 });
        return g; };
      const lo = door(.08, fz - .08 - .008, (fz - .08) * .62), up = door(fz + .008, FH2 - fz - .008, .06);
      box(up, .12, .05, .006, 0x1C2B55, FW * .5, (FH2 - fz) * .55, .052, { line: 0, cast: false });   // 위 문의 작은 온도 표시창
      FRIDGES.push({ o, f: fl.f, doors: [up, lo], k: 0, want: false });
      break; }
    case "vending": box(G, .54, 1.55, .5, 0xF15B5B, x, 0, z); box(G, .38, .9, .02, C.glass, x - .04, .5, z + .26, { mat: glassMat(), line: .005, cast: false });
      for (let r2 = 0; r2 < 3; r2++) for (let c = 0; c < 3; c++) cyl(G, .035, .035, .14, [0xFFD43B, 0x7FCFAE, 0x7DB3F0][c], x - .16 + c * .12, .55 + r2 * .3, z + .18, { line: .005 }); break;
    case "bigtable": case "table": box(G, w - .12, .44, d - .12, C.wood, x, 0, z);
      if (horiz) { const n = o.kind === "bigtable" ? o.w : Math.max(1, Math.round(w / 1.2)); for (let k = 0; k < n; k++) for (const s of [-1, 1]) chair(G, wx(o.x) + (k + .5) * w / n, z + s * (d / 2 + .02), s < 0 ? 0 : Math.PI, o.kind === "bigtable" ? 0xFFD43B : C.white);
        for (let k = 0; k < n; k += (o.kind === "bigtable" ? 2 : 1)) cyl(G, .04, .035, .09, k % 2 ? 0x7DB3F0 : C.white, wx(o.x) + (k + .5) * w / n, .44, z + (k % 4 ? .1 : -.1), { line: .006 }); }
      else { const n = o.kind === "bigtable" ? o.h : Math.max(1, Math.round(d / 1.2)); for (let k = 0; k < n; k++) for (const s of [-1, 1]) if (!(o.bench === "w" && s < 0)) chair(G, x + s * (w / 2 + .02), wz(o.y) + (k + .5) * d / n, s < 0 ? Math.PI / 2 : -Math.PI / 2, o.kind === "bigtable" ? 0xFFD43B : C.white);   // 세로로 놓인 테이블: 양옆에 의자(bench: "w"면 서쪽은 벤치가 대신한다)
        for (let k = 0; k < n; k += (o.kind === "bigtable" ? 2 : 1)) cyl(G, .04, .035, .09, k % 2 ? 0x7DB3F0 : C.white, x + (k % 4 ? .1 : -.1), .44, wz(o.y) + (k + .5) * d / n, { line: .006 }); }
      break;
    case "pebbles": { // 창가 띠: 이끼 깔린 흙에 넓적한 디딤돌, 창 쪽엔 작은 나무와 풀이 우거진다
      if (o.flush) { // 창(북쪽 유리)까지 빈틈없이 깐다. 나무는 없이 풀과 디딤돌만
        const z0 = wz(.5) + .02, z1 = wz(o.y + o.h), rr = rng(o.x * 17 + o.y * 3);
        box(G, w, .03, z1 - z0, 0x6F8F4F, x, 0, (z0 + z1) / 2, { line: 0, cast: false });
        for (let i = 0; i < o.w * 1.6; i++) { const st = box(G, .5 + rr() * .25, .04, .38 + rr() * .2, [0xA8A6A0, 0x9A9890, 0xB6B3AB][i % 3], wx(o.x) + (i + .3 + rr() * .4) / 1.6 * S, .02, z0 + (z1 - z0) * (.5 + rr() * .3), { line: .006, cast: false }); st.rotation.y = (rr() - .5) * .8; }
        for (let i = 0; i < o.w * o.h * 2; i++) { const px = wx(o.x) + rr() * w, pz = z0 + rr() * (z1 - z0);
          for (let j = 0; j < 5; j++) { const bl = solidMesh(new THREE.ConeGeometry(.025, .16 + rr() * .14, 4), j % 2 ? 0x5DB075 : 0x7FBF5A, { line: 0, cast: false }); bl.position.set(px + (rr() - .5) * .12, .1, pz + (rr() - .5) * .12); bl.rotation.set((rr() - .5) * .7, 0, (rr() - .5) * .7); G.add(bl); } }
        break; }
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
      // beside: 테이블은 창(북쪽 유리)에 딱 붙이고, 의자는 띠를 따라 테이블 동쪽 옆에 놓고 테이블(서쪽)을 본다
      const chrome = 0xC9CDD3, tz = o.beside ? wz(.5) + .38 : wz(o.y + o.h) - .4, tx = o.beside ? wx(o.x) + .94 : x;
      if (o.beside) chair(G, wx(o.x) + 1.5, tz, -Math.PI / 2); else chair(G, x, wz(o.y) + .45, 0);
      box(G, .62, .035, .62, C.white, tx, .46, tz, { line: .01 }); cyl(G, .03, .03, .46, chrome, tx, 0, tz, { line: 0 });
      for (let k = 0; k < 4; k++) { const leg = box(G, .36, .025, .04, chrome, tx, 0, tz, { line: 0 }); leg.rotation.y = k * Math.PI / 2 + Math.PI / 4; leg.translateX(.16); }
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
      if (SEAT_SINK) for (let i = 0; i < o.h; i += 2) SEAT_SINK.push({ x: tX(sx), y: o.y + i + .5, yaw: Math.PI / 2, h: .3, desk: null });   // 벤치에 걸터앉아 복도를 본다
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
    case "tower": { // 원형 서가: 가운데가 빈 고리 모양 책장. 북쪽(창가 쪽)이 트여 안으로 걸어 들어간다. 안팎 양면에 하드·소프트 스킬 책을 여유 있게, 맨 아래 칸엔 보드게임
      const R = w / 2 - .1, T = .5, Ri = R - T, step = .4, n = o.tall ? Math.floor((FH + CEIL[13]) / step) : 3, gap = .32, wood = C.gray;   // tall: 12층 바닥부터 13층 천장까지 · gap: 입구 반각(라디안)
      const p0 = Math.PI + gap, pl = Math.PI * 2 - gap * 2, rr = rng(o.x * 13), along = (r, phi) => [x + Math.sin(phi) * r, z + Math.cos(phi) * r];
      // 판 모양은 높이 0에서 만들고 위치로 올린다: 먹선 윤곽은 모양을 원점 기준으로 키우므로, 높이를 모양에 넣으면 윤곽이 위로 떠서 책 사이에 검은 줄이 생겼다
      const ring = (y0, hh) => { const pr = [new THREE.Vector2(Ri, 0), new THREE.Vector2(R, 0), new THREE.Vector2(R, hh), new THREE.Vector2(Ri, hh), new THREE.Vector2(Ri, 0)];
        const m = solidMesh(new THREE.LatheGeometry(pr, 40, p0, pl), wood, { line: .008, cast: false }); m.position.set(x, y0, z); G.add(m); };
      for (let k = 0; k <= n; k++) ring(k * step, .05);
      for (const phi of [p0, p0 + pl]) { const [px, pz] = along(Ri + T / 2, phi); box(G, .05, n * step + .05, T, wood, px, 0, pz, { line: .008 }).rotation.y = phi; }   // 입구 양옆 마구리
      for (let k = 0; k < n; k++) for (const out of [1, -1]) {
        const y0 = k * step + .05, rf = out > 0 ? R : Ri, readable = k < 6;   // 손 닿는 높이까지만 책등에 제목을 쓴다
        if (k === 0) { // 보드게임: 납작한 상자를 2~4개씩 쌓은 더미, 옆면에 이름
          for (let phi = p0 + .06; phi < p0 + pl - .1;) { const gw = .3 + rr() * .08, dphi = gw / rf;
            const [px, pz] = along(rf - out * .2, phi + dphi / 2); let y = y0;
            for (let j = 0, m = 2 + Math.floor(rr() * 3); j < m; j++) { const gi = Math.floor(rr() * BOARD_GAMES.length), gh = .06 + rr() * .035;
              box(G, gw - j * .02, gh, .3 - j * .02, BOARD_GAMES[gi][1], px, y, pz, { line: .006 }).rotation.y = phi + dphi / 2;
              const lb = new THREE.Mesh(new THREE.PlaneGeometry(gw - j * .02 - .02, gh * .8), gameMat(gi)); const [lx, lz] = along(rf - out * (.05 + j * .01) + out * .002, phi + dphi / 2);
              lb.position.set(lx, y + gh / 2, lz); lb.rotation.y = phi + dphi / 2 + (out > 0 ? 0 : Math.PI); G.add(lb); y += gh; }
            phi += dphi + (.08 + rr() * .2) / rf; }
          continue; }
        for (let phi = p0 + .05 + rr() * .1; phi < p0 + pl - .08;) { // 3~6권씩 무리 짓고 사이를 넉넉히 비운다
          for (let j = 0, m = 3 + Math.floor(rr() * 4); j < m && phi < p0 + pl - .08; j++) {
            const kb = Math.floor(rr() * DEV_BOOKS.length), bw = .045 + rr() * .04, bh = .22 + rr() * .1, bd = .17 + rr() * .04, dphi = (bw + .004) / rf;
            const [px, pz] = along(rf - out * (.02 + bd / 2), phi + dphi / 2);
            box(G, bw, bh, bd, DEV_BOOKS[kb][1], px, y0, pz, { line: readable ? .006 : 0 }).rotation.y = phi + dphi / 2;
            if (readable) { const sp = new THREE.Mesh(new THREE.PlaneGeometry(bh * .94, bw * .86), spineMat(kb)), [sx, sz] = along(rf - out * .018, phi + dphi / 2);
              sp.position.set(sx, y0 + bh / 2, sz); sp.rotation.set(0, phi + dphi / 2 + (out > 0 ? 0 : Math.PI), -Math.PI / 2); G.add(sp); }
            phi += dphi; }
          phi += (.45 + rr() * .6) / rf; }
      }
      break; }
    case "shelf": { // 라이브러리 양면 책장: 뒤판 없이 앞뒤로 트여 양쪽에서 책등이 보인다. 세 칸, 2칸마다 칸막이, 실제 개발서 제목. 군데군데 표지를 앞으로 세워 둔다
      const g = new THREE.Group(); g.position.set(x, 0, z); if (!horiz) g.rotation.y = Math.PI / 2; G.add(g);
      const L = (horiz ? w : d) - .06, D = .56, Hs = 1.5, wood = 0xF4EFE6, rr = rng(o.x * 7 + o.y), lv = [.07, .55, 1.03], bays = Math.max(1, Math.round(L / (2 * S)));
      box(g, L, .07, D, wood, 0, 0, 0, { line: .01 }); box(g, L, .035, D, wood, 0, Hs - .035, 0, { line: .01 });
      for (const y of lv.slice(1)) box(g, L, .03, D, wood, 0, y - .03, 0, { line: .008 });
      for (let i = 0; i <= bays; i++) box(g, .04, Hs, D, wood, -L / 2 + .02 + i * (L - .04) / bays, 0, 0, { line: .01 });
      const bw0 = (L - .04) / bays, bb = bookBatch();
      for (const side of [1, -1]) for (const y0 of lv) for (let b = 0; b < bays; b++) {
        let at = -L / 2 + .04 + b * bw0 + .02 + rr() * .05, run = 3 + Math.floor(rr() * 5); const end = -L / 2 + .02 + (b + 1) * bw0 - .03;   // 3~7권씩 꽂고 사이를 비운다
        const face = rr() < .45 ? at + .25 + rr() * (bw0 - .7) : null;   // 표지가 보이게 세운 책 자리
        while (at < end) {
          if (face !== null && at >= face && at < face + .22) { const k = Math.floor(rr() * DEV_BOOKS.length), bh = .27, bw = .19;
            const c = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), coverMat(k)); c.position.set(at + bw / 2, y0 + .02 + bh / 2, side * (D / 2 - .06)); c.rotation.set(side * -.12, side > 0 ? 0 : Math.PI, 0); g.add(c);
            box(g, bw, bh, .025, DEV_BOOKS[k][1], at + bw / 2, y0 + .01, side * (D / 2 - .085), { line: .006 }).rotation.x = side * -.12;
            at += bw + .03; continue; }
          const k = Math.floor(rr() * DEV_BOOKS.length), bw = .045 + rr() * .045, bh = .22 + rr() * .1, bd = .17 + rr() * .05;
          if (at + bw > end) break;
          const bz = side * (D / 2 - .02 - bd / 2), turn = side > 0 ? 0 : Math.PI;
          bb.box(at + bw / 2, y0, bz, bw, bh, bd, turn, DEV_BOOKS[k][1]); bb.label(at + bw / 2, y0 + bh / 2, bz, turn, bd / 2 + .002, bw * .43, bh * .47, k, true);
          at += bw + .004; if (--run <= 0) { at += .18 + rr() * .3; run = 3 + Math.floor(rr() * 5); }
        }
      }
      bb.flush(g); break; }
    case "redsteps": box(G, w, .1, d, C.red, x, 0, z, { line: .015 }); box(G, w, .1, d / 2, C.red, x, .1, wz(o.y + .5), { line: .015 }); break;
    case "stadium": { // 스테인리스 벽 + 나무 상판 + 안쪽 벤치: 서쪽 끝은 반원, 북쪽 곧은 변, 동쪽 끝은 북→동 4분원(남쪽은 트임)
      const R = o.r * S, ax = wx(o.a), bx = wx(o.b), cz = wz(o.cy);
      for (const [r0, r1, y0, hh, col] of [[R - .12, R, 0, .9, 0xA9ADB3], [R - .22, R + .02, .9, .04, 0xD9B98A], [R - .7, R - .12, 0, .42, 0xD9B98A]]) {
        const pr = [new THREE.Vector2(r0, 0), new THREE.Vector2(r1, 0), new THREE.Vector2(r1, hh), new THREE.Vector2(r0, hh), new THREE.Vector2(r0, 0)];   // 바닥에서 만들어 올린다(먹선이 위로 뜨지 않게)
        for (const [px, a0, len] of [[ax, Math.PI, Math.PI], [bx, Math.PI / 2, Math.PI / 2]]) { const m = solidMesh(new THREE.LatheGeometry(pr, 32, a0, len), col, { line: .01, cast: false }); m.position.set(px, y0, cz); G.add(m); }
        box(G, bx - ax, hh, r1 - r0, col, (ax + bx) / 2, y0, cz - (r0 + r1) / 2, { line: .01, cast: false });
      }
      break; }
    case "booth4": { // 벽돌 벽에 움푹 들어간 4인 부스: 뒤·양옆 벽돌, 양옆에 마주 보는 초록 패브릭 소파, 가운데 소파와 나란한 스테인리스 테이블
      const zb = wz(o.y), bh = 1.6, dd = 2 * S, zf = wz(o.y + o.h) - .07;
      box(G, w, bh, .14, 0xB4573F, x, 0, zb + .07, { mat: brickMat(w), line: .01 });
      for (const s of [-1, 1]) box(G, .14, bh, d, 0xB4573F, x + s * (w / 2 - .07), 0, z, { mat: brickMat(d), line: .01 });
      box(G, w, .3, .14, 0xB4573F, x, bh, zf, { mat: brickMat(w, false), line: .01 });   // 앞쪽 위 벽돌 인방
      if (fl.ceil) { // 들어가서 볼 때는 뒤·옆 벽과 앞 인방 위를 천장까지 벽돌로 잇는다(천장 묶음이라 위에서 볼 땐 숨는다)
        const up = CEIL[fl.f] - bh;
        box(fl.ceil, w, up, .14, 0xB4573F, x, -up, zb + .07, { mat: brickMat(w), line: .01 }); box(fl.ceil, w, up, .14, 0xB4573F, x, -up, zf, { mat: brickMat(w), line: .01 });
        for (const s of [-1, 1]) box(fl.ceil, .14, up, d, 0xB4573F, x + s * (w / 2 - .07), -up, z, { mat: brickMat(d), line: .01 });
      }
      const soft = (sw, sh, sd, col, sx, sy, sz) => { const m = solidMesh(new RoundedBoxGeometry(sw, sh, sd, 3, Math.min(sw, sh, sd) * .35), col, { line: .008 }); m.position.set(sx, sy + sh / 2, sz); G.add(m); };   // 푹신한 쿠션
      for (const s of [-1, 1]) { const bx = x + s * (w / 2 - .14 - S / 2), zc = zb + dd / 2 + .07;
        box(G, S - .1, .18, dd - .1, 0x6F7B52, bx, 0, zc, { line: .01 });   // 소파 받침
        for (const k of [-1, 1]) soft(S - .3, .24, dd / 2 - .14, 0x8E9A6E, bx - s * .06, .16, zc + k * (dd / 4 - .02));   // 앉는 쿠션 둘(한 사람에 하나)
        soft(.24, .62, dd - .16, 0x839063, bx + s * (S / 2 - .2), .2, zc);   // 벽에 기댄 등 쿠션
        soft(S - .14, .34, .18, 0x7C8A5E, bx, .16, zc + (dd / 2 - .12));   // 앞쪽 팔걸이
        if (SEAT_SINK) for (let i = 0; i < 2; i++) SEAT_SINK.push({ x: tX(bx), y: o.y + i + .5, yaw: s < 0 ? Math.PI / 2 : -Math.PI / 2, h: .42, desk: .47 }); }
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
        if (SEAT_SINK) SEAT_SINK.push({ x: tX(sx), y: o.y + 1.2, yaw: Math.PI, h: .6, desk: .77 }); }
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
      if (SEAT_SINK) SEAT_SINK.push({ x: o.x + .5, y: o.y + .55, yaw: 0, h: .36, desk: null });
      break; }
    case "highbar": { // 창가 긴 나무 하이 카운터: 검은 다리, 앞에 높은 검은 의자
      box(G, w - .1, .05, d - .5, C.wood, x, .78, z + .15, { line: .01 });
      for (let i = 0; i <= o.w; i += 4) box(G, .04, .78, .04, C.dark, wx(o.x) + .1 + Math.min(i, o.w - .2) * S, 0, z + .15, { line: 0 });
      for (let i = 0; i < o.w; i += 2) { const sx = wx(o.x + i + .5), sz = wz(o.y) - .05;
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(G, .025, .6, .025, C.dark, sx + a * .12, 0, sz + b * .12, { line: 0 });
        box(G, .32, .04, .3, 0x26262B, sx, .6, sz, { line: .006 }); box(G, .32, .3, .04, 0x26262B, sx, .64, sz - .15, { line: .006 });
        if (SEAT_SINK) SEAT_SINK.push({ x: o.x + i + .5, y: o.y - .1, yaw: 0, h: .64, desk: .83 }); }
      break; }
    case "brickbench": { // 세로로 쭉 이어진 벽돌 벤치: 붉은 벽돌 몸통에 나무 앉는 판, 동쪽을 보고 앉는다
      box(G, w - .15, .4, d - .06, 0xB4573F, x, 0, z, { mat: brickMat(d, false), line: .01 });
      box(G, w - .1, .05, d - .02, C.woodD, x, .4, z, { line: .008 });
      if (SEAT_SINK) for (let i = 0; i < o.h; i++) SEAT_SINK.push({ x: o.x + .55, y: o.y + i + .5, yaw: Math.PI / 2, h: .45, desk: null });
      break; }
    case "brickwall": box(G, w, 1.9, .14, 0xB4573F, x, 0, wz(o.y) + .07, { mat: brickMat(w), line: .01 });
      if (fl.ceil) { const up = CEIL[fl.f] - 1.9; box(fl.ceil, w, up, .14, 0xB4573F, x, -up, wz(o.y) + .07, { mat: brickMat(w), line: .01 }); }   // 들어가서 볼 때는 천장까지(4인 부스 벽처럼)
      break;
    case "winbench": { // 창가 나무 벤치: 앉으면 카운터 안쪽(북)을 본다
      box(G, w - .1, .42, d - .4, 0xD9B98A, x, 0, z + .15, { line: .01 });
      if (SEAT_SINK) for (let i = 0; i < o.w; i++) SEAT_SINK.push({ x: o.x + i + .5, y: o.y + .55, yaw: Math.PI, h: .42, desk: null });
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
    case "bench": if (fl.f === 14) { // 14층(하루들 월드) 벤치: 노란 공 대신 흰 다리 위 둥근 파스텔 방석(자리마다 색이 돌아간다)
        const c = [0xDCD3FA, 0xFFD9E2, 0xD5EFE3, 0xD7E8FB, 0xFFE9B5][(o.x + o.y) % 5];
        for (const s of [-1, 1]) box(G, .08, .22, d * .5, 0xFFFFFF, x + s * (w / 2 - .22), 0, z, { line: .006 });
        box(G, w - .14, .06, d * .62, 0xFFFFFF, x, .2, z, { line: .008 });
        const cush = solidMesh(new RoundedBoxGeometry(w - .24, .1, d * .56, 3, .045), c, { line: .012 }); cush.position.set(x, .3, z); G.add(cush);
        for (let i = 1; i < Math.round(w / .5); i++) box(G, .02, .012, d * .5, 0xFFFFFF, x - (w - .24) / 2 + i * (w - .24) / Math.round(w / .5), .35, z, { line: 0, cast: false });   // 방석 바느질 선
        break; }
      box(G, w - .1, .3, d * .6, C.wood, x, 0, z); for (const s of [-1, 1]) box(G, .06, .3, d * .5, C.woodD, x + s * (w / 2 - .2), 0, z, { line: 0 }); ball(G, .12, 0xFFD43B, x - .3, .4, z, { line: .008 }); break;
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
    case "hbmat": { // 하루들 부스 바닥: 보라 매트 + 가장자리 노란 줄
      box(G, w - .1, .02, d - .1, 0xC9B8F0, x, 0, z, { line: .006, cast: false });
      box(G, w - .3, .022, .06, 0xFFD43B, x, 0, wz(o.y) + .2, { line: 0, cast: false }); box(G, w - .3, .022, .06, 0xFFD43B, x, 0, wz(o.y + o.h) - .2, { line: 0, cast: false }); break; }
    case "hbwall": { // 뒷벽 현수막(서쪽을 본다): 하루들 배너 이미지(2048×878)를 비율 그대로, 카운터 위로 보이게 높이 단다
      const px = wx(o.x) + .2, bh = 2.6, bw = Math.min(d - .4, bh * 2048 / 878), bottom = .8;
      box(G, .14, bottom + bh + .15, bw + .3, 0xEFE7FB, px + .07, 0, z, { line: .012 });
      board(G, bw, bh, boothBannerTex, px - .01, bottom + bh / 2, z, -Math.PI / 2); break; }
    case "hbcounter": { // 카운터(서쪽을 본다): 앞면 보라 판에 "하루들", 위에 네 컷 만화 세 장을 세워 둔다
      box(G, w - .15, .74, d - .1, 0xFFFFFF, x, 0, z, { line: .01 }); board(G, d - .3, .5, counterSignTex(d - .3, .5), wx(o.x) + .06, .4, z, -Math.PI / 2);
      // 카운터 위 소품: 스티커 시트, 엽서 더미, 사탕 병, 선물 쇼핑백(액자 사이사이)
      const top = .74, sx = x + .05, z0 = wz(o.y);
      for (let k = 0; k < 3; k++) { const st = box(G, .16, .006, .22, [0xFFD43B, 0xF7A6A0, 0x7DB3F0][k], sx - .15 + k * .03, top + k * .006, z0 + d * .33 + .02 * k, { line: .003, cast: false }); st.rotation.y = .2 * k - .2; }
      for (let k = 0; k < 6; k++) box(G, .2, .006, .14, k % 2 ? 0xFFFFFF : 0xEFE7FB, sx - .12, top + k * .006, z0 + d * .66, { line: .002, cast: false });
      cyl(G, .07, .07, .16, 0xF4FAFF, sx + .1, top, z0 + d * .16, { mat: toon(0xF4FAFF, { opacity: .45 }), line: .006, cast: false }); for (let k = 0; k < 6; k++) ball(G, .025, BALLS[k], sx + .1 + Math.sin(k) * .03, top + .03 + (k % 3) * .035, z0 + d * .16 + Math.cos(k) * .03, { line: 0 });
      for (const [bz, c] of [[d * .84, 0xB39DDB], [d * .5, 0xFFD43B]] as [number, number][]) { box(G, .14, .18, .2, c, sx + .12, top, z0 + bz, { line: .006 }); cyl(G, .006, .006, .08, C.dark, sx + .12, top + .18, z0 + bz - .05, { line: 0 }); cyl(G, .006, .006, .08, C.dark, sx + .12, top + .18, z0 + bz + .05, { line: 0 }); }
      for (let i = 0; i < 3; i++) { const cz = wz(o.y) + (i + .5) * d / 3, g2 = new THREE.Group(); g2.position.set(x, .74, cz); g2.rotation.y = -Math.PI / 2; G.add(g2);
        const fr = new THREE.Group(); fr.position.set(0, .02, -.04); fr.rotation.x = -.15; g2.add(fr);   // 액자를 통째로 살짝 뒤로 기울인다(그림이 틀 앞에 그대로 보이게)
        box(fr, .46, .46, .03, C.dark, 0, 0, -.02, { line: 0 }); board(fr, .42, .42, comicTex(i === 1 ? 3 : i), 0, .23, .002); box(g2, .05, .2, .05, C.woodD, 0, 0, -.14, { line: 0 }); }
      break; }
    case "easel": { // 나무 이젤(서쪽을 본다): 세 다리 위 캔버스에 완성된 네 컷
      const g2 = new THREE.Group(); g2.position.set(x, 0, z); g2.rotation.y = -Math.PI / 2 + (o.tilt || 0); G.add(g2);
      for (const [lx, lz, rx2] of [[-.28, .12, .12], [.28, .12, -.12], [0, -.32, 0]] as [number, number, number][]) { const l = box(g2, .05, 1.55, .05, C.woodD, lx, 0, lz, { line: .006 }); l.rotation.z = rx2; if (lz < 0) l.rotation.x = .3; }
      box(g2, .74, .05, .1, C.wood, 0, .68, .16, { line: .006 });
      box(g2, .74, .74, .04, 0xFFFFFF, 0, .7, .14, { line: .01 }); board(g2, .68, .68, comicTex(o.seed || 1), 0, 1.07, .165); break; }
    case "linkkiosk": case "instaboard": { // 바로가기 장치(서쪽을 본다): 은색 기둥 위 기울어진 화면. 누르면 새 탭으로 연다
      const insta = o.kind === "instaboard", g2 = new THREE.Group(); g2.position.set(x, 0, z); g2.rotation.y = -Math.PI / 2 + (o.tilt || 0); G.add(g2);
      box(g2, .5, .06, .4, 0xC3C7CD, 0, 0, 0, { line: .006 }); box(g2, .08, 1.05, .08, 0x9EA3AA, 0, .06, 0, { line: .004 });
      const head = new THREE.Group(); head.position.set(0, 1.2, .02); head.rotation.x = -.35; g2.add(head);
      box(head, .78, .78, .06, insta ? 0xE1306C : 0x7B5BD6, 0, -.39, -.04, { line: .01 });
      const m = board(head, .72, .72, insta ? instaTex : siteTex, 0, 0, .001); m.userData.noMerge = true; m.userData.link = insta ? "https://www.instagram.com/harudle.official/" : "https://www.harudle.com/"; linkBoards.push(m);
      break; }
    case "giftsign": { // 하루들 선물 입간판(서쪽을 본다): A자로 펼친 나무 판 양면에 받는 아이템, 위에 천천히 도는 선물 상자. 누르면 받는 법 창
      const g2 = new THREE.Group(); g2.position.set(x, 0, z); g2.rotation.y = -Math.PI / 2; G.add(g2);
      for (const s of [1, -1]) {
        const leaf = new THREE.Group(); leaf.position.z = s * .19; leaf.rotation.x = -s * .19; g2.add(leaf);   // 두 판이 위에서 맞닿는다
        box(leaf, .68, 1, .04, C.woodD, 0, 0, 0, { line: .006 });
        const m = board(leaf, .6, .9, giftTex, 0, .53, s * .025, s > 0 ? 0 : Math.PI); m.userData.noMerge = true; m.userData.gift = true; linkBoards.push(m);
      }
      const gift = new THREE.Group(); gift.position.set(x, 1.12, z); gift.userData.noMerge = true; G.add(gift); spinners.push(gift);
      box(gift, .26, .26, .26, 0xFFD43B, 0, 0, 0, { line: .008 }); box(gift, .27, .27, .05, 0x7B5BD6, 0, -.005, 0, { line: 0 }); box(gift, .05, .27, .27, 0x7B5BD6, 0, -.005, 0, { line: 0 });
      for (const k of [-1, 1]) ball(gift, .06, 0x7B5BD6, k * .05, .29, 0, { line: .004 }).scale.set(1.3, .8, .8);
      break; }
    case "painteasel": { // 함께 그리는 이젤(서쪽을 본다): 큰 나무 이젤에 네컷 틀 캔버스. 붓을 든 채 누르면 그린다
      const g2 = new THREE.Group(); g2.position.set(x, 0, z); g2.rotation.y = -Math.PI / 2 + (o.tilt || 0); G.add(g2);
      for (const [lx, lz, rx2] of [[-.4, .14, .1], [.4, .14, -.1], [0, -.4, 0]] as [number, number, number][]) { const l = box(g2, .06, 1.9, .06, C.woodD, lx, 0, lz, { line: .006 }); l.rotation.z = rx2; if (lz < 0) l.rotation.x = .28; }
      box(g2, 1.12, .06, .12, C.wood, 0, .62, .17, { line: .006 });
      box(g2, 1.1, 1.1, .05, 0xFFFFFF, 0, .66, .15, { line: .012 });
      const m = board(g2, 1.04, 1.04, ezTexture(), 0, .66 + .55, .18); m.userData.noMerge = true; m.userData.easel = true; ezBoards.push(m);
      const tag = board(g2, .9, .16, signTex("붓을 들고 눌러서 함께 그려요", { bg: "#EFE7FB", fg: "#4A3A80", size: 40, w: 640, h: 112 }), 0, .5, .2); tag.userData.noMerge = true;
      break; }
    case "wbpost": { // 묵직한 나무 기둥(바닥~천장, 벽 묶음이라 들어가서 볼 때 천장까지 늘어난다)에 화이트보드를 건다. board: 보드가 붙는 면(w·e·n·s)
      const pw = .9; box(fl.walls, pw, WALL, pw, C.wood, x, 0, z, { line: .012 });   // 책상과 같은 밝은 나무
      for (const f of [-1, 1]) for (const k of [-.3, -.08, .15, .32]) { box(fl.walls, .004, WALL * .96, .02, C.woodD, x + f * (pw / 2 + .001), WALL * .02, z + k * pw, { line: 0, cast: false }); box(fl.walls, .02, WALL * .96, .004, C.woodD, x + k * pw, WALL * .02, z + f * (pw / 2 + .001), { line: 0, cast: false }); }   // 나뭇결(책상 모서리와 같은 진한 나무색)
      box(G, pw + .08, .06, pw + .08, C.woodD, x, 0, z, { line: .008 });   // 아래 받침
      // 화이트보드: 기둥 면에서 살짝 띄워 건다(그룹 안에서 앞이 +z, 면 방향만큼 돌린다). 누르거나 앞에서 F면 함께 쓰는 판
      const rot = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }[o.board || "w"], g = new THREE.Group(); g.position.set(x + Math.sin(rot) * (pw / 2 + .02), 0, z + Math.cos(rot) * (pw / 2 + .02)); g.rotation.y = rot; G.add(g);
      const bs = 1.2, by = .34;
      box(g, bs + .1, bs + .1, .04, 0xC3C7CD, 0, by - .05, .02, { line: .008 });
      const m = board(g, bs, bs, ezTexture("wb"), 0, by + bs / 2, .045); m.userData.noMerge = true; m.userData.wb = true; ezBoards.push(m);
      box(g, bs, .03, .09, 0xC3C7CD, 0, by - .08, .07, { line: .006 });   // 마커 받침
      [0x111118, 0xD9342B, 0x2F6FD6].forEach((c, k) => { const mk = solidMesh(new THREE.CylinderGeometry(.013, .013, .13, 8), c, { line: .003, cast: false }); mk.rotation.z = Math.PI / 2; mk.position.set(-.3 + k * .17, by - .035, .08); g.add(mk); });
      const tag = board(g, .9, .14, signTex("눌러서 함께 쓰는 화이트보드", { bg: "#FFFFFF", fg: "#4A4A55", size: 40, w: 640, h: 100 }), 0, by + bs + .14, .05); tag.userData.noMerge = true;
      break; }
    case "wbwall": { // 나무로 된 직사각형 벽(가로로 놓는다, 천장까지)에 큰 화이트보드. 기둥 것과 같은 판을 함께 쓴다. board: 보드가 붙는 면(n·s)
      const th = .3, hh = 2.4; box(G, w - .1, hh, th, C.wood, x, 0, z, { line: .012 }); box(G, w, .06, th + .08, C.woodD, x, 0, z, { line: .008 });   // 아래 받침
      if (fl.ceil) { const up = CEIL[fl.f] - hh; box(fl.ceil, w - .1, up, th, C.wood, x, -up, z, { line: .012 }); }   // 들어가서 볼 때는 천장까지(천장 묶음이라 위에서 볼 땐 숨는다)
      const rot = o.board === "s" ? 0 : Math.PI, g = new THREE.Group(); g.position.set(x, 0, z + Math.cos(rot) * (th / 2 + .02)); g.rotation.y = rot; G.add(g);
      const bs = 1.9, by = .3;
      box(g, bs + .1, bs + .1, .04, 0xC3C7CD, 0, by - .05, .02, { line: .008 });
      const m = board(g, bs, bs, ezTexture("wb"), 0, by + bs / 2, .045); m.userData.noMerge = true; m.userData.wb = true; ezBoards.push(m);
      box(g, bs, .03, .09, 0xC3C7CD, 0, by - .08, .07, { line: .006 });   // 마커 받침
      [0x111118, 0xD9342B, 0x2F6FD6].forEach((c, k) => { const mk = solidMesh(new THREE.CylinderGeometry(.013, .013, .13, 8), c, { line: .003, cast: false }); mk.rotation.z = Math.PI / 2; mk.position.set(-.3 + k * .17, by - .035, .08); g.add(mk); });
      const tag = board(g, .9, .14, signTex("눌러서 함께 쓰는 화이트보드", { bg: "#FFFFFF", fg: "#4A4A55", size: 40, w: 640, h: 100 }), 0, by + bs + .14, .05); tag.userData.noMerge = true;
      break; }
    case "brushcup": { // 붓 꽂이: 작은 흰 스툴 위 보라 컵에 붓 다섯 자루(색이 다른 붓끝)
      cyl(G, .2, .22, .62, 0xFFFFFF, x, 0, z, { line: .008 }); cyl(G, .09, .08, .2, 0xB39DDB, x, .62, z, { line: .008 });
      [0xF15B5B, 0xFFD43B, 0x7DB3F0, 0x7FCFAE, 0x111118].forEach((c, k) => { const a = k / 5 * Math.PI * 2, s2 = solidMesh(new THREE.CylinderGeometry(.012, .012, .34, 6), C.woodD, { line: 0, cast: false }); s2.position.set(x + Math.sin(a) * .04, .78, z + Math.cos(a) * .04); s2.rotation.set(Math.cos(a) * .25, 0, -Math.sin(a) * .25); G.add(s2); ball(G, .025, c, x + Math.sin(a) * .085, .96, z + Math.cos(a) * .085, { line: .003 }); });
      const tag = board(G, .5, .12, signTex("붓 · F", { bg: "#FFD43B", fg: "#111118", size: 64, w: 320, h: 80 }), x - .23, .45, z, -Math.PI / 2); tag.userData.noMerge = true;
      break; }
    case "hbbunting": { // 배너 위로 늘어진 삼각 깃발 가랜드(보라·노랑·흰색)
      const px = wx(o.x) + .1, n = 18, len = d - .4, top = 3.55;
      for (let i = 0; i < n; i++) { const t = (i + .5) / n, cz = wz(o.y) + .2 + t * len, sag = Math.sin(t * Math.PI * 3 % Math.PI) * .18;
        const tri = new THREE.Mesh(new THREE.ConeGeometry(.11, .22, 3), toon([0xB39DDB, 0xFFD43B, 0xFFFFFF, 0x8E6FD8][i % 4])); tri.rotation.set(Math.PI, 0, 0); tri.scale.z = .15; tri.position.set(px - .03, top - .14 - sag, cz); G.add(tri); }
      cyl(G, .006, .006, len, C.dark, px, top - .03, z, { line: 0, cast: false }).rotation.x = Math.PI / 2; break; }
    case "rollup": { // 롤업 배너(서쪽을 본다): 은색 받침 + 세로로 긴 보라 배너에 하루들·태그라인·네 컷
      const g2 = new THREE.Group(); g2.position.set(x, 0, z); g2.rotation.y = -Math.PI / 2; G.add(g2);
      box(g2, .66, .08, .22, 0xC3C7CD, 0, 0, 0, { line: .006 }); box(g2, .02, 2.05, .02, 0x9EA3AA, .3, .08, -.06, { line: 0 });
      board(g2, .6, 1.95, rollupTex(o.seed || 0), 0, 1.08, .02); board(g2, .5, .5, comicTex(o.seed ? 2 : 0), 0, 1.08 + 1.95 * (.5 - 836 / 1950), .025); break; }
    case "hbgifts": { // 선물 상자 더미(리본 묶음)
      for (const [dx, dz, s3, c, dy] of [[0, 0, .34, 0xB39DDB, 0], [.06, .04, .24, 0xFFD43B, .34], [-.12, .2, .2, 0xF7A6A0, 0], [.16, -.18, .18, 0x7DB3F0, 0]] as [number, number, number, number, number][]) {
        box(G, s3, s3, s3, c, x + dx, dy, z + dz, { line: .008 }); box(G, s3 + .01, s3 + .01, .04, 0xFFFFFF, x + dx, dy - .005, z + dz, { line: 0 }); box(G, .04, s3 + .01, s3 + .01, 0xFFFFFF, x + dx, dy - .005, z + dz, { line: 0 });
        ball(G, .04, 0xFFFFFF, x + dx, dy + s3 + .02, z + dz, { line: .004 }); }
      break; }
    case "photoframe": { // 포토 프레임: 들고 사진 찍는 네 컷 모양 보라 틀, 받침대에 세워 둔다(서쪽을 본다)
      const g2 = new THREE.Group(); g2.position.set(x, 0, z); g2.rotation.y = -Math.PI / 2 + .35; G.add(g2);
      box(g2, .04, 1.0, .04, C.woodD, 0, 0, -.04, { line: 0 }); box(g2, .3, .03, .3, C.woodD, 0, 0, -.04, { line: 0 });
      const fr = new THREE.Mesh(new THREE.PlaneGeometry(.9, .7), new THREE.MeshBasicMaterial({ map: photoFrameTex, transparent: true, side: THREE.DoubleSide })); fr.position.set(0, 1.25, 0); g2.add(fr); break; }
    case "hbballoon": { // 부스 모서리 풍선 다발(보라·노랑)
      for (const [dx, dz, c, hh] of [[0, 0, 0xB39DDB, 1.9], [.16, .1, 0xFFD43B, 1.75], [-.12, .14, 0xC9B8F0, 1.65]] as [number, number, number, number][]) {
        cyl(G, .004, .004, hh - .2, C.grayD, x + dx * .3, 0, z + dz * .3, { line: 0, cast: false }); const b2 = ball(G, .18, c, x + dx, hh, z + dz, { line: .008 }); b2.scale.y = 1.15; }
      box(G, .12, .08, .12, C.dark, x, 0, z, { line: 0 }); break; }
    case "duo": { // 1인용 흰 책상에 의자 둘이 동서로 마주 보고, 천장에서 내려온 멀티탭이 책상 위에 걸려 있다(당겨 내려 쓴다)
      box(G, w - .4, .44, d - .4, C.white, x, 0, z); for (const s of [-1, 1]) chair(G, x + s * (w / 2 - .1), z, s < 0 ? Math.PI / 2 : -Math.PI / 2);
      // 멀티탭은 책상 북쪽 가장자리(의자 없는 쪽)에. 천장에서 내려온 선: 벽 묶음(fl.walls)에 넣어 들어가서 볼 때 벽과 함께 천장까지 늘어난다(위에서 볼 땐 벽 높이까지만)
      const ty = .44, tz = z - (d - .4) / 2 + .14, cy0 = (ty + .03) * WALL / CEIL[fl.f]; cyl(fl.walls, .008, .008, WALL - cy0, 0x2A2A2E, x, cy0, tz, { line: 0, cast: false });
      box(fl.walls, .05, .004, .05, 0xE4E2DC, x, WALL - .004, tz, { line: 0, cast: false });   // 천장 고정 캡
      box(G, .07, .03, .2, 0xF4F3EF, x, ty, tz + .06, { line: .004 }); box(G, .02, .012, .02, 0xFF8A3D, x, ty + .03, tz - .015, { line: 0, cast: false });   // 책상 위에 내려놓은 멀티탭 + 주황 스위치
      for (const k of [-.03, .02, .07]) box(G, .03, .004, .025, 0x3A3A40, x, ty + .03, tz + .06 + k, { line: 0, cast: false });   // 콘센트 구멍
      break; }
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
    case "showframe": { // 14층 하루들 월드 액자(남쪽을 본다): 나무 두 다리 위 색 테두리 액자. big이면 소설관 가운데 큰 이젤. 그림은 내용이 오면 paintShow가 그린다
      const g2 = new THREE.Group(); g2.position.set(x, 0, z); if (o.big) g2.scale.setScalar(1.7); if (o.face) g2.rotation.y = o.face === "e" ? Math.PI / 2 : -Math.PI / 2; G.add(g2);
      for (const sx of [-1, 1]) box(g2, .06, .62, .06, C.woodD, sx * .3, 0, -.06, { line: .006 });
      if (o.big) { const leg = box(g2, .06, 1.5, .06, C.woodD, 0, 0, -.32, { line: .006 }); leg.rotation.x = -.25; }   // 큰 이젤은 뒷다리 하나 더
      box(g2, .96, 1.1, .07, SHOW_FRAME[o.src] ?? 0xFFFFFF, 0, .5, -.05, { line: .012 });
      showSlot(g2, o.src, o.slot, .86, 0, 1.05, -.012, o.big ? 2.8 : 2);
      break; }
    case "showwall": { const [P, sx, sz, sw, sd] = facing(G, o, x, z, w, d); // face e/w면 서쪽/동쪽 가장자리에 세워 옆을 본다. 14층 하루들 월드 전시 벽(남쪽을 본다): 흰 벽에 색 액자를 slots 순서로 왼쪽부터 건다. style film은 검은 필름 띠(구멍 줄), big이면 큰 액자 하나
      const film = o.style === "film", ww = sw - .2, wh = o.big ? 2.2 : 1.7, n = o.slots.length, fw = o.big ? 1.45 : .86, cy = o.big ? 1.12 : .92;
      box(P, ww, wh, .16, film ? 0x2B2140 : o.wallColor ?? 0xFFFFFF, sx, 0, sz - sd / 2 + .12, { line: .012 });
      if (film) for (const hy of [.2, wh - .2]) for (let i = 0; i < Math.floor(ww / .45); i++) box(P, .2, .12, .02, 0xFFFFFF, sx - ww / 2 + .3 + i * .45, hy - .06, sz - sd / 2 + .21, { line: 0 });   // 필름 구멍
      for (let i = 0; i < n; i++) {
        const fx = sx - ww / 2 + (i + .5) * ww / n;
        box(P, fw + .1, fw * SHOW_H / SHOW_W + .1, .05, film ? 0xFFFFFF : SHOW_FRAME[o.src] ?? 0xFFFFFF, fx, cy - (fw * SHOW_H / SHOW_W + .1) / 2, sz - sd / 2 + .22, { line: .008 });
        showSlot(P, o.src, o.slots[i], fw, fx, cy, sz - sd / 2 + .255);
      }
      if (o.plate !== undefined) plateSlot(P, o.plate, Math.min(ww, 2.6), sx, wh + .32, sz - sd / 2 + .12);
      if (o.sign) { board(P, Math.min(ww, 3.2), .55, signTex(o.sign, { bg: film ? "#B9A6EC" : "#7355DA", fg: "#FFFFFF", size: 64 }), sx, wh + .4, sz - sd / 2 + .12); for (const k of [-1, 1]) if (o.big) ball(P, .14, 0xFFD43B, sx + k * 1.9, wh + .4, sz - sd / 2 + .12, { line: .01 }); }
      break; }
    case "marquee": { // 퀴즈 아케이드 전구 간판(남쪽을 본다): 벽 위에 띄우거나 o.posts면 두 기둥 위 아치. 판 색 o.color, 기둥 o.post
      const mw = Math.min(w - .2, o.size ?? 3.6), mh = mw / 5, my = o.y0 ?? 2.3, mz = z - d / 2 + (o.posts ? .16 : .3);
      if (o.posts) for (const k of [-1, 1]) { cyl(G, .1, .12, my, o.post ?? 0xFFFFFF, x + k * (mw / 2 + .12), 0, mz, { line: .008 }); ball(G, .16, 0xFFD97A, x + k * (mw / 2 + .12), my + .1, mz, { line: .008 }); }
      const tex = marqueeTex(o.text, o.color ?? "#FF9EB5"); const m = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
      m.position.set(x, my, mz); m.userData.noMerge = true; G.add(m);
      const n = Math.round(mw / .28); for (let i = 0; i <= n; i++) for (const k of [-1, 1]) { const b2 = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xFFF3B0 : 0xFFFFFF, toneMapped: false })); b2.position.set(x - mw / 2 + .2 + i * (mw - .4) / n, my + k * (mh / 2 + .03), mz + .02); b2.userData.noMerge = true; G.add(b2); }
      break; }
    case "claw": { // 퀴즈 아케이드 인형 뽑기 기계(남쪽을 본다): 파스텔 몸통, 유리 상자 안에 동글동글 인형, 위에 집게
      const c = o.color ?? 0xFFB3C7;
      box(G, .8, .75, .7, c, x, 0, z, { line: .01 }); box(G, .5, .08, .2, 0xFFFFFF, x, .55, z + .36, { line: .006 }); ball(G, .05, 0xFF7FA3, x - .12, .68, z + .4, { line: .004 }); cyl(G, .015, .015, .12, 0x2B2140, x + .1, .63, z + .4, { line: 0 }); ball(G, .04, 0x7355DA, x + .1, .77, z + .4, { line: 0 });
      const glass = new THREE.Mesh(new THREE.BoxGeometry(.76, .8, .66), new THREE.MeshStandardMaterial({ color: 0xE6F4FF, transparent: true, opacity: .28, roughness: .1, depthWrite: false })); glass.position.set(x, 1.15, z); glass.userData.noMerge = true; G.add(glass);
      [[-.2, -.15, 0xFFD97A], [.05, -.1, 0x9FE0C2], [.22, .12, 0xC9B8F0], [-.12, .15, 0x9CC8F5], [.15, -.2, 0xFFFFFF], [-.25, .05, 0xFF9EB5]].forEach(([dx, dz, cc]) => { ball(G, .11, cc, x + dx, .86, z + dz, { line: .006 }); ball(G, .04, cc, x + dx - .06, .96, z + dz, { line: .003 }); ball(G, .04, cc, x + dx + .06, .96, z + dz, { line: .003 }); });
      box(G, .8, .16, .7, c, x, 1.55, z, { line: .01 }); board(G, .7, .13, signTex("인형 뽑기", { bg: "#FFFFFF", fg: "#7355DA", size: 60 }), x, 1.63, z + .36);
      cyl(G, .01, .01, .3, 0x9EA3AA, x + .05, 1.25, z, { line: 0, cast: false }); for (const k of [-1, 1]) { const arm = box(G, .015, .14, .015, 0x9EA3AA, x + .05 + k * .04, 1.12, z, { line: 0 }); arm.rotation.z = k * .4; }
      break; }
    case "jukebox": { // 노래 방 주크박스(남쪽을 본다): 둥근 지붕의 파스텔 상자, 앞에 무지개 아치
      box(G, .8, 1.05, .55, 0xFFB3C7, x, 0, z, { line: .01 }); const top = cyl(G, .4, .4, .55, 0xFFB3C7, x, 1.05 - .275, z, { line: .01 }); top.rotation.x = Math.PI / 2; top.position.y = 1.05;
      board(G, .66, .82, jukeboxTex, x, .6, z + .285); box(G, .86, .1, .6, 0xFFD97A, x, 0, z, { line: .008 }); break; }
    case "mic": { // 노래 방 스탠드 마이크
      cyl(G, .16, .2, .04, 0xFF8FA8, x, 0, z, { line: .004 }); cyl(G, .02, .02, 1.3, 0xE4E2F0, x, 0, z, { line: 0 }); const head = ball(G, .09, 0xF4F2FA, x, 1.38, z + .02, { line: .006 }); head.scale.y = 1.3; cyl(G, .06, .06, .05, 0xFF7FA3, x, 1.27, z + .02, { line: 0 }); break; }
    case "popcorn": { // 드라마·영화 방 팝콘 수레: 분홍 줄무늬 몸통, 노란 팝콘이 소복
      box(G, .8, .8, .6, 0xFFFFFF, x, .12, z, { line: .01 }); board(G, .78, .78, popcornTex, x, .52, z + .305);
      for (const k of [-1, 1]) cyl(G, .12, .12, .05, 0x2B2140, x + k * .3, 0, z + .32, { line: 0 }).rotation.z = Math.PI / 2;
      for (let i = 0; i < 14; i++) ball(G, .07, i % 3 ? 0xFFF3C4 : 0xFFD97A, x + Math.sin(i * 2.3) * .26, .96 + (i % 4) * .05, z + Math.cos(i * 1.7) * .18, { line: .003 });
      for (const k of [-1, 1]) cyl(G, .02, .02, .55, 0xFF8FA8, x + k * .36, .92, z, { line: 0 }); box(G, .9, .08, .7, 0xFF8FA8, x, 1.47, z, { line: .008 }); break; }
    case "clapper": { // 드라마·영화 방 큰 슬레이트(남쪽을 본다): 나무 받침 위에 세운 "하루들 극장" 슬레이트
      for (const k of [-1, 1]) { const leg = box(G, .05, 1.1, .05, C.woodD, x + k * .25, 0, z, { line: .004 }); leg.rotation.z = -k * .1; }
      board(G, .8, .7, clapperTex, x, 1.2, z + .04); const bar = box(G, .82, .1, .05, 0xFFFFFF, x - .02, 1.56, z + .04, { line: .006 }); bar.rotation.z = .18; break; }
    case "floaters": { // 공중에 천천히 도는 기호(o.chars, o.colors): 노래 방 음표·드라마 방 별
      const chars = o.chars ?? ["♪", "♫"], cols = o.colors ?? ["#FF7FA3", "#7355DA"];
      chars.forEach((ch, i) => { const a = i * 2.4, r = .25 + (i % 3) * .3, g2 = new THREE.Group(); g2.position.set(x + Math.cos(a) * r, 1.5 + (i % 3) * .35, z + Math.sin(a) * r); G.add(g2); glyph(g2, ch, cols[i % cols.length], .75, 0, 0, 0); spinners.push(g2); });
      break; }
    case "neonsign": { // 퀴즈 아케이드 네온 간판(남쪽을 본다): 어두운 벽 위나 기둥 두 개 위에 단다. o.posts면 기둥에 세운 아치
      const nw = Math.min(w - .2, o.size ?? 3.6), ny = o.y0 ?? 2.25, nz = z - d / 2 + (o.posts ? .16 : .3);   // 벽에 걸 때는 문제 액자 벽(1.7m) 위에 띄운다
      if (o.posts) { for (const sx of [-1, 1]) box(G, .14, ny + .2, .14, 0x2A2058, x + sx * (nw / 2 + .1), 0, nz, { line: .008 }); box(G, nw + .4, nw / 6 + .2, .1, 0x2A2058, x, ny - nw / 12 - .1, nz - .06, { line: .01 }); }
      neon(G, o.text, o.color ?? "#FF7FA3", nw, x, ny, nz);
      break; }
    case "wallsign": // 벽 위쪽 글씨판(남쪽을 본다): 릴레이 소설관 이름
      board(G, Math.min(w - .2, o.size ?? 3.4), Math.min(w - .2, o.size ?? 3.4) / 8, signTex(o.text, { bg: o.bg ?? "#F6E7D2", fg: o.fg ?? "#5B3FC4", size: 72, w: 1024, h: 128 }), x, o.y0 ?? WALL - .45, z - d / 2 + .1);
      break;
    case "relayscroll": { // 릴레이 소설관 두루마리(face w면 동쪽 벽에서 서쪽을 본다): 줄 친 종이에 안내 글, 양 끝 나무 막대
      const [P, sx, sz, sw, sd] = facing(G, o, x, z, w, d), len = sw - .4, back = sz - sd / 2 + .08;
      const tex = canvasTex(2048, 96, (g, cw, ch) => { g.fillStyle = "#FFFBF2"; g.fillRect(0, 0, cw, ch); g.strokeStyle = "#D9CCF5"; g.lineWidth = 3; for (let yy = ch * .2; yy < ch; yy += ch * .2) { g.beginPath(); g.moveTo(0, yy); g.lineTo(cw, yy); g.stroke(); }
        g.fillStyle = "#5B3FC4"; g.font = `700 30px ${HAND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(o.text, cw / 2, ch / 2, cw - 40); });
      board(P, len, .5, tex, sx, 1.3, back + .02);
      for (const ex of [-1, 1]) cyl(P, .06, .06, .7, 0xB9855A, sx + ex * len / 2, .95, back + .06);
      break; }
    case "drawingeasel": { // 14층 메인 전시실 함께 그리는 네컷 이젤(남쪽을 본다): 월드 이젤처럼 나무 세 다리, 판에는 지금 그림. 바닥에 붓
      const g2 = new THREE.Group(); g2.position.set(x, 0, z); G.add(g2);
      for (const sx of [-1, 1]) { const leg = box(g2, .07, 2.1, .07, C.woodD, sx * .55, 0, 0, { line: .006 }); leg.rotation.z = -sx * .12; }
      { const leg = box(g2, .07, 2.1, .07, C.woodD, 0, 0, -.45, { line: .006 }); leg.rotation.x = -.3; }
      box(g2, 1.3, .06, .14, C.woodD, 0, .62, .04, { line: .006 });   // 판 받침
      box(g2, 1.3, 1.3, .06, 0xFFFFFF, 0, .68, .02, { line: .01 });
      const scr = board(g2, 1.2, 1.2, easelTex, 0, 1.33, .06); scr.userData.noMerge = true;
      fixedSlot(scr, { view: "easel", image: null, caption: "", action: "이젤에 같이 그리기" }, 2.6);
      const brush = new THREE.Group(); brush.position.set(.9, .03, .7); brush.rotation.y = .6; g2.add(brush);
      box(brush, .06, .06, .7, C.woodD, 0, 0, 0, { line: .004 }); box(brush, .09, .09, .14, 0x7355DA, 0, 0, .4, { line: .004 });
      board(g2, 1.6, .36, signTex("다 같이 그리는 네컷", { bg: "#FFD97A", fg: "#2B2140", size: 56 }), 0, 2.28, .05);
      break; }
    case "sketchstand": { // 이젤 옆 스케치북 받침대(남쪽을 본다): 지난 그림이 넘어간 스케치북을 펼쳐 둔다
      const g2 = new THREE.Group(); g2.position.set(x, 0, z); G.add(g2);
      cyl(g2, .06, .08, .9, C.woodD, 0, 0, 0, { line: .006 }); box(g2, .7, .05, .5, C.wood, 0, .9, 0, { line: .008 });
      const pages = box(g2, .62, .04, .44, 0xFFFFFF, 0, .95, 0, { line: .006 }); pages.rotation.x = -.35;
      box(g2, .02, .05, .44, 0x7355DA, 0, .97, 0, { line: 0 }).rotation.x = -.35;
      const tag = board(g2, .9, .26, signTex("지난 그림 스케치북", { bg: "#FFFFFF", fg: "#7355DA", size: 52 }), 0, 1.35, 0); tag.userData.noMerge = true;
      fixedSlot(tag, { view: "sketchbook", image: null, caption: "", action: "스케치북 넘겨 보기" }, 2);
      break; }
    case "albumstand": { // 작가의 방 앨범북 받침대(남쪽을 본다): 벽에 다 못 거는 그 작가 만화를 앨범으로 모두 넘겨 본다. 표지 글은 내용이 오면 그린다
      const g2 = new THREE.Group(); g2.position.set(x, 0, z); G.add(g2);
      cyl(g2, .06, .08, .85, C.woodD, 0, 0, 0, { line: .006 }); box(g2, .8, .05, .56, C.wood, 0, .85, 0, { line: .008 });
      const book = new THREE.Group(); book.position.set(0, .92, 0); book.rotation.x = -.35; g2.add(book);
      box(book, .74, .05, .5, ZONE_FRAMES[o.slot] ?? 0x7355DA, 0, -.02, 0, { line: .008 });   // 표지(방 색)
      for (const k of [-1, 1]) { box(book, .34, .04, .46, 0xFFFBF2, k * .18, .02, 0, { line: .004 }); box(book, .26, .01, .26, 0xFFFFFF, k * .18, .06, -.02, { line: .002 }); }   // 펼친 두 쪽에 그림 자리
      box(book, .02, .06, .48, 0x2B2140, 0, .02, 0, { line: 0 });
      const cv = document.createElement("canvas"); cv.width = 512; cv.height = 150;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const tag = board(g2, 1.1, 1.1 * 150 / 512, tex, 0, 1.5, 0); tag.userData.noMerge = true;
      const slot = { src: "album", slot: o.slot, x: undefined, y: undefined, reach: 2, mesh: tag, cv, tex,
        paint: (sl) => { const g = sl.cv.getContext("2d"), it = showItem(sl); g.fillStyle = "#7355DA"; g.fillRect(0, 0, 512, 150); g.strokeStyle = "#2B2140"; g.lineWidth = 8; g.strokeRect(4, 4, 504, 142);
          g.fillStyle = "#FFFFFF"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `700 54px ${HAND}`; g.fillText("📖 앨범북", 256, 52, 480);
          g.fillStyle = "#FFD97A"; g.font = `700 40px ${HAND}`; g.fillText(it ? it.caption : "더 보기", 256, 112, 480); sl.tex.needsUpdate = true; } };
      tag.userData.show = slot; showSlots.push(slot); paintShow(slot);
      break; }
    case "runway": { // 14층 전시관 보라 카펫(밟고 지나간다): 하루들 월드 메인 전시실처럼 가운데 흰 점선
      box(G, w - .3, .02, d, 0xB9A6EC, x, 0, z, { line: .008, cast: false });
      for (const sx of [-1, 1]) for (let i = 0; i < Math.floor(d / .7); i++) box(G, .08, .025, .36, 0xFFFFFF, x + sx * (w / 2 - .55), 0, z - d / 2 + .35 + i * .7, { line: 0, cast: false });
      break; }
    case "phonestand": { // 14층 큰 하루들 휴대폰(남쪽을 본다, 월드처럼 살짝 돌려 세움): 월드 HarudlePhone 모양을 0.6배로. 보라 받침대, 검은 몸통, 카메라 구멍, 옆 버튼,
      // 화면에는 하루들 피드, 오른쪽에 "크게 열기" 받침대, 위에 "하루들 직접 써 보기" 말풍선. 화면이나 받침대를 누르거나 앞에서 F → 하루들 크게 열기
      const k = .6, SW = 2.4 * k, SH = 4.8 * k, BW = SW + .24 * k, BH = SH + (.24 + .2) * k, BD = .2 * k, ST = .3 * k, BY = ST + BH / 2;
      const g2 = new THREE.Group(); g2.position.set(x - .4, 0, z); g2.rotation.y = -.5; G.add(g2);
      const rb = (bw, bh, bd, r, c, px, py, pz, line = .012) => { const m = solidMesh(new RoundedBoxGeometry(bw, bh, bd, 3, r), c, { line }); m.position.set(px, py, pz); g2.add(m); return m; };
      rb(1.9 * k, ST, 1.2 * k, .05, 0x7355DA, 0, ST / 2, 0);
      rb(BW, BH, BD, .11, 0x2B2140, 0, BY, 0);
      const cam2 = new THREE.Mesh(new THREE.CircleGeometry(.025, 16), new THREE.MeshBasicMaterial({ color: 0x000000 })); cam2.position.set(0, BY + BH / 2 - .08, BD / 2 + .004); cam2.userData.noMerge = true; g2.add(cam2);
      rb(.04, .36, .05, .012, 0xC3B3F8, BW / 2 + .012, BY + .6, 0, .006);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: phoneTex, toneMapped: false })); scr.position.set(0, BY - .025, BD / 2 + .006); scr.userData.noMerge = true; g2.add(scr);
      const item = { view: "phone", image: null, caption: "", action: "하루들 크게 열기" };
      fixedSlot(scr, item, 3);
      // 크게 열기 받침대(월드 OpenKiosk)
      const kx = 2.4 * k, kz = .4 * k;
      cyl(g2, .05, .05, 1.6 * k, 0xFFFDF7, kx, 0, kz, { line: .006 }); rb(.9 * k, .07, .9 * k, .03, 0x7355DA, kx, .035, kz);
      const kp = new THREE.Group(); kp.position.set(kx, 2.05 * k, kz); kp.rotation.x = -.3; g2.add(kp);
      const kb = solidMesh(new RoundedBoxGeometry(1.3 * k, 1.3 * k, .07, 3, .03), 0x7355DA, { line: .008 }); kp.add(kb);
      const kl = new THREE.Mesh(new THREE.PlaneGeometry(1.16 * k, 1.16 * k), new THREE.MeshBasicMaterial({ map: phoneKioskTex, toneMapped: false })); kl.position.z = .04; kl.userData.noMerge = true; kp.add(kl);
      fixedSlot(kl, item, 2.4);
      const bub = new THREE.Mesh(new THREE.PlaneGeometry(2.9 * k, 2.9 * k * 200 / 640), new THREE.MeshBasicMaterial({ map: phoneBubbleTex, transparent: true, side: THREE.DoubleSide, toneMapped: false })); bub.position.set(0, ST + BH + .42, .02); bub.userData.noMerge = true; g2.add(bub);
      break; }
    case "scoopstand": { // 14층 오늘의 특종 가판대(남쪽을 본다, face n이면 북쪽): 하루들 월드 로비처럼 보라·흰 줄무늬 차양, 신문 더미, 간판.
      // 월드 로비처럼 매대 뒤에 하루들 기자, 앞 양옆에 손 흔드는 하루와 두들이가 있다(모양은 하루들 월드 캐릭터)
      const g2 = new THREE.Group(); g2.position.set(x, 0, z); if (o.face === "n") g2.rotation.y = Math.PI; G.add(g2); const sw = Math.min(w - .4, 4.4), sd = Math.min(d - .4, 2), front = sd / 2 - .4;
      box(g2, sw, .03, sd, 0xEDE7FF, 0, 0, 0, { line: .008, cast: false });   // 바닥 깔판
      box(g2, sw, .82, .8, 0x7355DA, 0, 0, front); box(g2, sw + .08, .06, .88, 0xFFFFFF, 0, .82, front, { line: .01 });   // 보라 매대와 흰 상판
      for (const [i, c] of [0xFFD97A, 0xF7A6B5, 0xB9A6EC, 0x7DB3F0].entries()) { const nx = -sw / 2 + .55 + i * (sw - 1.1) / 3; box(g2, .62, .12 + (i % 2) * .06, .44, 0xFFFFFF, nx, .88, front + .08, { line: .008 }); box(g2, .5, .02, .3, c, nx, 1.0 + (i % 2) * .06, front + .08, { line: 0 }); }   // 신문 더미
      for (const sx of [-1, 1]) box(g2, .1, 1.6, .1, 0xFFFFFF, sx * (sw / 2 - .1), .88, front + .3, { line: .008 });
      box(g2, sw - .1, 2.2, .1, 0xEDE7FF, 0, 0, -sd / 2 + .08, { line: .01 });   // 뒷벽
      for (let i = 0; i < 8; i++) { const st = box(g2, sw / 8 + .02, .07, sd + .5, i % 2 ? 0xFFFFFF : 0x8B6FE8, -sw / 2 + (i + .5) * sw / 8, 2.42, .12, { line: .008 }); st.rotation.x = .28; }   // 줄무늬 차양
      for (let i = 0; i < 8; i++) ball(g2, sw / 16, i % 2 ? 0xFFFFFF : 0xEDE7FF, -sw / 2 + (i + .5) * sw / 8, 2.26, sd / 2 + .32, { line: .008 });   // 차양 끝 둥근 술
      board(g2, 2.4, .6, signTex(o.sign ?? "오늘의 특종", { bg: "#7355DA", fg: "#FFFFFF", size: o.sign ? 56 : 70 }), 0, 2.95, .05);
      board(g2, 1.3, .32, signTex(o.hint ?? "눌러 보세요!", { bg: "#FFFFFF", fg: "#7355DA", size: 60 }), 0, 3.42, .06);
      const standDoll = (kind, dx, dz, yaw, dy = 0) => {
        const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = .012; blob.renderOrder = 1; blob.visible = dy === 0;
        const doll = makeDoll(kind, null, blob); doll.root.position.set(dx, dy, dz); doll.turn.rotation.y = yaw; doll.root.userData.noMerge = true; g2.add(doll.root);
      };
      standDoll("harudle", 0, -.25, 0, .3);                       // 매대 뒤 하루들 기자(발판 위에 서서 매대 너머로 보인다)
      if (!o.keeper) { // keeper만이면 작가 체험 부스: 매대 뒤 하루들만
        standDoll("haru", sw / 2 + .75, sd / 2 + .55, -.35);          // 앞 오른쪽: 손 흔드는 하루
        standDoll("dog", -sw / 2 - .7, sd / 2 + .6, .55);              // 앞 왼쪽: 두들이
      }
      break; }
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
const PART_LABELS = { head: "머리", ear: "귀", face: "표정", eyewear: "안경", outfit: "옷", neck: "목", bag: "가방", held: "손에 든 것" };   // 하루들 월드 AvatarCustomizer와 같은 이름
const AV_LABEL: Record<string, Record<string, string>> = Object.fromEntries(Object.entries(AVATAR_OPTIONS).map(([k, opts]) => [k, { _: PART_LABELS[k], ...Object.fromEntries(opts.map((o) => [o.value, o.label])) }]));
const AV_COLORS = AVATAR_COLORS.map((c) => c.value as string);
const AV_SKINS = AVATAR_COLORS.filter((c) => c.label.startsWith("피부") && c.label !== "피부 4").map((c) => c.value as string);
const AV_COLOR_PARTS = AVATAR_COLOR_PARTS.map((p) => [p.key, p.label] as const);
const AV_PARTS = ["head", "ear", ...Object.keys(AV).filter((k) => k !== "head" && k !== "ear")];   // 꾸미기 창 순서: 머리 장식 바로 아래 귀 장식
const AV_CODE_PARTS = ["head", "face", "eyewear", "outfit", "neck", "bag", "held"];   // 보내는 글자 앞 7개(예전 그대로). 귀처럼 나중에 생긴 부위는 색 뒤에 붙인다
const AV_EXTRA_PARTS = ["ear"];
const AV_PRESETS = AVATAR_PRESETS.map((p) => [p.label, p.config] as const);
const DEFAULT_AV: AvatarConfig = AVATAR_PRESETS[0].config;
// 다른 크루에게 보낼 44글자: 부위 7개(한 글자씩) + 색 6개(16진수 여섯 글자씩, 직접 고른 색도 된다) + 귀 장식 한 글자(없으면 예전 43글자로 읽는다)
const avEncode = (c: AvatarConfig) => AV_CODE_PARTS.map((p) => Math.max(0, AV[p].indexOf(c[p])).toString(36)).join("") + AV_COLOR_PARTS.map(([k]) => (c[k] || "#FFFFFF").slice(1).toUpperCase()).join("") + AV_EXTRA_PARTS.map((p) => Math.max(0, AV[p].indexOf(c[p])).toString(36)).join("");
function avDecode(s: unknown): AvatarConfig | null {
  if (typeof s !== "string" || !/^[0-9a-z]{7}([0-9A-F]{6}){6}[0-9a-z]?$/.test(s)) return null;
  return sanitizeAvatar({ ...Object.fromEntries(AV_CODE_PARTS.map((p, i) => [p, AV[p][parseInt(s[i], 36)]])), ...Object.fromEntries(AV_COLOR_PARTS.map(([k], i) => [k, "#" + s.slice(7 + i * 6, 13 + i * 6)])), ...Object.fromEntries(AV_EXTRA_PARTS.map((p, i) => [p, AV[p][parseInt(s[43 + i] || "0", 36)]])) });
}
// 하루들 월드 randomAvatar와 같은 규칙 (피부는 밝은 색에서만). 크루는 닉네임으로 정해져 누가 봐도 같은 모습
function avRandom(r = Math.random): AvatarConfig {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)], c: Record<string, string> = {};
  for (const p of AV_PARTS) c[p] = pick(AV[p].filter((v) => !LOCKED_OPTIONS[p]?.includes(v)));   // 잠긴 장식은 랜덤으로 나오지 않는다
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
const SKILLS = { draw: { label: "네 컷 그리기", dur: 5.4 }, wave: { label: "인사", dur: 2 }, heart: { label: "하트", dur: 2 }, laptop: { label: "노트북", dur: 1e9 }, coffee: { label: "아이스 아메리카노", dur: 4.6 }, dance: { label: "춤", dur: 1e9 }, gun: { label: "종이 총", dur: 1e9 }, read: { label: "책 읽기", dur: 1e9 } }   // 춤은 한 번 누르면 계속(다시 누르거나 움직이면 멈춘다);   // laptop은 일어날 때까지 펼쳐 둔다
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
const noteTex = fxTex((g) => { g.fillStyle = "#7DB3F0"; g.strokeStyle = "#111118"; g.lineWidth = 3; g.beginPath(); g.ellipse(22, 46, 10, 8, -.4, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.ellipse(46, 40, 10, 8, -.4, 0, 7); g.fill(); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(31, 44); g.lineTo(31, 12); g.lineTo(55, 6); g.lineTo(55, 38); g.stroke(); });   // 춤출 때 퐁퐁 뜨는 음표
const fx = [];
function spawnFx(tex, at, n = 1, spread = .4, up = 1.1) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(.2, .2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(at.x + (Math.random() - .5) * spread, at.y + up + Math.random() * .3, at.z + (Math.random() - .5) * spread); m.renderOrder = 5; scene.add(m);
    fx.push({ m, vy: .5 + Math.random() * .5, vx: (Math.random() - .5) * .4, life: 1.4 });
  }
}
// 폭죽: 앞(들어가서 볼 땐 보는 쪽, 위에서 볼 땐 몸이 향한 쪽)으로 포물선을 그리며 날아가 터진다. 같이 있는 크루에게도 보인다
const FW_COLORS = [0xFFC300, 0xFF5A5F, 0x2F80ED, 0x20B486, 0x8E5CF7, 0xFF8C1A, 0xE83E8C].map((c) => new THREE.Color(c));
const fireworks = []; let fwReady = 0;
const fwDot = canvasTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(.45, "rgba(255,255,255,.9)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
// F: 폭죽 / 좌클릭: 종이 총(꺼내 들었을 때). aim은 위에서 볼 때 누른 곳 쪽 방향
function fireFirework(paper = false, aim: number | null = null) {
  if (paper && me.act?.name !== "gun") return;
  const now = performance.now(); if (now < fwReady) return; fwReady = now + (paper ? 250 : 600);
  me.fh = aim ?? (inside() ? cam.yaw + Math.PI : me.h); me.fc++; me.fk = paper ? 1 : 0;
  if (me.fk) { me.h = me.fh; me.kickAt = now / 1000; shootPaper(me.f, me.x, me.y, me.fh, me.up + me.jz, me); } else launchFirework(me.f, me.x, me.y, me.fh, me.up + me.jz);
  sendPresence(true);
}
// 게더타운처럼: 손 앞에서 부채꼴(좌우 약 70도)로 색종이 불꽃이 팍! 퍼져 나가고, 흩날리며 떨어진다
function launchFirework(f, x, y, dir, lift = 0) {
  const fx = Math.sin(dir), fz = Math.cos(dir), h = floorY(f) + heightAt(FLOORS[f], x, y) + lift + .75;
  burst(new THREE.Vector3(wx(x) + fx * .35, h, wz(y) + fz * .35), f, dir);
}
function burst(pos, f, dir) {
  const n = 120, geo = new THREE.BufferGeometry(), P = new Float32Array(n * 3), Cc = new Float32Array(n * 3), V = [];
  for (let i = 0; i < n; i++) {
    P[i * 3] = pos.x; P[i * 3 + 1] = pos.y; P[i * 3 + 2] = pos.z;
    const a = dir + (Math.random() - .5) * 1.25, up = -.05 + Math.random() * .75, sp = 4.5 + Math.random() * 4.5;   // 부채꼴: 앞쪽 ±36도, 살짝 위로
    V.push(new THREE.Vector3(Math.sin(a) * Math.cos(up) * sp, Math.sin(up) * sp, Math.cos(a) * Math.cos(up) * sp));
    const c = FW_COLORS[i % FW_COLORS.length]; Cc[i * 3] = c.r; Cc[i * 3 + 1] = c.g; Cc[i * 3 + 2] = c.b;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); geo.setAttribute("color", new THREE.BufferAttribute(Cc, 3));
  const mat = new THREE.PointsMaterial({ size: .2, map: fwDot, vertexColors: true, transparent: true, depthWrite: false, alphaTest: .05 });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts);
  fireworks.push({ kind: "burst", m: pts, v: V, t: 0, f, floor: floorY(f) + .03 });
}
function tickFireworks(dt) {
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const w = fireworks[i]; w.t += dt; w.m.visible = w.f === me.f;
    if (w.kind === "bullet") {
      const pos = w.m.position, fl = FLOORS[w.f], ground = floorY(w.f) + heightAt(fl, tX(pos.x), tY(pos.z)) + .05;
      if (!w.hit) {
        w.m.rotation.x += w.spin.x * dt; w.m.rotation.y += w.spin.y * dt; w.m.rotation.z += w.spin.z * dt;
        // 빠른 총알이 한 프레임에 사람을 건너뛰지 않게 8cm씩 나눠 움직이며 맞았는지 본다
        const steps = Math.max(1, Math.ceil(w.v.length() * dt / .08)), sdt = dt / steps;
        for (let st = 0; st < steps && !w.hit; st++) {
        w.v.y -= 3 * sdt; pos.addScaledVector(w.v, sdt);
        const gx = tX(pos.x), gy = tY(pos.z), y0 = pos.y - floorY(w.f);
        const hitWall = solid(fl, gx, gy) && (fl.wgrid[Math.floor(gy) * W + Math.floor(gx)] || y0 < (fl.top[Math.floor(gy) * W + Math.floor(gx)] || 1.2) + .05);
        const hitDoll = [me, ...NPCS, ...peers.values()].find((a: any) => a !== w.shooter && a.doll?.root.visible && (a.f ?? w.f) === w.f && Math.hypot(a.doll.root.position.x - pos.x, a.doll.root.position.z - pos.z) < .3 && y0 > a.doll.root.position.y - floorY(w.f) && y0 < a.doll.root.position.y - floorY(w.f) + 1.15);
        if (hitWall || hitDoll || pos.y <= ground || w.t > 1.6) { w.hit = true; w.t = 0; const hd = Math.atan2(w.v.x, w.v.z); paperPuff(pos.clone(), w.f, hd);
          // 맞은 사람이 휘청: 내가 맞았으면 내가 정해서 모두에게 알린다(hc). NPC는 각자 화면에서. 다른 크루는 그 사람이 보낸 hc로 휘청인다
          if (hitDoll === me) { me.hc++; me.hd = hd; hitReact(me, hd); sendPresence(true); } else if (NPCS.includes(hitDoll)) hitReact(hitDoll, hd);
          w.v.set(-w.v.x * .12, 0, -w.v.z * .12); }
        }
      } else { // 맞은 뒤: 툭 떨어져 바닥에 잠깐 남았다 사라진다
        w.v.y -= 9 * dt; pos.addScaledVector(w.v, dt); if (pos.y < ground) { pos.y = ground; w.v.set(0, 0, 0); }
        if (w.t > 1.2) { w.m.scale.setScalar(Math.max(.01, 1 - (w.t - 1.2) / .4)); }
        if (w.t > 1.6) { w.m.removeFromParent(); fireworks.splice(i, 1); }
      }
    } else if (w.kind === "paper") {
      const life = w.life || 2.6, k = Math.max(0, 1 - dt * 3.5);
      for (let j = 0; j < w.P.length; j++) { const q = w.P[j]; q.v.multiplyScalar(k); q.v.y -= 2.4 * dt;
        if (q.v.y < -.9) q.v.y = -.9;   // 종이는 천천히 떨어진다
        q.p.x += (q.v.x + Math.sin(w.t * 6 + q.ph) * .25) * dt; q.p.y = Math.max(w.floor, q.p.y + q.v.y * dt); q.p.z += q.v.z * dt;
        if (q.p.y > w.floor) { q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt; } else q.r.x = -Math.PI / 2;
        w.mt.compose(q.p, w.q.setFromEuler(q.r), w.one); w.m.setMatrixAt(j, w.mt); }
      w.m.instanceMatrix.needsUpdate = true; w.m.material.opacity = clamp((life - w.t) / .6, 0, 1);
      if (w.t >= life) { w.m.removeFromParent(); w.m.material.dispose(); w.m.dispose(); fireworks.splice(i, 1); }
    } else {
      const pos = w.m.geometry.attributes.position, life = 1.6;   // 팍 퍼졌다가 공기에 금방 느려지고, 색종이처럼 하늘하늘 떨어져 바닥에 멈춘다
      for (let k = 0; k < w.v.length; k++) { const vv = w.v[k]; vv.multiplyScalar(Math.max(0, 1 - dt * 3.2)); vv.y -= 3 * dt; pos.array[k * 3] += vv.x * dt; pos.array[k * 3 + 1] = Math.max(w.floor, pos.array[k * 3 + 1] + vv.y * dt); pos.array[k * 3 + 2] += vv.z * dt; }
      pos.needsUpdate = true; w.m.material.opacity = clamp((life - w.t) / .5, 0, 1);
      if (w.t >= life) { w.m.removeFromParent(); w.m.geometry.dispose(); w.m.material.dispose(); fireworks.splice(i, 1); }
    }
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
  if (name === "dance") a.act.style = a.act.seed % DANCES.length;
  if (name === "draw") { a.board = makeBoard(a.act.seed); a.board.npc = NPCS.includes(a); scene.add(a.board.mesh); }
  if (name === "laptop" || name === "coffee" || name === "gun" || name === "read") { a.prop = name === "laptop" ? makeLaptop() : name === "gun" ? makePaperGun() : name === "read" ? makeBook(a.act.seed) : makeIcedCoffee(); scene.add(a.prop); }
}
// 춤 열 가지: Z를 누를 때마다 방금 춘 것 말고 하나를 고른다(번호는 seed % 10, 다른 크루에겐 dn = 번호 + 1로 간다)
const DANCES = ["통통 춤", "파도 춤", "빙글빙글 춤", "만세 점프", "로봇 춤", "디스코", "트위스트", "박수 춤", "헤드뱅", "셔플"];
let lastDance = -1;
function nextDance() { let k = Math.floor(Math.random() * (DANCES.length - 1)); if (k >= lastDance && lastDance >= 0) k++; return (lastDance = k); }
// 인벤토리 물건: 노트북(펼친 화면에 코드), 아이스 아메리카노(투명 컵에 얼음·빨대)
const BOOK_TILT = -.45;   // 독서대 위 책이 뒤로 눕는 각(위가 읽는 사람 반대쪽)
// 펼친 책: 단단한 표지 위에 살짝 V로 벌어진 두 쪽(글줄이 적혀 있다), 가끔 한 장이 넘어간다. 앞(+z)이 읽는 사람 쪽
const BOOK_COVERS = [0x4A6FB5, 0xD9534F, 0x3F8F5A, 0xE0A23B, 0x7B5BD6];
const pageTex = canvasTex(128, 160, (g) => { g.fillStyle = "#FBF8EF"; g.fillRect(0, 0, 128, 160); g.fillStyle = "#9A968C"; const r = rng(5); for (let y = 16; y < 150; y += 9) g.fillRect(12, y, 104 - r() * (y % 5 === 0 ? 50 : 14), 3); });
function makeBook(seed = 0) {
  const g = new THREE.Group(), bk = new THREE.Group(), pw = .13, ph = .18, cov = BOOK_COVERS[Math.abs(seed | 0) % BOOK_COVERS.length];
  g.add(bk); g.userData.bk = bk;   // bk: 책(위 모서리가 원점, 쪽이 아래로 늘어진다). g: 독서대까지 담는 바깥 묶음
  for (const sd of [-1, 1]) {
    const half = new THREE.Group(); half.rotation.y = sd * -.22; bk.add(half);
    box(half, pw + .012, ph + .012, .008, cov, sd * (pw / 2 + .004), -ph / 2 - .006, -.006, { line: .004, cast: false });   // 표지
    box(half, pw, ph, .01, 0xFBF8EF, sd * pw / 2, -ph / 2, .003, { line: 0, cast: false });   // 종이 묶음
    board(half, pw - .012, ph - .016, pageTex, sd * pw / 2, 0, .0085);
  }
  const flip = new THREE.Group(); flip.rotation.y = -.22; bk.add(flip); g.userData.flip = flip;   // 넘어가는 한 장: 오른쪽 쪽과 같은 각에서 책등을 축으로 앞(+z) 위를 지나 왼쪽으로
  board(flip, pw - .012, ph - .016, pageTex, pw / 2, 0, .012);
  // 나무 독서대(책상에 앉아 읽을 때만): 받침판, 앞 턱, 책 뒤를 받치는 기운 판. 책 기울기 BOOK_TILT와 같은 각
  const stand = new THREE.Group(); stand.visible = false; g.add(stand); g.userData.stand = stand;
  box(stand, .3, .012, .16, C.woodD, 0, 0, 0, { line: .004, cast: false });
  box(stand, .3, .022, .014, C.woodD, 0, .012, .055, { line: .003, cast: false });
  const back = box(stand, .26, .2, .01, C.wood, 0, .012, -.02, { line: .004, cast: false }); back.rotation.x = BOOK_TILT;
  return g;
}
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
function makePaperGun() { // 종이 총(파티 팡팡 총): 노란 몸통, 분홍 손잡이, 앞으로 벌어지는 하늘색 나팔 총구에 색종이가 살짝 삐져나온다. 앞(+z)을 겨눈다
  const g = new THREE.Group();
  box(g, .07, .07, .2, 0xFFD43B, 0, -.035, 0, { line: .008 });
  const grip = box(g, .055, .12, .06, 0xF7A6A0, 0, -.13, -.05, { line: .008 }); grip.rotation.x = -.35;
  box(g, .012, .03, .04, C.dark, 0, -.075, .0, { line: 0 });
  const bell = solidMesh(new THREE.CylinderGeometry(.06, .03, .12, 16, 1, true), 0x7DB3F0, { line: .008 }); bell.rotation.x = Math.PI / 2; bell.position.set(0, 0, .16); g.add(bell);
  for (const [x, y, c] of [[-.02, .015, 0xF15B5B], [.015, -.01, 0x7FCFAE], [.0, .025, 0xFFD43B]]) { const pc = new THREE.Mesh(new THREE.PlaneGeometry(.03, .018), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); pc.position.set(x, y, .205); pc.rotation.set(.4, x * 20, y * 30); g.add(pc); }
  g.traverse((m: any) => { if (m.isMesh) m.castShadow = false; });
  return g;
}
// 종이 총 발사: 총구에서 구겨 뭉친 종이 총알 한 발이 앞으로 쭉 날아간다(살짝 떨어진다). 벽·가구·사람·바닥에 맞으면 종이 부스러기가 톡 튀고 굴러 떨어진다
const BULLET_GEO = new THREE.IcosahedronGeometry(.075, 0), SCRAP_GEO = new THREE.PlaneGeometry(.04, .03);
function shootPaper(f, x, y, dir, lift = 0, shooter = null) {
  const fx = Math.sin(dir), fz = Math.cos(dir), rx = Math.cos(dir), rz = -Math.sin(dir);
  const m = solidMesh(BULLET_GEO, 0xFAF8F2, { line: .01, cast: false });
  m.position.set(wx(x) - rx * .2 + fx * .6, floorY(f) + heightAt(FLOORS[f], x, y) + lift + .6, wz(y) + rz * .2 + fz * .6); scene.add(m);
  fireworks.push({ kind: "bullet", m, v: new THREE.Vector3(fx * 19.5, .6, fz * 19.5), spin: new THREE.Vector3(9, 4, 7), t: 0, f, shooter, hit: false });
}
// 맞으면 머리가 맞은 방향으로 휙 젖혀졌다가 두세 번 흔들리며 돌아온다(0.8초)
function hitReact(a, dir) { a.hitAt = performance.now() / 1000; a.hitDir = dir || 0; }
function applyWobble(a) {
  const r = a.doll?.root; if (!r || a.hitAt === undefined || a.lie) return;
  const e = performance.now() / 1000 - a.hitAt; if (e > .8) { if (a.wobbling) { r.rotation.x = 0; if (a.act?.name !== "dance") r.rotation.z = 0; a.wobbling = false; } return; }
  const k = .38 * Math.exp(-e * 5) * Math.cos(e * 16); a.wobbling = true;
  r.rotation.x = Math.cos(a.hitDir) * k; r.rotation.z = (a.act?.name === "dance" ? r.rotation.z : 0) - Math.sin(a.hitDir) * k;
}
function paperPuff(pos, f, dir) {   // 맞은 자리에 종이 부스러기 몇 장
  const n = 10, im = new THREE.InstancedMesh(SCRAP_GEO, new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide, transparent: true }), n); im.frustumCulled = false; scene.add(im);
  const P = []; for (let i = 0; i < n; i++) { const a = dir + Math.PI + (Math.random() - .5) * 2.2, up = Math.random() * 1.1; P.push({ p: pos.clone(), v: new THREE.Vector3(Math.sin(a) * 1.6, 1 + up * 1.4, Math.cos(a) * 1.6), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), w: new THREE.Vector3((Math.random() - .5) * 16, (Math.random() - .5) * 16, 0), ph: Math.random() * 6 }); im.setColorAt(i, new THREE.Color(i % 3 ? 0xFAF8F2 : 0xE8E4DA)); }
  fireworks.push({ kind: "paper", m: im, P, t: 0, f, floor: floorY(f) + heightAt(FLOORS[f], tX(pos.x), tY(pos.z)) + .02, q: new THREE.Quaternion(), mt: new THREE.Matrix4(), one: new THREE.Vector3(1, 1, 1), life: 1.4 });
}
function endAct(a) { if (a.act?.name === "dance" && a.doll) { a.doll.root.rotation.set(0, 0, 0); a.doll.anim.style = 0; } if (a.prop) { a.prop.removeFromParent(); a.prop = null; } if (a.board) { a.board.mesh.removeFromParent(); a.board.tex.dispose(); a.board.mesh.geometry.dispose(); a.board.mesh.material.dispose(); a.board = null; } a.act = null; }
// 1인칭(내 것만): 몸·팔은 숨기고, 손에 든 것만 화면 앞에 붙여 보여 준다(게임 손 화면처럼). 카메라 기준 자리(오른쪽·아래·앞)
const fpV = new THREE.Vector3(), fpQ = new THREE.Quaternion(), FP_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const fpAt = (obj, x, y, z, turn = true) => { obj.position.copy(camera.localToWorld(fpV.set(x, y, z))); obj.quaternion.copy(camera.quaternion); if (turn) obj.quaternion.multiply(FP_TURN); };
function tickAct(a, dt) {
  if (!a.act) return null;
  const prev = a.act.t; a.act.t += dt; const e = a.act.t, s = SKILLS[a.act.name], p = a.doll.root.position, fp = a === me && VIEW.mode === "first";
  if (a.board) {
    const b = a.board; b.mesh.visible = a.doll.root.visible || fp; b.mesh.position.set(p.x, p.y + 1.6, p.z); b.mesh.rotation.y = cam.yaw;
    if (fp) fpAt(b.mesh, .15, .05, -1.6, false);   // 1인칭: 그리는 네 컷을 눈앞에
    const prog = Math.min(4, Math.max(0, (e - .4) / .9));
    if (Math.abs(prog - b.last) > .03 || (prog >= 4 && b.last < 4)) { drawComic(b.g, b.seed, prog, b.npc); b.tex.needsUpdate = true; b.last = prog; }
    b.mesh.scale.setScalar(.25 + .75 * easeOut(clamp(e / .35, 0, 1)));
    if (prog >= 4 && !b.sparked) { b.sparked = true; if (a.doll.root.visible) spawnFx(starTex, p, 7, 1.2, 1.5); }
    b.mesh.material.opacity = clamp((s.dur - e) / .5, 0, 1);
  }
  if (a.prop) { // 노트북은 앉은 무릎 앞 책상 높이에, 커피는 오른손에 들고 입으로 가져간다
    const h = a.doll.turn.rotation.y, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h); a.prop.visible = a.doll.root.visible || fp; a.prop.rotation.set(0, h, 0);
    if (a.act.name === "gun") { // 오른손(몸의 -x 쪽, 뒤에서 보면 화면 오른쪽)에 쥐고 앞으로 겨눈다. 쏘면 잠깐 뒤로 튄다
      const kick = Math.max(0, (a.kickAt ?? -9) + .18 - performance.now() / 1000) * 1.4;
      a.prop.position.set(p.x - rx * .2 + fx * (.32 - kick), p.y + .6, p.z - rz * .2 + fz * (.32 - kick)); a.prop.rotation.x = -kick * 2;
      if (fp) { fpAt(a.prop, .2, -.2, -.55 + kick * .5); a.prop.rotateX(-kick * 2); } }   // 1인칭: 화면 오른쪽 아래에서 조준점 쪽으로
    else if (a.act.name === "laptop") { { const st = a.seat, desk = st && typeof st === "object" ? st.desk ?? (st.h == null ? .44 : null) : .44, base = p.y - seatLift(st), d = desk == null ? .22 : .42;   // 책상이 있으면 그 위에, 없으면(벤치·소파) 무릎 위에
      a.prop.position.set(p.x + fx * d, desk == null ? p.y + .33 : base + desk + .002, p.z + fz * d); } a.prop.rotation.y = h + Math.PI; const ct = a.prop.userData.code; if (ct) ct.offset.y = (ct.offset.y - dt * .06) % 1; }   // 화면이 나를 본다, 코드는 위로 흘러간다
    else if (a.act.name === "read") { // 책: 의자 앞에 책상이 있으면 독서대에 세워 두고, 빈백에 누우면 얼굴 위로 든다(책상 없는 벤치·소파는 손에 든다). 4초마다 한 장 넘긴다
      const lying = !!a.doll.root.rotation.x, flip = a.prop.userData.flip, bk = a.prop.userData.bk, stand = a.prop.userData.stand;
      if (flip) { const k = (e % 4) / .6; flip.rotation.y = k < 1 ? -.22 - easeOut(k) * (Math.PI - .44) : -.22; flip.visible = k < 1; }   // 음의 방향으로 돌아야 종이가 표지 앞쪽으로 넘어간다(반대로 돌면 표지 뒤로 뚫고 나왔다). 넘기는 동안만 보인다
      const st = a.seat, desk = !lying && st && typeof st === "object" ? st.desk ?? (st.h == null ? .44 : null) : null;
      a.prop.rotation.order = "YXZ"; bk.position.set(0, 0, 0); bk.rotation.set(0, 0, 0); stand.visible = desk != null;
      if (desk != null) { // 노트북처럼 앉은 자리 앞 책상 위에, 독서대에 기대 세운다(화면처럼 읽는 쪽을 본다)
        const base = p.y - seatLift(st), ph = .18;
        a.prop.position.set(p.x + fx * .4, base + desk + .002, p.z + fz * .4); a.prop.rotation.set(0, h + Math.PI, 0);
        bk.rotation.x = BOOK_TILT; bk.position.set(0, .03 + ph * Math.cos(BOOK_TILT), .05 + ph * Math.sin(BOOK_TILT));   // 아래 모서리가 앞 턱에 걸린다
      } else if (lying) { const yaw = a.doll.root.rotation.y, bx = -Math.sin(yaw), bz = -Math.cos(yaw);   // 누우면 머리는 뒤쪽, 얼굴은 위
        a.prop.position.set(p.x + bx * .3, p.y + .5, p.z + bz * .3); a.prop.rotation.set(Math.PI / 2 - .35, yaw + Math.PI, 0); }
      else { a.prop.position.set(p.x + fx * .27, p.y + .56, p.z + fz * .27); a.prop.rotation.set(-.55, h + Math.PI, 0); }
      if (fp && desk == null) { fpAt(a.prop, 0, -.17, -.42, false); a.prop.rotateX(-.45); }   // 1인칭: 손에 들거나 누워 읽을 땐 두 쪽이 눈앞 아래에(책상 위 독서대는 제자리에서 내려다본다)
    }
    else { // 마시기: 0~.7초 컵을 입까지 들고, ~3.4초 빨대로 쪽쪽(커피가 줄고 볼이 오물), ~4초 내리고, 끝에 "캬" 반짝
      const k = e < .7 ? easeOut(e / .7) : e < 3.4 ? 1 : e < 4 ? 1 - easeOut((e - 3.4) / .6) : 0, suck = e > .7 && e < 3.4 ? Math.sin((e - .7) * 9) * .5 + .5 : 0;
      const side = lerp(.26, .03, k), fwd = lerp(.16, .27, k), up = lerp(.5, .54, k) - suck * .004;   // 컵은 세운 채 가슴 앞까지만: 빨대 끝이 입에 닿는다(들이켜지 않는다)
      a.prop.position.set(p.x + rx * side + fx * fwd, p.y + up, p.z + rz * side + fz * fwd); a.prop.rotation.x = -k * .14; a.prop.rotation.z = 0;   // 빨대가 입 쪽으로 살짝 기울 만큼만
      if (fp) { fpAt(a.prop, lerp(.2, .05, k), lerp(-.42, -.2, k) - suck * .006, lerp(-.42, -.26, k)); a.prop.rotateX(-k * .12); }   // 1인칭: 아래에서 컵이 올라와 빨대가 입 앞에(컵은 세운 채)
      const lvl = a.prop.userData.level; if (lvl) lvl.scale.y = clamp(1 - clamp((e - .7) / 2.7, 0, 1) * .45, .05, 1);
      if (e >= 4.05 && prev < 4.05 && a.doll.root.visible) spawnFx(starTex, p, 4, .5, 1.05);
    }
  }
  if (a.act.name === "heart" && Math.floor(e * 3) !== Math.floor(prev * 3) && a.doll.root.visible) spawnFx(heartTex, p, 2, .3, 1.15);
  if (a.act.name === "dance") { // 춤: 몸(튀기·흔들기·돌기)은 여기서, 팔은 Avatar가 같은 번호·박자로 움직인다. 음표가 퐁퐁 (끝날 땐 스르르 멈춘다)
    const beat = e * 2.4 * Math.PI, fade = clamp((s.dur - e) / .4, 0, 1), r = a.doll.root, h = a.doll.turn.rotation.y, st = a.act.style;
    a.doll.anim.style = st; a.doll.anim.actT = e;
    let bounce = 0, sway = 0, spin = 0, lean = 0, side = 0;
    if (st === 0) { bounce = Math.abs(Math.sin(beat)) * .09; sway = Math.sin(beat / 2) * .14; }   // 통통: 박자마다 튀고 좌우로 흔들
    else if (st === 1) { bounce = Math.abs(Math.sin(beat)) * .03; sway = Math.sin(beat / 2) * .1; }   // 파도: 팔로 물결, 몸은 살랑
    else if (st === 2) { spin = e * 5; bounce = Math.abs(Math.sin(beat)) * .05; }   // 빙글빙글: 팔 벌리고 제자리에서 돈다
    else if (st === 3) { bounce = Math.abs(Math.sin(beat / 2)) * .28; }   // 만세 점프: 높이 뛰면서 만세
    else if (st === 4) { const k = Math.floor(e * 2.4); spin = [0, .45, 0, -.45][k % 4]; sway = [0, 0, .08, 0][k % 4]; }   // 로봇: 박자마다 끊어서 휙휙
    else if (st === 5) { bounce = Math.abs(Math.sin(beat)) * .05; sway = Math.sin(beat / 2) * .12; }   // 디스코: 손가락으로 하늘·땅을 번갈아
    else if (st === 6) { spin = Math.sin(beat) * .55; bounce = Math.abs(Math.sin(beat)) * .03; }   // 트위스트: 허리를 좌우로 비튼다
    else if (st === 7) { bounce = Math.abs(Math.sin(beat)) * .07; }   // 박수: 앞에서 짝짝
    else if (st === 8) { lean = Math.abs(Math.sin(beat)) * .32; }   // 헤드뱅: 앞으로 꾸벅꾸벅, 한 손은 락 사인
    else { side = Math.sin(beat / 2) * .14; bounce = Math.abs(Math.sin(beat)) * .06; }   // 셔플: 옆으로 슥슥 미끄러지며 주먹질
    p.y += bounce * fade; p.x += Math.cos(h) * side * fade; p.z -= Math.sin(h) * side * fade;
    r.rotation.order = "YXZ"; r.rotation.set(lean * fade, spin * fade, sway * fade);
    if (Math.floor(e * 1.2) !== Math.floor(prev * 1.2) && a.doll.root.visible && e < s.dur - .4) spawnFx(noteTex, p, 1, .5, 1.3);
  }
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
// 별과 달은 밤에만 보이고, 흐린 날에는 구름 뒤로 숨는다.
const skyStars: THREE.Points[] = [];
let moon: THREE.Sprite;
{ const r = rng(77); for (const [n, color, size] of [[150, 0xF8EBC9, .5], [550, 0xFFFFFF, .32]]) { const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, e = .03 + r() * 1.25, d = 430 + r() * 20; pos.set([Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d, Math.sin(a) * Math.cos(e) * d], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, sizeAttenuation: true, depthWrite: false })); skyStars.push(stars); scene.add(stars); }
  moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, transparent: true, depthWrite: false })); moon.scale.set(4, 4, 1); scene.add(moon); }
// 위성지도와 거리뷰를 참고한 단지 주변 풍경
const GROUND = -34;
const { city, campusTower, paintCity, updateTraffic } = createCityscape(scene, GROUND);
// 별똥별: 몇 초에 한 번, 지금 보고 있는 하늘 쪽으로 긴 꼬리를 그으며 떨어진다
const meteorTex = canvasTex(256, 16, (g) => { const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(.5, "rgba(255,236,170,.5)"); gr.addColorStop(.85, "rgba(255,246,210,.95)"); gr.addColorStop(1, "rgba(255,255,255,1)"); g.fillStyle = gr; g.fillRect(0, 4, 256, 8); const hg = g.createRadialGradient(248, 8, 0, 248, 8, 8); hg.addColorStop(0, "rgba(255,255,255,1)"); hg.addColorStop(1, "rgba(255,240,190,0)"); g.fillStyle = hg; g.fillRect(232, 0, 24, 16); });
const meteors = []; let meteorT = 60;
const _mx = new THREE.Vector3(), _my = new THREE.Vector3(), _mz = new THREE.Vector3(), _mm = new THREE.Matrix4();
function spawnMeteor() {
  const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
  const right = new THREE.Vector3(-f.z, 0, f.x), e = (inside() ? .05 : .15) + Math.random() * .22, side = (Math.random() - .5) * 1.4;
  const dir = f.clone().multiplyScalar(Math.cos(e)).addScaledVector(right, side).setY(Math.sin(e)).normalize();
  const pos = camera.position.clone().addScaledVector(dir, 420);
  const vel = right.clone().multiplyScalar(Math.random() < .5 ? -1 : 1).add(new THREE.Vector3(0, -.55 - Math.random() * .3, 0)).normalize().multiplyScalar(38 + Math.random() * 18);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(14 + Math.random() * 8, .8), new THREE.MeshBasicMaterial({ map: meteorTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(pos); m.renderOrder = 5; scene.add(m); meteors.push({ m, vel, age: 0, life: 1.2 + Math.random() * .8 });
}
function tickMeteors(dt, visibility) {
  meteorT -= dt; if (meteorT <= 0) { meteorT = 90 + Math.random() * 180; if (visibility > .25) spawnMeteor(); }
  for (let i = meteors.length - 1; i >= 0; i--) { const s = meteors[i]; s.age += dt; s.m.position.addScaledVector(s.vel, dt);
    const k = s.age / s.life; s.m.material.opacity = (k < .2 ? k / .2 : Math.max(0, 1 - (k - .2) / .8)) * visibility;
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
const camera = R3F.camera; camera.fov = 38; camera.near = .1; camera.far = 500; camera.updateProjectionMatrix();
const ambient = new THREE.HemisphereLight(0xffffff, 0xCFD6E8, 1.6); scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.castShadow = true; sun.shadow.mapSize.set(narrow() ? 1024 : 2048, narrow() ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 28, bottom: -28, near: 1, far: 95 }); sun.shadow.bias = -.0006; scene.add(sun, sun.target);
const environment = createEnvironment({ scene, camera, ambient, sun, skyStars, moon, paintCity, ground: GROUND });
const cam = { eye: undefined as number | undefined, close: false, ip: .3, ipT: .3, id: 3.2, idT: 3.2, look: 0, lookT: 0, yaw: -.35, pitch: .95, dist: narrow() ? 24 : 29, yawT: -.35, pitchT: .95, distT: narrow() ? 24 : 29, target: new THREE.Vector3() };
const eyeV = new THREE.Vector3(), lookV = new THREE.Vector3(); let fpDt = 0;
// 들어가서 볼 때: 내 뒤(또는 눈높이)에서, 벽 앞에서 멈추고 천장 아래에 머문다
function placeInside() {
  const base = floorY(me.f) + heightAt(floor, me.x, me.y) + me.up + me.jz + seatLift(me.seat), ceil = Math.max(floorY(me.f) + CEIL[me.f] - .12, base + 1.4);   // 계단 위에서는 머리 위로 비켜 준다
  if (VIEW.mode === "first") {
    // 1인칭은 어지럽지 않게: 기울임·흔들림 없이, 눈높이는 계단·단을 오를 때 툭툭 끊기지 않게 부드럽게 따라가고, 고개는 제자리에서 돈다
    // 누우면 눈은 빈백 가운데가 아니라 applyLie로 눕힌 머리 자리(등받이 쪽으로 .39, 위로 .86): 낮으면 빈백 몸통 속에 묻혀 화면이 까맣게 가린다
    const eyeT = base + (me.lie ? .86 : me.seat ? .72 : .92), back = me.lie ? -.39 : 0;
    cam.eye = cam.eye === undefined || Math.abs(cam.eye - eyeT) > 2 ? eyeT : lerp(cam.eye, eyeT, Math.min(1, fpDt * 12));
    const eye = cam.eye;
    camera.position.set(wx(me.x) + (me.lie ? Math.sin(me.lie.yaw) * back : 0), eye, wz(me.y) + (me.lie ? Math.cos(me.lie.yaw) * back : 0));
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
  eyeV.set(wx(me.x) - dirX * 1.4, head - .05, wz(me.y) - dirZ * 1.4);
  camera.lookAt(eyeV);   // 내 앞쪽을 바라본다
}
function setView(mode) {
  VIEW.mode = mode;
  document.getElementById("viewBtn").textContent = TOUCH ? "시점 변환" : { top: "들어가기", third: "1인칭", first: "위에서 보기" }[mode];   // 모바일은 이름을 고정해 헷갈리지 않게
  if (mode === "third") { cam.ipT = cam.ip = .3; cam.idT = cam.id = 3.2; }
  if (mode === "first") { cam.lookT = cam.look = 0; }
  if (mode !== "top") { cam.yawT = cam.yaw = me.h + Math.PI; lockMouse(); }    // 내가 바라보는 쪽이 정면, 바로 마우스 고정
  else if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  document.getElementById("cross").hidden = !(mode === "first" || locked());
  showFloors(); showToast({ top: "위에서 보기", third: "들어가서 보기", first: "1인칭으로 보기" }[mode], mode === "top" ? "캠퍼스를 한눈에 내려다봐요. V로 다시 들어갈 수 있어요." : "마우스로 둘러봐요(커서는 숨겨져요). Esc로 커서를 다시 꺼내요.", 3200);
}
function placeCamera() { const c = Math.cos(cam.pitch); camera.position.set(cam.target.x + Math.sin(cam.yaw) * c * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * c * cam.dist); camera.lookAt(cam.target); }
const floorGroups = {};
const groupOf = (f) => floorGroups[f] || (floorGroups[f] = (() => { const fl = FLOORS[f], g = buildFloor(fl); bakeCollision(fl, g); batchFloor(fl, g); scene.add(g); tagCull(fl, g); seatNPCs(f); return g; })());
// 정밀 충돌: 벽·가구 메시를 몸 높이 띠(바닥 위 COL_LO~COL_HI)로 잘라 바닥에 비친 모양을 FN×FN 조각 판에 찍는다(조금이라도 걸치면 막힘)
// 원래 막던 칸(격자) 안에서만 깎으므로 걸어서 닿던 곳이 새로 막히지는 않는다. 둥근 카운터처럼 칸 격자가 모양을 못 따라가는 것은 자리 전체에서 깎는다
const COL_LO = .06, COL_HI = 1.5, SHAPE_ONLY = new Set(["stadium", "tower"]);
function bakeCollision(fl, G) {
  G.updateMatrixWorld(true);
  const base = floorY(fl.f), fine = new Uint8Array(NW * NH), ftop = new Float32Array(NW * NH), hard = new Uint8Array(NW * NH);
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  // 막힌 조각마다 mark(조각 번호). allow(칸 x, y)가 거짓인 칸은 건너뛴다
  const stamp = (roots, allow, mark) => {
    const meshes = []; for (const r of roots) r.traverse((m) => { if (m.isMesh && !m.isInstancedMesh && m.material !== inkMat && m.material !== inkSoft && m.geometry?.attributes?.position) meshes.push(m); });
    for (const m of meshes) {
      const pos = m.geometry.attributes.position, idx = m.geometry.index, n = idx ? idx.count : pos.count;
      for (let t = 0; t + 2 < n; t += 3) {
        for (let k = 0; k < 3; k++) { v[k].fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(m.matrixWorld); v[k].y -= base; }
        let poly = v.map((p) => [tX(p.x), p.y, tY(p.z)]);
        poly = clipY(clipY(poly, COL_LO, 1), COL_HI, -1); if (!poly.length) continue;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [px, , pz] of poly) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, pz); y1 = Math.max(y1, pz); }
        const pts = poly.map(([px, , pz]) => [px * FN, pz * FN]);
        for (let j = Math.max(0, Math.floor(y0 * FN)); j <= Math.min(NH - 1, Math.floor(y1 * FN)); j++) for (let i = Math.max(0, Math.floor(x0 * FN)); i <= Math.min(NW - 1, Math.floor(x1 * FN)); i++)
          if (allow(Math.floor(i / FN), Math.floor(j / FN)) && polyHitsCell(pts, i, j)) mark(j * NW + i);
      }
    }
  };
  stamp([fl.walls], (x, y) => fl.grid[y * W + x], (i) => { fine[i] = 1; hard[i] = 1; });   // 방 벽 + 벽 묶음에 그리는 기둥·짧은 벽
  for (const o of fl.furn) {
    if (o.kind === "void") { for (let j = o.y * FN; j < (o.y + o.h) * FN; j++) for (let i = o.x * FN; i < (o.x + o.w) * FN; i++) { fine[j * NW + i] = 1; hard[j * NW + i] = 1; } continue; }   // 뚫린 바닥은 통째로 막는다
    const cells = new Set(); furnCells(fl, o, (x, y) => cells.add(y * W + x)); if (!cells.size && !SHAPE_ONLY.has(o.kind)) continue;
    const allow = SHAPE_ONLY.has(o.kind) ? (x, y) => inRect(o, x + .5, y + .5) : (x, y) => cells.has(y * W + x), h = TOPS[o.kind] && !o.lift ? TOPS[o.kind] : 0;
    stamp(fl.furnRoots.get(o) || [], allow, (i) => { fine[i] = 1; if (h) ftop[i] = Math.max(ftop[i], h); else hard[i] = 1; });
  }
  for (let i = 0; i < NW * NH; i++) if (hard[i]) ftop[i] = 0;
  Object.assign(fl, { fine, ftop }); fl.furnRoots = null;
  buildNav(fl);
}
// 다각형 [x, y, z]를 y = lim 평면으로 자른다(sgn 1: 위쪽만, -1: 아래쪽만 남긴다)
function clipY(poly, lim, sgn) {
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length], ia = (a[1] - lim) * sgn >= 0, ib = (b[1] - lim) * sgn >= 0;
    if (ia) out.push(a);
    if (ia !== ib) { const t = (lim - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, lim, a[2] + (b[2] - a[2]) * t]); }
  }
  return out;
}
// 볼록 다각형(점·선분으로 납작해진 것 포함)이 조각 (i, j)의 정사각형과 겹치는지: 분리축 검사
function polyHitsCell(pts, i, j) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < i || x0 > i + 1 || y1 < j || y0 > j + 1) return false;
  const cs = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]];
  for (let k = 0; k < pts.length; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % pts.length], nx = ay - by, ny = bx - ax; if (Math.abs(nx) + Math.abs(ny) < 1e-9) continue;
    let p0 = Infinity, p1 = -Infinity; for (const [x, y] of pts) { const d = x * nx + y * ny; p0 = Math.min(p0, d); p1 = Math.max(p1, d); }
    let c0 = Infinity, c1 = -Infinity; for (const [x, y] of cs) { const d = x * nx + y * ny; c0 = Math.min(c0, d); c1 = Math.max(c1, d); }
    if (p1 < c0 - 1e-9 || p0 > c1 + 1e-9) return false;
  }
  return true;
}
// 정적 묶기: 층을 지은 뒤 움직이지 않는 메시(가구 몸통·먹선 윤곽·판)를 재질·그림자·구역별로 한 메시로 합친다.
// 모양·색은 그대로이고 그리기 호출만 수천 → 수백으로 준다. 따로 움직이거나 켜고 끄는 묶음(벽·표지판·천장·조명)은 그 안에서만 합친다
const BATCH_CELL = 16;
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
  // 비어 버린 묶음 정리(noMerge 안쪽은 건드리지 않는다: 가판대 캐릭터처럼 React가 나중에 채우는 빈 묶음이 있다)
  const prune = (o) => { for (const ch of [...o.children]) { if (skip.has(ch) || ch.userData.noMerge) continue; prune(ch); if (ch.type === "Group" && !ch.children.length && !ch.userData.noMerge) o.remove(ch); } };
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

/* ════════════════ 하루들 부스: 함께 그리는 이젤 · 붓 ════════════════
   붓은 부스 안에서만 들 수 있다(붓 꽂이에서 F). 붓을 든 채 이젤을 누르면(F·클릭) 그림판이 열린다.
   획은 서버가 모아 모두에게 나눈다: 그리는 동안 조각(seg)을 보내 실시간으로 보이고, 뒤로/앞으로가기는 내 획만 */
let netSend: (m: any) => void = () => { }, netUp = false;
const ezBoards: THREE.Mesh[] = [];
// 함께 그리는 판은 여럿: "easel"(하루들 부스 네컷 이젤), "wb"(12층 코워킹 존 벽 화이트보드). 그림판이 지금 여는 판은 ezCur
let ezCur = "easel";
const ezBoardsState = new Map();
/* 크루 주소: ww.uid는 이 브라우저만 아는 비밀값이라 서버에만 보낸다. 다른 크루에게 보이는 내 주소(p_…)는 서버가 접속 때 알려 준다(WS "me") */
const secretUid = () => { let v = LS.get("ww.uid"); if (!v || v.length < 20) { const a = new Uint8Array(16); crypto.getRandomValues(a); v = [...a].map((x) => x.toString(16).padStart(2, "0")).join(""); LS.set("ww.uid", v); } return v; };
let myPub: string | null = null;
const selfU = () => myPub || "local";
function ezState(b = ezCur) {
  if (ezBoardsState.has(b)) return ezBoardsState.get(b);
  const mk = () => { const c = document.createElement("canvas"); c.width = c.height = 1024; return c; };
  const base = mk(), show = mk(); show.id = "ezCanvas";
  const s0 = { b, base, show, bg: base.getContext("2d"), sg: show.getContext("2d"), tex: null, strokes: [] as any[], live: new Map(), redo: [] as string[], n: 0, cur: null, need: 2 } as any;
  ezBoardsState.set(b, s0); return s0;
}
function ezTexture(b = "easel") { const S = ezState(b); if (!S.tex) { S.tex = new THREE.CanvasTexture(S.show); S.tex.colorSpace = THREE.SRGBColorSpace; S.tex.anisotropy = 8; ezRedraw(true, S); } return S.tex; }
// 네컷 틀: 흰 종이에 네 칸, 위에 제목, 아래에 @harudle.official (획 위에 다시 그려 틀이 늘 보인다)
const EZ_M = 44, EZ_TOP = 96, EZ_BOT = 70, EZ_GAP = 26;
function ezFrame(g, onlyLines = false, b = "easel") {
  if (!onlyLines) { g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, 1024, 1024); }
  if (b === "wb") return;   // 화이트보드는 틀 없이 하얀 판
  g.strokeStyle = "#111118"; g.lineWidth = 8; g.lineJoin = "round";
  const pw = (1024 - EZ_M * 2 - EZ_GAP) / 2, ph = (1024 - EZ_TOP - EZ_BOT - EZ_GAP) / 2;
  for (let i = 0; i < 4; i++) g.strokeRect(EZ_M + (i % 2) * (pw + EZ_GAP), EZ_TOP + Math.floor(i / 2) * (ph + EZ_GAP), pw, ph);
  g.fillStyle = "#111118"; g.textBaseline = "middle"; g.font = `800 44px "Pretendard","Apple SD Gothic Neo",sans-serif`; g.textAlign = "left"; g.fillText("함께 그리는 네컷", EZ_M, 52);
  g.font = `700 26px "Pretendard","Apple SD Gothic Neo",sans-serif`; g.textAlign = "right"; g.fillText("@harudle.official", 1024 - EZ_M, 1024 - 34); g.fillStyle = "#7B5BD6"; g.textAlign = "left"; g.fillText("# 하루들 부스", EZ_M, 1024 - 34);
}
function ezStroke(g, st) {
  const p = st.p, k = 1.024; if (p.length < 2) return;
  g.strokeStyle = g.fillStyle = st.c; g.lineWidth = st.w; g.lineCap = "round"; g.lineJoin = "round";
  if (p.length === 2) { g.beginPath(); g.arc(p[0] * k, p[1] * k, st.w / 2, 0, 7); g.fill(); return; }
  g.beginPath(); g.moveTo(p[0] * k, p[1] * k); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * k, p[i + 1] * k); g.stroke();
}
// need: 2 = 바탕부터 다시, 1 = 진행 중인 획만 다시
function ezRedraw(full = false, S = ezState()) {
  if (full) S.need = 2; else S.need = Math.max(S.need, 1);
  if (S.raf) return; S.raf = requestAnimationFrame(() => {
    S.raf = 0;
    if (S.need === 2) { ezFrame(S.bg, false, S.b); for (const st of S.strokes) if (!st.h) ezStroke(S.bg, st); ezFrame(S.bg, true, S.b); }
    S.sg.drawImage(S.base, 0, 0); for (const st of S.live.values()) ezStroke(S.sg, st); if (S.cur) ezStroke(S.sg, S.cur); if (S.live.size || S.cur) ezFrame(S.sg, true, S.b);
    S.need = 0; if (S.tex) S.tex.needsUpdate = true;
  });
}
function ezCommit(st, S = ezState()) { S.strokes.push(st); if (S.strokes.length > 2500) S.strokes.splice(0, S.strokes.length - 2500); ezStroke(S.bg, st); ezFrame(S.bg, true, S.b); ezRedraw(false, S); }
// 서버에서 온 이젤 소식
function easelNet(m) {
  const S = ezState(m.b === "wb" ? "wb" : "easel");
  if (m.k === "all") { S.strokes = (m.strokes || []).filter((x) => x && Array.isArray(x.p)); S.live.clear(); ezRedraw(true, S); }
  else if (m.k === "seg") { let st = S.live.get(m.id); if (!st) S.live.set(m.id, (st = { id: m.id, u: m.u, c: m.c, w: m.w, p: [], h: 0 })); st.p.push(...m.p); ezRedraw(false, S); }
  else if (m.k === "end") { const st = S.live.get(m.id); if (st) { S.live.delete(m.id); ezCommit(st, S); } }
  else if (m.k === "vis") { const st = S.strokes.find((x) => x.id === m.id); if (st) { st.h = m.h; ezRedraw(true, S); } }
}
// 그리기(내 획): 누르면 시작, 움직이면 점을 더하고 0.05초마다 조각으로 보낸다, 떼면 끝
function ezBegin(x, y, c, w) { const S = ezState(); S.cur = { id: `${selfU()}-${Date.now().toString(36)}-${S.n++}`, u: selfU(), c, w, p: [x, y], h: 0 }; S.sent = 0; S.lastSend = 0; S.redo = []; ezRedraw(); }
function ezMove(x, y) { const S = ezState(), st = S.cur; if (!st) return; const n = st.p.length; if (Math.hypot(st.p[n - 2] - x, st.p[n - 1] - y) < 1.5) return; st.p.push(x, y); ezRedraw(); const now = performance.now(); if (now - S.lastSend > 50) ezFlush(); }
function ezFlush() { const S = ezState(), st = S.cur; if (!st || st.p.length <= S.sent) return; const from = Math.max(0, S.sent), chunk = st.p.slice(from, from + 400); if (chunk.length < 2) return; netSend({ t: "ez", b: S.b, k: "seg", id: st.id, c: st.c, w: st.w, p: chunk }); S.sent = from + chunk.length; S.lastSend = performance.now(); if (S.sent < st.p.length) ezFlush(); }
function ezEnd() { const S = ezState(), st = S.cur; if (!st) return; ezFlush(); netSend({ t: "ez", b: S.b, k: "end", id: st.id }); S.cur = null; ezCommit(st); }
function ezUndo() { const S = ezState(); for (let i = S.strokes.length - 1; i >= 0; i--) { const st = S.strokes[i]; if (st.u === selfU() && !st.h) { st.h = 1; S.redo.push(st.id); netSend({ t: "ez", b: S.b, k: "undo" }); ezRedraw(true); return; } } }
function ezRedoOne() { const S = ezState(), id = S.redo.pop(), st = id && S.strokes.find((x) => x.id === id); if (st) { st.h = 0; netSend({ t: "ez", b: S.b, k: "redo" }); ezRedraw(true); } }
// 바로가기: harudle.com · 인스타그램. 누르거나(클릭·탭) 앞에서 F → 새 탭
const linkBoards: THREE.Mesh[] = [];
function openLink(url) { if (locked()) document.exitPointerLock(); window.open(url, "_blank", "noopener"); showToast("새 탭으로 열었어요", url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""), 2000);
  if (url.includes("instagram.com") && !unlocked("airpods")) { LS.set("ww.unlock.airpods", "1"); saveCharacter(); renderAvPanel(); setTimeout(() => showToast("🎧 에어팟이 풀렸어요!", "캐릭터 외형 수정 › 귀에서 골라 보세요.", 4200), 1200); }   // 하루들 부스 인스타그램 바로가기를 한 번 열면 해금
  else if (url.startsWith("https://www.harudle.com") && !unlocked("headset")) setTimeout(() => showToast("네컷만화를 피드에 올려 보세요", "올린 피드 링크를 캐릭터 외형 수정 › 귀 › 🔒 헤드셋에 붙여넣으면 헤드셋이 풀려요.", 5200), 1200);
}
// 잠긴 장식(LOCKED_OPTIONS): 이 브라우저에서 풀었는지. 푸는 방법은 장식마다 다르다
const unlocked = (v) => LS.get(`ww.unlock.${v}`) === "1";
const LOCK_TIPS = { airpods: "하루들 이벤트 부스를 찾아가 인스타그램 팔로우하면 해금돼요", headset: "하루들 이벤트 부스에서 '네컷만화 만들러 가기'로 만화를 만들어 피드에 올린 뒤, 그 링크를 붙여넣으면 해금돼요" };
// 헤드셋: 하루들 피드 링크를 붙여넣으면 서버가 하루들에 그 피드가 있는지 물어보고 푼다(서버가 없으면 링크 모양만 본다)
const FEED_LINK = /^https?:\/\/(?:www\.)?harudle\.com\/feeds\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;
const avUnlock = { open: false, link: "", msg: "", busy: false };
async function tryFeedUnlock() {
  const m = FEED_LINK.exec(avUnlock.link.trim()); if (!m) { avUnlock.msg = "하루들 피드 링크(https://www.harudle.com/feeds/…)를 붙여넣어 주세요."; renderAvPanel(); return; }
  avUnlock.busy = true; avUnlock.msg = "피드를 확인하는 중…"; renderAvPanel();
  let ok = true; try { const r = await fetch(`/api/feed-check?id=${m[1]}`); if (r.status === 404) ok = false; } catch { }
  avUnlock.busy = false;
  if (!ok) { avUnlock.msg = "그 피드를 찾을 수 없어요. 피드에 올린 뒤 공유 링크를 다시 붙여넣어 주세요."; renderAvPanel(); return; }
  LS.set("ww.unlock.headset", "1"); avUnlock.open = false; avUnlock.msg = ""; setMyAv({ ...myAv, ear: "headset" });
  showToast("🎧 헤드셋이 풀렸어요!", "에어팟 맥스를 바로 껴 봤어요. 귀에서 언제든 바꿀 수 있어요.", 4200);
}
const siteTex = canvasTex(512, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#EFE7FB"); gr.addColorStop(1, "#C9B8F0"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#111118"; g.font = `800 92px "Pretendard","Apple SD Gothic Neo",sans-serif`; g.fillText("Harudle", w / 2, 150);
  g.fillStyle = "#7B5BD6"; g.font = `800 52px "Pretendard","Apple SD Gothic Neo",sans-serif`; g.fillText("네컷만화 만들러 가기", w / 2, 255);
  g.fillStyle = "#7B5BD6"; g.beginPath(); g.roundRect(76, 330, w - 152, 108, 54); g.fill();
  g.fillStyle = "#FFFFFF"; g.font = `800 50px "Pretendard","Apple SD Gothic Neo",sans-serif`; g.fillText("harudle.com ↗", w / 2, 386);
  g.fillStyle = "#4A3A80"; g.font = `600 30px "Pretendard","Apple SD Gothic Neo",sans-serif`; g.fillText("눌러서 바로가기", w / 2, 475);
});
const instaTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(140, 300, 372, 60); gr.addColorStop(0, "#FEDA75"); gr.addColorStop(.35, "#FA7E1E"); gr.addColorStop(.6, "#D62976"); gr.addColorStop(.85, "#962FBF"); gr.addColorStop(1, "#4F5BD5");
  g.fillStyle = gr; g.beginPath(); g.roundRect(146, 50, 220, 220, 60); g.fill();   // 인스타그램 아이콘: 둥근 사각 + 동그라미 + 점
  g.strokeStyle = "#FFFFFF"; g.lineWidth = 17; g.beginPath(); g.roundRect(184, 88, 144, 144, 40); g.stroke(); g.beginPath(); g.arc(256, 160, 34, 0, 7); g.stroke();
  g.fillStyle = "#FFFFFF"; g.beginPath(); g.arc(301, 116, 10, 0, 7); g.fill();
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#111118"; g.font = `800 44px "Pretendard","Apple SD Gothic Neo",sans-serif`; g.fillText("@harudle.official", w / 2, 335);
  g.fillStyle = "#D62976"; g.beginPath(); g.roundRect(106, 386, w - 212, 84, 42); g.fill();
  g.fillStyle = "#FFFFFF"; g.font = `800 38px "Pretendard","Apple SD Gothic Neo",sans-serif`; g.fillText("인스타 바로가기 ↗", w / 2, 429);
});
// 하루들 선물 입간판: 하루들에서 해 보면 풀리는 귀 장식 둘(LOCKED_OPTIONS)과 받는 법
const giftTex = canvasTex(512, 768, (g, w) => {
  const pf = (wt, px) => `${wt} ${px}px "Pretendard","Apple SD Gothic Neo",sans-serif`, ink = "#111118";
  g.fillStyle = "#FFFDF6"; g.fillRect(0, 0, w, 768); g.fillStyle = "#7B5BD6"; g.fillRect(0, 0, w, 190);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#FFD43B"; g.font = pf(800, 32); g.fillText("캐릭터 귀 장식", w / 2, 44);
  g.fillStyle = "#FFFFFF"; g.font = pf(800, 54); g.fillText("하루들에서", w / 2, 100); g.fillText("예쁜 아이템 받기", w / 2, 154);
  const card = (y, title, l1, l2, icon) => {
    g.fillStyle = "#FFFFFF"; g.strokeStyle = ink; g.lineWidth = 5; g.beginPath(); g.roundRect(28, y, w - 56, 200, 28); g.fill(); g.stroke();
    g.fillStyle = "#EFE7FB"; g.beginPath(); g.arc(112, y + 100, 66, 0, 7); g.fill(); icon(112, y + 100);
    g.textAlign = "left"; g.fillStyle = ink; g.font = pf(800, 44); g.fillText(title, 200, y + 54);
    g.fillStyle = "#4A3A80"; g.font = pf(600, 30); g.fillText(l1, 200, y + 112); g.fillText(l2, 200, y + 152); g.textAlign = "center";
  };
  card(214, "헤드셋", "네컷만화 그려", "피드에 올리기", (cx, cy) => {   // 머리띠 + 보라 귀컵 둘
    g.strokeStyle = ink; g.lineWidth = 9; g.beginPath(); g.arc(cx, cy + 4, 36, Math.PI, 0); g.stroke();
    g.fillStyle = "#B39DDB"; g.lineWidth = 5; for (const k of [-1, 1]) { g.beginPath(); g.roundRect(cx + k * 36 - 15, cy - 4, 30, 44, 12); g.fill(); g.stroke(); }
  });
  card(436, "에어팟", "하루들 인스타", "팔로우하기", (cx, cy) => {   // 하얀 콩나물 둘
    g.fillStyle = "#FFFFFF"; g.strokeStyle = ink; g.lineWidth = 5;
    for (const k of [-1, 1]) { const bx = cx + k * 22; g.beginPath(); g.roundRect(bx - 7, cy - 14, 14, 50, 7); g.fill(); g.stroke(); g.beginPath(); g.arc(bx, cy - 20, 15, 0, 7); g.fill(); g.stroke(); }
  });
  g.fillStyle = "#FFD43B"; g.strokeStyle = ink; g.lineWidth = 5; g.beginPath(); g.roundRect(70, 664, w - 140, 76, 38); g.fill(); g.stroke();
  g.fillStyle = ink; g.font = pf(800, 36); g.fillText("눌러서 받는 법 보기", w / 2, 703);
});
// 받는 법 창: 아이템마다 받았는지와 바로 해 볼 수 있는 버튼(인스타 · 하루들 · 피드 링크 붙여넣기 · 껴 보기)
const gifts = document.getElementById("gifts");
const GIFT_ICON = {
  headset: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 23v-4a11 11 0 0 1 22 0v4" fill="none" stroke="#111118" stroke-width="3.2"/><rect x="4.5" y="20" width="9" height="13" rx="4" fill="#B39DDB" stroke="#111118" stroke-width="2"/><rect x="26.5" y="20" width="9" height="13" rx="4" fill="#B39DDB" stroke="#111118" stroke-width="2"/></svg>`,
  airpods: `<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="#fff" stroke="#111118" stroke-width="2"><rect x="10.5" y="15" width="5" height="18" rx="2.5"/><circle cx="13" cy="13" r="5.5"/><rect x="24.5" y="15" width="5" height="18" rx="2.5"/><circle cx="27" cy="13" r="5.5"/></g></svg>`,
};
const GIFTS = [
  { v: "headset", name: "헤드셋", how: "하루들에서 네컷만화를 그려 피드에 올린 뒤, 그 피드 링크를 붙여넣어요.", acts: [["site", "네컷만화 만들러 가기 ↗"], ["paste", "피드 링크 붙여넣기"]] },
  { v: "airpods", name: "에어팟", how: "하루들 인스타그램(@harudle.official)을 열어 팔로우해요.", acts: [["insta", "인스타 팔로우하러 가기 ↗"]] },
];
function renderGifts() {
  document.getElementById("giftList").innerHTML = GIFTS.map((it) => {
    const got = unlocked(it.v), worn = myAv.ear === it.v;
    const acts = got ? `<button type="button" class="btn${worn ? " ghost" : ""}" data-gift-wear="${it.v}"${worn ? " disabled" : ""}>${worn ? "끼고 있어요" : "껴 보기"}</button>`
      : it.acts.map(([k, l], i) => `<button type="button" class="btn${i ? " ghost" : ""}" data-gift-go="${k}">${l}</button>`).join("");
    return `<li class="${got ? "got" : ""}"><span class="gicon">${GIFT_ICON[it.v]}</span><div><b>${it.name}<em>${got ? "받았어요 ✓" : "🔒 잠김"}</em></b><p>${got ? "캐릭터 외형 수정 › 귀에서 언제든 바꿔 껴요." : it.how}</p><div class="gacts">${acts}</div></div></li>`;
  }).join("");
  // 아래에 하루들 연동: 받은 아이템을 계정에 남기려면 연동하라고 알려 준다(연동을 못 쓰는 서버면 숨김)
  const box = document.getElementById("giftLink"), u = account.user;
  box.hidden = !account.enabled;
  box.innerHTML = u ? `<b>🔗 하루들 ${esc(u.nickname)}(으)로 연동됨</b><p>꾸민 캐릭터와 받은 아이템이 하루들 계정에 저장되고 있어요.</p>`
    : `<b>🔗 하루들 연동하기</b><p>${LINK_PERKS}</p><button type="button" class="btn lav" data-gift-go="link">하루들 연동하기</button>`;
}
function openGifts() { if (locked()) document.exitPointerLock(); renderGifts(); gifts.hidden = false; $("giftsClose").focus(); }
function closeGifts() { gifts.hidden = true; syncCursor(); }
$("giftsClose").onclick = closeGifts;
gifts.addEventListener("click", (e) => {
  if (e.target === gifts) return closeGifts();
  const b = (e.target as HTMLElement).closest("button"); if (!b) return;
  if (b.dataset.giftWear) { setMyAv({ ...myAv, ear: b.dataset.giftWear }); renderGifts(); showToast("귀에 꼈어요", "캐릭터 외형 수정 › 귀에서 언제든 바꿔요.", 2200); }
  else if (b.dataset.giftGo === "site") openLink("https://www.harudle.com/");
  else if (b.dataset.giftGo === "link") startHarudleLogin();
  else if (b.dataset.giftGo === "insta") { openLink("https://www.instagram.com/harudle.official/"); renderGifts(); }   // 인스타를 열면 바로 풀린다
  else if (b.dataset.giftGo === "paste") { gifts.hidden = true; avUnlock.open = true; openAvPanel(); const inp = document.getElementById("avFeedLink") as HTMLInputElement; inp?.scrollIntoView({ block: "center" }); inp?.focus(); }   // 캐릭터 꾸미기의 헤드셋 칸으로
});
// 그림판 창: 미리 고른 색 16개 + RGB 막대 + 색 고르기, 굵기 막대와 미리보기 점, 캔버스 위 굵기 크기의 동그란 커서
const easelEd = document.getElementById("easelEd");
const EZ_SW = ["#111118", "#FFFFFF", "#9A97A3", "#F15B5B", "#FF8C1A", "#FFD43B", "#7FCFAE", "#20B486", "#7DB3F0", "#2F80ED", "#B39DDB", "#7B5BD6", "#F7A6A0", "#E83E8C", "#8B5A2B", "#EBD3AE"];
const ezPen = { c: LS.get("ww.ezc") || "#111118", w: +(LS.get("ww.ezw") || 8), erase: false };   // erase: 지우개 모드(흰 종이색으로 덮는다)
const hex2 = (n) => n.toString(16).padStart(2, "0");
function ezSetColor(c) {
  if (ezPen.erase) ezMode(false);   // 색을 고르면 그리기로 돌아온다
  ezPen.c = c.toLowerCase(); LS.set("ww.ezc", ezPen.c);
  const r = parseInt(ezPen.c.slice(1, 3), 16), g = parseInt(ezPen.c.slice(3, 5), 16), b = parseInt(ezPen.c.slice(5, 7), 16);
  for (const [k, v] of [["R", r], ["G", g], ["B", b]] as [string, number][]) { $<HTMLInputElement>("ez" + k).value = String(v); $("ez" + k + "v").textContent = String(v); }
  $<HTMLInputElement>("ezColor").value = ezPen.c; $("ezHex").textContent = ezPen.c.toUpperCase();
  $all<HTMLButtonElement>("#ezSwatches button").forEach((b2) => b2.classList.toggle("on", b2.dataset.c === ezPen.c));
  ezSizeUI();
}
function ezMode(erase) {
  ezPen.erase = erase;
  for (const [id, on] of [["ezPen", !erase], ["ezEraser", erase]] as [string, boolean][]) { const b2 = $(id); b2.setAttribute("aria-pressed", String(on)); b2.classList.toggle("ghost", !on); }
  $("ezStage").classList.toggle("erasing", erase); ezSizeUI();
}
function ezSizeUI() {
  $<HTMLInputElement>("ezSize").value = String(ezPen.w); $("ezSizeV").textContent = `${ezPen.w}px`;
  const dot = $("ezSizeDot"), stage = $("ezStage"), k = (stage.clientWidth || 600) / 1024, d = Math.max(3, (ezPen.erase ? Math.max(ezPen.w, 10) : ezPen.w) * k);
  Object.assign(dot.style, { width: `${d}px`, height: `${d}px`, background: ezPen.c, boxShadow: ezPen.c === "#ffffff" ? "inset 0 0 0 1px #999" : "" });
  const cur = $("ezCursor"); Object.assign(cur.style, { width: `${d}px`, height: `${d}px`, borderColor: ezPen.c === "#ffffff" || ezPen.c === "#111118" ? "#7B5BD6" : "#111118", background: ezPen.c + "55" });
}
{
  $("ezSwatches").innerHTML = EZ_SW.map((c) => `<button type="button" data-c="${c.toLowerCase()}" style="background:${c}" title="${c}"></button>`).join("");
  $all<HTMLButtonElement>("#ezSwatches button").forEach((b2) => (b2.onclick = () => ezSetColor(b2.dataset.c)));
  for (const k of ["R", "G", "B"]) $("ez" + k).addEventListener("input", () => ezSetColor("#" + ["R", "G", "B"].map((q) => hex2(+$<HTMLInputElement>("ez" + q).value)).join("")));
  $("ezColor").addEventListener("input", () => ezSetColor($<HTMLInputElement>("ezColor").value));
  $("ezSize").addEventListener("input", () => { ezPen.w = +$<HTMLInputElement>("ezSize").value; LS.set("ww.ezw", String(ezPen.w)); ezSizeUI(); });
  $("ezPen").onclick = () => ezMode(false); $("ezEraser").onclick = () => ezMode(true);
  $("ezUndo").onclick = ezUndo; $("ezRedo").onclick = ezRedoOne; $("ezClose").onclick = () => closeEasel();
  const stage = $("ezStage"), cur = $("ezCursor");
  const at = (e) => { const r = stage.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width * 1000, 0, 1000), clamp((e.clientY - r.top) / r.height * 1000, 0, 1000)]; };
  stage.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.preventDefault(); stage.setPointerCapture(e.pointerId); const [px, py] = at(e); ezBegin(Math.round(px), Math.round(py), ezPen.erase ? "#ffffff" : ezPen.c, ezPen.erase ? Math.max(ezPen.w, 10) : ezPen.w); });
  stage.addEventListener("pointermove", (e) => { const r = stage.getBoundingClientRect(); cur.style.display = "block"; cur.style.left = `${e.clientX - r.left}px`; cur.style.top = `${e.clientY - r.top}px`; if (ezState().cur) { const [px, py] = at(e); ezMove(Math.round(px), Math.round(py)); } });
  stage.addEventListener("pointerleave", () => { cur.style.display = "none"; });
  const up = () => ezEnd(); stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  addEventListener("resize", () => { if (!easelEd.hidden) ezSizeUI(); });
}
function openEasel(b = "easel") {
  if (locked()) document.exitPointerLock(); keys.clear(); me.runHold = false;
  ezCur = b; const ht = document.querySelector("#easelEd .ezhead h4"); if (ht) ht.innerHTML = b === "wb" ? "코워킹 존 화이트보드 <small>모두에게 실시간으로 보여요</small>" : "함께 그리는 네컷 <small>모두에게 실시간으로 보여요</small>";
  const stage = $("ezStage"), S = ezState(); for (const o of ezBoardsState.values()) if (o !== S && o.show.parentElement === stage) o.show.remove();
  if (S.show.parentElement !== stage) stage.prepend(S.show);
  easelEd.hidden = false; ezSetColor(ezPen.c); ezMode(false); requestAnimationFrame(ezSizeUI);
}
let menuQuietUntil = 0, relockOnKey = false, holdLock = false;   // Esc로 창을 닫으면 바로 다시 고정하지 않고, 다음 키(사용자 조작)에서 고정한다
function closeEasel(relock = true) { if (ezState().cur) ezEnd(); easelEd.hidden = true; menuQuietUntil = performance.now() + 800; if (relock) syncCursor(); }   // Esc로 닫을 땐 다시 고정하지 않는다(그 Esc가 설정창까지 열지 않게)
// 붓: 하루들 부스 안에서만. 붓 꽂이 앞에서 F로 들고, 다시 F로 꽂는다. 부스 밖으로 나가면 저절로 꽂이로 돌아간다
const boothZone = () => FLOORS[12].zones.find((z) => z.name === "하루들 부스");
const inBooth = () => { const b = boothZone(); return me.f === 12 && !!b && inRect({ x: b.x - .3, y: b.y - .3, w: b.w + .6, h: b.h + .6 }, me.x, me.y); };
const nearFurn = (kind, r) => me.f === 12 && FLOORS[12].furn.some((o) => o.kind === kind && Math.hypot(o.x + o.w / 2 - me.x, o.y + o.h / 2 - me.y) < r);
const nearWb = (r) => nearFurn("wbpost", r) || nearFurn("wbwall", r + 1);   // 함께 쓰는 화이트보드: 나무 기둥 것과 나무 벽의 큰 것(벽이 넓어서 조금 더 멀리서도)
function makeBrush() { // 붓: 나무 자루 + 은색 물림쇠 + 지금 고른 색 붓끝(위를 향해 쥔다)
  const g = new THREE.Group();
  const h = solidMesh(new THREE.CylinderGeometry(.012, .016, .26, 8), C.woodD, { line: .004, cast: false }); h.position.y = .13; g.add(h);
  const f2 = solidMesh(new THREE.CylinderGeometry(.016, .014, .05, 8), 0xC3C7CD, { line: .003, cast: false }); f2.position.y = .28; g.add(f2);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.018, .07, 8), new THREE.MeshToonMaterial({ color: ezPen.c, gradientMap: gradient })); tip.position.y = .34; g.add(tip); g.userData.tip = tip;
  return g;
}
function holdBrush(a, has, color?) {   // 나·다른 크루 모두: 붓을 들었으면 오른손에
  if (has && !a.brushMesh) { a.brushMesh = makeBrush(); scene.add(a.brushMesh); }
  if (!has && a.brushMesh) { a.brushMesh.removeFromParent(); a.brushMesh = null; }
  if (!a.brushMesh) return;
  const r = a.doll.root, p = r.position, h = a.doll.turn.rotation.y, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
  a.brushMesh.visible = r.visible; a.brushMesh.position.set(p.x + rx * .24 + fx * .12, p.y + .5, p.z + rz * .24 + fz * .12); a.brushMesh.rotation.set(fz * .5, h, -fx * .5);
  if (color) a.brushMesh.userData.tip.material.color.set(color);
}
function toggleBrush() {
  if (me.brush) { me.brush = false; showToast("붓을 꽂아 뒀어요", "", 1400); }
  else { if (me.act && ["gun", "dance"].includes(me.act.name)) endAct(me); me.brush = true; showToast("붓을 들었어요", TOUCH ? "이젤을 눌러 함께 그려요." : "이젤 앞에서 F나 클릭하면 그림판이 열려요.", 2600); }
  sendPresence(true);
}
function tryEasel() {
  if (!me.brush) { showToast("붓이 필요해요", "부스의 붓 꽂이 앞에서 F를 눌러 붓을 먼저 들어요.", 2600); return; }
  openEasel();
}
// 내 캐릭터: 하루들 월드와 같은 부위·색 조합. 이 브라우저에 저장
let myAv = (() => { try { return avDecode(LS.get("ww.avatar")) || { ...DEFAULT_AV }; } catch { return { ...DEFAULT_AV }; } })();
const lookOf = (i) => ({ hair: HAIRS[i % HAIRS.length], acc: ACC[Math.floor(i / HAIRS.length) % ACC.length], prop: "bag" });
const me = { jumps: 0, prop: null, goal: null, lie: null, seat: null, f: 12, x: ELEV_SPAWN[0], y: ELEV_SPAWN[1], h: Math.PI / 2, follow: null as string | null, followAt: 0, rideAt: 0, brush: false, brushMesh: null, fc: 0, fh: 0, fk: 0, kickAt: -9, hc: 0, hd: 0, up: 0, jz: 0, jv: 0, jc: 0, ac: 0, an: null, as: 0, act: null, board: null, runHold: false, runToggle: false, moving: false, say: "", sayAt: 0, path: null };
let floor = FLOORS[12];   // 처음 들어오면 12층 엘리베이터 앞
let meDoll = makeChar(myAv); scene.add(meDoll.root);
Object.defineProperty(me, "doll", { get: () => meDoll });
const running = () => me.runHold || me.runToggle;
function jump() { // 땅에서 한 번, 공중에서 한 번 더(더블 점프)
  if (me.lie || me.seat) { standUp(); return; }
  const air = me.jz > .001 || me.jv > 0; if (air && me.jumps >= 2) return;
  me.jumps = air ? 2 : 1; me.jv = air ? 4.2 : 4.6; if (air) spawnFx(starTex, meDoll.root.position, 3, .5, .2); me.jc++; sendPresence(true);
  // 14층: 뛰어들 수 있는 그림(꽃게 게임 만화) 앞에서 점프하면 월드처럼 그림 속으로 뛰어들어 게임을 시작한다
  const sl = nearShow(); if (sl && showItem(sl)?.dive && !inWorld) { spawnFx(starTex, meDoll.root.position, 8, .9, .4); setTimeout(() => { if (me.f === 14 && !inWorld) openShow("crab"); }, 380); }
}
function useSkill(name) { if (!SKILLS[name]) return;
  if (name === "read") { // 책은 앉거나 빈백에 누워서만. 한 번 더 누르면 덮는다
    if (me.act?.name === "read") { endAct(me); sendPresence(true); return; }
    if (!me.seat && !me.lie) { showToast("앉아서 읽어요", "의자나 빈백 앞에서 F로 앉거나 누운 다음 인벤토리(Tab)에서 책을 골라요.", 2600); return; }
    me.path = null; startAct(me, "read"); me.ac++; me.an = "read"; me.as = me.act.seed; sendPresence(true); showToast("책을 펼쳤어요", "인벤토리에서 책을 다시 고르거나 일어나면 덮어요.", 2000); return;
  } if (name === "dance" && me.act?.name === "dance") { endAct(me); sendPresence(true); return; } if (me.lie) standUp(); me.path = null; startAct(me, name, name === "dance" ? nextDance() : undefined); if (name === "dance") showToast(DANCES[me.act.style], "Z를 다시 누르거나 움직이면 멈춰요.", 1600); me.ac++; me.an = name; me.as = me.act.seed; sendPresence(true); }
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
  for (const r of floor.rooms) if (r.name) roomTags.push({ el: mkLabel(`room-tag${r.planet ? " planet" : ""}`, r.name), x: wx(r.x + r.w / 2), y: WALL + .35, z: wz(r.y + .5), place: true });
  for (const z of floor.zones) if (z.desc && !floor.rooms.some((r) => r.name && z.name.includes(r.name)) && !["엘리베이터 홀", "회의실"].includes(z.name)) roomTags.push({ el: mkLabel("room-tag", z.name), x: wx(z.x + z.w / 2), y: .9, z: wz(z.y + z.h / 2), place: true });
  for (const p of floor.portals) roomTags.push({ el: mkLabel("room-tag port", "⇅ " + p.label), x: wx(p.x + p.w / 2), y: 1.1, z: wz(p.y + p.h / 2) });
  roomTags.push({ el: mkLabel("room-tag", "엘리베이터"), x: wx(ELEV_SPAWN[0]), y: 2.0, z: wz(13.5) });
}
const myTag = mkLabel("name-tag me", "나"), myBub = mkLabel("bub", ""); myBub.hidden = true;
// 빈백에 누운 사람 머리 위 zzz(글자 셋이 차례로 떠오른다)
const mkZzz = () => { const e = mkLabel("zzz", ""); e.innerHTML = "<i>z</i><i>z</i><i>Z</i>"; e.hidden = true; return e; };
const zv = new THREE.Vector3();
function showZzz(el, doll, on) { el.hidden = !on; if (!on) return; doll.root.updateMatrixWorld(); zv.set(0, DOLL, 0); doll.root.localToWorld(zv); project(el, zv.x, zv.y + .25, zv.z); }
const myZzz = mkZzz();
let npcTags = [];
function refreshTags() { npcTags.forEach((t) => { t.tag.remove(); t.bub.remove(); t.zzz.remove(); }); npcTags = NPCS.map((n) => { const tag = mkLabel("name-tag", `${n.p.nick} (NPC)`); const bub = mkLabel("bub", ""); bub.hidden = true; return { n, tag, bub, zzz: mkZzz() }; }); }

/* ════════════════ 10. 입력 (키보드 · 끌어 돌리기 · 휠/핀치 · 클릭 이동) ════════════════ */
const keys = new Set();
// 한글 입력 상태에서는 e.key가 ㅈ·ㅁ·ㄴ·ㅇ로 들어와서 WASD가 안 먹었다 → 자판 위치(e.code)로 읽는다
const MOVE = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", ArrowUp: "arrowup", ArrowDown: "arrowdown", ArrowLeft: "arrowleft", ArrowRight: "arrowright" };
const SKILL_KEY = { Digit1: "draw", Digit2: "wave", Digit3: "heart", Numpad1: "draw", Numpad2: "wave", Numpad3: "heart", KeyZ: "dance" };   // Z: 춤(한 번 누르면 계속, 다시 누르면 멈춤)
addEventListener("keydown", (e) => {
  if (inWorld) return;   // 14층 하루들 월드가 떠 있으면 캠퍼스 키는 쉰다
  if (relockOnKey && e.code !== "Escape" && (e.target as HTMLElement).tagName !== "INPUT") { relockOnKey = false; if (inside() && !locked() && !uiOpen()) lockMouse(); }   // Esc로 설정창을 닫은 뒤 첫 키에서 다시 둘러보기
  if (!easelEd.hidden) { // 그림판이 열려 있으면 게임 키는 쉰다
    if (e.code === "Escape") { e.preventDefault(); closeEasel(false); }
    else if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { e.preventDefault(); if (e.shiftKey) ezRedoOne(); else ezUndo(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") { e.preventDefault(); ezRedoOne(); }
    else if (e.code === "KeyE" && !e.ctrlKey && !e.metaKey && (e.target as HTMLElement).tagName !== "INPUT") { e.preventDefault(); ezMode(!ezPen.erase); }
    return;
  }
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  const c = e.code;
  if (!tour.hidden) { // 안내 중: ←→로 넘기고 Enter·Space·F로 다음, Esc로 건너뛰기
    e.preventDefault();
    if (c === "Escape") closeTour(); else if (c === "ArrowLeft" || c === "KeyA") showTourStep(tourAt - 1); else if (c === "ArrowRight" || c === "KeyD" || c === "Enter" || c === "Space" || c === "KeyF") tourNext.click();
    return;
  }
  if (!gifts.hidden) { if (c === "Escape" || c === "KeyF") { e.preventDefault(); closeGifts(); } return; }   // 받는 법 창: Esc·F로 닫기
  if ($("loginAsk")?.hidden === false) { if (c === "Escape") { e.preventDefault(); closeLoginAsk(); } return; }   // 연동 안내 창: Esc로 닫기, 다른 키는 게임으로 가지 않게
  if (c === "Escape") {
    // 설정창이 떠 있으면 닫는다(막 열린 직후 같은 Esc는 무시). 여기서 바로 마우스를 고정하면 브라우저가 그 Esc로 다시 풀어 버려서
    // pointerlockchange가 설정창을 또 열었다 → 고정은 다음 키나 클릭으로 미루고, 그사이 풀림 신호는 무시한다
    if (!menu.hidden) { if (performance.now() - menuAt > 300) { menu.hidden = true; menuQuietUntil = performance.now() + 800; relockOnKey = true; } return; }
    if (!profile.hidden) { closeProfile(); return; }
    if (!lb.hidden) { lb.hidden = true; return; }   // 크게 본 사진부터 한 겹씩 닫는다(뒤의 크루 피드는 그대로)
    // 창(크루 피드·캐릭터 꾸미기 등)을 닫을 때도 설정창과 같이: 바로 고정하면 같은 Esc에 풀려 설정창이 떴다 → 다음 키에서 고정한다
    if (closeColorPop()) return;   // 색 고르는 창이 떠 있으면 그것부터 닫는다
    const was = uiOpen(); holdLock = true; closePanel(); picker.hidden = true; inv.hidden = true; closeAvPanel(); lb.hidden = true; holdLock = false;
    if (was) { menuQuietUntil = performance.now() + 800; relockOnKey = true; return; }
    if (!TOUCH && !sideTucked) { tuckSide(true); return; }   // 사이드바가 열려 있으면 먼저 접는다
    openMenu(); return;   // 창이 없으면 설정창
  }
  if (!picker.hidden) { // 층 고르기 창: 숫자키로 바로, W/S로 옮기고 F·Space로 고른다(Enter는 버튼이 직접 받는다)
    const bs = $all<HTMLButtonElement>("#pickList button:not([disabled])"), at = bs.indexOf(document.activeElement as HTMLButtonElement);   // 커서로 눌러도 되고 키로 골라도 된다
    const n = { Digit1: 11, Digit2: 12, Digit3: 13, Digit4: 14, Numpad1: 11, Numpad2: 12, Numpad3: 13, Numpad4: 14 }[c];
    if (n) { e.preventDefault(); if (n !== me.f) { closePicker(); goFloor(n, ELEV_SPAWN); } return; }
    if (c === "KeyW" || c === "ArrowUp" || c === "KeyS" || c === "ArrowDown") { e.preventDefault(); const d = c === "KeyW" || c === "ArrowUp" ? -1 : 1; bs[(Math.max(0, at) + d + bs.length) % bs.length]?.focus(); return; }
    if (c === "KeyF" || c === "Space") { e.preventDefault(); (bs[at] || bs[0])?.click(); return; }
    return;
  }
  if (!lb.hidden) return;
  if (c === "KeyC") { e.preventDefault(); if (!e.repeat) fireFirework(); return; }   // C: 앞으로 폭죽
  if (c === "Backslash") { e.preventDefault(); if (!e.repeat) tuckSide(!sideTucked); return; }   // \: 사이드바 접기/펼치기
  if (c === "Tab") { e.preventDefault(); if (!e.repeat) toggleInv(); return; }
  if (!inv.hidden) { const k = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[c]; if (k !== undefined) { e.preventDefault(); useItem(ITEMS[k].id); return; } }   // 인벤토리를 연 채로도 걷기·점프는 그대로
  if (c === "Space") { e.preventDefault(); if (!e.repeat) jump(); return; }
  if (c === "KeyF") { e.preventDefault(); if (!e.repeat) interact(); return; }
  if (c === "Enter" || c === "NumpadEnter") { e.preventDefault(); if (!e.repeat) openChat(); return; }   // Enter: 채팅창으로 들어간다
  if (c === "ShiftLeft" || c === "ShiftRight") { me.runHold = true; return; }
  if (SKILL_KEY[c]) { if (!e.repeat) useSkill(SKILL_KEY[c]); return; }
  if (c === "KeyV") { if (!e.repeat) setView({ top: "third", third: "first", first: "top" }[VIEW.mode]); return; }
  if (c === "KeyQ") { cam.yawT += Math.PI / 4; return; } if (c === "KeyE") { cam.yawT -= Math.PI / 4; return; }
  if (MOVE[c]) { keys.add(MOVE[c]); stopFollow(); me.path = null; me.goal = null; e.preventDefault(); }
});
addEventListener("keyup", (e) => { if (MOVE[e.code]) keys.delete(MOVE[e.code]); if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.key === "Shift") me.runHold = false; });
$all(".skill[data-skill]").forEach((b) => (b.onclick = () => useSkill(b.dataset.skill)));
// 인벤토리(Tab): 마인크래프트처럼 칸에 든 물건을 눌러 쓴다
const ICON = { // 하루들 낙서체 아이콘(검은 선 + 노랑·하늘 포인트)
  laptop: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 12h26v18H11z" fill="#1C2B55" stroke="#111118" stroke-width="2.5" stroke-linejoin="round"/><path d="M15 17h9M15 21h14M15 25h7" stroke="#FFD43B" stroke-width="2" stroke-linecap="round"/><path d="M6 33h36l-3 5H9z" fill="#fff" stroke="#111118" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
  coffee: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M27 4l-3 12" stroke="#111118" stroke-width="2.5" stroke-linecap="round"/><path d="M13 14h22l-3 28H16z" fill="#E8F3FB" stroke="#111118" stroke-width="2.5" stroke-linejoin="round"/><path d="M15 22h18l-2 19H17z" fill="#5A3A24"/><rect x="18" y="18" width="6" height="6" rx="1" fill="#fff" stroke="#111118" stroke-width="1.5"/><rect x="25" y="20" width="5" height="5" rx="1" fill="#fff" stroke="#111118" stroke-width="1.5"/></svg>`,
  book: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 14c-5-4-12-4-17-2v24c5-2 12-2 17 2 5-4 12-4 17-2V12c-5-2-12-2-17 2z" fill="#FBF8EF" stroke="#111118" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 14v24" stroke="#111118" stroke-width="2"/><path d="M11 19h9M11 24h9M11 29h7M28 19h9M28 24h9M28 29h6" stroke="#9A968C" stroke-width="1.8" stroke-linecap="round"/><path d="M7 36c5-2 12-2 17 2 5-4 12-4 17-2v3c-5-2-12-2-17 2-5-4-12-4-17-2z" fill="#4A6FB5" stroke="#111118" stroke-width="2" stroke-linejoin="round"/></svg>`,
  gun: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 18h20v9H8z" fill="#FFD43B" stroke="#111118" stroke-width="2.5" stroke-linejoin="round"/><path d="M28 16l10-5v23l-10-5z" fill="#7DB3F0" stroke="#111118" stroke-width="2.5" stroke-linejoin="round"/><path d="M12 27l-3 11h7l3-11" fill="#F7A6A0" stroke="#111118" stroke-width="2.5" stroke-linejoin="round"/><path d="M40 17l5-3M41 23h5M40 29l5 3" stroke="#111118" stroke-width="2.2" stroke-linecap="round"/><path d="M17 27v4h4" fill="none" stroke="#111118" stroke-width="2" stroke-linecap="round"/></svg>`,
};
const ITEMS = [
  { id: "laptop", name: "노트북", tip: "앉아서 펼치기" },
  { id: "coffee", name: "아아", tip: "아이스 아메리카노", title: "아이스 아메리카노 · 언제든 한 모금" },
  { id: "gun", name: "종이 총", tip: "꺼내서 클릭·F로 발사", title: "종이 총 · 꺼낸 채로 왼쪽 클릭이나 F를 누르면 종이 총알이 슝!" },
  { id: "book", name: "책", tip: "앉거나 누워서 읽기", title: "책 · 의자나 빈백에서 펼쳐 읽어요" },   // 4번 칸
];
const inv = document.getElementById("inv");
const invGrid = document.getElementById("invGrid");
invGrid.innerHTML = Array.from({ length: 9 }, (_, i) => { const it = ITEMS[i]; return it ? `<button type="button" class="slot" data-item="${it.id}" title="${it.title || `${it.name} · ${it.tip}`}"><kbd>${i + 1}</kbd>${ICON[it.id]}<span class="nm">${it.name}</span></button>` : `<div class="slot vacant"></div>`; }).join("");
$all<HTMLButtonElement>("#invGrid [data-item]").forEach((b) => (b.onclick = () => useItem(b.dataset.item)));
function toggleInv() { inv.hidden = !inv.hidden; syncCursor(); }
function useItem(id) {
  if (id === "laptop") {
    if (!me.seat) { showToast("노트북은 앉아서 펼쳐요", "의자 앞에서 F로 앉은 다음 다시 눌러 보세요.", 2600); return; }
    if (me.act?.name === "laptop") { endAct(me); sendPresence(true); inv.hidden = true; syncCursor(); return; }   // 한 번 더 누르면 덮는다
    useSkill("laptop"); showToast("노트북을 펼쳤어요", "일어나면 덮어요. 오늘도 커밋 하나!", 2400);
  } else if (id === "coffee") useSkill("coffee");
  else if (id === "book") useSkill("read");   // 앉거나 누워 있을 때만 펼친다(한 번 더 고르면 덮는다)
  else if (id === "gun") { // 꺼내 들고 다닌다(걸어도 계속). 한 번 더 누르면 넣는다
    if (me.act?.name === "gun") { endAct(me); sendPresence(true); showToast("종이 총을 넣었어요", "", 1400); }
    else { useSkill("gun"); showToast("종이 총을 꺼냈어요", TOUCH ? "🎆를 누르면 종이 총알이 슝!" : "왼쪽 클릭이나 F로 발사! 3을 다시 누르면 넣어요.", 2600); }
  }
  inv.hidden = true; syncCursor();
}
document.getElementById("dFire").onclick = () => fireFirework();   // 아래 독의 폭죽(C와 같다)
/* ───── 모바일: 조이스틱 · 버튼 묶음 ───── */
const mRun = document.getElementById("mRun");
const joy = { on: false, x: 0, y: 0, id: -1, cx: 0, cy: 0 };
{
  const pad = document.getElementById("joy"), knob = document.getElementById("joyKnob"), R = 46;
  const move = (e) => { let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } joy.x = dx / R; joy.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; };
  const end = (e) => { if (e.pointerId !== joy.id) return; joy.on = false; joy.x = joy.y = 0; joy.id = -1; pad.classList.remove("on"); knob.style.transform = ""; };
  pad.addEventListener("pointerdown", (e) => { e.preventDefault(); pad.setPointerCapture(e.pointerId); const r = pad.getBoundingClientRect(); joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2; joy.on = true; joy.id = e.pointerId; stopFollow(); me.path = null; me.goal = null; pad.classList.add("on"); move(e); });
  pad.addEventListener("pointermove", (e) => { if (e.pointerId === joy.id) move(e); });
  pad.addEventListener("pointerup", end); pad.addEventListener("pointercancel", end);
  mRun.onclick = () => { me.runToggle = !me.runToggle; mRun.setAttribute("aria-pressed", String(me.runToggle)); };
  document.getElementById("mJump").addEventListener("pointerdown", (e) => { e.preventDefault(); jump(); });
  document.getElementById("mInv").onclick = () => toggleInv();
  document.getElementById("mFire").onclick = () => fireFirework(me.act?.name === "gun");   // 모바일: 종이 총을 들었으면 총알, 아니면 폭죽
  $all("#mPad [data-skill]").forEach((b) => (b.onclick = () => useSkill(b.dataset.skill)));
  const chatBtn = document.getElementById("mChat"), sayIn = $<HTMLInputElement>("sayInput");
  chatBtn.onclick = () => { if (document.body.classList.toggle("chatting")) { document.body.classList.remove("peopleOpen"); sayIn.focus(); } else sayIn.blur(); };
  sayIn.addEventListener("blur", () => { if (TOUCH) setTimeout(() => document.body.classList.remove("chatting"), 150); });
}
addEventListener("blur", () => { keys.clear(); me.runHold = false; if (me.moving) { me.moving = false; wasMoving = false; sendPresence(true); } pointers.clear(); drag = null; canvas.classList.remove("dragging"); });   // 알트탭: 떼지 못한 클릭이 남아 다음 클릭을 막지 않게
document.getElementById("viewBtn").onclick = () => setView({ top: "third", third: "first", first: "top" }[VIEW.mode]);
document.getElementById("rotL").onclick = () => (cam.yawT += Math.PI / 4);
document.getElementById("rotR").onclick = () => (cam.yawT -= Math.PI / 4);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let drag = null; const pointers = new Map();
const pinchDist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
canvas.addEventListener("pointerdown", (e) => { try { canvas.setPointerCapture(e.pointerId); } catch { } /* 마우스 고정 중엔 캡처가 거절될 수 있다 */ pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY, moved: pointers.size > 1, yaw: cam.yawT, pitch: cam.pitchT, ip: cam.ipT, look: cam.lookT, pinch: pointers.size === 2 ? pinchDist() : 0, dist: cam.distT, id: cam.idT }; });
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
    if (!locked() && boothHit(e.clientX, e.clientY)) { }   // 바로가기·이젤을 눌렀으면 고정하지 않고 바로 연다
    else if (inside() && e.pointerType === "mouse" && !locked()) lockMouse();   // 들어가서 볼 때 누르면 커서를 숨기고 고정
    else if (locked()) { if (picker.hidden && me.act?.name !== "gun") clickAt(innerWidth / 2, innerHeight / 2); }   // 고정 중 클릭(종이 총은 아래 mousedown에서 바로 쏜다)
    else if (me.act?.name === "gun" && e.button === 0 && !TOUCH) { const a = aimAt(e.clientX, e.clientY); fireFirework(true, a); }   // 커서가 보일 때(위에서 보기 등): 누른 곳 쪽으로 발사   // 고정 중엔 화면 가운데(조준점)를 누른 것으로(층 고르는 중엔 무시)
    else clickAt(e.clientX, e.clientY);
  }
  if (pointers.size === 0) drag = null;
};
// 배그처럼: 들어가서 볼 때는 커서를 숨기고 화면에 고정한다. 마우스를 움직인 만큼(화면 끝 없이) 고개가 돌고, 가운데 조준점이 뜬다. Esc로 풀린다
let lockFailed = false;
const locked = () => document.pointerLockElement === canvas;
// 경계: 창(층 고르기·크루 피드·사진·캐릭터 꾸미기·설정)이 떠 있는 동안은 커서를 꺼내 두고, 다 닫히면 게임으로 돌아와 다시 고정한다.
// 채팅창에 쓰는 동안도 커서를 꺼내 둔다
const uiOpen = () => !easelEd.hidden || $("loginAsk")?.hidden === false || !gifts.hidden || !$("startrackPanel").hidden || !menu.hidden || !profile.hidden || !tour.hidden || !inv.hidden || !picker.hidden || panel.classList.contains("open") || !avPanel.hidden || !lb.hidden;
const typing = () => document.activeElement === sayInput;   // 채팅창에 쓰는 중: 커서를 꺼내 둔다
function syncCursor() { if (uiOpen()) { if (locked()) document.exitPointerLock(); } else lockMouse(); }
function lockMouse() {
  if (TOUCH) return;   // 터치 기기는 고정하지 않는다(화면을 끌어서 둘러본다)
  if (lockFailed || locked() || !canvas.requestPointerLock || !inside() || uiOpen() || typing() || holdLock) return;
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
// 종이 총: 마우스 고정 중 왼쪽 버튼을 누르는 순간 바로 발사(눌렀다 떼는 클릭 판정을 기다리지 않는다)
document.addEventListener("mousedown", (e) => { if (e.button === 0 && locked() && me.act?.name === "gun" && !uiOpen()) { e.preventDefault(); fireFirework(true); } });
document.addEventListener("pointerlockerror", () => {});
document.addEventListener("pointerlockchange", () => {
  document.getElementById("cross").hidden = !(VIEW.mode === "first" || locked());
  if (!locked() && inside() && !uiOpen() && !typing() && performance.now() > menuQuietUntil) { if (document.hasFocus()) { if (!TOUCH && !sideTucked) tuckSide(true); else openMenu(); } else showToast("커서가 나왔어요", "화면을 한 번 누르면 다시 둘러봐요.", 2600); }   // Esc로 풀리면 설정창, 알트탭이면 안내만
});
canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (VIEW.mode === "top") cam.distT = clamp(cam.distT * (1 + e.deltaY * .0012), 6, 66);
  else if (VIEW.mode === "third") { cam.idT = clamp(cam.idT * (1 + e.deltaY * .0012), 1.2, 6); }
}, { passive: false });
function aimAt(cx, cy) {   // 화면에서 누른 곳(바닥)으로의 방향. 못 찾으면 지금 몸 방향
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const g = ray.intersectObject(FLOORS[me.f].slab, false)[0]; if (!g) return me.h;
  return Math.atan2(tX(g.point.x) - me.x, tY(g.point.z) - me.y);
}
function boothHit(cx, cy) {   // 커서가 보일 때 바로가기·이젤·14층 액자를 눌렀으면 바로 처리
  const boards = me.f === 12 ? [...linkBoards, ...ezBoards] : me.f === 14 ? showSlots.map((sl) => sl.mesh) : [];
  if (!boards.length) return false;
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (!ray.intersectObjects(boards, false)[0]) return false;
  clickAt(cx, cy); return true;
}
function clickAt(cx, cy) {
  stopFollow();
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (me.f === 12 && linkBoards.length) { const lh = ray.intersectObjects(linkBoards, false)[0]; if (lh) { if (lh.object.userData.gift) openGifts(); else openLink(lh.object.userData.link); return; } }   // 바로가기 장치·선물 입간판을 눌렀다
  if (me.f === 14 && showSlots.length) { const sh = ray.intersectObjects(showSlots.map((sl) => sl.mesh), false)[0]; if (sh) { openItem(showItem(sh.object.userData.show)); return; } }   // 14층 액자를 눌렀다
  if (me.f === 12 && ezBoards.length) { const eh = ray.intersectObjects(ezBoards, false)[0]; if (eh && eh.object.userData.wb) { if (nearWb(4)) { openEasel("wb"); return; } } else if (eh && nearFurn("painteasel", 3.2)) { tryEasel(); return; } }   // 이젤·화이트보드를 눌렀다   // 이젤을 눌렀다
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
  if (g) { // 누른 칸 한가운데에 설 수 없으면(둥근 카운터에 반쯤 걸친 칸 같은 곳) 그 옆 설 수 있는 칸으로
    let gx = tX(g.point.x), gy = tY(g.point.z); if (!floor.walk[Math.floor(gy) * W + Math.floor(gx)]) { const [fx, fy] = nearestFree(floor, gx, gy); if (Math.hypot(fx - gx, fy - gy) < 1) { gx = fx; gy = fy; } }
    me.path = findPath(Math.floor(me.x), Math.floor(me.y), Math.floor(gx), Math.floor(gy)); }
}
function findPath(sx, sy, gx, gy) {
  if (gx < 0 || gy < 0 || gx >= W || gy >= H || !floor.walk[gy * W + gx]) return null;
  let lead = null;   // 지금 선 칸 한가운데에 설 수 없으면(카운터에 반쯤 걸친 칸) 곧장 걸어갈 수 있는 가장 가까운 옆 칸 한가운데에서 출발한다
  if (!floor.walk[sy * W + sx]) { let bd = Infinity; for (let y = sy - 1; y <= sy + 1; y++) for (let x = sx - 1; x <= sx + 1; x++) { if (x < 0 || y < 0 || x >= W || y >= H || !floor.walk[y * W + x]) continue; const d = Math.hypot(x + .5 - me.x, y + .5 - me.y); if (d < bd && sweep(floor, me.x, me.y, x + .5, y + .5)) { bd = d; lead = [x, y]; } }
    if (!lead) return null; [sx, sy] = lead; }
  const prev = new Int32Array(W * H).fill(-1); const q = [sy * W + sx]; prev[sy * W + sx] = sy * W + sx; let qi = 0;
  while (qi < q.length) { const cur = q[qi++]; if (cur === gy * W + gx) break;
    for (const ni of navNext(floor, cur)) { if (prev[ni] !== -1) continue; prev[ni] = cur; q.push(ni); } }
  if (prev[gy * W + gx] === -1) return null; const out = []; let c = gy * W + gx; while (c !== sy * W + sx) { out.push({ x: c % W + .5, y: ((c / W) | 0) + .5 }); c = prev[c]; }
  if (lead) out.push({ x: sx + .5, y: sy + .5 }); return out.reverse();
}

/* ════════════════ 11. 화면 UI: 피드 · 층 이동 · 말풍선 ════════════════ */
const panel = document.getElementById("panel"), pGrid = document.getElementById("pGrid"), lb = document.getElementById("lightbox"), picker = document.getElementById("picker");
const lbImg = $<HTMLImageElement>("lbImg"), lbCap = document.getElementById("lbCap");
const feedBtn = document.getElementById("feedBtn"), feedFile = $<HTMLInputElement>("feedFile");
const fmtDate = (s) => { const d = new Date(s); return isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`; };
const greeting = (p) => { const cats = [...new Set(p.feeds.map((f) => f.cat).filter(Boolean))]; return p.feeds.length ? `안녕! 나는 ${p.nick}. ${cats.slice(0, 2).join(", ") || "하루"} 이야기를 네 컷으로 그렸어. 구경해 볼래?` : `안녕! 나는 ${p.nick}. 하루들에 그림일기 ${p.total}편을 올렸어.`; };
// 조사 고르기: 이름 끝 글자에 받침이 있으면 b(과·이·을·은), 없으면 a(와·가·를·는). 숫자·영어는 읽는 소리로(1 일 · 3 삼 · L 엘 · M 엠 · N 엔 · R 알)
// 끝의 문장부호·이모지는 건너뛰고, 읽을 글자가 없으면 "와(과)"처럼 둘 다 쓴다
function withJosa(word, a, b) {
  const t = String(word || "").replace(/[^0-9A-Za-z가-힣]+$/u, ""), c = t.slice(-1);
  let has = null;
  if (/[가-힣]/.test(c)) has = (c.charCodeAt(0) - 0xAC00) % 28 !== 0;
  else if (/[0-9]/.test(c)) has = "013678".includes(c);
  else if (/[A-Za-z]/.test(c)) has = "lmnrLMNR".includes(c);
  return `${word}${has === null ? `${a}(${b})` : has ? b : a}`;
}
function nearNPC() { let best = null, bd = 1.9; for (const n of NPCS) { if (n.f !== me.f) continue; const d = Math.hypot(n.x - me.x, n.y - me.y); if (d < bd) { bd = d; best = n; } } return best; }
function nearSeat() { if (me.lie || me.seat) return null; let best = null, bd = 1.0; for (const st of floor.seats || []) { if (st.taken) continue; const d = Math.hypot(st.x - me.x, st.y - me.y); if (d < bd) { bd = d; best = st; } } return best; }
function sitDown(st) { me.seat = st; st.taken = "me"; me.x = st.x; me.y = st.y; showToast("의자에 앉았어요", "앉은 채로 1번을 누르면 네 컷을 그려요. 움직이면 일어나요.", 2600); me.h = st.yaw; me.path = null; if (me.act) endAct(me); sendPresence(true); }
function nearBag() { if (me.lie || me.seat) return null; let best = null, bd = 1.9; for (const o of floor.furn) { if (o.kind !== "beanbag" || o.taken) continue; const s = bagSpot(o), d = Math.hypot(s.x - me.x, s.y - me.y); if (d < bd) { bd = d; best = o; } } return best; }
function lieDown(o) { const s = bagSpot(o); me.lie = s; me.x = s.x; me.y = s.y; me.path = null; if (me.act) endAct(me); o.taken = "me"; sendPresence(true); showToast("빈백에 누웠어요", "움직이거나 F를 누르면 일어나요.", 2600); }
function standUp() {
  if (me.act?.name === "laptop" || me.act?.name === "read") endAct(me);   // 일어나면 노트북·책을 덮는다
  if (me.seat) { me.seat.taken = false; [me.x, me.y] = nearestFree(floor, me.x + Math.sin(me.seat.yaw) * .5, me.y + Math.cos(me.seat.yaw) * .5); me.seat = null; sendPresence(true); return; }
  if (!me.lie) return; for (const o of floor.furn) if (o.taken === "me") o.taken = false; [me.x, me.y] = nearestFree(floor, me.x + Math.sin(me.lie.yaw) * 1.2, me.y + Math.cos(me.lie.yaw) * 1.2); me.lie = null; sendPresence(true);
}
const atCall = () => floor.calls.some((k) => inRect({ x: k.x - .2, y: k.y - .3, w: k.w + .4, h: k.h + .6 }, me.x, me.y));
const nearStartrackScreen = () => !me.lie && !me.seat && me.f === 13 && me.x >= 11.2 && me.x <= 14.6 && Math.abs(me.y - 24.5) <= 5 && canControlStartrack({ f: me.f, x: me.x, y: me.y, rm: roomKeyAt(me.f, me.x, me.y) });
function interact() {
  const stand = nearScoop(); if (stand) { openShow(stand.view ?? "scoop"); return; }
  const sh = nearShow(); if (sh) { openItem(showItem(sh)); return; }
  if (!me.lie && !me.seat && me.f === 12) { if (nearWb(2.4)) { openEasel("wb"); return; } if (me.brush && nearFurn("painteasel", 2.1)) { tryEasel(); return; } if (nearFurn("brushcup", 1.7)) { toggleBrush(); return; } if (nearFurn("painteasel", 2.1)) { tryEasel(); return; } if (nearFurn("linkkiosk", 1.7)) { openLink("https://www.harudle.com/"); return; } if (nearFurn("instaboard", 1.7)) { openLink("https://www.instagram.com/harudle.official/"); return; } if (nearFurn("giftsign", 1.6)) { openGifts(); return; } }   // 하루들 부스: 붓 꽂이 · 함께 그리는 이젤   // 붓을 들었으면 이젤이 먼저
  if (nearStartrackScreen()) { startrack.openSettings(); return; }
  { const fr = nearFridge(); if (fr) { fr.want = !fr.want; return; } }   // 냉장고 앞: 문 열기·닫기
  if (me.act?.name === "gun" && !me.lie && !me.seat && !atCall()) { fireFirework(true); return; }   // 종이 총을 들었으면 F도 발사(엘리베이터 앞만 예외)
  if (me.lie || me.seat) { standUp(); return; } const st = nearSeat(); if (st && !(nearNPC() && Math.hypot(st.x - me.x, st.y - me.y) > .55)) { sitDown(st); return; } const n = nearNPC(); if (n) { n.say = "반가워!"; n.sayAt = performance.now(); NPCS.forEach((o) => (o.talk = o === n)); openPanel(n.p); return; } const bag = nearBag(); if (bag) { lieDown(bag); return; } if (atCall()) { openPicker(); return; } }   // 폭죽은 C
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
// 14층은 하루들 월드: 캠퍼스에서는 14층 엘리베이터 앞에 서 있는 것으로 두고, 월드를 화면 위에 띄운 동안 캠퍼스는 멈춘다
let inWorld = false;
function goFloor(f, spawn) {
  fade.style.opacity = "1";
  setTimeout(() => { if (me.brush) { me.brush = false; } standUp(); me.f = f; floor = FLOORS[f]; [me.x, me.y] = nearestFree(floor, spawn[0], spawn[1]); me.jz = 0; me.jv = 0; me.up = 0; dog.x = me.x - 1; dog.y = me.y + .5; me.path = null; curZone = null; showFloors(); refreshRoomTags(); updateFloorHud(); sendPresence(true); cam.target.set(wx(me.x), floorY(f), wz(me.y)); fade.style.opacity = "0"; if (f === 14 && (!showcase || performance.now() - showcaseAt > SHOWCASE_EVERY)) refreshShowcase(); }, 250);
}
// 14층 하루들 월드 창: 액자·가판대를 누르거나 앞에서 F. 창이 떠 있는 동안 캠퍼스는 멈춘다
function openItem(item) { if (!item) return; if (item.link) openLink(item.link); else openShow(item.view); }
function openShow(view) {
  if (inWorld || !view) return;
  if (locked()) document.exitPointerLock();
  inWorld = true; keys.clear(); me.runHold = false; me.path = null; me.goal = null; me.moving = false; sendPresence(true);
  openWorldWindow(view, { avatar: myAv, name: LS.get("ww.name") }, { onClose: () => { inWorld = false; if (view === "easel") refreshEasel(); }, onChanged: () => refreshShowcase() });
}
// 14층 방에 거는 하루들 월드 내용(src/worldShowcase.ts). 14층에 처음 올 때와 10분마다(이미지 주소가 15분이면 만료된다), 무언가 올린 뒤에 받는다
function refreshShowcase() {
  if (showcaseLoading) return; showcaseLoading = true;
  const counts: Record<string, number> = {};
  for (const o of FLOORS[14].furn) for (const i of o.kind === "showframe" ? [o.slot] : o.kind === "showwall" ? o.slots : []) counts[o.src] = Math.max(counts[o.src] ?? 0, i + 1);
  refreshEasel();
  loadShowcase(counts).then((next) => { showcase = next; showcaseAt = performance.now(); showSlots.forEach(paintShow); showPlates.forEach(paintPlate); paintPhone(); }).finally(() => { showcaseLoading = false; });
}
const SHOWCASE_EVERY = 10 * 60 * 1000;
// 14층에 있는 동안 이젤 그림을 가끔 새로 받는다(다른 사람이 그린 것)
window.setInterval(() => { if (me.f === 14 && !inWorld && !document.hidden) refreshEasel(); }, 15000);
const nearShow = () => {
  if (me.f !== 14 || me.lie || me.seat) return null;
  let best = null, bd = Infinity; for (const sl of showSlots) {
    if (sl.x === undefined) { sl.mesh.getWorldPosition(v3); sl.x = tX(v3.x); sl.y = tY(v3.z); }
    const d = Math.hypot(sl.x - me.x, sl.y - me.y); if (d > sl.reach) continue; if (d < bd && showItem(sl)) { bd = d; best = sl; } }
  return best;
};
// 가판대가 넓어서 가운데가 아니라 가판대 가장자리까지 거리로 본다
const nearScoop = () => (me.f === 14 && !me.lie && !me.seat && FLOORS[14].furn.find((o) => o.kind === "scoopstand" && Math.hypot(Math.max(o.x - me.x, 0, me.x - o.x - o.w), Math.max(o.y - me.y, 0, me.y - o.y - o.h)) < 2.2)) || null;
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
  { title: "조작 한눈에 보기", art: `<div class="tart tkeys">${[["WASD", "걷기"], ["Shift", "달리기"], ["Space", "점프 · 두 번 더블"], ["F", "상호작용"], ["C", "폭죽"], ["Enter", "채팅"], ["Tab", "인벤토리"], ["1 2 3", "네 컷 · 인사 · 하트"], ["Z", "춤 켜고 끄기"], ["클릭", "종이 총 발사"], ["V", "시점 바꾸기"], ["Q E", "화면 돌리기"], ["\\", "사이드바 접기"], ["Esc", "설정"]].map(([k, t]) => `<span><kbd>${k}</kbd>${t}</span>`).join("")}</div>`,
    kb: "왼쪽 위 ⚙️(또는 Esc) 설정창의 <b>조작법</b> 탭에서 언제든 다시 볼 수 있어요. 채팅과 같이 있는 크루는 오른쪽 💬 👥 버튼으로 열어요.", touch: "왼쪽 조이스틱으로 걷고, 오른쪽 버튼으로 점프·표현·채팅을 해요. 화면을 끌면 둘러봐요. 설정과 조작법은 왼쪽 위 ⚙️에서 봐요." },
];
let tourAt = 0;
tourDots.innerHTML = TOUR.map(() => "<i></i>").join("");
function showTourStep(i) {
  tourAt = clamp(i, 0, TOUR.length - 1); const st = TOUR[tourAt];
  const linkCard = tourAt === TOUR.length - 1 && account.enabled && !account.user ? `<div class="linkcard"><p>${LINK_PERKS}</p><button type="button" class="btn lav" data-tour-link="1">하루들 연동하기</button></div>` : "";   // 마지막 장: 하루들 연동
  tourStep.innerHTML = `<p class="tcount">${tourAt + 1} / ${TOUR.length}</p>${st.art}<h4 id="tourTitle">${st.title}</h4><p class="tdesc kb-only">${st.kb}</p><p class="tdesc touch-only">${st.touch}</p>${linkCard}`;
  tourStep.classList.remove("in"); void tourStep.offsetWidth; tourStep.classList.add("in");   // 장이 넘어갈 때 살짝 올라온다
  [...tourDots.children].forEach((d, k) => d.classList.toggle("on", k === tourAt));
  tourPrev.hidden = tourAt === 0; tourNext.textContent = tourAt === TOUR.length - 1 ? "시작하기" : "다음"; tourNext.focus();
}
function openTour() { tour.hidden = false; if (locked()) document.exitPointerLock(); showTourStep(0); }
function closeTour() { tour.hidden = true; LS.set("ww.tour", "1"); syncCursor(); }
tourNext.onclick = () => (tourAt === TOUR.length - 1 ? closeTour() : showTourStep(tourAt + 1));
tourStep.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-tour-link]")) { LS.set("ww.tour", "1"); startHarudleLogin(); } });   // 연동하고 돌아오면 안내는 다시 안 뜬다
tourPrev.onclick = () => showTourStep(tourAt - 1);
document.getElementById("tourSkip").onclick = closeTour;
// 걷기만 하고 달려 본 적이 없으면 한 번 알려 준다
let walkFor = 0, runTipShown = false;
const actBtn = document.getElementById("act"); actBtn.onclick = interact;
function setMyAv(c) { myAv = { ...c }; LS.set("ww.avatar", avEncode(myAv)); saveCharacter(); const vis = meDoll.root.visible; dropDoll(meDoll); meDoll = makeChar(myAv); meDoll.root.visible = vis; scene.add(meDoll.root); sendPresence(true); renderAvPanel(); }
// 캐릭터 꾸미기 (하루들 월드의 AvatarCustomizer와 같은 항목)
const avPanel = document.getElementById("avPanel"); let avColorPart = "headColor", avCamBack = null;
// 잠긴 장식도 눌러서 미리보기에서만 껴 볼 수 있다(저장·전송은 안 함). 다른 걸 고르거나 창을 닫으면 원래대로
let avTry: { part: string; v: string } | null = null;
function renderAvPanel() {
  if (avPanel.hidden) return;
  if (avTry && unlocked(avTry.v)) avTry = null;   // 미리보는 사이에 풀렸으면 그냥 고른 상태로
  avatarPreview.set({ config: { ...DEFAULT_AV, ...myAv, ...(avTry && { [avTry.part]: avTry.v }) }, note: avTry ? `🔒 ${AV_LABEL[avTry.part][avTry.v]} 미리보기 · 풀어야 저장돼요` : null });
  const chip = (part, v) => LOCKED_OPTIONS[part]?.includes(v) && !unlocked(v)
    ? `<button type="button" class="locked" data-lock="${v}" data-lpart="${part}" data-tip="${LOCK_TIPS[v]}" aria-pressed="${avTry?.v === v}" aria-label="${AV_LABEL[part][v]} (잠김, 미리보기만) · ${LOCK_TIPS[v]}">🔒 ${AV_LABEL[part][v]}</button>`
    : `<button type="button" data-part="${part}" data-v="${v}" aria-pressed="${myAv[part] === v && avTry?.part !== part}">${AV_LABEL[part][v]}</button>`;
  const esc = (t) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const unlockBox = avUnlock.open && !unlocked("headset") ? `<div class="avunlock"><p>${LOCK_TIPS.headset}</p><div class="row"><input id="avFeedLink" type="url" inputmode="url" autocomplete="off" placeholder="https://www.harudle.com/feeds/…" value="${esc(avUnlock.link)}"><button type="button" class="btn" data-unlock-go="1"${avUnlock.busy ? " disabled" : ""}>확인</button></div>${avUnlock.msg ? `<p class="msg">${esc(avUnlock.msg)}</p>` : ""}</div>` : "";
  // 색을 고를 수 있는 부위는 줄 이름 옆에 지금 색 동그라미 버튼: 누르면 옆에 색 고르는 창이 뜬다
  const cbtn = (k) => `<button type="button" class="cbtn" data-cpart="${k}" style="--c:${myAv[k]}" aria-expanded="${avColorOpen && avColorPart === k}" aria-label="${AV_COLOR_NAME[k]} 색 고르기" title="${AV_COLOR_NAME[k]} 색 고르기"></button>`;
  const head = (label, part) => `<b>${label}${PART_COLOR[part] ? cbtn(PART_COLOR[part]) : ""}</b>`;
  const rows = AV_PARTS.map((part) => `<div class="avrow">${head(AV_LABEL[part]._, part)}<div class="avchips">${AV[part].map((v) => chip(part, v)).join("")}</div>${part === "ear" ? unlockBox : ""}</div>`).join("");
  document.getElementById("avBody").innerHTML = `<div class="avchips presets">${AV_PRESETS.map(([l], i) => `<button type="button" data-preset="${i}">${l}</button>`).join("")}<button type="button" data-random="1">랜덤</button></div>${rows}<div class="avrow"><b>피부${cbtn("skinColor")}</b></div>`;
  renderColorPop();
}
// 부위별 색 고르는 창: PC는 캐릭터 미리보기 바로 아래(같은 폭)에 붙어 뜬다 · 폰은 아래 시트 바로 위
const PART_COLOR = { head: "headColor", outfit: "outfitColor", neck: "neckColor", bag: "bagColor", held: "heldColor" };
const AV_COLOR_NAME = Object.fromEntries(AV_COLOR_PARTS);
let avColorOpen = false;
const avColorPop = document.createElement("section"); avColorPop.id = "avColorPop"; avColorPop.hidden = true; avColorPop.setAttribute("aria-label", "색 고르기"); document.body.append(avColorPop);
function renderColorPop() {
  const open = avColorOpen && !avPanel.hidden, btn = open && avPanel.querySelector(`.cbtn[data-cpart="${avColorPart}"]`) as HTMLElement;
  avColorPop.hidden = !btn; if (!btn) return;
  const cur = String(myAv[avColorPart]).toUpperCase();
  const sw = (avColorPart === "skinColor" ? AV_SKINS.concat(AV_COLORS.filter((c) => !AV_SKINS.includes(c))) : AV_COLORS).map((c) => `<button type="button" class="sw" data-color="${c}" style="background:${c}" aria-label="${c}" aria-pressed="${cur === c}"></button>`).join("");
  avColorPop.innerHTML = `<div class="cphead"><h5>${AV_COLOR_NAME[avColorPart]} 색</h5><button type="button" class="x" data-cclose="1" aria-label="닫기">×</button></div><div class="swatches">${sw}</div><label class="custom">직접 고르기 <input type="color" data-custom="1" value="${cur.toLowerCase()}"></label>`;
  const pv = document.getElementById("avPreview");
  if (!narrow() && pv && !pv.hidden) { const r = pv.getBoundingClientRect(); avColorPop.style.left = `${r.left}px`; avColorPop.style.top = `${r.bottom + 10}px`; avColorPop.style.width = `${r.width}px`; }
  else { avColorPop.style.left = ""; avColorPop.style.top = ""; avColorPop.style.width = ""; }
}
function closeColorPop() { if (!avColorOpen) return false; avColorOpen = false; renderAvPanel(); return true; }
avColorPop.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("button"); if (!b) return; if (b.dataset.cclose) closeColorPop(); else if (b.dataset.color) setMyAv({ ...myAv, [avColorPart]: b.dataset.color }); });
avColorPop.addEventListener("change", (e) => { const t = e.target as HTMLInputElement; if (t.dataset.custom) setMyAv({ ...myAv, [avColorPart]: t.value.toUpperCase() }); });
addEventListener("pointerdown", (e) => { if (avColorOpen && !avColorPop.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".cbtn")) closeColorPop(); }, true);   // 바깥을 누르면 닫는다
addEventListener("resize", () => { if (avColorOpen) renderColorPop(); });
avPanel.addEventListener("input", (e) => { const t = e.target as HTMLInputElement; if (t.id === "avFeedLink") avUnlock.link = t.value; });
avPanel.addEventListener("keydown", (e) => { if ((e.target as HTMLElement).id === "avFeedLink" && e.key === "Enter") { e.preventDefault(); tryFeedUnlock(); } });
avPanel.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button"); if (!b) return;
  if (b.id === "avDone") return closeAvPanel();
  if (b.dataset.unlockGo) return void tryFeedUnlock();
  if (b.dataset.lock) {   // 잠긴 장식: 미리보기에서만 껴 본다
    const again = avTry?.v === b.dataset.lock; avTry = { part: b.dataset.lpart, v: b.dataset.lock };
    if (b.dataset.lock === "headset") { avUnlock.open = again ? !avUnlock.open : true; renderAvPanel(); if (avUnlock.open) (document.getElementById("avFeedLink") as HTMLInputElement)?.focus(); return; }   // 헤드셋: 피드 링크 붙여넣는 칸도 연다
    renderAvPanel(); return showToast("🔒 미리보기만 할 수 있어요", LOCK_TIPS[b.dataset.lock], 3200);   // 터치에선 호버가 없으니 눌렀을 때도 알려 준다
  }
  if (b.dataset.part || b.dataset.preset || b.dataset.random) avTry = null;   // 다른 걸 고르면 미리보기는 끝
  if (b.dataset.part) setMyAv({ ...myAv, [b.dataset.part]: b.dataset.v });
  else if (b.dataset.cpart) { avColorOpen = !(avColorOpen && avColorPart === b.dataset.cpart); avColorPart = b.dataset.cpart; renderAvPanel(); }   // 같은 버튼을 다시 누르면 닫는다
  else if (b.dataset.preset) setMyAv(AV_PRESETS[+b.dataset.preset][1]);
  else if (b.dataset.random) setMyAv(avRandom());
});
function openAvPanel() { if (locked()) document.exitPointerLock(); avPanel.hidden = false; renderAvPanel(); avatarPreview.set({ open: true }); if (!inside()) { avCamBack = cam.distT; cam.distT = 6; cam.yawT = me.h; cam.pitchT = .5; } /* 얼굴이 보이게 앞쪽에서 */ document.getElementById("avDone").focus(); }
function closeAvPanel() { const was = !avPanel.hidden; avPanel.hidden = true; avColorOpen = false; avTry = null; renderColorPop(); avatarPreview.set({ open: false }); if (was) syncCursor(); if (avCamBack !== null) { cam.distT = avCamBack; avCamBack = null; } }
/* ───── 설정창(Esc · 왼쪽 위 ⚙️): 설정 탭(프로필 수정 · 캐릭터 외형 수정) · 조작법 탭 ───── */
const menu = document.getElementById("menu"), profile = document.getElementById("profile"), profileName = $<HTMLInputElement>("profileName");
let menuAt = 0, renameMe: ((v: string) => void) | null = null, myNameNow = () => "";
function setMenuTab(t) { menu.querySelectorAll<HTMLElement>("[data-mtab]").forEach((el) => { if (el.getAttribute("role") === "tab") el.setAttribute("aria-selected", String(el.dataset.mtab === t)); else el.hidden = el.dataset.mtab !== t; }); }
function openMenu(tab = "main") { if (locked()) document.exitPointerLock(); keys.clear(); me.runHold = false; setMenuTab(tab); menu.hidden = false; menuAt = performance.now(); $("menuClose").focus(); }
function closeMenu() { menu.hidden = true; syncCursor(); }
function openProfile() { if (account.user) { menu.hidden = true; syncCursor(); showToast("이름은 하루들 닉네임이에요", "하루들에서 닉네임을 바꾸고 다시 연동하면 여기에도 바뀌어요.", 3600); return; } menu.hidden = true; profile.hidden = false; profileName.value = myNameNow(); profileName.focus(); profileName.select(); }
function closeProfile(back = true) { profile.hidden = true; if (back) openMenu(); else syncCursor(); }
/* ───── 하루들 연동(로그인) ─────
   서버가 연동을 켰을 때만 버튼이 보인다(/api/me의 enabled). 연동하면 이름은 하루들 닉네임으로 고정되고, 다른 크루에게도 그렇게 보인다.
   연동이 필요한 기능은 requireLogin("이유")을 먼저 부른다: 연동돼 있으면 true, 아니면 안내 창을 띄우고 false */
type HarudleUser = { id: string; nickname: string; profileImageUrl: string | null };
const account: { enabled: boolean; user: HarudleUser | null } = { enabled: false, user: null };
const loginAsk = $("loginAsk");
function applyAccount() {
  const btn = $("menuLogin"), line = $("menuAccount"), u = account.user;
  btn.hidden = !account.enabled; btn.textContent = u ? "하루들 연동 끊기" : "하루들 연동하기";
  btn.classList.toggle("lav", !u); btn.classList.toggle("ghost", !!u);   // 연동하기는 연보라, 끊기는 흰 버튼
  line.hidden = !u; line.textContent = u ? `하루들 ${u.nickname}(으)로 연동됨` : "";
  if (u) { myNameNow = () => u.nickname; myTag.textContent = u.nickname; const nb = $("nameBtn"); nb.textContent = `하루들: ${u.nickname}`; nb.title = "하루들 닉네임으로 보여요"; }
  if (!tour.hidden && tourAt === TOUR.length - 1) showTourStep(tourAt);   // 연동 여부를 늦게 알았으면 열린 창을 다시 그린다
  if (!gifts.hidden) renderGifts();
}
// 연동하면 무엇이 되는지(첫 안내 마지막 장 · 하루들 부스 선물 창)
const LINK_PERKS = "연동하면 하루들 닉네임으로 들어오고, 꾸민 캐릭터와 받은 아이템(에어팟 · 헤드셋)이 하루들 계정에 저장돼요. 다른 기기에서 연동해도 그대로 이어져요.";
// 지금 캐릭터를 같이 넘긴다: 처음 연동이면 서버가 이 모습으로 저장한다(이미 저장된 캐릭터가 있으면 그것을 쓴다)
function startHarudleLogin() { const ul = UNLOCK_KEYS.filter(unlocked); location.href = `/auth/harudle/start?av=${avEncode(myAv)}${ul.length ? `&ul=${ul.join(",")}` : ""}`; }
/* 연동한 크루의 캐릭터(외형 · 푼 장식)는 캠퍼스 DB에 있다. 들어오면 그것으로 바꾸고, 바꿀 때마다 다시 저장한다.
   저장된 게 없으면(연동 때 저장을 못 했거나 이 기능 전에 연동한 크루) 이 브라우저의 캐릭터를 올린다 */
const UNLOCK_KEYS = Object.values(LOCKED_OPTIONS).flat();
const charNow = () => JSON.stringify({ av: avEncode(myAv), unlocks: UNLOCK_KEYS.filter(unlocked) });
let charSynced: string | null = null, charTimer = 0;   // charSynced: 서버에 있는 캐릭터(받기 전에는 null이라 올리지 않는다)
function saveCharacter(now = false): Promise<void> | undefined {
  if (!account.user || charSynced === null) return;
  clearTimeout(charTimer);
  const push = () => { const body = charNow(); if (body === charSynced) return Promise.resolve(); charSynced = body;
    return fetch("/api/me/character", { method: "PUT", credentials: "same-origin", keepalive: true, headers: { "content-type": "application/json" }, body }).then((r) => { if (!r.ok) charSynced = ""; }, () => { charSynced = ""; }); };   // 실패하면 다음 변경 때 다시 올린다
  if (now) return push(); charTimer = window.setTimeout(push, 800);   // 꾸미기 창에서 연달아 고르면 마지막 것만
}
addEventListener("pagehide", () => saveCharacter(true));
async function loadCharacter() {
  let saved: { av: string; unlocks: string[] } | null;
  try { const r = await fetch("/api/me/character", { credentials: "same-origin", cache: "no-store" }); if (!r.ok) return; saved = (await r.json()).character; } catch { return; }
  if (saved) {
    for (const v of saved.unlocks) if (UNLOCK_KEYS.includes(v)) LS.set(`ww.unlock.${v}`, "1");   // 푼 장식은 합친다(이 브라우저에서 푼 것도 남는다)
    charSynced = JSON.stringify({ av: saved.av, unlocks: UNLOCK_KEYS.filter((v) => saved.unlocks.includes(v)) });
    const av = avDecode(saved.av); if (av && saved.av !== avEncode(myAv)) setMyAv(av); else renderAvPanel();
  } else charSynced = "";
  saveCharacter(true);   // 저장된 게 없거나 이 브라우저에서 더 푼 장식이 있으면 올린다
}
async function harudleLogout() {
  await saveCharacter(true);   // 방금 꾸민 것을 세션이 끝나기 전에 올린다
  try { const r = await fetch("/auth/logout", { method: "POST", credentials: "same-origin" }); if (!r.ok && r.status !== 204) throw new Error(String(r.status)); location.reload(); }
  catch { showToast("연동을 끊지 못했어요", "잠시 뒤에 다시 시도해 주세요.", 3200); }
}
function requireLogin(reason: string) {
  if (account.user) return true;
  if (!account.enabled) { showToast("지금은 하루들 연동을 쓸 수 없어요", reason, 3200); return false; }
  if (locked()) document.exitPointerLock();
  $("loginAskReason").textContent = reason; loginAsk.hidden = false; $("loginAskGo").focus();
  return false;
}
function closeLoginAsk() { loginAsk.hidden = true; syncCursor(); }
$("loginAskGo").onclick = startHarudleLogin;
$("loginAskLater").onclick = closeLoginAsk;
loginAsk.addEventListener("click", (e) => { if (e.target === loginAsk) closeLoginAsk(); });
$("menuLogin").onclick = () => { if (account.user) void harudleLogout(); else startHarudleLogin(); };
async function loadAccount() {
  const q = new URLSearchParams(location.search), result = q.get("login");
  if (result) { q.delete("login"); history.replaceState(null, "", location.pathname + (q.toString() ? `?${q}` : "") + location.hash); }
  if (STANDALONE) try {
    const r = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
    if (r.ok) { const d = await r.json(); account.enabled = !!d.enabled; account.user = d.loggedIn && d.user ? d.user : null; }
  } catch { }
  applyAccount();
  if (account.user) void loadCharacter();
  if (result === "ok" && account.user) setTimeout(() => showToast("하루들과 연동했어요", `${account.user.nickname}(으)로 들어왔어요.`, 4200), 600);
  else if (result) setTimeout(() => showToast("하루들과 연동하지 못했어요", "다시 시도해 주세요. 하루들 앱 안에서 열었다면 브라우저에서 열어 주세요.", 5200), 600);
}
$("menuClose").onclick = closeMenu;
$("menuProfile").onclick = openProfile;
$("menuLook").onclick = () => { menu.hidden = true; openAvPanel(); };
menu.querySelector(".mtabs").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-mtab]"); if (b) setMenuTab(b.dataset.mtab); });
$("setBtn").onclick = () => openMenu();
$("profileCancel").onclick = () => closeProfile();
$("profileForm").addEventListener("submit", (e) => { e.preventDefault(); const v = profileName.value.trim().slice(0, 16); if (v && renameMe) renameMe(v); closeProfile(false); showToast("프로필을 바꿨어요", `이제 ${myNameNow()}(으)로 보여요.`, 2200); });
profileName.addEventListener("keydown", (e) => { if (e.code === "Escape") { e.preventDefault(); e.stopPropagation(); closeProfile(); } });
// 채팅: Enter로 들어가고, 쓰고 Enter면 보내고 나온다(빈 채로 Enter·Esc면 그냥 나온다). 나오면 다시 마우스를 고정한다
const sayInput = $<HTMLInputElement>("sayInput");
function openChat() { keys.clear(); me.runHold = false; sayInput.focus(); if (locked()) document.exitPointerLock(); }   // 채팅창에 들어가면 커서를 꺼낸다(나오면 closeChat이 다시 고정)
function closeChat() { sayInput.blur(); lockMouse(); }
document.getElementById("sayForm").addEventListener("submit", (e) => { e.preventDefault(); const v = sayInput.value.trim(); if (v) { sendChat(v); sayInput.value = ""; } closeChat(); });
sayInput.addEventListener("keydown", (e) => { if (e.code === "Escape") { e.preventDefault(); sayInput.value = ""; holdLock = true; closeChat(); holdLock = false; menuQuietUntil = performance.now() + 800; relockOnKey = true; } else if (e.code === "Tab") { e.preventDefault(); setChatTab(CHAT_TABS[(CHAT_TABS.indexOf(chatTab) + (e.shiftKey ? 2 : 1)) % 3]); } });   // Esc: 채팅만 닫고 설정창은 안 띄운다(고정은 다음 키에서) · 입력 중 Tab: 근처 → 전체 → 개인
let curZone = null, toastTimer = 0; const toast = document.getElementById("zoneToast");
function showToast(h, p, ms = 3800) { toast.querySelector("h2").textContent = h; toast.querySelector("p").textContent = p; toast.style.opacity = "1"; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => (toast.style.opacity = "0"), ms); }
function checkZone() {
  let z = null; for (const zz of floor.zones) if (inRect(zz, me.x, me.y) && zz.desc) { if (!z || zz.w * zz.h < z.w * z.h) z = zz; }
  if (z !== curZone) { curZone = z; if (z) showToast(z.name, "", 2400); }   // 들어가면 공간 이름만
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
let requestMediaJoin: (area: string) => Promise<MediaJoin> = async () => { throw new Error("not_ready"); };
let requestMediaRenew: () => Promise<number> = async () => { throw new Error("not_ready"); };
let requestCloudflareMedia: (operation: string, data?: Record<string, unknown>) => Promise<any> = async () => { throw new Error("not_ready"); };
let requestMeeting: (operation: string, data?: Record<string, unknown>) => Promise<any> = async () => { throw new Error("not_ready"); };
let acknowledgeMediaSwitch: (revision: number) => void = () => {};
let notifyMediaLeft: () => void = () => {};
let notifyDailyReady: () => void = () => {};
const media = mountMediaControls({ requestJoin: (area) => requestMediaJoin(area), requestRenew: () => requestMediaRenew(), requestCloudflare: (operation, data) => requestCloudflareMedia(operation, data), requestMeeting: (operation, data) => requestMeeting(operation, data), notifyDailyReady: () => notifyDailyReady(), notifyLeft: () => notifyMediaLeft(), acknowledgeSwitch: (revision) => acknowledgeMediaSwitch(revision), meetingChanged: () => renderChat() });
media.setAvailable(STANDALONE);
const startrack = mountStartrack((message) => { if (!netUp) return false; sendPresence(true); netSend(message); return true; }, () => screenProjection(camera));
function updateMediaWorld() { const x = Math.round(me.x * 100) / 100, y = Math.round(me.y * 100) / 100; const position = { f: me.f, x, y, rm: roomKeyAt(me.f, x, y) }; media.updateWorld(position, peerList); startrack.updateWorld(position); }
/* ───── 로컬 테스트용 가짜 크루(목록·따라가기 확인용) ─────
   vite 개발 서버(npm run dev)에서는 저절로, localhost에서 빌드본을 볼 땐 ?mock 을 붙이면 나온다. ?nomock 이면 끈다. 배포 서버에서는 절대 안 나온다 */
const MOCK = !new URLSearchParams(location.search).has("nomock") && (import.meta.env.DEV || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has("mock")));
const mockPeers = MOCK ? ([
  ["mock-1", "이기적인 고양이", 12, 16, 22, { dn: 1, ac: 1, an: "dance" }],
  ["mock-2", "포비", 12, 22, 21, { br: 1, bc: "#F15B5B" }],
  ["mock-3", "브라운", 12, 10, 20, { walk: 1 }],
  ["mock-4", "쿠다", 13, 12, 22, { walk: 1 }],
  ["mock-5", "아이큐", 13, 40, 30, { st: 1, lp: 1 }],
  ["mock-6", "새로운 에뮤", 11, 20, 8, { walk: 1 }],
  ["mock-7", "초록", 14, 24, 32, { walk: 1, gn: 1 }],
  ["mock-8", "용감한 쿠키", 14, 38, 30, { l: 1 }],
] as [string, string, number, number, number, any][]).map(([peer, name, f, x, y, o]) => { const [fx, fy] = nearestFree(FLOORS[f], x + .5, y + .5); return { peer, name, kind: "viewer", walk: !!o.walk, home: [fx, fy], presence: { f, x: fx, y: fy, u: 0, h: 0, m: 0, r: 0, jc: 0, ac: o.ac || 0, an: o.an || null, as: 0, st: o.st || 0, l: o.l || 0, ly: 0, lp: o.lp || 0, dn: o.dn || 0, gn: o.gn || 0, br: o.br || 0, bc: o.bc || null, fc: 0, hc: 0 } }; }) : [];
if (MOCK) { // 걷는 가짜 크루는 집 근처를 천천히 돌아다닌다
  peerList = [...mockPeers];
  const tgt = new Map();
  setInterval(() => {
    for (const m of mockPeers) { if (!m.walk) continue; const s3 = m.presence, fl = FLOORS[s3.f];
      let g = tgt.get(m.peer); if (!g || Math.hypot(g[0] - s3.x, g[1] - s3.y) < .2) { g = nearestFree(fl, m.home[0] + (Math.random() - .5) * 8, m.home[1] + (Math.random() - .5) * 6); tgt.set(m.peer, g); }
      const dx = g[0] - s3.x, dy = g[1] - s3.y, d = Math.hypot(dx, dy), st = Math.min(d, .16), nx = s3.x + dx / d * st, ny = s3.y + dy / d * st;
      if (fits(fl, nx, ny)) m.presence = { ...s3, x: nx, y: ny, h: Math.atan2(dx, dy), m: 1 }; else tgt.delete(m.peer); }
  }, 100);
}
const online = document.getElementById("online");
let wasMoving = false;
// 다른 탭으로 가면 그림이 멈춰 멈춤 신호를 못 보낸다: 숨기 전에 보낸다
document.addEventListener("visibilitychange", () => { if (document.hidden && me.moving) { me.moving = false; wasMoving = false; sendPresence(true); } });
function sendPresence(force) {
  if (!room) return; const now = performance.now(); if (!force && now - lastSent < 90) return; lastSent = now;
  room.presence({ f: me.f, x: Math.round(me.x * 100) / 100, y: Math.round(me.y * 100) / 100, u: Math.round(me.up * 100) / 100, h: Math.round(me.h * 100) / 100, lp: me.act?.name === "laptop" ? 1 : 0, rd: me.act?.name === "read" ? 1 : 0, gn: me.act?.name === "gun" ? 1 : 0, br: me.brush ? 1 : 0, bc: ezPen.c, fk: me.fk, hc: me.hc, hd: Math.round(me.hd * 100) / 100, fc: me.fc, fh: Math.round(me.fh * 100) / 100, dn: me.act?.name === "dance" ? me.act.style + 1 : 0, m: me.moving ? 1 : 0, r: running() ? 1 : 0, l: me.lie ? 1 : 0, st: me.seat ? 1 : 0, ly: me.lie ? Math.round(me.lie.yaw * 100) / 100 : 0, jc: me.jc, ac: me.ac, an: me.an, as: me.as, look: 0, av: avEncode(myAv), rm: roomKey() }).catch(() => { });
  updateMediaWorld();
}
// EC2에서는 직접 만든 WebSocket 서버가 room 역할을 한다
function wsRoom() {
  let ws = null, handler = null, last = null, retry = 800;
  let mediaSeq = 0;
  const pendingMedia = new Map<string, { resolve: (join: MediaJoin) => void; reject: (error: Error) => void; timer: number }>();
  const pendingRenew = new Map<string, { resolve: (expiresAt: number) => void; reject: (error: Error) => void; timer: number }>();
  const pendingCloudflare = new Map<string, { resolve: (result: any) => void; reject: (error: Error) => void; timer: number }>();
  const pendingMeetings = new Map<string, { resolve: (result: any) => void; reject: (error: Error) => void; timer: number }>();
  const nameKey = "ww.name";
  let myName = LS.get(nameKey) || `크루${Math.floor(Math.random() * 900 + 100)}`; LS.set(nameKey, myName);
  const nameBtn = document.getElementById("nameBtn"), nameForm = document.getElementById("nameForm"), nameInput = $<HTMLInputElement>("nameInput");
  nameBtn.hidden = false; nameBtn.textContent = `이름: ${myName}`; myTag.textContent = myName;
  nameBtn.onclick = () => openProfile();   // 이름 칩을 눌러도 프로필 수정
  myNameNow = () => myName;
  renameMe = (v) => { myName = v; LS.set(nameKey, v); send({ t: "name", name: v }); nameBtn.textContent = `이름: ${myName}`; myTag.textContent = myName; };
  const saveName = () => { const v = nameInput.value.trim().slice(0, 16); if (v) { myName = v; LS.set(nameKey, v); send({ t: "name", name: v }); } nameForm.hidden = true; nameBtn.hidden = false; nameBtn.textContent = `이름: ${myName}`; myTag.textContent = myName; };
  nameForm.addEventListener("submit", (e) => { e.preventDefault(); saveName(); }); nameInput.addEventListener("blur", saveName);
  const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const probeStartrackClock = () => send({ t: "startrack:clock", sentAt: performance.now() });
  acknowledgeMediaSwitch = (revision) => send({ t: "media:switch-ack", revision });
  notifyMediaLeft = () => send({ t: "media:left" });
  notifyDailyReady = () => send({ t: "media:daily-ready" });
  requestMediaJoin = (area) => new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) { reject(new Error("not_ready")); return; }
    const id = `m${++mediaSeq}`;
    const timer = window.setTimeout(() => { pendingMedia.delete(id); reject(new Error("timeout")); }, 30000);
    pendingMedia.set(id, { resolve, reject, timer });
    send({ t: "media:join", id, area });
  });
  requestMediaRenew = () => new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) { reject(new Error("not_ready")); return; }
    const id = `m${++mediaSeq}`;
    const timer = window.setTimeout(() => { pendingRenew.delete(id); reject(new Error("timeout")); }, 10000);
    pendingRenew.set(id, { resolve, reject, timer });
    send({ t: "media:renew", id });
  });
  requestCloudflareMedia = (operation, data) => new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) { reject(new Error("not_ready")); return; }
    const id = `c${++mediaSeq}`;
    const timer = window.setTimeout(() => { pendingCloudflare.delete(id); reject(new Error("timeout")); }, 30000);
    pendingCloudflare.set(id, { resolve, reject, timer });
    send({ t: "media:cf", id, op: operation, data: data || {} });
  });
  requestMeeting = (operation, data) => new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) { reject(new Error("not_ready")); return; }
    // 회의 요청보다 현재 위치를 먼저 보내 서버와 화면의 회의실을 맞춘다.
    sendPresence(true);
    const id = `r${++mediaSeq}`;
    const timer = window.setTimeout(() => { pendingMeetings.delete(id); reject(new Error("timeout")); }, 10000);
    pendingMeetings.set(id, { resolve, reject, timer });
    send({ t: "media:meeting", id, op: operation, data: data || {} });
  });
  netSend = send;   // 이젤 획도 같은 연결로
  let myId = null, firstV = null;
  // 서버가 새 버전으로 바뀌면 페이지는 그대로 두고, 새로고침을 권하는 버튼만 띄운다
  const showUpdate = () => { if (document.getElementById("updateChip")) return; const b = document.createElement("button"); b.id = "updateChip"; b.type = "button"; b.textContent = "새 버전이 나왔어요 · 새로고침"; b.onclick = () => location.reload(); document.body.append(b); };
  const connect = () => {
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.onopen = () => { netUp = true; retry = 800; send({ t: "id", u: secretUid() }); send({ t: "name", name: myName }); if (last) send({ t: "p", p: last }); media.setNetwork(true); startrack.setNetwork(true); probeStartrackClock(); setTimeout(probeStartrackClock, 1500); setTimeout(probeStartrackClock, 5000); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "hello") { myId = m.id; media.setMeetingEnabled(!!m.meetingTest); if (m.v) { if (!firstV) firstV = m.v; else if (m.v !== firstV) showUpdate(); } }
      if (m.t === "media:join") { const pending = pendingMedia.get(m.id); if (pending) { clearTimeout(pending.timer); pendingMedia.delete(m.id); if (m.join) pending.resolve(m.join); else pending.reject(new Error(m.error || "unavailable")); } }
      if (m.t === "media:renew") { const pending = pendingRenew.get(m.id); if (pending) { clearTimeout(pending.timer); pendingRenew.delete(m.id); if (Number.isSafeInteger(m.expiresAt)) pending.resolve(m.expiresAt); else pending.reject(new Error(m.error || "unavailable")); } }
      if (m.t === "media:cf") { const pending = pendingCloudflare.get(m.id); if (pending) { clearTimeout(pending.timer); pendingCloudflare.delete(m.id); if (!m.error) pending.resolve(m.result); else pending.reject(new Error(m.error)); } }
      if (m.t === "media:meeting") { const pending = pendingMeetings.get(m.id); if (pending) { clearTimeout(pending.timer); pendingMeetings.delete(m.id); if (!m.error) pending.resolve(m.result); else pending.reject(new Error(m.error)); } }
      if (m.t === "media:switch" && Number.isSafeInteger(m.revision)) media.switchProvider(m.revision);
      if (m.t === "me" && typeof m.u === "string") { myPub = m.u; renderChat(); }   // 서버가 정한 내 주소(게스트 p_… · 하루들 연동 h_…)
      if (m.t === "startrack") startrack.receive(m);
      if (m.t === "startrack:clock") startrack.syncClock(m.sentAt, m.serverTime);
      if (m.t === "ez") easelNet(m);
      if (m.t === "chat") chatNet(m);
      if (m.t === "bye") retry = 150; /* 서버가 새 버전으로 바뀌는 중: 곧바로 다시 붙는다 */ if (m.t === "peers" && handler) handler({ peers: m.peers.map((p) => ({ ...p, kind: "viewer", sameTab: p.peer === myId })) }); };
    ws.onclose = () => { netUp = false; media.setNetwork(false); startrack.setNetwork(false); for (const pending of [...pendingMedia.values(), ...pendingRenew.values(), ...pendingCloudflare.values(), ...pendingMeetings.values()]) { clearTimeout(pending.timer); pending.reject(new Error("not_ready")); } pendingMedia.clear(); pendingRenew.clear(); pendingCloudflare.clear(); pendingMeetings.clear(); setTimeout(connect, retry); retry = Math.min(10000, retry * 1.6); };
  };
  connect();
  return { presence: async (p) => { last = p; send({ t: "p", p }); }, onPeers: (fn) => { handler = fn; } };
}
async function joinRoom() {
  try {
    if (STANDALONE) {
      room = wsRoom();
      room.onPeers((ch) => {
        peerList = [...ch.peers.filter((p) => !p.sameTab), ...mockPeers];
        updateMediaWorld();
        for (const [k, v] of peers) if (!peerList.some((p) => p.peer === k)) { endAct(v); holdBrush(v, false); dropDoll(v.doll); v.tag.remove(); v.bub.remove(); v.zzz.remove(); peers.delete(k); }
        online.textContent = peerList.length ? `같이 있는 크루 ${peerList.length + 1}명` : "혼자 둘러보는 중";
      });
      sendPresence(true); return;
    }
    if (!window.claude?.use) return;
    [room, user] = await Promise.all([claude.use("room"), claude.use("user")]); if (!room) return;
    room.onPeers(async (ch) => {
      peerList = ch.peers.filter((p) => !p.sameTab && p.kind === "viewer");
      const ids = peerList.map((p) => p.by).filter(Boolean); if (user && ids.length) { const ps = await user.profiles(ids); for (const id of ids) names[id] = ps[id]?.name || ""; }
      for (const [k, v] of peers) if (!peerList.some((p) => p.peer === k)) { endAct(v); holdBrush(v, false); dropDoll(v.doll); v.tag.remove(); v.bub.remove(); v.zzz.remove(); peers.delete(k); }
      online.textContent = peerList.length ? `같이 있는 크루 ${peerList.length + 1}명` : "혼자 둘러보는 중";
    }, () => { });
    sendPresence(true);
  } catch { }
}
// 다른 크루가 앉은 의자·누운 빈백은 "사용 중": 내가 같은 자리에 앉지 않는다
function syncOccupancy() {
  for (const st of floor.seats || []) if (st.taken === "peer") st.taken = false;
  for (const o of floor.furn) if (o.taken === "peer") o.taken = false;
  for (const v of peers.values()) v.seat = null;   // 같이 있는 크루가 앉은 자리(높이에 맞춰 앉히려고)
  for (const p of peerList) { const s = p.presence || {}; if (s.f !== me.f || !(s.st || s.l)) continue;
    if (s.st) { let best = null, bd = .5; for (const st of floor.seats || []) { if (st.taken) continue; const d = Math.hypot(st.x - s.x, st.y - s.y); if (d < bd) { bd = d; best = st; } } if (best) best.taken = "peer"; const pv = peers.get(p.peer); if (pv) pv.seat = best; }
    else for (const o of floor.furn) if (o.kind === "beanbag" && !o.taken && Math.hypot(bagSpot(o).x - s.x, bagSpot(o).y - s.y) < .6) { o.taken = "peer"; break; } }
}
function syncPeers(dt, t) {
  syncOccupancy();
  for (const p of peerList) {
    const s = p.presence || {}; if (typeof s.x !== "number" || !FLOORS[s.f]) continue;
    const l = avDecode(s.av) || avFromSeed(p.peer), key = avKey(l);
    let v = peers.get(p.peer);
    if (!v) { v = { doll: makeChar(l), key, x: s.x, y: s.y, tag: mkLabel("name-tag peer", "크루"), bub: mkLabel("bub", ""), zzz: mkZzz() }; v.bub.hidden = true; scene.add(v.doll.root); peers.set(p.peer, v); }
    if (v.key !== key) { const vis0 = v.doll.root.visible; dropDoll(v.doll); v.doll = makeChar(l); v.doll.root.visible = vis0; scene.add(v.doll.root); v.key = key; }
    v.x = lerp(v.x, s.x, Math.min(1, dt * 10)); v.y = lerp(v.y, s.y, Math.min(1, dt * 10));
    if (s.jc !== v.jc) { if (v.jc !== undefined) { const air = (v.jz || 0) > .05; v.jv = air ? 4.2 : 4.6; if (air && v.doll.root.visible) spawnFx(starTex, v.doll.root.position, 3, .5, .2); } v.jc = s.jc; }   // 공중에서 또 뛰면 더블 점프(별)
    if (s.fc !== v.fc) { if (v.fc !== undefined && v.doll.root.visible) { if (s.fk) { v.kickAt = performance.now() / 1000; shootPaper(s.f, v.x, v.y, +s.fh || 0, +s.u || 0, v); } else launchFirework(s.f, v.x, v.y, +s.fh || 0, +s.u || 0); } v.fc = s.fc; }   // 다른 크루의 폭죽
    if (s.hc !== v.hc) { if (v.hc !== undefined) hitReact(v, +s.hd || 0); v.hc = s.hc; }   // 그 크루가 종이 총알에 맞았다
    if (s.ac !== v.ac) { if (v.ac !== undefined && typeof s.an === "string") startAct(v, s.an, s.as | 0); v.ac = s.ac; }
    if (((s.m && v.act?.name !== "gun") || (!s.st && v.act?.name === "laptop")) && v.act) endAct(v);
    if (s.gn && v.act?.name !== "gun" && !s.dn && !s.lp) startAct(v, "gun", 0);   // 종이 총도 꺼내 둔 상태(gn)로 받는다
    else if (!s.gn && v.act?.name === "gun") endAct(v);
    // 노트북은 "펼쳐 둔 상태"(lp)로 계속 받는다: 나중에 들어온 사람도 앉아서 노트북 하는 크루를 본다
    if (s.lp && s.st && !s.m && v.act?.name !== "laptop") startAct(v, "laptop", 0);
    else if (!s.lp && v.act?.name === "laptop") endAct(v);
    // 책도 펼쳐 둔 상태(rd)로 받는다: 앉았거나 누운 크루가 읽는 모습을 나중에 온 사람도 본다
    if (s.rd && (s.st || s.l) && !s.m && v.act?.name !== "read") startAct(v, "read", 0);
    else if (!s.rd && v.act?.name === "read") endAct(v);
    // 춤도 계속되는 상태(dn)로 받는다: 나중에 들어온 사람도 춤추는 크루를 본다
    if (s.dn && !s.m && (v.act?.name !== "dance" || v.act.style !== (s.dn - 1) % DANCES.length)) startAct(v, "dance", s.dn - 1);   // dn은 춤 번호 + 1
    else if (!s.dn && v.act?.name === "dance") endAct(v);
    v.jz = v.jz || 0; v.jv = v.jv || 0; if (v.jz > 0 || v.jv > 0) { v.jv -= 15 * dt; v.jz += v.jv * dt; if (v.jz <= 0) { v.jz = 0; v.jv = 0; } }
    // 같은 층이거나, 뚫린 자리(라이브러리·계단 구멍) 너머 위·아래층이면 보인다(그 사람의 폭죽·노트북·춤도 같이)
    const vis = s.f === me.f || (Math.abs(s.f - me.f) === 1 && nearRects(voidsOf(FLOORS[Math.max(s.f, me.f)]), s.x, s.y, s.x, s.y)); v.doll.root.visible = vis; setPos(v.doll, s.f, v.x, v.y); v.doll.root.position.y += (+s.u || 0) + v.jz; v.doll.blob.position.y = .012 - v.jz; applyLie(v.doll, s.l ? { yaw: +s.ly || 0 } : null); v.doll.setSeated(s.st ? v.seat || true : null);
    // 받는 쪽 안전장치: "걷는 중"이라고 와도 위치가 0.5초 넘게 그대로면 멈춘 것으로 본다(멈춤 신호가 빠졌거나 그 사람이 다른 탭으로 갔을 때)
    if (s.x !== v.sx || s.y !== v.sy) { v.sx = s.x; v.sy = s.y; v.movedAt = t; }
    const walking = (v.walking = !!s.m && t - (v.movedAt ?? -9) < .5);
    holdBrush(v, !!s.br && vis, typeof s.bc === "string" && /^#[0-9a-f]{6}$/i.test(s.bc) ? s.bc : undefined); applyWobble(v); v.doll.update(dt, t, walking, typeof s.h === "number" ? s.h : null, 0, false, tickAct(v, dt), v.jz > .01, walking && !!s.r);
    v.tag.textContent = p.name || (p.by && names[p.by]) || "크루";
    const rp = v.doll.root.position;
    if (vis) project(v.tag, rp.x, rp.y - .05, rp.z, true); else v.tag.style.display = "none";
    const say = v.chatSay && Date.now() - v.chatAt < 6000 ? v.chatSay : "";   // 받은 근처·전체 채팅만 말풍선으로
    v.bub.hidden = !(vis && say); if (!v.bub.hidden) { v.bub.textContent = say; project(v.bub, rp.x, rp.y + DOLL, rp.z); }
    showZzz(v.zzz, v.doll, vis && !!s.l && !say);   // 말풍선이 떠 있는 동안은 잠깐 깬다
  }
}

/* ════════════════ 13. 한 프레임 ════════════════ */
let last = performance.now(), npcSkillTimer = 4;
/* ───── 채팅: 근처 · 전체 · 개인 ─────
   근처: 같은 층 6칸 안(회의실·강의실·페어룸·상담실 안이면 그 방 사람끼리만). 이 브라우저에 최근 100개를 남긴다
   전체·개인: 서버가 남겨 두고, 들어오면 지난 대화를 보내 준다 */
const CHAT_TABS = ["near", "all", "dm"] as const, CHAT_LABEL = { near: "근처", all: "전체", dm: "개인" };
let chatTab: "near" | "all" | "dm" = "near", dmTo: string | null = null, dmToName = "";
const chatLogs = { near: [] as any[], all: [] as any[], dm: [] as any[] }, unread = { near: 0, all: 0, dm: 0 };
try { chatLogs.near = JSON.parse(LS.get("ww.chatNear") || "[]"); } catch { }
const uidOf = (peer) => peerList.find((p) => p.peer === peer)?.u || null;
// 지금 있는 방: 회의실·강의실 같은 닫힌 대화 공간이면 그 이름(층 포함), 아니면 ""
function roomKey() {
  return roomKeyAt(me.f, me.x, me.y);
}
function chatNet(m) {
  const mine = m.from?.u === selfU();
  if (m.k === "history") { chatLogs.all = m.all || []; chatLogs.dm = (m.dm || []).sort((a, b) => a.at - b.at); renderChat(); return; }
  if (m.k === "sys") { chatLogs[chatTab].push({ k: "sys", text: m.text, at: Date.now(), ...(chatTab === "near" && media.meetingScope() ? { scope: media.meetingScope() } : {}) }); renderChat(); return; }
  const list = chatLogs[m.k]; if (!list) return; if (list.some((x) => x.id === m.id)) return;
  list.push(m); if (list.length > (m.k === "dm" ? 400 : 200)) list.splice(0, list.length - (m.k === "dm" ? 400 : 200));
  if (m.k === "near") LS.set("ww.chatNear", JSON.stringify(chatLogs.near.slice(-100)));
  if (!mine && m.k !== "dm") { const v = peers.get(m.from.peer); if (v) { v.chatSay = m.text.slice(0, 40); v.chatAt = Date.now(); } }   // 머리 위 말풍선
  if (!mine && m.k !== chatTab) unread[m.k]++;
  if (!mine && m.k === "dm" && !dmTo) { dmTo = m.from.u; dmToName = m.from.name; }
  renderChat();
}
function sendChat(text) {
  if (chatTab === "dm" && !dmTo) { chatLogs.dm.push({ k: "sys", text: "받는 사람을 먼저 골라 주세요", at: Date.now() }); renderChat(); return; }
  if (chatTab !== "dm") { me.say = text.slice(0, 40); me.sayAt = Date.now(); }   // 내 말풍선
  netSend({ t: "chat", k: chatTab, text, to: chatTab === "dm" ? dmTo : undefined });
  if (!netUp) chatNet({ id: "local" + Date.now(), k: chatTab, text, at: Date.now(), to: dmTo, from: { u: selfU(), name: myNameNow() || "나", f: me.f } });   // 서버 없이 볼 때
}
function setChatTab(t) { chatTab = t; unread[t] = 0; renderChat(); }
function openDm(u, name) { dmTo = u; dmToName = name || "크루"; setChatTab("dm"); openChat(); }
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
let chatKey = "";
function renderChat() {
  const uid = selfU();
  $all<HTMLButtonElement>("#chat .ctabs button").forEach((b2) => { const t = b2.dataset.tab; b2.setAttribute("aria-selected", String(t === chatTab)); const bd = b2.querySelector("b"); bd.textContent = String(unread[t]); bd.classList.toggle("on", unread[t] > 0 && t !== chatTab); });
  $("chatDmBar").hidden = chatTab !== "dm";
  if (chatTab === "dm") { // 받는 사람: 지금 접속한 크루 + 대화했던 크루
    const opts = new Map(); for (const p of peerList) if (p.u) opts.set(p.u, p.name || "크루");
    for (const m of chatLogs.dm) { const other = m.from?.u === uid ? m.to : m.from?.u; if (other && !opts.has(other)) opts.set(other, m.from?.u === uid ? (dmToName && dmTo === other ? dmToName : "크루") : m.from.name); }
    if (dmTo && !opts.has(dmTo)) opts.set(dmTo, dmToName);
    const sel = $<HTMLSelectElement>("chatDmTo"), html2 = `<option value="">고르기</option>` + [...opts].map(([u, n]) => `<option value="${esc(u)}" ${u === dmTo ? "selected" : ""}>${esc(n)}</option>`).join("");
    if (sel.innerHTML !== html2) sel.innerHTML = html2;
  }
  const rows = chatTab === "dm" ? chatLogs.dm.filter((m) => m.k === "sys" || (dmTo && (m.from?.u === dmTo && m.to === uid || m.from?.u === uid && m.to === dmTo))) : chatTab === "near" ? chatLogs.near.filter((m) => (m.scope || null) === media.meetingScope()) : chatLogs[chatTab];
  const html = rows.length ? rows.map((m) => m.k === "sys" ? `<li class="sys">${esc(m.text)}</li>` : `<li class="${m.from?.u === uid ? "mine" : ""}"><span class="who" data-u="${esc(m.from?.u || "")}" data-n="${esc(m.from?.name || "")}">${esc(m.from?.name || "크루")}</span>${esc(m.text)}<span class="meta">${hhmm(m.at)}${m.k !== "dm" && m.from?.f ? ` · ${m.from.f}F` : ""}</span></li>`).join("")
    : `<li class="empty">${chatTab === "near" ? (media.meetingScope() ? "같은 회의 사람에게만 보여요" : media.meetingRequired() ? "회의를 선택하지 않은 이 방 사람에게 보여요" : roomKey() ? "이 방 사람끼리만 보여요" : canControlStartrack({ f: me.f, x: me.x, y: me.y, rm: roomKey() }) ? "스타트랙의 모든 객석에 보여요" : "6칸 안에 있는 크루에게 보여요") : chatTab === "all" ? "캠퍼스의 모두에게 보여요" : dmTo ? `${esc(dmToName)}님과의 대화예요` : "받는 사람을 고르거나 크루 목록에서 💬를 눌러요"}</li>`;
  const log = $("chatLog"); if (html !== chatKey) { const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 30; chatKey = html; log.innerHTML = html; if (atEnd || true) log.scrollTop = log.scrollHeight; }
  sayInput.placeholder = chatTab === "dm" ? (dmTo ? `${dmToName}님에게 · Tab 바꾸기` : "받는 사람을 골라요") : `${CHAT_LABEL[chatTab]}${chatTab === "near" && roomKey() ? "(이 방)" : ""}에 말하기 · Tab 바꾸기`;
}
$all<HTMLButtonElement>("#chat .ctabs button").forEach((b2) => (b2.onclick = () => setChatTab(b2.dataset.tab as any)));
// 오른쪽 사이드: 같이 있는 크루. 손잡이(또는 \ 키)로 오른쪽으로 집어넣고, 접히면 오른쪽 위 인원 버튼으로 다시 편다
// 모바일은 사이드를 늘 숨겨 두고, 인원 버튼으로 위쪽에 띄웠다 닫는다(채팅과 번갈아)
let sideTucked = LS.get("ww.sideTucked") === "1";
function tuckSide(on) { sideTucked = on; LS.set("ww.sideTucked", on ? "1" : ""); $("side").classList.toggle("tucked", on); document.body.classList.toggle("sideTucked", on); $("sideTab").setAttribute("aria-expanded", String(!on)); }
const peopleOpen = (on) => { document.body.classList.toggle("peopleOpen", on); if (on) { document.body.classList.remove("chatting"); sayInput.blur(); } };
$("sideTab").onclick = () => tuckSide(!sideTucked);
$("sideHide").onclick = () => (TOUCH ? peopleOpen(false) : tuckSide(true));
$("showPeople").onclick = () => (TOUCH ? peopleOpen(!document.body.classList.contains("peopleOpen")) : tuckSide(false));
tuckSide(sideTucked);
$("chatDmTo").addEventListener("change", () => { const sel = $<HTMLSelectElement>("chatDmTo"); dmTo = sel.value || null; dmToName = sel.selectedOptions[0]?.textContent || ""; renderChat(); });
$("chatLog").addEventListener("click", (e) => { const w = (e.target as HTMLElement).closest(".who") as HTMLElement; if (w && w.dataset.u && w.dataset.u !== selfU()) openDm(w.dataset.u, w.dataset.n); });
setInterval(() => { if (chatTab === "near") renderChat(); }, 1000);   // 방을 드나들면 안내 문구가 바뀐다
/* ───── 같이 있는 크루 목록: 나 · 같은 층 · 다른 층 순, 이름 옆에 층, 따라가기 ───── */
const plistBody = document.getElementById("plistBody");
function esc(v) { return String(v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])); }   // 함수 선언: 위쪽 채팅 코드가 먼저 불러도 된다
const actIcon = (s2) => (s2.br ? "🖌️ 그리는 중" : s2.dn ? "💃 춤추는 중" : s2.lp ? "💻 코딩 중" : s2.rd ? "📖 책 읽는 중" : s2.gn ? "🎉 종이 총" : s2.l ? "💤 쉬는 중" : s2.st ? "🪑 앉아 있음" : s2.m ? "🚶 걷는 중" : "");
const dotColor = (av, seed) => { const c = avDecode(av); return c?.headColor || ["#B39DDB", "#FFD43B", "#7DB3F0", "#7FCFAE", "#F7A6A0"][hash(seed) % 5]; };
let plistKey = "";
function renderPlist() {
  const q = ($<HTMLInputElement>("plistSearch").value || "").trim().toLowerCase();
  const all = peerList.filter((p) => p.presence && FLOORS[p.presence.f]).map((p) => ({ id: p.peer, name: p.name || "크루", s: p.presence }));
  const rows = q ? all.filter((r) => r.name.toLowerCase().includes(q)) : all;
  rows.sort((a, b) => (b.s.f === me.f ? 1 : 0) - (a.s.f === me.f ? 1 : 0) || b.s.f - a.s.f || a.name.localeCompare(b.name, "ko"));
  $("plistTitle").textContent = all.length ? `캠퍼스에 ${all.length + 1}명` : "아직 혼자 둘러보는 중이에요"; $("plistCnt").textContent = $("sideShowCnt").textContent = String(all.length + 1);   // 사이드바를 접어도 오른쪽 위에 접속 인원
  const ini = (n) => esc([...String(n).trim()][0] || "?");
  const line = (id, name, f, col, icon, mine) => `<li class="${mine ? "mine" : f === me.f ? "same" : ""}"><span class="av" style="background:${col}">${ini(name)}</span><span class="who"><span class="nm">${esc(name)}${mine ? "<em>나</em>" : ""}</span><span class="sub"><span class="fl ${f === me.f ? "here" : ""}">${f}F</span>${icon ? `<span>${icon}</span>` : ""}</span></span>${mine ? "" : `${uidOf(id) ? `<button type="button" class="dm" data-id="${esc(id)}" title="개인 메시지">💬</button>` : ""}<button type="button" class="fw" data-id="${esc(id)}" aria-pressed="${me.follow === id}">${me.follow === id ? "따라가는 중" : "따라가기"}</button>`}</li>`;
  const html = line("", myNameNow() || "나", me.f, myAv.headColor || "#B39DDB", actIcon({ br: me.brush, dn: me.act?.name === "dance", lp: me.act?.name === "laptop", rd: me.act?.name === "read", gn: me.act?.name === "gun", l: me.lie, st: me.seat }), true)
    + (rows.length ? rows.map((r) => line(r.id, r.name, r.s.f, dotColor(r.s.av, r.id), actIcon(r.s), false)).join("") : `<li class="empty">다른 크루가 들어오면 여기에 보여요</li>`);
  if (html === plistKey) return; plistKey = html; plistBody.innerHTML = html;
}
$("plistSearch").addEventListener("input", () => renderPlist());
plistBody.addEventListener("click", (e) => { const dmb = (e.target as HTMLElement).closest("button.dm") as HTMLButtonElement; if (dmb) { const p = peerList.find((q) => q.peer === dmb.dataset.id); if (p?.u) { openDm(p.u, p.name); if (!menu.hidden) closeMenu(); } return; } const b = (e.target as HTMLElement).closest("button.fw") as HTMLButtonElement; if (!b) return; const id = b.dataset.id; if (me.follow === id) stopFollow(); else { startFollow(id); if (!menu.hidden) closeMenu(); } renderPlist(); });   // 설정창에서 눌렀으면 닫고 바로 게임으로
setInterval(renderPlist, 400);
// 따라가기: 그 크루 곁으로 길을 찾아 걸어가고, 다른 층에 있으면 그 층으로 옮겨 간다. 내가 직접 움직이면 멈춘다
function startFollow(id) { me.follow = id; me.followAt = 0; const p = peerList.find((q) => q.peer === id); showToast("따라가는 중", `${p?.name || "크루"} 곁으로 가요. 직접 움직이면 멈춰요.`, 2200); }
function stopFollow() { if (!me.follow) return; me.follow = null; me.path = null; }
function tickFollow(t) {
  if (!me.follow) return;
  const p = peerList.find((q) => q.peer === me.follow), s2 = p?.presence;
  if (!s2 || !FLOORS[s2.f]) { stopFollow(); showToast("따라가기를 멈췄어요", "그 크루가 나갔어요.", 2000); return; }
  if (me.lie || me.seat) standUp();
  if (s2.f !== me.f) { // 다른 층: 가장 가까운 엘리베이터까지 걸어가서, 잠깐 기다렸다 타고, 그 층 엘리베이터에서 다시 걸어간다
    if (atCall()) {
      me.path = null;
      if (!me.rideAt) { me.rideAt = t; showToast("엘리베이터를 기다려요", `${s2.f}층으로 올라가요`.replace("올라가요", s2.f > me.f ? "올라가요" : "내려가요"), 1400); }
      else if (t - me.rideAt > 1.1) { me.rideAt = 0; me.followAt = t; goFloor(s2.f, ELEV_SPAWN); }
      return;
    }
    me.rideAt = 0;
    if (t - (me.followAt || 0) > 1 || !me.path || !me.path.length) {
      me.followAt = t; let best = null, bd = Infinity;
      for (const c of floor.calls) { const cx = c.x + c.w / 2, cy = c.y + c.h / 2, d = Math.hypot(cx - me.x, cy - me.y); if (d < bd) { bd = d; best = [Math.floor(cx), Math.floor(cy)]; } }
      if (best) me.path = findPath(Math.floor(me.x), Math.floor(me.y), best[0], best[1]) || [];
    }
    return;
  }
  me.rideAt = 0;
  const d = Math.hypot(s2.x - me.x, s2.y - me.y);
  if (d < 1.4) { me.path = null; return; }
  if (t - (me.followAt || 0) > .5 || !me.path || !me.path.length) { me.followAt = t; const [gx, gy] = nearestFree(floor, s2.x, s2.y); me.path = findPath(Math.floor(me.x), Math.floor(me.y), Math.floor(gx), Math.floor(gy)) || []; if (me.path.length) me.path.pop(); }
}
function step(dt, t) {
  tickFollow(t);
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
  if (me.moving) { me.h = Math.atan2(vx, vy); if (me.act && me.act.name !== "gun") endAct(me); sendPresence(false); }
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
    if (d < .08) { n.wait = 2 + Math.random() * 5; const a = Math.random() * Math.PI * 2, rr = Math.random() * 1.6; const tx = n.hx + Math.cos(a) * rr, ty = n.hy + Math.sin(a) * rr; if (fits(fl, tx, ty)) { n.tx = tx; n.ty = ty; } n.moving = false; continue; }
    const s = Math.min(d, 1.3 * dt); const nx = n.x + dx / d * s, ny = n.y + dy / d * s; if (!fits(fl, nx, ny)) { n.tx = n.hx; n.ty = n.hy; n.wait = 1; continue; }
    n.x = nx; n.y = ny; n.moving = true; n.h = Math.atan2(dx, dy);
  }
  checkZone();
  const near = nearNPC(), call = atCall(), bag = nearBag(), seat = nearSeat();
  const ez0 = !me.lie && !me.seat && nearFurn("painteasel", 2.1), cup = !(me.brush && ez0) && !me.lie && !me.seat && nearFurn("brushcup", 1.7), ez = !cup && ez0, site = !cup && !ez && nearFurn("linkkiosk", 1.7), insta = !cup && !ez && !site && nearFurn("instaboard", 1.7), gift = !cup && !ez && !site && !insta && !me.lie && !me.seat && nearFurn("giftsign", 1.6), wb = !me.lie && !me.seat && nearWb(2.4), fr = nearFridge(), scoop = nearScoop(), shown = !scoop && nearShow(), screenNear = !scoop && !shown && nearStartrackScreen();   // 하루들 부스
  actBtn.hidden = !(me.lie || me.seat || near || bag || call || seat || cup || ez || site || insta || gift || wb || fr || scoop || shown || screenNear); actBtn.textContent = screenNear ? "스타트랙 영상 설정" : scoop ? scoop.action ?? "오늘의 특종 보기" : shown ? showItem(shown).action : wb ? "화이트보드에 쓰기" : fr ? (fr.want ? "냉장고 닫기" : "냉장고 열기") : cup ? (me.brush ? "붓 꽂기" : "붓 들기") : ez ? "함께 그리기" : site ? "하루들 바로가기" : insta ? "인스타 바로가기" : gift ? "아이템 받는 법" : me.lie || me.seat ? "일어나기" : seat && !(near && Math.hypot(seat.x - me.x, seat.y - me.y) > .55) ? "앉기" : near ? `${withJosa(near.p.nick, "와", "과")} 대화하기` : bag ? "빈백에 눕기" : "엘리베이터 타기";
  if (me.say && Date.now() - me.sayAt > 6000) { me.say = ""; sendPresence(true); }
}
const tgt = new THREE.Vector3();
function render(dt, t) {
  fpDt = dt;
  // 1인칭 고개는 마우스를 그대로 따른다(뒤따라 미끄러지는 느낌이 어지럽다). Q·E처럼 크게 돌릴 때만 부드럽게
  if (VIEW.mode === "first" && Math.abs(cam.yawT - cam.yaw) < .35) cam.yaw = cam.yawT; else cam.yaw = lerp(cam.yaw, cam.yawT, Math.min(1, dt * 8));
  if (VIEW.mode === "first") cam.look = cam.lookT;
  const fov = VIEW.mode === "first" ? 62 : 38; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  cam.pitch = lerp(cam.pitch, cam.pitchT, Math.min(1, dt * 8)); cam.dist = lerp(cam.dist, cam.distT, Math.min(1, dt * 8));   // 위에서 볼 때 기울기·거리(휠·핀치 확대)
  cam.ip = lerp(cam.ip, cam.ipT, Math.min(1, dt * 8)); cam.id = lerp(cam.id, cam.idT, Math.min(1, dt * 8)); cam.look = lerp(cam.look, cam.lookT, Math.min(1, dt * 10));
  tgt.set(wx(me.x), floorY(me.f) + .4, wz(me.y)); cam.target.lerp(tgt, Math.min(1, dt * 6));
  if (inside()) { cam.target.copy(tgt); placeInside(); } else placeCamera();
  const light = environment.lightOffset();
  sun.position.set(cam.target.x + light.x, cam.target.y + light.y, cam.target.z + light.z); sun.target.position.copy(cam.target);
  // 그림자 범위: 들어가서 볼 때는 내 둘레만 보이니 좁힌다(그릴 것이 줄고 그림자는 더 또렷해진다)
  const sx = inside() ? 18 : 40, sz = inside() ? 18 : 28, sc = sun.shadow.camera;
  if (sc.right !== sx || sc.top !== sz) { Object.assign(sc, { left: -sx, right: sx, top: sz, bottom: -sz }); sc.updateProjectionMatrix(); }
  adaptQuality(dt);
  setPos(meDoll, me.f, me.x, me.y); meDoll.root.position.y += me.up + me.jz; meDoll.blob.position.y = .012 - me.jz; meDoll.blob.scale.setScalar(1 - Math.min(.5, me.jz)); applyLie(meDoll, me.lie); meDoll.setSeated(me.seat); meDoll.root.visible = VIEW.mode === "top" || (VIEW.mode === "third" && !cam.close); meDoll.anim.noHead = false;   // 1인칭: 몸·팔은 숨기고 든 물건(노트북·커피·종이 총·네 컷)만 보인다(tickAct가 화면 앞에 붙인다)
  meDoll.update(dt, t, me.moving, me.lie ? 0 : me.seat ? me.seat.yaw : me.h, 0, !!(me.say && Date.now() - me.sayAt < 2500), tickAct(me, dt), me.jz > .01, running() && me.moving);
  applyWobble(me);
  if (me.brush && !inBooth()) { me.brush = false; if (!easelEd.hidden) closeEasel(); showToast("붓은 부스 안에서만 써요", "붓 꽂이에 돌려놨어요.", 2200); sendPresence(true); }
  holdBrush(me, me.brush, ezPen.c);
  setPos(dog.doll, me.f, dog.x, dog.y); dog.doll.update(dt, t, dog.moving, dog.h);
  for (const n of NPCS) if (n.doll.root.visible) { setPos(n.doll, n.f, n.x, n.y); applyLie(n.doll, n.lie); n.doll.setSeated(n.seat); n.doll.update(dt, t, n.moving, n.lie ? 0 : n.seat ? n.seat.yaw : n.talk ? Math.atan2(me.x - n.x, me.y - n.y) : n.h, n.seed, performance.now() - n.sayAt < 2500, tickAct(n, dt));  applyWobble(n); }
  environment.frame(dt); updateTraffic(dt); tickFx(dt); tickMeteors(dt, environment.nightVisibility()); tickFireworks(dt);
  for (const s of spinners) s.rotation.y += dt * .9;
  tickFridges(dt);
  syncPeers(dt, t);
  const mp = meDoll.root.position;
  if (VIEW.mode === "first" || (VIEW.mode === "third" && cam.close)) myTag.style.display = "none"; else project(myTag, mp.x, mp.y - .05, mp.z, true);
  myBub.hidden = !(me.say && Date.now() - me.sayAt < 6000); if (!myBub.hidden) { myBub.textContent = me.say; project(myBub, mp.x, mp.y + DOLL, mp.z); }
  showZzz(myZzz, meDoll, !!me.lie && myBub.hidden && meDoll.root.visible && VIEW.mode !== "first");
  for (const { n, tag, bub, zzz } of npcTags) {
    if (n.f !== me.f) { tag.style.display = "none"; bub.hidden = true; zzz.hidden = true; continue; }
    const p = n.doll.root.position; const d = Math.hypot(n.x - me.x, n.y - me.y);
    if (inside() && d > 14) { tag.style.display = "none"; bub.hidden = true; zzz.hidden = true; continue; }
    project(tag, p.x, p.y - .05, p.z, true); tag.style.opacity = d < 9 ? 1 : .55;
    bub.hidden = !(n.say && performance.now() - n.sayAt < 2500); if (!bub.hidden) { bub.textContent = n.say; project(bub, p.x, p.y + DOLL, p.z); }
    showZzz(zzz, n.doll, !!n.lie && bub.hidden);
  }
  for (const rt of roomTags) { // 들어가 있으면 공간 이름표는 숨기고(들어설 때 뜨는 이름으로 충분) 층 이동 · 엘리베이터 표지만 가까운 것. 1인칭에선 눈높이(.92) 위로
    if (inside() && (rt.place || Math.hypot(rt.x - wx(me.x), rt.z - wz(me.y)) > 12)) { rt.el.style.display = "none"; continue; }
    project(rt.el, rt.x, floorY(me.f) + (inside() && rt.y === WALL + .35 ? 1.6 : VIEW.mode === "first" ? Math.max(rt.y, 1.6) : rt.y), rt.z); }
}

/* ════════════════ 시작 ════════════════ */
const fontsReady = document.fonts ? Promise.race([document.fonts.load(`700 40px Gaegu`), new Promise((r) => setTimeout(r, 2500))]).catch(() => { }) : Promise.resolve();
fontsReady.then(() => {
  placeNPCs(); refreshRoomTags(); updateFloorHud();
  cam.target.set(wx(me.x), 0, wz(me.y)); placeCamera();
  const ld = document.getElementById("loading"); ld.style.opacity = "0"; setTimeout(() => ld.remove(), 450);
  showToast("11층에 도착했어요", "1번을 눌러 네 컷을 그려 보세요. 캐릭터를 누르면 그 크루의 하루들 피드가 열려요.", 5000);
  if (!LS.get("ww.tour")) openTour();   // 처음 오면 세 장짜리 안내(전체 조작법은 설정창 「조작법」 탭)
  loadFeed(); joinRoom(); void loadAccount();
  ready = true;
  // 화면 점검용 손잡이: 주소 끝에 ?debug를 붙였을 때만
  if (new URLSearchParams(location.search).has("debug")) (window as any).__ez = ezState; (window as any).__t = { peers, gl: renderer, Q, me, NPCS, cam, goFloor, setView, setMyAv, useSkill, jump, lieDown, sitDown, nearSeat, sendPresence, AVATAR_PRESETS, get floor() { return floor; } };
  if (new URLSearchParams(location.search).has("debug")) Object.assign((window as any).__t, { city, camera, startrack });
});

return { frame(dt: number) { if (!ready || inWorld) return; const t = performance.now() / 1000; step(Math.min(.05, dt), t); render(Math.min(.05, dt), t); startrack.frame(); } };
}
