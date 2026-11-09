import { initializeDurableMediaState } from "../server/media/durable-state.js";

// 최초 한 번만 사용한다. 값이 없거나 기존 파일이 있으면 중단한다.
function integer(name) {
  const raw = process.env[name];
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) throw new Error(`missing_or_invalid_${name}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`missing_or_invalid_${name}`);
  return value;
}
try {
  if (process.env.MEDIA_STATE_BASELINE_CONFIRMED !== "1") throw new Error("baseline_not_confirmed");
  initializeDurableMediaState({
    path: process.env.MEDIA_STATE_PATH,
    period: new Date().toISOString().slice(0, 7),
    budgets: {
      livekit: { limit: integer("MEDIA_LIVEKIT_LIMIT_SECONDS"), used: integer("MEDIA_LIVEKIT_BASELINE_SECONDS") },
      livekit_bytes: { limit: integer("MEDIA_LIVEKIT_LIMIT_BYTES"), used: integer("MEDIA_LIVEKIT_BASELINE_BYTES") },
      daily: { limit: integer("MEDIA_DAILY_LIMIT_SECONDS"), used: integer("MEDIA_DAILY_BASELINE_SECONDS") },
      cloudflare: { limit: integer("MEDIA_CLOUDFLARE_LIMIT_BYTES"), used: integer("MEDIA_CLOUDFLARE_BASELINE_BYTES") },
    },
  });
  console.log("미디어 사용량 저장소를 만들었습니다. 기존 파일은 덮어쓰지 않습니다.");
} catch (error) {
  console.error(`저장소 초기화 실패: ${/^[a-zA-Z0-9_]+$/.test(error?.message || "") ? error.message : "unavailable"}`);
  process.exitCode = 1;
}
