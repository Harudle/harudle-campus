// The screen is centred at the west-facing side of the 13th-floor stage.
export const STARTRACK_SCREEN = Object.freeze({ x: 13.92, y: 24.5 });
export const STARTRACK_HEAR_DISTANCE = 22;

// Keep the existing screen width and make its height match a 16:9 video.
export function startrackScreenSize(length, maxHeight, wide = 1) {
  const oldHeight = Math.min(length * 9 / 16, maxHeight);
  const width = Math.min(length, oldHeight * 16 / 9 * wide);
  return { width, height: width * 9 / 16 };
}

export function youtubeVideoId(value) {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  let url;
  try { url = new URL(input); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  const host = url.hostname.toLowerCase();
  let id = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "www.youtube-nocookie.com"].includes(host)) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (["embed", "shorts", "live"].includes(parts[0])) id = parts[1];
  }
  return typeof id === "string" && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
}

export function inStartrack(position) {
  return !!position && position.f === 13 && !position.rm && Number.isFinite(position.x) && Number.isFinite(position.y)
    && position.x >= 1 && position.x <= 14.6 && position.y >= 10 && position.y <= 39.5;
}

export function startrackVolume(position) {
  if (!inStartrack(position)) return 0;
  const distance = Math.hypot(position.x - STARTRACK_SCREEN.x, position.y - STARTRACK_SCREEN.y);
  if (distance >= STARTRACK_HEAR_DISTANCE) return 0;
  if (distance <= 3) return 100;
  if (distance <= 17) return Math.round(100 - (distance - 3) * 65 / 14);
  return Math.max(1, Math.round(35 * (STARTRACK_HEAR_DISTANCE - distance) / 5));
}

export function canControlStartrack(position) {
  return inStartrack(position);
}
