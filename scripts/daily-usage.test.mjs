import assert from "node:assert/strict";
import { test } from "node:test";
import { getDailyUsage } from "../server/media/daily-usage.js";

test("Daily 기록의 참가자별 시간을 합산하며 조회 구간 밖은 제외한다", async () => {
  let calls = 0;
  const result = await getDailyUsage({ apiKey: "secret", from: 1000, to: 2000, fetchImpl: async (url, options) => {
    assert.equal(options.headers.authorization, "Bearer secret");
    calls++;
    const next = new URL(url).searchParams.get("starting_after");
    return new Response(JSON.stringify({ total_count: 2, data: next
      ? [{ id: "b", ongoing: false, participants: [{ join_time: 1900, duration: 300 }] }]
      : [{ id: "a", ongoing: true, participants: [{ join_time: 900, duration: 200 }, { join_time: 1300, duration: 90 }] }] }));
  } });
  assert.deepEqual(result, { from: 1000, to: 2000, meetingCount: 2, ongoingMeetings: 1, participantSeconds: 290 });
  assert.equal(calls, 2);
});

test("일부 기록이 빠지거나 조회 중 목록이 바뀌면 정상 사용량으로 표시하지 않는다", async () => {
  const reply = (body) => new Response(JSON.stringify(body));
  await assert.rejects(getDailyUsage({ apiKey: "x", from: 1, to: 2, fetchImpl: async () => reply({ total_count: 1, data: [] }) }), /daily_usage_incomplete/);
  await assert.rejects(getDailyUsage({ apiKey: "x", from: 1, to: 2, fetchImpl: async () => reply({ total_count: 1, data: [{ id: "a", participants: [{ join_time: 1 }] }] }) }), /daily_usage_incomplete/);
});
