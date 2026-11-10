// 내 마이크: 말하는 중 표시(독 마이크 버튼 둘레 초록 빛)와 설정창 「음성」 탭(마이크 고르기 · 소리 막대)
// 소리는 지금 보내는 내 마이크 트랙을 그대로 듣는다. 같은 마이크를 또 열면 iOS에서 먼저 연 쪽이 꺼져서,
// 시험용 마이크는 음성에 마이크가 하나도 없을 때(설정창을 연 동안)만 연다
type Options = {
  track: () => MediaStreamTrack | null;   // 음성 연결이 들고 있는 내 마이크(꺼 둔 채 들고 있을 수도 있다)
  live: () => boolean;                    // 마이크를 켜서 보내는 중
  switchDevice: (deviceId: string) => Promise<void>;
};
const KEY = "ww.mic";
const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export function mountMicrophone({ track, live, switchDevice }: Options) {
  const mic = document.getElementById("micToggle")!;
  const menu = document.getElementById("menu")!, panel = menu.querySelector<HTMLElement>('.mview[data-mtab="voice"]')!;
  const select = document.getElementById("micSelect") as HTMLSelectElement, meter = document.getElementById("micMeter")!;
  const note = document.getElementById("micNote")!, permit = document.getElementById("micPermit") as HTMLButtonElement;
  const devices = navigator.mediaDevices;
  let ctx: AudioContext | null = null, source: MediaStreamAudioSourceNode | null = null, analyser: AnalyserNode | null = null, heard: MediaStreamTrack | null = null;
  let test: MediaStream | null = null, opening = false, failed = false, open = false;
  let frame = 0, level = 0, loudAt = -1e9, shownMic = -1, shownMeter = -1, talking = false;
  const buf = new Float32Array(1024);

  const saved = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
  const save = (id: string) => { try { localStorage.setItem(KEY, id); } catch { } };

  // 소리 듣기: 듣는 트랙이 바뀌면(마이크를 바꾸면 새 트랙이 온다) 다시 잇는다
  function listen(t: MediaStreamTrack | null) {
    if (t === heard) return;
    source?.disconnect(); source = null; analyser = null; heard = t;
    if (!t) return;
    try {
      ctx ||= new AudioContext();
      source = ctx.createMediaStreamSource(new MediaStream([t]));
      analyser = ctx.createAnalyser(); analyser.fftSize = 1024; source.connect(analyser);
    } catch { source = null; analyser = null; }
  }
  function loudness() {
    if (!analyser) return -100;
    if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
    analyser.getFloatTimeDomainData(buf);
    let sum = 0; for (const v of buf) sum += v * v;
    return 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-8);
  }

  function tick() {
    frame = 0;
    const sending = live(), own = track();
    listen(sending ? own : open ? own ?? test?.getAudioTracks()[0] ?? null : null);
    const db = loudness(), now = performance.now();
    const target = Math.min(1, Math.max(0, (db + 58) / 40));   // -58dB(조용) ~ -18dB(크게)
    level = target > level ? level + (target - level) * .6 : level * .86;   // 빨리 오르고 천천히 가라앉는다
    if (db > -46) loudAt = now;
    const talk = sending && now - loudAt < 280;   // 말 사이 짧은 숨은 이어서 본다
    if (talk !== talking) { talking = talk; mic.classList.toggle("talking", talk); }
    const lv = Math.round(level * 50) / 50;
    if (sending && lv !== shownMic) { shownMic = lv; mic.style.setProperty("--lv", String(lv)); }
    if (open && lv !== shownMeter) { shownMeter = lv; meter.style.setProperty("--lv", String(lv)); }
    if (sending || open) frame = requestAnimationFrame(tick);
    else rest();
  }
  function rest() {
    listen(null); level = 0; talking = false; shownMic = shownMeter = -1;
    mic.classList.remove("talking"); mic.style.removeProperty("--lv"); meter.style.removeProperty("--lv");
  }

  // 설정창 「음성」 탭
  async function openTest() {
    if (test || opening || !devices) return;
    opening = true;
    try {
      const id = saved();
      test = await devices.getUserMedia({ audio: id ? { deviceId: id } : true, video: false });
      failed = false;
      if (!open || track()) closeTest();   // 여는 사이 창을 닫았거나 음성이 마이크를 잡았다
      void refresh();   // 권한을 받았으니 마이크 이름이 보인다
    } catch { failed = true; }
    finally { opening = false; describe(); sync(); }
  }
  function closeTest() { test?.getTracks().forEach((t) => t.stop()); test = null; }
  function describe() {
    note.textContent = !devices ? "이 브라우저에선 마이크를 고를 수 없어요."
      : live() ? "말하면 막대가 움직여요. 아래 마이크 버튼도 초록빛으로 빛나요."
      : track() ? "마이크가 꺼져 있어요. 아래 마이크 버튼을 켜면 말할 때 막대가 움직여요."
      : failed ? "마이크를 쓸 수 없어요. 주소창 옆에서 마이크 권한을 허용해 주세요."
      : "말해 보세요. 막대가 움직이면 잘 들리는 거예요.";
  }
  async function refresh() {
    if (!devices) { select.disabled = true; return; }
    let list: MediaDeviceInfo[] = [];
    try { list = (await devices.enumerateDevices()).filter((d) => d.kind === "audioinput"); } catch { }
    const def = list.find((d) => d.deviceId === "default");   // 크롬은 시스템 기본을 따로 한 줄 준다
    const real = list.filter((d) => d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications");
    select.innerHTML = `<option value="">${def?.label ? esc(`시스템 기본 · ${def.label.replace(/^(Default|기본값)\s*-\s*/, "")}`) : "시스템 기본 마이크"}</option>`
      + real.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `마이크 ${i + 1}`)}</option>`).join("");
    const cur = saved();
    select.value = real.some((d) => d.deviceId === cur) ? cur : "";
    permit.hidden = list.some((d) => d.label) || !failed;
  }
  select.onchange = async () => {
    const id = select.value; save(id);
    if (test) { closeTest(); void openTest(); }
    try { await switchDevice(id); } catch { note.textContent = "그 마이크로 바꾸지 못했어요. 다른 마이크를 골라 주세요."; }
  };
  permit.onclick = () => { failed = false; describe(); void openTest(); };
  devices?.addEventListener?.("devicechange", () => { if (open) void refresh(); });

  // 설정창이 「음성」 탭으로 열려 있는 동안만 막대와 시험용 마이크를 쓴다
  const watch = () => {
    const now = !menu.hidden && !panel.hidden;
    if (now === open) return;
    open = now;
    if (open) { void refresh(); describe(); } else closeTest();
    sync();
  };
  new MutationObserver(watch).observe(menu, { attributes: true, attributeFilter: ["hidden"], subtree: true });

  // 음성 · 마이크 상태가 바뀔 때마다 부른다
  function sync() {
    if (open) {
      if (track()) closeTest(); else if (!test && !failed) void openTest();
      describe();
    }
    if ((live() || open) && !frame) frame = requestAnimationFrame(tick);
  }
  return { device: saved, sync };
}
