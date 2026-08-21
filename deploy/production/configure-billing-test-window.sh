#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Configure the billing test window as the non-root losttofound user." >&2
  exit 1
fi

action="${1:-}"
app_env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
backup_file="${app_env_file}.billing-test-window-backup"
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

open_window() {
  require_protected_file "${app_env_file}"
  if [[ -e ${backup_file} ]]; then
    echo "A billing test-window backup already exists; close or investigate it before opening another window." >&2
    exit 1
  fi

  cp -p "${app_env_file}" "${backup_file}"
  chmod 0600 "${backup_file}"
  local next_env
  next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
  trap 'rm -f "${next_env}"' RETURN
  awk '
    BEGIN { mode = 0; checkout = 0; canary = 0 }
    /^BILLING_MODE=/ {
      print "BILLING_MODE=test"
      mode += 1
      next
    }
    /^BILLING_CHECKOUT_ENABLED=/ {
      print "BILLING_CHECKOUT_ENABLED=false"
      checkout += 1
      next
    }
    /^BILLING_LIVE_CANARY_AUTHORIZED=/ {
      print "BILLING_LIVE_CANARY_AUTHORIZED=false"
      canary += 1
      next
    }
    { print }
    END {
      if (mode != 1 || checkout != 1 || canary != 1) exit 42
    }
  ' "${app_env_file}" >"${next_env}"
  chmod 0600 "${next_env}"
  mv -f "${next_env}" "${app_env_file}"
  trap - RETURN

  echo "Billing test window configured: mode=test, checkout=false, live-canary=false."
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

  echo "Billing test window closed and the exact prior environment restored."
}

case "${action}" in
  open)
    open_window
    ;;
  close)
    close_window
    ;;
  *)
    echo "Usage: $0 open|close" >&2
    exit 1
    ;;
esac
