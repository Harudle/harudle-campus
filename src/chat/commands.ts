// 채팅 명령어: "/"로 시작하면 채팅으로 보내지 않고 여기서 처리한다. "//"로 시작하면 "/"를 붙인 그대로 보낸다
// 엔진의 기능은 host로 받아 쓰고, 결과 안내는 나에게만 보이는 줄(note)로 남긴다
import { findGame, isArena } from "../duel/shared.mjs";
export type ChatTab = "near" | "all" | "dm";
export type CommandPeer = { id: string; u?: string; name: string; f: number; place: string; near: boolean };
export type CommandHost = {
  say(text: string, k?: ChatTab, to?: string | null, cmd?: string): void
  note(text: string): void
  setTab(k: ChatTab): void
  peers(): CommandPeer[]
  skill(name: string): void
  item(id: "laptop" | "coffee" | "book" | "gun"): void
  dance(style?: number): void
  dances: readonly string[]
  firework(): void
  snapshot(): void
  floor(f: number): void
  follow(id: string): void
  stopFollow(): void
  dm(u: string, name: string): void
  voice(): boolean
  mic(): boolean
  open(what: "menu" | "voice" | "keys" | "profile" | "look" | "inv" | "tour" | "shop"): void
  prefill(text: string): void
  // 1:1 대결(src/duel/client.ts). game은 종목 id(jump · shoot · target · box), 없으면 종목 고르는 창
  duel: { games: readonly { id: string; name: string }[]; invite(p: CommandPeer, game?: string): void; answer(ok: boolean, name?: string): void; stop(): void; watch(p: CommandPeer | null): void; forfeit(): void; records(p: CommandPeer | null): void }
};
type Command = { names: string[]; args?: string; desc: string; run(arg: string, host: CommandHost): void };

const FLOOR_RE = /^(1[1-4])\s*(f|층)?$/i;
// 크루가 있는 곳: 대결장(21~24층)은 층 대신 "대결 중 · 관전 중"
const where = (p: CommandPeer) => (isArena(p.f) ? p.place : `${p.f}F${p.place ? ` ${p.place}` : ""}`);

// 이름으로 크루 찾기: 똑같은 이름 → 이름으로 시작 → 이름에 들어 있음 순. 여럿이면 고르게 안내한다
function findPeer(host: CommandHost, q: string): CommandPeer | null {
  const all = host.peers(), key = q.trim().toLowerCase();
  if (!key) { host.note("크루 이름을 같이 써 주세요"); return null; }
  for (const test of [(n: string) => n === key, (n: string) => n.startsWith(key), (n: string) => n.includes(key)]) {
    const hit = all.filter((p) => test(p.name.toLowerCase()));
    if (hit.length === 1) return hit[0];
    if (hit.length > 1) { host.note(`${hit.length}명이 있어요: ${hit.slice(0, 6).map((p) => `${p.name}(${p.f}F)`).join(", ")} · 이름을 더 정확히 써 주세요`); return null; }
  }
  host.note(`"${q}" 크루를 찾지 못했어요`); return null;
}
// "/귓 이름 내용": 이름에 띄어쓰기가 있어도 되게, 접속한 크루 이름 중 가장 길게 맞는 것을 먼저 고른다
function splitTarget(host: CommandHost, arg: string): [CommandPeer | null, string] {
  const exact = host.peers().filter((p) => arg === p.name || arg.startsWith(p.name + " ")).sort((a, b) => b.name.length - a.name.length)[0];
  if (exact) return [exact, arg.slice(exact.name.length).trim()];
  const sp = arg.indexOf(" "), name = sp < 0 ? arg : arg.slice(0, sp);
  return [findPeer(host, name), sp < 0 ? "" : arg.slice(sp + 1).trim()];
}

const COMMANDS: Command[] = [
  { names: ["도움", "help", "?"], desc: "명령어 목록 보기", run: (_, h) => h.prefill("/") },
  // 말하기
  { names: ["전체", "all"], args: "내용", desc: "전체 채팅으로 보내기", run: (a, h) => (a ? h.say(a, "all") : h.setTab("all")) },
  { names: ["근처", "near"], args: "내용", desc: "근처 채팅으로 보내기", run: (a, h) => (a ? h.say(a, "near") : h.setTab("near")) },
  { names: ["귓", "귓속말", "w", "dm"], args: "이름 내용", desc: "개인 채팅 보내기", run: (a, h) => {
    const [p, text] = splitTarget(h, a); if (!p) return;
    if (!p.u) { h.note(`${p.name}님에게는 개인 채팅을 보낼 수 없어요`); return; }
    h.dm(p.u, p.name); if (text) h.say(text, "dm", p.u);
  } },
  { names: ["me", "행동"], args: "내용", desc: "행동으로 말하기 (예: /me 커피 마시러 감)", run: (a, h) => (a ? h.say(a, undefined, undefined, "me") : h.note("할 행동을 같이 써 주세요")) },
  { names: ["주사위", "roll"], args: "[최대 수]", desc: "주사위 굴리기 (기본 1~6)", run: (a, h) => h.say(a, undefined, undefined, "roll") },
  { names: ["뽑기", "pick"], args: "A B C", desc: "여러 개 중 하나 뽑기", run: (a, h) => h.say(a, undefined, undefined, "pick") },
  // 동작
  { names: ["춤", "dance"], args: "[이름·번호]", desc: "춤추기 · 다시 쓰면 멈춤", run: (a, h) => {
    if (!a) { h.dance(); return; }
    if (a === "목록") { h.note(h.dances.map((d, i) => `${i + 1} ${d}`).join(" · ")); return; }
    const n = Number(a), k = Number.isInteger(n) ? n - 1 : h.dances.findIndex((d) => d.replace(/ 춤$/, "") === a.replace(/ 춤$/, "") || d.includes(a));
    if (k < 0 || k >= h.dances.length) { h.note(`그런 춤은 없어요 · ${h.dances.map((d, i) => `${i + 1} ${d}`).join(" · ")}`); return; }
    h.dance(k);
  } },
  { names: ["인사", "wave"], desc: "손 흔들기", run: (_, h) => h.skill("wave") },
  { names: ["하트", "heart"], desc: "하트 보내기", run: (_, h) => h.skill("heart") },
  { names: ["그리기", "네컷", "draw"], desc: "네 컷 그리기", run: (_, h) => h.skill("draw") },
  { names: ["폭죽", "firework"], desc: "폭죽 쏘기", run: (_, h) => h.firework() },
  { names: ["캡처", "캡쳐", "사진", "snap"], desc: "지금 모습 캡쳐 (사진으로 저장)", run: (_, h) => h.snapshot() },
  { names: ["커피", "coffee"], desc: "아이스 아메리카노 마시기", run: (_, h) => h.item("coffee") },
  { names: ["노트북", "laptop"], desc: "노트북 펼치기 (앉아서)", run: (_, h) => h.item("laptop") },
  { names: ["책", "book"], desc: "책 읽기 (앉거나 누워서)", run: (_, h) => h.item("book") },
  { names: ["총", "gun"], desc: "종이 총 꺼내기 · 넣기", run: (_, h) => h.item("gun") },
  // 이동 · 크루
  { names: ["층", "floor"], args: "11~14", desc: "다른 층으로 가기", run: (a, h) => {
    const m = a.match(FLOOR_RE); if (!m) { h.note("11~14 중 하나를 써 주세요 (예: /층 13)"); return; }
    h.floor(+m[1]);
  } },
  { names: ["찾기", "find"], args: "[이름]", desc: "크루가 어디 있는지 보기", run: (a, h) => {
    if (!a) { const all = h.peers(); h.note(all.length ? all.slice(0, 10).map((p) => `${p.name} ${where(p)}`).join(" · ") + (all.length > 10 ? ` 외 ${all.length - 10}명` : "") : "아직 다른 크루가 없어요"); return; }
    const p = findPeer(h, a); if (p) h.note(isArena(p.f) ? `${p.name}님은 ${p.place}이에요 · /관전 ${p.name}` : `${p.name}님은 ${where(p)}에 있어요${p.near ? " · 바로 근처예요" : ""}`);
  } },
  { names: ["따라가기", "follow"], args: "이름", desc: "크루 따라가기", run: (a, h) => { const p = findPeer(h, a); if (p) h.follow(p.id); } },
  { names: ["멈춤", "stop"], desc: "따라가기 멈추기", run: (_, h) => h.stopFollow() },
  // 1:1 대결(docs/duel.md)
  { names: ["대결", "duel"], args: "이름 [종목]", desc: "1:1 대결 신청 (점프맵 · 사격 · 과녁 · 복싱)", run: (a, h) => {
    if (!a) { h.note("대결할 크루 이름을 같이 써 주세요 (예: /대결 포비 점프맵)"); return; }
    const whole = h.peers().find((p) => p.name === a); if (whole) { h.duel.invite(whole, undefined); return; }   // 쓴 글 전체가 이름이면 그 사람("고양이 복싱" 같은 이름)
    if (/^테스터(\s|$)/.test(a)) { // 개발 서버의 연습 상대: 바로 경기(운영 서버는 "찾지 못했어요")
      const rest = a.slice(3).trim(), tg = rest ? findGame(rest) : null;
      if (rest && !tg) { h.note(`종목은 ${h.duel.games.map((x) => x.name).join(" · ")} 중에서 골라 주세요`); return; }
      h.duel.invite({ id: "tester", name: "테스터", f: 0, place: "", near: false }, tg?.id); return;
    }
    // 끝 단어가 종목이면 종목, 아니면 이름 전체(띄어쓰기 있는 이름도 된다)
    const sp = a.lastIndexOf(" "), g = sp > 0 ? findGame(a.slice(sp + 1)) : null;
    const [p, rest] = splitTarget(h, g ? a.slice(0, sp).trim() : a); if (!p) return;
    if (rest) { const g2 = findGame(rest); if (!g2) { h.note(`종목은 ${h.duel.games.map((x) => x.name).join(" · ")} 중에서 골라 주세요`); return; } h.duel.invite(p, g2.id); return; }
    h.duel.invite(p, g?.id);
  } },
  { names: ["수락", "accept"], args: "[이름]", desc: "받은 대결 신청 수락 (Y)", run: (a, h) => h.duel.answer(true, a) },
  { names: ["거절", "decline"], args: "[이름]", desc: "받은 대결 신청 거절 (N)", run: (a, h) => h.duel.answer(false, a) },
  { names: ["관전", "watch"], args: "[이름]", desc: "크루의 대결 보기 · 이름 없이 쓰면 그만 보기", run: (a, h) => { if (!a) { h.duel.watch(null); return; } const p = findPeer(h, a); if (p) h.duel.watch(p); } },
  { names: ["종료", "끝내기", "end"], desc: "경기 끝내기 (신청한 사람만, 승패 없음)", run: (_, h) => h.duel.stop() },
  { names: ["기권", "forfeit"], desc: "진행 중인 대결 기권", run: (_, h) => h.duel.forfeit() },
  { names: ["전적", "record"], args: "[이름]", desc: "대결 승 · 패 · 무와 점프맵 기록", run: (a, h) => { if (!a) { h.duel.records(null); return; } const p = findPeer(h, a); if (p) h.duel.records(p); } },
  // 음성
  { names: ["음성", "voice"], desc: "음성 연결 · 나가기", run: (_, h) => { if (!h.voice()) h.note("지금은 음성을 쓸 수 없어요"); } },
  { names: ["마이크", "mic"], desc: "마이크 켜기 · 끄기", run: (_, h) => { if (!h.mic()) h.note("먼저 /음성으로 연결해 주세요"); } },
  // 창 열기
  { names: ["설정", "settings"], args: "[음성·조작법]", desc: "설정 열기", run: (a, h) => h.open(/^(음성|voice)$/i.test(a) ? "voice" : /^(조작법|키|keys)$/i.test(a) ? "keys" : "menu") },
  { names: ["조작법", "keys"], desc: "조작법 보기", run: (_, h) => h.open("keys") },
  { names: ["프로필", "이름", "profile"], desc: "프로필(이름) 수정", run: (_, h) => h.open("profile") },
  { names: ["외형", "꾸미기", "캐릭터", "look"], desc: "캐릭터 외형 수정", run: (_, h) => h.open("look") },
  { names: ["인벤토리", "가방", "inv"], desc: "인벤토리 열기", run: (_, h) => h.open("inv") },
  { names: ["상점", "shop"], desc: "컷 상점 열기 (구경은 누구나, 사기는 하루들 연동 후)", run: (_, h) => h.open("shop") },
  { names: ["안내", "tour"], desc: "처음 안내 다시 보기", run: (_, h) => h.open("tour") },
];
const byName = new Map(COMMANDS.flatMap((c) => c.names.map((n) => [n.toLowerCase(), c] as const)));

// 보낸 글이 명령어면 처리하고 true. 모르는 명령어도 채팅으로 새지 않게 안내만 하고 true
export function runCommand(text: string, host: CommandHost): boolean {
  if (!text.startsWith("/")) return false;
  if (text.startsWith("//")) { host.say(text.slice(1)); return true; }
  const m = text.slice(1).match(/^(\S*)\s*([\s\S]*)$/), cmd = byName.get((m?.[1] || "").toLowerCase());
  if (!cmd) { host.note(`"/${m?.[1] || ""}"는 없는 명령어예요 · /도움`); return true; }
  cmd.run((m?.[2] || "").trim(), host);
  return true;
}

// 입력창 위 명령어 목록: "/"를 치면 뜬다. ↑↓로 고르고 Tab(또는 아직 다 못 친 채 Enter)으로 채운다
export function mountCommandHints(input: HTMLInputElement) {
  const box = document.createElement("ul"); box.id = "cmdHints"; box.hidden = true; box.setAttribute("role", "listbox"); box.setAttribute("aria-label", "채팅 명령어");
  input.form!.before(box);
  let shown: Command[] = [], at = 0;
  const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  // 친 글자로 시작하는 이름(한국어 이름이 먼저)을 보여 준다
  const label = (c: Command, typed: string) => c.names.find((n) => n.toLowerCase().startsWith(typed)) || c.names[0];
  function update() {
    const v = input.value, m = v.match(/^\/(\S*)(\s?)/);
    if (!m || v.startsWith("//")) { hide(); return; }
    const typed = m[1].toLowerCase();
    shown = m[2] ? [byName.get(typed)].filter(Boolean) : COMMANDS.filter((c) => c.names.some((n) => n.toLowerCase().startsWith(typed)));
    if (!shown.length) { hide(); return; }
    at = Math.min(at, shown.length - 1);
    box.innerHTML = shown.map((c, i) => `<li role="option" data-i="${i}" aria-selected="${i === at && !m[2]}"><b>/${esc(label(c, typed))}</b>${c.args ? `<i>${esc(c.args)}</i>` : ""}<span>${esc(c.desc)}</span></li>`).join("");
    box.hidden = false; (box.children[at] as HTMLElement)?.scrollIntoView({ block: "nearest" });
  }
  function hide() { box.hidden = true; shown = []; at = 0; }
  function fill(i: number) {
    const c = shown[i], typed = (input.value.match(/^\/(\S*)/)?.[1] || "").toLowerCase(); if (!c) return;
    input.value = `/${label(c, typed)}${c.args ? " " : ""}`; at = 0; update();
  }
  input.addEventListener("input", () => { at = 0; update(); });
  input.addEventListener("blur", () => setTimeout(hide, 120));
  box.addEventListener("mousedown", (e) => { const li = (e.target as HTMLElement).closest("li"); if (!li) return; e.preventDefault(); fill(+li.dataset.i!); });
  return {
    update,
    // 목록이 떠 있을 때 키를 먼저 받는다. 처리했으면 true
    key(e: KeyboardEvent) {
      if (box.hidden || !shown.length) return false;
      const head = input.value.match(/^\/(\S*)(\s?)/), done = !!head?.[2];
      if (e.code === "ArrowDown" || e.code === "ArrowUp") { if (done) return false; e.preventDefault(); at = (at + (e.code === "ArrowDown" ? 1 : shown.length - 1)) % shown.length; update(); return true; }
      if (e.code === "Tab" && !done) { e.preventDefault(); fill(at); return true; }
      if (e.code === "Enter" && !done && !e.isComposing && !byName.has((head?.[1] || "").toLowerCase())) { e.preventDefault(); fill(at); return true; }
      if (e.code === "Escape") { hide(); return false; }
      return false;
    },
    hide,
  };
}
