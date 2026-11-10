// 점프맵(21층) 브라우저 쪽: 발판 · 트램펄린 · 체크포인트 그리기, 떨어지면 마지막 발판으로, 발판에 닿으면 서버로 알리기
// 판정(순서 · 구간 최소 시간 · 위치)은 서버(server/duel/games/jump.js)가 한다. 받지 않으면 reject로 서버가 아는 발판에 돌려놓는다
import type { DuelGame } from "../client";
import { registerFurn } from "../furniture";
import { JUMP_COURSES } from "../arena/jump.mjs";
import { fmtMs } from "../shared.mjs";

/* ───── 그리기: 구름 바닥에서 솟은 기둥 ───── */
const COLS = [0x9CC8F5, 0xC9B8F0, 0xFFC98A, 0x9EDDB9];   // 코스마다 기둥 색
registerFurn("jblock", (G, o, k) => {
  k.box(G, k.w - .1, o.top - .12, k.d - .1, COLS[o.course % 4], k.x, 0, k.z, { line: .02 });
  k.box(G, k.w, .14, k.d, 0xFFFDF6, k.x, o.top - .14, k.z, { line: .02 });   // 윗면: 밟는 자리가 또렷하게 흰 판
});
registerFurn("jtramp", (G, o, k) => { // 기둥 위 트램펄린: 파란 테두리에 검은 그물, 올라서면 높이 튕긴다
  const r = Math.min(k.w, k.d) / 2 - .06;
  k.box(G, k.w - .2, o.top - .14, k.d - .2, COLS[o.course % 4], k.x, 0, k.z, { line: .02 });
  k.cyl(G, r, r, .16, 0x2F6FDB, k.x, o.top - .16, k.z, { seg: 28 });
  const net = new k.THREE.Mesh(new k.THREE.CircleGeometry(r - .1, 28), k.toon(0x1C1C26)); net.rotation.x = -Math.PI / 2; net.position.set(k.x, o.top + .005, k.z); G.add(net);
});
const padTex = new Map<string, any>();
registerFurn("jpad", (G, o, k) => { // 출발대(노랑) · 체크포인트(초록, 깃발) · 도착대(바둑판, 아치)
  const col = o.mark === "start" ? 0xFFE27A : o.mark === "cp" ? 0x8FD3A8 : 0xF4F2FA;
  k.box(G, k.w - .1, o.top - .14, k.d - .1, col, k.x, 0, k.z, { line: .02 });
  const key = o.mark; if (!padTex.has(key)) padTex.set(key, k.canvasTex(64, 64, (g) => {
    if (key === "end") for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? "#111118" : "#FFFFFF"; g.fillRect(i * 8, j * 8, 8, 8); }
    else { g.fillStyle = key === "start" ? "#FFF3B0" : "#D6F2E0"; g.fillRect(0, 0, 64, 64); g.fillStyle = key === "start" ? "#F2C14E" : "#5FBF86"; for (let i = -64; i < 64; i += 16) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 8, 64); g.lineTo(i + 72, 0); g.lineTo(i + 64, 0); g.fill(); } }
  }, { repeat: [o.w, o.h] }));
  k.box(G, k.w, .14, k.d, 0xFFFFFF, k.x, o.top - .14, k.z, { line: .02, mat: k.toon(0xFFFFFF, { map: padTex.get(key) }) });
  const north = k.wz(o.y) + .25, south = k.wz(o.y + o.h) - .25;
  if (o.mark === "cp") { // 북쪽 끝 깃대에 체크포인트 번호 깃발
    k.cyl(G, .03, .03, 1.6, 0x2E2C38, k.x, o.top, north, { line: 0 });
    k.board(G, .6, .36, k.signTex(`${o.n}`, { bg: "#7FCFAE", size: 96, w: 160, h: 96 }), k.x + .32, o.top + 1.38, north, 0);
  } else { // 출발 · 도착 아치: 양 끝 기둥과 가로대, 들어오는 쪽(서쪽)을 보는 글자판
    for (const z of [north, south]) k.cyl(G, .06, .06, 2.2, 0x2E2C38, k.x, o.top, z, { line: .01 });
    k.box(G, .12, .12, south - north + .12, 0x2E2C38, k.x, o.top + 2.2, (north + south) / 2, { line: .01 });
    k.board(G, 2.2, .55, k.signTex(o.mark === "start" ? "출발" : "도착", { bg: o.mark === "start" ? "#FFD43B" : "#FFFFFF", size: 72, w: 384, h: 96 }), k.x - .07, o.top + 1.9, (north + south) / 2, -Math.PI / 2);
  }
});

/* ───── 경기 ───── */
export const game: DuelGame = {
  id: "jump",
  start(ctx) {
    const c = JUMP_COURSES[ctx.match.state?.course ?? 0], last = c.pads.length - 1;
    const inPad = (p, x: number, y: number) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h;
    let reached = ctx.mine ? ctx.match.state?.cp?.[ctx.seat] ?? 0 : 0;
    if (ctx.mine && ctx.match.phase === "playing" && reached > 0) { const s = c.spot[reached]; ctx.place(s[0], s[1], s[2]); }   // 다시 접속: 마지막 발판에서 이어서
    const box = document.createElement("div"); box.className = "jumpHud"; ctx.hud.append(box);
    let key = "";
    const dots = (n: number) => c.pads.slice(1).map((_, i) => `<i class="${i < n ? "on" : ""}${i === last - 1 ? " end" : ""}"></i>`).join("");
    function paint() {
      const m = ctx.match, cp = [0, 1].map((s) => Math.max(m.state?.cp?.[s] ?? 0, s === ctx.seat ? reached : 0));
      const run = m.phase === "playing" ? fmtMs(ctx.now() - m.startAt) : m.phase === "countdown" ? "0:00.00" : "";
      const html = `<b>${c.name}</b><span class="jt">${run}</span>${m.players.map((p, s) => `<span class="jp${s === ctx.seat ? " me" : ""}"><em>${s === ctx.seat ? "나" : p.name}</em>${dots(cp[s])}</span>`).join("")}`;
      if (html !== key) { key = html; box.innerHTML = html; }
    }
    function back(toast: [string, string]) { const s = c.spot[reached]; ctx.place(s[0], s[1], s[2]); ctx.toast(toast[0], toast[1], 1500); }
    return {
      tick() {
        paint();
        if (!ctx.mine || ctx.match.phase !== "playing" || ctx.me.f !== ctx.floor) return;
        const m = ctx.me, ground = m.jz <= .001 && m.jv <= 0;
        if (!ground) return;
        if (m.up < .05) { back(["앗, 떨어졌어요", reached ? `${reached}번 체크포인트에서 다시 해요` : "출발대에서 다시 해요"]); return; }   // 구름 바닥에 닿았다
        const next = c.pads[reached + 1];
        if (next && Math.abs(m.up - next.top) < .06 && inPad(next, m.x, m.y)) {
          reached++; ctx.sync(); ctx.send({ k: "pad", i: reached });   // 위치를 먼저 보내야 서버가 발판 근처인지 본다
          if (reached < last) ctx.toast(`체크포인트 ${reached}`, "떨어지면 여기서 다시 해요", 1400);
        }
      },
      message(p) {
        if (p.k === "reject" && ctx.mine) { reached = p.i; back(["다시 해 볼까요?", "발판을 건너뛰었거나 너무 빨랐어요"]); }
        if (p.k === "pad" && p.seat !== ctx.seat && p.i < last) ctx.note(`${ctx.match.players[p.seat]?.name}님이 체크포인트 ${p.i}을 지났어요 · ${fmtMs(p.ms)}`);
      },
      result(e) {
        const s = e.summary || {};
        if (e.reason === "finish") return `${c.name} ${fmtMs(s.ms)}${s.record ? " · 코스 신기록!" : s.personal && e.seat === ctx.seat ? " · 내 최고 기록!" : ""}`;
        if (e.reason === "timeout" && s.cp) return `체크포인트 ${s.cp[0]} : ${s.cp[1]}`;
        return "";
      },
      stop() { box.remove(); },
    };
  },
};
