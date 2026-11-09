import { isAbsolute } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { openDurableMediaState } from "../server/media/durable-state.js";

// 서버를 모두 멈춘 다음, 같은 Cloudflare 앱의 기존 시험 기록만 가져온다.
const source = process.env.MEDIA_LEGACY_STATE_PATH, target = process.env.MEDIA_STATE_PATH;
let old, dest;
try {
  if (process.env.MEDIA_LEGACY_SAME_APP_CONFIRMED !== "1" || !isAbsolute(source || "") || !isAbsolute(target || "") || !existsSync(source) || !existsSync(target) || realpathSync(source) === realpathSync(target)) throw new Error("invalid_import_config");
  old = new DatabaseSync(source, { readOnly: true });
  if (![2, 3].includes(old.prepare("PRAGMA user_version").get().user_version)) throw new Error("invalid_import_state");
  const leader = old.prepare("SELECT pid FROM leader WHERE id=1").get();
  if (leader) {
    let alive = true; try { process.kill(leader.pid, 0); } catch (error) { if (error?.code === "ESRCH") alive = false; }
    if (alive) throw new Error("media_leader_active");
  }
  const rows = old.prepare("SELECT locator,pending FROM resource WHERE provider='cloudflare' AND kind='session' AND closed=0").all();
  if (rows.some((r) => !/^[a-zA-Z0-9_-]{1,128}$/.test(r.locator) || ![0, 1].includes(r.pending))) throw new Error("invalid_import_state");
  const legacy = old.prepare("SELECT COALESCE(SUM(amount),0) AS total, COALESCE(MAX(expires_at),0) AS expires FROM reservation WHERE provider='cloudflare'").get();
  const legacyReserved = legacy.total, baselineUntil = Math.max(Math.floor(Date.now() / 1000), legacy.expires) + 35 * 86400;
  if (!Number.isSafeInteger(legacyReserved) || legacyReserved < 0 || !Number.isSafeInteger(baselineUntil)) throw new Error("invalid_import_state");
  const state = openDurableMediaState(target);
  state.close();
  dest = new DatabaseSync(target); dest.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
  let included;
  try {
    if (dest.prepare("SELECT count(*) AS n FROM leader").get().n) throw new Error("media_leader_active");
    included = dest.prepare("SELECT reserved FROM budget WHERE period=(SELECT period FROM media_state WHERE id=1) AND provider='cloudflare'").get()?.reserved;
    if (!Number.isSafeInteger(included) || included < legacyReserved) throw new Error("legacy_reservations_not_included");
    // 임시 예약이 먼저 만료되어도 예전 시험의 기준값은 최소 35일 유지한다.
    dest.prepare("UPDATE initialization SET baseline_until=MAX(baseline_until,?) WHERE id=1").run(baselineUntil);
    const insert = dest.prepare("INSERT INTO cloudflare_recovery(session_id,pending) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET pending=MAX(pending,excluded.pending)");
    for (const row of rows) insert.run(row.locator, row.pending);
    dest.exec("COMMIT");
  } catch (error) { try { dest.exec("ROLLBACK"); } catch {} throw error; }
  console.log(JSON.stringify({ importedUnresolved: rows.length, legacyReservedBytes: legacyReserved, includedInTargetBytes: included }));
} catch (error) {
  console.error(`이전 시험 기록 가져오기 실패: ${/^[a-z_]+$/.test(error?.message || "") ? error.message : "unavailable"}`);
  process.exitCode = 1;
} finally { old?.close(); dest?.close(); }
