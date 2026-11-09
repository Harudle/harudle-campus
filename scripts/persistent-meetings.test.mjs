import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDurableMediaState, openDurableMediaState } from "../server/media/durable-state.js";
import { openPersistentMeetings } from "../server/media/persistent-meetings.js";

const area = "12:12:회의실 보이저";
function fixture(t, now = Date.now) {
  const dir = mkdtempSync(join(tmpdir(), "campus-meetings-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "media.sqlite");
  initializeDurableMediaState({ path, period: "2026-11", now, budgets: { livekit: { limit: 1000, used: 100 }, livekit_bytes: { limit: 10000000, used: 100 }, daily: { limit: 1000, used: 100 }, cloudflare: { limit: 10000000, used: 100 } } });
  return path;
}

test("공개 및 비공개 회의는 서버가 바뀌어도 유지되고 다른 회의실에서는 들어갈 수 없다", async (t) => {
  const path = fixture(t); let old = openPersistentMeetings({ path });
  const open = await old.create({ area, title: "함께 공부", locked: false, password: "" });
  const locked = await old.create({ area, title: "비공개", locked: true, password: "abcdef12" });
  const next = openPersistentMeetings({ path });
  assert.deepEqual(next.list(area), [open, locked]);
  assert.equal(JSON.stringify(next.list(area)).includes("abcdef12"), false);
  await assert.rejects(next.join({ area, id: locked.id, password: "wrong123" }), /meeting_password_invalid/);
  assert.equal((await next.join({ area, id: locked.id, password: "abcdef12" })).id, locked.id);
  await assert.rejects(next.join({ area: "12:12:회의실 아폴로", id: locked.id, password: "abcdef12" }), /meeting_not_found/);
  old.close(); next.close(); old = openPersistentMeetings({ path });
  assert.equal(old.contains(area, locked.id), true); old.close();
  const state = openDurableMediaState(path); assert.equal(state.budget("daily").reserved, 100); state.close();
});

test("잘못된 비밀번호 시도는 워커를 바꿔도 제한하고 성공한 입장은 제한에 더하지 않는다", async (t) => {
  let clock = 1000000; const path = fixture(t, () => clock), first = openPersistentMeetings({ path, now: () => clock }), second = openPersistentMeetings({ path, now: () => clock });
  const room = await first.create({ area, title: "비공개", locked: true, password: "abcdef12" });
  for (let i = 0; i < 10; i++) assert.equal((await first.join({ area, id: room.id, password: "abcdef12" })).id, room.id);
  for (let i = 0; i < 8; i++) await assert.rejects((i % 2 ? first : second).join({ area, id: room.id, password: "wrong123" }), /meeting_password_invalid/);
  await assert.rejects(second.join({ area, id: room.id, password: "abcdef12" }), /meeting_rate_limited/);
  clock += 60001;
  assert.equal((await second.join({ area, id: room.id, password: "abcdef12" })).id, room.id);
  first.close(); second.close();
});

test("저장소가 없으면 새로 만들지 않고, 회의는 만료되면 표시하지 않는다", async (t) => {
  let clock = 1000000; const path = fixture(t, () => clock);
  assert.throws(() => openPersistentMeetings({ path: `${path}-missing` }), /meeting_store_missing/);
  const meetings = openPersistentMeetings({ path, now: () => clock, ttlMs: 60000 });
  const room = await meetings.create({ area, title: "잠시 모임", locked: false, password: "" });
  clock += 60001; assert.equal(meetings.contains(area, room.id), false); assert.deepEqual(meetings.list(area), []);
  await assert.rejects(meetings.join({ area, id: room.id, password: "" }), /meeting_not_found/); meetings.close();
});
