#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# 이 파일들은 각자의 컴퓨터에만 보관하며 저장소에 올리지 않는다.
set -a
for config in .env.livekit-cloud.local .env.daily-cloud.local .env.cloudflare-cloud.local .env.cloudflare-analytics.local .env.cloudflare-watchdog.local .env.media-demo.local; do
  if [[ ! -r "$config" ]]; then printf '%s 파일이 없습니다.\n' "$config" >&2; exit 1; fi
  source "$config"
done
set +a
if [[ "${CAMPUS_BIND_HOST:-}" != "127.0.0.1" || "${MEDIA_MEETINGS_TEST:-}" != "local-only" || ! -f "${MEDIA_STATE_PATH:-}" ]]; then
  printf '로컬 시험 설정 또는 사용량 저장소를 확인해 주세요.\n' >&2
  exit 1
fi
exec node app.js
