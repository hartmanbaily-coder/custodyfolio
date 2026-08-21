#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Configure the billing live canary as the non-root losttofound user." >&2
  exit 1
fi

action="${1:-}"
canary_user_id="${2:-}"
canary_expires_at="${3:-}"
app_env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
backup_file="${app_env_file}.billing-live-canary-backup"
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

env_value() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key { value = substr($0, index($0, "=") + 1); count += 1 } END { if (count != 1) exit 42; print value }' "${app_env_file}"
}

require_safe_starting_state() {
  [[ $(env_value BILLING_MODE) == "disabled" ]] || {
    echo "Refusing to open the live canary unless BILLING_MODE=disabled." >&2
    exit 1
  }
  [[ $(env_value BILLING_CHECKOUT_ENABLED) == "false" ]] || {
    echo "Refusing to open the live canary unless global checkout is disabled." >&2
    exit 1
  }
  [[ $(env_value BILLING_LIVE_CANARY_AUTHORIZED) == "false" ]] || {
    echo "Refusing to replace an already-authorized live canary." >&2
    exit 1
  }
  [[ $(env_value APPLE_BILLING_ENVIRONMENT) == "production" ]] || {
    echo "Refusing to mix Apple sandbox state with the live provider window." >&2
    exit 1
  }
  [[ $(env_value STRIPE_LIVE_RESTRICTED_KEY) == rk_live_* ]] || {
    echo "A Stripe live restricted key is required." >&2
    exit 1
  }
  [[ $(env_value STRIPE_LIVE_WEBHOOK_SECRET) == whsec_* ]] || {
    echo "A Stripe live webhook signing secret is required." >&2
    exit 1
  }
  for approval_flag in \
    LIVE_BILLING_APPROVED \
    BILLING_LIVE_ACTIVATION_AUTHORIZED \
    BILLING_POLICY_COUNSEL_REVIEWED \
    BILLING_TAX_REVIEW_APPROVED; do
    [[ $(env_value "${approval_flag}") == "true" ]] || {
      echo "Refusing to open the live canary until ${approval_flag}=true." >&2
      exit 1
    }
  done
}

validate_canary_scope() {
  [[ ${canary_user_id} =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] || {
    echo "The canary user ID must be a valid UUID." >&2
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
    echo "The canary expiration must be a UTC ISO-8601 timestamp." >&2
    exit 1
  }
  remaining=$((expires_epoch - now_epoch))
  if (( remaining <= 0 || remaining > 86400 )); then
    echo "The canary expiration must be in the future and no more than 24 hours away." >&2
    exit 1
  fi
}

open_window() {
  require_protected_file "${app_env_file}"
  if [[ -e ${backup_file} ]]; then
    echo "A billing live-canary backup already exists; close or investigate it first." >&2
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
    BEGIN { mode = 0; checkout = 0; authorized = 0; user = 0; expires = 0 }
    /^BILLING_MODE=/ { print "BILLING_MODE=live"; mode += 1; next }
    /^BILLING_CHECKOUT_ENABLED=/ { print "BILLING_CHECKOUT_ENABLED=false"; checkout += 1; next }
    /^BILLING_LIVE_CANARY_AUTHORIZED=/ { print "BILLING_LIVE_CANARY_AUTHORIZED=true"; authorized += 1; next }
    /^BILLING_LIVE_CANARY_USER_ID=/ { print "BILLING_LIVE_CANARY_USER_ID=" user_id; user += 1; next }
    /^BILLING_LIVE_CANARY_EXPIRES_AT=/ { print "BILLING_LIVE_CANARY_EXPIRES_AT=" expires_at; expires += 1; next }
    { print }
    END {
      if (mode != 1 || checkout != 1 || authorized != 1 || user != 1 || expires != 1) exit 42
    }
  ' "${app_env_file}" >"${next_env}"
  chmod 0600 "${next_env}"
  mv -f "${next_env}" "${app_env_file}"
  trap - RETURN

  echo "Billing live canary configured: mode=live, global checkout=false, one user authorized until ${canary_expires_at}."
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

  echo "Billing live canary closed and the exact prior environment restored."
}

seal_window() {
  require_protected_file "${app_env_file}"
  require_protected_file "${backup_file}"
  [[ $(env_value BILLING_MODE) == "live" ]] || {
    echo "Refusing to seal a canary unless live provider servicing is active." >&2
    exit 1
  }
  [[ $(env_value BILLING_CHECKOUT_ENABLED) == "false" ]] || {
    echo "Refusing to seal a canary while global checkout is enabled." >&2
    exit 1
  }
  [[ $(env_value BILLING_LIVE_CANARY_AUTHORIZED) == "true" ]] || {
    echo "Refusing to seal a canary that is not currently authorized." >&2
    exit 1
  }

  local next_env
  next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
  trap 'rm -f "${next_env}"' RETURN
  awk '
    BEGIN { authorized = 0; user = 0; expires = 0 }
    /^BILLING_LIVE_CANARY_AUTHORIZED=/ { print "BILLING_LIVE_CANARY_AUTHORIZED=false"; authorized += 1; next }
    /^BILLING_LIVE_CANARY_USER_ID=/ { print "BILLING_LIVE_CANARY_USER_ID="; user += 1; next }
    /^BILLING_LIVE_CANARY_EXPIRES_AT=/ { print "BILLING_LIVE_CANARY_EXPIRES_AT="; expires += 1; next }
    { print }
    END { if (authorized != 1 || user != 1 || expires != 1) exit 42 }
  ' "${app_env_file}" >"${next_env}"
  chmod 0600 "${next_env}"
  mv -f "${next_env}" "${app_env_file}"
  rm -f "${backup_file}"
  trap - RETURN

  echo "Billing live canary sealed: provider servicing remains live and all new checkout is disabled."
}

case "${action}" in
  open)
    open_window
    ;;
  close)
    close_window
    ;;
  seal)
    seal_window
    ;;
  *)
    echo "Usage: $0 open <user-uuid> <expires-at-utc>|close|seal" >&2
    exit 1
    ;;
esac
