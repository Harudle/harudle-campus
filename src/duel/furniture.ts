// 대결장 가구 그리기 등록부: 종목 파일이 새 가구 종류(kind)를 여기 등록하면, 엔진의 buildFurn이 모르는 종류를 여기로 넘긴다.
// 엔진의 그리기 도구(툰 재질 · 먹선 상자 · 원기둥 · 글자판)를 kit으로 받아 캠퍼스 가구와 같은 모양새로 그린다.
// 배치(src/duel/arena/*.mjs)의 top은 올라설 윗면 높이, walk: true는 밟고 지나가는 것(world.ts topOf · walkThrough)
import type * as THREE from "three";

type Draw3 = (parent: THREE.Object3D, ...a: any[]) => THREE.Object3D;
export type FurnKit = {
  THREE: typeof THREE
  box: Draw3                 // box(부모, 폭, 높이, 깊이, 색, x, 바닥 y, z, { line, mat, cast, soft }) — y는 아랫면
  cyl: Draw3                 // cyl(부모, 윗반지름, 아랫반지름, 높이, 색, x, 바닥 y, z, { seg, open })
  ball: Draw3                // ball(부모, 반지름, 색, x, 가운데 y, z)
  board: Draw3               // board(부모, 폭, 높이, 텍스처, x, 가운데 y, z, y축 회전): 앞뒤로 보이는 글자 · 그림 판
  toon(color: number, o?: { map?: THREE.Texture; opacity?: number }): THREE.Material
  solidMesh(geo: THREE.BufferGeometry, color: number, o?: any): THREE.Group
  canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, o?: any): THREE.Texture
  signTex(text: string, o?: { bg?: string; fg?: string; size?: number; w?: number; h?: number }): THREE.Texture
  C: Record<string, number>  // 캠퍼스 색(white · wood · gray · dark …)
  S: number; wx(tx: number): number; wz(ty: number): number; HAND: string; INK: number
};
// 그리는 함수가 받는 것: kit + 이 가구의 한가운데(x, z, 월드 m) · 크기(w, d, m) · 층
export type FurnArgs = FurnKit & { x: number; z: number; w: number; d: number; fl: any };
export type FurnDraw = (G: THREE.Group, o: any, k: FurnArgs) => void;

const draws = new Map<string, FurnDraw>();
let kit: FurnKit | null = null;
export function registerFurn(kind: string, draw: FurnDraw) { draws.set(kind, draw); }
export function setFurnKit(k: FurnKit) { kit = k; }
export const furnKit = () => kit;
// 엔진 buildFurn의 default: 등록된 종류면 그리고 true
export function drawFurn(G: THREE.Group, o: any, fl: any): boolean {
  const draw = draws.get(o.kind); if (!draw || !kit) return false;
  draw(G, o, { ...kit, fl, x: kit.wx(o.x + o.w / 2), z: kit.wz(o.y + o.h / 2), w: o.w * kit.S, d: o.h * kit.S });
  return true;
}
