import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";

// 토큰 발급 전에 최대 사용 시간을 예약한다. 실제 사용이 짧아도 돌려주지 않는다.
// 이 파일은 여러 워커가 같은 로컬 파일을 공유하는 환경에서만 사용한다.
function periodAt(time) { return new Date(time).toISOString().slice(0, 7); }
function nextPeriodAt(time) {
  const d = new Date(time);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}
function validInt(value) { return Number.isSafeInteger(value) && value >= 0; }
function lock(path) {
  try { mkdirSync(`${path}.lock`, { mode: 0o700 }); }
  catch { throw new Error("budget_unavailable"); }
}
function unlock(path) { rmdirSync(`${path}.lock`); }
function save(path, state) {
  const temp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  let fd;
  try {
    fd = openSync(temp, "wx", 0o600);
    writeFileSync(fd, JSON.stringify(state));
    fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temp, path);
    const dir = openSync(dirname(path), "r");
    try { fsyncSync(dir); } finally { closeSync(dir); }
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temp); } catch { }
  }
}

// 초기화는 명시적으로 한 번만 한다. 기존 파일을 덮어써 사용량을 지우지 않는다.
export function initializeMonthlyBudget({ path, provider, limitSeconds, initialUsedSeconds, now = Date.now() }) {
  if (!isAbsolute(path) || !provider || !validInt(limitSeconds) || !limitSeconds || !validInt(initialUsedSeconds) || initialUsedSeconds > limitSeconds || !Number.isFinite(now)) throw new Error("invalid_budget_config");
  const state = { version: 1, provider, limitSeconds, period: periodAt(now), reservedSeconds: initialUsedSeconds };
  let fd;
  try {
    fd = openSync(path, "wx", 0o600);
    writeFileSync(fd, JSON.stringify(state)); fsyncSync(fd);
  } finally { if (fd !== undefined) closeSync(fd); }
  const dir = openSync(dirname(path), "r");
  try { fsyncSync(dir); } finally { closeSync(dir); }
}

export function createMonthlyBudget({ path, provider, limitSeconds, leaseSeconds, now = Date.now }) {
  if (!isAbsolute(path) || !provider || !validInt(limitSeconds) || !limitSeconds || !validInt(leaseSeconds) || !leaseSeconds || typeof now !== "function") throw new Error("invalid_budget_config");
  return {
    reserve() {
      lock(path);
      try {
        let state;
        try { state = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error("budget_unavailable"); }
        if (state.version !== 1 || state.provider !== provider || state.limitSeconds !== limitSeconds || !/^\d{4}-\d{2}$/.test(state.period) || !validInt(state.reservedSeconds) || state.reservedSeconds > limitSeconds) throw new Error("budget_unavailable");
        const time = now();
        if (!Number.isFinite(time)) throw new Error("budget_unavailable");
        const period = periodAt(time);
        if (period < state.period) throw new Error("budget_unavailable");
        if (period > state.period) { state.period = period; state.reservedSeconds = 0; }
        // 발급한 이용권이 다음 달까지 이어지지 않도록 월 경계에서 만료한다.
        const expiresAt = Math.min(Math.floor(time / 1000) + leaseSeconds, Math.floor(nextPeriodAt(time) / 1000));
        const seconds = expiresAt - Math.floor(time / 1000);
        if (seconds < 30 || state.reservedSeconds + seconds > limitSeconds) throw new Error("budget_exhausted");
        state.reservedSeconds += seconds;
        save(path, state);
        return { expiresAt, reservedSeconds: seconds };
      } catch (e) {
        if (e?.message === "budget_exhausted" || e?.message === "budget_unavailable") throw e;
        throw new Error("budget_unavailable");
      } finally { unlock(path); }
    },
  };
}
