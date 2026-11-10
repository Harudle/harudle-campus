// 1:1 대결 서버: 신청 · 경기 진행 · 관전 · 끊김 · 전적 (docs/duel.md)
// 사람은 공개 주소(uid)로 구분한다. 다시 접속하면 peer id가 바뀌므로 경기 · 관전 자리는 uid에 묶고, 지금 연결(peer)만 바꿔 끼운다.
// 시계(now) · 난수(random) · 저장소(store)는 밖에서 받아 시험에서 바꾼다. 시간은 app.js가 100ms마다 부르는 tick()으로만 흐른다
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DUEL, duelGame } from "../../src/duel/shared.mjs";
import { arenaOfGame } from "../../src/duel/arena/index.mjs";
import { SERVER_GAMES } from "./games/index.js";

// 전적은 채팅 기록처럼 임시 폴더에 둔다(배포로 워커가 바뀌어도 남는다)
export function fileStore(path = join(tmpdir(), "harudle-duels.json")) {
  return { load() { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } }, save(data) { writeFile(path, JSON.stringify(data)).catch(() => { }); } };
}
const UID_RE = /^(p_[0-9a-f]{16}|h_[0-9a-f-]{36})$/;
const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");

export function createDuel({ peers, send = () => { }, now = Date.now, random = Math.random, store = fileStore(), games = SERVER_GAMES } = {}) {
  const invites = new Map();   // id → { id, game, from: { peer, u, name }, to: { peer, u, name }, expiresAt }
  const matches = new Map();   // id → 경기
  const seats = new Map();     // uid → { match, seat(0 · 1 · null=관전) }
  const after = new Map();     // uid → { ar, floor, until }: 경기가 닫힌 뒤 돌아가는 동안도 대결장 위치를 받아 준다
  const prefs = new Map();     // uid → 신청 받기(false면 안 받음)
  const lastInvite = new Map(); // "보낸 uid>받는 uid" → 시각
  const rec = { users: {}, best: {}, ...(store.load() || {}) };
  let seq = 0, dirty = false, savedAt = 0;
  const id36 = (n) => `${(++seq).toString(36)}${Math.floor(random() * 36 ** n).toString(36).padStart(n, "0")}`;
  const tell = (pid, msg) => { if (pid && peers.has(pid)) send(pid, msg); };
  const oops = (pid, code, text) => tell(pid, { t: "duel:error", code, text });
  const nameOf = (pid) => str(peers.get(pid)?.name, 16) || "크루";
  const pendingOf = (u) => [...invites.values()].filter((i) => i.from.u === u || i.to.u === u);
  const busy = (u) => seats.has(u) || pendingOf(u).length > 0;
  const sending = (u) => [...invites.values()].some((i) => i.from.u === u);   // 내가 보낸 신청이 걸려 있다
  const people = (m) => [...m.players.map((p) => p.peer), ...m.watchers.values()];

  /* ───── 경기 정보 · 보내기 ───── */
  const view = (m, seat) => ({ t: "duel:match", id: m.id, game: m.game, ar: m.ar, floor: m.floor, seat, players: m.players.map((p) => ({ u: p.u, peer: p.peer, name: p.name, ...(p.away ? { away: 1 } : {}) })), phase: m.phase, startAt: m.startAt, endsAt: m.endsAt, state: m.state, spawns: m.spawns, watch: m.watch, watchers: m.watchers.size, serverTime: now() });
  function sync(m) { m.players.forEach((p, i) => tell(p.peer, view(m, i))); for (const pid of m.watchers.values()) tell(pid, view(m, null)); }
  const toAll = (m, msg) => { for (const pid of people(m)) tell(pid, msg); };
  // role: from(보낸 사람) · to(받은 사람). busy는 보낸 사람에게만(받는 사람은 초대장을 받은 적이 없다), pending도 보낸 사람에게만(받는 사람에겐 초대장이 갔다)
  const inviteState = (inv, state) => { for (const role of state === "busy" || state === "pending" ? ["from"] : ["from", "to"]) tell(inv[role].peer, { t: "duel:invite-state", id: inv.id, role, state, game: inv.game, expiresAt: inv.expiresAt, from: { name: inv.from.name }, to: { name: inv.to.name } }); };

  /* ───── 전적 ───── */
  const user = (u, name) => { const r = (rec.users[u] ||= { name: "크루", w: 0, l: 0, d: 0, best: {} }); if (name) r.name = name; return r; };
  function score(m) {
    const [a, b] = m.players;
    if (m.winner === null) { user(a.u, a.name).d++; user(b.u, b.name).d++; }
    else { user(m.players[m.winner].u, m.players[m.winner].name).w++; user(m.players[1 - m.winner].u, m.players[1 - m.winner].name).l++; }
    dirty = true;
  }
  // 낮을수록 좋은 기록(점프맵 시간). mine: 내 최고 기록을 바꿨는지 · top: 그 코스 최고 기록인지
  function best(m, seat, key, ms) {
    const p = m.players[seat], r = user(p.u, p.name), mine = !(r.best[key] <= ms), top = !(rec.best[key]?.ms <= ms);
    if (mine) r.best[key] = ms; if (top) rec.best[key] = { ms, u: p.u, name: p.name };
    if (mine || top) dirty = true;
    return { mine, top, prev: rec.best[key] };
  }

  /* ───── 종목 규칙이 쓰는 도구(api) ───── */
  const lastPos = (m, seat) => { const p = m.players[seat]; return p.hist.at(-1) || (peers.get(p.peer)?.presence ? { ...peers.get(p.peer).presence, at: now() } : null); };
  const api = {
    now, random,
    broadcast: (m, payload) => toAll(m, { t: "duel:game", id: m.id, ...payload }),
    send: (m, seat, payload) => tell(m.players[seat]?.peer, { t: "duel:game", id: m.id, ...payload }),
    finish: (m, winner, reason, summary) => finish(m, winner, reason, summary),
    sync,
    presence: lastPos,
    // 최근 위치들(오래된 것부터). 맞힘 판정에서 "그 시각에 어디 있었나"를 볼 때
    history: (m, seat, ms = 1000) => m.players[seat].hist.filter((h) => h.at >= now() - ms),
    at(m, seat, time) { const h = m.players[seat].hist; if (!h.length) return lastPos(m, seat); let best = h[0]; for (const e of h) if (Math.abs(e.at - time) < Math.abs(best.at - time)) best = e; return best; },
    best,
    name: (m, seat) => m.players[seat]?.name,
  };

  /* ───── 경기 흐름: countdown → playing → result → closed ───── */
  function start(game, players) {
    const g = games[game], info = duelGame(game), a = arenaOfGame(game), t = now();
    const m = { id: id36(6), game, ar: id36(4), floor: info.floor, players: players.map((p) => ({ ...p, away: 0, hist: [] })), watchers: new Map(), phase: "countdown", startAt: t + DUEL.MOVE + DUEL.COUNTDOWN, endsAt: 0, state: {}, spawns: a.spawns, watch: a.watch, winner: null, reason: "", summary: null, resultUntil: 0 };
    matches.set(m.id, m); m.players.forEach((p, i) => { seats.set(p.u, { match: m, seat: i }); after.delete(p.u); });
    g.setup?.(m, api);
    sync(m);
    return m;
  }
  function finish(m, winner, reason, summary = null) {
    if (m.phase !== "countdown" && m.phase !== "playing") return;
    m.phase = "result"; m.winner = winner === 0 || winner === 1 ? winner : null; m.reason = reason; m.summary = summary; m.resultUntil = now() + DUEL.RESULT;
    if (!(reason === "disconnect" && m.players.every((p) => p.away))) score(m);   // 둘 다 끊겼으면 남기지 않는다
    games[m.game].end?.(m, api);
    toAll(m, { t: "duel:end", id: m.id, winner: m.winner === null ? null : m.players[m.winner].u, seat: m.winner, reason, summary });
    sync(m);
  }
  function close(m) {
    m.phase = "closed"; matches.delete(m.id);
    const until = now() + DUEL.AFTER;
    for (const [u, pid] of [...m.players.map((p) => [p.u, p.peer]), ...m.watchers]) {
      if (seats.get(u)?.match === m) seats.delete(u);
      after.set(u, { ar: m.ar, floor: m.floor, until });
      tell(pid, { t: "duel:match", id: m.id, phase: "closed" });
    }
  }
  function unwatch(u, pid) {
    const s = seats.get(u); if (!s || s.seat !== null) return false;
    s.match.watchers.delete(u); seats.delete(u); after.set(u, { ar: s.match.ar, floor: s.match.floor, until: now() + DUEL.AFTER });
    tell(pid, { t: "duel:match", id: s.match.id, phase: "closed" }); sync(s.match);
    return true;
  }

  function tick() {
    const t = now();
    for (const inv of [...invites.values()]) if (inv.expiresAt <= t) { invites.delete(inv.id); inviteState(inv, "expired"); }
    for (const [k, at] of lastInvite) if (t - at >= DUEL.COOLDOWN) lastInvite.delete(k);   // 기다림이 끝난 기록은 버린다
    for (const m of [...matches.values()]) {
      const g = games[m.game];
      if (m.phase === "countdown" || m.phase === "playing") {
        const gone = m.players.filter((p) => p.away && t - p.away >= DUEL.GRACE);   // 20초 안에 돌아오지 않으면 기권패
        if (gone.length) { finish(m, gone.length === 2 ? null : 1 - m.players.indexOf(gone[0]), "disconnect"); continue; }
      }
      if (m.phase === "countdown" && t >= m.startAt) {
        m.phase = "playing"; m.endsAt = m.startAt + (g.duration ?? DUEL.DURATION);
        g.start?.(m, api); sync(m);
      }
      if (m.phase === "playing") {
        g.tick?.(m, t, api);
        if (m.phase === "playing" && t >= m.endsAt + 2000) finish(m, null, "timeout");   // 종목이 시간 종료를 놓쳐도 끝은 난다
      }
      if (m.phase === "result" && t >= m.resultUntil) close(m);
    }
    for (const [u, a] of after) if (a.until <= t) after.delete(u);
    if (dirty && t - savedAt > 4000) { dirty = false; savedAt = t; store.save(rec); }
  }

  /* ───── 브라우저가 보낸 것 ───── */
  function message(pid, msg) {
    const me = peers.get(pid), u = me?.uid; if (!u) return;
    const t = now(); me.duelT = (me.duelT || []).filter((x) => t - x < 2000); if (me.duelT.length >= 60) return; me.duelT.push(t);   // 종목 메시지까지 2초에 60개
    const s = seats.get(u);
    switch (msg.t) {
      case "duel:hello": { // 접속(다시 접속)할 때: 신청 받기 설정과 지금 있는 경기를 맞춘다
        if (typeof msg.accept === "boolean") prefs.set(u, msg.accept);
        if (!s) return tell(pid, { t: "duel:match", id: null, phase: "none" });
        if (s.seat === null) s.match.watchers.set(u, pid);
        else { const p = s.match.players[s.seat]; p.peer = pid; p.away = 0; }
        return sync(s.match);
      }
      case "duel:prefs": if (typeof msg.accept === "boolean") prefs.set(u, msg.accept); return;
      case "duel:invite": {
        const g = duelGame(msg.game), to = peers.get(msg.to), tu = to?.uid;
        if (!g) return oops(pid, "game", "그런 종목은 없어요");
        if (!games[g.id] || !arenaOfGame(g.id)) return oops(pid, "not_ready", `${g.name}은 아직 준비 중이에요`);
        if (!to || !tu) return oops(pid, "unknown", "그 크루를 찾지 못했어요");
        if (tu === u) return oops(pid, "self", "나 자신에게는 신청할 수 없어요");
        if (seats.has(u) || sending(u)) return oops(pid, "busy_me", s ? "경기나 관전이 끝난 뒤에 신청해 주세요" : "보낸 신청이 끝난 뒤에 다시 해 주세요");
        if (prefs.get(tu) === false) return oops(pid, "off", `${nameOf(msg.to)}님은 지금 대결 신청을 받지 않아요`);
        const key = `${u}>${tu}`, wait = (lastInvite.get(key) ?? -Infinity) + DUEL.COOLDOWN - t;
        if (wait > 0) return oops(pid, "cooldown", `${nameOf(msg.to)}님에게는 ${Math.ceil(wait / 1000)}초 뒤에 다시 신청할 수 있어요`);
        const inv = { id: id36(6), game: g.id, from: { peer: pid, u, name: nameOf(pid) }, to: { peer: msg.to, u: tu, name: nameOf(msg.to) }, expiresAt: t + DUEL.INVITE };
        if (busy(tu)) return inviteState(inv, "busy");
        lastInvite.set(key, t); invites.set(inv.id, inv);
        tell(inv.to.peer, { t: "duel:invited", id: inv.id, game: inv.game, from: { peer: pid, u, name: inv.from.name }, expiresAt: inv.expiresAt });
        return inviteState(inv, "pending");
      }
      case "duel:cancel": { for (const inv of pendingOf(u)) if (inv.from.u === u) { invites.delete(inv.id); inviteState(inv, "canceled"); } return; }
      case "duel:answer": {
        const inv = invites.get(msg.id); if (!inv || inv.to.u !== u) return;
        invites.delete(inv.id);
        if (!msg.ok) return inviteState(inv, "declined");
        if (peers.get(inv.from.peer)?.uid !== inv.from.u) return inviteState(inv, "expired");
        if (seats.has(inv.from.u) || seats.has(u)) return inviteState(inv, "busy");
        for (const other of [...pendingOf(inv.from.u), ...pendingOf(u)]) if (invites.delete(other.id)) inviteState(other, "canceled");   // 둘에게 걸린 다른 신청은 닫는다
        inviteState(inv, "accepted");
        start(inv.game, [{ u: inv.from.u, peer: inv.from.peer, name: inv.from.name }, { u, peer: pid, name: nameOf(pid) }]);
        return;
      }
      case "duel:watch": {
        if (!msg.peer) { if (!unwatch(u, pid)) oops(pid, "not_watching", "관전 중이 아니에요"); return; }
        const tu = peers.get(msg.peer)?.uid, ts = tu && seats.get(tu);
        if (!ts || ts.seat === null || (ts.match.phase !== "countdown" && ts.match.phase !== "playing")) return oops(pid, "no_match", "그 크루는 지금 경기 중이 아니에요");
        if (s && s.seat !== null) return oops(pid, "playing", "경기 중에는 관전할 수 없어요");
        if (s?.match === ts.match) return sync(ts.match);
        if (pendingOf(u).length) return oops(pid, "pending", "대결 신청이 끝난 뒤에 관전해 주세요");
        if (ts.match.watchers.size >= DUEL.SPECTATORS) return oops(pid, "full", "관전석이 꽉 찼어요");
        if (s) unwatch(u, s.match.watchers.get(u));
        ts.match.watchers.set(u, pid); seats.set(u, { match: ts.match, seat: null }); after.delete(u);
        return sync(ts.match);
      }
      case "duel:forfeit": {
        if (!s || s.seat === null || (s.match.phase !== "countdown" && s.match.phase !== "playing")) return oops(pid, "no_match", "진행 중인 경기가 없어요");
        return finish(s.match, 1 - s.seat, "forfeit");
      }
      case "duel:records": {
        const q = UID_RE.test(msg.u) ? msg.u : u, r = rec.users[q];
        return tell(pid, { t: "duel:records", u: q, mine: q === u, name: r?.name || str(msg.name, 16) || "크루", w: r?.w || 0, l: r?.l || 0, d: r?.d || 0, best: r?.best || {}, top: rec.best });
      }
      case "duel:game": {
        if (!s || s.seat === null || s.match.id !== msg.id || s.match.phase !== "playing" || s.match.players[s.seat].peer !== pid) return;
        const { t: _t, id: _id, ...payload } = msg;
        games[s.match.game].message?.(s.match, s.seat, payload, api);
        return;
      }
    }
  }

  // 위치가 올 때마다(app.js "p"): 선수의 최근 위치를 3초치(+ 그 바로 앞 하나) 남긴다
  function presence(pid, p) {
    const u = peers.get(pid)?.uid, s = u && seats.get(u); if (!s || s.seat === null || !p) return;
    const pl = s.match.players[s.seat]; if (pl.peer !== pid) return;
    const t = now(); pl.hist.push({ ...p, at: t }); while (pl.hist.length > 1 && pl.hist[1].at < t - 3000) pl.hist.shift();   // 창 바로 앞 기록 하나는 남긴다(쏜 순간 비교용)
  }
  // 연결이 끊겼을 때(app.js close, peers에서 지우기 전에 부른다)
  function left(pid) {
    const u = peers.get(pid)?.uid; if (!u) return;
    if (![...peers].some(([q, p]) => q !== pid && p.uid === u)) prefs.delete(u);   // 그 사람의 마지막 연결이면 설정도 버린다(다시 붙으면 브라우저가 다시 보낸다)
    for (const inv of [...invites.values()]) if (inv.from.peer === pid || inv.to.peer === pid) { invites.delete(inv.id); inviteState(inv, "canceled"); }
    const s = seats.get(u); if (!s) return;
    if (s.seat === null) { if (s.match.watchers.get(u) === pid) { s.match.watchers.delete(u); seats.delete(u); sync(s.match); } return; }
    const p = s.match.players[s.seat]; if (p.peer !== pid || s.match.phase === "result") return;
    p.away = now(); sync(s.match);
  }
  // 대결장 위치를 받아 줄지(app.js sanitize): role 1 선수 · 2 관전 · 0 돌아가는 중
  function arenaOf(u) {
    const s = u && seats.get(u); if (s) return { ar: s.match.ar, floor: s.match.floor, role: s.seat === null ? 2 : 1 };
    const a = u && after.get(u); return a && a.until > now() ? { ar: a.ar, floor: a.floor, role: 0 } : null;
  }
  return { message, tick, presence, left, arenaOf, api, matches, invites, records: rec, matchOf: (u) => seats.get(u)?.match || null };
}
