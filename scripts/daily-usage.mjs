import { readFileSync } from "node:fs";
import { getDailyUsage } from "../server/media/daily-usage.js";

const now = new Date(), from = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000), to = Math.floor(now.getTime() / 1000);
try {
  const usage = await getDailyUsage({ apiKey: process.env.DAILY_API_KEY, from, to });
  const report = {
    periodUTC: `${now.toISOString().slice(0, 7)}-01 이후`,
    participantMinutesFromDailyRecords: Math.round(usage.participantSeconds / 60 * 100) / 100,
    meetings: usage.meetingCount, ongoingMeetings: usage.ongoingMeetings,
    notice: "회의 기록은 청구서가 아니며 지연되거나 기간 시작 전부터 이어진 회의가 빠질 수 있습니다.",
  };
  const path = process.env.DAILY_BUDGET_FILE;
  if (path) {
    const budget = JSON.parse(readFileSync(path, "utf8"));
    if (budget.version !== 1 || budget.provider !== "daily" || !Number.isSafeInteger(budget.reservedSeconds) || !Number.isSafeInteger(budget.limitSeconds)) throw new Error("budget_unavailable");
    report.reservedMinutes = budget.reservedSeconds / 60;
    report.reservationLimitMinutes = budget.limitSeconds / 60;
    report.reservationPeriodUTC = budget.period;
    report.reservationNotice = "예약량은 발급한 토큰의 최대 사용 시간을 미리 더한 값이며 실제 사용량이 아닙니다.";
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(`사용량 확인 실패: ${error?.message || "unavailable"}`);
  process.exitCode = 1;
}
