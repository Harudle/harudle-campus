import assert from "node:assert/strict";
import { test } from "node:test";
import { createWeatherService } from "../weather.js";

const sample = (time, code = 61) => ({ current: { time: time / 1000, weather_code: code, cloud_cover: 80, temperature_2m: 8 } });

test("여러 접속자가 같은 날씨 요청을 공유하고 15분 동안 보관한다", async () => {
  let time = 1_800_000_000_000, calls = 0;
  const service = createWeatherService({ now: () => time, fetcher: async () => { calls++; return { ok: true, json: async () => sample(time) }; } });
  assert.equal(service.snapshot().weather, null);
  service.snapshot();
  await service.refresh();
  assert.equal(calls, 1);
  assert.equal(service.snapshot().weather.code, 61);
  time += 14 * 60 * 1000;
  assert.equal(service.snapshot().weather.stale, false);
  assert.equal(calls, 1);
  time += 2 * 60 * 1000;
  service.snapshot();
  await service.refresh();
  assert.equal(calls, 2);
  assert.equal(service.snapshot().weather.fetchedAt, time);
});

test("날씨 요청에 실패하면 마지막 예보와 확인 시각을 보여 주고 오래되면 지운다", async () => {
  let time = 1_800_000_000_000, available = true;
  const firstTime = time;
  const service = createWeatherService({ now: () => time, fetcher: async () => {
    if (!available) throw new Error("offline");
    return { ok: true, json: async () => sample(time) };
  } });
  await service.refresh();
  available = false; time += 16 * 60 * 1000;
  await service.refresh();
  assert.equal(service.snapshot().weather.stale, true);
  assert.equal(service.snapshot().lastWeatherAt, firstTime);
  time = firstTime + 2 * 60 * 60 * 1000 + 1;
  const expired = service.snapshot();
  assert.equal(expired.weather, null);
  assert.equal(expired.lastWeatherAt, firstTime);
});

test("형식이 잘못된 응답은 실제 날씨로 표시하지 않는다", async () => {
  const service = createWeatherService({ fetcher: async () => ({ ok: true, json: async () => ({ current: { weather_code: 0 } }) }) });
  await service.refresh();
  const result = service.snapshot();
  assert.equal(result.weather, null);
  assert.equal(result.status, "unavailable");
});

test("새로 받은 응답이라도 오래된 예보는 현재 날씨로 표시하지 않는다", async () => {
  const now = 1_800_000_000_000;
  const service = createWeatherService({ now: () => now, fetcher: async () => ({ ok: true, json: async () => sample(now - 3 * 60 * 60 * 1000) }) });
  await service.refresh();
  assert.equal(service.snapshot().weather, null);
  assert.equal(service.snapshot().status, "unavailable");
});

test("확인한 지 얼마 안 되었어도 예보 기준 시각이 너무 오래되면 표시하지 않는다", async () => {
  let now = 1_800_000_000_000;
  const forecast = sample(now - 110 * 60 * 1000);
  const service = createWeatherService({ now: () => now, fetcher: async () => ({ ok: true, json: async () => forecast }) });
  await service.refresh();
  assert.ok(service.snapshot().weather);
  now += 11 * 60 * 1000;
  assert.equal(service.snapshot().weather, null);
});
