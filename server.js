// 하루들 우테코 캠퍼스 — 감독 프로세스 (무중단 배포)
//
//   systemd ── node server.js (감독, 포트를 쥐고 있다)
//                 └─ 워커(app.js) ← 요청·WebSocket은 전부 여기서 처리
//
// 배포 흐름 (main에 푸시하면 20초 안에 시작)
//   1. origin/main에 새 커밋이 있는지 본다
//   2. 새 코드를 임시 폴더에 풀어 검사한다 (문법 · 층 배치 · 끼임)  → 실패하면 배포하지 않는다
//   3. 작업 폴더를 새 커밋으로 옮기고, 같은 포트에 새 워커를 띄운다
//   4. 새 워커가 "준비됐어요"를 보내면 옛 워커를 비운다 (새 연결 중단 → 처리 중인 요청 마무리 → 종료)
//      접속 중인 크루는 WebSocket이 끊기자마자 새 워커로 다시 붙는다
//   5. 새 워커가 30초 안에 준비되지 않으면 되돌린다: 새 워커 종료, 작업 폴더를 이전 커밋으로
//
// 감독 코드(이 파일) 자체가 바뀐 커밋은 워커만 교체하고, 다음 재시작 때 반영된다.
import cluster from "node:cluster";

if (!cluster.isPrimary) {
  await import("./app.js");
} else {
  const { execFile } = await import("node:child_process");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);

  const DIR = dirname(fileURLToPath(import.meta.url));
  const POLL = Number(process.env.DEPLOY_POLL_MS || 20000);
  const AUTO = process.env.AUTO_DEPLOY !== "0" && process.env.NODE_ENV === "production";
  const READY_TIMEOUT = 30000;
  const env = { ...process.env, npm_config_cache: join(tmpdir(), "wm-npm-cache"), GIT_TERMINAL_PROMPT: "0" };
  const git = async (...a) => (await run("git", a, { cwd: DIR, env, maxBuffer: 1 << 24 })).stdout.trim();
  const log = (...a) => console.log("[deploy]", ...a);

  let current = null, version = "dev", busy = false, stopping = false;
  const bad = new Set();   // 검사나 기동에 실패한 커밋은 다시 시도하지 않는다
  try { version = await git("rev-parse", "HEAD"); } catch { }

  // 워커 하나를 띄우고 준비될 때까지 기다린다
  function spawn(v) {
    return new Promise((resolve, reject) => {
      const w = cluster.fork({ APP_VERSION: v });
      const timer = setTimeout(() => { w.removeListener("message", onMsg); w.kill(); reject(new Error("ready timeout")); }, READY_TIMEOUT);
      const onMsg = (m) => { if (m && m.t === "ready") { clearTimeout(timer); w.removeListener("message", onMsg); resolve(w); } };
      w.on("message", onMsg);
      w.once("exit", (code) => { clearTimeout(timer); reject(new Error(`worker exited (${code})`)); });
    });
  }
  // 옛 워커 비우기
  function retire(w) {
    if (!w || w.isDead()) return;
    w.intentional = true; w.send({ t: "drain" });
    setTimeout(() => { if (!w.isDead()) w.kill("SIGKILL"); }, 15000).unref();
  }
  // 평소에 워커가 죽으면 바로 다시 띄운다
  cluster.on("exit", (w, code, sig) => {
    if (w !== current || w.intentional || stopping) return;
    log(`worker died (${code ?? sig}), restarting`);
    current = null; setTimeout(() => boot().catch((e) => log("restart failed", e.message)), 1000);
  });
  async function boot() { current = await spawn(version.slice(0, 12)); log(`serving ${version.slice(0, 7)}`); }

  // 새 커밋을 임시 폴더에 풀어 검사
  async function check(sha) {
    const tmp = await mkdtemp(join(tmpdir(), "wm-check-"));
    try {
      await run("sh", ["-c", `git archive ${sha} | tar -x -C "${tmp}"`], { cwd: DIR, env });
      await run(process.execPath, ["scripts/check.mjs"], { cwd: tmp, env, timeout: 60000 });
      return true;
    } catch (e) { log(`check failed for ${sha.slice(0, 7)}:`, (e.stdout || e.stderr || e.message || "").toString().slice(-600)); return false; }
    finally { await rm(tmp, { recursive: true, force: true }); }
  }

  async function deploy() {
    if (busy || stopping) return; busy = true;
    try {
      await git("fetch", "--depth", "1", "-q", "origin", "main");
      const next = await git("rev-parse", "origin/main");
      if (next === version || bad.has(next)) return;
      log(`new commit ${next.slice(0, 7)} (now ${version.slice(0, 7)})`);
      if (!(await check(next))) { bad.add(next); return; }
      const prev = version;
      const pkgChanged = await git("diff", "--name-only", prev, next, "--", "package.json", "package-lock.json").then(Boolean, () => true);
      const selfChanged = await git("diff", "--name-only", prev, next, "--", "server.js").then(Boolean, () => false);
      await git("reset", "--hard", "-q", next);
      if (pkgChanged) await run("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], { cwd: DIR, env, timeout: 180000 });
      const old = current;
      try {
        current = await spawn(next.slice(0, 12)); version = next;
        retire(old);
        log(`switched to ${next.slice(0, 7)} without downtime${selfChanged ? " (server.js 변경은 다음 재시작 때 반영)" : ""}`);
      } catch (e) {
        log(`new worker failed (${e.message}) — rolling back to ${prev.slice(0, 7)}`);
        current = old; bad.add(next);
        await git("reset", "--hard", "-q", prev);
        if (pkgChanged) await run("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], { cwd: DIR, env, timeout: 180000 }).catch(() => { });
      }
    } catch (e) { log("deploy error:", e.message); }
    finally { busy = false; }
  }

  // systemctl stop/restart: 워커를 비우고 끝낸다
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => {
    stopping = true; for (const w of Object.values(cluster.workers)) retire(w);
    setTimeout(() => process.exit(0), 12000).unref();
    cluster.on("exit", () => { if (!Object.keys(cluster.workers).length) process.exit(0); });
  });

  await boot();
  if (AUTO) { log(`watching origin/main every ${POLL / 1000}s`); setInterval(deploy, POLL); setTimeout(deploy, 3000); }
}
