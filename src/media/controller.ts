import { areaOf, canHear, canShareScreen } from "./policy.mjs";
import { createMediaProvider } from "./provider";
import type { CloudflareRequest, MediaCallbacks, MediaJoin, MediaProvider, NearbyPeer, Position } from "./types";
import { mountMeetings } from "./meetings";

type Options = { requestJoin: (area: string) => Promise<MediaJoin>; requestRenew: () => Promise<number>; requestCloudflare: CloudflareRequest; requestMeeting: (operation: string, data?: Record<string, unknown>) => Promise<any>; notifyDailyReady?: () => void; notifyLeft?: () => void; acknowledgeSwitch?: (revision: number) => void; meetingChanged?: () => void };

export function mountMediaControls({ requestJoin, requestRenew, requestCloudflare, requestMeeting, notifyDailyReady = () => {}, notifyLeft = () => {}, acknowledgeSwitch = () => {}, meetingChanged = () => {} }: Options) {
  const dock = document.getElementById("mediaDock")!;
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
  let cleanupUnconfirmed = false;
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
  function clearTracks() {
    for (const element of elements.values()) element.remove();
    elements.clear(); screens.hidden = true;
  }
  function render() {
    voice.textContent = wanted ? "음성 나가기" : "음성 연결";
    voice.setAttribute("aria-pressed", String(wanted));
    voice.disabled = meetings.isRequired() && !meetings.isSelected();
    mic.hidden = !wanted;
    mic.disabled = !connected || connecting || actionBusy;
    mic.textContent = microphone ? "마이크 끄기" : "마이크 켜기";
    mic.setAttribute("aria-pressed", String(microphone));
    screen.hidden = !wanted || !position || !canShareScreen(position);
    screen.disabled = !connected || connecting || actionBusy;
    screen.textContent = sharing ? "공유 중지" : "화면 공유";
    screen.setAttribute("aria-pressed", String(sharing));
    resume.hidden = !wanted || !audioBlocked;
    if (message) status.textContent = message;
    else if (meetings.isRequired() && !meetings.isSelected()) status.textContent = "회의를 만들거나 선택한 뒤 음성을 연결해 주세요.";
    else if (connecting) status.textContent = "음성을 연결하고 있어요.";
    else if (wanted && !network) status.textContent = "캠퍼스에 다시 연결하고 있어요.";
    else if (connected && meetings.isRequired()) status.textContent = "같은 회의에 들어온 크루와 대화해요.";
    else if (connected && position?.rm) status.textContent = "같은 방에 있는 크루와 대화해요.";
    else if (connected) status.textContent = "같은 층에서 가까운 크루와 대화해요.";
    else status.textContent = "음성을 연결하면 가까운 크루의 목소리가 들려요.";
  }

  function callbacksFor(candidate: () => MediaProvider | null): MediaCallbacks {
    const current = () => provider !== null && provider === candidate();
    return {
      addTrack(id, kind, element, name) {
        if (!current()) { element.remove(); return; }
        if (kind === "audio") { audio.append(element); elements.set(id, element); return; }
        const figure = document.createElement("figure"); figure.className = "sharedScreen";
        const caption = document.createElement("figcaption"); caption.textContent = name === "내 화면" ? name : `${name}의 화면`;
        figure.append(element, caption); screenList.append(figure); elements.set(id, figure); screens.hidden = false;
      },
      removeTrack(id) {
        const element = elements.get(id);
        if (element) { element.remove(); elements.delete(id); }
        screens.hidden = !screenList.querySelector(".sharedScreen");
      },
      screenSharingChanged(value) { if (current()) { sharing = value; render(); } },
      audioPlaybackChanged(playing) { if (current()) { audioBlocked = !playing; render(); } },
      dailyReady() { if (current()) notifyDailyReady(); },
      connectionLost() {
        if (!current()) return;
        wanted = false; microphone = false; sharing = false;
        message = "음성 연결이 끊겼어요. 다시 연결해 주세요.";
        queue();
      },
    };
  }

  async function closeProvider() {
    const old = provider;
    if (leaseTimer !== undefined) { clearTimeout(leaseTimer); leaseTimer = undefined; }
    provider = null; providerArea = ""; connected = false; sharing = false; audioBlocked = false;
    clearTracks();
    if (old) {
      try { await old.disconnect(); notifyLeft(); }
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
      if (!wanted || !network || !position || (meetings.isRequired() && !meetings.isSelected())) {
        if (provider) await closeProvider();
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
      if (provider && !(await closeProvider())) {
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
        if (!wanted || !network || !position || areaOf(position) !== area) { notifyLeft(); queued = true; continue; }
        provider = candidate; providerArea = area;
        candidate.setAllowedPeers(allowedPeers());
        await candidate.connect(join);
        if (!wanted || !network || !position || areaOf(position) !== area) { await closeProvider(); queued = true; continue; }
        connected = true;
        candidate.setAllowedPeers(allowedPeers());
        if (microphone) await candidate.setMicrophone(true);
        const expiresAt = Number(join.connection.expiresAt || 0);
        if (expiresAt) scheduleLease(expiresAt, candidate, join.provider === "livekit" && join.connection.renewable === "1");
        message = interruptedShare ? "음성을 다시 연결했어요. 화면 공유를 다시 시작해 주세요." : "";
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

  voice.onclick = () => {
    wanted = !wanted; message = "";
    if (!wanted) { microphone = false; sharing = false; provider?.setAllowedPeers([]); }
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
    setAvailable(available: boolean) { dock.hidden = !available; if (!available) { wanted = false; queue(); } },
    setMeetingEnabled(enabled: boolean) { meetings.setEnabled(enabled); },
    setNetwork(online: boolean) { network = online; meetings.setNetwork(online); if (!online) { provider?.setAllowedPeers([]); wanted = false; microphone = false; message = ""; } queue(); },
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
