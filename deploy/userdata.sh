#!/bin/bash
# EC2 사용자 데이터 (Amazon Linux 2023, arm64)
# 1) Node·git·Caddy 설치 → 2) 저장소 받기 → 3) 앱(3000) + Caddy(80/443, campus.harudle.com 자동 HTTPS)
# 배포는 앱 감독(server.js)이 맡는다: 20초마다 main을 보고, 검사 → 새 워커 → 옛 워커 비우기 순서로 무중단 교체
set -euxo pipefail
REPO=https://github.com/Woowa-8th-BE-IQ/wooteco-metaverse.git
APP=/opt/wooteco-metaverse
DOMAIN=campus.harudle.com
CADDY_VER=2.8.4

dnf install -y nodejs git
id app >/dev/null 2>&1 || useradd --system --home-dir "$APP" --shell /sbin/nologin app
rm -rf "$APP" && git clone --depth 1 "$REPO" "$APP"
cd "$APP" && npm install --omit=dev --no-audit --no-fund
chown -R app:app "$APP"

cat >/etc/systemd/system/wooteco-metaverse.service <<'UNIT'
[Unit]
Description=Harudle Wooteco metaverse
After=network-online.target
Wants=network-online.target

[Service]
User=app
WorkingDirectory=/opt/wooteco-metaverse
Environment=PORT=3000 NODE_ENV=production DEPLOY_POLL_MS=20000
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=2
# 재시작할 때도 워커가 처리 중인 요청을 마치고 내려가도록
KillMode=mixed
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
UNIT

# Caddy: 도메인이 이 서버를 가리키면 인증서를 자동으로 받고, 그 전에는 IP로 http 접속
curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VER}/caddy_${CADDY_VER}_linux_arm64.tar.gz" | tar -xz -C /usr/local/bin caddy
id caddy >/dev/null 2>&1 || useradd --system --home-dir /var/lib/caddy --create-home --shell /sbin/nologin caddy
mkdir -p /etc/caddy
cat >/etc/caddy/Caddyfile <<CADDY
${DOMAIN} {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
http:// {
	reverse_proxy 127.0.0.1:3000
}
CADDY
cat >/etc/systemd/system/caddy.service <<'UNIT'
[Unit]
Description=Caddy
After=network-online.target
Wants=network-online.target

[Service]
User=caddy
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
Environment=XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/var/lib/caddy
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now wooteco-metaverse.service caddy.service
