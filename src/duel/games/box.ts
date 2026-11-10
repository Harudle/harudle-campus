// 복싱(24층) 브라우저 쪽: 링 · 로프 · 관전 의자 그리기, 글러브와 주먹 · 가드 자세, 체력 막대, 모바일 버튼 셋
// 맞았는지(거리 · 앞쪽 각도 · 간격 · 가드)는 서버(server/duel/games/box.js)가 정한다. 브라우저는 주먹을 내밀고 "냈다"고 알릴 뿐이다
// 주먹 · 가드 자세는 서버가 모두에게 돌려주는 punch · guard로 각자 화면에서 같은 팔을 움직인다(ctx.arms)
import type * as THREE from "three";
import type { DuelGame, DuelSeat } from "../client";
import { registerFurn } from "../furniture";
import { BOX, BOX_RING } from "../arena/box.mjs";
import { inside, clamp, lerp } from "../../engine/world";
import { esc } from "../shared.mjs";

const COL = [0x2F6FDB, 0xD9534F];   // 자리 색(경기 틀과 같게): 0 파랑 코너 · 1 빨강 코너
const NAME = { jab: "잽", str: "스트레이트" };

/* ───── 그리기: 링(매트 · 코너 기둥 · 로프 세 줄)과 관전 의자 ───── */
let matTex: THREE.Texture | null = null;
const ROPES: [number, number][] = [[.55, 0xE46F6F], [.8, 0xFFFFFF], [1.05, 0x4A7FE0]];
registerFurn("boxring", (G, o, k) => {
  const half = k.w / 2 - k.S / 2, side = half * 2;   // 로프는 링 난간(방 벽 가운데) 위에 건다
  matTex ||= k.canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#F4EBD6"; g.fillRect(0, 0, w, h); g.strokeStyle = "#D9C7A2"; g.lineWidth = 10; g.strokeRect(24, 24, w - 48, h - 48);
    g.fillStyle = "#FFFDF6"; g.strokeStyle = "#111118"; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, h / 2, 120, 0, 7); g.fill(); g.stroke();
    g.fillStyle = "#111118"; g.font = `700 64px ${k.HAND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("하루들", w / 2, h / 2 - 28); g.fillText("복싱", w / 2, h / 2 + 40);
  });
  k.box(G, side, .03, side, 0xFFFFFF, k.x, 0, k.z, { line: 0, mat: k.toon(0xFFFFFF, { map: matTex }), cast: false });
  for (const [sx, sz, c] of [[-1, -1, COL[0]], [1, -1, 0xF4F2FA], [-1, 1, 0xF4F2FA], [1, 1, COL[1]]]) { // 북서 파랑 · 남동 빨강 코너, 나머지는 흰 코너
    const x = k.x + sx * half, z = k.z + sz * half;
    k.cyl(G, .07, .08, 1.3, 0x2E2C38, x, 0, z, { line: .012 });
    k.box(G, .2, .55, .2, c, x, .7, z, { line: .015 });
  }
  for (const [y, c] of ROPES) for (const s of [-1, 1]) {
    k.box(G, side, .045, .045, c, k.x, y, k.z + s * half, { line: .006, cast: false });
    k.box(G, .045, .045, side, c, k.x + s * half, y, k.z, { line: .006, cast: false });
  }
});
registerFurn("boxbench", (G, o, k) => { // 나무 관전 의자: 통짜 받침 + 좌판(올라서는 윗면)
  k.box(G, k.w - .12, o.top - .07, k.d - .12, 0x8A6A4F, k.x, 0, k.z, { line: .015 });
  k.box(G, k.w, .07, k.d, 0xD9B07A, k.x, o.top - .07, k.z, { line: .015 });
});

/* ───── 글러브 · 팔 자세 ───── */
// Avatar(harudle/Avatar.tsx)의 팔: 어깨(armL이 캐릭터 오른팔, -x 쪽) · 길이. 캐릭터는 0.68배로 그린다(scene/Dolls.tsx AVATAR_SCALE)
const AV = .68, ARM = .38, SHOULDER = [[-.14, .92, 0], [.14, .92, 0]];
// 팔 각도 [앞으로 x, 안쪽 z]: 서기(가슴 앞) · 가드(얼굴 앞) · 뻗기(어깨 높이로 쭉). 손 0 오른손(스트레이트) · 1 왼손(잽)
const STANCE = [-1.0, .42], GUARD = [-2.55, .3], REACH = [-1.55, .1];
const HAND_OF = { jab: 1, str: 0 }, DUR = { jab: .26, str: .36 };
// 1인칭 글러브(카메라 기준 자리): 서기 · 가드 · 뻗기, x는 오른손 기준(왼손은 반대)
const FP = { stance: [.2, -.24, -.5], guard: [.1, -.08, -.36], reach: [.06, -.12, -.8] };

export const game: DuelGame = {
  id: "box",
  keys: [{ label: "잽", keys: ["J", "좌클릭"] }, { label: "스트레이트", keys: ["K", "우클릭"] }, { label: "가드(누르고 있기)", keys: ["Shift", "L"] }, { label: "이동", keys: ["WASD"] }],
  start(ctx) {
    const T = ctx.THREE, k = ctx.kit, now = () => performance.now() / 1000;
    const seats: DuelSeat[] = [0, 1];
    // 선수마다: 가드(서버가 알려 준 것, 나는 내가 정한 것) · 가드 정도(부드럽게) · 마지막 주먹(손 · 시작 · 길이)
    const pose = seats.map(() => ({ guard: false, gk: 0, hand: -1, t0: -9, dur: 1 }));
    let hp = [BOX.HP, BOX.HP], flash = [0, 0];
    const fromState = () => { const s = ctx.match.state || {}; if (Array.isArray(s.hp)) hp = [...s.hp]; for (const i of seats) if (i !== ctx.seat && s.guard) pose[i].guard = !!s.guard[i]; };
    fromState();
    const ext = (p: (typeof pose)[number], hand: number, t: number) => { if (p.hand !== hand) return 0; const e = (t - p.t0) / p.dur; return e < 0 || e >= 1 ? 0 : e < .35 ? e / .35 : 1 - (e - .35) / .65; };
    const startPunch = (s: number, kind: string) => { const p = pose[s]; p.hand = HAND_OF[kind] ?? 1; p.t0 = now(); p.dur = DUR[kind] ?? .3; };

    // 글러브: 선수마다 둘. 캐릭터의 turn(방향만 도는 묶음)에 붙여 팔 끝을 따라간다. 캐릭터는 외형이 바뀌면 새로 만들어지니 매 프레임 붙어 있는지 본다
    const made: THREE.Object3D[] = [];
    const glove = (seat: number, hand: number) => {
      const G = new T.Group(), c = COL[seat], side = hand === 0 ? 1 : -1;   // 엄지는 안쪽(몸 가운데 쪽)
      k.ball(G, .12, c, 0, 0, 0, { line: .02 }); k.ball(G, .05, c, side * .09, .03, .06, { line: .015 });
      k.cyl(G, .075, .07, .1, 0xFFFFFF, 0, .07, 0, { line: .015 });   // 손목 띠(팔 쪽)
      made.push(G); return G;
    };
    const holders = seats.map((s) => { const g = new T.Group(); g.scale.setScalar(AV); const hands = [glove(s, 0), glove(s, 1)]; g.add(...hands); return { g, hands }; });
    const fp = [glove(ctx.seat ?? 0, 0), glove(ctx.seat ?? 0, 1)]; for (const g of fp) { g.scale.setScalar(.6); g.visible = false; ctx.scene.add(g); }
    const eu = new T.Euler(), v = new T.Vector3(), q = new T.Quaternion(), CUFF = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);

    /* ───── 맞은 숫자(-8)가 머리 위로 떠오른다 ───── */
    const texs = new Map<string, THREE.Texture>(), pops: { s: THREE.Sprite; t0: number }[] = [];
    function pop(seat: number, text: string, guard: boolean) {
      const d = ctx.doll(seat as DuelSeat); if (!d?.root.visible) return;
      const key = `${text}|${guard}`;
      if (!texs.has(key)) texs.set(key, k.canvasTex(192, 96, (g, w, h) => { g.font = `700 64px ${k.HAND}`; g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = 10; g.strokeStyle = "#111118"; g.strokeText(text, w / 2, h / 2); g.fillStyle = guard ? "#C9D6EE" : "#FFD43B"; g.fillText(text, w / 2, h / 2); }));
      const s = new T.Sprite(new T.SpriteMaterial({ map: texs.get(key), transparent: true, depthTest: false })); s.scale.set(.8, .4, 1); s.renderOrder = 10;
      d.root.getWorldPosition(s.position); s.position.y += 1.35; ctx.scene.add(s); pops.push({ s, t0: now() });
    }

    /* ───── 체력 막대(경기 틀 안) ───── */
    const box = document.createElement("div"); box.className = "boxHud"; ctx.hud.append(box);
    let key = "";
    function paint() {
      const m = ctx.match, t = now();
      if (ctx.mine) ctx.myHp(hp[ctx.seat], BOX.HP);   // 내 체력은 아래 독에도(조작 키도 독에)
      const html = seats.map((s) => `<div class="bxP s${s}${s === ctx.seat ? " me" : ""}${t - flash[s] < .3 ? " hit" : ""}"><em>${s === ctx.seat ? "나" : esc(m.players[s]?.name)}${pose[s].guard ? " 🛡️" : ""}</em><span class="bxBar"><i style="width:${clamp(hp[s] / BOX.HP * 100, 0, 100)}%"></i></span><b>${Math.ceil(hp[s])}</b></div>`).join("");
      if (html !== key) { key = html; box.innerHTML = html; }
    }

    /* ───── 내 입력: 잽 · 스트레이트 · 가드 ───── */
    const held = new Set<string>(); let touchGuard = false, sentGuard = false, last = { jab: -9, str: -9 }, lastAny = -9;
    const wantGuard = () => held.size > 0 || touchGuard;
    function punch(kind: "jab" | "str") {
      if (!ctx.mine || ctx.match.phase !== "playing" || wantGuard()) return;   // 가드를 올린 채로는 못 친다
      const t = now(); if (t - last[kind] < BOX.PUNCH[kind].gap / 1000 || t - lastAny < BOX.GAP / 1000) return;
      last[kind] = lastAny = t; startPunch(ctx.seat, kind);
      if (inside()) { // 들어가서 볼 때는 보는 쪽(카메라)으로 몸을 돌려 친다(엔진은 걸을 때만 방향을 바꾼다). 종이 총이 겨눈 쪽을 보는 것과 같게
        ctx.camera.getWorldDirection(v); const h = Math.atan2(v.x, v.z), d = Math.atan2(Math.sin(h - ctx.me.h), Math.cos(h - ctx.me.h));
        if (Math.abs(d) > .05 && ctx.me.f === ctx.floor) { ctx.place(ctx.me.x, ctx.me.y, h); return void ctx.send({ k: "punch", kind }); }   // place가 위치를 이미 보냈다
      }
      ctx.sync(); ctx.send({ k: "punch", kind });   // 위치 · 방향을 먼저 보내야 서버가 그 자리에서 판정한다
    }
    const onBlur = () => { held.clear(); touchGuard = false; };
    addEventListener("blur", onBlur);

    // 모바일: 오른쪽 아래(달리기 · 점프 위)에 가드 · 잽 · 스트레이트
    let pad: HTMLElement | null = null;
    if (ctx.mine && ctx.touch) {
      pad = document.createElement("div"); pad.className = "boxPad"; pad.setAttribute("role", "group"); pad.setAttribute("aria-label", "복싱 조작");
      pad.innerHTML = `<button type="button" class="mBtn md" data-b="guard">가드</button><button type="button" class="mBtn md" data-b="jab">잽</button><button type="button" class="mBtn lg" data-b="str">스트<br>레이트</button>`;
      const gb = pad.querySelector<HTMLElement>("[data-b=guard]");
      pad.addEventListener("pointerdown", (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-b]"); if (!b) return; e.preventDefault();
        if (b.dataset.b === "guard") { touchGuard = true; gb.classList.add("on"); try { b.setPointerCapture(e.pointerId); } catch { } }
        else punch(b.dataset.b as "jab" | "str");
      });
      const up = () => { touchGuard = false; gb.classList.remove("on"); };
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) gb.addEventListener(ev, up);
      pad.addEventListener("contextmenu", (e) => e.preventDefault());   // 길게 눌러도 메뉴가 뜨지 않게
      document.body.append(pad);
    }
    if (ctx.mine) { ctx.canFire(false); if (ctx.me.act) ctx.act(null); }   // 종이 총 · 춤은 넣는다(팔을 복싱 자세로 쓴다)

    // 링 밖으로 넘어가면(점프로 로프를 넘었을 때) 되돌린다. 관전자는 링 안에 들어오면 관전 자리로
    function keepIn() {
      const m = ctx.me, r = BOX_RING; if (m.f !== ctx.floor || m.jz > .02) return;
      const out = m.x < r.x - .3 || m.x > r.x + r.w + .3 || m.y < r.y - .3 || m.y > r.y + r.h + .3;
      if (ctx.mine && out) ctx.place(clamp(m.x, r.x + .4, r.x + r.w - .4), clamp(m.y, r.y + .4, r.y + r.h - .4), m.h);
      else if (!ctx.mine && !out) { const w = ctx.match.watch; let best = w[0]; for (const s of w) if (Math.hypot(s[0] - m.x, s[1] - m.y) < Math.hypot(best[0] - m.x, best[1] - m.y)) best = s; if (best) ctx.place(best[0], best[1], best[2]); }
    }

    return {
      tick(dt) {
        const t = now(), m = ctx.match, playing = m.phase === "playing";
        if (ctx.mine) {
          const g = playing && wantGuard();
          if (g !== sentGuard) { sentGuard = g; ctx.send({ k: "guard", on: g }); }
          pose[ctx.seat].guard = g;
          ctx.speed((g ? .5 : 1) * (ctx.me.running ? .5 : 1));   // 가드 중엔 느리게. 링이 좁아 달리기는 걷기 빠르기쯤으로
        }
        keepIn();
        const myDoll = ctx.mine ? ctx.doll(ctx.seat) : null, fpOn = !!myDoll && !myDoll.root.visible && m.phase !== "result";   // 내 몸이 안 보이면(1인칭) 글러브만 화면 앞에
        for (const s of seats) {
          const p = pose[s], h = holders[s], d = ctx.doll(s);
          p.gk += ((p.guard ? 1 : 0) - p.gk) * Math.min(1, dt * 14);
          const arm = [0, 1].map((hand) => { const e = ext(p, hand, t), a = STANCE.map((x, i) => lerp(lerp(x, GUARD[i], p.gk), REACH[i], e)); return { x: a[0], z: hand === 0 ? a[1] : -a[1], e }; });
          ctx.arms(s, [arm[0].x, arm[0].z, arm[1].x, arm[1].z]);
          if (!d) { h.g.removeFromParent(); continue; }
          if (h.g.parent !== d.turn) d.turn.add(h.g);
          arm.forEach((a, hand) => { const G = h.hands[hand]; eu.set(a.x, 0, a.z); v.set(0, -(ARM + .05 + a.e * .1), 0).applyEuler(eu); G.position.set(SHOULDER[hand][0] + v.x, SHOULDER[hand][1] + v.y, SHOULDER[hand][2] + v.z); G.rotation.copy(eu); });
          if (s === ctx.seat) fp.forEach((G, hand) => {
            G.visible = fpOn; if (!fpOn) return;
            const e = arm[hand].e, sx = hand === 0 ? 1 : -1, b = FP.stance.map((x, i) => lerp(lerp(x, FP.guard[i], p.gk), FP.reach[i], e));
            G.position.copy(ctx.camera.localToWorld(v.set(b[0] * sx, b[1], b[2]))); G.quaternion.copy(ctx.camera.getWorldQuaternion(q)).multiply(CUFF);
          });
        }
        for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i], e = t - p.t0; p.s.position.y += dt * .7; p.s.material.opacity = clamp(1.6 - e * 2, 0, 1); if (e > .8) { p.s.removeFromParent(); p.s.material.dispose(); pops.splice(i, 1); } }
        paint();
      },
      message(p) {
        const s = p.seat; if (s !== 0 && s !== 1) return;
        if (p.k === "guard") { if (s !== ctx.seat) pose[s].guard = !!p.on; return; }
        if (p.k !== "punch") return;
        if (s !== ctx.seat) startPunch(s, p.kind);   // 내 주먹은 누른 순간 이미 나갔다
        if (!p.hit) return;
        const foe = 1 - s as DuelSeat; if (Array.isArray(p.hp)) hp = [...p.hp];
        const a = ctx.pos(s), b = ctx.pos(foe);
        ctx.hitReact(foe, a && b ? Math.atan2(b.x - a.x, b.y - a.y) : 0); flash[foe] = now();
        pop(foe, `-${p.dmg}`, !!p.g);
      },
      match() { fromState(); },
      key(e) {
        if (!ctx.mine) return false;
        const c = e.code, down = e.type === "keydown";
        if (c === "ShiftLeft" || c === "ShiftRight" || c === "KeyL") { if (down) held.add(c); else held.delete(c); return true; }   // 복싱 중 Shift는 달리기가 아니라 가드
        if (!down) return false;
        if (c === "KeyJ" || c === "KeyK") { if (!e.repeat) punch(c === "KeyJ" ? "jab" : "str"); return true; }
        return c === "Space" && ctx.match.phase === "playing";   // 링에서는 점프하지 않는다(로프를 넘지 않게)
      },
      pointer(e) {
        if (!ctx.mine || ctx.touch || e.type !== "mousedown") return false;
        if (e.button === 2) { punch("str"); return true; }
        if (e.button === 0 && (document.pointerLockElement || !inside())) { punch("jab"); return true; }   // 들어가서 볼 때 커서가 풀려 있으면 첫 클릭은 엔진이 마우스를 고정한다
        return false;
      },
      result(e) {
        const h = e.summary?.hp; if (!Array.isArray(h)) return "";
        const line = `체력 ${Math.ceil(h[0])} : ${Math.ceil(h[1])}`;
        return e.reason === "ko" ? `${NAME[e.summary.kind] || "주먹"} 한 방! · ${line}` : line;
      },
      stop() {
        removeEventListener("blur", onBlur); box.remove(); pad?.remove();
        for (const h of holders) h.g.removeFromParent(); for (const g of fp) g.removeFromParent();
        for (const g of made) g.traverse((o: any) => o.geometry?.dispose());
        for (const p of pops) { p.s.removeFromParent(); p.s.material.dispose(); } for (const t of texs.values()) t.dispose();
      },
    };
  },
};


/* ───── 화면 모양(이 종목 것만이라 여기서 붙인다) ───── */
if (typeof document !== "undefined" && !document.getElementById("boxStyle")) {
  const st = document.createElement("style"); st.id = "boxStyle";
  st.textContent = `.boxHud{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;width:min(440px,calc(100vw - 40px));background:rgba(255,255,255,.94);border:1.5px solid var(--ink);border-radius:12px;padding:5px 10px;font-size:15px}
.bxP{display:flex;align-items:center;gap:6px;min-width:0}.bxP.s1{flex-direction:row-reverse}
.bxP em{font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:7.5em}.bxP.me em{font-weight:700}
.bxBar{flex:1;display:flex;height:12px;min-width:40px;border:1.5px solid var(--ink);border-radius:7px;background:#fff;overflow:hidden}.bxP.s1 .bxBar{justify-content:flex-end}
.bxBar i{display:block;height:100%;transition:width .2s}.bxP.s0 .bxBar i{background:#2F6FDB}.bxP.s1 .bxBar i{background:#D9534F}
.bxP b{min-width:2em;text-align:center;font-variant-numeric:tabular-nums}
.bxP.hit{animation:bxShake .3s}
@keyframes bxShake{20%{transform:translateX(-4px)}50%{transform:translateX(4px)}80%{transform:translateX(-2px)}}
.boxPad{position:fixed;z-index:7;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(172px + env(safe-area-inset-bottom,0px));display:flex;gap:8px;align-items:flex-end}
.boxPad .mBtn.lg{font-size:14px;line-height:1.1}.boxPad .mBtn.on{background:var(--ink);color:#FFD43B}
@media (prefers-reduced-motion:reduce){.bxP.hit{animation:none}.bxBar i{transition:none}}`;
  document.head.append(st);
}
