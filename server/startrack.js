import { canControlStartrack, youtubeVideoId } from "../src/startrack/shared.mjs";

// Only the current video and its clock are shared. Every viewer loads YouTube separately.
export function createStartrack({ now = Date.now, onChange = () => {}, idleDelayMs = 5000, setTimer = setTimeout, clearTimer = clearTimeout, presenceTtlMs = 45000 } = {}) {
  let state = { videoId: null, mode: "video", playing: false, autoPaused: false, ended: false, position: 0, updatedAt: now(), revision: 0, by: "" };
  const occupants = new Map();
  let idleTimer = null;
  const positionAt = (time) => state.mode === "live" ? 0 : Math.max(0, state.position + (state.playing ? Math.max(0, time - state.updatedAt) / 1000 : 0));
  function snapshot() {
    const time = now();
    return { ...state, position: positionAt(time), serverTime: time };
  }
  function cancelIdle() { if (idleTimer !== null) { clearTimer(idleTimer); idleTimer = null; } }
  function reconcilePresence() {
    if (occupants.size) {
      cancelIdle();
      if (state.videoId && state.autoPaused) {
        state = { ...state, playing: true, autoPaused: false, updatedAt: now(), revision: state.revision + 1 };
        onChange(snapshot());
      }
    } else if (state.playing && idleTimer === null) {
      // A short grace period prevents brief disconnects from pausing everyone.
      idleTimer = setTimer(() => {
        idleTimer = null;
        if (occupants.size || !state.playing) return;
        const time = now();
        state = { ...state, playing: false, autoPaused: true, position: positionAt(time), updatedAt: time, revision: state.revision + 1 };
        onChange(snapshot());
      }, idleDelayMs);
      idleTimer?.unref?.();
    } else if (!state.playing) cancelIdle();
  }
  function setPresent(id, present) {
    if (present) occupants.set(id, now());
    else if (!occupants.delete(id)) return;
    reconcilePresence();
  }
  function expirePresence() {
    const cutoff = now() - presenceTtlMs;
    let changed = false;
    for (const [id, lastSeen] of occupants) if (lastSeen < cutoff) { occupants.delete(id); changed = true; }
    if (changed) reconcilePresence();
  }
  function apply(message, peer) {
    if (!canControlStartrack(peer?.presence)) return { error: "startrack_area_required" };
    const time = now();
    const base = { ...state, position: positionAt(time), updatedAt: time, revision: state.revision + 1, by: String(peer.name || "크루").slice(0, 16) };
    if (message.op === "set") {
      const videoId = youtubeVideoId(message.value);
      if (!videoId) return { error: "invalid_youtube_link" };
      const mode = message.mode ?? "video";
      if (mode !== "video" && mode !== "live") return { error: "invalid_mode" };
      state = { ...base, videoId, mode, playing: !!state.videoId && state.playing, autoPaused: false, ended: false, position: 0 };
    } else if (message.op === "clear") state = { ...base, videoId: null, mode: "video", playing: false, autoPaused: false, ended: false, position: 0 };
    else if (!state.videoId) return { error: "no_video" };
    else if (message.op === "play") state = { ...base, playing: true, autoPaused: false, ended: false, position: state.ended ? 0 : base.position };
    else if (message.op === "pause") state = { ...base, playing: false, autoPaused: false };
    else if (message.op === "mode") {
      if (message.videoId !== state.videoId) return { error: "stale_video" };
      if (message.mode !== "video" && message.mode !== "live") return { error: "invalid_mode" };
      state = { ...base, mode: message.mode, ended: false, position: 0 };
    }
    else if (message.op === "ended") {
      // Ignore a late end event from a previous video or playback revision.
      if (message.videoId !== state.videoId || message.revision !== state.revision || !state.playing) return { state: snapshot() };
      const duration = Number(message.position);
      const position = state.mode === "live" ? 0 : Number.isFinite(duration) && duration >= 0 && duration <= 86400 ? duration : base.position;
      state = { ...base, playing: false, autoPaused: false, ended: true, position };
    }
    else if (message.op === "seek") {
      if (state.mode === "live") return { error: "live_seek_unavailable" };
      if (typeof message.position !== "number" || !Number.isFinite(message.position) || message.position < 0 || message.position > 86400) return { error: "invalid_position" };
      state = { ...base, ended: false, position: message.position };
    } else return { error: "invalid_operation" };
    reconcilePresence();
    return { state: snapshot() };
  }
  return { snapshot, apply, setPresent, expirePresence };
}
