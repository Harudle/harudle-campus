import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

test("화면 일부가 보이면 재생을 유지하고 완전히 가려지면 내 재생만 멈춘다", async (t) => {
  const original = new Map(["window", "document", "location", "innerWidth", "innerHeight", "performance"].map((key) => [key, globalThis[key]]));
  t.after(() => { for (const [key, value] of original) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  const elements = new Map();
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const el = { id, hidden: false, disabled: false, value: id === "startrackVolume" ? "80" : "0", textContent: "", style: {}, dataset: {}, offsetWidth: 220, offsetHeight: 36, scrollHeight: 300,
      addEventListener() {}, focus() {}, replaceChildren() {}, reportValidity: () => true, click() { this.onclick?.(); },
      querySelector: () => ({ disabled: false }), getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
    elements.set(id, el); return el;
  }
  let sidebar = null;
  const doc = { hidden: false, activeElement: null, pointerLockElement: null, getElementById: element, querySelector: (selector) => selector === "#side" && sidebar ? { getBoundingClientRect: () => sidebar } : null, createElement: (tag) => element(`new-${tag}`), addEventListener() {} };
  let player, tick;
  class FakePlayer {
    constructor(_id, options) { this.events = options.events; this.videoId = options.videoId; this.state = 5; this.time = 0; this.duration = 0; this.volume = 80; this.pauses = 0; this.plays = 0; this.cues = 0; this.seeks = []; this.iframe = {}; player = this; queueMicrotask(() => this.events.onReady({ target: this })); }
    emit(state) { this.state = state; this.events.onStateChange({ target: this, data: state }); }
    getPlayerState() { return this.state; } getCurrentTime() { return this.time; } getDuration() { return this.duration; } getVolume() { return this.volume; }
    getIframe() { return this.iframe; } getVideoUrl() { return `https://www.youtube.com/watch?v=${this.videoId}`; } setVolume(value) { this.volume = value; }
    cueVideoById(id, time) { this.videoId = id; this.cues++; this.time = time; this.state = 5; }
    seekTo(time) { this.seeks.push(time); this.time = time; }
    playVideo() { this.plays++; this.emit(3); }
    pauseVideo() { this.pauses++; this.emit(2); }
    stopVideo() {} destroy() {}
  }
  const timeout = (callback, ms) => { const timer = setTimeout(callback, ms); timer.unref(); return timer; };
  globalThis.window = { YT: { Player: FakePlayer }, setTimeout: timeout, setInterval: (callback) => { tick = callback; return 1; }, addEventListener() {} };
  globalThis.document = doc; globalThis.location = { origin: "http://localhost" }; globalThis.innerWidth = 1200; globalThis.innerHeight = 800;
  let clock = 10_000; globalThis.performance = { now: () => clock };
  const built = await build({ entryPoints: ["src/startrack/controller.ts"], bundle: true, format: "esm", platform: "node", write: false });
  const { mountStartrack } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`);
  const fullProjection = () => ({ matrix: "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)", width: 1280, height: 720, bounds: { left: 350, right: 950, top: 190, bottom: 500 }, visible: 1 });
  let projected = fullProjection();
  const sent = [], controller = mountStartrack((message) => { sent.push(message); return true; }, () => projected);
  controller.setNetwork(true); controller.updateWorld({ f: 13, x: 6, y: 20, rm: "" });
  controller.receive({ state: { videoId: "M7lc1UVf-VE", playing: false, position: 30, revision: 1, by: "크루" } });
  for (let i = 0; i < 10 && !controller.debug().playerReady; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.debug().playerReady, true);
  doc.activeElement = player.iframe;

  const cuesBeforeClick = player.cues;
  player.emit(3); player.time = 0; clock += 4000; // Slow buffering after the viewer presses play.
  tick();
  assert.equal(player.pauses, 0);
  assert.equal(player.cues, cuesBeforeClick);
  player.emit(1);
  assert.equal(sent.at(-1)?.op, "play");
  controller.receive({ state: { videoId: "M7lc1UVf-VE", playing: true, position: 0, revision: 2, by: "크루" } });

  projected = { ...fullProjection(), visible: .25 }; controller.frame();
  assert.equal(controller.debug().videoVisible, true);
  assert.equal(controller.debug().canAutoStart, false);
  assert.equal(player.state, 1, "재생 중에는 화면 일부가 보여도 계속 재생한다");
  assert.equal(player.pauses, 0);
  projected = null; controller.frame();
  assert.equal(controller.debug().presentation, "offscreen");
  assert.equal(player.pauses, 1);
  assert.equal(player.state, 2);
  assert.equal(sent.filter((m) => m.op === "pause").length, 0);
  assert.equal(controller.debug().state.playing, true);
  const playsWhileHidden = player.plays;
  projected = { ...fullProjection(), visible: .25 }; controller.frame();
  tick();
  assert.equal(player.state, 2);
  assert.equal(player.plays, playsWhileHidden, "절반 이하에서는 자동 재생을 시작하지 않는다");
  assert.match(element("startrackNotice").textContent, /내 영상 재생/);
  clock += 15_000;
  element("startrackResume").click();
  assert.equal(player.state, 3, "사용자가 직접 누르면 일부만 보이는 화면에서도 재생할 수 있다");
  assert.equal(player.seeks.at(-1), 15, "늦게 온 사람도 공유 재생 위치부터 시작한다");
  player.emit(1);
  clock += 4000; player.time = 0; tick();
  assert.equal(player.seeks.at(-1), 19, "화면이 일부만 보여도 재생 중인 영상은 공유 시간에 다시 맞춘다");
  projected = null; controller.frame();
  assert.equal(player.state, 2);
  projected = { ...fullProjection(), visible: .51 }; controller.frame();
  assert.equal(player.state, 3, "절반 이상이 보이면 자동 재생을 다시 시작한다");
  player.emit(1);
  assert.equal(controller.debug().presentation, "screen");
  assert.equal(controller.debug().state.playing, true);
  sidebar = { left: 900, right: 1200, top: 0, bottom: 800, width: 300, height: 800 };
  controller.frame();
  assert.equal(controller.debug().presentation, "offscreen", "크루 목록이 유튜브 재생기를 덮지 않는다");
  assert.equal(player.state, 2);
  assert.equal(sent.filter((m) => m.op === "pause").length, 0);
  sidebar = null; controller.frame(); player.emit(1);
  player.emit(2); // A viewer's explicit pause in the iframe is shared.
  assert.equal(sent.at(-1)?.op, "pause");
  controller.receive({ state: { videoId: "M7lc1UVf-VE", playing: false, position: 1, revision: 3, by: "크루" } });
  const pausesBeforeButton = player.pauses;
  element("startrackPlay").click();
  assert.equal(sent.at(-1)?.op, "play");
  tick();
  assert.equal(player.pauses, pausesBeforeButton);
  controller.updateWorld({ f: 13, x: 20, y: 24, rm: "" });
  assert.equal(controller.debug().videoVisible, false);
  assert.equal(element("startrackDock").hidden, true);

  controller.updateWorld({ f: 13, x: 6, y: 20, rm: "" });
  controller.receive({ state: { videoId: "FbcZb0CkkvU", mode: "live", playing: false, position: 0, revision: 4, by: "크루" } });
  for (let i = 0; i < 10 && !controller.debug().playerReady; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(element("startrackSeek").hidden, true);
  player.duration = 600; player.time = 530;
  element("startrackPlay").click();
  assert.equal(player.seeks.at(-1), 600);
  controller.receive({ state: { videoId: "FbcZb0CkkvU", mode: "live", playing: true, position: 0, revision: 5, by: "크루" } });
  player.emit(1);
  const liveSeeks = player.seeks.length;
  clock += 10_000; tick();
  assert.equal(player.seeks.length, liveSeeks, "일반 영상의 재생 시간으로 라이브를 되감지 않는다");
  projected = null; controller.frame();
  assert.equal(player.state, 2);
  player.duration = 620;
  projected = fullProjection();
  controller.frame();
  assert.equal(player.state, 3);
  assert.equal(player.seeks.at(-1), 620, "라이브 화면으로 돌아오면 현재 방송을 본다");

  controller.receive({ state: { videoId: "M7lc1UVf-VE", mode: "video", playing: true, position: 20, serverTime: 95_000, revision: 6, by: "크루" } });
  controller.syncClock(clock - 20, 100_000);
  assert.ok(Math.abs(controller.debug().targetTime - 25.01) < .001, "서버 상태를 늦게 처리해도 서버 시각에 맞춘다");
  controller.syncClock(clock - 500, 200_000);
  assert.ok(Math.abs(controller.debug().targetTime - 25.01) < .001, "느린 측정은 더 빠른 시간 측정을 덮지 않는다");

  doc.activeElement = null; clock += 2000; player.emit(1); player.time = controller.debug().targetTime; tick();
  doc.activeElement = player.iframe; clock += 500; player.time += .5; tick();
  clock += 500; player.time = 120; tick();
  assert.equal(sent.at(-1)?.op, "seek", "일반 영상에서 직접 움직인 재생 위치를 공유한다");
  assert.equal(sent.at(-1)?.position, 120);
  const cuesBeforeModeChange = player.cues;
  player.duration = 600;
  controller.receive({ state: { videoId: "M7lc1UVf-VE", mode: "live", playing: true, position: 0, serverTime: 100_000, revision: 7, by: "크루" } });
  assert.equal(player.cues, cuesBeforeModeChange, "같은 영상을 라이브로 바꿀 때 다시 불러오지 않는다");
  assert.equal(player.seeks.at(-1), 600, "라이브로 바꾸면 현재 방송으로 이동한다");
  const seekCommands = sent.filter((m) => m.op === "seek").length;
  player.time = 550; clock += 5000; tick();
  assert.equal(sent.filter((m) => m.op === "seek").length, seekCommands, "라이브의 개인 재생바는 공유 시간을 바꾸지 않는다");
  element("startrackChangeMode").click();
  assert.deepEqual(sent.at(-1), { t: "startrack", op: "mode", videoId: "M7lc1UVf-VE", mode: "video" });
  const playsBeforeEnd = player.plays;
  player.emit(0); clock += 5000; tick();
  assert.equal(sent.at(-1)?.op, "ended", "방송이 끝나면 공유 재생도 멈춘다");
  assert.equal(player.plays, playsBeforeEnd, "끝난 방송을 반복해서 다시 시작하지 않는다");

  controller.receive({ state: { videoId: "M7lc1UVf-VE", mode: "video", playing: true, position: 599, revision: 8, by: "크루" } });
  player.emit(1); player.time = 600; player.emit(0);
  const seeksAfterEnd = player.seeks.length, playsAfterEnd = player.plays;
  clock += 5000; tick();
  assert.equal(player.seeks.length, seeksAfterEnd, "끝난 영상을 시간 보정으로 다시 시작하지 않는다");
  assert.equal(player.plays, playsAfterEnd);
  controller.receive({ state: { videoId: "M7lc1UVf-VE", mode: "video", playing: false, ended: true, position: 600, revision: 9, by: "크루" } });
  controller.receive({ state: { videoId: "M7lc1UVf-VE", mode: "video", playing: true, ended: false, position: 0, revision: 10, by: "크루" } });
  assert.equal(player.seeks.at(-1), 0, "다른 사람이 다시 재생하면 처음으로 이동한다");
  assert.equal(player.state, 3);
});
