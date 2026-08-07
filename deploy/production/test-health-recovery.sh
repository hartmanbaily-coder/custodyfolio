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
if grep -Eq '"(80:80|443:443|443:443/udp)"' "${compose_source}"; then
  echo "Production origin must not publish web ports directly." >&2
  exit 1
fi
grep -q 'ps -q cloudflared' "${script_dir}/smoke-test.sh"
grep -q 'Registered tunnel connection' "${script_dir}/smoke-test.sh"
grep -q 'LOSTTOFOUND_PUBLIC_URL:-https://custodyfolio.com' "${script_dir}/smoke-test.sh"
grep -q 'not present in its checks catalog' "${script_dir}/smoke-test.sh"
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
grep -q 'npm prune --omit=dev' "${script_dir}/../../Dockerfile"
grep -q 'exit 2' "${script_dir}/smoke-test.sh"
grep -q 'smoke_status.*-ne 2' "${script_dir}/deploy.sh"
grep -q 'down --remove-orphans' "${script_dir}/deploy.sh"
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
grep -q -- "--exclude '.mcp.json'" "${script_dir}/deploy-from-mac.sh"
grep -q -- "--exclude '.codex/'" "${script_dir}/deploy-from-mac.sh"
grep -q -- "--exclude '.agents/'" "${script_dir}/deploy-from-mac.sh"

echo "Scanner health recovery tests passed."
