// 사격 대결(22층) 브라우저 쪽: 엄폐물 그리기, 선수에게 종이 AK-47 쥐여 주기, 내 총알이 상대에게 닿으면 서버로 알리기, 체력 · 라운드 HUD · 머리 위 체력 막대
// FPS 1:1처럼: 이 층은 이름표를 숨긴다 · 종이 AK(1인칭만 · 연사 · 반동 · 탄창 · 장전 · 조준)는 ak.ts(과녁 사격과 같이 쓴다)
// 선수 화면엔 상대 체력이 안 보인다(내 체력 · 탄창 · 라운드 점수 · 남은 시간만). 관전자는 두 선수 체력과 머리 위 막대를 본다
// 명중은 서버(server/duel/games/shoot.js)가 쏜 위치 · 방향 · 시각과 상대의 위치 기록으로 정한다. 여기서는 맞은 쪽 엔진 처리(hc)를 막고, 서버가 받은 것만 휘청이게 한다
import type { DuelGame, DuelSeat } from "../client";
import { registerFurn } from "../furniture";
import { SHOOT } from "../arena/shoot.mjs";
import { esc } from "../shared.mjs";
import { mountAK } from "./ak";

/* ───── 그리기: 엄폐물(1.2m, 총알은 1.25m 아래를 막는다) ───── */
registerFurn("scover", (G, o, k) => {
  if (o.look === "barrel") { // 파란 통: 위아래 테두리
    const r = Math.min(k.w, k.d) / 2 - .08;
    k.cyl(G, r, r, 1.2, 0x5B8DEF, k.x, 0, k.z, { seg: 20 });
    for (const y of [.22, .88]) k.cyl(G, r + .03, r + .03, .08, 0x2E2C38, k.x, y, k.z, { seg: 20, line: 0 });
    return;
  }
  if (o.look === "wall") { // 종이벽: 크라프트지 판에 빨간 띠
    k.box(G, k.w - .12, 1.2, k.d - .12, 0xE7D5B5, k.x, 0, k.z, { line: .02 });
    k.box(G, k.w - .08, .1, k.d - .08, 0xE46F6F, k.x, 1.12, k.z, { line: .01 });
    return;
  }
  // 나무 상자: 큰 것은 두 단, 옆면에 가로대
  k.box(G, k.w - .1, 1.2, k.d - .1, 0xC99A62, k.x, 0, k.z, { line: .02 });
  k.box(G, k.w - .02, .08, k.d - .02, 0xA87943, k.x, o.big ? .58 : .55, k.z, { line: .01 });
  k.box(G, k.w - .06, .06, k.d - .06, 0xE2BC86, k.x, 1.2, k.z, { line: .01 });
});

const COLOR = [0xF15B5B, 0x2F80ED], CSS = ["#F15B5B", "#2F80ED"];   // 0번 자리 빨강(북서) · 1번 자리 파랑(남동)
const BLOCK = new Set(["Digit1", "Digit2", "Digit3", "Digit4", "Numpad1", "Numpad2", "Numpad3", "Numpad4", "KeyZ"]);   // 경기 중 선수: 총을 내려놓게 하는 동작 키(그리기 · 인사 · 하트 · 춤 · 인벤토리 칸)
const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// 맞힌 소리(FPS처럼): 몸은 짧은 '틱', 머리는 높은 '띵' 두 번. 첫 소리 때 오디오를 연다(이미 클릭해 쏜 뒤라 브라우저가 막지 않는다)
let audio: AudioContext | null = null;
function ping(head: boolean) {
  try {
    audio ||= new AudioContext(); if (audio.state === "suspended") void audio.resume();
    const t0 = audio.currentTime;
    for (const [f, at, len, vol] of head ? [[2400, 0, .07, .16], [3600, .05, .09, .12]] : [[1500, 0, .045, .12]]) {
      const o = audio.createOscillator(), g = audio.createGain(); o.type = head ? "triangle" : "square"; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t0 + at); g.gain.exponentialRampToValueAtTime(.001, t0 + at + len); o.connect(g).connect(audio.destination); o.start(t0 + at); o.stop(t0 + at + len + .02);
    }
  } catch { }
}

/* ───── 경기 ───── */
export const game: DuelGame = {
  id: "shoot",
  keys: [{ label: "쏘기(누르고 있기)", keys: ["좌클릭", "F"] }, { label: "조준", keys: ["우클릭"] }, { label: "장전", keys: ["R"] }, { label: "점프", keys: ["Space"] }, { label: "달리기", keys: ["Shift"] }],
  start(ctx) {
    const { THREE } = ctx, seat = ctx.seat, foe = (seat === null ? null : 1 - seat) as DuelSeat | null;
    const st = () => ctx.match.state || {};
    const live = () => ctx.match.phase === "playing" && st().phase === "go" && ctx.now() >= st().at;
    const box = document.createElement("div"); box.className = "shootHud"; ctx.hud.append(box);
    const big = document.createElement("div"); big.className = "shootCount"; big.hidden = true; big.setAttribute("aria-live", "assertive"); document.body.append(big);
    const mark = document.createElement("div"); mark.className = "shootMark"; mark.hidden = true; document.body.append(mark);
    const flash = document.createElement("div"); flash.className = "shootFlash"; document.body.append(flash);
    // 조준점 둘레 히트마커(X)와 데미지 숫자: 맞힌 순간 내 화면에서 바로(몸 흰색 · 머리 빨강), 쓰러뜨렸으면 서버가 받은 뒤 크게
    const hitX = document.createElement("div"); hitX.className = "shootHitX"; hitX.hidden = true; document.body.append(hitX);
    const dmgNum = document.createElement("div"); dmgNum.className = "shootDmg"; dmgNum.hidden = true; document.body.append(dmgNum);
    let hitT = 0;
    function hitmark(kind: "body" | "head" | "kill", text: string) {
      hitX.className = `shootHitX ${kind}`; hitX.hidden = false; void hitX.offsetWidth; hitX.classList.add("on");
      dmgNum.textContent = text; dmgNum.className = `shootDmg ${kind}`; dmgNum.hidden = false; void dmgNum.offsetWidth; dmgNum.classList.add("on"); hitT = performance.now();
    }
    let key = "", bigKey = "", n = st().n ?? 1, armedAt = -9, told = false, markT = 0;
    const ak = mountAK(ctx);
    const shots: { dir: number; lift: number; at: number; used?: boolean }[] = [];
    ctx.tags(false);   // 이 층은 머리 위 이름표를 숨긴다

    // 머리 위 체력 막대(엄폐물 뒤에서는 가려진다). 캐릭터는 외형이 바뀌면 새로 만들어지므로 매 프레임 위치만 따라간다
    const bars = [0, 1].map((s) => {
      const g = new THREE.Group(), bgM = new THREE.MeshBasicMaterial({ color: 0x111118 }), fillM = new THREE.MeshBasicMaterial({ color: COLOR[s] });
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(.92, .14), bgM), fill = new THREE.Mesh(new THREE.PlaneGeometry(.84, .08), fillM);
      fill.position.z = .002; g.add(bg, fill); g.renderOrder = 7; g.visible = false; ctx.scene.add(g);
      return { g, fill, mats: [bgM, fillM], geos: [bg.geometry, fill.geometry] };
    });
    function paintBars() {
      const hp = st().hp || [SHOOT.HP, SHOOT.HP];
      bars.forEach((b, s) => {
        const d = ctx.doll(s as DuelSeat), show = !!d && d.root.visible && ctx.me.f === ctx.floor && seat === null && ctx.match.phase !== "countdown";   // 관전자만(선수는 상대 체력을 모른다)
        b.g.visible = show; if (!show) return;
        b.g.position.copy(d.root.position); b.g.position.y += 1.78; b.g.quaternion.copy(ctx.camera.quaternion);
        const k = Math.max(.001, hp[s] / SHOOT.HP); b.fill.scale.x = k; b.fill.position.x = -.42 * (1 - k);
      });
    }
    function paintHud() {
      const m = ctx.match, s = st(), hp = s.hp || [SHOOT.HP, SHOOT.HP], wins = s.wins || [0, 0];
      const pips = (w: number) => Array.from({ length: SHOOT.WIN }, (_, i) => `<i class="${i < w ? "on" : ""}"></i>`).join("");
      const left = s.phase === "go" && m.phase === "playing" ? Math.max(0, Math.ceil((m.endsAt - ctx.now()) / 1000)) : null, clock = left === null ? "" : `<b class="st${left <= 10 ? " low" : ""}">${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}</b>`;
      const html = seat !== null   // 선수: 라운드 · 남은 시간 · 두 사람이 이긴 라운드(나 : 상대)만
        ? `<b class="sr">${s.round || 1}라운드${s.again ? " 다시" : ""}</b>${clock}<span class="sp me" style="--c:${CSS[seat]}"><em>나</em><span class="w">${pips(wins[seat])}</span></span><span class="sp" style="--c:${CSS[1 - seat]}"><em>상대</em><span class="w">${pips(wins[1 - seat])}</span></span>`
        : `<b class="sr">${s.round || 1}라운드${s.again ? " 다시" : ""}</b>${clock}${m.players.map((p, i) => `<span class="sp" style="--c:${CSS[i]}"><em>${esc(p.name)}</em><span class="hp"><b style="width:${hp[i] / SHOOT.HP * 100}%"></b></span><span class="hn">${hp[i]}</span><span class="w">${pips(wins[i])}</span></span>`).join("")}`;
      if (html !== key) { key = html; box.innerHTML = html; }
      if (seat === null) return;
      ctx.myHp(hp[seat], SHOOT.HP);   // 내 체력은 아래 독에(탄창은 ak.ts가 오른쪽 아래에)
    }
    // 라운드 사이 3·2·1(첫 라운드는 틀의 3·2·1)
    function paintCount() {
      const m = ctx.match, s = st(), left = (s.at ?? 0) - ctx.now();
      let c = "", sub = "";
      if (m.phase === "playing" && s.phase === "ready") { c = String(Math.max(1, Math.ceil(left / 1000))); sub = `${s.round}라운드${s.again ? " 다시" : ""}`; }
      else if (m.phase === "playing" && s.phase === "go" && (s.n ?? 1) > 1 && -left < 700) c = "쏴요!";
      const k = c + sub; if (k === bigKey) return; bigKey = k; big.hidden = !c;
      big.innerHTML = c ? `${sub ? `<small>${sub}</small>` : ""}${c}` : "";
      if (c) { big.classList.remove("pop"); void big.offsetWidth; big.classList.add("pop"); }
    }
    function pop(el: HTMLElement, text: string, cls = "") { el.textContent = text; el.className = `shootMark ${cls}`; el.hidden = false; markT = performance.now(); }

    if (ctx.mine) {
      // 내가 쏜 발을 기억했다가, 그 총알이 상대에게 닿으면 쏜 때 · 방향과 함께 서버로 알린다(서버가 내 위치 기록에서 그 발을 찾는다)
      ctx.onFire((s) => {
        if (!live()) return; shots.push({ dir: s.dir, lift: s.lift, at: s.at }); if (shots.length > 24) shots.shift();
      });
    }
    // 사람에게 닿은 총알은 모두 엔진 기본 처리(맞은 사람이 hc로 알림)를 막는다. 휘청임은 서버가 받은 hit에서
    ctx.onBulletHit((b) => {
      if (ctx.mine && b.mine && b.target === foe && live()) {
        const dir = Math.atan2(b.vel.x, b.vel.z), s = shots.filter((x) => !x.used && turn(x.dir, dir) < 1e-3).at(-1);
        const d = ctx.doll(foe), hy = d ? b.pos.y - d.root.position.y : 0, head = hy >= SHOOT.HEAD_Y;   // 맞은 높이(상대 발에서 m)
        if (s) { s.used = true; ctx.send({ k: "hit", to: foe, dir: s.dir, at: s.at, lift: s.lift, hy: Math.round(hy * 100) / 100, ...(head ? { head: 1 } : {}) }); hitmark(head ? "head" : "body", head ? `헤드샷 -${Math.round(SHOOT.DMG * SHOOT.HEAD)}` : `-${SHOOT.DMG}`); ping(head); }
      }
      return true;
    });

    return {
      tick(_dt, t) {
        const m = ctx.match, s = st(), on = m.phase === "countdown" || m.phase === "playing";
        if (ctx.mine) {
          if (on && ctx.me.act !== "gun" && t - armedAt > .5) { armedAt = t; ctx.act("gun"); }   // 경기 동안은 늘 총을 든다
          if (on && !told) { told = true; ctx.toast("종이 AK-47을 들었어요", ctx.touch ? `🎆를 누르면 쏴요. 탄창 ${SHOOT.MAG}발, 다 쓰면 저절로 장전해요.` : `누르고 있으면 연사(왼쪽 클릭 · F), R로 장전. 탄창 ${SHOOT.MAG}발이에요.`, 3600); }
          if (m.phase === "playing") ctx.lock(s.phase === "ready");   // 라운드 사이 3·2·1 동안은 제자리
          ctx.doubleJump(false); ak.tick(on, live(), ctx.me.running ? .6 : .75);   // 엄폐물을 넘나드는 더블 점프는 막고, 조준할 틈이 생기게 느리게(걷기 3.2→2.4, 달리기 7.3→4.4칸/초)
        } else ctx.canFire(false);   // 관전자는 쏘지 않는다(경기에 영향 없음)
        paintHud(); paintCount(); paintBars();
        if (!mark.hidden && performance.now() - markT > 650) mark.hidden = true;
        if (!hitX.hidden && performance.now() - hitT > 420) { hitX.hidden = true; dmgNum.hidden = true; }
      },
      match(m) {
        const s = m.state || {};
        if ((s.n ?? 1) !== n) { // 새 라운드: 체력이 차고 둘 다 자기 구석으로
          n = s.n ?? 1; shots.length = 0; ak.refill();
          if (ctx.mine && s.phase === "ready") { const sp = m.spawns[seat]; ctx.place(sp[0], sp[1], sp[2]); }
        }
      },
      key(e) {
        const on = !!ctx.mine && (ctx.match.phase === "countdown" || ctx.match.phase === "playing"); if (!on) return false;
        return ak.key(e, on) || (e.type === "keydown" && BLOCK.has(e.code));
      },
      pointer(e) { return ak.pointer(e, ctx.match.phase === "countdown" || ctx.match.phase === "playing"); },
      message(p) {
        if (p.k === "hit") {
          ctx.hitReact(p.to, p.dir);
          if (p.to === seat) { flash.className = `shootFlash${p.head ? " head" : ""}`; void flash.offsetWidth; flash.classList.add("on"); if (p.head) ctx.toast("헤드샷을 맞았어요", `-${p.dmg}`, 900); }   // 머리에 맞으면 더 진하게
          else if (p.seat === seat && !(p.hp?.[p.to] > 0)) { hitmark("kill", p.head ? "헤드샷! 쓰러뜨렸어요" : "쓰러뜨렸어요"); pop(mark, "처치!", "hit"); }
        }
        if (p.k === "miss") console.debug("[shoot] 서버가 받지 않은 명중", p.why);   // 화면 확인 때 판정 너그러움을 맞추려고 남긴다
        if (p.k === "round") {
          const w = p.seat as DuelSeat | null, who = w === null ? "" : ctx.match.players[w]?.name || "";
          const why = p.why === "ko" ? "체력을 다 깎았어요" : p.why === "time" ? "시간이 다 돼 체력이 많은 쪽이 가져가요" : "체력이 같아 이 라운드를 다시 해요";
          const head = w === null ? `${p.round}라운드 무승부` : seat === null ? `${who}님이 ${p.round}라운드를 가져갔어요` : w === seat ? `${p.round}라운드 승리!` : `${p.round}라운드 패배`;
          ctx.toast(head, `${why} · ${p.wins[0]} : ${p.wins[1]}`, 2400);
          ctx.note(`사격 대결 ${head} (${p.wins.join(" : ")})`);
        }
      },
      result(e) {
        const w = e.summary?.wins; if (!w) return "";
        return seat === null ? `라운드 ${w[0]} : ${w[1]}` : `라운드 ${w[seat]} : ${w[1 - seat]}`;
      },
      stop() {
        box.remove(); big.remove(); mark.remove(); flash.remove(); hitX.remove(); dmgNum.remove(); ak.stop(); ctx.tags(true);
        for (const b of bars) { b.g.removeFromParent(); b.mats.forEach((x) => x.dispose()); b.geos.forEach((x) => x.dispose()); }
        if (ctx.mine && ctx.me.act === "gun") ctx.act(null);   // 경기가 끝나면 총을 넣는다
      },
    };
  },
};
