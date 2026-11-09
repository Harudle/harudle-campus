type Meeting = { id: string; title: string; locked: boolean };
type Request = (operation: string, data?: Record<string, unknown>) => Promise<any>;

export function mountMeetings(request: Request, beforeChoose: () => Promise<void>, changed: () => void) {
  const panel = document.getElementById("meetingPanel")!;
  const selection = document.getElementById("meetingSelection")!;
  const chatHint = document.getElementById("meetingChatHint")!;
  const details = document.getElementById("meetingDetails") as HTMLDetailsElement;
  const list = document.getElementById("meetingList")!;
  const form = document.getElementById("meetingCreate") as HTMLFormElement;
  const title = document.getElementById("meetingTitle") as HTMLInputElement;
  const privacy = document.getElementById("meetingPrivacy") as HTMLSelectElement;
  const passwordLabel = document.getElementById("meetingCreatePasswordLabel")!;
  const password = document.getElementById("meetingCreatePassword") as HTMLInputElement;
  const message = document.getElementById("meetingMessage")!;
  let enabled = false, online = false, area = "", chosen: Meeting | null = null, busy = false, loading = false;
  let revision = 0, renderedList = "", listError = "", actionError = "";
  const shown = () => enabled && online && !!area;
  const errorText = (error: any) => ({
    meeting_password_invalid: "비밀번호가 맞지 않아요. 다시 확인해 주세요.",
    meeting_rate_limited: "요청이 많아요. 잠시 후 다시 시도해 주세요.",
    meeting_not_found: "회의를 찾을 수 없어요. 목록을 다시 확인해 주세요.",
    meeting_full: "더 이상 회의를 만들 수 없어요.",
    invalid_meeting: "회의 이름과 비밀번호를 확인해 주세요.",
    meeting_busy: "이전 연결을 정리하고 있어요. 잠시 후 다시 시도해 주세요.",
    meeting_area_required: "회의실 위치를 확인하고 있어요. 잠시 후 다시 시도해 주세요.",
    area_changed: "회의실 위치가 바뀌었어요. 다시 시도해 주세요.",
    not_ready: "캠퍼스 연결이 끊겼어요. 다시 연결되면 시도해 주세요.",
    timeout: "서버 응답이 늦어요. 잠시 후 다시 시도해 주세요.",
  } as Record<string, string>)[error?.message] || "회의를 연결하지 못했어요. 다시 시도해 주세요.";
  function renderMessage() { message.textContent = actionError || listError; }
  function render() {
    panel.hidden = !shown();
    selection.textContent = chosen ? `선택한 회의: ${chosen.title} (${chosen.locked ? "비공개" : "공개"})` : "회의를 만들거나 선택해 주세요.";
    chatHint.hidden = !chosen;
    passwordLabel.hidden = privacy.value !== "private"; password.required = !passwordLabel.hidden;
    for (const button of panel.querySelectorAll("button")) button.disabled = busy || button.dataset.selected === "true";
    changed();
  }
  function reset() { chosen = null; revision++; renderedList = ""; listError = ""; actionError = ""; renderMessage(); list.replaceChildren(); details.open = true; }
  async function refresh() {
    if (!shown() || loading) return;
    loading = true; const version = revision;
    try {
      const rooms: Meeting[] = await request("list");
      if (version !== revision || !shown()) return;
      listError = ""; renderMessage();
      // 입력 중인 비밀번호가 주기적인 목록 갱신으로 지워지지 않게 한다.
      if (list.contains(document.activeElement)) return;
      const signature = JSON.stringify([rooms, chosen?.id]);
      if (signature === renderedList) return;
      renderedList = signature;
      list.replaceChildren();
      if (!rooms.length) { list.textContent = "아직 만든 회의가 없어요."; return; }
      for (const room of rooms) {
        const row = document.createElement("div"); row.className = "meetingRow";
        const label = document.createElement("strong"); label.textContent = `${room.title} (${room.locked ? "비공개" : "공개"})`;
        row.append(label);
        let secret: HTMLInputElement | undefined;
        if (room.locked) { secret = document.createElement("input"); secret.type = "password"; secret.placeholder = "비밀번호"; secret.autocomplete = "current-password"; secret.setAttribute("aria-label", `${room.title} 비밀번호`); row.append(secret); }
        const button = document.createElement("button"); button.type = "button"; button.className = "mediaButton"; button.textContent = chosen?.id === room.id ? "선택됨" : "입장"; button.dataset.selected = String(chosen?.id === room.id); button.disabled = busy || chosen?.id === room.id;
        button.onclick = () => void choose("join", { id: room.id, password: secret?.value || "" });
        row.append(button); list.append(row);
      }
    } catch (error) { if (version === revision) { listError = errorText(error); renderMessage(); } }
    finally { loading = false; }
  }
  async function choose(operation: string, data: Record<string, unknown>) {
    if (busy || !shown()) return;
    busy = true; actionError = ""; renderMessage(); render(); const version = revision;
    try {
      await beforeChoose();
      if (version !== revision || !shown()) return;
      const result: Meeting = await request(operation, data);
      if (version !== revision || !shown()) return;
      chosen = result; details.open = false; password.value = ""; title.value = "";
    } catch (error) { if (version === revision) { actionError = errorText(error); renderMessage(); } }
    finally { busy = false; render(); void refresh(); }
  }
  form.onsubmit = (event) => { event.preventDefault(); if (form.reportValidity()) void choose("create", { title: title.value, locked: privacy.value === "private", password: privacy.value === "private" ? password.value : "" }); };
  privacy.onchange = () => render();
  const timer = window.setInterval(() => { void refresh(); }, 5000);
  void timer;
  return {
    isRequired: () => shown(),
    isSelected: () => !!chosen,
    selectedId: () => shown() ? chosen?.id || null : null,
    setEnabled(value: boolean) { if (enabled !== value) { enabled = value; reset(); render(); void refresh(); } },
    setNetwork(value: boolean) { if (online !== value) { online = value; reset(); render(); void refresh(); } },
    setArea(value: string) { if (area !== value) { area = value; reset(); render(); void refresh(); } },
  };
}
