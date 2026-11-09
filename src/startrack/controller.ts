import { canControlStartrack, inStartrack, startrackVolume, youtubeVideoId } from "./shared.mjs";
import { screenIntersectsRect } from "./projection.mjs";

type Position = { f: number; x: number; y: number; rm: string };
type State = { videoId: string | null; mode: "video" | "live"; playing: boolean; autoPaused?: boolean; ended?: boolean; position: number; revision: number; by: string; serverTime?: number };
type Send = (message: Record<string, unknown>) => boolean;
type Projection = { matrix: string; width: number; height: number; bounds: { left: number; right: number; top: number; bottom: number }; corners?: { x: number; y: number }[]; visible: number } | null;

let apiPromise: Promise<any> | null = null;
function youtubeApi(): Promise<any> {
  const win = window as any;
  if (win.YT?.Player) return Promise.resolve(win.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = win.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(() => reject(new Error("youtube_timeout")), 15000);
    win.onYouTubeIframeAPIReady = () => { clearTimeout(timer); previous?.(); resolve(win.YT); };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("youtube_unavailable")); };
    document.head.append(script);
  }).catch((error) => { apiPromise = null; throw error; });
  return apiPromise;
}

export function mountStartrack(send: Send, projectScreen: () => Projection) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const dock = $("startrackDock"), panel = $("startrackPanel"), video = $("startrackVideo"), message = $("startrackMessage"), notice = $("startrackNotice"), leave = $("startrackLeave"), resume = $<HTMLButtonElement>("startrackResume");
  const form = $<HTMLFormElement>("startrackForm"), input = $<HTMLInputElement>("startrackUrl");
  const type = $<HTMLSelectElement>("startrackType");
  const seekForm = $<HTMLFormElement>("startrackSeek"), seconds = $<HTMLInputElement>("startrackSeconds");
  const controls = $("startrackControls"), volume = $<HTMLInputElement>("startrackVolume"), output = $("startrackVolumeValue");
  const play = $<HTMLButtonElement>("startrackPlay"), pause = $<HTMLButtonElement>("startrackPause"), clear = $<HTMLButtonElement>("startrackClear"), changeMode = $<HTMLButtonElement>("startrackChangeMode");
  const action = $("act"), actionStyle = { left: action.style.left, top: action.style.top, right: action.style.right, bottom: action.style.bottom, transform: action.style.transform };
  let actionMoved = false;
  let position: Position = { f: 12, x: 0, y: 0, rm: "" };
  let state: State = { videoId: null, mode: "video", playing: false, position: 0, revision: 0, by: "" }, receivedAt = performance.now();
  let network = false, watching = false, settingsOpen = false, dismissed = false, wasEligible = false;
  let player: any = null, playerReady = false, loading = false, generation = 0, loadedId: string | null = null, loadedMode: State["mode"] | null = null;
  let blocked = false, lastAttempt = 0, lastVolume = -1, lastCorrection = 0;
  let serverClockOffset: number | null = null, bestClockRoundTrip = Infinity;
  let projection: Projection = null, internalPause = false, automaticPlay = false, playRequested = false;
  let lastPlaybackSample: { time: number; at: number; playing: boolean } | null = null, ignoreSeekUntil = 0, endedRevision: number | null = null;
  let visibilityNotice = "";
  let pauseTimer = 0, playTimer = 0;

  const currentTime = () => {
    const now = performance.now();
    const elapsed = serverClockOffset !== null && typeof state.serverTime === "number"
      ? (now + serverClockOffset - state.serverTime) / 1000 : (now - receivedAt) / 1000;
    return Math.max(0, state.position + (state.playing ? Math.max(0, elapsed) : 0));
  };
  const canControl = () => canControlStartrack(position) && network;
  const isVideoVisible = () => !video.hidden && !document.hidden && video.style.visibility !== "hidden" && !!projection && projection.visible > 0;
  const canStartAutomatically = () => isVideoVisible() && !!projection && projection.visible > 0.5;
  const status = (text: string, showNotice = false) => { message.textContent = text; notice.textContent = text; notice.hidden = !showNotice; };
  function updateVisibilityNotice() {
    const active = !!state.videoId && state.playing && watching && !document.hidden && network;
    const ready = !!(playerReady && player);
    const playing = ready && [1, 3].includes(player.getPlayerState());
    const needsClick = active && isVideoVisible() && ready && !playing && (blocked || !canStartAutomatically());
    resume.hidden = !needsClick;
    const text = !active ? "" : !isVideoVisible() ? "화면이 보이지 않아 내 영상이 멈췄어요. 화면을 다시 바라봐 주세요." : !ready ? "영상을 불러오고 있어요." : needsClick ? "내 영상 재생을 눌러 주세요." : "";
    if (text && (text !== visibilityNotice || notice.hidden || notice.textContent !== text)) status(text, true);
    else if (!text && visibilityNotice) status(state.playing ? "같은 영상을 재생하고 있어요." : "모두의 영상이 일시정지됐어요.");
    visibilityNotice = text;
  }
  const hasBlockingDialog = () => !!document.querySelector("#menu:not([hidden]),#profile:not([hidden]),#tour:not([hidden]),#guide:not([hidden]),#picker:not([hidden]),#lightbox:not([hidden]),#loginAsk:not([hidden]),#easelEd:not([hidden]),#inv:not([hidden]),#avPanel:not([hidden]),#panel.open");
  const intersects = (a: { left: number; right: number; top: number; bottom: number }, b: { left: number; right: number; top: number; bottom: number }) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  function restoreAction() { if (actionMoved) { Object.assign(action.style, actionStyle); actionMoved = false; } }
  function positionPlayer() {
    if (video.hidden) return;
    projection = projectScreen();
    const screen = projection?.bounds;
    const screenOverlaps = (rect: { left: number; right: number; top: number; bottom: number }) => !!screen && intersects(screen, rect)
      && (!projection?.corners || screenIntersectsRect(projection.corners, rect, innerWidth, innerHeight));
    // Ordinary controls sit below the player instead of stopping it as the camera
    // moves. Panels the user deliberately opens remain in front and pause locally.
    const selectors = ["#side", "#sharedScreens", "#updateChip", ...(settingsOpen ? ["#startrackPanel"] : [])];
    const covered = hasBlockingDialog() || selectors.some((selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return !!rect && rect.width > 0 && rect.height > 0 && screenOverlaps(rect);
    });
    const visible = !!projection && !covered;
    document.body?.classList.toggle("startrack-screen-visible", visible);
    if (projection && visible) {
      video.dataset.presentation = "screen";
      video.style.width = `${projection.width}px`; video.style.height = `${projection.height}px`; video.style.transform = projection.matrix;
      video.style.visibility = "visible";
    } else {
      video.dataset.presentation = "offscreen";
      video.style.visibility = "hidden";
    }
    // Keep settings in the upper left when possible; otherwise move them to
    // free space instead of covering the player or hiding the controls.
    if (visible) {
      const width = dock.offsetWidth, height = dock.offsetHeight;
      const preferred = { left: 12, top: 70, right: 12 + width, bottom: 70 + height };
      if (!screenOverlaps(preferred)) { dock.style.left = ""; dock.style.top = ""; }
      else if (screenOverlaps(dock.getBoundingClientRect())) {
        const occupied = ["#chat", "#dock", "#floorHud", "#sideShow"].flatMap((selector) => {
          const rect = document.querySelector(selector)?.getBoundingClientRect();
          return rect && rect.width > 0 && rect.height > 0 ? [rect] : [];
        });
        const xs = [12, innerWidth - width - 12];
        const ys = [70, 12, (innerHeight - height) / 2, innerHeight - height - 12];
        const spot = ys.flatMap((y) => xs.map((x) => ({ left: x, top: y, right: x + width, bottom: y + height })))
          .find((r) => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !screenOverlaps(r) && !occupied.some((o) => intersects(r, o)));
        if (spot) { dock.style.left = `${spot.left}px`; dock.style.top = `${spot.top}px`; }
      }
    } else { dock.style.left = ""; dock.style.top = ""; }
    if (!visible || action.hidden || action.textContent !== "스타트랙 영상 설정") restoreAction();
    else {
      const rect = action.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && screenOverlaps(rect)) {
        const occupied = ["#chat", "#dock", "#floorHud", "#sideShow", "#startrackDock"].flatMap((selector) => {
          const r = document.querySelector(selector)?.getBoundingClientRect();
          return r && r.width > 0 && r.height > 0 ? [r] : [];
        });
        const x = (innerWidth - rect.width) / 2;
        const ys = [innerHeight - rect.height - 12, innerHeight - rect.height - 90];
        const spot = ys.map((y) => ({ left: x, top: y, right: x + rect.width, bottom: y + rect.height }))
          .find((r) => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !screenOverlaps(r) && !occupied.some((o) => intersects(r, o)));
        if (spot) { action.style.left = `${spot.left}px`; action.style.top = `${spot.top}px`; action.style.right = "auto"; action.style.bottom = "auto"; action.style.transform = "none"; actionMoved = true; }
        else restoreAction();
      }
    }
  }
  function destroyPlayer() {
    generation++; loading = false; playerReady = false; blocked = false; loadedId = null; loadedMode = null; lastVolume = -1;
    internalPause = false; automaticPlay = false; playRequested = false; projection = null;
    lastPlaybackSample = null; ignoreSeekUntil = 0; endedRevision = null;
    clearTimeout(pauseTimer); clearTimeout(playTimer);
    if (player) { try { player.stopVideo(); player.destroy(); } catch { /* already removed */ } }
    player = null;
    document.body?.classList.remove("startrack-screen-visible");
    restoreAction();
    const slot = document.createElement("div"); slot.id = "startrackPlayer"; video.replaceChildren(slot);
  }
  function applyVolume() {
    if (!playerReady || !player) return;
    const level = Math.round(startrackVolume(position) * Number(volume.value) / 100);
    if (level !== lastVolume) { lastVolume = level; player.setVolume(level); }
  }
  function pauseLocally() {
    if (!playerReady || !player || [2, 5, -1].includes(player.getPlayerState())) return;
    internalPause = true;
    clearTimeout(pauseTimer);
    pauseTimer = window.setTimeout(() => { internalPause = false; }, 5000);
    player.pauseVideo();
  }
  function seekLocally(time: number) {
    lastPlaybackSample = null; ignoreSeekUntil = performance.now() + 1600;
    player.seekTo(time, true);
  }
  function observeNativeSeek(stateCode: number, actual: number) {
    const now = performance.now();
    if (state.mode !== "video" || !state.playing || ![1, 3].includes(stateCode) || !Number.isFinite(actual)) { lastPlaybackSample = null; return false; }
    const previous = lastPlaybackSample;
    lastPlaybackSample = { time: actual, at: now, playing: stateCode === 1 };
    if (!previous || now < ignoreSeekUntil || now - previous.at > 3000 || document.activeElement !== player.getIframe()) return false;
    const expected = previous.time + (previous.playing ? Math.max(0, now - previous.at) / 1000 : 0);
    if (Math.abs(actual - expected) < 3 || Math.abs(actual - currentTime()) < 2.5) return false;
    ignoreSeekUntil = now + 3000; lastCorrection = now;
    if (actual > 86400) { status("라이브 방송이라면 영상 설정에서 라이브로 바꿔 주세요.", true); return true; }
    command("seek", { position: Math.max(0, actual) });
    return true;
  }
  function playLocally(userInitiated = false) {
    if (!playerReady || !player || !inStartrack(position) || !isVideoVisible() || (!userInitiated && !canStartAutomatically())) return;
    // A resumed live broadcast should return to the current live edge, when YouTube exposes it.
    if (state.mode === "live") {
      const edge = Number(player.getDuration());
      if (Number.isFinite(edge) && edge > 0) seekLocally(edge);
    } else if (userInitiated) {
      const target = state.ended ? 0 : currentTime(), actual = Number(player.getCurrentTime());
      if (Number.isFinite(actual) && Math.abs(actual - target) > 2.5) seekLocally(target);
      lastCorrection = performance.now();
    }
    automaticPlay = true;
    clearTimeout(playTimer);
    playTimer = window.setTimeout(() => { automaticPlay = false; }, 5000);
    player.playVideo();
  }
  function syncPlayer(force = false) {
    if (!playerReady || !player || !state.videoId) return;
    applyVolume();
    if (!isVideoVisible()) { pauseLocally(); return; }
    const switchingToLive = loadedId === state.videoId && loadedMode !== state.mode && state.mode === "live";
    if (loadedId !== state.videoId) {
      loadedId = state.videoId; loadedMode = state.mode; blocked = false;
      lastPlaybackSample = null; ignoreSeekUntil = performance.now() + 1600;
      if (state.mode === "live") player.cueVideoById(state.videoId);
      else player.cueVideoById(state.videoId, Math.floor(currentTime()));
      lastCorrection = performance.now(); force = true;
    } else loadedMode = state.mode;
    const stateCode = player.getPlayerState();
    if (state.playing && stateCode === 0 && endedRevision === state.revision) return;
    if (switchingToLive && state.playing && stateCode === 1) {
      const edge = Number(player.getDuration());
      if (Number.isFinite(edge) && edge > 0) seekLocally(edge);
    }
    const target = currentTime();
    const actual = Number(player.getCurrentTime());
    if (observeNativeSeek(stateCode, actual)) return;
    const startingFromClick = !state.playing && (stateCode === 1 || stateCode === 3) && (!force || playRequested);
    const mayCorrectTime = canStartAutomatically() || (state.playing && stateCode === 1);
    if (state.mode !== "live" && mayCorrectTime && !startingFromClick && (force || performance.now() - lastCorrection > 3000) && Number.isFinite(actual) && Math.abs(actual - target) > 2.5) {
      if (!state.playing && stateCode !== 2) player.cueVideoById(state.videoId, Math.floor(target));
      else seekLocally(target);
      lastCorrection = performance.now();
    }
    if (state.playing) {
      if (stateCode !== 1 && stateCode !== 3 && !blocked && canStartAutomatically() && (force || performance.now() - lastAttempt > 3000)) {
        lastAttempt = performance.now(); playLocally();
      }
    // A buffering player can be starting from the user's click. Only enforce a
    // received group pause, rather than repeatedly pausing the loading player.
    } else if (force && !playRequested && (stateCode === 1 || stateCode === 3)) pauseLocally();
  }
  async function ensurePlayer() {
    if (player || loading || !state.videoId || video.hidden || document.hidden) return;
    loading = true; const token = ++generation;
    try {
      const YT = await youtubeApi();
      if (token !== generation || video.hidden || document.hidden || !state.videoId) return;
      const id = state.videoId, mode = state.mode;
      player = new YT.Player("startrackPlayer", {
        width: "100%", height: "100%", videoId: id,
        playerVars: { playsinline: 1, rel: 0, origin: location.origin },
        events: {
          onReady(event: any) {
            if (token !== generation) { try { event.target.destroy(); } catch {} return; }
            player = event.target; playerReady = true; loadedId = id; loadedMode = mode;
            status(state.playing ? "같은 영상을 재생하고 있어요. 소리가 안 나면 재생 버튼을 눌러 주세요." : "영상을 준비했어요. 함께 재생을 누르면 시작해요.");
            syncPlayer(true);
            updateVisibilityNotice();
          },
          onStateChange(event: any) {
            if (token !== generation) return;
            if (event.data === 0) {
              const videoId = youtubeVideoId(String(player.getVideoUrl()));
              if (state.playing && videoId === state.videoId) {
                endedRevision = state.revision;
                if (isVideoVisible() && canControl()) {
                  const duration = Number(player.getDuration());
                  command("ended", { videoId, revision: state.revision, position: Number.isFinite(duration) ? duration : 0 });
                }
              }
            } else if (event.data === 1) {
              const wasAutomatic = automaticPlay; automaticPlay = false; clearTimeout(playTimer);
              if (!isVideoVisible()) { pauseLocally(); updateVisibilityNotice(); return; }
              blocked = false; resume.hidden = true; if (state.playing) status("같은 영상을 재생하고 있어요.");
              if (!state.playing && !wasAutomatic && canControl()) { playRequested = true; if (!command("play")) playRequested = false; }
              else if (!state.playing && wasAutomatic && !playRequested) pauseLocally();
            } else if (event.data === 2) {
              const wasInternal = internalPause; internalPause = false; clearTimeout(pauseTimer);
              if (state.playing && !wasInternal && canControl() && isVideoVisible() && document.activeElement === player.getIframe()) command("pause");
              else if (!state.playing) status("모두의 영상이 일시정지됐어요.");
            }
            else if (event.data === 5 && !state.playing) status("영상을 준비했어요. 함께 재생을 누르면 시작해요.");
          },
          onAutoplayBlocked() { if (token !== generation) return; automaticPlay = false; clearTimeout(playTimer); blocked = true; status("자동 재생이 막혔어요. 내 영상 재생을 눌러 주세요.", true); render(); },
          onError() { if (token === generation) status("이 영상을 여기서 재생할 수 없어요. 다른 유튜브 링크를 등록해 주세요.", true); },
        },
      });
    } catch { if (token === generation) status("유튜브를 불러오지 못했어요. 인터넷 연결을 확인하고 영상 창을 다시 열어 주세요.", true); }
    finally { if (token === generation) loading = false; }
  }
  function render() {
    const eligible = inStartrack(position);
    if (!eligible && wasEligible) { dismissed = false; watching = false; settingsOpen = false; }
    if (eligible && !wasEligible && state.videoId && !dismissed) watching = true;
    wasEligible = eligible;
    dock.hidden = !eligible;
    panel.hidden = !eligible || !settingsOpen;
    controls.hidden = !state.videoId;
    seekForm.hidden = state.mode === "live";
    changeMode.textContent = state.mode === "live" ? "현재 영상을 일반 영상으로 보기" : "현재 영상을 라이브로 보기";
    video.hidden = !eligible || !watching || !state.videoId || document.hidden;
    leave.hidden = !state.videoId;
    leave.textContent = watching ? "내 영상 끄기" : "영상 다시 보기";
    const allowed = canControl();
    input.disabled = type.disabled = !allowed;
    (form.querySelector("button") as HTMLButtonElement).disabled = !allowed;
    play.disabled = pause.disabled = clear.disabled = changeMode.disabled = !allowed;
    seconds.disabled = !allowed;
    (seekForm.querySelector("button") as HTMLButtonElement).disabled = !allowed;
    if (video.hidden) {
      if (player || loading) destroyPlayer();
    } else { positionPlayer(); void ensurePlayer(); syncPlayer(); }
    if (!network) status("캠퍼스에 다시 연결하고 있어요.");
    else if (!state.videoId) status(allowed ? "스타트랙에서 유튜브 링크를 등록해 주세요." : "스타트랙 객석에 가면 영상 링크를 등록할 수 있어요.");
    applyVolume();
    updateVisibilityNotice();
  }
  function command(op: string, extra: Record<string, unknown> = {}) {
    if (!canControl()) { status("스타트랙 객석이나 무대에서 조작해 주세요."); return false; }
    if (!send({ t: "startrack", op, ...extra })) { status("캠퍼스 연결을 확인해 주세요."); return false; }
    return true;
  }
  function openSettings() { settingsOpen = true; if (state.videoId && !dismissed) watching = true; render(); if (document.pointerLockElement) document.exitPointerLock(); $("startrackClose").focus({ preventScroll: true }); }
  function closeSettings() { settingsOpen = false; render(); syncPlayer(true); }
  $("startrackOpen").onclick = openSettings;
  $("startrackClose").onclick = closeSettings;
  leave.onclick = () => { watching = !watching; dismissed = !watching; render(); };
  panel.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); closeSettings(); } });
  input.addEventListener("input", () => { type.value = /^https:\/\/(?:www\.|m\.)?youtube\.com\/live\//i.test(input.value.trim()) ? "live" : ""; });
  form.onsubmit = (event) => {
    event.preventDefault();
    const id = youtubeVideoId(input.value);
    if (!id) { status("올바른 유튜브 영상 링크를 넣어 주세요."); return; }
    if (type.value !== "live" && type.value !== "video") { status("일반 영상인지 라이브 방송인지 선택해 주세요."); return; }
    const mode = type.value;
    if (command("set", { value: id, mode })) { input.value = ""; type.value = ""; status(mode === "live" ? "라이브 방송을 등록하고 있어요." : "영상을 등록하고 있어요."); }
  };
  changeMode.onclick = () => { if (state.videoId) command("mode", { videoId: state.videoId, mode: state.mode === "live" ? "video" : "live" }); };
  play.onclick = () => {
    playRequested = true;
    if (!command("play")) { playRequested = false; return; }
    blocked = false; lastAttempt = performance.now();
    playLocally(true);
  };
  pause.onclick = () => { if (command("pause")) { playRequested = false; pauseLocally(); } };
  resume.onclick = () => {
    if (!isVideoVisible()) { status("화면을 바라본 뒤 다시 눌러 주세요.", true); return; }
    blocked = false; resume.hidden = true; lastAttempt = performance.now(); playLocally(true);
  };
  clear.onclick = () => { command("clear"); };
  seekForm.onsubmit = (event) => { event.preventDefault(); if (seconds.reportValidity()) command("seek", { position: Number(seconds.value) }); };
  volume.oninput = () => { output.textContent = `${volume.value}%`; applyVolume(); };
  document.addEventListener("visibilitychange", () => { render(); if (!document.hidden) syncPlayer(true); });
  panel.addEventListener("scroll", () => syncPlayer());
  window.addEventListener("resize", () => { positionPlayer(); syncPlayer(); });
  window.setInterval(() => { syncPlayer(); updateVisibilityNotice(); }, 500);

  return {
    openSettings,
    closeSettings,
    wantsViewing() { return watching && !!state.videoId && inStartrack(position) && !document.hidden; },
    updateWorld(next: Position) { position = next; render(); },
    debug() { return { state: { ...state }, position: { ...position }, watching, settingsOpen, playerReady, volume: playerReady ? player.getVolume() : null, playerState: playerReady ? player.getPlayerState() : null, currentTime: playerReady ? player.getCurrentTime() : null, targetTime: currentTime(), presentation: video.dataset.presentation, videoVisible: isVideoVisible(), canAutoStart: canStartAutomatically(), screenFraction: projection?.visible || 0 }; },
    frame() {
      const shouldHide = !inStartrack(position) || !watching || !state.videoId || document.hidden;
      if (video.hidden !== !!shouldHide) render();
      if (!video.hidden) {
        const wasVisible = isVideoVisible(), couldStart = canStartAutomatically();
        positionPlayer();
        const visible = isVideoVisible(), mayStart = canStartAutomatically();
        const alreadyPlaying = playerReady && player && [1, 3].includes(player.getPlayerState());
        if (wasVisible !== visible || (!couldStart && mayStart && !alreadyPlaying)) syncPlayer(true);
      }
        updateVisibilityNotice();
    },
    setNetwork(up: boolean) { network = up; if (!up) { state = { videoId: null, mode: "video", playing: false, position: 0, revision: 0, by: "" }; serverClockOffset = null; bestClockRoundTrip = Infinity; } render(); },
    syncClock(sentAt: number, serverTime: number) {
      const now = performance.now(), roundTrip = now - sentAt;
      if (!Number.isFinite(sentAt) || !Number.isFinite(serverTime) || roundTrip < 0 || roundTrip > 20000 || roundTrip >= bestClockRoundTrip) return;
      bestClockRoundTrip = roundTrip;
      serverClockOffset = serverTime - (sentAt + now) / 2;
      syncPlayer();
    },
    receive(data: any) {
      if (data.error) {
        playRequested = false;
        const errors = { invalid_youtube_link: "올바른 유튜브 영상 링크를 넣어 주세요.", invalid_mode: "재생 종류를 확인해 주세요.", stale_video: "영상이 바뀌었어요. 현재 영상을 다시 확인해 주세요.", live_seek_unavailable: "라이브 방송은 현재 방송을 함께 봐요.", startrack_area_required: "스타트랙 객석이나 무대에서 조작해 주세요.", rate_limited: "조금 천천히 조작해 주세요.", no_video: "먼저 영상을 등록해 주세요.", invalid_position: "이동할 시간을 확인해 주세요." };
        status(errors[data.error] || "영상 설정을 바꾸지 못했어요."); return;
      }
      if (!data.state || typeof data.state.revision !== "number" || data.state.revision < state.revision) return;
      const oldId = state.videoId;
      const wasPlaying = state.playing;
      if (data.state.revision !== state.revision) { lastPlaybackSample = null; ignoreSeekUntil = performance.now() + 1600; }
      state = { ...data.state, mode: data.state.mode === "live" ? "live" : "video" }; receivedAt = performance.now();
      if (state.playing || (wasPlaying && !state.playing) || oldId !== state.videoId) playRequested = false;
      if (state.videoId && oldId !== state.videoId && inStartrack(position) && !dismissed) watching = true;
      if (state.videoId && oldId === state.videoId && playerReady) status(state.playing ? "같은 영상을 재생하고 있어요." : "모두의 영상이 일시정지됐어요.");
      render(); syncPlayer(true);
    },
  };
}
