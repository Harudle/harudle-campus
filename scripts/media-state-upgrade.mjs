import { upgradeDurableMediaState } from "../server/media/durable-state.js";

function integer(name) {
  const raw = process.env[name];
  if (typeof raw !== "string" || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error(`missing_or_invalid_${name}`);
  return Number(raw);
}
try {
  if (process.env.MEDIA_STATE_BASELINE_CONFIRMED !== "1") throw new Error("baseline_not_confirmed");
  upgradeDurableMediaState({ path: process.env.MEDIA_STATE_PATH, livekitBytes: { limit: integer("MEDIA_LIVEKIT_LIMIT_BYTES"), used: integer("MEDIA_LIVEKIT_BASELINE_BYTES") } });
  console.log("기존 기록을 유지하고 LiveKit 전송량 제한을 추가했습니다.");
} catch (error) {
  console.error(`저장소 업그레이드 실패: ${/^[a-zA-Z0-9_]+$/.test(error?.message || "") ? error.message : "unavailable"}`);
  process.exitCode = 1;
}
