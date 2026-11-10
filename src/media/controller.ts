import { areaOf, canHear, canShareScreen } from "./policy.mjs";
import { createMediaProvider } from "./provider";
import { releaseMicrophone } from "./livekit";
import type { CloudflareRequest, MediaCallbacks, MediaJoin, MediaProvider, NearbyPeer, Position } from "./types";
import { mountMeetings } from "./meetings";
import { mountMicrophone } from "./microphone";
import { mountSpeaking } from "./speaking";

type Options = { requestJoin: (area: string) => Promise<MediaJoin>; requestRenew: () => Promise<number>; requestCloudflare: CloudflareRequest; requestMeeting: (operation: string, data?: Record<string, unknown>) => Promise<any>; notifyDailyReady?: () => void; notifyLeft?: () => void; acknowledgeSwitch?: (revision: number) => void; meetingChanged?: () => void; voiceChanged?: (state: VoiceState) => void; speakingChanged?: (peers: Set<string>) => void };
// 남들에게 보여 줄 내 음성 상태: 0 음성 연결 안 함 · 1 연결했지만 마이크 꺼짐 · 2 마이크 켜짐
export type VoiceState = 0 | 1 | 2;

export function mountMediaControls({ requestJoin, requestRenew, requestCloudflare, requestMeeting, notifyDailyReady = () => {}, notifyLeft = () => {}, acknowledgeSwitch = () => {}, meetingChanged = () => {}, voiceChanged = () => {}, speakingChanged = () => {} }: Options) {
  const dock = document.getElementById("mediaDock")!;
  const buttons = document.getElementById("mediaBtns")!;
  const voice = document.getElementById("voiceToggle") as HTMLButtonElement;
  const mic = document.getElementById("micToggle") as HTMLButtonElement;
  const screen = document.getElementById("screenToggle") as HTMLButtonElement;
  const resume = document.getElementById("audioResume") as HTMLButtonElement;
  const status = document.getElementById("mediaStatus")!;
  const audio = document.getElementById("mediaAudio")!;
  const screens = document.getElementById("sharedScreens")!;
  const screenList = document.getElementById("sharedScreenList")!;
  const collapse = document.getElementById("screensCollapse") as HTMLButtonElement;
  const elements = new Map<string, HTMLElement>();
  let position: Position | null = null, peers: NearbyPeer[] = [];
  let provider: MediaProvider | null = null, providerArea = "";
  let wanted = false, connected = false, connecting = false, network = false;
  let microphone = false, sharing = false, audioBlocked = false, actionBusy = false;
  let reconciling = false, queued = false, message = "";
  let leaseTimer: number | undefined, renewLease = false, pendingSwitch: number | null = null;
  let cleanupUnconfirmed = false, voiceState: VoiceState = 0;
  // 캠퍼스 서버와 잠깐 끊겨도(배포로 워커가 바뀔 때 등) 음성은 바로 끊지 않는다. 이만큼 안에 다시 붙으면 음성·마이크를 그대로 이어 간다
  const OFFLINE_GRACE_MS = 20000;
  let offlineTimer: number | undefined;
  // 말하는 중 표시 · 설정창 마이크 고르기
  const micUi = mountMicrophone({
    track: () => provider?.microphoneTrack() ?? null,
    live: () => !!provider && connected && microphone,
    switchDevice: async (id) => { if (provider) await provider.setMicrophoneDevice(id); },
  });
  const meetings = mountMeetings(requestMeeting, async () => {
    if (connecting || actionBusy) throw new Error("meeting_busy");
    wanted = false; microphone = false; sharing = false;
    if (provider && !(await closeProvider())) throw new Error("meeting_busy");
    render();
  }, () => { render(); meetingChanged(); });

  function allowedPeers() {
    if (!position) return [];
    return peers.filter((p) => p.presence && canHear(position, p.presence)).map((p) => p.peer);
  }
  const speaking = mountSpeaking((peers) => speakingChanged(peers));   // 근처 크루 중 지금 말하는 크루
  function clearTracks() {
    speaking.clear();
    for (const element of elements.values()) element.remove();
    elements.clear(); screens.hidden = true;
  }
  // 독 버튼: 아이콘은 그대로 두고 아래 글자(<b>)와 풍선 도움말만 바꾼다. 마이크 · 화면 공유는 늘 보이고, 못 쓸 때는 흐리게
  const label = (button: HTMLButtonElement, text: string, tip = text) => { button.querySelector("b")!.textContent = text; button.title = tip; button.setAttribute("aria-label", tip); };
  function render() {
    const scope = meetings.isRequired() ? "같은 회의에 들어온 크루와 대화해요" : position?.rm ? "같은 방에 있는 크루와 대화해요" : "같은 층에서 가까운 크루와 대화해요";
    label(voice, wanted ? "음성 끊기" : "음성 연결", wanted ? `음성 끊기 · ${scope}` : "음성을 연결하면 가까운 크루의 목소리가 들려요");
    voice.setAttribute("aria-pressed", String(wanted));
    voice.disabled = meetings.isRequired() && !meetings.isSelected();
    mic.disabled = !wanted || !connected || connecting || actionBusy;
    label(mic, "마이크", !wanted ? "음성을 연결하면 마이크를 켤 수 있어요" : microphone ? "마이크 끄기" : "마이크 켜기");
    mic.setAttribute("aria-pressed", String(microphone));
    mic.classList.toggle("muted", wanted && !microphone);
    const nextVoice: VoiceState = !wanted || !connected ? 0 : microphone ? 2 : 1;
    if (nextVoice !== voiceState) { voiceState = nextVoice; voiceChanged(voiceState); }
    const shareHere = !!position && canShareScreen(position);
    screen.disabled = !wanted || !shareHere || !connected || connecting || actionBusy;
    label(screen, sharing ? "공유 중지" : "화면 공유", !shareHere ? "회의실에서 음성을 연결하면 화면을 공유할 수 있어요" : !wanted ? "음성을 연결하면 화면을 공유할 수 있어요" : sharing ? "공유 중지" : "화면 공유");
    screen.setAttribute("aria-pressed", String(sharing));
    resume.hidden = !wanted || !audioBlocked;
    // 상태 글은 알려야 할 때(오류 · 연결 중 · 회의 선택)만 띄운다. 평소 안내는 음성 버튼 풍선 도움말로
    const notice = message || (meetings.isRequired() && !meetings.isSelected() ? "회의를 만들거나 선택한 뒤 음성을 연결해 주세요." : connecting ? "음성을 연결하고 있어요." : wanted && !network ? "캠퍼스에 다시 연결하고 있어요." : "");
    status.textContent = notice; status.hidden = !notice;
    micUi.sync();
  }

  function callbacksFor(candidate: () => MediaProvider | null): MediaCallbacks {
    const current = () => provider !== null && provider === candidate();
    return {
      addTrack(id, kind, element, name, speaker) {
        if (!current()) { element.remove(); return; }
        if (kind === "audio") { audio.append(element); elements.set(id, element); if (speaker) speaking.add(id, speaker, element); return; }
        const figure = document.createElement("figure"); figure.className = "sharedScreen";
        const caption = document.createElement("figcaption"); caption.textContent = name === "내 화면" ? name : `${name}의 화면`;
        figure.append(element, caption); screenList.append(figure); elements.set(id, figure); screens.hidden = false;
      },
      removeTrack(id) {
        speaking.remove(id);
        const element = elements.get(id);
        if (element) { element.remove(); elements.delete(id); }
        screens.hidden = !screenList.querySelector(".sharedScreen");
      },
      screenSharingChanged(value) { if (current()) { sharing = value; render(); } },
      audioPlaybackChanged(playing) { if (current()) { audioBlocked = !playing; render(); } },
      dailyReady() { if (current()) notifyDailyReady(); },
      connectionLost() {
        if (!current()) return;
        // 캠퍼스 서버가 바뀌는 중(배포)이면 서버가 음성 방을 정리하며 내보낸다: 끊긴 방만 닫고, 다시 붙으면 음성·마이크 그대로 다시 들어간다
        if (!network && wanted) { renewLease = true; queue(); return; }
        wanted = false; microphone = false; sharing = false;
        message = "음성 연결이 끊겼어요. 다시 연결해 주세요.";
        queue();
      },
    };
  }

  // keepMicrophone: 곧 다시 들어갈 거라 마이크는 열어 둔다. 아니면 들고 있던 마이크까지 끈다
  async function closeProvider(keepMicrophone = false) {
    const old = provider;
    if (!keepMicrophone) releaseMicrophone();
    if (leaseTimer !== undefined) { clearTimeout(leaseTimer); leaseTimer = undefined; }
    provider = null; providerArea = ""; connected = false; sharing = false; audioBlocked = false;
    clearTracks();
    if (old) {
      try { await old.disconnect(keepMicrophone); notifyLeft(); }
      catch { cleanupUnconfirmed = true; }
    }
    return !cleanupUnconfirmed;
  }

  function queue() {
    queued = true;
    if (!reconciling) void reconcile();
  }

  function scheduleLease(expiresAt: number, current: MediaProvider, renewable: boolean) {
    const renewIn = expiresAt * 1000 - Date.now() - 5000;
    if (!Number.isFinite(renewIn) || renewIn < 1000) throw new Error("lease_expired");
    leaseTimer = window.setTimeout(() => {
      if (provider !== current || !wanted || !network) return;
      if (!renewable) { renewLease = true; queue(); return; }
      void requestRenew().then((next) => {
        if (provider === current && wanted && network) scheduleLease(next, current, true);
      }).catch((error) => {
        if (provider !== current || pendingSwitch !== null || !wanted) return;
        wanted = false; microphone = false; sharing = false;
        message = error?.message === "media_unavailable" ? "지금은 음성과 회의를 사용할 수 없어요. 잠시 후 다시 시도해 주세요." : "음성 연결을 유지하지 못했어요. 다시 연결해 주세요.";
        queue(); render();
      });
    }, renewIn);
  }

  async function reconcile() {
    reconciling = true;
    while (queued) {
      queued = false;
      if (!network && wanted && provider && connected && !renewLease) { render(); continue; }   // 캠퍼스 서버만 끊긴 동안은 지금 음성을 그대로 둔다(다시 붙으면 새로 들어간다)
      if (!wanted || !network || !position || (meetings.isRequired() && !meetings.isSelected())) {
        const rejoin = wanted && !network;   // 캠퍼스 서버가 바뀌는 중: 다시 붙으면 들어간다
        if (provider) await closeProvider(rejoin); else if (!rejoin) releaseMicrophone();
        if (pendingSwitch !== null && !cleanupUnconfirmed) { acknowledgeSwitch(pendingSwitch); pendingSwitch = null; }
        connecting = false; render();
        continue;
      }
      if (cleanupUnconfirmed) {
        wanted = false; microphone = false;
        message = "이전 음성 연결을 정리했는지 확인하지 못했어요.";
        render(); continue;
      }
      const area = areaOf(position);
      if (provider && connected && providerArea === area && !renewLease) {
        provider.setAllowedPeers(allowedPeers()); render(); continue;
      }
      const interruptedShare = renewLease && sharing;
      if (provider && !(await closeProvider(true))) {
        wanted = false; microphone = false;
        message = "이전 음성 연결을 정리했는지 확인하지 못했어요.";
        render(); continue;
      }
      if (pendingSwitch !== null) { acknowledgeSwitch(pendingSwitch); pendingSwitch = null; }
      renewLease = false;
      connecting = true; message = ""; render();
      let candidate: MediaProvider | null = null;
      try {
        const join = await requestJoin(area);
        if (!wanted || !network || !position || areaOf(position) !== area || join.area !== area) { notifyLeft(); queued = true; continue; }
        candidate = await createMediaProvider(join.provider, callbacksFor(() => candidate), requestCloudflare);
        if (join.provider !== "livekit") releaseMicrophone();   // 들고 있던 마이크는 LiveKit만 다시 쓴다
        if (!wanted || !network || !position || areaOf(position) !== area) { notifyLeft(); queued = true; continue; }
        provider = candidate; providerArea = area;
        await candidate.setMicrophoneDevice(micUi.device()).catch(() => {});   // 설정창에서 고른 마이크
        candidate.setAllowedPeers(allowedPeers());
        await candidate.connect(join);
        if (!wanted || !network || !position || areaOf(position) !== area) { await closeProvider(wanted); queued = true; continue; }
        connected = true;
        candidate.setAllowedPeers(allowedPeers());
        let micFailed = false;
        if (microphone) await candidate.setMicrophone(true).catch(() => { microphone = false; micFailed = true; });   // 마이크 권한이 없어도 듣기는 이어간다
        const expiresAt = Number(join.connection.expiresAt || 0);
        if (expiresAt) scheduleLease(expiresAt, candidate, join.provider === "livekit" && join.connection.renewable === "1");
        message = interruptedShare ? "음성을 다시 연결했어요. 화면 공유를 다시 시작해 주세요." : micFailed ? "마이크를 켜지 못했어요. 브라우저의 마이크 권한을 확인해 주세요. 듣기는 연결됐어요." : "";
      } catch (error: any) {
        if (provider === candidate) await closeProvider();
        if (!wanted) { /* 사용자가 연결을 닫았다. */ }
        else if (!network || (position && areaOf(position) !== area)) queued = true;
        else {
          wanted = false; microphone = false;
          message = error?.message === "not_configured" ? "음성 기능을 아직 설정하지 않았어요." : error?.message === "meeting_required" ? "회의를 다시 선택해 주세요." : error?.message === "room_full" ? "음성 공간에 사람이 가득 찼어요. 잠시 후 다시 시도해 주세요." : error?.message === "rate_limited" ? "연결 요청이 많아요. 잠시 후 다시 시도해 주세요." : error?.message === "cloudflare_cleanup_required" ? "이전 음성 연결을 확인하고 있어요. 잠시 후 다시 시도해 주세요." : error?.message === "media_unavailable" ? "지금은 음성과 회의를 사용할 수 없어요. 잠시 후 다시 시도해 주세요." : "음성 연결에 실패했어요. 잠시 후 다시 시도해 주세요.";
        }
      } finally {
        connecting = false; render();
      }
    }
    reconciling = false;
  }

  // 음성 연결을 누르면 마이크도 켠 채로 시작한다(끄려면 마이크 버튼)
  voice.onclick = () => {
    wanted = !wanted; message = "";
    if (wanted) microphone = true;
    else { microphone = false; sharing = false; provider?.setAllowedPeers([]); }
    queue(); render();
  };
  mic.onclick = async () => {
    if (!provider || !connected || actionBusy) return;
    actionBusy = true; message = ""; render();
    try { await provider.setMicrophone(!microphone); microphone = !microphone; }
    catch { message = "마이크를 켜지 못했어요. 브라우저의 마이크 권한을 확인해 주세요."; }
    finally { actionBusy = false; render(); }
  };
  screen.onclick = async () => {
    if (!provider || !connected || !position || !canShareScreen(position) || actionBusy) return;
    actionBusy = true; message = ""; render();
    try { await provider.setScreenShare(!sharing); }
    catch { message = "화면 공유를 시작하지 못했어요. 브라우저에서 공유할 화면을 선택해 주세요."; }
    finally { actionBusy = false; render(); }
  };
  resume.onclick = async () => {
    if (!provider) return;
    try { await provider.resumeAudio(); audioBlocked = false; } catch { message = "소리를 재생하지 못했어요. 다시 눌러 주세요."; }
    render();
  };
  collapse.onclick = () => {
    screenList.hidden = !screenList.hidden;
    collapse.setAttribute("aria-expanded", String(!screenList.hidden));
    collapse.textContent = screenList.hidden ? "펼치기" : "접기";
  };

  return {
    meetingScope() { const id = meetings.selectedId(); return id ? `meeting:${id}` : null; },
    meetingRequired() { return meetings.isRequired(); },
    switchProvider(revision: number) {
      if (!Number.isSafeInteger(revision)) return;
      pendingSwitch = revision; renewLease = true; queue();
    },
    setAvailable(available: boolean) { dock.hidden = !available; buttons.hidden = !available; if (!available) { wanted = false; queue(); } },
    setMeetingEnabled(enabled: boolean) { meetings.setEnabled(enabled); },
    setNetwork(online: boolean) {
      const was = network; network = online; meetings.setNetwork(online);
      if (!online) {
        if (offlineTimer === undefined) offlineTimer = window.setTimeout(() => {   // 오래 못 붙으면 그때 음성을 끊는다
          offlineTimer = undefined; if (network) return;
          provider?.setAllowedPeers([]); wanted = false; microphone = false; message = ""; queue();
        }, OFFLINE_GRACE_MS);
      } else {
        if (offlineTimer !== undefined) { clearTimeout(offlineTimer); offlineTimer = undefined; }
        // 다시 붙으면 서버가 새 크루 ID를 주므로, 듣던 음성은 새 ID로 다시 들어간다(음성·마이크 상태는 그대로)
        if (!was && wanted && provider) renewLease = true;
        // 회의 선택은 서버가 바뀌면 사라진다(비공개 회의는 비밀번호도 다시 받아야 한다): 회의실에서는 다시 고르게 한다
        if (!was && wanted && meetings.isRequired()) { wanted = false; microphone = false; message = "캠퍼스에 다시 연결됐어요. 회의를 다시 선택해 주세요."; }
      }
      queue();
    },
    updateWorld(nextPosition: Position, nextPeers: NearbyPeer[]) {
      const before = position && areaOf(position);
      position = nextPosition; peers = nextPeers;
      meetings.setArea(canShareScreen(position) ? areaOf(position) : "");
      if (before !== areaOf(position) && meetings.isRequired() && !meetings.isSelected()) { wanted = false; microphone = false; message = ""; }
      if (provider && before !== areaOf(position)) provider.setAllowedPeers([]);
      else provider?.setAllowedPeers(allowedPeers());
      if (before !== areaOf(position) && (wanted || provider)) queue();
      render();
    },
  };
}
