import { Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication } from "livekit-client";
import type { MediaCallbacks, MediaJoin, MediaProvider } from "./types";

// 운영 모드에서는 연결 갱신마다 고유한 미디어 ID를 발급한다.
const campusPeer = (identity: string) => identity.split("__", 1)[0];

export class LiveKitMediaProvider implements MediaProvider {
  private room: Room | null = null;
  private allowed = new Set<string>();
  private allowedKey = "";
  private attached = new Map<string, { track: any; element: HTMLMediaElement }>();
  private closing = false;
  private micDevice = "";

  constructor(private callbacks: MediaCallbacks) {}

  async connect(join: MediaJoin) {
    const room = new Room({ adaptiveStream: true, dynacast: true, publishDefaults: {
      audioPreset: { maxBitrate: 64000 }, screenShareEncoding: { maxBitrate: 3000000, maxFramerate: 15 },
      simulcast: false, backupCodec: false,
    }, ...(this.micDevice && { audioCaptureDefaults: { deviceId: this.micDevice } }) });
    this.room = room;
    room.on(RoomEvent.TrackPublished, () => this.updateSubscriptions());
    room.on(RoomEvent.ParticipantConnected, () => this.updateSubscriptions());
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => this.attachRemote(track, publication, participant));
    room.on(RoomEvent.TrackUnsubscribed, (_track, publication) => this.remove(publication.trackSid));
    room.on(RoomEvent.TrackUnpublished, (publication) => this.remove(publication.trackSid));
    room.on(RoomEvent.LocalTrackPublished, (publication) => {
      if (publication.source !== Track.Source.ScreenShare || !publication.track) return;
      const video = publication.track.attach() as HTMLVideoElement;
      video.muted = true; video.playsInline = true; video.autoplay = true;
      this.attached.set(`local:${publication.trackSid}`, { track: publication.track, element: video });
      this.callbacks.addTrack(`local:${publication.trackSid}`, "screen", video, "내 화면");
      this.callbacks.screenSharingChanged(true);
    });
    room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      if (publication.source === Track.Source.ScreenShare) {
        this.remove(`local:${publication.trackSid}`);
        this.callbacks.screenSharingChanged(false);
      }
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, (playing) => this.callbacks.audioPlaybackChanged(playing));
    room.on(RoomEvent.Disconnected, () => { if (!this.closing) this.callbacks.connectionLost(); });
    await room.connect(join.connection.url, join.connection.token, { autoSubscribe: false });
    // 허용된 크루에게만 내 음성과 화면을 전달한다.
    this.updateSubscriptions();
    try { await room.startAudio(); } catch { this.callbacks.audioPlaybackChanged(false); }
  }

  setAllowedPeers(ids: string[]) {
    const next = [...new Set(ids)].sort();
    const key = next.join("\n");
    if (key === this.allowedKey) return;
    this.allowedKey = key;
    this.allowed = new Set(next);
    this.updateSubscriptions();
  }

  private updateSubscriptions() {
    const room = this.room;
    if (!room || room.state !== "connected") return;
    room.localParticipant.setTrackSubscriptionPermissions(false,
      [...room.remoteParticipants.values()].filter((p) => this.allowed.has(campusPeer(p.identity))).map((p) => ({ participantIdentity: p.identity, allowAll: true })));
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        const relevant = publication.source === Track.Source.Microphone || publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio;
        const wanted = relevant && this.allowed.has(campusPeer(participant.identity));
        if (publication.isDesired !== wanted) publication.setSubscribed(wanted);
      }
    }
  }

  private attachRemote(track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) {
    if (!this.allowed.has(campusPeer(participant.identity))) { publication.setSubscribed(false); return; }
    if (track.kind === Track.Kind.Audio) {
      const audio = track.attach() as HTMLAudioElement;
      audio.autoplay = true;
      this.attached.set(publication.trackSid, { track, element: audio });
      this.callbacks.addTrack(publication.trackSid, "audio", audio, participant.name || "크루", publication.source === Track.Source.Microphone ? campusPeer(participant.identity) : undefined);
    } else if (publication.source === Track.Source.ScreenShare) {
      const video = track.attach() as HTMLVideoElement;
      video.playsInline = true; video.autoplay = true;
      this.attached.set(publication.trackSid, { track, element: video });
      this.callbacks.addTrack(publication.trackSid, "screen", video, participant.name || "크루");
    }
  }

  private remove(id: string) {
    const item = this.attached.get(id);
    if (!item) return;
    item.track.detach(item.element);
    item.element.remove();
    this.attached.delete(id);
    this.callbacks.removeTrack(id);
  }

  async setMicrophone(enabled: boolean) {
    if (!this.room) throw new Error("not_connected");
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
  }
  async setMicrophoneDevice(deviceId: string) {
    this.micDevice = deviceId;
    // 켜져 있는 마이크도 바로 바꾸고, 다음에 켤 때의 기본값도 바꾼다
    if (this.room) await this.room.switchActiveDevice("audioinput", deviceId || "default", !!deviceId);
  }
  microphoneTrack() {
    return this.room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null;
  }
  async setScreenShare(enabled: boolean) {
    if (!this.room) throw new Error("not_connected");
    await this.room.localParticipant.setScreenShareEnabled(enabled, enabled ? { audio: true } : undefined);
  }
  async resumeAudio() { if (this.room) await this.room.startAudio(); }
  async disconnect() {
    const room = this.room;
    this.closing = true;
    this.room = null;
    for (const id of [...this.attached.keys()]) this.remove(id);
    if (room) await room.disconnect(true);
    this.callbacks.screenSharingChanged(false);
  }
}
