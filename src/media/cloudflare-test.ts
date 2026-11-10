import type { CloudflareRequest, MediaCallbacks, MediaJoin, MediaProvider } from "./types";

type Kind = "audio" | "screen" | "screenAudio";
type Publication = { id: string; pc: RTCPeerConnection; track: MediaStreamTrack };
type Subscription = { id: string; pc: RTCPeerConnection; peer: string; element?: HTMLMediaElement };
type AvailableTrack = { track: string; peer: string; kind: Kind; name: string };

// SFU 연결 구현이다. 전송량 제한은 일반 브라우저에 적용하며 청구 상한은 아니다.
export class CloudflareTestMediaProvider implements MediaProvider {
  private active = false;
  private allowed = new Set<string>();
  private allowedKey = "";
  private published = new Map<Kind, Publication>();
  private received = new Map<string, Subscription>();
  private timer?: number;
  private syncing = false;
  private queued = false;
  private localScreen?: HTMLVideoElement;
  private micDevice = "";

  constructor(private callbacks: MediaCallbacks, private request: CloudflareRequest) {}

  async connect(_join: MediaJoin) {
    this.active = true;
    this.timer = window.setInterval(() => this.queueSync(), 1500);
    this.queueSync();
  }
  setAllowedPeers(ids: string[]) {
    const next = [...new Set(ids)].sort(), key = next.join("\n");
    if (key === this.allowedKey) return;
    this.allowedKey = key; this.allowed = new Set(next); if (this.active) this.queueSync();
  }

  private queueSync() {
    this.queued = true;
    if (!this.syncing) void this.sync();
  }
  private async sync() {
    this.syncing = true;
    try {
      while (this.active && this.queued) {
        this.queued = false;
        const list: AvailableTrack[] = await this.request("list");
        if (!this.active) break;
        const wanted = new Map(list.filter((item) => this.allowed.has(item.peer)).map((item) => [item.track, item]));
        for (const [key, sub] of this.received) if (!wanted.has(key)) await this.closeSubscription(key, sub);
        for (const [key, item] of wanted) if (this.active && !this.received.has(key) && this.allowed.has(item.peer)) await this.subscribe(item);
      }
    } catch {
      if (this.active) this.callbacks.connectionLost();
    } finally { this.syncing = false; }
  }

  private async subscribe(item: AvailableTrack) {
    const pc = peerConnection();
    let id = "";
    try {
      const result = await this.request("subscribe", { track: item.track });
      id = result.id;
      if (!this.active || !this.allowed.has(item.peer)) { await this.request("close", { id }); pc.close(); return; }
      const sub: Subscription = { id, pc, peer: item.peer };
      this.received.set(item.track, sub);
      pc.ontrack = (event) => {
        if (!this.active || !this.allowed.has(item.peer) || this.received.get(item.track) !== sub) return;
        const kind = item.kind === "screen" ? "screen" : "audio";
        const element = document.createElement(kind === "screen" ? "video" : "audio");
        element.autoplay = true;
        if (element instanceof HTMLVideoElement) element.playsInline = true;
        element.srcObject = new MediaStream([event.track]);
        sub.element = element;
        this.callbacks.addTrack(item.track, kind, element, item.name, item.kind === "audio" ? item.peer : undefined);
        void element.play().catch(() => { if (kind === "audio") this.callbacks.audioPlaybackChanged(false); });
      };
      pc.onconnectionstatechange = () => { if (this.active && pc.connectionState === "failed") this.callbacks.connectionLost(); };
      await pc.setRemoteDescription(result.description);
      await pc.setLocalDescription(await pc.createAnswer());
      await gather(pc);
      if (!this.active || !this.allowed.has(item.peer)) { await this.closeSubscription(item.track, sub); return; }
      await this.request("answer", { id, description: description(pc) });
    } catch (error) {
      pc.close(); this.received.delete(item.track);
      if (id) await this.request("close", { id }).catch(() => {});
      throw error;
    }
  }
  private async closeSubscription(key: string, sub: Subscription) {
    this.received.delete(key); sub.pc.close();
    if (sub.element) { this.callbacks.removeTrack(key); sub.element.remove(); }
    await this.request("close", { id: sub.id });
  }

  private async publish(kind: Kind, track: MediaStreamTrack) {
    if (!this.active || this.published.has(kind)) throw new Error("not_connected");
    const pc = peerConnection();
    let id = "";
    try {
      const transceiver = pc.addTransceiver(track, { direction: "sendonly", sendEncodings: [{ maxBitrate: kind === "screen" ? 3000000 : 128000 }] });
      await pc.setLocalDescription(await pc.createOffer());
      await gather(pc);
      if (!transceiver.mid) throw new Error("media_unavailable");
      const result = await this.request("publish", { kind, mid: transceiver.mid, description: description(pc) });
      id = result.id;
      if (!this.active) { await this.request("close", { id }); throw new Error("not_connected"); }
      await pc.setRemoteDescription(result.description);
      // 수신자가 연결되기 전에 SFU의 송신 연결부터 완료한다.
      await waitConnected(pc);
      await waitSending(pc, kind === "screen" ? "video" : "audio");
      if (!this.active) { await this.request("close", { id }); throw new Error("not_connected"); }
      await this.request("publish-ready", { id });
      this.published.set(kind, { id, pc, track });
      pc.onconnectionstatechange = () => { if (this.active && pc.connectionState === "failed") this.callbacks.connectionLost(); };
    } catch (error) {
      pc.close(); track.stop();
      if (id) await this.request("close", { id }).catch(() => {});
      throw error;
    }
  }
  private async closePublication(kind: Kind) {
    const publication = this.published.get(kind);
    if (!publication) return;
    this.published.delete(kind); publication.track.stop(); publication.pc.close();
    await this.request("close", { id: publication.id });
  }
  async setMicrophone(enabled: boolean) {
    if (!enabled) { await this.closePublication("audio"); return; }
    const track = await this.captureMicrophone();
    await this.publish("audio", track);
  }
  private async captureMicrophone() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: this.micDevice ? { deviceId: this.micDevice } : true, video: false });
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error("microphone_unavailable");
    return track;
  }
  async setMicrophoneDevice(deviceId: string) {
    this.micDevice = deviceId;
    const publication = this.published.get("audio");
    if (!publication) return;
    // 보내는 연결은 그대로 두고 소리만 새 마이크로 바꿔 끼운다
    const track = await this.captureMicrophone();
    const sender = publication.pc.getSenders().find((s) => s.track?.kind === "audio");
    if (!sender) { track.stop(); throw new Error("microphone_unavailable"); }
    await sender.replaceTrack(track);
    publication.track.stop(); publication.track = track;
  }
  microphoneTrack() { return this.published.get("audio")?.track ?? null; }
  async setScreenShare(enabled: boolean) {
    if (!enabled) {
      const results = await Promise.allSettled([this.closePublication("screen"), this.closePublication("screenAudio")]);
      if (this.localScreen) { this.callbacks.removeTrack("local:screen"); this.localScreen.remove(); this.localScreen = undefined; }
      this.callbacks.screenSharingChanged(false);
      if (results.some((r) => r.status === "rejected")) throw new Error("cleanup_failed");
      return;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const video = stream.getVideoTracks()[0], audio = stream.getAudioTracks()[0];
    if (!video) { stream.getTracks().forEach((t) => t.stop()); throw new Error("screen_share_unavailable"); }
    try {
      await this.publish("screen", video);
      if (audio) await this.publish("screenAudio", audio);
      const element = document.createElement("video"); element.autoplay = true; element.muted = true; element.playsInline = true;
      element.srcObject = new MediaStream([video]); this.localScreen = element;
      this.callbacks.addTrack("local:screen", "screen", element, "내 화면");
      this.callbacks.screenSharingChanged(true);
      video.onended = () => { void this.setScreenShare(false).catch(() => this.callbacks.connectionLost()); };
    } catch (error) { stream.getTracks().forEach((t) => t.stop()); await this.setScreenShare(false).catch(() => {}); throw error; }
  }
  async resumeAudio() {
    await Promise.all([...this.received.values()].filter((s) => s.element instanceof HTMLAudioElement).map((s) => s.element!.play()));
    this.callbacks.audioPlaybackChanged(true);
  }
  async disconnect() {
    this.active = false; if (this.timer !== undefined) clearInterval(this.timer);
    for (const [key, sub] of this.received) { sub.pc.close(); if (sub.element) { this.callbacks.removeTrack(key); sub.element.remove(); } }
    this.received.clear();
    for (const item of this.published.values()) { item.track.stop(); item.pc.close(); }
    this.published.clear();
    if (this.localScreen) { this.callbacks.removeTrack("local:screen"); this.localScreen.remove(); this.localScreen = undefined; }
    this.callbacks.screenSharingChanged(false);
    await this.request("leave");
  }
}

function peerConnection() { return new RTCPeerConnection({ bundlePolicy: "max-bundle", iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] }); }
function description(pc: RTCPeerConnection) {
  const value = pc.localDescription;
  if (!value?.sdp) throw new Error("media_unavailable");
  return { type: value.type, sdp: value.sdp };
}
async function gather(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); pc.removeEventListener("icegatheringstatechange", changed); resolve(); };
    const changed = () => { if (pc.iceGatheringState === "complete") done(); };
    const timer = window.setTimeout(done, 5000);
    pc.addEventListener("icegatheringstatechange", changed);
  });
}
async function waitConnected(pc: RTCPeerConnection) {
  if (pc.connectionState === "connected") return;
  await new Promise<void>((resolve, reject) => {
    const done = (ok: boolean) => { clearTimeout(timer); pc.removeEventListener("connectionstatechange", changed); ok ? resolve() : reject(new Error("media_unavailable")); };
    const changed = () => { if (pc.connectionState === "connected") done(true); else if (["failed", "closed"].includes(pc.connectionState)) done(false); };
    const timer = window.setTimeout(() => done(false), 15000);
    pc.addEventListener("connectionstatechange", changed);
    changed();
  });
}
async function waitSending(pc: RTCPeerConnection, kind: "audio" | "video") {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    if (pc.connectionState !== "connected") throw new Error("media_unavailable");
    const stats = await pc.getStats();
    for (const stat of stats.values()) if (stat.type === "outbound-rtp" && (stat.kind || stat.mediaType) === kind && stat.bytesSent > 0) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
  }
  throw new Error("media_unavailable");
}
