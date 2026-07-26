#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Install the watchdog as the non-root losttofound user." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_root="$(cd "${script_dir}/../.." && pwd)"
unit_dir="${HOME}/.config/systemd/user"
systemctl_bin="${SYSTEMCTL_BIN:-systemctl}"

install -d -m 0700 "${unit_dir}"

cat >"${unit_dir}/losttofound-health-watchdog.service" <<EOF
[Unit]
Description=Recover and verify the Custody Folio malware scanner
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=${app_root}
ExecStart=${script_dir}/recover-unhealthy.sh
NoNewPrivileges=true
RestrictAddressFamilies=AF_UNIX
RestrictRealtime=true
LockPersonality=true
MemoryMax=256M
CPUQuota=25%
UMask=0077
EOF

cat >"${unit_dir}/losttofound-health-watchdog.timer" <<'EOF'
[Unit]
Description=Check the Custody Folio malware scanner every minute

[Timer]
OnBootSec=2min
OnUnitInactiveSec=1min
AccuracySec=10s
Unit=losttofound-health-watchdog.service

[Install]
WantedBy=timers.target
EOF

chmod 0600 \
  "${unit_dir}/losttofound-health-watchdog.service" \
  "${unit_dir}/losttofound-health-watchdog.timer"
"${systemctl_bin}" --user daemon-reload
"${systemctl_bin}" --user enable --now losttofound-health-watchdog.timer
echo "Custody Folio scanner watchdog installed."
