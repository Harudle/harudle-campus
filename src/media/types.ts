export type Position = { f: number; x: number; y: number; rm: string };
export type NearbyPeer = { peer: string; name?: string; presence?: Position };
export type MediaJoin = { provider: string; area: string; canShare: boolean; connection: Record<string, string> };
export type CloudflareRequest = (operation: string, data?: Record<string, unknown>) => Promise<any>;
export type MediaCallbacks = {
  addTrack: (id: string, kind: "audio" | "screen", element: HTMLMediaElement, name: string) => void;
  removeTrack: (id: string) => void;
  screenSharingChanged: (sharing: boolean) => void;
  audioPlaybackChanged: (playing: boolean) => void;
  connectionLost: () => void;
  dailyReady: () => void;
};

// 엔진과 화면은 이 계약만 사용한다. 다른 제공자는 같은 기능을 구현한다.
export interface MediaProvider {
  connect(join: MediaJoin): Promise<void>;
  setAllowedPeers(ids: string[]): void;
  setMicrophone(enabled: boolean): Promise<void>;
  setScreenShare(enabled: boolean): Promise<void>;
  resumeAudio(): Promise<void>;
  disconnect(): Promise<void>;
}
