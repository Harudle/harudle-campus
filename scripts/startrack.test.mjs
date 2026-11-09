import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import WebSocket from "ws";
import * as THREE from "three";
import { canControlStartrack, inStartrack, startrackScreenSize, startrackVolume, youtubeVideoId } from "../src/startrack/shared.mjs";
import { createStartrack } from "../server/startrack.js";
import { playerClipProjection, playerMatrix, screenIntersectsRect, visibleFraction } from "../src/startrack/projection.mjs";

test("재생기 네 모서리를 3D 화면 모서리에 맞춘다", () => {
  const corners = [{ x: 180, y: 120 }, { x: 980, y: 60 }, { x: 1000, y: 490 }, { x: 200, y: 450 }];
  const matrix = playerMatrix(corners, 1280, 720);
  assert.ok(matrix);
  const apply = (x, y) => { const w = matrix[3] * x + matrix[7] * y + matrix[15]; return { x: (matrix[0] * x + matrix[4] * y + matrix[12]) / w, y: (matrix[1] * x + matrix[5] * y + matrix[13]) / w }; };
  for (const [i, [x, y]] of [[0, 0], [1280, 0], [1280, 720], [0, 720]].entries()) {
    const actual = apply(x, y); assert.ok(Math.abs(actual.x - corners[i].x) < 0.001); assert.ok(Math.abs(actual.y - corners[i].y) < 0.001);
  }
  assert.equal(playerMatrix(Array(4).fill({ x: 1, y: 1 }), 1056, 360), null);
});

test("카메라 뒤로 화면 모서리가 넘어가도 보이는 부분을 같은 위치에 표시한다", () => {
  const camera = new THREE.PerspectiveCamera(70, 1.5, .1, 100);
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const world = [[-1, 1, -3], [1, 1, 1], [1, -1, 1], [-1, -1, -3]];
  const points = world.map(([x, y, z]) => { const p = new THREE.Vector4(x, y, z, 1).applyMatrix4(viewProjection); return { x: p.x, y: p.y, z: p.z, w: p.w }; });
  assert.ok(points.some((p) => p.w < 0));
  const projected = playerClipProjection(points, 1280, 720, 1200, 800);
  assert.ok(projected);
  assert.ok(projected.visible > 0 && projected.visible <= .5, "시야 밖 모서리 때문에 자동 재생을 새로 시작하지 않는다");
  assert.ok(projected.corners.length >= 3);
  assert.ok(projected.corners.every((p) => p.x >= -1e-8 && p.x <= 1200 + 1e-8 && p.y >= -1e-8 && p.y <= 800 + 1e-8));
  const m = projected.matrix;
  const apply = (x, y) => { const w = m[3] * x + m[7] * y + m[15]; return { x: (m[0] * x + m[4] * y + m[12]) / w, y: (m[1] * x + m[5] * y + m[13]) / w }; };
  const first = apply(0, 0);
  assert.ok(Math.abs(first.x - (points[0].x / points[0].w + 1) * 600) < 1e-8);
  assert.ok(Math.abs(first.y - (1 - points[0].y / points[0].w) * 400) < 1e-8);
  assert.ok(screenIntersectsRect(projected.corners, { left: 0, right: 1200, top: 0, bottom: 800 }, 1200, 800));
  assert.equal(playerClipProjection(points.map((p) => ({ ...p, x: p.x + 1000 * p.w })), 1280, 720, 1200, 800), null);
});

test("스타트랙 화면은 기존 가로 크기를 유지하면서 16:9 높이를 사용한다", () => {
  const length = 11 * 1.25 - .2, maxHeight = 4.4 - .3, wide = 1.65;
  const oldWidth = Math.min(length, Math.min(length * 9 / 16, maxHeight) * 16 / 9 * wide);
  const size = startrackScreenSize(length, maxHeight, wide);
  assert.equal(size.width, oldWidth);
  assert.ok(Math.abs(size.width / size.height - 16 / 9) < 1e-10);
  assert.ok(size.height > maxHeight);
});

test("화면 일부가 잘려도 스타트랙 화면의 위치와 보이는 비율을 계산한다", () => {
  const rectangle = (left, right, top, bottom) => [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
  assert.equal(visibleFraction(rectangle(0, 400, 0, 200), 400, 200), 1);
  assert.equal(visibleFraction(rectangle(-100, 300, 0, 200), 400, 200), 0.75);
  assert.equal(visibleFraction(rectangle(-200, 200, 0, 200), 400, 200), 0.5);
  assert.equal(visibleFraction(rectangle(500, 900, 0, 200), 400, 200), 0);
  assert.equal(visibleFraction(rectangle(100, 100, 0, 200), 400, 200), 0);
});

test("기울어진 화면과 UI가 실제로 겹칠 때만 가려진 것으로 판단한다", () => {
  const screen = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }];
  assert.equal(screenIntersectsRect(screen, { left: 80, right: 95, top: 20, bottom: 30 }, 200, 200), false);
  assert.equal(screenIntersectsRect(screen, { left: 10, right: 20, top: 10, bottom: 20 }, 200, 200), true);
  assert.equal(screenIntersectsRect(screen, { left: -30, right: -5, top: 0, bottom: 30 }, 200, 200), false);
});

test("유튜브 영상 주소만 등록한다", () => {
  const id = "dQw4w9WgXcQ";
  for (const value of [id, `https://youtu.be/${id}?t=8`, `https://www.youtube.com/watch?v=${id}`, `https://youtube.com/shorts/${id}`, `https://www.youtube.com/live/${id}`]) assert.equal(youtubeVideoId(value), id);
  for (const value of ["http://youtu.be/dQw4w9WgXcQ", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/invalid", "javascript:alert(1)"]) assert.equal(youtubeVideoId(value), null);
});

test("스타트랙 모든 객석에서는 들리고, 12층과 다른 방에서는 들리지 않는다", () => {
  for (let tier = 0; tier < 3; tier++) {
    const radius = 4.2 + (tier + 0.5) * 1.33;
    for (let angle = -Math.PI / 2; angle <= Math.PI / 2 + 0.001; angle += Math.PI / 12) {
      const p = { f: 13, x: 12.38 - radius * Math.cos(angle), y: 24.5 + radius * 1.5 * Math.sin(angle), rm: "" };
      assert.ok(startrackVolume(p) > 0, JSON.stringify(p));
      assert.equal(canControlStartrack(p), true, JSON.stringify(p));
      assert.equal(startrackVolume({ ...p, f: 12 }), 0);
    }
  }
  assert.equal(startrackVolume({ f: 13, x: 13, y: 25, rm: "13:회의실" }), 0);
  assert.equal(inStartrack({ f: 13, x: 20, y: 24.5, rm: "" }), false);
  assert.equal(startrackVolume({ f: 13, x: 20, y: 24.5, rm: "" }), 0);
  assert.equal(inStartrack({ f: 12, x: 6, y: 20, rm: "" }), false);
  assert.ok(startrackVolume({ f: 13, x: 11, y: 24.5 }) > startrackVolume({ f: 13, x: 4, y: 24.5 }));
  assert.equal(startrackVolume({ f: 13, x: 45, y: 24.5 }), 0);
});

test("나중에 들어온 사람도 진행 중인 시간과 상태를 받는다", () => {
  let clock = 1000;
  const state = createStartrack({ now: () => clock });
  const peer = { name: "크루", presence: { f: 13, x: 6, y: 20, rm: "" } };
  assert.equal(state.apply({ op: "set", value: "dQw4w9WgXcQ" }, peer).state.playing, false);
  state.apply({ op: "play" }, peer);
  clock += 12_500;
  assert.equal(state.snapshot().position, 12.5);
  state.apply({ op: "pause" }, peer);
  clock += 7000;
  assert.equal(state.snapshot().position, 12.5);
  assert.equal(state.apply({ op: "seek", position: 40 }, peer).state.position, 40);
  assert.equal(state.apply({ op: "seek", position: -1 }, peer).error, "invalid_position");
  assert.equal(state.apply({ op: "play" }, { ...peer, presence: { ...peer.presence, f: 12 } }).error, "startrack_area_required");
});

test("라이브는 시작 시각으로 되돌리지 않고 방송 종류와 재생 상태를 공유한다", () => {
  let clock = 1000;
  const state = createStartrack({ now: () => clock });
  const peer = { name: "크루", presence: { f: 13, x: 6, y: 20, rm: "" } };
  assert.equal(state.apply({ op: "set", value: "https://youtube.com/live/dQw4w9WgXcQ", mode: "live" }, peer).state.mode, "live");
  state.apply({ op: "play" }, peer);
  clock += 120_000;
  assert.equal(state.snapshot().position, 0);
  assert.equal(state.snapshot().playing, true);
  assert.equal(state.apply({ op: "seek", position: 5 }, peer).error, "live_seek_unavailable");
  assert.equal(state.apply({ op: "set", value: "dQw4w9WgXcQ", mode: "other" }, peer).error, "invalid_mode");
  assert.equal(state.apply({ op: "set", value: "dQw4w9WgXcQ" }, peer).state.mode, "video");
});

test("재생 중 다른 영상이나 재생 종류로 바꾸면 모두의 재생을 유지한다", () => {
  let clock = 1000;
  const state = createStartrack({ now: () => clock });
  const peer = { name: "크루", presence: { f: 13, x: 6, y: 20, rm: "" } };
  state.setPresent("a", true);
  state.apply({ op: "set", value: "dQw4w9WgXcQ", mode: "video" }, peer);
  state.apply({ op: "play" }, peer);
  clock += 6000;
  let result = state.apply({ op: "set", value: "4t4AQ15yj1M", mode: "video" }, peer).state;
  assert.equal(result.playing, true);
  assert.equal(result.position, 0);
  assert.equal(state.apply({ op: "mode", videoId: "dQw4w9WgXcQ", mode: "live" }, peer).error, "stale_video");
  result = state.apply({ op: "mode", videoId: "4t4AQ15yj1M", mode: "live" }, peer).state;
  assert.equal(result.mode, "live"); assert.equal(result.playing, true);
  state.apply({ op: "pause" }, peer);
  result = state.apply({ op: "set", value: "dQw4w9WgXcQ", mode: "video" }, peer).state;
  assert.equal(result.playing, false, "사람이 멈춘 상태에서 영상을 바꿔도 자동으로 재생하지 않는다");
});

test("방송이 끝나면 다시 반복하지 않으며 이전 영상의 종료 신호는 무시한다", () => {
  const state = createStartrack();
  const peer = { name: "크루", presence: { f: 13, x: 6, y: 20, rm: "" } };
  state.setPresent("a", true);
  state.apply({ op: "set", value: "4t4AQ15yj1M", mode: "live" }, peer);
  const playing = state.apply({ op: "play" }, peer).state;
  state.apply({ op: "ended", videoId: "4t4AQ15yj1M", revision: playing.revision - 1, position: 0 }, peer);
  assert.equal(state.snapshot().playing, true);
  const ended = state.apply({ op: "ended", videoId: "4t4AQ15yj1M", revision: playing.revision, position: 0 }, peer).state;
  assert.equal(ended.playing, false); assert.equal(ended.autoPaused, false);
  state.setPresent("b", true);
  assert.equal(state.snapshot().playing, false, "새 사람이 들어와도 끝난 방송을 다시 시작하지 않는다");
});

test("보는 사람이 있으면 멈추지 않고 마지막 사람이 떠나면 잠시 뒤 멈춘다", () => {
  let clock = 1000, nextTimer = 0;
  const jobs = new Map(), changes = [];
  const setTimer = (fn, delay) => { const id = ++nextTimer; jobs.set(id, { fn, at: clock + delay }); return id; };
  const advance = (ms) => { clock += ms; for (const [id, job] of [...jobs]) if (job.at <= clock) { jobs.delete(id); job.fn(); } };
  const state = createStartrack({ now: () => clock, onChange: (value) => changes.push(value), setTimer, clearTimer: (id) => jobs.delete(id), idleDelayMs: 5000 });
  const peer = { name: "크루", presence: { f: 13, x: 6, y: 20, rm: "" } };
  state.apply({ op: "set", value: "dQw4w9WgXcQ" }, peer);
  state.setPresent("a", true);
  state.apply({ op: "play" }, peer);
  advance(10000);
  state.setPresent("b", true); state.setPresent("a", false);
  advance(10000);
  assert.equal(state.snapshot().playing, true, "새 시청자가 들어와도 진행 중인 재생이 멈추지 않는다");
  state.setPresent("b", false);
  advance(4000); state.setPresent("c", true); advance(2000);
  assert.equal(state.snapshot().playing, true, "짧은 화면 이동은 전체 재생을 멈추지 않는다");
  state.setPresent("c", false); advance(5000);
  assert.equal(state.snapshot().playing, false);
  assert.equal(state.snapshot().autoPaused, true);
  const pausedAt = state.snapshot().position;
  advance(5000); assert.equal(state.snapshot().position, pausedAt);
  state.setPresent("d", true);
  assert.equal(state.snapshot().playing, true);
  assert.equal(state.snapshot().autoPaused, false);
  advance(2000); assert.equal(state.snapshot().position, pausedAt + 2);
  state.apply({ op: "pause" }, peer); state.setPresent("d", false); state.setPresent("e", true);
  assert.equal(state.snapshot().playing, false, "사람이 직접 멈춘 영상은 새 시청자가 들어와도 멈춰 있다");
  assert.equal(changes.length, 2);
  state.apply({ op: "play" }, peer);
  advance(46000); state.expirePresence(); advance(5000);
  assert.equal(state.snapshot().autoPaused, true, "연결이 끊긴 시청자의 오래된 상태도 정리한다");
});

test("여러 접속자의 재생 상태와 스타트랙 채팅을 서버가 공유한다", async (t) => {
  const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const port = listener.address().port; await new Promise((resolve) => listener.close(resolve));
  const child = spawn(process.execPath, ["app.js"], { env: { ...process.env, CAMPUS_BIND_HOST: "127.0.0.1", MEDIA_PROVIDER: "", MEDIA_MEETINGS: "", PORT: String(port) }, stdio: "ignore" });
  t.after(() => child.kill("SIGKILL"));
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 50)); }
  assert.equal(ready, true);
  async function connect(uid, p) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`), messages = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString()))); await once(socket, "open"); t.after(() => socket.terminate());
    socket.send(JSON.stringify({ t: "id", u: uid })); socket.send(JSON.stringify({ t: "p", p }));
    const wait = async (predicate, timeout = 3000) => {
      const until = Date.now() + timeout;
      while (Date.now() < until) { const i = messages.findIndex(predicate); if (i !== -1) return messages.splice(i, 1)[0]; await new Promise((r) => setTimeout(r, 10)); }
      return null;
    };
    return { socket, wait, send: (m) => socket.send(JSON.stringify(m)) };
  }
  const a = await connect("starA", { f: 13, x: 5, y: 18 });
  const b = await connect("starB", { f: 13, x: 5, y: 31 });
  const downstairs = await connect("starC", { f: 12, x: 5, y: 18 });
  a.send({ t: "startrack:clock", sentAt: 1234 });
  const clockReply = await a.wait((m) => m.t === "startrack:clock");
  assert.equal(clockReply?.sentAt, 1234);
  assert.ok(Number.isFinite(clockReply?.serverTime));
  a.send({ t: "startrack", op: "set", value: "https://youtu.be/dQw4w9WgXcQ" });
  assert.equal((await b.wait((m) => m.t === "startrack" && m.state?.videoId))?.state.videoId, "dQw4w9WgXcQ");
  a.send({ t: "startrack", op: "play" });
  assert.equal((await b.wait((m) => m.t === "startrack" && m.state?.playing))?.state.playing, true);
  const late = await connect("starD", { f: 13, x: 7, y: 24 });
  assert.equal((await late.wait((m) => m.t === "startrack" && m.state?.playing))?.state.videoId, "dQw4w9WgXcQ");
  late.send({ t: "startrack", op: "set", value: "4t4AQ15yj1M", mode: "video" });
  const changed = await b.wait((m) => m.t === "startrack" && m.state?.videoId === "4t4AQ15yj1M");
  assert.equal(changed?.state.playing, true, "다른 사람이 영상을 바꾸면 같은 영상이 재생된다");
  late.send({ t: "startrack", op: "mode", videoId: "4t4AQ15yj1M", mode: "live" });
  assert.equal((await b.wait((m) => m.t === "startrack" && m.state?.mode === "live"))?.state.playing, true);
  late.send({ t: "startrack", op: "mode", videoId: "4t4AQ15yj1M", mode: "video" });
  assert.equal((await b.wait((m) => m.t === "startrack" && m.state?.mode === "video" && m.state.revision > changed.state.revision))?.state.playing, true);
  late.send({ t: "startrack", op: "seek", position: 45 });
  assert.ok((await b.wait((m) => m.t === "startrack" && m.state?.position >= 45 && m.state.revision > changed.state.revision))?.state.playing);
  // A person still in the space counts even when their own player is off.
  late.send({ t: "startrack:view", watching: false });
  a.send({ t: "p", p: { f: 12, x: 5, y: 18 } });
  b.send({ t: "p", p: { f: 12, x: 5, y: 31 } });
  assert.equal(await a.wait((m) => m.t === "startrack" && m.state?.autoPaused, 5300), null);
  late.send({ t: "p", p: { f: 12, x: 7, y: 24 } });
  assert.equal((await a.wait((m) => m.t === "startrack" && m.state?.autoPaused, 7000))?.state.playing, false);
  late.send({ t: "p", p: { f: 13, x: 7, y: 24 } });
  assert.equal((await a.wait((m) => m.t === "startrack" && m.state?.playing && m.state?.autoPaused === false && m.state.revision > 2))?.state.playing, true);
  downstairs.send({ t: "startrack", op: "clear" });
  assert.equal((await downstairs.wait((m) => m.t === "startrack" && m.error))?.error, "startrack_area_required");
  a.send({ t: "p", p: { f: 13, x: 5, y: 18 } });
  b.send({ t: "p", p: { f: 13, x: 5, y: 31 } });
  a.send({ t: "startrack:clock", sentAt: 111 });
  b.send({ t: "startrack:clock", sentAt: 222 });
  assert.ok(await a.wait((m) => m.t === "startrack:clock" && m.sentAt === 111));
  assert.ok(await b.wait((m) => m.t === "startrack:clock" && m.sentAt === 222));
  a.send({ t: "chat", k: "near", text: "스타트랙에서 함께 봐요" });
  assert.equal((await b.wait((m) => m.t === "chat" && m.text === "스타트랙에서 함께 봐요"))?.text, "스타트랙에서 함께 봐요");
  assert.equal(await downstairs.wait((m) => m.t === "chat" && m.text === "스타트랙에서 함께 봐요", 200), null);
});
