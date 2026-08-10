#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Install the backup timer as the non-root losttofound user." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
unit_dir="${LOSTTOFOUND_USER_UNIT_DIR:-${HOME}/.config/systemd/user}"
systemctl_bin="${SYSTEMCTL_BIN:-systemctl}"
backup_env_file="${LOSTTOFOUND_BACKUP_ENV_FILE:-/srv/losttofound/config/backup.env}"

if [[ ! -r ${backup_env_file} ]]; then
  echo "Off-site backup credentials are not configured: ${backup_env_file}" >&2
  exit 1
fi

install -d -m 0700 "${unit_dir}"

cat >"${unit_dir}/custodyfolio-storage-backup.service" <<EOF
[Unit]
Description=Back up Custody Folio private evidence to immutable off-site storage
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${script_dir}/run-storage-backup.sh
NoNewPrivileges=true
RestrictAddressFamilies=AF_UNIX
RestrictRealtime=true
LockPersonality=true
MemoryMax=768M
CPUQuota=50%
UMask=0077
EOF

cat >"${unit_dir}/custodyfolio-storage-backup.timer" <<'EOF'
[Unit]
Description=Run the Custody Folio off-site evidence backup daily

[Timer]
OnCalendar=*-*-* 03:30:00 UTC
RandomizedDelaySec=30min
Persistent=true
Unit=custodyfolio-storage-backup.service

[Install]
WantedBy=timers.target
EOF

chmod 0600 \
  "${unit_dir}/custodyfolio-storage-backup.service" \
  "${unit_dir}/custodyfolio-storage-backup.timer"
"${systemctl_bin}" --user daemon-reload
"${systemctl_bin}" --user enable --now custodyfolio-storage-backup.timer
echo "Custody Folio off-site evidence backup timer installed."
