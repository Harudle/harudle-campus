import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";

// 로컬 시험용. 남아 있는 세션을 확인하지 않고 서버를 다시 시작하지 않는다.
export function openCloudflareTestJournal(path) {
  if (typeof path !== "string" || !isAbsolute(path)) throw new Error("invalid_test_journal");
  const lock = `${path}.lock`;
  try { mkdirSync(lock, { mode: 0o700 }); } catch { throw new Error("test_journal_locked"); }
  let sessions;
  try {
    const state = JSON.parse(readFileSync(path, "utf8"));
    if (state.version !== 1 || !Array.isArray(state.sessions) || state.sessions.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) throw new Error("invalid_test_journal");
    sessions = new Set(state.sessions);
    if (sessions.size !== state.sessions.length || sessions.size) throw new Error("test_cleanup_required");
  } catch (error) { rmdirSync(lock); throw error; }
  const save = () => {
    const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    let fd;
    try {
      fd = openSync(tmp, "wx", 0o600);
      writeFileSync(fd, JSON.stringify({ version: 1, sessions: [...sessions] }));
      fsyncSync(fd); closeSync(fd); fd = undefined;
      renameSync(tmp, path);
      const dir = openSync(dirname(path), "r");
      try { fsyncSync(dir); } finally { closeSync(dir); }
    } finally { if (fd !== undefined) closeSync(fd); try { unlinkSync(tmp); } catch { } }
  };
  let closed = false;
  return {
    add(id) { if (closed || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) || sessions.has(id)) throw new Error("test_journal_unavailable"); sessions.add(id); save(); },
    remove(id) { if (closed || !sessions.has(id)) throw new Error("test_journal_unavailable"); sessions.delete(id); save(); },
    close() { if (!closed) { closed = true; rmdirSync(lock); } },
  };
}
