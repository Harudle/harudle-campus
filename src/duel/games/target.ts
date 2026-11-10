// 과녁 사격(23층) 브라우저 쪽: 사격장 가구 · 움직이는 과녁 · 점수판 그리기, 종이 총 자동으로 들기, 내 총알이 과녁에 닿으면 서버로 알리기
// 과녁 일정은 서버가 정해 spawn으로 알리고, 자리는 target-path.mjs로 두 화면이 똑같이 셈한다. 점수는 서버가 확인한 take로만 바뀐다
import type { DuelGame } from "../client";
import type * as THREE from "three";
import { registerFurn } from "../furniture";
import { TARGET_BOOTHS, TARGET_RAIL } from "../arena/target.mjs";
import { TARGET, targetAt } from "../target-path.mjs";

const SEAT = ["#2F6FDB", "#D9534F"];   // 경기 틀(.dhP)과 같은 선수 색
const WOOD = 0xC98E5A, CREAM = "#FFF6E2", RED = "#E5484D";
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ───── 사격장 가구 ───── */
const texes = new Map<string, any>();
const tex = (key: string, make: () => any) => { if (!texes.has(key)) texes.set(key, make()); return texes.get(key); };
const stripes = (k, n: number) => k.canvasTex(256, 32, (g) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? RED : CREAM; g.fillRect(i * 256 / n, 0, 256 / n + 1, 32); } });
registerFurn("tback", (G, o, k) => { // 뒷벽: 빨강 · 크림 줄무늬 판에 별, 위에 나무 테
  k.box(G, k.w, 2.2, k.d * .5, 0xFFFFFF, k.x, 0, k.z, { line: .02, mat: k.toon(0xFFFFFF, { map: tex("back", () => k.canvasTex(1024, 128, (g) => {
    for (let i = 0; i < 32; i++) { g.fillStyle = i % 2 ? RED : CREAM; g.fillRect(i * 32, 0, 33, 128); }
    g.fillStyle = "#FFD43B"; g.strokeStyle = "#111118"; g.lineWidth = 3;
    for (let s = 0; s < 6; s++) { const cx = 90 + s * 170, cy = 52; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 9 : 20; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); }
  })) }) });
  k.box(G, k.w + .1, .14, k.d * .6, WOOD, k.x, 2.2, k.z, { line: .02 });
});
registerFurn("ttrack", (G, o, k) => { // 과녁 레일: 바닥에 낮게 깐 홈과 쇠줄 둘(밟고 지나간다)
  k.box(G, k.w, .02, .34, 0x6E6672, k.x, 0, k.z, { line: 0, cast: false });
  for (const dz of [-.11, .11]) k.box(G, k.w, .045, .04, 0xB8BCC6, k.x, 0, k.z + dz, { line: 0, cast: false });
});
registerFurn("tcounter", (G, o, k) => { // 사대 앞 낮은 카운터: 줄무늬 치마 + 나무 상판(총알은 위로 지나간다)
  k.box(G, k.w - .06, .39, k.d * .6, 0xFFFFFF, k.x, 0, k.z, { line: .02, mat: k.toon(0xFFFFFF, { map: tex("skirt", () => stripes(k, 16)) }) });
  k.box(G, k.w, .06, k.d * .8, WOOD, k.x, .39, k.z, { line: .02 });
  k.board(G, 1.3, .32, tex(`seat${o.seat}`, () => k.signTex(`${o.seat + 1}번 사대`, { bg: SEAT[o.seat], fg: "#FFFFFF", size: 64, w: 384, h: 96 })), k.x, .2, k.z + k.d * .31, 0);
});
registerFurn("tdiv", (G, o, k) => { // 부스 칸막이: 줄무늬 벽 한 장과 꼭대기 깃발
  k.box(G, .24, 1.35, k.d, 0xFFFFFF, k.x, 0, k.z, { line: .02, mat: k.toon(0xFFFFFF, { map: tex("div", () => stripes(k, 8)) }) });
  k.cyl(G, .03, .03, .9, 0x2E2C38, k.x, 1.35, k.z - k.d / 2 + .2, { line: 0 });
  k.board(G, .5, .32, tex("flag", () => k.canvasTex(64, 40, (g) => { g.fillStyle = "#FFD43B"; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 20); g.lineTo(0, 40); g.fill(); })), k.x + .26, 2.08, k.z - k.d / 2 + .2, 0);
});

/* ───── 과녁 모양: 막대 위 둥근 판(보통 빨강 과녁 · 금색 별). 처음 한 번 만들고 복제해 쓴다 ───── */
let tpl: [THREE.Group, THREE.Group] | null = null;
const FACE_Y = .62, FACE_R = [.42, .36];
function makeTpl(k): [THREE.Group, THREE.Group] {
  const T = k.THREE;
  return [0, 1].map((gold) => {
    const g = new T.Group(), r = FACE_R[gold];
    k.box(g, .36, .08, .22, 0x5B5560, 0, 0, 0, { line: .015 });
    k.cyl(g, .025, .025, FACE_Y - .08, 0x2E2C38, 0, .08, 0, { line: 0, seg: 8 });
    const face = new T.Group(); face.name = "face"; face.position.y = FACE_Y; g.add(face);
    const map = k.canvasTex(128, 128, (c) => {
      const cols = gold ? ["#F2A93B", "#FFE27A", "#F2A93B", "#FFF3B0"] : [RED, "#FFFFFF", RED, "#FFFFFF"];
      cols.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(64, 64, 64 - i * 15, 0, 7); c.fill(); });
      if (gold) { c.fillStyle = "#FFFFFF"; c.strokeStyle = "#111118"; c.lineWidth = 3; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 9 : 20; c.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke(); }
      else { c.fillStyle = RED; c.beginPath(); c.arc(64, 64, 12, 0, 7); c.fill(); }
    });
    const ink = new T.Mesh(new T.CircleGeometry(r + .03, 32), k.toon(k.INK)); ink.position.z = -.012; face.add(ink);
    const back = new T.Mesh(new T.CircleGeometry(r + .03, 32), k.toon(0xE9E2D2)); back.rotation.y = Math.PI; back.position.z = -.016; face.add(back);
    face.add(new T.Mesh(new T.CircleGeometry(r, 32), k.toon(0xFFFFFF, { map })));
    return g;
  }) as [THREE.Group, THREE.Group];
}

const CSS = `.tgWrap{display:grid;justify-items:center;gap:4px}
.tgHud{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.94);border:1.5px solid var(--ink);border-radius:12px;padding:2px 12px;font-size:16px}
.tgHud .tgP{display:flex;align-items:center;gap:6px}.tgHud em{font-style:normal}.tgHud .me em{font-weight:700;text-decoration:underline 2px}
.tgHud b{display:inline-block;min-width:1.3em;text-align:center;font-size:24px;font-variant-numeric:tabular-nums}.tgHud .s0 b{color:${SEAT[0]}}.tgHud .s1 b{color:${SEAT[1]}}
.tgHud b.bump{animation:tgBump .45s ease-out}.tgHud i{font-style:normal;color:var(--muted)}
.tgFeed{background:var(--paper);border:1.5px solid var(--ink);border-radius:10px;padding:1px 10px;font-size:15px;transition:opacity .3s}.tgFeed.off{opacity:0}
@keyframes tgBump{0%{transform:scale(1.7)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.tgHud b.bump{animation:none}}`;

type Live = { t: any; obj: THREE.Group; face: THREE.Object3D; pend: number; gone: number; seat?: number };
type Pop = { s: THREE.Sprite; t: number };

/* ───── 경기 ───── */
export const game: DuelGame = {
  id: "target",
  start(ctx) {
    const { THREE: T, grid, kit } = ctx, G = new T.Group(); ctx.group.add(G);
    if (!tpl) tpl = makeTpl(kit);
    if (!document.getElementById("targetDuelCss")) { const st = document.createElement("style"); st.id = "targetDuelCss"; st.textContent = CSS; document.head.append(st); }
    const live = new Map<number, Live>(), taken = new Set<number>(), pops: Pop[] = [], shots: { x: number; y: number; dir: number; at: number; used?: boolean }[] = [];
    let score = [...(ctx.match.state?.score || [0, 0])], armT = 0, said = false, feedT = 0, bump = -1;
    const nameOf = (s: number) => (s === ctx.seat ? "나" : ctx.match.players[s]?.name || "");

    /* HUD: 두 선수 점수 + 누가 가져갔는지 한 줄 */
    const wrap = document.createElement("div"); wrap.className = "tgWrap";
    wrap.innerHTML = `<div class="tgHud"><span class="tgP s0"><em></em><b>0</b></span><i>:</i><span class="tgP s1"><b>0</b><em></em></span></div><div class="tgFeed off"></div>`;
    ctx.hud.append(wrap);
    const feed = wrap.querySelector<HTMLElement>(".tgFeed"), P = [0, 1].map((s) => wrap.querySelector<HTMLElement>(`.s${s}`));
    let hudKey = "";
    function paint() {
      const key = `${score}|${ctx.match.players.map((p) => p.name)}`; if (key === hudKey) return; hudKey = key;
      P.forEach((e, s) => { e.querySelector("em").textContent = nameOf(s); e.classList.toggle("me", s === ctx.seat); const b = e.querySelector("b"); b.textContent = String(score[s] ?? 0); if (bump === s) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); } });
      bump = -1;
    }

    /* 뒷벽 위 점수판: 관전석에서도 보이게 */
    const sbCanvas = document.createElement("canvas"); sbCanvas.width = 512; sbCanvas.height = 128;
    const sbTex = new T.CanvasTexture(sbCanvas); sbTex.colorSpace = T.SRGBColorSpace;
    const sb = new T.Mesh(new T.PlaneGeometry(4.8, 1.2), new T.MeshBasicMaterial({ map: sbTex })); sb.position.set(grid.wx(28), 2.98, grid.wz(8.5) + .2); G.add(sb);
    let sbKey = "";
    function drawBoard() {
      const m = ctx.match, left = m.phase === "playing" ? Math.max(0, Math.ceil((m.endsAt - ctx.now()) / 1000)) : m.phase === "countdown" ? 60 : 0;
      const key = `${score}|${left}`; if (key === sbKey) return; sbKey = key;
      const g = sbCanvas.getContext("2d"); g.fillStyle = "#FFFDF6"; g.fillRect(0, 0, 512, 128); g.strokeStyle = "#111118"; g.lineWidth = 8; g.strokeRect(4, 4, 504, 120);
      g.textBaseline = "middle"; g.font = `700 30px ${kit.HAND}`;
      for (const s of [0, 1]) { g.fillStyle = SEAT[s]; g.textAlign = s ? "right" : "left"; const nm = m.players[s]?.name || ""; g.fillText(nm.length > 7 ? nm.slice(0, 7) + "…" : nm, s ? 490 : 22, 36); g.font = `700 60px ${kit.HAND}`; g.fillText(String(score[s] ?? 0), s ? 490 : 22, 88); g.font = `700 30px ${kit.HAND}`; }
      g.fillStyle = left <= 10 && m.phase === "playing" ? RED : "#111118"; g.textAlign = "center"; g.font = `700 52px ${kit.HAND}`; g.fillText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`, 256, 70);
      sbTex.needsUpdate = true;
    }

    /* 과녁 */
    function add(t) {
      if (!t || live.has(t.id) || taken.has(t.id)) return;
      const obj = tpl[t.g ? 1 : 0].clone(true); obj.visible = false; G.add(obj);
      live.set(t.id, { t, obj, face: obj.getObjectByName("face"), pend: 0, gone: 0 });
    }
    function drop(id: number) { const L = live.get(id); if (!L) return; L.obj.removeFromParent(); live.delete(id); }
    function pop(L: Live | undefined, seat: number, pts: number, g: number) {
      const c = kit.canvasTex(256, 96, (x) => {
        x.fillStyle = SEAT[seat] || "#111118"; x.strokeStyle = "#111118"; x.lineWidth = 6; x.beginPath(); x.roundRect(6, 10, 244, 76, 30); x.fill(); x.stroke();
        x.fillStyle = "#FFFFFF"; x.font = `700 ${g ? 44 : 40}px ${kit.HAND}`; x.textAlign = "center"; x.textBaseline = "middle"; const nm = nameOf(seat); x.fillText(`+${pts} ${nm.length > 5 ? nm.slice(0, 5) : nm}`, 128, 50);
      });
      const s = new T.Sprite(new T.SpriteMaterial({ map: c, transparent: true, depthTest: false })); s.scale.set(1.3, .49, 1); s.renderOrder = 9;
      const p = L ? L.obj.position : new T.Vector3(grid.wx(28), 0, grid.wz(14)); s.position.set(p.x, FACE_Y + .75, p.z); G.add(s); pops.push({ s, t: 0 });
      if (L) { L.gone = performance.now(); L.seat = seat; }
    }
    function say(text: string) { feed.textContent = text; feed.classList.remove("off"); feedT = 1.8; }

    /* 내 총알: 쏜 것(onFire)을 기억해 두었다가, 그 총알이 과녁에 닿으면 쏜 자리 · 방향 · 시각을 서버로 */
    ctx.onFire((s) => { shots.push({ ...s }); if (shots.length > 8) shots.shift(); });
    ctx.onBullet((b) => {
      const h = b.pos.y - grid.y0; if (h < -.1 || h > 1.5) return false;
      const now = ctx.now(), bx = grid.tX(b.pos.x), by = grid.tY(b.pos.z);
      for (const L of live.values()) {
        if (L.gone || L.pend) continue;
        const ms = now - L.t.at; if (ms < 0 || ms > L.t.life) continue;
        const p = targetAt(L.t, ms); if (Math.hypot(p.x - bx, p.y - by) > TARGET.HIT_R) continue;
        if (b.mine && ctx.mine && ctx.match.phase === "playing") {
          const dir = Math.atan2(b.vel.x, b.vel.z), s = [...shots].reverse().find((q) => !q.used && Math.abs(Math.atan2(Math.sin(q.dir - dir), Math.cos(q.dir - dir))) < .01);
          if (s) { s.used = true; L.pend = now; ctx.send({ k: "hit", tg: L.t.id, x: s.x, y: s.y, dir: s.dir, at: Math.round(s.at) }); }
        }
        return true;   // 누구 총알이든 과녁에 맞으면 거기서 멈춘다(점수는 서버가 정한다)
      }
      return false;
    });

    function phase(m) {
      if (!ctx.mine) return;
      if (m.phase === "playing" && !said) { said = true; ctx.toast("과녁을 맞혀요!", `${ctx.touch ? "🎆 버튼" : "왼쪽 클릭이나 F"}로 쏴요 · 금색 과녁은 3점`, 2400); }
    }
    if (ctx.mine) { ctx.act("gun"); ctx.canFire(false); }
    for (const t of ctx.match.state?.live || []) add(t);

    return {
      tick(dt) {
        const m = ctx.match, now = ctx.now();
        for (const L of [...live.values()]) {
          if (L.gone) { // 가져간 과녁: 뒤로 휙 넘어가며 가라앉는다
            const k = (performance.now() - L.gone) / 600; if (k >= 1) { drop(L.t.id); continue; }
            L.face.rotation.x = -Math.min(1, k * 2.5) * Math.PI / 2; L.obj.scale.y = 1 - Math.max(0, k - .5) * 2; continue;
          }
          const ms = now - L.t.at;
          if (ms > L.t.life + 250) { drop(L.t.id); continue; }
          L.obj.visible = ms >= 0; if (ms < 0) continue;
          const p = targetAt(L.t, Math.min(ms, L.t.life)); L.obj.position.set(grid.wx(p.x), 0, grid.wz(p.y));
          L.obj.scale.y = Math.max(.01, Math.min(1, ms / 220, (L.t.life + 250 - ms) / 250));   // 레일에서 쑥 올라왔다 끝나면 내려간다
          if (L.pend && now - L.pend > 1500) L.pend = 0;   // 서버 답이 없으면 다시 맞힐 수 있게
          L.face.rotation.x = L.pend ? -.5 : 0; L.face.rotation.z = L.t.g ? Math.sin(now / 90) * .12 : 0;
        }
        for (let i = pops.length - 1; i >= 0; i--) {
          const p = pops[i]; p.t += dt; p.s.position.y += dt * .9; (p.s.material as THREE.SpriteMaterial).opacity = clamp((1.3 - p.t) / .4, 0, 1);
          if (p.t > 1.3) { p.s.removeFromParent(); p.s.material.map?.dispose(); p.s.material.dispose(); pops.splice(i, 1); }
        }
        if (feedT > 0 && (feedT -= dt) <= 0) feed.classList.add("off");
        paint(); drawBoard();
        if (!ctx.mine) return;
        const play = m.phase === "playing" && now < m.endsAt;
        ctx.canFire(play);
        if (m.phase === "result") return;
        if (ctx.me.act !== "gun" && (armT -= dt) <= 0) { armT = 1; ctx.act("gun"); }   // 경기 동안은 늘 종이 총을 든다
        if (play && ctx.me.f === ctx.floor) { // 과녁 마당이나 상대 부스로 넘어가면 내 부스로 돌려놓는다
          const b = TARGET_BOOTHS[ctx.seat], x = ctx.me.x, y = ctx.me.y;
          if (y < TARGET_RAIL - .05 || x < b.x || x > b.x + b.w) { ctx.place(clamp(x, b.x + .7, b.x + b.w - .7), TARGET_RAIL + 2); ctx.toast("사대 안에서 쏴요", "과녁 마당과 옆 부스에는 못 가요", 1400); }
        }
      },
      message(p) {
        if (p.k === "spawn") add(p.tgt);
        else if (p.k === "take") {
          taken.add(p.tg); const L = live.get(p.tg); pop(L, p.seat, p.pts, p.g);
          if (Array.isArray(p.score)) score = p.score; bump = p.seat;
          say(p.seat === ctx.seat ? `${p.g ? "금색 과녁! " : ""}+${p.pts}점` : `${ctx.match.players[p.seat]?.name || "상대"}님이 ${p.g ? "금색 과녁을 " : ""}맞혔어요 +${p.pts}`);
        } else if (p.k === "miss") { const L = live.get(p.tg); if (L) L.pend = 0; }
      },
      match(m) {
        for (const t of m.state?.live || []) add(t);
        if (Array.isArray(m.state?.score)) score = [...m.state.score];
        phase(m);
      },
      result(e) {
        const s = e.summary?.score; if (!s) return "";
        const g = e.summary.gold || [0, 0];
        return `${ctx.match.players[0]?.name} ${s[0]} : ${s[1]} ${ctx.match.players[1]?.name}${g[0] + g[1] ? ` · 금색 ${g[0]} : ${g[1]}` : ""}`;
      },
      stop() {
        for (const p of pops) { p.s.material.map?.dispose(); p.s.material.dispose(); }
        G.removeFromParent(); sb.geometry.dispose(); (sb.material as THREE.Material).dispose(); sbTex.dispose();
        wrap.remove();
        if (ctx.mine && ctx.me.act === "gun") ctx.act(null);
      },
    };
  },
};
