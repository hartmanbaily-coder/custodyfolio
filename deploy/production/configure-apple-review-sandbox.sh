#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Configure the Apple App Review sandbox as the non-root losttofound user." >&2
  exit 1
fi

action="${1:-}"
review_user_id="${2:-}"
review_expires_at="${3:-}"
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
    APPLE_REVIEW_SANDBOX_EXPIRES_AT; do
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
    { print }
    END {
      if (enabled == 0) print "APPLE_REVIEW_SANDBOX_ENABLED=false"
      if (user == 0) print "APPLE_REVIEW_SANDBOX_USER_ID="
      if (expires == 0) print "APPLE_REVIEW_SANDBOX_EXPIRES_AT="
    }
  ' "${app_env_file}" >"${next_env}"
  chmod 0600 "${next_env}"
  mv -f "${next_env}" "${app_env_file}"
  trap - RETURN
  echo "Apple App Review sandbox defaults are installed and closed."
}

validate_scope() {
  [[ ${review_user_id} =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] || {
    echo "The App Review user ID must be a valid UUID." >&2
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
  local next_env
  next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
  trap 'rm -f "${next_env}"' RETURN
  awk -v enabled="${enabled}" -v user_id="${user_id}" -v expires_at="${expires_at}" '
    /^APPLE_REVIEW_SANDBOX_ENABLED=/ { print "APPLE_REVIEW_SANDBOX_ENABLED=" enabled; enabled_count += 1; next }
    /^APPLE_REVIEW_SANDBOX_USER_ID=/ { print "APPLE_REVIEW_SANDBOX_USER_ID=" user_id; user_count += 1; next }
    /^APPLE_REVIEW_SANDBOX_EXPIRES_AT=/ { print "APPLE_REVIEW_SANDBOX_EXPIRES_AT=" expires_at; expires_count += 1; next }
    { print }
    END { if (enabled_count != 1 || user_count != 1 || expires_count != 1) exit 42 }
  ' "${app_env_file}" >"${next_env}"
  chmod 0600 "${next_env}"
  mv -f "${next_env}" "${app_env_file}"
  trap - RETURN
}

open_review() {
  require_protected_file "${app_env_file}"
  validate_scope
  require_safe_provider_state
  write_state true "${review_user_id}" "${review_expires_at}"
  echo "Apple Sandbox purchases are authorized only for the dedicated App Review user until ${review_expires_at}; the existing Stripe checkout state was preserved."
}

close_review() {
  require_protected_file "${app_env_file}"
  write_state false "" ""
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
  open)
    open_review
    ;;
  close)
    close_review
    ;;
  status)
    print_status
    ;;
  *)
    echo "Usage: $0 install|open <user-uuid> <expires-at-utc>|close|status" >&2
    exit 1
    ;;
esac
