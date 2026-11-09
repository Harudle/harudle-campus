import * as THREE from "three";
import { CEIL, FLOORS, S, floorY, wx, wz } from "../engine/world";
import { playerClipProjection } from "./projection.mjs";
import { startrackScreenSize } from "./shared.mjs";

const PLAYER_WIDTH = 1280, PLAYER_HEIGHT = 720;
const point = new THREE.Vector4(), viewProjection = new THREE.Matrix4();

// The 13th-floor screen already exists in the world. Project its four corners
// with the same camera used to draw the campus, then transform the official player.
export function screenProjection(camera: THREE.PerspectiveCamera) {
  const screen = FLOORS[13].furn.find((o) => o.kind === "screenwall");
  if (!screen || screen.face !== "w") return null;
  const len = screen.h * S - 0.2;
  const { width, height } = startrackScreenSize(len, CEIL[13] - 0.3, screen.wide || 1);
  const x = wx(screen.x + screen.w) - 0.11;
  const z = wz(screen.y + screen.h / 2), bottom = floorY(13) + 0.15;
  if (camera.position.x >= x) return null; // Do not show the player through the back of the screen.
  camera.updateMatrixWorld();
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const corners = [
    [x, bottom + height, z - width / 2], [x, bottom + height, z + width / 2],
    [x, bottom, z + width / 2], [x, bottom, z - width / 2],
  ].map(([px, py, pz]) => {
    point.set(px, py, pz, 1).applyMatrix4(viewProjection);
    return { x: point.x, y: point.y, z: point.z, w: point.w };
  });
  // A full-height crew sidebar covers part of the world. Count only the part
  // that remains visible instead of playing a video behind the sidebar.
  const side = document.querySelector<HTMLElement>("#side");
  const sideRect = side?.getBoundingClientRect();
  const worldWidth = sideRect && sideRect.width > 0 && sideRect.height >= innerHeight - 1 && sideRect.left < innerWidth && sideRect.right > 0
    ? Math.max(0, sideRect.left) : innerWidth;
  const projected = playerClipProjection(corners, PLAYER_WIDTH, PLAYER_HEIGHT, innerWidth, innerHeight, worldWidth);
  if (!projected) return null;
  return { matrix: `matrix3d(${projected.matrix.join(",")})`, width: PLAYER_WIDTH, height: PLAYER_HEIGHT, bounds: projected.bounds, corners: projected.corners, visible: projected.visible };
}
