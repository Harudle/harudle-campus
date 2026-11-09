// Daily의 회의 기록으로 참가자 시간을 확인한다. 청구서나 실시간 한도와는 다를 수 있다.
export async function getDailyUsage({ apiKey, from, to, fetchImpl = fetch }) {
  if (!apiKey || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from >= to) throw new Error("invalid_usage_request");
  const meetings = new Map();
  let cursor = "", totalCount;
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ timeframe_start: String(from), timeframe_end: String(to), limit: "100" });
    if (cursor) params.set("starting_after", cursor);
    const response = await fetchImpl(`https://api.daily.co/v1/meetings?${params}`, {
      headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("daily_usage_unavailable");
    const result = await response.json();
    if (!Number.isSafeInteger(result?.total_count) || result.total_count < 0 || !Array.isArray(result.data)) throw new Error("daily_usage_invalid");
    totalCount ??= result.total_count;
    if (result.total_count !== totalCount) throw new Error("daily_usage_changed");
    for (const meeting of result.data) {
      if (typeof meeting?.id !== "string" || !meeting.id || meetings.has(meeting.id) || !Array.isArray(meeting.participants)) throw new Error("daily_usage_invalid");
      meetings.set(meeting.id, meeting);
    }
    if (meetings.size === totalCount) break;
    if (!result.data.length || meetings.size > totalCount) throw new Error("daily_usage_incomplete");
    cursor = result.data.at(-1).id;
  }
  if (meetings.size !== totalCount) throw new Error("daily_usage_incomplete");
  let participantSeconds = 0, ongoingMeetings = 0;
  for (const meeting of meetings.values()) {
    if (meeting.ongoing) ongoingMeetings++;
    for (const participant of meeting.participants) {
      if (!Number.isSafeInteger(participant.join_time) || !Number.isSafeInteger(participant.duration) || participant.duration < 0) throw new Error("daily_usage_incomplete");
      const start = Math.max(from, participant.join_time);
      const end = Math.min(to, participant.join_time + participant.duration);
      participantSeconds += Math.max(0, end - start);
    }
  }
  return { from, to, meetingCount: meetings.size, ongoingMeetings, participantSeconds };
}
