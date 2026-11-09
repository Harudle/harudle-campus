import * as THREE from "three";
import { W, H, S, floorY, clamp } from "./world";
import { campusSun } from "./solar";
import { createSky } from "./sky";

type Weather = { code: number; clouds: number; forecastAt: number; fetchedAt: number };
type EnvironmentOptions = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  ambient: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  skyStars: THREE.Points[];
  moon: THREE.Sprite;
  paintCity: (daylight: number) => void;
  ground: number;
};

const WEATHER_MAX_AGE = 2 * 60 * 60 * 1000;
const smooth = (a: number, b: number, x: number) => { const v = clamp((x - a) / (b - a), 0, 1); return v * v * (3 - 2 * v); };

function precipitationKind(code: number): "none" | "rain" | "snow" {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) return "rain";
  return "none";
}

function precipitation(scene: THREE.Scene, ground: number) {
  const low = Math.max(ground, floorY(11) - 8), high = floorY(14) + 16, span = high - low;
  const halfX = W * S / 2, halfZ = H * S / 2;
  const makePositions = (count: number) => {
    const result = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // 입자는 네 면의 유리창 바깥에서만 생긴다.
      const side = Math.floor(Math.random() * 4), distance = .5 + Math.random() * 8;
      const x = side < 2 ? (side ? 1 : -1) * (halfX + distance) : (Math.random() * 2 - 1) * (halfX + 8);
      const z = side >= 2 ? (side === 3 ? 1 : -1) * (halfZ + distance) : (Math.random() * 2 - 1) * (halfZ + 8);
      result.set([x, low + Math.random() * span, z], i * 3);
    }
    return result;
  };
  const rainPositions = makePositions(1900), rainLines = new Float32Array(rainPositions.length * 2);
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainLines, 3).setUsage(THREE.DynamicDrawUsage));
  const rainMaterial = new THREE.LineBasicMaterial({ color: 0xC8E4F3, transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial); rain.frustumCulled = false; scene.add(rain);
  const snowPositions = makePositions(1400), snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const snowCanvas = document.createElement("canvas"); snowCanvas.width = snowCanvas.height = 32;
  const snowContext = snowCanvas.getContext("2d");
  snowContext.fillStyle = "#fff"; snowContext.beginPath(); snowContext.arc(16, 16, 13, 0, Math.PI * 2); snowContext.fill();
  const snowMaterial = new THREE.PointsMaterial({ color: 0xFFFFFF, map: new THREE.CanvasTexture(snowCanvas), size: .2, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false });
  const snow = new THREE.Points(snowGeometry, snowMaterial); snow.frustumCulled = false; scene.add(snow);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const rainAtNight = new THREE.Color(0xD7EAF5), rainAtDay = new THREE.Color(0x71899A);

  return (dt: number, kind: "none" | "rain" | "snow", daylight: number) => {
    const blend = 1 - Math.exp(-dt * 1.5);
    rainMaterial.color.copy(rainAtNight).lerp(rainAtDay, daylight);
    rainMaterial.opacity += ((kind === "rain" ? .72 : 0) - rainMaterial.opacity) * blend;
    snowMaterial.opacity += ((kind === "snow" ? .9 : 0) - snowMaterial.opacity) * blend;
    rain.visible = rainMaterial.opacity > .01; snow.visible = snowMaterial.opacity > .01;
    if (rain.visible) {
      for (let i = 0; i < rainPositions.length; i += 3) {
        if (!reducedMotion.matches) rainPositions[i + 1] -= dt * 14;
        if (rainPositions[i + 1] < low) rainPositions[i + 1] += span;
        const j = i * 2, x = rainPositions[i], y = rainPositions[i + 1], z = rainPositions[i + 2];
        rainLines[j] = x; rainLines[j + 1] = y; rainLines[j + 2] = z;
        rainLines[j + 3] = x + .08; rainLines[j + 4] = y + .8; rainLines[j + 5] = z;
      }
      rainGeometry.attributes.position.needsUpdate = true;
    }
    if (snow.visible) {
      for (let i = 1; i < snowPositions.length; i += 3) {
        if (!reducedMotion.matches) snowPositions[i] -= dt * 1.8;
        if (snowPositions[i] < low) snowPositions[i] += span;
      }
      snowGeometry.attributes.position.needsUpdate = true;
    }
  };
}

export function createEnvironment({ scene, camera, ambient, sun, skyStars, moon, paintCity, ground }: EnvironmentOptions) {
  const updateSky = createSky(scene, camera);
  const updatePrecipitation = precipitation(scene, ground);
  let weather: Weather | null = null, weatherStatus = "loading";
  let serverEpoch: number | null = null, clockAnchor = 0, requestFailed = false, pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let day = 0, night = 0, twilight = 0, clouds = 0, targetDay = 0, targetNight = 0, targetTwilight = 0, targetClouds = 0;
  let initialized = false, nextSkyUpdate = 0, cityStep = -1;
  const currentTime = () => serverEpoch === null ? Date.now() : serverEpoch + (performance.now() - clockAnchor);
  const currentWeather = () => weather && currentTime() - weather.fetchedAt <= WEATHER_MAX_AGE && currentTime() - weather.forecastAt <= WEATHER_MAX_AGE ? weather : null;
  const sunDirection = new THREE.Vector3(0, -1, 0);
  const white = new THREE.Color(0xFFFFFF), eveningLight = new THREE.Color(0xFFC69D);

  async function sync() {
    if (pending || document.hidden) return;
    pending = true;
    try {
      const response = await fetch("/api/environment", { cache: "no-store", signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error("environment unavailable");
      const state = await response.json();
      if (!Number.isFinite(state.serverTime)) throw new Error("invalid server time");
      serverEpoch = state.serverTime; clockAnchor = performance.now();
      weather = state.weather && Number.isFinite(state.weather.fetchedAt) && Number.isFinite(state.weather.forecastAt) &&
        Number.isFinite(state.weather.clouds) && Number.isInteger(state.weather.code) ? state.weather : null;
      weatherStatus = state.status; requestFailed = false;
    } catch { requestFailed = true; }
    finally {
      pending = false;
      clearTimeout(timer);
      timer = setTimeout(sync, currentWeather() ? 5 * 60 * 1000 : weatherStatus === "loading" && !requestFailed ? 5000 : 30000);
    }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { clearTimeout(timer); sync(); } });
  addEventListener("online", () => { clearTimeout(timer); sync(); });
  sync();

  function frame(dt: number) {
    nextSkyUpdate -= dt;
    if (nextSkyUpdate <= 0) {
      nextSkyUpdate = 1;
      const position = campusSun(currentTime());
      sunDirection.set(position.x, position.y, position.z);
      targetDay = position.daylight;
      targetTwilight = position.twilight;
      targetClouds = clamp((currentWeather()?.clouds ?? 0) / 100, 0, 1);
      targetNight = (1 - smooth(-.17, -.035, position.altitude)) * (1 - smooth(.3, .95, targetClouds));
    }
    const blend = initialized ? 1 - Math.exp(-dt * .7) : 1; initialized = true;
    day += (targetDay - day) * blend; night += (targetNight - night) * blend;
    twilight += (targetTwilight - twilight) * blend; clouds += (targetClouds - clouds) * blend;
    updateSky(day, twilight, clouds, sunDirection);
    for (const stars of skyStars) { (stars.material as THREE.PointsMaterial).opacity = night; stars.visible = night > .01; }
    (moon.material as THREE.SpriteMaterial).opacity = night; moon.visible = night > .01;
    // 실내 조명은 밤에도 유지해 글과 캐릭터가 잘 보이게 한다.
    ambient.intensity = 1.2 + day * .4; ambient.color.set(0xDFE7FF).lerp(white, day).lerp(eveningLight, twilight * .12);
    sun.intensity = .8 + day * .7; sun.color.set(0xDFE7FF).lerp(white, day).lerp(eveningLight, twilight * .65);
    const nextCityStep = Math.round(day * 40); if (nextCityStep !== cityStep) { cityStep = nextCityStep; paintCity(nextCityStep / 40); }
    updatePrecipitation(dt, currentWeather() ? precipitationKind(currentWeather()!.code) : "none", day);
  }

  return {
    frame,
    nightVisibility: () => night,
    lightOffset: () => ({ x: sunDirection.x * 24, y: Math.max(.25, sunDirection.y) * 24, z: sunDirection.z * 24 }),
  };
}
