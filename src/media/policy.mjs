export const VOICE_DISTANCE = 6;

export function areaOf(position) {
  return `${position.f}:${position.rm || "open"}`;
}

export function canShareScreen(position) {
  return typeof position.rm === "string" && position.rm.includes("회의실");
}

export function canHear(myPosition, otherPosition) {
  if (!myPosition || !otherPosition || myPosition.f !== otherPosition.f) return false;
  const mine = myPosition.rm || "", other = otherPosition.rm || "";
  if (mine !== other) return false;
  if (mine) return true;
  if (![myPosition.x, myPosition.y, otherPosition.x, otherPosition.y].every(Number.isFinite)) return false;
  return Math.hypot(myPosition.x - otherPosition.x, myPosition.y - otherPosition.y) <= VOICE_DISTANCE;
}
