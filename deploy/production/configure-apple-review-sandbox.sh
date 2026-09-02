#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Configure the Apple App Review sandbox as the non-root losttofound user." >&2
  exit 1
fi

action="${1:-}"
review_user_id="${2:-}"
review_expires_at="${3:-}"
review_code_file="${4:-}"
review_attorney_user_id="${5:-}"
review_attorney_code_file="${6:-}"
app_env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
runtime_uid="$(id -u)"

file_mode() {
  if stat -c '%a' "$1" >/dev/null 2>&1; then
    stat -c '%a' "$1"
  else
    stat -f '%Lp' "$1"
  fi
}

file_owner_uid() {
  if stat -c '%u' "$1" >/dev/null 2>&1; then
    stat -c '%u' "$1"
  else
    stat -f '%u' "$1"
  fi
}

require_protected_file() {
  local path="$1"
  if [[ ! -f ${path} || ! -r ${path} || -L ${path} ]]; then
    echo "Protected environment file is missing, unreadable, or symlinked: ${path}" >&2
    exit 1
  fi
  if [[ $(file_mode "${path}") != "600" || $(file_owner_uid "${path}") != "${runtime_uid}" ]]; then
    echo "Protected environment file must be owned by the deployment user with mode 0600: ${path}" >&2
    exit 1
  fi
}

env_count() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key { count += 1 } END { print count + 0 }' "${app_env_file}"
}

env_value() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key { value = substr($0, index($0, "=") + 1); count += 1 } END { if (count != 1) exit 42; print value }' "${app_env_file}"
}

install_defaults() {
  require_protected_file "${app_env_file}"
  local key count enabled_value next_env
  for key in \
    APPLE_REVIEW_SANDBOX_ENABLED \
    APPLE_REVIEW_SANDBOX_USER_ID \
    APPLE_REVIEW_SANDBOX_EXPIRES_AT \
    APPLE_REVIEW_AUTH_CODE_SHA256 \
    APPLE_REVIEW_ATTORNEY_USER_ID \
    APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256; do
    count="$(env_count "${key}")"
    if [[ ${count} -gt 1 ]]; then
      echo "${key} appears more than once in the protected environment." >&2
      exit 1
    fi
  done
  if [[ $(env_count APPLE_REVIEW_SANDBOX_ENABLED) -eq 1 ]]; then
    enabled_value="$(env_value APPLE_REVIEW_SANDBOX_ENABLED)"
    if [[ -n ${enabled_value} && ${enabled_value} != "false" ]]; then
      echo "Refusing to install closed review defaults while APPLE_REVIEW_SANDBOX_ENABLED=${enabled_value}." >&2
      exit 1
    fi
  fi

  next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
  trap 'rm -f "${next_env}"' RETURN
  awk '
    /^APPLE_REVIEW_SANDBOX_ENABLED=/ { print "APPLE_REVIEW_SANDBOX_ENABLED=false"; enabled += 1; next }
    /^APPLE_REVIEW_SANDBOX_USER_ID=/ { print "APPLE_REVIEW_SANDBOX_USER_ID="; user += 1; next }
    /^APPLE_REVIEW_SANDBOX_EXPIRES_AT=/ { print "APPLE_REVIEW_SANDBOX_EXPIRES_AT="; expires += 1; next }
    /^APPLE_REVIEW_AUTH_CODE_SHA256=/ { print "APPLE_REVIEW_AUTH_CODE_SHA256="; auth_code += 1; next }
    /^APPLE_REVIEW_ATTORNEY_USER_ID=/ { print "APPLE_REVIEW_ATTORNEY_USER_ID="; attorney_user += 1; next }
    /^APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256=/ { print "APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256="; attorney_code += 1; next }
    { print }
    END {
      if (enabled == 0) print "APPLE_REVIEW_SANDBOX_ENABLED=false"
      if (user == 0) print "APPLE_REVIEW_SANDBOX_USER_ID="
      if (expires == 0) print "APPLE_REVIEW_SANDBOX_EXPIRES_AT="
      if (auth_code == 0) print "APPLE_REVIEW_AUTH_CODE_SHA256="
      if (attorney_user == 0) print "APPLE_REVIEW_ATTORNEY_USER_ID="
      if (attorney_code == 0) print "APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256="
    }
  ' "${app_env_file}" >"${next_env}"
  chmod 0600 "${next_env}"
  mv -f "${next_env}" "${app_env_file}"
  trap - RETURN
  echo "Apple App Review sandbox defaults are installed and closed."
}

migrate_state_schema() {
  require_protected_file "${app_env_file}"
  local key count next_env
  for key in \
    APPLE_REVIEW_SANDBOX_ENABLED \
    APPLE_REVIEW_SANDBOX_USER_ID \
    APPLE_REVIEW_SANDBOX_EXPIRES_AT \
    APPLE_REVIEW_AUTH_CODE_SHA256 \
    APPLE_REVIEW_ATTORNEY_USER_ID \
    APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256; do
    count="$(env_count "${key}")"
    if [[ ${count} -gt 1 ]]; then
      echo "${key} appears more than once in the protected environment." >&2
      exit 1
    fi
  done

  next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
  trap 'rm -f "${next_env}"' RETURN
  awk '
    /^APPLE_REVIEW_SANDBOX_ENABLED=/ { enabled += 1 }
    /^APPLE_REVIEW_SANDBOX_USER_ID=/ { user += 1 }
    /^APPLE_REVIEW_SANDBOX_EXPIRES_AT=/ { expires += 1 }
    /^APPLE_REVIEW_AUTH_CODE_SHA256=/ { auth_code += 1 }
    /^APPLE_REVIEW_ATTORNEY_USER_ID=/ { attorney_user += 1 }
    /^APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256=/ { attorney_code += 1 }
    { print }
    END {
      if (enabled == 0) print "APPLE_REVIEW_SANDBOX_ENABLED=false"
      if (user == 0) print "APPLE_REVIEW_SANDBOX_USER_ID="
      if (expires == 0) print "APPLE_REVIEW_SANDBOX_EXPIRES_AT="
      if (auth_code == 0) print "APPLE_REVIEW_AUTH_CODE_SHA256="
      if (attorney_user == 0) print "APPLE_REVIEW_ATTORNEY_USER_ID="
      if (attorney_code == 0) print "APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256="
    }
  ' "${app_env_file}" >"${next_env}"
  chmod 0600 "${next_env}"
  mv -f "${next_env}" "${app_env_file}"
  trap - RETURN
  echo "Apple App Review sandbox environment schema is current; existing review state was preserved."
}

review_code_hash() {
  local code_file="$1"
  [[ -n ${code_file} ]] || {
    echo "A protected file containing the six-digit App Review code is required." >&2
    exit 1
  }
  require_protected_file "${code_file}"
  local code
  code="$(tr -d '\r\n' <"${code_file}")"
  [[ ${code} =~ ^[0-9]{6}$ ]] || {
    echo "The App Review code file must contain exactly six digits and a trailing newline at most." >&2
    exit 1
  }
  printf '%s' "${code}" | shasum -a 256 | awk '{ print $1 }'
}

review_code_hash_file() {
  local hash_file="$1"
  [[ -n ${hash_file} ]] || {
    echo "A protected file containing the App Review code SHA-256 value is required." >&2
    exit 1
  }
  require_protected_file "${hash_file}"
  local code_hash
  code_hash="$(tr -d '\r\n' <"${hash_file}")"
  [[ ${code_hash} =~ ^[0-9a-fA-F]{64}$ ]] || {
    echo "The App Review code hash file must contain exactly one SHA-256 hexadecimal value." >&2
    exit 1
  }
  printf '%s\n' "${code_hash}" | tr 'A-F' 'a-f'
}

validate_scope() {
  [[ ${review_user_id} =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] || {
    echo "The App Review user ID must be a valid UUID." >&2
    exit 1
  }
  [[ ${review_attorney_user_id} =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] || {
    echo "The App Review attorney user ID must be a valid UUID." >&2
    exit 1
  }
  [[ ${review_attorney_user_id} != "${review_user_id}" ]] || {
    echo "The App Review owner and attorney must be different users." >&2
    exit 1
  }
  local now_epoch expires_epoch remaining
  now_epoch="$(date -u +%s)"
  if date -u -d "${review_expires_at}" +%s >/dev/null 2>&1; then
    expires_epoch="$(date -u -d "${review_expires_at}" +%s)"
  else
    expires_epoch="$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "${review_expires_at}" +%s 2>/dev/null || true)"
  fi
  [[ ${expires_epoch} =~ ^[0-9]+$ ]] || {
    echo "The App Review expiration must be a UTC ISO-8601 timestamp." >&2
    exit 1
  }
  remaining=$((expires_epoch - now_epoch))
  if (( remaining <= 0 || remaining > 45 * 24 * 60 * 60 )); then
    echo "The App Review expiration must be in the future and no more than 45 days away." >&2
    exit 1
  fi
}

require_safe_provider_state() {
  [[ $(env_value BILLING_MODE) == "live" ]] || {
    echo "App Review requires live provider servicing to remain active." >&2
    exit 1
  }
  [[ $(env_value BILLING_LIVE_CANARY_AUTHORIZED) == "false" ]] || {
    echo "Refusing to overlap App Review with a Stripe canary." >&2
    exit 1
  }
  [[ $(env_value APPLE_PURCHASE_ENABLED) == "false" ]] || {
    echo "Refusing to overlap App Review with global Apple purchases." >&2
    exit 1
  }
  [[ $(env_value APPLE_TESTFLIGHT_CANARY_AUTHORIZED) == "false" ]] || {
    echo "Refusing to overlap App Review with a TestFlight canary." >&2
    exit 1
  }
  [[ $(env_value APPLE_REVIEW_SANDBOX_ENABLED) == "false" ]] || {
    echo "The Apple App Review sandbox is already enabled." >&2
    exit 1
  }
}

write_state() {
  local enabled="$1"
  local user_id="$2"
  local expires_at="$3"
  local auth_code_sha256="$4"
  local attorney_user_id="$5"
  local attorney_auth_code_sha256="$6"
  local next_env
  next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
  trap 'rm -f "${next_env}"' RETURN
  awk -v enabled="${enabled}" -v user_id="${user_id}" -v expires_at="${expires_at}" -v auth_code_sha256="${auth_code_sha256}" -v attorney_user_id="${attorney_user_id}" -v attorney_auth_code_sha256="${attorney_auth_code_sha256}" '
    /^APPLE_REVIEW_SANDBOX_ENABLED=/ { print "APPLE_REVIEW_SANDBOX_ENABLED=" enabled; enabled_count += 1; next }
    /^APPLE_REVIEW_SANDBOX_USER_ID=/ { print "APPLE_REVIEW_SANDBOX_USER_ID=" user_id; user_count += 1; next }
    /^APPLE_REVIEW_SANDBOX_EXPIRES_AT=/ { print "APPLE_REVIEW_SANDBOX_EXPIRES_AT=" expires_at; expires_count += 1; next }
    /^APPLE_REVIEW_AUTH_CODE_SHA256=/ { print "APPLE_REVIEW_AUTH_CODE_SHA256=" auth_code_sha256; auth_code_count += 1; next }
    /^APPLE_REVIEW_ATTORNEY_USER_ID=/ { print "APPLE_REVIEW_ATTORNEY_USER_ID=" attorney_user_id; attorney_user_count += 1; next }
    /^APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256=/ { print "APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256=" attorney_auth_code_sha256; attorney_auth_code_count += 1; next }
    { print }
    END { if (enabled_count != 1 || user_count != 1 || expires_count != 1 || auth_code_count != 1 || attorney_user_count != 1 || attorney_auth_code_count != 1) exit 42 }
  ' "${app_env_file}" >"${next_env}"
  chmod 0600 "${next_env}"
  mv -f "${next_env}" "${app_env_file}"
  trap - RETURN
}

open_review() {
  require_protected_file "${app_env_file}"
  validate_scope
  require_safe_provider_state
  local auth_code_sha256 attorney_auth_code_sha256
  auth_code_sha256="$(review_code_hash "${review_code_file}")"
  attorney_auth_code_sha256="$(review_code_hash "${review_attorney_code_file}")"
  write_state true "${review_user_id}" "${review_expires_at}" "${auth_code_sha256}" "${review_attorney_user_id}" "${attorney_auth_code_sha256}"
  echo "Apple review access is authorized only for the dedicated owner and attorney users until ${review_expires_at}; Apple Sandbox purchases remain limited to the owner and the existing Stripe checkout state was preserved."
}

open_hashed_review() {
  require_protected_file "${app_env_file}"
  validate_scope
  require_safe_provider_state
  local auth_code_sha256 attorney_auth_code_sha256
  auth_code_sha256="$(review_code_hash_file "${review_code_file}")"
  attorney_auth_code_sha256="$(review_code_hash_file "${review_attorney_code_file}")"
  write_state true "${review_user_id}" "${review_expires_at}" "${auth_code_sha256}" "${review_attorney_user_id}" "${attorney_auth_code_sha256}"
  echo "Apple review access is authorized from protected code hashes only; plaintext review codes were not copied to the production host."
}

close_review() {
  require_protected_file "${app_env_file}"
  write_state false "" "" "" "" ""
  echo "Apple App Review sandbox authorization is closed."
}

print_status() {
  require_protected_file "${app_env_file}"
  printf 'mode=%s stripe-checkout=%s review-sandbox=%s expires=%s\n' \
    "$(env_value BILLING_MODE)" \
    "$(env_value BILLING_CHECKOUT_ENABLED)" \
    "$(env_value APPLE_REVIEW_SANDBOX_ENABLED)" \
    "$(env_value APPLE_REVIEW_SANDBOX_EXPIRES_AT)"
}

case "${action}" in
  install)
    install_defaults
    ;;
  migrate)
    migrate_state_schema
    ;;
  open)
    open_review
    ;;
  open-hashed)
    open_hashed_review
    ;;
  close)
    close_review
    ;;
  status)
    print_status
    ;;
  *)
    echo "Usage: $0 install|migrate|open|open-hashed <owner-user-uuid> <expires-at-utc> <owner-code-or-hash-file> <attorney-user-uuid> <attorney-code-or-hash-file>|close|status" >&2
    exit 1
    ;;
esac
