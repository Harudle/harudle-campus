// 채팅 명령어 중 결과를 모두가 믿어야 하는 것(주사위 · 뽑기). 서버가 굴려서 보내고, 서버 없이 볼 때만 브라우저가 같은 규칙으로 굴린다
// rand(n)은 0 이상 n 미만의 정수를 준다
export const CHAT_CMDS = ["me", "roll", "pick"];

export function rollText(arg, rand) {
  const s = String(arg ?? "").trim(), n = s ? Number(s) : 6;
  if (!Number.isInteger(n) || n < 2 || n > 1000) return null;
  return `🎲 1~${n} 주사위 → ${rand(n) + 1}`;
}

export function pickText(arg, rand) {
  const opts = String(arg ?? "").split(/[,\s]+/).map((v) => v.trim().slice(0, 20)).filter(Boolean);
  if (opts.length < 2 || opts.length > 20) return null;
  return `🎯 ${opts.join(" · ")} → ${opts[rand(opts.length)]}`;
}
