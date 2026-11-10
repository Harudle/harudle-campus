// 점프맵(21층, 미니 온리업 탑) 브라우저 쪽: 발판 · 트램펄린 · 체크포인트 그리기, 떨어지면 마지막 발판으로, 발판에 닿으면 서버로 알리기
// 판정(순서 · 구간 최소 시간 · 위치)은 서버(server/duel/games/jump.js)가 한다. 받지 않으면 reject로 서버가 아는 발판에 돌려놓는다
import type { DuelGame } from "../client";
import { registerFurn } from "../furniture";
import { JUMP_COURSES } from "../arena/jump.mjs";
import { fmtMs } from "../shared.mjs";
import { inRect } from "../../engine/world";

/* ───── 그리기: 공중에 떠 있는 잡동사니(미니 온리업: 나무 상자 · 파이프 · 깡통 · 책 더미 · 철골) ───── */
// 모양은 윗면 근처만 그리고 아래는 비워 둔다(떠 있는 것처럼). 부딪히는 것은 바닥까지 이어진 칸 기둥이다(떨어지다 옆면에 걸릴 수 있다)
const COLS = [0x9CC8F5, 0xC9B8F0, 0xFFC98A, 0x9EDDB9];   // 코스마다 색(예전 기둥 · 트램펄린 받침)
const BOOKS = [0xE5484D, 0x3B82D6, 0xF5C400, 0x3FA37C, 0xB9A6EC, 0xFF9B54, 0xF4F1EA];
registerFurn("jblock", (G, o, k) => {
  const w = k.w - .1, d = k.d - .1, top = o.top, r = Math.min(w, d) / 2, low = (h: number) => Math.max(0, top - h);   // low: 이만큼 두께의 아랫면 높이
  if (o.look === "crate") { // 나무 상자 둘을 포개 놓았다
    for (let i = 0; i < 2; i++) { const y = low(1.3) + i * .65; k.box(G, w - i * .12, .63, d - i * .12, i ? 0xC99258 : 0xB27A43, k.x, y, k.z, { line: .015 }); k.box(G, w - i * .12 + .02, .06, d - i * .12 + .02, 0x8A5A2E, k.x, y + .29, k.z, { line: 0 }); }
    k.box(G, w - .1, .04, d - .1, 0xE8C38E, k.x, top - .04, k.z, { line: .01 });
  } else if (o.look === "pipe") { // 짧게 잘린 쇠 파이프 토막: 마디 띠 · 밝은 뚜껑
    k.cyl(G, r - .04, r - .04, 1.4, 0x8FA6AD, k.x, low(1.4), k.z, { seg: 20, line: .015 });
    k.cyl(G, r, r, .12, 0x6B8087, k.x, low(.8), k.z, { seg: 20, line: .008 });
    k.cyl(G, r + .02, r + .02, .1, 0xDDE6E9, k.x, top - .1, k.z, { seg: 20, line: .012 });
  } else if (o.look === "can") { // 커다란 깡통: 빨간 몸통에 흰 띠, 은색 뚜껑
    k.cyl(G, r - .02, r - .02, 1.1, 0xE5484D, k.x, low(1.1), k.z, { seg: 22, line: .015 });
    k.cyl(G, r, r, .3, 0xFFFFFF, k.x, low(.7), k.z, { seg: 22, line: 0 });
    k.cyl(G, r + .02, r + .02, .1, 0xC9CED6, k.x, top - .1, k.z, { seg: 22, line: .012 });
  } else if (o.look === "books") { // 책 더미: 색이 다른 책 셋을 엇갈리게
    for (let i = 0; i < 3; i++) { const b = k.box(G, w - .06, .2, d - .06, BOOKS[(i * 3 + o.x + o.y) % BOOKS.length], k.x + Math.sin(i * 2.3) * .05, low(.6) + i * .2, k.z + Math.cos(i * 1.7) * .05, { line: .01 }); b.rotation.y = Math.sin(i * 1.3 + o.y) * .15; }
  } else if (o.look === "beam") { // 주황 H빔 토막(위가 밟는 자리)
    k.box(G, w + .04, .07, d + .04, 0xF08A3C, k.x, top - .07, k.z, { line: .012 }); k.box(G, Math.min(w, .14), .2, d, 0xD9762D, k.x, low(.27), k.z, { line: 0 }); k.box(G, w, .07, d, 0xF08A3C, k.x, low(.34), k.z, { line: .01 });
  } else { // 예전 기둥: 코스 색 몸통 + 흰 윗면
    k.box(G, w, top - .12, d, COLS[o.course % 4], k.x, 0, k.z, { line: .02 });
    k.box(G, k.w, .14, k.d, 0xFFFDF6, k.x, top - .14, k.z, { line: .02 });
  }
});
registerFurn("jtramp", (G, o, k) => { // 떠 있는 트램펄린: 코스 색 받침 위 파란 테두리에 검은 그물, 올라서면 높이 튕긴다
  const r = Math.min(k.w, k.d) / 2 - .06, base = Math.max(0, o.top - .6);
  k.box(G, k.w - .2, o.top - .14 - base, k.d - .2, COLS[o.course % 4], k.x, base, k.z, { line: .02 });
  k.cyl(G, r, r, .16, 0x2F6FDB, k.x, o.top - .16, k.z, { seg: 28 });
  const net = new k.THREE.Mesh(new k.THREE.CircleGeometry(r - .1, 28), k.toon(0x1C1C26)); net.rotation.x = -Math.PI / 2; net.position.set(k.x, o.top + .005, k.z); G.add(net);
});
const padTex = new Map<string, any>();
registerFurn("jpad", (G, o, k) => { // 출발대(노랑) · 체크포인트(초록, 깃발) · 도착대(바둑판, 아치)
  const col = o.mark === "start" ? 0xFFE27A : o.mark === "cp" ? 0x8FD3A8 : 0xF4F2FA;
  const base = o.top > 1.5 ? o.top - .7 : 0;   // 높은 체크포인트 · 꼭대기는 떠 있는 판
  k.box(G, k.w - .1, o.top - .14 - base, k.d - .1, col, k.x, base, k.z, { line: .02 });
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
  keys: [{ label: "이동", keys: ["WASD"] }, { label: "점프(두 번)", keys: ["Space"] }, { label: "달리기", keys: ["Shift"] }, { label: "시점", keys: ["V"] }],
  start(ctx) {
    const c = JUMP_COURSES[ctx.match.state?.course ?? 0], last = c.pads.length - 1;
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
        if (m.up < .05) { back(["으아아, 떨어졌어요", reached ? `${reached}번 체크포인트에서 다시 해요` : "출발대에서 다시 올라가요"]); return; }   // 구름 바닥에 닿았다
        const next = c.pads[reached + 1];
        if (next && Math.abs(m.up - next.top) < .06 && inRect(next, m.x, m.y)) {
          reached++; ctx.sync(); ctx.send({ k: "pad", i: reached });   // 위치를 먼저 보내야 서버가 발판 근처인지 본다
          if (reached < last) ctx.toast(`체크포인트 ${reached}`, "떨어지면 여기서 다시 해요. 안쪽 바퀴부터가 진짜예요", 1600);
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
