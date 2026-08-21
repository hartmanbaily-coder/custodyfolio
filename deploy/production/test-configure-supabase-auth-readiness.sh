#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

env_file="${tmp_dir}/app.env"
cat >"${env_file}" <<'EOF'
NEXT_PUBLIC_APP_URL=https://custodyfolio.com
SUPABASE_AUTH_REDIRECTS_VERIFIED_AT=2026-01-01
SUPABASE_AUTH_REDIRECTS_VERIFIED_AT=duplicate
SUPABASE_AUTH_HARDENING_VERIFIED_AT=2026-01-01
EOF
chmod 0600 "${env_file}"

LOSTTOFOUND_ENV_FILE="${env_file}" \
  "${script_dir}/configure-supabase-auth-readiness.sh" 2026-08-21 2026-08-21

test "$(grep -c '^SUPABASE_AUTH_REDIRECTS_VERIFIED_AT=' "${env_file}")" -eq 1
test "$(grep -c '^SUPABASE_AUTH_HARDENING_VERIFIED_AT=' "${env_file}")" -eq 1
grep -Fqx 'SUPABASE_AUTH_REDIRECTS_VERIFIED_AT=2026-08-21' "${env_file}"
grep -Fqx 'SUPABASE_AUTH_HARDENING_VERIFIED_AT=2026-08-21' "${env_file}"
if stat -c '%a' "${env_file}" >/dev/null 2>&1; then
  env_mode="$(stat -c '%a' "${env_file}")"
else
  env_mode="$(stat -f '%Lp' "${env_file}")"
fi
test "${env_mode}" = "600"

invalid_date_log="${tmp_dir}/invalid-date.log"
if LOSTTOFOUND_ENV_FILE="${env_file}" \
  "${script_dir}/configure-supabase-auth-readiness.sh" 2026-02-30 2026-08-21 \
  2>"${invalid_date_log}"; then
  echo "Invalid verification dates must be rejected." >&2
  exit 1
fi
grep -q 'must be a valid ISO date' "${invalid_date_log}"

future_date_log="${tmp_dir}/future-date.log"
if LOSTTOFOUND_ENV_FILE="${env_file}" \
  "${script_dir}/configure-supabase-auth-readiness.sh" 2099-01-01 2026-08-21 \
  2>"${future_date_log}"; then
  echo "Future verification dates must be rejected." >&2
  exit 1
fi
grep -q 'cannot be in the future' "${future_date_log}"

echo "Supabase Auth readiness configuration tests passed."
