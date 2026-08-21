#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Run Supabase Auth readiness configuration as the non-root losttofound user." >&2
  exit 1
fi

redirects_verified_at="${1:-}"
hardening_verified_at="${2:-}"
app_env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"

validate_iso_date() {
  local label="$1"
  local value="$2"
  local normalized

  if date -u -d "${value}" +%F >/dev/null 2>&1; then
    normalized="$(date -u -d "${value}" +%F)"
  else
    normalized="$(date -j -u -f '%Y-%m-%d' "${value}" +%F 2>/dev/null || true)"
  fi
  if [[ ! ${value} =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ || ${normalized} != "${value}" ]]; then
    echo "${label} must be a valid ISO date in YYYY-MM-DD format." >&2
    exit 1
  fi

  if [[ ${value} > $(date -u +%F) ]]; then
    echo "${label} cannot be in the future." >&2
    exit 1
  fi
}

validate_iso_date "Supabase Auth redirects verification date" "${redirects_verified_at}"
validate_iso_date "Supabase Auth hardening verification date" "${hardening_verified_at}"

if [[ ! -f ${app_env_file} || ! -r ${app_env_file} || -L ${app_env_file} ]]; then
  echo "Production environment file is missing, unreadable, or symlinked: ${app_env_file}" >&2
  exit 1
fi

runtime_uid="$(id -u)"
if stat -c '%a' "${app_env_file}" >/dev/null 2>&1; then
  env_mode="$(stat -c '%a' "${app_env_file}")"
  env_owner_uid="$(stat -c '%u' "${app_env_file}")"
else
  env_mode="$(stat -f '%Lp' "${app_env_file}")"
  env_owner_uid="$(stat -f '%u' "${app_env_file}")"
fi
if [[ ${env_mode} != "600" || ${env_owner_uid} != "${runtime_uid}" ]]; then
  echo "Production environment file must be owned by the deployment user with mode 0600." >&2
  exit 1
fi

umask 077
next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
cleanup() {
  rm -f "${next_env}"
}
trap cleanup EXIT

awk \
  -v redirects_verified_at="${redirects_verified_at}" \
  -v hardening_verified_at="${hardening_verified_at}" '
    BEGIN {
      redirects_seen = 0
      hardening_seen = 0
    }
    /^SUPABASE_AUTH_REDIRECTS_VERIFIED_AT=/ {
      if (redirects_seen == 0) {
        print "SUPABASE_AUTH_REDIRECTS_VERIFIED_AT=" redirects_verified_at
      }
      redirects_seen += 1
      next
    }
    /^SUPABASE_AUTH_HARDENING_VERIFIED_AT=/ {
      if (hardening_seen == 0) {
        print "SUPABASE_AUTH_HARDENING_VERIFIED_AT=" hardening_verified_at
      }
      hardening_seen += 1
      next
    }
    { print }
    END {
      if (redirects_seen == 0) {
        print "SUPABASE_AUTH_REDIRECTS_VERIFIED_AT=" redirects_verified_at
      }
      if (hardening_seen == 0) {
        print "SUPABASE_AUTH_HARDENING_VERIFIED_AT=" hardening_verified_at
      }
    }
  ' "${app_env_file}" >"${next_env}"

chmod 0600 "${next_env}"
if [[ $(grep -c '^SUPABASE_AUTH_REDIRECTS_VERIFIED_AT=' "${next_env}") -ne 1 ]] ||
  [[ $(grep -c '^SUPABASE_AUTH_HARDENING_VERIFIED_AT=' "${next_env}") -ne 1 ]]; then
  echo "Supabase Auth readiness evidence must contain each verification date exactly once." >&2
  exit 1
fi

mv -f "${next_env}" "${app_env_file}"
trap - EXIT
echo "Recorded Supabase Auth production verification evidence for ${redirects_verified_at}."
