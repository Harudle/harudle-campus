import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { transform } from "esbuild";

// 실제 회의 선택 코드에서 목록과 입력 메시지의 상태 변화를 확인한다.
const source = await readFile(new URL("../src/media/meetings.ts", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "ts", format: "esm", target: "es2022" });
const { mountMeetings } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
class Element {
  constructor() { this.children = []; this.dataset = {}; this.value = ""; this.textContent = ""; this.hidden = false; this.open = false; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; this.textContent = ""; }
  querySelectorAll(selector) { return selector === "button" ? this.children.flatMap((c) => [ ...(c.tagName === "BUTTON" ? [c] : []), ...c.querySelectorAll("button") ]) : []; }
  contains(item) { return this.children.includes(item) || this.children.some((c) => c.contains(item)); }
  setAttribute() {}
  reportValidity() { return true; }
}
function fixture(t, request, beforeChoose = async () => {}) {
  const oldDocument = globalThis.document, oldWindow = globalThis.window, items = new Map(), timers = [];
  for (const id of ["meetingPanel", "meetingSelection", "meetingChatHint", "meetingDetails", "meetingList", "meetingCreate", "meetingTitle", "meetingPrivacy", "meetingCreatePasswordLabel", "meetingCreatePassword", "meetingMessage"]) items.set(id, new Element());
  items.get("meetingPrivacy").value = "public";
  globalThis.document = { getElementById: (id) => items.get(id), activeElement: null, createElement: (name) => { const e = new Element(); e.tagName = name.toUpperCase(); return e; } };
  globalThis.window = { setInterval: (fn) => { timers.push(fn); return 1; } };
  t.after(() => { globalThis.document = oldDocument; globalThis.window = oldWindow; });
  const controls = mountMeetings(request, beforeChoose, () => {});
  controls.setEnabled(true); controls.setNetwork(true); controls.setArea("12:12:회의실 보이저");
  return { items, timers, controls };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("회의 목록 오류가 사라지면 이전 오류 문구도 사라진다", async (t) => {
  let calls = 0;
  const { items, timers } = fixture(t, async () => { if (++calls === 1) throw new Error("meeting_area_required"); return []; });
  await settle();
  assert.match(items.get("meetingMessage").textContent, /회의실 위치/);
  timers[0](); await settle();
  assert.equal(items.get("meetingMessage").textContent, "");
  assert.equal(items.get("meetingList").textContent, "아직 만든 회의가 없어요.");
});

test("회의 만들기 오류는 목록 조회가 성공해도 사용자가 확인할 수 있다", async (t) => {
  const { items } = fixture(t, async (operation) => { if (operation === "create") throw new Error("invalid_meeting"); return []; });
  await settle(); items.get("meetingTitle").value = "시험 회의";
  items.get("meetingCreate").onsubmit({ preventDefault() {} }); await settle();
  assert.match(items.get("meetingMessage").textContent, /회의 이름과 비밀번호/);
  assert.equal(items.get("meetingTitle").value, "시험 회의");
});

test("이전 연결을 닫는 동안 위치가 바뀌면 다른 회의실에 회의를 만들지 않는다", async (t) => {
  let finish; const wait = new Promise((resolve) => { finish = resolve; }); const operations = [];
  const { items, controls } = fixture(t, async (operation) => { operations.push(operation); return []; }, () => wait);
  await settle(); items.get("meetingTitle").value = "시험 회의";
  items.get("meetingCreate").onsubmit({ preventDefault() {} });
  controls.setArea("12:12:회의실 아폴로"); finish(); await settle();
  assert.equal(operations.includes("create"), false);
});
