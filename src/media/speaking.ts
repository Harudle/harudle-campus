// 근처 크루가 지금 말하는 중인지: 내 브라우저로 받은 목소리 크기를 잰다(서버는 모른다). 화면 공유 소리는 넣지 않는다
// 말 사이 짧은 숨은 이어서 보고, 바뀔 때만 알린다
const LOUD = -50, HOLD = 350;

export function mountSpeaking(changed: (peers: Set<string>) => void) {
  const tracks = new Map<string, { peer: string; source: MediaStreamAudioSourceNode; analyser: AnalyserNode; loudAt: number }>();
  const buf = new Float32Array(512);
  let ctx: AudioContext | null = null, timer: number | undefined, talking = new Set<string>();

  function tick() {
    if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
    const now = performance.now(), next = new Set<string>();
    for (const t of tracks.values()) {
      t.analyser.getFloatTimeDomainData(buf);
      let sum = 0; for (const v of buf) sum += v * v;
      if (20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-8) > LOUD) t.loudAt = now;
      if (now - t.loudAt < HOLD) next.add(t.peer);
    }
    if (next.size !== talking.size || [...next].some((p) => !talking.has(p))) { talking = next; changed(new Set(talking)); }
    if (!tracks.size) { clearInterval(timer); timer = undefined; }
  }

  return {
    add(id: string, peer: string, element: HTMLMediaElement) {
      const track = (element.srcObject as MediaStream | null)?.getAudioTracks()[0];
      if (!track || tracks.has(id)) return;
      try {
        ctx ||= new AudioContext();
        const source = ctx.createMediaStreamSource(new MediaStream([track])), analyser = ctx.createAnalyser();
        analyser.fftSize = 512; source.connect(analyser);   // 재는 것만: 소리는 <audio>가 낸다
        tracks.set(id, { peer, source, analyser, loudAt: -1e9 });
        timer ??= window.setInterval(tick, 100);
      } catch { }
    },
    remove(id: string) {
      const t = tracks.get(id); if (!t) return;
      t.source.disconnect(); tracks.delete(id); tick();
    },
    clear() { for (const id of [...tracks.keys()]) this.remove(id); },
  };
}
