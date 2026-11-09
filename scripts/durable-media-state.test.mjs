import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { initializeDurableMediaState, openDurableMediaState, upgradeDurableMediaState } from "../server/media/durable-state.js";

const TIME = Date.parse("2026-11-09T01:00:00Z"), EXP = Math.floor(TIME / 1000) + 60;
const budgets = { livekit: { limit: 60, used: 0 }, livekit_bytes: { limit: 5000, used: 0 }, daily: { limit: 120, used: 0 }, cloudflare: { limit: 5000, used: 0 } };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "campus-media-state-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "state.sqlite");
  initializeDurableMediaState({ path, period: "2026-11", budgets, now: () => TIME });
  return { path, open: (now = () => TIME) => openDurableMediaState(path, { now }) };
}

test("사용량과 선택된 제공자는 서버를 다시 열어도 유지된다", (t) => {
  const f = fixture(t); let db = f.open();
  assert.equal(db.state().phase, "recovering"); db.completeCleanup();
  db.reserve({ provider: "livekit", generation: 0, amount: 60, expiresAt: EXP });
  db.close(); db = f.open();
  assert.equal(db.budget("livekit").reserved, 60);
  assert.throws(() => db.reserve({ provider: "livekit", generation: 0, amount: 60, expiresAt: EXP }), /budget_exhausted/);
  assert.throws(() => initializeDurableMediaState({ path: f.path, period: "2026-11", budgets }), /EEXIST/);
  db.close();
  assert.throws(() => openDurableMediaState(join(tmpdir(), "missing-campus-media-state-12345")), /media_state_missing/);
});

test("전환 중이나 미완료 연결이 남은 동안 다음 제공자를 열지 않는다", (t) => {
  const f = fixture(t); let db = f.open(); db.completeCleanup();
  db.registerResource({ key: "room-a", provider: "livekit", generation: 0, kind: "room", locator: "campus-room-a", expiresAt: EXP });
  db.setPending("room-a", true);
  const transition = db.beginSwitch({ provider: "livekit", generation: 0 });
  assert.equal(transition.to, "daily");
  assert.throws(() => db.registerResource({ key: "late", provider: "livekit", generation: 0, kind: "room", locator: "other", expiresAt: EXP }), /media_state_changed/);
  assert.throws(() => db.closeResource("room-a"), /cleanup_unconfirmed/);
  assert.throws(() => db.completeCleanup({ transitionId: transition.id }), /cleanup_unconfirmed/);
  db.close(); db = f.open();
  assert.equal(db.state().phase, "switching");
  db.setPending("room-a", false); db.closeResource("room-a");
  assert.equal(db.completeCleanup({ transitionId: transition.id }).provider, "daily");
  assert.equal(db.state().generation, 1); db.close();
});

test("월이 바뀌어도 35일 동안 예약을 유지하고 이후에만 자동으로 여유가 생긴다", (t) => {
  const f = fixture(t); let db = f.open(); db.completeCleanup();
  db.reserve({ provider: "livekit", generation: 0, amount: 60, expiresAt: EXP });
  db.close(); db = f.open(() => Date.parse("2026-12-01T00:00:10Z"));
  assert.equal(db.budget("livekit").reserved, 60);
  assert.throws(() => db.reserve({ provider: "livekit", generation: 0, amount: 60, expiresAt: Math.floor(Date.parse("2026-12-01T00:01:10Z") / 1000) }), /budget_exhausted/);
  db.close(); db = f.open(() => (EXP + 35 * 86400) * 1000);
  assert.equal(db.budget("livekit").reserved, 0);
  db.reserve({ provider: "livekit", generation: 0, amount: 60, expiresAt: EXP + 35 * 86400 + 60 });
  assert.equal(db.budget("livekit").reserved, 60); db.close();
});

test("처음 입력한 기존 사용량도 35일 동안 유지한다", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "campus-baseline-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "state.sqlite");
  initializeDurableMediaState({ path, period: "2026-11", now: () => TIME, budgets: { ...budgets, daily: { limit: 120, used: 100 } } });
  let db = openDurableMediaState(path, { now: () => TIME + 34 * 86400000 }); assert.equal(db.budget("daily").reserved, 100); db.close();
  db = openDurableMediaState(path, { now: () => TIME + 35 * 86400000 }); assert.equal(db.budget("daily").reserved, 0); db.close();
});

test("동일한 서버에서 두 프로세스가 동시에 미디어 관리를 시작하지 않는다", (t) => {
  const f = fixture(t), first = f.open(), second = f.open();
  first.acquireLeadership(); first.assertLeadership();
  assert.throws(() => second.acquireLeadership(), /media_leader_active/);
  first.releaseLeadership(); second.acquireLeadership(); second.assertLeadership();
  assert.throws(() => first.assertLeadership(), /media_leadership_lost/);
  second.releaseLeadership(); first.close(); second.close();
});

test("LiveKit 시간과 전송량은 둘 다 여유가 있을 때 함께 예약한다", (t) => {
  const f = fixture(t), db = f.open(); db.completeCleanup();
  assert.throws(() => db.reserveAmounts({ provider: "livekit", generation: 0, amounts: { livekit: 60, livekit_bytes: 5001 }, expiresAt: EXP }), /budget_exhausted/);
  assert.equal(db.budget("livekit").reserved, 0);
  assert.equal(db.budget("livekit_bytes").reserved, 0);
  db.reserveAmounts({ provider: "livekit", generation: 0, amounts: { livekit: 60, livekit_bytes: 5000 }, expiresAt: EXP });
  assert.equal(db.budget("livekit").reserved, 60);
  assert.equal(db.budget("livekit_bytes").reserved, 5000); db.close();
});

test("기존 DB는 사용량을 보존하며 확인된 전송량을 입력해야 업그레이드한다", (t) => {
  const f = fixture(t); let db = f.open(); db.completeCleanup();
  db.reserve({ provider: "livekit", generation: 0, amount: 60, expiresAt: EXP }); db.close();
  const old = new DatabaseSync(f.path);
  old.exec("DELETE FROM budget WHERE provider='livekit_bytes'; ALTER TABLE initialization DROP COLUMN livekit_bytes_until; PRAGMA user_version=2"); old.close();
  assert.throws(() => f.open(), /media_state_upgrade_required/);
  assert.throws(() => upgradeDurableMediaState({ path: f.path, livekitBytes: { limit: 1000, used: -1 }, now: () => TIME }), /invalid_media_state_config/);
  upgradeDurableMediaState({ path: f.path, livekitBytes: { limit: 1000, used: 300 }, now: () => TIME });
  db = f.open(); assert.equal(db.budget("livekit").reserved, 60); assert.equal(db.budget("livekit_bytes").reserved, 300); db.close();
});

test("여러 프로세스가 마지막 예약을 동시에 요청해도 한 번만 성공한다", async (t) => {
  const f = fixture(t), db = f.open(); db.completeCleanup(); db.close();
  const moduleUrl = new URL("../server/media/durable-state.js", import.meta.url).href;
  const code = `import {openDurableMediaState} from ${JSON.stringify(moduleUrl)}; const db=openDurableMediaState(process.env.TEST_STATE,{now:()=>${TIME}});try{db.reserve({provider:'livekit',generation:0,amount:60,expiresAt:${EXP}});console.log('ok')}catch(e){console.log(e.message)}finally{db.close()}`;
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, TEST_STATE: f.path }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = ""; child.stdout.on("data", (x) => out += x); child.stderr.on("data", (x) => err += x);
    child.on("error", reject); child.on("close", (status) => status === 0 ? resolve(out.trim()) : reject(new Error(err)));
  });
  const results = await Promise.all(Array.from({ length: 8 }, run));
  assert.equal(results.filter((x) => x === "ok").length, 1);
  assert.equal(results.filter((x) => x === "budget_exhausted").length, 7);
});
