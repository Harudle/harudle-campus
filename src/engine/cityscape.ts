import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { H, S, W, rng } from "./world";
import { trafficPosition } from "./traffic.mjs";

type FacadeStyle = "blueGlass" | "silverGlass" | "stone" | "banded" | "residential";
type Building = { x: number; z: number; width: number; depth: number; height: number; angle: number; style: FacadeStyle; podium?: boolean; crown?: boolean; fins?: boolean };

// 네이버 지도의 위성사진과 2026년 6월, 8월 거리뷰를 눈으로 확인해 배치했다.
// 내부 공간의 크기와 방위에 맞춰 간격을 조정한 대략적인 풍경이며 실측 도면이 아니다.
// x는 동쪽, z는 남쪽이다. 건물 이름과 동별 위치를 확인할 수 없는 곳은 지정하지 않는다.
const BUILDINGS: Building[] = [
  // 캠퍼스와 나란히 놓인 같은 단지의 다른 건물
  { x: 100, z: -38, width: 65, depth: 37, height: 65, angle: .32, style: "blueGlass", podium: true, crown: true, fins: true },
  // 북쪽과 북동쪽의 업무 건물
  { x: -142, z: -72, width: 48, depth: 39, height: 72, angle: .24, style: "silverGlass", podium: true, fins: true },
  { x: -82, z: -87, width: 48, depth: 41, height: 68, angle: .24, style: "silverGlass", podium: true, fins: true },
  { x: -12, z: -98, width: 51, depth: 32, height: 67, angle: .24, style: "silverGlass", podium: true, fins: true },
  { x: 62, z: -179, width: 44, depth: 33, height: 70, angle: .24, style: "blueGlass" },
  { x: -50, z: -251, width: 32, depth: 24, height: 87, angle: .12, style: "residential" },
  { x: -8, z: -270, width: 29, depth: 24, height: 94, angle: .12, style: "residential" },
  { x: 141, z: -125, width: 51, depth: 39, height: 72, angle: .30, style: "silverGlass", crown: true, fins: true },
  { x: 199, z: -150, width: 52, depth: 39, height: 70, angle: .30, style: "blueGlass", podium: true },
  { x: 255, z: -190, width: 43, depth: 36, height: 72, angle: .32, style: "stone" },
  // 금토로 남쪽에 길게 이어지는 건물과 서쪽 업무 단지
  { x: 31, z: 77, width: 93, depth: 36, height: 65, angle: .31, style: "blueGlass", podium: true, fins: true },
  { x: -105, z: 98, width: 104, depth: 35, height: 68, angle: .21, style: "blueGlass", podium: true, fins: true },
  { x: -236, z: 25, width: 56, depth: 45, height: 69, angle: .10, style: "silverGlass", crown: true, fins: true },
  { x: -238, z: 103, width: 48, depth: 43, height: 61, angle: -.15, style: "silverGlass" },
  // 위성지도에서 보이는 동쪽의 길쭉한 건물과 남쪽 단지
  { x: 233, z: -29, width: 111, depth: 35, height: 57, angle: .32, style: "blueGlass" },
  { x: 32, z: 161, width: 50, depth: 39, height: 72, angle: .30, style: "banded" },
  { x: -47, z: 184, width: 47, depth: 39, height: 69, angle: .29, style: "banded" },
  { x: -115, z: 200, width: 53, depth: 40, height: 62, angle: .23, style: "stone", crown: true },
];

const PALETTES = {
  blueGlass: { frame: 0x92a8b1, glass: 0x618da5, variation: 0x9bbac7 },
  silverGlass: { frame: 0xc4c8c5, glass: 0x8aa8b4, variation: 0xb1c4ca },
  stone: { frame: 0xc9cbc5, glass: 0x899da6, variation: 0xb0bcc0 },
  banded: { frame: 0xddddda, glass: 0x738e9c, variation: 0xa8bac0 },
  residential: { frame: 0xd4d7d4, glass: 0x77919e, variation: 0xa7b7bc },
};

const ROADS = [
  { x: 0, z: 54, length: 620, width: 14, angle: .30 },
  { x: -18, z: -50, length: 580, width: 12, angle: .30 },
  { x: 166, z: 0, length: 430, width: 12, angle: -1.27 },
  { x: 0, z: 248, length: 760, width: 28, angle: .30 },
];

// 지역 풍경에는 두꺼운 먹선을 사용하지 않고, 창문과 구조를 단순한 면으로 그린다.
export function createCityscape(scene: THREE.Scene, groundY: number) {
  const city = new THREE.Group(); city.name = "campusCityscape"; scene.add(city);
  const textures: THREE.Texture[] = [];
  const materialColors: { material: THREE.MeshLambertMaterial; day: THREE.Color; night: THREE.Color }[] = [];
  const surface = (day: number, night: number) => {
    const material = new THREE.MeshLambertMaterial({ color: day });
    materialColors.push({ material, day: new THREE.Color(day), night: new THREE.Color(night) });
    return material;
  };
  const groundMaterial = surface(0xaab2a5, 0x283744);
  const roadMaterial = surface(0x858b89, 0x28323e);
  const lineMaterial = surface(0xd9d9cb, 0x666d6e);
  const pavementMaterial = surface(0xc1c2b9, 0x3b454b);
  const cycleMaterial = surface(0xb18f89, 0x53474d);
  const riverMaterial = surface(0x819b9b, 0x253b4c);
  const hillMaterial = surface(0x819785, 0x263d42);
  const foliageMaterial = surface(0x7b9780, 0x304844);
  const trunkMaterial = surface(0x737d71, 0x303c3c);
  const roofMaterial = surface(0x9ca8a7, 0x283948);
  const finMaterial = surface(0xd2d7d2, 0x465361);
  const nightFrame = new THREE.Color(0x293949), nightGlass = new THREE.Color(0x1b2c3d);
  const warmWindow = new THREE.Color(0xb4a58c), sunset = new THREE.Color(0xe7a784);
  const facadeSources = new Map<FacadeStyle, { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; lights: number[] }>();
  for (const style of Object.keys(PALETTES) as FacadeStyle[]) {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d")!;
    const random = rng(style === "blueGlass" ? 31 : style === "silverGlass" ? 62 : style === "stone" ? 93 : style === "banded" ? 124 : 155);
    facadeSources.set(style, { canvas, context, lights: Array.from({ length: 128 }, () => random()) });
  }
  const facades = new Map<FacadeStyle, THREE.MeshLambertMaterial>();
  const facadeGeometry = new Map<FacadeStyle, THREE.BufferGeometry[]>();
  for (const style of Object.keys(PALETTES) as FacadeStyle[]) {
    const t = new THREE.CanvasTexture(facadeSources.get(style)!.canvas);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    textures.push(t); facades.set(style, new THREE.MeshLambertMaterial({ map: t })); facadeGeometry.set(style, []);
  }
  const roofs: THREE.BufferGeometry[] = [], accents: THREE.Matrix4[] = [], detail = new THREE.Object3D();
  // 같은 외벽을 사용하는 건물은 지오메트리를 합쳐 그리는 횟수를 줄인다.
  const staticBuilding = (b: Building, width = b.width, depth = b.depth, height = b.height, style = b.style) => {
    for (const [faceWidth, x, z, rotation] of [[width, 0, depth / 2, 0], [width, 0, -depth / 2, Math.PI], [depth, width / 2, 0, Math.PI / 2], [depth, -width / 2, 0, -Math.PI / 2]]) {
      const geometry = new THREE.PlaneGeometry(faceWidth, height), uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * faceWidth / 32, uv.getY(i) * height / 32);
      geometry.rotateY(rotation); geometry.translate(x, height / 2, z); geometry.rotateY(b.angle); geometry.translate(b.x, groundY, b.z);
      facadeGeometry.get(style)!.push(geometry);
    }
    const roof = new THREE.BoxGeometry(width, .15, depth);
    roof.translate(0, height + .075, 0); roof.rotateY(b.angle); roof.translate(b.x, groundY, b.z); roofs.push(roof);
  };
  const accent = (b: Building, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    detail.position.set(b.x + x * c + z * s, groundY + y, b.z - x * s + z * c);
    detail.rotation.y = b.angle; detail.scale.set(w, h, d); detail.updateMatrix(); accents.push(detail.matrix.clone());
  };
  for (const b of BUILDINGS) {
    staticBuilding(b);
    if (b.podium) staticBuilding(b, b.width * 1.07, b.depth * 1.07, 11, "silverGlass");
    if (b.crown) {
      for (const z of [-b.depth / 2, b.depth / 2]) accent(b, 0, b.height + .55, z, b.width, 1.1, .7);
      for (const x of [-b.width / 2, b.width / 2]) accent(b, x, b.height + .55, 0, .7, 1.1, b.depth);
    }
    if (b.fins) {
      const columns = Math.max(4, Math.floor(b.width / 7));
      for (let i = 0; i < columns; i++) for (const side of [-1, 1]) {
        accent(b, -b.width / 2 + (i + .5) * b.width / columns, b.height * .55, side * (b.depth / 2 + .08), .24, b.height * .82, .25);
      }
    }
    if (b.style === "banded") for (let i = 0; i < Math.floor(b.height / 4.1); i++) {
      accent(b, 0, 3.6 + i * 4.1, 0, b.width + .5, .55, b.depth + .5);
    }
  }
  for (const [style, parts] of facadeGeometry) if (parts.length) {
    city.add(new THREE.Mesh(mergeGeometries(parts)!, facades.get(style)!));
    parts.forEach((part) => part.dispose());
  }
  city.add(new THREE.Mesh(mergeGeometries(roofs)!, roofMaterial)); roofs.forEach((part) => part.dispose());
  const detailMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), finMaterial, accents.length);
  accents.forEach((matrix, i) => detailMesh.setMatrixAt(i, matrix)); city.add(detailMesh);

  // 우리 건물은 층에 따라 높이를 조정하므로 따로 유지한다.
  const campusWidth = W * S - .4, campusDepth = H * S - .4, campusHeight = -groundY - .2;
  const campusGeometry = new THREE.BoxGeometry(campusWidth, campusHeight, campusDepth), uv = campusGeometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4), width = face < 2 ? campusDepth : face >= 4 ? campusWidth : 32;
    uv.setXY(i, uv.getX(i) * width / 32, uv.getY(i) * campusHeight / 32);
  }
  campusGeometry.clearGroups(); campusGeometry.addGroup(0, 12, 0); campusGeometry.addGroup(12, 12, 1); campusGeometry.addGroup(24, 12, 0);
  const campusTower = new THREE.Mesh(campusGeometry, [facades.get("blueGlass")!, roofMaterial]);
  campusTower.position.set(0, groundY + campusHeight / 2, 0); city.add(campusTower);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(520, 64), groundMaterial);
  ground.rotation.x = -Math.PI / 2; ground.position.y = groundY; city.add(ground);
  const flatGroups = new Map<THREE.Material, THREE.Matrix4[]>(), flatTransform = new THREE.Object3D();
  const flatBox = (width: number, depth: number, material: THREE.Material, x: number, z: number, angle = 0, height = .08, lift = 0) => {
    flatTransform.position.set(x, groundY + height / 2 + .02 + lift, z);
    flatTransform.rotation.y = angle; flatTransform.scale.set(width, height, depth); flatTransform.updateMatrix();
    if (!flatGroups.has(material)) flatGroups.set(material, []);
    flatGroups.get(material)!.push(flatTransform.matrix.clone());
  };
  // 단지에 접한 도로와 남쪽의 큰 도로. 반복되는 짧은 선은 차선이다.
  const road = (x: number, z: number, length: number, width: number, angle: number) => {
    flatBox(length, width + 8, pavementMaterial, x, z, angle, .06);
    flatBox(length, width, roadMaterial, x, z, angle, .12);
    const c = Math.cos(angle), s = Math.sin(angle);
    flatBox(length, 1.8, cycleMaterial, x + s * (width / 2 + 1.4), z + c * (width / 2 + 1.4), angle, .08, .05);
    for (let distance = -length / 2 + 14; distance < length / 2 - 10; distance += 19) {
      flatBox(8, .35, lineMaterial, x + distance * c, z - distance * s, angle, .1, .12);
    }
    for (const cross of [-length * .23, length * .18]) {
      for (let offset = -width * .38; offset <= width * .38; offset += 2) {
        flatBox(3.2, 1.0, lineMaterial, x + cross * c + offset * s, z - cross * s + offset * c, angle, .1, .12);
      }
    }
  };
  for (const r of ROADS) road(r.x, r.z, r.length, r.width, r.angle);
  for (const [material, matrices] of flatGroups) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); city.add(mesh);
  }

  // 위성지도 남쪽에서 보이는 금토천의 굽은 흐름을 낮은 채도로 표현한다.
  const vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = -360 + i * 18, z = 202 - x * .24 + Math.sin(i * .38) * 6;
    vertices.push(x, groundY + .08, z - 5, x, groundY + .08, z + 5);
    if (i) { const p = (i - 1) * 2; indices.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
  }
  const riverGeometry = new THREE.BufferGeometry();
  riverGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); riverGeometry.setIndex(indices); riverGeometry.computeVertexNormals();
  city.add(new THREE.Mesh(riverGeometry, riverMaterial));

  // 멀리 보이는 녹지와 가로수는 낮은 면 수로 만들고 서로 다른 크기를 사용한다.
  const hillShapes = [[-260, -300, 180, 45, 85], [60, -340, 180, 32, 70], [-370, -170, 120, 27, 70], [265, 285, 180, 26, 80]];
  const hills = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 8), hillMaterial, hillShapes.length), hillTransform = new THREE.Object3D();
  hillShapes.forEach(([x, z, sx, sy, sz], i) => { hillTransform.scale.set(sx, sy, sz); hillTransform.position.set(x, groundY - 4, z); hillTransform.updateMatrix(); hills.setMatrixAt(i, hillTransform.matrix); });
  city.add(hills);
  const trees: [number, number, number][] = [];
  const random = rng(1928);
  for (const [startX, startZ, endX, endZ, count] of [[-300, 165, 260, 46, 35], [-300, -113, 250, -225, 30], [-320, 251, 180, 150, 30], [-310, 66, 240, -50, 28]]) {
    for (let i = 0; i < count; i++) {
      const t = (i + random() * .5) / count;
      trees.push([startX + (endX - startX) * t, startZ + (endZ - startZ) * t + (random() - .5) * 9, 5 + random() * 4]);
    }
  }
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), foliageMaterial, trees.length * 3);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.25, .35, 1, 6), trunkMaterial, trees.length);
  const transform = new THREE.Object3D();
  trees.forEach(([x, z, height], i) => {
    for (let part = 0; part < 3; part++) {
      const side = part - 1;
      transform.position.set(x + side * height * .18, groundY + height * (part === 1 ? .78 : .64), z + (i % 2 ? 1 : -1) * side * height * .09);
      transform.scale.set(height * .30, height * .30, height * .28); transform.updateMatrix(); crowns.setMatrixAt(i * 3 + part, transform.matrix);
    }
    transform.position.set(x, groundY + height * .26, z); transform.scale.set(1, height * .52, 1); transform.updateMatrix(); trunks.setMatrixAt(i, transform.matrix);
  });
  city.add(crowns, trunks);

  // 차량은 실제 교통량이 아니라 풍경을 위한 움직임이다. 두 개의 공유 모델로 함께 그린다.
  const cars = [
    { road: 0, lane: -3, speed: 7, phase: -145, color: 0xe0e1df },
    { road: 0, lane: -3, speed: 7, phase: 85, color: 0xa5b0b1 },
    { road: 0, lane: 3, speed: -7, phase: -70, color: 0x697780 },
    { road: 0, lane: 3, speed: -7, phase: 155, color: 0xd5d5ce },
    { road: 1, lane: -2.7, speed: 6, phase: -105, color: 0xb7bcb9 },
    { road: 1, lane: -2.7, speed: 6, phase: 120, color: 0xe4e4df },
    { road: 1, lane: 2.7, speed: -6, phase: -135, color: 0x7d8990 },
    { road: 1, lane: 2.7, speed: -6, phase: 75, color: 0xcecfca },
    { road: 3, lane: -6, speed: 11, phase: -145, color: 0x9aa3a6 },
    { road: 3, lane: -6, speed: 11, phase: 135, color: 0xe2e1da },
    { road: 3, lane: 6, speed: -11, phase: -40, color: 0xb6bcbb },
    { road: 3, lane: 6, speed: -11, phase: 210, color: 0x78868b },
  ];
  const carMaterial = surface(0xdfe2df, 0x59616a), carGlassMaterial = surface(0x697f8a, 0x283643);
  const carBodies = new THREE.InstancedMesh(new THREE.BoxGeometry(4.1, .65, 1.8), carMaterial, cars.length);
  const carWindows = new THREE.InstancedMesh(new THREE.BoxGeometry(2.1, .5, 1.55), carGlassMaterial, cars.length);
  carBodies.name = "trafficBodies"; carWindows.name = "trafficWindows";
  carBodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage); carWindows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  carBodies.frustumCulled = carWindows.frustumCulled = false;
  cars.forEach((car, i) => carBodies.setColorAt(i, new THREE.Color(car.color)));
  city.add(carBodies, carWindows);
  const carTransform = new THREE.Object3D(), location = { x: 0, z: 0, angle: 0, visible: true };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let trafficTime = 0, trafficInitialized = false;
  const updateTraffic = (dt: number) => {
    if (reducedMotion.matches && trafficInitialized) return;
    if (!reducedMotion.matches) trafficTime += dt;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      trafficPosition(ROADS[car.road], car.phase, car.speed, car.lane, trafficTime, location);
      carTransform.position.set(location.x, groundY + .52, location.z);
      carTransform.rotation.y = location.angle; carTransform.scale.setScalar(location.visible ? 1 : 0);
      carTransform.updateMatrix(); carBodies.setMatrixAt(i, carTransform.matrix);
      carTransform.position.y += .5; carTransform.updateMatrix(); carWindows.setMatrixAt(i, carTransform.matrix);
    }
    carBodies.instanceMatrix.needsUpdate = true; carWindows.instanceMatrix.needsUpdate = true; trafficInitialized = true;
  };
  updateTraffic(0);

  const mixed = new THREE.Color(), variation = new THREE.Color(), frame = new THREE.Color();
  const paintCity = (daylight: number, twilight: number, clouds: number) => {
    const cloudy = clouds * daylight * .10;
    for (const entry of materialColors) {
      entry.material.color.copy(entry.night).lerp(entry.day, daylight * (1 - cloudy));
      entry.material.color.lerp(sunset, twilight * (1 - clouds * .6) * .07);
    }
    for (const [style, source] of facadeSources) {
      const palette = PALETTES[style], { context: g, lights } = source;
      const dayFrame = new THREE.Color(palette.frame), dayGlass = new THREE.Color(palette.glass), dayVariation = new THREE.Color(palette.variation);
      frame.copy(nightFrame).lerp(dayFrame, daylight * (1 - cloudy));
      frame.lerp(sunset, twilight * (1 - clouds * .6) * .08);
      g.fillStyle = frame.getStyle(); g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
        const light = lights[y * 16 + x];
        variation.copy(dayGlass).lerp(dayVariation, light * .42);
        mixed.copy(nightGlass);
        if (light > .82) mixed.lerp(warmWindow, .68);
        mixed.lerp(variation, daylight * (1 - cloudy));
        mixed.lerp(sunset, twilight * (1 - clouds * .6) * .07);
        const horizontalBand = style === "banded", smallWindow = style === "residential";
        g.fillStyle = mixed.getStyle();
        g.fillRect(x * 16 + (smallWindow ? 3 : 1.5), y * 32 + (horizontalBand ? 6 : 2), smallWindow ? 10 : 13, horizontalBand ? 17 : 27);
      }
    }
    for (const t of textures) t.needsUpdate = true;
  };
  paintCity(0, 0, 0);
  return { city, campusTower, paintCity, updateTraffic };
}
