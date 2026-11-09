import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createMonthlyBudget, initializeMonthlyBudget } from "../server/media/monthly-budget.js";

test("발급 전에 시간을 예약하고, 재시작해도 한도를 넘기지 않는다", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "campus-budget-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "daily.json"), now = Date.UTC(2026, 10, 9);
  const options = { path, provider: "daily", limitSeconds: 120, leaseSeconds: 60, now: () => now };
  initializeMonthlyBudget({ ...options, initialUsedSeconds: 0, now });
  assert.throws(() => initializeMonthlyBudget({ ...options, initialUsedSeconds: 0, now }), { code: "EEXIST" });
  assert.equal(createMonthlyBudget(options).reserve().expiresAt, now / 1000 + 60);
  assert.equal(createMonthlyBudget(options).reserve().reservedSeconds, 60);
  assert.throws(() => createMonthlyBudget(options).reserve(), /budget_exhausted/);
  assert.equal(JSON.parse(readFileSync(path, "utf8")).reservedSeconds, 120);
});

test("월 경계에서 이전 토큰을 만료시키고 다음 달 사용량을 따로 센다", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "campus-budget-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "daily.json");
  let now = Date.UTC(2026, 10, 30, 23, 59, 0);
  const options = { path, provider: "daily", limitSeconds: 90, leaseSeconds: 90, now: () => now };
  initializeMonthlyBudget({ ...options, initialUsedSeconds: 0, now });
  assert.equal(createMonthlyBudget(options).reserve().expiresAt, Date.UTC(2026, 11, 1) / 1000);
  now = Date.UTC(2026, 11, 1, 0, 0, 0);
  assert.equal(createMonthlyBudget(options).reserve().reservedSeconds, 90);
  now = Date.UTC(2026, 10, 1);
  assert.throws(() => createMonthlyBudget(options).reserve(), /budget_unavailable/);
});

test("사용량 파일이 없거나 손상되면 연결을 허용하지 않는다", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "campus-budget-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "daily.json");
  const options = { path, provider: "daily", limitSeconds: 120, leaseSeconds: 60 };
  assert.throws(() => createMonthlyBudget(options).reserve(), /budget_unavailable/);
  writeFileSync(path, "bad data");
  assert.throws(() => createMonthlyBudget(options).reserve(), /budget_unavailable/);
});

test("여러 서버 프로세스가 동시에 요청해도 남은 시간을 중복 예약하지 않는다", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "campus-budget-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "daily.json"), now = Date.UTC(2026, 10, 9);
  initializeMonthlyBudget({ path, provider: "daily", limitSeconds: 60, initialUsedSeconds: 0, now });
  const script = `import {createMonthlyBudget} from ${JSON.stringify(new URL('../server/media/monthly-budget.js', import.meta.url).href)};\n` +
    `try { createMonthlyBudget({path:process.argv[1],provider:'daily',limitSeconds:60,leaseSeconds:60,now:()=>${now}}).reserve(); process.stdout.write('reserved'); } catch { process.stdout.write('blocked'); }`;
  const children = Array.from({ length: 8 }, () => spawn(process.execPath, ["--input-type=module", "-e", script, path]));
  const results = await Promise.all(children.map(async (child) => {
    let output = ""; child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk) => { output += chunk; });
    const [code] = await once(child, "close"); assert.equal(code, 0); return output;
  }));
  assert.equal(results.filter((x) => x === "reserved").length, 1);
  assert.equal(JSON.parse(readFileSync(path, "utf8")).reservedSeconds, 60);
});
