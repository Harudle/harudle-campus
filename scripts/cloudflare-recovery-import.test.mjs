import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { initializeDurableMediaState, openDurableMediaState } from "../server/media/durable-state.js";

test("이전 Cloudflare 예약을 포함한 경우에만 미확인 세션을 중복 없이 가져온다", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "campus-recovery-import-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = join(dir, "old.sqlite"), target = join(dir, "new.sqlite"), poor = join(dir, "poor.sqlite"), period = new Date().toISOString().slice(0, 7);
  const budgets = (used) => ({ livekit: { limit: 1000, used: 0 }, livekit_bytes: { limit: 1000, used: 0 }, daily: { limit: 1000, used: 0 }, cloudflare: { limit: 1000, used } });
  initializeDurableMediaState({ path: source, period, budgets: budgets(0) });
  initializeDurableMediaState({ path: target, period, budgets: budgets(200) });
  initializeDurableMediaState({ path: poor, period, budgets: budgets(0) });
  const old = new DatabaseSync(source);
  old.prepare("INSERT INTO reservation VALUES(?,?,?,?,?,?)").run("r1", period, "cloudflare", 0, 100, Math.floor(Date.now() / 1000) + 30);
  old.prepare("INSERT INTO resource VALUES(?,?,?,?,?,?,?,?)").run("cf:session-test", "cloudflare", 0, "session", "session-test", Math.floor(Date.now() / 1000) + 30, 1, 0);
  old.close();
  // 곧 만료될 임시 예약은 이전 사용량의 기준값을 대신할 수 없다.
  const poorDb = new DatabaseSync(poor);
  poorDb.prepare("INSERT INTO reservation VALUES(?,?,?,?,?,?)").run("temporary", period, "cloudflare", 0, 200, Math.floor(Date.now() / 1000) + 30);
  poorDb.close();
  const run = (destination) => spawnSync(process.execPath, ["scripts/import-cloudflare-recovery.mjs"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, MEDIA_LEGACY_STATE_PATH: source, MEDIA_STATE_PATH: destination, MEDIA_LEGACY_SAME_APP_CONFIRMED: "1" } });
  assert.notEqual(run(poor).status, 0);
  assert.equal(run(target).status, 0); assert.equal(run(target).status, 0);
  const state = openDurableMediaState(target);
  assert.deepEqual(state.externalCloudflareSessions().map((r) => ({ ...r })), [{ session_id: "session-test", pending: 1 }]);
  assert.equal(state.budget("cloudflare").reserved, 200); state.close();
  const checked = new DatabaseSync(target, { readOnly: true });
  assert.ok(checked.prepare("SELECT baseline_until FROM initialization WHERE id=1").get().baseline_until >= Math.floor(Date.now() / 1000) + 35 * 86400);
  checked.close();
});
