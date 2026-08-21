#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

stub="${tmp_dir}/docker"
state_file="${tmp_dir}/state"
log_file="${tmp_dir}/commands"
env_file="${tmp_dir}/app.env"
compose_file="${tmp_dir}/compose.yml"

touch "${env_file}" "${compose_file}" "${log_file}"
cat >"${stub}" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

printf '%s\n' "$*" >>"${DOCKER_STUB_LOG}"

if [[ ${1:-} == "inspect" ]]; then
  if [[ $(<"${DOCKER_STUB_STATE}") == "missing" ]]; then
    exit 1
  fi
  printf '%s\n' "$(<"${DOCKER_STUB_STATE}")"
  exit 0
fi

case "$*" in
  *" restart clamav" | *" up -d clamav")
    printf '%s\n' healthy >"${DOCKER_STUB_STATE}"
    ;;
  *" exec -T losttofound node scripts/verify-malware-scanner.mjs")
    printf '%s\n' "Malware scanner verification passed."
    ;;
  *)
    echo "Unexpected docker command: $*" >&2
    exit 1
    ;;
esac
EOF
chmod 0700 "${stub}"

run_recovery() {
  DOCKER_BIN="${stub}" \
  DOCKER_STUB_LOG="${log_file}" \
  DOCKER_STUB_STATE="${state_file}" \
  LOSTTOFOUND_APP_ROOT="${tmp_dir}" \
  LOSTTOFOUND_COMPOSE_FILE="${compose_file}" \
  LOSTTOFOUND_ENV_FILE="${env_file}" \
  RECOVERY_ATTEMPTS=2 \
  RECOVERY_SLEEP_SECONDS=0 \
    "${script_dir}/recover-unhealthy.sh"
}

printf '%s\n' healthy >"${state_file}"
: >"${log_file}"
run_recovery
if grep -Eq 'restart clamav|up -d clamav|verify-malware-scanner' "${log_file}"; then
  echo "Healthy scanner must not be restarted or retested." >&2
  exit 1
fi

printf '%s\n' unhealthy >"${state_file}"
: >"${log_file}"
run_recovery
grep -q 'restart clamav' "${log_file}"
grep -q 'exec -T losttofound node scripts/verify-malware-scanner.mjs' "${log_file}"

printf '%s\n' missing >"${state_file}"
: >"${log_file}"
run_recovery
grep -q 'up -d clamav' "${log_file}"
grep -q 'exec -T losttofound node scripts/verify-malware-scanner.mjs' "${log_file}"

systemctl_stub="${tmp_dir}/systemctl"
systemctl_log="${tmp_dir}/systemctl-commands"
cat >"${systemctl_stub}" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"${SYSTEMCTL_STUB_LOG}"
EOF
chmod 0700 "${systemctl_stub}"
HOME="${tmp_dir}/home" \
SYSTEMCTL_BIN="${systemctl_stub}" \
SYSTEMCTL_STUB_LOG="${systemctl_log}" \
  "${script_dir}/install-health-watchdog.sh"
grep -q 'ExecStart=.*/recover-unhealthy.sh' \
  "${tmp_dir}/home/.config/systemd/user/losttofound-health-watchdog.service"
grep -Fq "WorkingDirectory=$(cd "${script_dir}/../.." && pwd)" \
  "${tmp_dir}/home/.config/systemd/user/losttofound-health-watchdog.service"
if grep -Fq '/../..' "${tmp_dir}/home/.config/systemd/user/losttofound-health-watchdog.service"; then
  echo "Watchdog service contains a non-normalized working directory." >&2
  exit 1
fi
grep -q 'NoNewPrivileges=true' \
  "${tmp_dir}/home/.config/systemd/user/losttofound-health-watchdog.service"
if grep -Eq '^(PrivateTmp|ProtectSystem|ProtectHome)=' \
  "${tmp_dir}/home/.config/systemd/user/losttofound-health-watchdog.service"; then
  echo "Watchdog service contains a mount namespace that blocks rootless Docker." >&2
  exit 1
fi
grep -q '^CPUQuota=25%$' \
  "${tmp_dir}/home/.config/systemd/user/losttofound-health-watchdog.service"
grep -q 'OnUnitInactiveSec=1min' \
  "${tmp_dir}/home/.config/systemd/user/losttofound-health-watchdog.timer"
grep -q -- '--user enable --now losttofound-health-watchdog.timer' "${systemctl_log}"

backup_env_file="${tmp_dir}/backup.env"
backup_unit_dir="${tmp_dir}/backup-units"
touch "${backup_env_file}"
chmod 0600 "${backup_env_file}"
: >"${systemctl_log}"
LOSTTOFOUND_BACKUP_ENV_FILE="${backup_env_file}" \
LOSTTOFOUND_USER_UNIT_DIR="${backup_unit_dir}" \
SYSTEMCTL_BIN="${systemctl_stub}" \
SYSTEMCTL_STUB_LOG="${systemctl_log}" \
  "${script_dir}/install-storage-backup-timer.sh"
grep -q 'ExecStart=.*/run-storage-backup.sh' \
  "${backup_unit_dir}/custodyfolio-storage-backup.service"
grep -q '^OnCalendar=\*-\*-\* 03:30:00 UTC$' \
  "${backup_unit_dir}/custodyfolio-storage-backup.timer"
grep -q '^RandomizedDelaySec=30min$' \
  "${backup_unit_dir}/custodyfolio-storage-backup.timer"
grep -q '^Persistent=true$' \
  "${backup_unit_dir}/custodyfolio-storage-backup.timer"
grep -q -- '--user enable --now custodyfolio-storage-backup.timer' "${systemctl_log}"

backup_state_dir="${tmp_dir}/backup-state"
backup_docker_stub="${tmp_dir}/backup-docker"
backup_docker_log="${tmp_dir}/backup-docker-commands"
mkdir -p "${backup_state_dir}"
printf '%s\n' test-release >"${backup_state_dir}/current-release"
chmod 0600 "${env_file}" "${backup_env_file}"
cat >"${backup_docker_stub}" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"${BACKUP_DOCKER_STUB_LOG}"
EOF
chmod 0700 "${backup_docker_stub}"
DOCKER_BIN="${backup_docker_stub}" \
BACKUP_DOCKER_STUB_LOG="${backup_docker_log}" \
LOSTTOFOUND_APP_ROOT="${tmp_dir}" \
LOSTTOFOUND_COMPOSE_FILE="${compose_file}" \
LOSTTOFOUND_ENV_FILE="${env_file}" \
LOSTTOFOUND_BACKUP_ENV_FILE="${backup_env_file}" \
LOSTTOFOUND_STATE_DIR="${backup_state_dir}" \
  "${script_dir}/run-storage-backup.sh"
grep -Fq 'compose --profile ops' "${backup_docker_log}"
grep -Fq 'run --rm --no-deps backup' "${backup_docker_log}"
test -s "${backup_state_dir}/storage-backup-last-success"

cat >"${env_file}" <<'EOF'
NEXT_PUBLIC_APP_URL=https://custodyfolio.com
OFFSITE_STORAGE_BACKUP_ENABLED=false
BACKUP_RESTORE_TESTED_AT=2025-01-01
EOF
cat >"${backup_env_file}" <<'EOF'
OFFSITE_BACKUP_S3_ENDPOINT=https://s3.us-east-005.backblazeb2.com
OFFSITE_BACKUP_S3_REGION=us-east-005
OFFSITE_BACKUP_S3_BUCKET=custody-folio-evidence-test
OFFSITE_BACKUP_S3_ACCESS_KEY_ID=test-key-id
OFFSITE_BACKUP_S3_SECRET_ACCESS_KEY=test-secret-key
OFFSITE_BACKUP_RETENTION_DAYS=178
OFFSITE_BACKUP_OBJECT_LOCK_MODE=COMPLIANCE
OFFSITE_BACKUP_LIFECYCLE_DELETE_DAYS=1
OFFSITE_BACKUP_KEY_EXPIRES_AT=2027-08-10
OFFSITE_BACKUP_RESTORE_TESTED_AT=2026-08-10
EOF
chmod 0600 "${env_file}" "${backup_env_file}"
LOSTTOFOUND_ENV_FILE="${env_file}" \
LOSTTOFOUND_BACKUP_ENV_FILE="${backup_env_file}" \
  "${script_dir}/configure-storage-backup-readiness.sh"
grep -q '^NEXT_PUBLIC_APP_URL=https://custodyfolio.com$' "${env_file}"
grep -q '^OFFSITE_STORAGE_BACKUP_ENABLED=true$' "${env_file}"
grep -q '^OFFSITE_STORAGE_BACKUP_RETENTION_DAYS=178$' "${env_file}"
grep -q '^OFFSITE_STORAGE_BACKUP_LIFECYCLE_DELETE_DAYS=1$' "${env_file}"
grep -q '^OFFSITE_STORAGE_BACKUP_KEY_EXPIRES_AT=2027-08-10$' "${env_file}"
grep -q '^BACKUP_RESTORE_TESTED_AT=2026-08-10$' "${env_file}"
test "$(grep -c '^OFFSITE_STORAGE_BACKUP_ENABLED=' "${env_file}")" -eq 1

compose_source="${script_dir}/compose.yml"
grep -q 'CLAMD_CONF_ConcurrentDatabaseReload: "no"' "${compose_source}"
grep -q 'CLAMD_CONF_MaxThreads: "2"' "${compose_source}"
grep -q 'CLAMD_CONF_MaxQueue: "4"' "${compose_source}"
grep -q 'mem_limit: ${CLAMAV_MEMORY_LIMIT:-2560m}' "${compose_source}"
grep -q 'mem_limit: ${LOSTTOFOUND_MEMORY_LIMIT:-768m}' "${compose_source}"
grep -q 'mem_limit: ${CADDY_MEMORY_LIMIT:-128m}' "${compose_source}"
grep -q 'NET_BIND_SERVICE' "${compose_source}"
grep -q 'cloudflare/cloudflared:2026.7.2' "${compose_source}"
grep -q 'CLOUDFLARED_TOKEN_FILE' "${compose_source}"
grep -q 'TRUST_PROXY_HEADERS: "true"' "${compose_source}"
grep -q '^  backup:$' "${compose_source}"
grep -q 'LOSTTOFOUND_BACKUP_ENV_FILE' "${compose_source}"
grep -q 'scripts/backup-supabase-storage.mjs' "${compose_source}"
grep -q 'read_only: true' "${compose_source}"
if grep -Eq '"(80:80|443:443|443:443/udp)"' "${compose_source}"; then
  echo "Production origin must not publish web ports directly." >&2
  exit 1
fi
grep -q 'ps -q cloudflared' "${script_dir}/smoke-test.sh"
if grep -q 'Registered tunnel connection' "${script_dir}/smoke-test.sh"; then
  echo "Smoke test must not scan unbounded tunnel logs under pipefail." >&2
  exit 1
fi
grep -q 'LOSTTOFOUND_PUBLIC_URL:-https://custodyfolio.com' "${script_dir}/smoke-test.sh"
grep -q 'not present in its checks catalog' "${script_dir}/smoke-test.sh"
grep -Fq '(.billing.checks // []) | any(("billing:" + .id) == $blocker)' \
  "${script_dir}/smoke-test.sh"
grep -q 'readiness-blocker-classification.sh' "${script_dir}/smoke-test.sh"
grep -q 'Technical or security readiness blockers remain' "${script_dir}/smoke-test.sh"
classification_source="${script_dir}/readiness-blocker-classification.sh"
(
  source "${classification_source}"
  readiness_blockers_are_approval_only \
    data-retention-policy incident-response-plan legal-review
)
if (
  source "${classification_source}"
  readiness_blockers_are_approval_only legal-review auth-secret
); then
  echo "Technical readiness blockers must never qualify for the launch-pending override." >&2
  exit 1
fi
if (
  source "${classification_source}"
  readiness_blockers_are_approval_only
); then
  echo "An empty blocker set must not qualify for the launch-pending override." >&2
  exit 1
fi
(
  source "${classification_source}"
  readiness_blockers_are_servicing_only_pending \
    incident-response-plan \
    legal-review \
    billing:billing-checkout-enabled \
    billing:production-readiness \
    billing:apple-notifications-v2 \
    billing:billing-tests-recent \
    billing:billing-policy-versions \
    billing:billing-tax-review \
    billing:live-billing-approval
)
if (
  source "${classification_source}"
  readiness_blockers_are_servicing_only_pending \
    legal-review billing:stripe-live-key
); then
  echo "Missing Stripe live credentials must never qualify for servicing-only deployment." >&2
  exit 1
fi
if (
  source "${classification_source}"
  readiness_blockers_are_servicing_only_pending
); then
  echo "An empty blocker set must not qualify for servicing-only deployment." >&2
  exit 1
fi
grep -q 'billing_mode.*== "live"' "${script_dir}/smoke-test.sh"
grep -q 'billing_checkout_enabled.*== "false"' "${script_dir}/smoke-test.sh"
grep -q 'billing_live_canary_authorized.*== "false"' "${script_dir}/smoke-test.sh"
grep -q 'apple_billing_environment.*== "production"' "${script_dir}/smoke-test.sh"
grep -q 'readiness_blockers_are_servicing_only_pending' "${script_dir}/smoke-test.sh"
grep -q 'declaredCheckIds' "${script_dir}/../../.github/workflows/live-monitor.yml"
if grep -Eq 'supabase-custom-smtp|two-user-isolation-tested|malware-scanner-tested' \
  "${script_dir}/smoke-test.sh"; then
  echo "Production smoke test must derive readiness blocker IDs from the checks catalog." >&2
  exit 1
fi
grep -Fq -- '--header "Origin: ${public_url%/}"' "${script_dir}/smoke-test.sh"
grep -Fq -- "--header 'Sec-Fetch-Site: same-origin'" "${script_dir}/smoke-test.sh"
grep -q 'STARTER_RESOURCE_PROFILE: ${STARTER_RESOURCE_PROFILE:-true}' "${compose_source}"
if grep -q 'customer-resource-profile' "${script_dir}/smoke-test.sh"; then
  echo "Starter capacity must not be an allowed deployment blocker." >&2
  exit 1
fi
grep -q 'node scripts/verify-supabase-auth-public-settings.mjs' "${script_dir}/smoke-test.sh"
grep -q 'verify-supabase-auth-public-settings.mjs' "${script_dir}/../../Dockerfile"
grep -q 'verify-security-event-sink.mjs' "${script_dir}/../../Dockerfile"
grep -q 'verify-two-user-isolation.mjs' "${script_dir}/../../Dockerfile"
grep -q 'storage-backup-lib.mjs' "${script_dir}/../../Dockerfile"
grep -q 'backup-supabase-storage.mjs' "${script_dir}/../../Dockerfile"
grep -q 'verify-supabase-storage-backup.mjs' "${script_dir}/../../Dockerfile"
grep -q 'npm prune --omit=dev' "${script_dir}/../../Dockerfile"
grep -q 'exit 2' "${script_dir}/smoke-test.sh"
grep -q 'smoke_status.*-ne 2' "${script_dir}/deploy.sh"
grep -q 'down --remove-orphans' "${script_dir}/deploy.sh"
grep -Fq 'DOCKER_BUILD_CACHE_RETENTION:-48h' "${script_dir}/deploy.sh"
grep -Fq 'docker builder prune --all --force --filter "until=${build_cache_retention}"' \
  "${script_dir}/deploy.sh"
grep -q 'caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile' \
  "${script_dir}/deploy.sh"
if grep -q -- '--force-recreate caddy' "${script_dir}/deploy.sh"; then
  echo "Routine deployments must not restart the Cloudflare origin." >&2
  exit 1
fi
grep -q 'PUBLIC_HEALTH_ATTEMPTS:-24' "${script_dir}/smoke-test.sh"
grep -q 'PUBLIC_HEALTH_SLEEP_SECONDS:-5' "${script_dir}/smoke-test.sh"
grep -q -- '--connect-timeout 5' "${script_dir}/smoke-test.sh"
grep -q -- '--max-time 15' "${script_dir}/smoke-test.sh"
smoke_error="${tmp_dir}/smoke-error"
if PUBLIC_HEALTH_ATTEMPTS=0 "${script_dir}/smoke-test.sh" 2>"${smoke_error}"; then
  echo "Smoke test must reject a zero public-health attempt count." >&2
  exit 1
fi
grep -q 'PUBLIC_HEALTH_ATTEMPTS must be a positive integer' "${smoke_error}"
if PUBLIC_HEALTH_SLEEP_SECONDS=invalid \
  "${script_dir}/smoke-test.sh" 2>"${smoke_error}"; then
  echo "Smoke test must reject an invalid public-health sleep interval." >&2
  exit 1
fi
grep -q 'PUBLIC_HEALTH_SLEEP_SECONDS must be a non-negative integer' "${smoke_error}"
grep -q 'current-readiness' "${script_dir}/deploy.sh"
grep -q 'current-deployment' "${script_dir}/deploy.sh"
grep -q 'launch-approval-pending' "${script_dir}/deploy.sh"
grep -q 'deployed successfully for testing' "${script_dir}/deploy.sh"
grep -q 'install-storage-backup-timer.sh' "${script_dir}/deploy.sh"
grep -q 'configure-storage-backup-readiness.sh' "${script_dir}/deploy-from-mac.sh"
grep -q -- "--exclude '.mcp.json'" "${script_dir}/deploy-from-mac.sh"
grep -q -- "--exclude '.codex/'" "${script_dir}/deploy-from-mac.sh"
grep -q -- "--exclude '.agents/'" "${script_dir}/deploy-from-mac.sh"

echo "Scanner health recovery tests passed."
