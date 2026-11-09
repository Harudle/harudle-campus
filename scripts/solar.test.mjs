import assert from "node:assert/strict";
import { test } from "node:test";
import { campusSun } from "../dist-check/solar.mjs";

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
