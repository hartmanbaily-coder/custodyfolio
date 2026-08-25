#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Configure the Apple TestFlight canary as the non-root losttofound user." >&2
  exit 1
fi

action="${1:-}"
canary_user_id="${2:-}"
canary_expires_at="${3:-}"
app_env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
backup_file="${app_env_file}.apple-testflight-canary-backup"
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
  if [[ -e ${backup_file} ]]; then
    echo "Refusing to install defaults while an Apple TestFlight canary backup exists." >&2
    exit 1
  fi

  local next_env key count value
  next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
  trap 'rm -f "${next_env}"' RETURN
  for key in \
    APPLE_PURCHASE_ENABLED \
    APPLE_TESTFLIGHT_CANARY_AUTHORIZED \
    APPLE_TESTFLIGHT_CANARY_USER_ID \
    APPLE_TESTFLIGHT_CANARY_EXPIRES_AT; do
    count="$(env_count "${key}")"
    if [[ ${count} -gt 1 ]]; then
      echo "${key} appears more than once in the protected environment." >&2
      exit 1
    fi
    if [[ ${count} -eq 1 && ( ${key} == "APPLE_PURCHASE_ENABLED" || ${key} == "APPLE_TESTFLIGHT_CANARY_AUTHORIZED" ) ]]; then
      value="$(env_value "${key}")"
      if [[ -n ${value} && ${value} != "false" ]]; then
        echo "Refusing to install closed canary defaults while ${key}=${value}." >&2
        exit 1
      fi
    fi
  done
  awk '
    /^APPLE_PURCHASE_ENABLED=$/ { print "APPLE_PURCHASE_ENABLED=false"; next }
    /^APPLE_TESTFLIGHT_CANARY_AUTHORIZED=$/ { print "APPLE_TESTFLIGHT_CANARY_AUTHORIZED=false"; next }
    /^APPLE_TESTFLIGHT_CANARY_USER_ID=/ { print "APPLE_TESTFLIGHT_CANARY_USER_ID="; next }
    /^APPLE_TESTFLIGHT_CANARY_EXPIRES_AT=/ { print "APPLE_TESTFLIGHT_CANARY_EXPIRES_AT="; next }
    { print }
  ' "${app_env_file}" >"${next_env}"
  for key in \
    APPLE_PURCHASE_ENABLED \
    APPLE_TESTFLIGHT_CANARY_AUTHORIZED \
    APPLE_TESTFLIGHT_CANARY_USER_ID \
    APPLE_TESTFLIGHT_CANARY_EXPIRES_AT; do
    if [[ $(env_count "${key}") -eq 0 ]]; then
      case "${key}" in
        APPLE_PURCHASE_ENABLED)
          printf '%s\n' 'APPLE_PURCHASE_ENABLED=false' >>"${next_env}"
          ;;
        APPLE_TESTFLIGHT_CANARY_AUTHORIZED)
          printf '%s\n' 'APPLE_TESTFLIGHT_CANARY_AUTHORIZED=false' >>"${next_env}"
          ;;
        *)
          printf '%s=\n' "${key}" >>"${next_env}"
          ;;
      esac
    fi
  done
  chmod 0600 "${next_env}"
  mv -f "${next_env}" "${app_env_file}"
  trap - RETURN
  echo "Apple TestFlight canary defaults are installed and closed."
}

require_safe_starting_state() {
  [[ $(env_value BILLING_MODE) == "live" ]] || {
    echo "Refusing to open the TestFlight canary unless live provider servicing is active." >&2
    exit 1
  }
  [[ $(env_value BILLING_CHECKOUT_ENABLED) == "false" ]] || {
    echo "Refusing to open the TestFlight canary while global Stripe checkout is enabled." >&2
    exit 1
  }
  [[ $(env_value BILLING_LIVE_CANARY_AUTHORIZED) == "false" ]] || {
    echo "Refusing to overlap the Apple and Stripe canaries." >&2
    exit 1
  }
  [[ $(env_value APPLE_PURCHASE_ENABLED) == "false" ]] || {
    echo "Refusing to open a TestFlight canary while global Apple purchases are enabled." >&2
    exit 1
  }
  [[ $(env_value APPLE_TESTFLIGHT_CANARY_AUTHORIZED) == "false" ]] || {
    echo "Refusing to replace an already-authorized TestFlight canary." >&2
    exit 1
  }
  if [[ $(env_count APPLE_REVIEW_SANDBOX_ENABLED) -eq 1 ]] &&
    [[ $(env_value APPLE_REVIEW_SANDBOX_ENABLED) != "false" ]]; then
    echo "Refusing to overlap TestFlight and App Review Sandbox authorizations." >&2
    exit 1
  fi
  [[ $(env_value APPLE_BILLING_ENVIRONMENT) == "production" ]] || {
    echo "Refusing to open the TestFlight canary unless the prior Apple state is production." >&2
    exit 1
  }
}

validate_canary_scope() {
  [[ ${canary_user_id} =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] || {
    echo "The TestFlight canary user ID must be a valid UUID." >&2
    exit 1
  }

  local now_epoch expires_epoch remaining
  now_epoch="$(date -u +%s)"
  if date -u -d "${canary_expires_at}" +%s >/dev/null 2>&1; then
    expires_epoch="$(date -u -d "${canary_expires_at}" +%s)"
  else
    expires_epoch="$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "${canary_expires_at}" +%s 2>/dev/null || true)"
  fi
  [[ ${expires_epoch} =~ ^[0-9]+$ ]] || {
    echo "The TestFlight canary expiration must be a UTC ISO-8601 timestamp." >&2
    exit 1
  }
  remaining=$((expires_epoch - now_epoch))
  if (( remaining <= 0 || remaining > 7200 )); then
    echo "The TestFlight canary expiration must be in the future and no more than two hours away." >&2
    exit 1
  fi
}

open_window() {
  require_protected_file "${app_env_file}"
  if [[ -e ${backup_file} ]]; then
    echo "An Apple TestFlight canary backup already exists; close or investigate it first." >&2
    exit 1
  fi
  validate_canary_scope
  require_safe_starting_state

  cp -p "${app_env_file}" "${backup_file}"
  chmod 0600 "${backup_file}"
  local next_env
  next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
  trap 'rm -f "${next_env}"' RETURN
  awk -v user_id="${canary_user_id}" -v expires_at="${canary_expires_at}" '
    BEGIN { mode = 0; checkout = 0; stripe_canary = 0; apple_global = 0; apple_canary = 0; user = 0; expires = 0; environment = 0 }
    /^BILLING_MODE=/ { print "BILLING_MODE=test"; mode += 1; next }
    /^BILLING_CHECKOUT_ENABLED=/ { print "BILLING_CHECKOUT_ENABLED=false"; checkout += 1; next }
    /^BILLING_LIVE_CANARY_AUTHORIZED=/ { print "BILLING_LIVE_CANARY_AUTHORIZED=false"; stripe_canary += 1; next }
    /^APPLE_PURCHASE_ENABLED=/ { print "APPLE_PURCHASE_ENABLED=false"; apple_global += 1; next }
    /^APPLE_TESTFLIGHT_CANARY_AUTHORIZED=/ { print "APPLE_TESTFLIGHT_CANARY_AUTHORIZED=true"; apple_canary += 1; next }
    /^APPLE_TESTFLIGHT_CANARY_USER_ID=/ { print "APPLE_TESTFLIGHT_CANARY_USER_ID=" user_id; user += 1; next }
    /^APPLE_TESTFLIGHT_CANARY_EXPIRES_AT=/ { print "APPLE_TESTFLIGHT_CANARY_EXPIRES_AT=" expires_at; expires += 1; next }
    /^APPLE_BILLING_ENVIRONMENT=/ { print "APPLE_BILLING_ENVIRONMENT=sandbox"; environment += 1; next }
    { print }
    END {
      if (mode != 1 || checkout != 1 || stripe_canary != 1 || apple_global != 1 || apple_canary != 1 || user != 1 || expires != 1 || environment != 1) exit 42
    }
  ' "${app_env_file}" >"${next_env}"
  chmod 0600 "${next_env}"
  mv -f "${next_env}" "${app_env_file}"
  trap - RETURN

  echo "Apple TestFlight canary configured for one user until ${canary_expires_at}; Stripe checkout remains closed."
}

close_window() {
  require_protected_file "${app_env_file}"
  require_protected_file "${backup_file}"
  local next_env
  next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
  trap 'rm -f "${next_env}"' RETURN
  cp "${backup_file}" "${next_env}"
  chmod 0600 "${next_env}"
  mv -f "${next_env}" "${app_env_file}"
  rm -f "${backup_file}"
  trap - RETURN

  echo "Apple TestFlight canary closed and the exact prior environment restored."
}

print_status() {
  require_protected_file "${app_env_file}"
  printf 'mode=%s checkout=%s stripe-canary=%s apple-global=%s apple-testflight-canary=%s apple-environment=%s backup=%s\n' \
    "$(env_value BILLING_MODE)" \
    "$(env_value BILLING_CHECKOUT_ENABLED)" \
    "$(env_value BILLING_LIVE_CANARY_AUTHORIZED)" \
    "$(env_value APPLE_PURCHASE_ENABLED)" \
    "$(env_value APPLE_TESTFLIGHT_CANARY_AUTHORIZED)" \
    "$(env_value APPLE_BILLING_ENVIRONMENT)" \
    "$([[ -e ${backup_file} ]] && printf present || printf absent)"
}

case "${action}" in
  install)
    install_defaults
    ;;
  open)
    open_window
    ;;
  close)
    close_window
    ;;
  status)
    print_status
    ;;
  *)
    echo "Usage: $0 install|open <user-uuid> <expires-at-utc>|close|status" >&2
    exit 1
    ;;
esac
