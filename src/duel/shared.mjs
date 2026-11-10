// 1:1 대결: 서버와 브라우저가 같이 쓰는 종목 목록과 상수 (docs/duel.md)
// 층은 건물 위 하늘에 떠 있는 가상 층이다. 별칭은 채팅 명령어(/대결 이름 종목)에서 종목 이름으로 받는다
export const DUEL_GAMES = [
  { id: "jump", name: "점프맵", floor: 21, icon: "🏃", alias: ["점프맵", "점프", "jump"], desc: "발판을 밟고 먼저 도착하기" },
  { id: "shoot", name: "사격 대결", floor: 22, icon: "🎯", alias: ["사격", "사격대결", "총", "shoot"], desc: "종이 총으로 서로 맞히기" },
  { id: "target", name: "과녁 사격", floor: 23, icon: "🎪", alias: ["과녁", "과녁사격", "target"], desc: "움직이는 과녁 많이 맞히기" },
  { id: "box", name: "복싱", floor: 24, icon: "🥊", alias: ["복싱", "권투", "box", "boxing"], desc: "링에서 주먹 대결" },
];
export const ARENA_FLOORS = DUEL_GAMES.map((g) => g.floor);
export const isArena = (f) => ARENA_FLOORS.includes(f);
export const duelGame = (id) => DUEL_GAMES.find((g) => g.id === id) || null;
export const gameAtFloor = (f) => DUEL_GAMES.find((g) => g.floor === f) || null;
// 종목 이름 · 별칭(띄어쓰기 · 대소문자 무시)으로 찾기
export const findGame = (q) => { const k = String(q ?? "").replace(/\s+/g, "").toLowerCase(); return k ? DUEL_GAMES.find((g) => g.id === k || g.alias.some((a) => a.toLowerCase() === k)) || null : null; };

// 시간은 모두 ms. MOVE: 수락 뒤 대결장으로 옮겨 가는 동안 · COUNTDOWN: 3·2·1 · GRACE: 끊긴 선수를 기다리는 시간 · AFTER: 경기가 닫힌 뒤에도 대결장 위치를 받아 주는 시간(돌아가는 중)
export const DUEL = { INVITE: 30000, COOLDOWN: 5000, MOVE: 1200, COUNTDOWN: 3000, RESULT: 5000, GRACE: 20000, AFTER: 5000, TICK: 100, SPECTATORS: 20, DURATION: 180000 };
export const DUEL_REASON = { finish: "도착", timeout: "시간 종료", forfeit: "기권", disconnect: "연결 끊김", ko: "KO", score: "점수" };
// 0:42.31
export const fmtMs = (ms) => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`; };
// 화면에 넣을 글을 HTML로 이스케이프(대결 화면들이 같이 쓴다)
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
