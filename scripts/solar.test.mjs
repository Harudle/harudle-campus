import assert from "node:assert/strict";
import { test } from "node:test";
import { campusMoon, campusSun } from "../dist-check/solar.mjs";

const at = (date) => campusSun(Date.parse(date));

test("판교의 해는 아침에 동쪽에 있고 저녁에 서쪽에 있다", () => {
  const morning = at("2026-06-01T05:15:00+09:00");
  const evening = at("2026-06-01T19:30:00+09:00");
  assert.ok(morning.x > 0.5 && morning.y > 0 && morning.y < .05);
  assert.ok(evening.x < -0.5 && evening.y > 0 && evening.y < .1);
  assert.ok(morning.twilight > .9 && evening.twilight > .9);
});

test("낮에서 일몰과 밤으로 갈수록 자연스럽게 어두워진다", () => {
  const noon = at("2026-06-01T12:00:00+09:00");
  const evening = at("2026-06-01T19:30:00+09:00");
  const afterSunset = at("2026-06-01T20:00:00+09:00");
  const midnight = at("2026-06-02T00:00:00+09:00");
  assert.ok(noon.y > .9 && noon.daylight > .99);
  assert.ok(noon.daylight > evening.daylight && evening.daylight > afterSunset.daylight);
  assert.ok(afterSunset.daylight > midnight.daylight);
  assert.equal(midnight.daylight, 0);
  assert.equal(midnight.twilight, 0);
});

test("같은 오후 6시라도 계절에 따라 해가 있는 위치가 다르다", () => {
  const summer = at("2026-06-01T18:00:00+09:00");
  const winter = at("2026-12-01T18:00:00+09:00");
  assert.ok(summer.y > 0);
  assert.ok(winter.y < 0);
  assert.ok(summer.daylight > winter.daylight);
});

test("달의 밝은 면은 날짜에 따라 변하고 방향은 단위 벡터다", () => {
  // NASA 2026 Moon Phases: 6월 15일은 삭, 6월 29일은 보름이다.
  // https://eclipse.gsfc.nasa.gov/SKYCAL/SKYCAL.html?cal=2026
  const newMoon = campusMoon(Date.parse("2026-06-15T03:00:00Z"));
  const fullMoon = campusMoon(Date.parse("2026-06-30T00:00:00Z"));
  assert.ok(newMoon.fraction < .02);
  assert.ok(fullMoon.fraction > .98);
  // 보름 무렵 낮에는 지평선 아래에 있고 밤에는 위에 있다.
  assert.ok(campusMoon(Date.parse("2026-06-29T12:00:00+09:00")).y < 0);
  assert.ok(campusMoon(Date.parse("2026-06-29T23:00:00+09:00")).y > 0);
  for (const moon of [newMoon, fullMoon]) {
    assert.ok(Math.abs(Math.hypot(moon.x, moon.y, moon.z) - 1) < 1e-9);
    assert.ok(Number.isFinite(moon.tilt));
  }
});
