// 1:1 대결 브라우저 쪽 틀: 신청 · 초대장 · 종목 고르기 · 대결장으로 옮기기/돌아오기 · 3·2·1 · 경기 HUD 틀 · 결과 · 관전 (docs/duel.md)
// 엔진(engine.ts)은 host로 기능을 빌려주고, 종목(src/duel/games/*)은 ctx로만 엔진을 다룬다. 엔진 안 지역 변수를 직접 건드리지 않는다
import type * as THREE from "three";
import type { Doll } from "../engine/dolls";
import { W, H, S, wx, wz, tX, tY, floorY, FLOORS } from "../engine/world";
import { DUEL, DUEL_GAMES, DUEL_REASON, duelGame, isArena, fmtMs, esc } from "./shared.mjs";
import { JUMP_COURSES } from "./arena/jump.mjs";
import { furnKit, type FurnKit } from "./furniture";
import { GAMES } from "./games";
import type { CommandPeer } from "../chat/commands";

/* ═════ 서버가 알려 주는 경기 ═════ */
export type DuelSeat = 0 | 1;
export type DuelPlayer = { u: string; peer: string; name: string; away?: 1 };
export type DuelSpot = [number, number, number];   // [x, y(칸), 바라보는 방향(me.h)]
export type DuelMatch = {
  id: string; game: string; ar: string; floor: number
  seat: DuelSeat | null                            // 내 자리. null이면 관전
  players: DuelPlayer[]
  phase: "countdown" | "playing" | "result"
  startAt: number; endsAt: number                  // 서버 시각(ms). endsAt은 playing부터
  state: any                                       // 종목 서버 규칙이 match.state에 둔 공개 상태
  spawns: DuelSpot[]; watch: DuelSpot[]; watchers: number; serverTime: number
};
export type DuelEnd = { id: string; winner: string | null; seat: DuelSeat | null; reason: string; summary: any };

/* ═════ 종목(브라우저) 인터페이스 ═════ */
export type DuelWho = DuelSeat | "me" | "foe";     // 자리 번호 · 나 · (선수일 때) 상대
export type DuelBullet = { pos: THREE.Vector3; vel: THREE.Vector3; mine: boolean; by: DuelSeat | "me" | null; target?: DuelSeat | "me" | null };
export type DuelCtx = {
  THREE: typeof THREE; scene: THREE.Scene; camera: THREE.PerspectiveCamera
  kit: FurnKit                                     // 엔진 그리기 도구(furniture.ts): 경기 중에 만드는 것도 같은 모양새로
  readonly match: DuelMatch                        // 늘 최신(단계 · state가 바뀌면 같이 바뀐다)
  seat: DuelSeat | null; mine: boolean             // mine: 내가 선수
  game: string; floor: number
  group: THREE.Group                               // 대결장 층 묶음(층 높이에 놓여 있다). 여기 붙이면 층 좌표(y 0 = 바닥)
  grid: { W: number; H: number; S: number; wx(tx: number): number; wz(ty: number): number; tX(x: number): number; tY(z: number): number; y0: number; topAt(x: number, y: number): number; fl: any }
  me: { readonly f: number; readonly x: number; readonly y: number; readonly h: number; readonly up: number; readonly jz: number; readonly jv: number; readonly moving: boolean; readonly running: boolean; readonly act: string | null }
  place(x: number, y: number, h?: number): void    // 나를 이 칸으로(발판 위면 그 위에 선다)
  lock(on: boolean): void                          // 걷기 · 점프 잠그기
  speed(k: number): void                           // 걷기 빠르기 배수(가드 중 느리게 등)
  canFire(on: boolean): void                       // 종이 총 쏘기 허락
  doubleJump(on: boolean): void                    // 더블 점프 허락(끄면 땅에서 한 번만)
  view(mode: "first" | null): void                 // 시점 고정(V · 시점 버튼 막음). null이면 풀고 원래 시점으로
  tags(on: boolean): void                          // 이 층 머리 위 이름표 보이기
  gun(look: "ak" | null): void                     // 이 층 종이 총 모양(ak: 종이 AK-47, 총알도 bulletSpeed로)
  fireGap(ms: number): void; bulletSpeed(mps: number): void   // 연사 간격(엔진 기본 250ms) · 종이 총알 빠르기(m/s, 기본 19.5)
  recoil(k: number): void                          // 반동: 1인칭이면 시야가 위로 튄다(라디안)
  ads(on: boolean): void                           // 조준(1인칭 AK): 화면이 당겨지고 총이 가운데로
  reloading(r: number | null): void                // 장전 동작 진행(0~1, null이면 끝)
  jump(): void; bounce(v: number): void            // 점프 키와 같게 · 위로 튕기기(m/s)
  doll(who: DuelWho): Doll | null                  // 그 사람 캐릭터(root · turn). 외형이 바뀌면 새로 만들어지니 매번 다시 받는다
  pos(who: DuelWho): { f: number; x: number; y: number; h: number; up: number; jz: number; presence: any } | null
  name(who: DuelWho): string
  act(name: string | null): void                   // 내 동작(예: "gun" 종이 총 꺼내기, null 넣기)
  arms(who: DuelWho, arms: number[] | null): void  // 팔 자세 덮어쓰기 [오른팔 x, z, 왼팔 x, z](라디안). 쉬는 자세 [0, -.35, 0, .35] · 앞으로 뻗기 x = -1.45
  fire(aim?: number | null): void                  // 종이 총 한 발(엔진 연사 간격 0.25초). aim: 방향(없으면 보는 쪽)
  shootPaper(x: number, y: number, dir: number, lift: number, who?: DuelWho): void   // 종이 총알 모양만(다른 사람이 쏜 것 보여 주기)
  hitReact(who: DuelWho, dir: number): void        // 맞은 흔들림
  onFire(fn: (s: { x: number; y: number; dir: number; lift: number; pitch: number | null; at: number }) => void): void   // 내가 쐈을 때(pitch: 조준해 쏜 위아래, 위에서 볼 땐 null)
  onBullet(fn: (b: DuelBullet) => boolean | void): void      // 날아가는 총알 한 걸음마다(true면 거기서 맞은 것으로 멈춘다: 과녁 등)
  onBulletHit(fn: (b: DuelBullet) => boolean | void): void   // 총알이 사람에게 맞았을 때(true면 엔진 기본 처리를 안 한다)
  send(payload: Record<string, unknown>): void     // 서버로 duel:game(선수만 받는다)
  sync(): void                                     // 내 위치를 바로 서버로(판정 메시지 직전에)
  hud: HTMLElement                                 // 종목 HUD 자리(경기 틀 안). stop에서 비운다
  myHp(hp: number | null, max?: number): void      // 아래 독에 내 체력(선수만). null이면 감춘다
  toast(title: string, text?: string, ms?: number): void; note(text: string): void
  now(): number                                    // 서버 시각 추정(ms)
  touch: boolean
};
export type DuelRun = {
  tick?(dt: number, t: number): void               // 매 프레임
  message?(payload: any): void                     // 서버가 보낸 duel:game
  match?(match: DuelMatch): void                   // 단계 · 상태가 바뀌었을 때
  key?(e: KeyboardEvent): boolean                  // keydown · keyup 모두. true면 엔진 기본 동작을 막는다(keydown만)
  pointer?(e: MouseEvent): boolean                 // mousedown · mouseup(마우스 고정 중이거나 화면을 눌렀을 때)
  result?(end: DuelEnd): string                    // 결과 카드에 쓸 한 줄
  stop(): void                                     // 경기 화면을 나갈 때. 만든 것을 모두 치운다
};
// keys: 선수일 때 아래 독(표현 버튼 자리)에 보여 줄 조작 키. keys는 누르는 것들(예: ["J", "좌클릭"])
export type DuelGame = { id: string; keys?: { label: string; keys: string[] }[]; start(ctx: DuelCtx): DuelRun };

/* ═════ 엔진이 빌려주는 것(engine.ts duelHost) ═════ */
export type DuelHost = {
  THREE: typeof THREE; scene: THREE.Scene; camera: THREE.PerspectiveCamera; touch: boolean
  me: any; elev: [number, number]
  move: { lock: boolean; speed: number; noFire: boolean; jumps: number; view: null | string; noTags: boolean; gun: string; fireGap: number; bulletSpeed: number; ads: boolean; reload: number; ghost: null | { x: number; y: number; w: number; h: number } }
  send(m: any): void; online(): boolean; probeClock(): void
  floorGroup(f: number): THREE.Group; topAt(x: number, y: number): number
  goFloor(f: number, spot: number[], exact?: boolean): void
  place(x: number, y: number, h?: number): void
  actor(peer: string | "me"): any; whoIs(actor: any): string | null   // 엔진의 사람(me · 같이 있는 크루 v) ↔ peer id("me")
  act(name: string | null): void; fire(aim?: number | null): void; jump(): void; bounce(v: number): void
  shootPaper(f: number, x: number, y: number, dir: number, lift: number, actor?: any): void; hitReact(actor: any, dir: number): void
  presence(): void; recoil(k: number): void
  toast(h: string, p?: string, ms?: number): void; note(text: string): void
  unlock(): void; syncCursor(): void
};

const LS = { get(k: string) { try { return localStorage.getItem(k); } catch { return null; } }, set(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { } } };
const el = (tag: string, cls: string, html = "") => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };

export function mountDuel(host: DuelHost) {
  let match: DuelMatch | null = null, run: DuelRun | null = null, end: DuelEnd | null = null;
  let offset: number | null = null, bestRtt = Infinity, offTimer = 0, eatAt = 0, runTimer = 0, crashed = false, lastAr: string | null = null;   // lastAr: 끝난 경기에서 걸어 나가는 동안(층을 옮기기 전)도 그 방 번호로
  let accept = LS.get("ww.duelAccept") !== "0";
  // 들어가기 전 자리: 경기가 끝나거나 서버와 끊기면 여기로 돌아온다(새로고침해도 남게 브라우저에 둔다)
  let origin: { f: number; x: number; y: number; h: number } | null = (() => { try { return JSON.parse(LS.get("ww.duelBack") || "null"); } catch { return null; } })(), lastBack = origin;   // lastBack: 관전을 바로 옮길 때(닫힘 → 새 경기) 돌아갈 자리를 잃지 않게
  const invites = new Map<string, { id: string; game: string; from: { peer: string; name: string }; expiresAt: number; card: HTMLElement }>();
  let sent: { id: string; game: string; to: string; expiresAt: number } | null = null;
  const hooks = { fire: [] as ((s: any) => void)[], bullet: [] as ((b: DuelBullet) => boolean | void)[], hit: [] as ((b: DuelBullet) => boolean | void)[] };
  const now = () => (offset === null ? Date.now() : performance.now() + offset);
  const me = host.me;

  /* ───── 화면: 초대장 · 보낸 신청 · 경기 틀 · 3·2·1 · 결과 · 종목 고르기 ───── */
  const inbox = el("div", "duelInbox"); inbox.id = "duelInbox"; inbox.setAttribute("aria-live", "polite");
  const hud = el("section", "duelHud", `<div class="dhBar"><b class="dhName"></b><span class="dhP"><i class="s0"></i><em>vs</em><i class="s1"></i></span><span class="dhTime"></span></div><div class="dhGame"></div><div class="dhWatch" hidden>👀 관전 중 <button type="button" class="btn ghost">나가기</button></div><div class="dhWatch dhStop" hidden>신청한 사람은 경기를 끝낼 수 있어요 <button type="button" class="btn ghost">경기 끝내기</button></div>`);
  hud.id = "duelHud"; hud.hidden = true;
  const count = el("div", "duelCount"); count.id = "duelCount"; count.hidden = true; count.setAttribute("aria-live", "assertive");
  const card = el("section", "duelResult"); card.id = "duelResult"; card.hidden = true; card.setAttribute("role", "status");
  const pick = el("div", "modal", `<div class="box" role="dialog" aria-labelledby="duelPickTitle"><h4 id="duelPickTitle"></h4><p class="dpHint">숫자 1~4로도 골라요</p><div class="mlist"></div><button type="button" class="btn ghost dpClose">그만두기</button></div>`);
  pick.id = "duelPick"; pick.hidden = true;
  document.body.append(inbox, hud, count, card, pick);
  const gameHud = hud.querySelector<HTMLElement>(".dhGame"), watchBar = hud.querySelector<HTMLElement>(".dhWatch");
  watchBar.querySelector("button").onclick = () => host.send({ t: "duel:watch" });
  const stopBar = hud.querySelector<HTMLElement>(".dhStop"); stopBar.querySelector("button").onclick = () => stopMatch();

  // 초대장: 마우스가 고정돼 있어도 Y · N으로 답한다
  function addInvite(m) {
    const g = duelGame(m.game); if (!g) return;
    const c = el("div", "duelCard", `<p><b>${esc(m.from.name)}</b>님이 <b>${g.icon} ${esc(g.name)}</b> 대결을 신청했어요</p><div class="dcBtns"><button type="button" class="btn" data-ok="1">수락 <kbd>Y</kbd></button><button type="button" class="btn ghost" data-ok="0">거절 <kbd>N</kbd></button></div><i class="dcBar"></i>`);
    c.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-ok]"); if (b) answer(m.id, b.dataset.ok === "1"); });
    invites.set(m.id, { id: m.id, game: m.game, from: m.from, expiresAt: m.expiresAt, card: c }); inbox.prepend(c);
    host.toast("대결 신청이 왔어요", `${m.from.name}님 · ${g.name} · Y 또는 /수락, N 또는 /거절`, 3200);
  }
  function dropInvite(id: string) { const iv = invites.get(id); if (!iv) return; iv.card.remove(); invites.delete(id); }
  function answer(id: string, ok: boolean) { if (!invites.has(id)) return; host.send({ t: "duel:answer", id, ok }); dropInvite(id); if (!ok) host.note("대결 신청을 거절했어요"); }
  const sentChip = el("div", "duelCard sent", ""); sentChip.hidden = true; inbox.append(sentChip);
  sentChip.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("button")) host.send({ t: "duel:cancel" }); });
  function showSent() {
    sentChip.hidden = !sent; if (!sent) return;
    const g = duelGame(sent.game);
    sentChip.innerHTML = `<p><b>${esc(sent.to)}</b>님에게 ${g?.icon || ""} ${esc(g?.name || "")} 대결을 신청했어요 · <span class="dcLeft"></span></p><div class="dcBtns"><button type="button" class="btn ghost">신청 취소</button></div><i class="dcBar"></i>`;
  }

  // 종목 고르기(/대결 이름만 쓰면): 창이라 커서를 꺼낸다(엔진 uiOpen이 modal()을 본다)
  let pickFor: CommandPeer | null = null;
  function openPick(p: CommandPeer) {
    pickFor = p; host.unlock();
    pick.querySelector("h4").textContent = `${p.name}님과 무엇으로 겨룰까요?`;
    pick.querySelector(".mlist").innerHTML = DUEL_GAMES.map((g, i) => `<button type="button" class="btn ghost dpGame" data-g="${g.id}" ${GAMES[g.id] ? "" : "disabled"}><b>${i + 1} ${g.icon} ${esc(g.name)}</b><span>${GAMES[g.id] ? esc(g.desc) : "준비 중"}</span></button>`).join("");
    pick.hidden = false; pick.querySelector<HTMLButtonElement>(".dpGame:not([disabled])")?.focus();
  }
  function closePick() { if (pick.hidden) return; pick.hidden = true; pickFor = null; host.syncCursor(); }
  function choose(id: string) { const p = pickFor; closePick(); if (p && GAMES[id]) invite(p, id); }
  pick.addEventListener("click", (e) => { const t = e.target as HTMLElement, b = t.closest<HTMLElement>("[data-g]"); if (b && !(b as HTMLButtonElement).disabled) choose(b.dataset.g); else if (t === pick || t.closest(".dpClose")) closePick(); });
  pick.addEventListener("keydown", (e) => { // 창 안의 키는 게임으로 보내지 않는다
    e.stopPropagation();
    if (e.code === "Escape") { e.preventDefault(); closePick(); return; }
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
    if (n !== undefined) { e.preventDefault(); choose(DUEL_GAMES[n].id); }
  });

  // 설정창 「대결 신청 받기」
  const prefBtn = document.getElementById("menuDuel") as HTMLButtonElement | null;
  const showPref = () => { if (!prefBtn) return; prefBtn.textContent = `대결 신청 받기: ${accept ? "켬" : "끔"}`; prefBtn.setAttribute("aria-pressed", String(accept)); };
  if (prefBtn) prefBtn.onclick = () => { accept = !accept; LS.set("ww.duelAccept", accept ? "1" : "0"); showPref(); host.send({ t: "duel:prefs", accept }); host.toast(accept ? "대결 신청을 받아요" : "대결 신청을 받지 않아요", accept ? "" : "다른 크루가 나에게 /대결을 신청할 수 없어요.", 2200); };
  showPref();

  /* ───── 대결장으로 옮기기 · 돌아오기 ───── */
  const seatPeer = (s: DuelSeat) => match?.players[s]?.peer;
  const whoActor = (who: DuelWho) => {
    if (!match) return who === "me" ? host.actor("me") : null;
    const s = who === "foe" ? (match.seat === null ? null : (1 - match.seat) as DuelSeat) : who;
    if (s === "me" || (s !== null && s === match.seat)) return host.actor("me");
    return s === null ? null : host.actor(seatPeer(s));
  };
  const seatOf = (a: any): DuelSeat | "me" | null => { if (!a) return null; const id = host.whoIs(a); if (id === "me") return "me"; const i = match?.players.findIndex((p) => p.peer === id) ?? -1; return i < 0 ? null : (i as DuelSeat); };
  function enter() {
    const m = match; const mySpot = m.seat !== null ? m.spawns[m.seat] : (() => { const w = m.watch[Math.floor(Math.random() * m.watch.length)]; return [w[0] + (Math.random() - .5) * 1.2, w[1] + (Math.random() - .5) * 1.2, w[2]]; })();
    if (!origin) { origin = isArena(me.f) ? lastBack : { f: me.f, x: me.x, y: me.y, h: me.h }; if (origin) LS.set("ww.duelBack", JSON.stringify(origin)); }
    host.goFloor(m.floor, mySpot, true); host.probeClock();
    const g = duelGame(m.game);
    if (m.seat === null) host.toast(`${g.name} 관전`, `${m.players.map((p) => p.name).join(" vs ")} · /관전으로 나가요.`, 3200);
    else host.toast(`${g.name} 대결장에 왔어요`, `상대: ${m.players[1 - m.seat].name} · 3, 2, 1 하면 시작해요.`, 3200);
    clearTimeout(runTimer); runTimer = window.setTimeout(() => { if (match === m) startRun(); }, 320);   // 층을 옮긴 뒤(엔진 goFloor 250ms)
  }
  function leave(why: string) {
    stopRun(); clearTimeout(runTimer); clearTimeout(offTimer);
    const was = match; lastAr = was?.ar ?? lastAr; match = null; hud.hidden = true; count.hidden = true; renderDock();
    if (card.hidden === false) window.setTimeout(() => { if (!match) card.hidden = true; }, 1200);
    if (isArena(me.f)) { const o = origin || lastBack || { f: 12, x: host.elev[0], y: host.elev[1], h: me.h }; lastBack = o; host.goFloor(o.f, [o.x, o.y]); }
    origin = null; LS.set("ww.duelBack", null);
    if (why === "offline") host.toast("대결장에서 나왔어요", "서버와 연결이 끊겨 원래 자리로 돌아왔어요.", 3600);
    else if (why === "none" && was) host.note("경기가 끝나 원래 자리로 돌아왔어요");
    else if (why === "closed" && was?.seat === null && !end) host.note("관전을 그만뒀어요");
    end = null; host.presence();
  }

  /* ───── 종목 실행 ───── */
  function startRun() {
    stopRun(); const m = match, g = GAMES[m.game]; if (!g) { host.note(`${duelGame(m.game)?.name || m.game}은 이 버전에서 아직 볼 수 없어요`); return; }
    crashed = false;
    try { run = g.start(makeCtx(m)); run?.match?.(match); } catch (e) { console.error("[duel] start", e); run = null; }
    applyLock();
  }
  // 선수는 3·2·1 동안과 결과 동안 제자리. 경기 중 잠금은 종목이 정한다
  const applyLock = () => { host.move.lock = !!match && match.seat !== null && match.phase !== "playing"; host.move.ghost = match && match.seat === null ? roam(match.floor) : null; };
  // 관전자가 막힘 없이 다니는 곳: 대결장 방(난간)들을 모두 감싼 사각형의 안쪽(벽 · 기둥에 끼지 않고 높은 곳은 그 위로 넘어간다)
  function roam(f: number) {
    const rs = FLOORS[f]?.rooms || []; if (!rs.length) return null;
    const x0 = Math.min(...rs.map((r) => r.x)) + 1, y0 = Math.min(...rs.map((r) => r.y)) + 1, x1 = Math.max(...rs.map((r) => r.x + r.w)) - 1, y1 = Math.max(...rs.map((r) => r.y + r.h)) - 1;
    return { x: x0 + .3, y: y0 + .3, w: x1 - x0 - .6, h: y1 - y0 - .6 };
  }
  function stopRun() {
    if (run) try { run.stop(); } catch (e) { console.error("[duel] stop", e); }
    run = null; gameHud.replaceChildren(); myHp = null; renderDock(); hooks.fire.length = hooks.bullet.length = hooks.hit.length = 0;
    host.move.lock = false; host.move.speed = 1; host.move.noFire = false; host.move.jumps = 2; host.move.ghost = null;
    host.move.view = null; host.move.noTags = false; host.move.gun = ""; host.move.fireGap = 250; host.move.bulletSpeed = 0; host.move.ads = false; host.move.reload = -1;
    const a = host.actor("me"); if (a?.doll) a.doll.anim.arms = null;
    for (const p of match?.players || []) { const v = host.actor(p.peer); if (v?.doll) v.doll.anim.arms = null; }
  }
  const safe = (fn: () => void) => { if (crashed) return; try { fn(); } catch (e) { crashed = true; console.error("[duel] game", e); } };   // 종목이 터져도 캠퍼스는 돈다
  function makeCtx(m: DuelMatch): DuelCtx {
    const fl = FLOORS[m.floor];
    return {
      THREE: host.THREE, scene: host.scene, camera: host.camera, kit: furnKit(),
      get match() { return match || m; }, seat: m.seat, mine: m.seat !== null, game: m.game, floor: m.floor,
      group: host.floorGroup(m.floor),
      grid: { W, H, S, wx, wz, tX, tY, y0: floorY(m.floor), topAt: host.topAt, fl },
      me: { get f() { return me.f; }, get x() { return me.x; }, get y() { return me.y; }, get h() { return me.h; }, get up() { return me.up; }, get jz() { return me.jz; }, get jv() { return me.jv; }, get moving() { return me.moving; }, get running() { return me.runHold || me.runToggle; }, get act() { return me.act?.name || null; } },
      place: (x, y, h) => host.place(x, y, h),
      lock: (on) => { host.move.lock = !!on; }, speed: (k) => { host.move.speed = k > 0 ? k : 1; }, canFire: (on) => { host.move.noFire = !on; }, doubleJump: (on) => { host.move.jumps = on ? 2 : 1; },
      view: (mode) => { host.move.view = mode; }, tags: (on) => { host.move.noTags = !on; }, gun: (look) => { host.move.gun = look || ""; },
      fireGap: (ms) => { host.move.fireGap = ms > 0 ? ms : 250; }, bulletSpeed: (v) => { host.move.bulletSpeed = v > 0 ? v : 0; }, recoil: (k) => host.recoil(k), ads: (on) => { host.move.ads = !!on; }, reloading: (r) => { host.move.reload = r === null ? -1 : Math.min(1, Math.max(0, r)); },
      jump: () => host.jump(), bounce: (v) => host.bounce(v),
      doll: (who) => whoActor(who)?.doll || null,
      pos: (who) => { const a = whoActor(who); if (!a) return null; if (a === host.actor("me")) return { f: me.f, x: me.x, y: me.y, h: me.h, up: me.up, jz: me.jz, presence: null }; const s = a.presence || {}; return { f: s.f, x: a.x, y: a.y, h: s.h ?? 0, up: +s.u || 0, jz: a.jz || 0, presence: s }; },
      name: (who) => (who === "me" ? "나" : (() => { const s = who === "foe" ? (m.seat === null ? null : 1 - m.seat) : who; return s === null ? "" : match?.players[s]?.name || ""; })()),
      act: (name) => host.act(name),
      arms: (who, arms) => { const d = whoActor(who)?.doll; if (d) d.anim.arms = arms; },
      fire: (aim) => host.fire(aim), shootPaper: (x, y, dir, lift, who) => host.shootPaper(m.floor, x, y, dir, lift, who === undefined ? null : whoActor(who)),
      hitReact: (who, dir) => { const a = whoActor(who); if (a) host.hitReact(a, dir); },
      onFire: (fn) => { hooks.fire.push(fn); }, onBullet: (fn) => { hooks.bullet.push(fn); }, onBulletHit: (fn) => { hooks.hit.push(fn); },
      send: (payload) => { if (match?.id === m.id && m.seat !== null) host.send({ ...payload, t: "duel:game", id: m.id }); },
      sync: () => host.presence(),
      hud: gameHud, myHp: (hp, max = 100) => { myHp = m.seat === null || hp === null ? null : { hp, max }; renderDock(); }, toast: (h, p = "", ms) => host.toast(h, p, ms), note: (t) => host.note(t), now, touch: host.touch,
    };
  }
  const bulletOf = (w, pos, target?) => ({ pos, vel: w.v, mine: w.shooter === me, by: seatOf(w.shooter), ...(target !== undefined ? { target: seatOf(target) } : {}) });

  /* ───── 아래 독: 선수가 대결장에 있는 동안 표현 버튼(1~4 · Z · 폭죽) 대신 종목 조작 키와 내 체력 ───── */
  const skills = document.getElementById("skills"), duelDock = document.getElementById("duelDock");
  const ddKeys = duelDock?.querySelector<HTMLElement>(".ddKeys"), ddHp = duelDock?.querySelector<HTMLElement>(".ddHp");
  let myHp: { hp: number; max: number } | null = null, dockKey = "", hpKey = "";
  function renderDock() {
    if (!skills || !duelDock) return;
    const m = match, keys = m && m.seat !== null ? GAMES[m.game]?.keys : null, on = !!keys && isArena(me.f);
    skills.hidden = on; duelDock.hidden = !on;
    const k = on ? m.game : ""; if (k !== dockKey) { dockKey = k; ddKeys.innerHTML = on ? keys.map((x) => `<span class="dk"><span class="caps">${x.keys.map((c) => `<kbd>${esc(c)}</kbd>`).join("")}</span><b>${esc(x.label)}</b></span>`).join("") : ""; }
    const h = on && myHp ? `${Math.max(0, Math.ceil(myHp.hp))}/${myHp.max}` : ""; if (h === hpKey) return; hpKey = h;
    ddHp.hidden = !h; if (!h) return;
    const r = Math.max(0, Math.min(1, myHp.hp / myHp.max));
    ddHp.className = `ddHp${r <= .3 ? " low" : ""}`; ddHp.setAttribute("aria-label", `내 체력 ${Math.ceil(myHp.hp)}`);
    ddHp.innerHTML = `<i aria-hidden="true">♥</i><span class="bar"><b style="width:${r * 100}%;--hp:${r * 100}%"></b></span><em>${Math.max(0, Math.ceil(myHp.hp))}</em>`;
  }

  /* ───── 경기 틀(HUD) · 3·2·1 · 결과 ───── */
  function renderHud() {
    renderDock();
    const m = match; hud.hidden = !m; if (!m) return;
    const g = duelGame(m.game);
    hud.querySelector(".dhName").textContent = `${g.icon} ${g.name}`;
    m.players.forEach((p, i) => { const e = hud.querySelector(`.s${i}`); e.textContent = `${p.name}${m.seat === i ? " (나)" : ""}${p.away ? " · 연결 끊김" : ""}`; e.classList.toggle("me", m.seat === i); });
    stopBar.hidden = !(m.seat === 0 && (m.phase === "countdown" || m.phase === "playing"));
    watchBar.hidden = m.seat !== null; watchBar.firstChild.textContent = `👀 관전 중${m.watchers > 1 ? ` · ${m.watchers}명` : ""} `;
  }
  function showEnd(e: DuelEnd) {
    end = e; const m = match; if (!m) return;
    const title = e.reason === "stopped" ? "경기 끝" : e.seat === null ? "무승부" : m.seat === null ? `${m.players[e.seat].name} 승리` : e.seat === m.seat ? "승리!" : "패배";
    let line = ""; if (run?.result) safe(() => { line = run.result(e) || ""; });
    card.className = `duelResult ${e.seat === null ? "draw" : m.seat === null ? "watch" : e.seat === m.seat ? "win" : "lose"}`;
    card.innerHTML = `<h3>${esc(title)}</h3><p class="drWhy">${esc(DUEL_REASON[e.reason] || e.reason)}${line ? ` · ${esc(line)}` : ""}</p><p class="drBack">곧 원래 자리로 돌아가요</p>`;
    card.hidden = false;
  }
  let lastCount = "";
  function tickHud() {
    const m = match; if (!m) return;
    const t = now(), left = m.startAt - t;
    let c = "";
    if (m.phase === "countdown") c = left > DUEL.COUNTDOWN ? "준비" : String(Math.max(1, Math.ceil(left / 1000)));
    else if (m.phase === "playing" && t - m.startAt < 700) c = "시작!";
    if (c !== lastCount) { lastCount = c; count.hidden = !c; count.textContent = c; if (c) { count.classList.remove("pop"); void count.offsetWidth; count.classList.add("pop"); } }
    const tm = hud.querySelector(".dhTime") as HTMLElement;
    const txt = m.phase === "playing" ? fmtMs(Math.max(0, m.endsAt - t)).replace(/\.\d+$/, "") : m.phase === "countdown" ? "" : "끝";
    if (tm.textContent !== txt) tm.textContent = txt;
    tm.classList.toggle("low", m.phase === "playing" && m.endsAt - t < 10000);
  }
  function tickInbox() {
    const t = Date.now();
    for (const iv of invites.values()) (iv.card.querySelector(".dcBar") as HTMLElement).style.width = `${Math.max(0, (iv.expiresAt - (offset === null ? t : now())) / DUEL.INVITE * 100)}%`;
    if (sent) { const left = Math.max(0, sent.expiresAt - now()); const l = sentChip.querySelector(".dcLeft"); if (l) l.textContent = `${Math.ceil(left / 1000)}초`; (sentChip.querySelector(".dcBar") as HTMLElement).style.width = `${left / DUEL.INVITE * 100}%`; }
  }

  /* ───── 서버 메시지 ───── */
  const STATE_TEXT = { declined: "거절했어요", expired: "답이 없었어요", canceled: "신청을 취소했어요", busy: "지금은 다른 대결이나 신청 중이에요", accepted: "" };
  function setMatch(m: DuelMatch) {
    if (offset === null && typeof m.serverTime === "number") offset = m.serverTime - performance.now();   // 시계를 맞추기 전에는 서버가 보낸 시각으로 대강
    const fresh = !match || match.id !== m.id, phase0 = match?.phase;
    if (fresh && match) stopRun();
    match = { ...m, seat: m.seat ?? null };
    if (fresh) { end = null; card.hidden = true; enter(); }
    if (fresh || phase0 !== match.phase) applyLock();
    renderHud(); if (isArena(me.f)) host.presence();   // 다시 붙은 뒤 첫 위치는 서버가 경기를 찾기 전에 갔을 수 있다
    if (run?.match) safe(() => run.match(match));
  }
  function net(m: any) {
    switch (m.t) {
      case "duel:invited": addInvite(m); return;
      case "duel:invite-state": {
        if (m.role === "from") {   // 내가 보낸 신청
          if (m.state === "pending") { sent = { id: m.id, game: m.game, to: m.to?.name || "크루", expiresAt: m.expiresAt ?? now() + DUEL.INVITE }; showSent(); return; }
          sent = null; showSent(); if (STATE_TEXT[m.state]) { host.note(`${m.to?.name || "상대"}님: ${STATE_TEXT[m.state]}`); host.toast("대결 신청", `${m.to?.name || "상대"}님 · ${STATE_TEXT[m.state]}`, 2400); }
          return;
        }
        if (invites.has(m.id) && m.state !== "pending") { dropInvite(m.id); if (m.state === "canceled" || m.state === "expired") host.note(`${m.from?.name || "크루"}님의 대결 신청이 ${m.state === "expired" ? "만료됐어요" : "취소됐어요"}`); }
        return;
      }
      case "duel:match":
        if (m.phase === "none") { if (match || isArena(me.f)) leave("none"); else if (origin) { origin = null; LS.set("ww.duelBack", null); } return; }
        if (m.phase === "closed") { if (match?.id === m.id) leave("closed"); return; }
        setMatch(m); return;
      case "duel:game": if (match?.id === m.id && run?.message) { const { t, id, ...p } = m; safe(() => run.message(p)); } return;
      case "duel:end": if (match?.id === m.id) showEnd(m); return;
      case "duel:records": host.note(recordsText(m)); return;
      case "duel:error": host.note(m.text || "대결을 할 수 없어요"); host.toast("대결", m.text || "", 2400); return;
    }
  }
  function recordsText(r) {
    const best = Object.entries(r.best || {}).filter(([k]) => k.startsWith("jump:")).map(([k, ms]) => `${JUMP_COURSES.find((c) => `jump:${c.id}` === k)?.name || k} ${fmtMs(ms as number)}`);
    return `${r.mine ? "내" : `${r.name}님`} 전적: ${r.w}승 ${r.l}패 ${r.d}무${best.length ? ` · 점프맵 최고 기록 ${best.join(" · ")}` : ""}`;
  }
  // 신청한 사람(0번 자리)만 경기를 끝낸다. 승패 없이 끝나고 전적에 남기지 않는다
  function stopMatch() {
    if (!match || (match.phase !== "countdown" && match.phase !== "playing")) { host.note("진행 중인 경기가 없어요"); return; }
    if (match.seat !== 0) { host.note(match.seat === null ? "관전 중이에요 · 나가려면 /관전" : "경기는 신청한 사람만 끝낼 수 있어요 · 지고 나가려면 /기권"); return; }
    host.send({ t: "duel:stop" });
  }
  function invite(p: CommandPeer, game: string) {
    if (!host.online()) { host.note("서버에 연결된 뒤에 신청할 수 있어요"); return; }
    if (match) { host.note(match.seat === null ? "관전을 그만둔 뒤에 신청해 주세요 (/관전)" : "경기가 끝난 뒤에 신청해 주세요"); return; }
    host.send({ t: "duel:invite", to: p.id, game });
  }

  return {
    net,
    // 서버 연결: 붙으면 인사(설정 · 지금 경기 맞추기), 끊기면 20초 기다렸다 원래 자리로
    online(up: boolean) {
      if (up) { clearTimeout(offTimer); host.send({ t: "duel:hello", accept }); return; }
      for (const id of [...invites.keys()]) dropInvite(id); sent = null; showSent();
      if (match || isArena(me.f)) { host.note("서버와 연결이 끊겼어요. 곧 다시 붙으면 경기를 이어서 해요"); clearTimeout(offTimer); offTimer = window.setTimeout(() => leave("offline"), DUEL.GRACE); }
    },
    clock(sentAt: number, serverTime: number) { const t = performance.now(), rtt = t - sentAt; if (!Number.isFinite(serverTime) || rtt < 0 || rtt > 20000 || rtt >= bestRtt) return; bestRtt = rtt; offset = serverTime - (sentAt + t) / 2; },
    frame(dt: number, t: number) {
      if (invites.size || sent) tickInbox();
      if (!match) return;
      tickHud();
      if (run?.tick && isArena(me.f)) safe(() => run.tick(dt, t));
    },
    // 엔진 입력보다 먼저(대결 중): 초대장 Y · N, 그다음 종목
    key(e: KeyboardEvent): boolean {
      if (e.type === "keydown" && invites.size && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && (e.code === "KeyY" || e.code === "KeyN")) { answer([...invites.keys()].at(-1), e.code === "KeyY"); return true; }
      if (!run?.key || !isArena(me.f)) return false;
      let r = false; safe(() => { r = !!run.key(e); }); return r && e.type === "keydown";
    },
    pointer(e: MouseEvent): boolean {
      if (!run?.pointer || !isArena(me.f)) return false;
      let r = false; safe(() => { r = !!run.pointer(e); }); if (r && e.type === "mousedown") eatAt = performance.now(); return r;
    },
    ateClick() { const r = performance.now() - eatAt < 800; eatAt = 0; return r; },   // 종목이 먹은 클릭이면 엔진은 걷기 · 고르기를 하지 않는다
    active: () => !!run, playing: () => match?.phase === "playing", modal: () => !pick.hidden,
    // presence: 대결장에 있는 동안 경기 방 번호. 서버가 확인하고 방 이름(rm)을 duel:<ar>로 정한다
    ar: () => (isArena(me.f) ? match?.ar ?? lastAr : null),
    rm() { const a = this.ar(); return a ? `duel:${a}` : ""; },
    role: () => (match ? (match.seat === null ? 2 : 1) : 0),
    // 대결장에서는 같은 경기 방(ar) 사람만 보인다
    hides: (s: any) => s.f === me.f && isArena(me.f) && (s.ar !== (match?.ar ?? lastAr) || (match?.seat != null && s.dr === 2)),   // 다른 경기 방 · 선수 화면의 관전자
    fired(dir: number, lift: number, pitch: number | null = null) { if (hooks.fire.length) { const s = { x: me.x, y: me.y, dir, lift, pitch, at: now() }; for (const fn of hooks.fire) safe(() => fn(s)); } },
    bullet(w: any, pos: THREE.Vector3) { if (!hooks.bullet.length) return false; const b = bulletOf(w, pos); let hit = false; for (const fn of hooks.bullet) safe(() => { if (fn(b)) hit = true; }); return hit; },
    bulletHit(w: any, target: any, pos: THREE.Vector3) { if (!hooks.hit.length) return false; const b = bulletOf(w, pos, target); let eat = false; for (const fn of hooks.hit) safe(() => { if (fn(b)) eat = true; }); return eat; },
    // 채팅 명령어(/대결 · /수락 · /거절 · /관전 · /종료 · /기권 · /전적)
    commands: {
      games: DUEL_GAMES,
      invite(p: CommandPeer, game?: string) { if (!game && !match) openPick(p); else invite(p, game); },
      watch(p: CommandPeer | null) {
        if (!p) { if (match?.seat === null) host.send({ t: "duel:watch" }); else host.note(match ? "선수는 /기권으로 나가요" : "관전 중이 아니에요"); return; }
        if (match?.seat !== null && match) { host.note("경기 중에는 관전할 수 없어요"); return; }
        host.send({ t: "duel:watch", peer: p.id });
      },
      answer(ok: boolean, name?: string) {
        const q = (name || "").trim().toLowerCase(), list = [...invites.values()], iv = q ? list.filter((i) => i.from.name.toLowerCase().includes(q)).at(-1) : list.at(-1);
        if (!iv) { host.note(q ? `${name}님이 보낸 대결 신청이 없어요` : "받은 대결 신청이 없어요"); return; }
        answer(iv.id, ok);
      },
      stop: () => stopMatch(),
      forfeit() { if (!match || match.seat === null || match.phase === "result") { host.note("진행 중인 경기가 없어요"); return; } host.send({ t: "duel:forfeit" }); },
      records(p: CommandPeer | null) { if (p && !p.u) { host.note(`${p.name}님의 전적은 볼 수 없어요`); return; } host.send({ t: "duel:records", ...(p ? { u: p.u, name: p.name } : {}) }); },
    },
  };
}
export type DuelUi = ReturnType<typeof mountDuel>;
