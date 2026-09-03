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
      key_count = 0
      keys[++key_count] = "RECORDS_AUTH_METHOD"
      desired["RECORDS_AUTH_METHOD"] = "email_otp"
      keys[++key_count] = "SUPABASE_EMAIL_OTP_ENABLED"
      desired["SUPABASE_EMAIL_OTP_ENABLED"] = "true"
      keys[++key_count] = "SUPABASE_EMAIL_OTP_LENGTH"
      desired["SUPABASE_EMAIL_OTP_LENGTH"] = "6"
      keys[++key_count] = "SUPABASE_EMAIL_OTP_EXPIRY_SECONDS"
      desired["SUPABASE_EMAIL_OTP_EXPIRY_SECONDS"] = "600"
      keys[++key_count] = "SUPABASE_MFA_POLICY"
      desired["SUPABASE_MFA_POLICY"] = "optional"
      keys[++key_count] = "RECORDS_ENFORCE_MFA"
      desired["RECORDS_ENFORCE_MFA"] = "false"
      keys[++key_count] = "SUPABASE_CUSTOM_SMTP_ENABLED"
      desired["SUPABASE_CUSTOM_SMTP_ENABLED"] = "true"
      keys[++key_count] = "PWNED_PASSWORD_CHECK_ENABLED"
      desired["PWNED_PASSWORD_CHECK_ENABLED"] = "false"
      keys[++key_count] = "SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED"
      desired["SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED"] = "false"
      keys[++key_count] = "SUPABASE_PASSWORD_REAUTH_ENABLED"
      desired["SUPABASE_PASSWORD_REAUTH_ENABLED"] = "false"
      keys[++key_count] = "SUPABASE_CURRENT_PASSWORD_REQUIRED"
      desired["SUPABASE_CURRENT_PASSWORD_REQUIRED"] = "false"
      keys[++key_count] = "SUPABASE_AUTH_REDIRECTS_VERIFIED_AT"
      desired["SUPABASE_AUTH_REDIRECTS_VERIFIED_AT"] = redirects_verified_at
      keys[++key_count] = "SUPABASE_AUTH_HARDENING_VERIFIED_AT"
      desired["SUPABASE_AUTH_HARDENING_VERIFIED_AT"] = hardening_verified_at
    }
    {
      key = $0
      sub(/=.*/, "", key)
      if (key in desired) {
        if (!(key in seen)) {
          print key "=" desired[key]
          seen[key] = 1
        }
        next
      }
      print
    }
    END {
      for (idx = 1; idx <= key_count; idx += 1) {
        key = keys[idx]
        if (!(key in seen)) {
          print key "=" desired[key]
        }
      }
    }
  ' "${app_env_file}" >"${next_env}"

chmod 0600 "${next_env}"
for expected in \
  'RECORDS_AUTH_METHOD=email_otp' \
  'SUPABASE_EMAIL_OTP_ENABLED=true' \
  'SUPABASE_EMAIL_OTP_LENGTH=6' \
  'SUPABASE_EMAIL_OTP_EXPIRY_SECONDS=600' \
  'SUPABASE_MFA_POLICY=optional' \
  'RECORDS_ENFORCE_MFA=false' \
  'SUPABASE_CUSTOM_SMTP_ENABLED=true' \
  'PWNED_PASSWORD_CHECK_ENABLED=false' \
  'SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED=false' \
  'SUPABASE_PASSWORD_REAUTH_ENABLED=false' \
  'SUPABASE_CURRENT_PASSWORD_REQUIRED=false' \
  "SUPABASE_AUTH_REDIRECTS_VERIFIED_AT=${redirects_verified_at}" \
  "SUPABASE_AUTH_HARDENING_VERIFIED_AT=${hardening_verified_at}"; do
  key="${expected%%=*}"
  if [[ $(grep -c "^${key}=" "${next_env}") -ne 1 ]] || ! grep -Fqx "${expected}" "${next_env}"; then
    echo "Supabase Auth configuration must contain exactly one verified ${key} value." >&2
    exit 1
  fi
done

mv -f "${next_env}" "${app_env_file}"
trap - EXIT
echo "Configured passwordless Supabase email-code authentication and recorded production verification evidence."
