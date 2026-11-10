import Daily, { type DailyCall, type DailyParticipant } from "@daily-co/daily-js";
import type { MediaCallbacks, MediaJoin, MediaProvider } from "./types";

export class DailyMediaProvider implements MediaProvider {
  private call: DailyCall | null = null;
  private allowed = new Set<string>();
  private subscriptions = new Map<string, boolean>();
  private elements = new Map<string, { track: MediaStreamTrack; element: HTMLMediaElement }>();
  private closing = false;
  private receivePermissionKey = "";
  private micDevice = "";

  constructor(private callbacks: MediaCallbacks) {}

  async connect(join: MediaJoin) {
    const call = Daily.createCallObject({
      subscribeToTracksAutomatically: false, startVideoOff: true, startAudioOff: true, videoSource: false,
      dailyConfig: { alwaysIncludeMicInPermissionPrompt: false, alwaysIncludeCamInPermissionPrompt: false },
    });
    this.call = call;
    const update = () => this.update();
    call.on("participant-joined", update).on("participant-updated", (event) => {
      if (event?.participant?.local) {
        const key = JSON.stringify(event.participant.permissions?.canReceive || null);
        if (key !== this.receivePermissionKey) { this.receivePermissionKey = key; this.subscriptions.clear(); }
      }
      this.update();
    }).on("participant-left", update);
    call.on("track-started", update).on("track-stopped", update);
    call.on("local-screen-share-started", () => { this.callbacks.screenSharingChanged(true); this.update(); });
    call.on("local-screen-share-stopped", () => { this.callbacks.screenSharingChanged(false); this.update(); });
    call.on("left-meeting", () => { if (!this.closing) this.callbacks.connectionLost(); });
    await call.join({ url: join.connection.url, token: join.connection.token, startVideoOff: true, startAudioOff: true });
    this.callbacks.dailyReady();
    this.update();
  }

  setAllowedPeers(ids: string[]) { this.allowed = new Set(ids); this.update(); }

  private update() {
    const call = this.call;
    if (!call || call.isDestroyed()) return;
    const participants = Object.values(call.participants());
    const current = new Set<string>();
    const keep = (id: string, kind: "audio" | "screen", track: MediaStreamTrack | undefined, name: string, muted = false, speaker?: string) => {
      if (!track || track.readyState !== "live") return;
      current.add(id);
      const existing = this.elements.get(id);
      if (existing?.track === track) return;
      if (existing) { this.callbacks.removeTrack(id); existing.element.remove(); }
      const element = document.createElement(kind === "audio" ? "audio" : "video");
      element.autoplay = true; element.muted = muted;
      if (element instanceof HTMLVideoElement) element.playsInline = true;
      element.srcObject = new MediaStream([track]);
      this.elements.set(id, { track, element });
      this.callbacks.addTrack(id, kind, element, name, speaker);
      void element.play().catch(() => { if (kind === "audio") this.callbacks.audioPlaybackChanged(false); });
    };
    for (const p of participants) {
      if (p.local) {
        keep(`local:${p.session_id}:screen`, "screen", p.tracks.screenVideo.track, "내 화면", true);
        continue;
      }
      const allowed = this.allowed.has(p.user_id);
      if (this.subscriptions.get(p.session_id) !== allowed) {
        this.subscriptions.set(p.session_id, allowed);
        call.updateParticipant(p.session_id, { setSubscribedTracks: { audio: allowed, video: false, screenVideo: allowed, screenAudio: allowed } });
      }
      if (!allowed) continue;
      keep(`${p.session_id}:audio`, "audio", p.tracks.audio.track, p.user_name || "크루", false, p.user_id);
      keep(`${p.session_id}:screen-audio`, "audio", p.tracks.screenAudio.track, p.user_name || "크루");
      keep(`${p.session_id}:screen`, "screen", p.tracks.screenVideo.track, p.user_name || "크루");
    }
    for (const [id, item] of this.elements) if (!current.has(id)) {
      this.callbacks.removeTrack(id); item.element.remove(); this.elements.delete(id);
    }
    const present = new Set(participants.map((p) => p.session_id));
    for (const id of this.subscriptions.keys()) if (!present.has(id)) this.subscriptions.delete(id);
  }

  async setMicrophone(enabled: boolean) {
    const call = this.call;
    if (!call) throw new Error("not_connected");
    if (!enabled) { call.setLocalAudio(false, { forceDiscardTrack: true }); return; }
    await new Promise<void>((resolve, reject) => {
      let timer: number;
      const finish = (ok: boolean) => { clearTimeout(timer); call.off("participant-updated", check); call.off("camera-error", failed); ok ? resolve() : reject(new Error("microphone_unavailable")); };
      const failed = () => finish(false);
      const check = () => {
        const local: DailyParticipant | undefined = call.participants().local;
        if (local?.tracks.audio.track && ["playable", "sendable"].includes(local.tracks.audio.state)) finish(true);
        else if (local?.tracks.audio.state === "blocked") finish(false);
      };
      timer = window.setTimeout(failed, 60000);
      call.on("participant-updated", check).on("camera-error", failed);
      if (this.micDevice) void call.setInputDevicesAsync({ audioDeviceId: this.micDevice }).catch(() => {});
      call.setLocalAudio(true); check();
    });
  }

  async setMicrophoneDevice(deviceId: string) {
    this.micDevice = deviceId;
    if (this.microphoneTrack()) await this.call!.setInputDevicesAsync({ audioDeviceId: deviceId || "default" });
  }
  microphoneTrack() {
    const call = this.call;
    if (!call || call.isDestroyed()) return null;
    const audio = call.participants().local?.tracks.audio;
    return audio && ["playable", "sendable"].includes(audio.state) ? audio.persistentTrack ?? audio.track ?? null : null;
  }

  async setScreenShare(enabled: boolean) {
    const call = this.call;
    if (!call) throw new Error("not_connected");
    if (!enabled) { call.stopScreenShare(); return; }
    await new Promise<void>((resolve, reject) => {
      let timer: number;
      const finish = (ok: boolean) => { clearTimeout(timer); call.off("local-screen-share-started", started); call.off("local-screen-share-canceled", failed); ok ? resolve() : reject(new Error("screen_share_unavailable")); };
      const started = () => finish(true), failed = () => finish(false);
      timer = window.setTimeout(failed, 60000);
      call.on("local-screen-share-started", started).on("local-screen-share-canceled", failed);
      call.startScreenShare({ displayMediaOptions: { video: true, audio: true } });
    });
  }

  async resumeAudio() {
    await Promise.all([...this.elements.values()].filter((x) => x.element instanceof HTMLAudioElement).map((x) => x.element.play()));
    this.callbacks.audioPlaybackChanged(true);
  }
  async disconnect() {
    const call = this.call;
    this.closing = true; this.call = null;
    for (const [id, item] of this.elements) { this.callbacks.removeTrack(id); item.element.remove(); }
    this.elements.clear(); this.subscriptions.clear();
    if (call) { try { await call.leave(); } finally { await call.destroy(); } }
    this.callbacks.screenSharingChanged(false);
  }
}
