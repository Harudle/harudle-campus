#!/bin/bash
# EC2 사용자 데이터 (Amazon Linux 2023, arm64)
# 1) Node·git 설치 → 2) 저장소 받기 → 3) 80번 포트 서비스 등록 → 4) 10분마다 main 변경 반영
set -euxo pipefail
REPO=https://github.com/Woowa-8th-BE-IQ/wooteco-metaverse.git
APP=/opt/wooteco-metaverse

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
Environment=PORT=80 NODE_ENV=production
ExecStart=/usr/bin/node server.js
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

cat >/usr/local/bin/wooteco-update <<'SH'
#!/bin/bash
# main 브랜치가 바뀌었으면 받아서 다시 시작
cd /opt/wooteco-metaverse || exit 0
before=$(git rev-parse HEAD)
sudo -u app git fetch --depth 1 origin main -q && sudo -u app git reset --hard origin/main -q
after=$(git rev-parse HEAD)
if [ "$before" != "$after" ]; then sudo -u app npm install --omit=dev --no-audit --no-fund -q; systemctl restart wooteco-metaverse; fi
SH
chmod +x /usr/local/bin/wooteco-update

cat >/etc/systemd/system/wooteco-update.service <<'UNIT'
[Unit]
Description=Pull wooteco-metaverse main
[Service]
Type=oneshot
ExecStart=/usr/local/bin/wooteco-update
UNIT
cat >/etc/systemd/system/wooteco-update.timer <<'UNIT'
[Unit]
Description=Pull wooteco-metaverse every 10 minutes
[Timer]
OnBootSec=5min
OnUnitActiveSec=10min
[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now wooteco-metaverse.service wooteco-update.timer
