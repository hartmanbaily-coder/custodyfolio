#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Configure the billing live release as the non-root losttofound user." >&2
  exit 1
fi

action="${1:-}"
release_scope="${2:-}"
authorized_at="${3:-}"
app_env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
backup_file="${app_env_file}.billing-live-release-backup"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_root="$(cd "${script_dir}/../.." && pwd)"
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

require_no_other_window() {
  local other
  for other in \
    "${app_env_file}.billing-test-window-backup" \
    "${app_env_file}.billing-live-canary-backup" \
    "${app_env_file}.apple-testflight-canary-backup"; do
    if [[ -e ${other} ]]; then
      echo "Refusing to change global checkout while another billing window exists: ${other}" >&2
      exit 1
    fi
  done
}

validate_authorization() {
  if [[ ${release_scope} != "us-web-global" ]]; then
    echo "The release scope must be exactly us-web-global." >&2
    exit 1
  fi
  if [[ ! ${authorized_at} =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    echo "The authorization timestamp must be a UTC ISO-8601 timestamp." >&2
    exit 1
  fi
  local now_epoch authorized_epoch age
  now_epoch="$(date -u +%s)"
  if date -u -d "${authorized_at}" +%s >/dev/null 2>&1; then
    authorized_epoch="$(date -u -d "${authorized_at}" +%s)"
  else
    authorized_epoch="$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "${authorized_at}" +%s 2>/dev/null || true)"
  fi
  [[ ${authorized_epoch} =~ ^[0-9]+$ ]] || {
    echo "The authorization timestamp is invalid." >&2
    exit 1
  }
  age=$((now_epoch - authorized_epoch))
  if (( age < 0 || age > 2 * 60 * 60 )); then
    echo "The activation authorization must be current and no more than two hours old." >&2
    exit 1
  fi
}

require_reviewed_release() {
  grep -Fq 'export const stripeWebCheckoutCountry = "US" as const;' \
    "${app_root}/src/lib/billing/stripe.ts" || {
    echo "The deployed release does not contain the reviewed U.S. Checkout restriction." >&2
    exit 1
  }
  grep -Fq '...stripeUnitedStatesCheckoutControls()' \
    "${app_root}/src/app/api/records/billing/stripe/checkout/route.ts" || {
    echo "The deployed Checkout route does not install the reviewed U.S. market control." >&2
    exit 1
  }
  [[ $(env_value BILLING_CHECKOUT_ENABLED) == "false" ]] || {
    echo "Global checkout is already enabled; refusing to overwrite its state." >&2
    exit 1
  }
  [[ $(env_value BILLING_LIVE_CANARY_AUTHORIZED) == "false" ]] || {
    echo "A Stripe live canary is still authorized." >&2
    exit 1
  }
  [[ $(env_value APPLE_PURCHASE_ENABLED) == "false" ]] || {
    echo "Pause the Apple purchase window before enabling global Stripe checkout." >&2
    exit 1
  }
  [[ $(env_value STRIPE_TAX_MODE) == "not_collecting" ]] || {
    echo "The reviewed U.S.-only release requires STRIPE_TAX_MODE=not_collecting." >&2
    exit 1
  }
  for approval_flag in \
    DATA_RETENTION_POLICY_APPROVED \
    INCIDENT_RESPONSE_PLAN_APPROVED \
    LEGAL_REVIEW_APPROVED \
    BILLING_POLICY_APPROVED \
    BILLING_TAX_REVIEW_APPROVED; do
    [[ $(env_value "${approval_flag}") == "true" ]] || {
      echo "Refusing activation until ${approval_flag}=true." >&2
      exit 1
    }
  done
  [[ $(env_value STRIPE_LIVE_RESTRICTED_KEY) == rk_live_* ]] || {
    echo "A Stripe live restricted key is required." >&2
    exit 1
  }
  [[ $(env_value STRIPE_LIVE_WEBHOOK_SECRET) == whsec_* ]] || {
    echo "A Stripe live webhook signing secret is required." >&2
    exit 1
  }
}

open_release() {
  require_protected_file "${app_env_file}"
  require_no_other_window
  if [[ -e ${backup_file} ]]; then
    echo "A global billing-release backup already exists; close or investigate it first." >&2
    exit 1
  fi
  validate_authorization
  require_reviewed_release

  cp -p "${app_env_file}" "${backup_file}"
  chmod 0600 "${backup_file}"
  local next_env
  next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
  trap 'rm -f "${next_env}"' RETURN
  awk '
    BEGIN {
      keys["BILLING_MODE"] = "live"
      keys["BILLING_CHECKOUT_ENABLED"] = "true"
      keys["LIVE_BILLING_APPROVED"] = "true"
      keys["BILLING_LIVE_ACTIVATION_AUTHORIZED"] = "true"
    }
    {
      separator = index($0, "=")
      key = separator > 0 ? substr($0, 1, separator - 1) : ""
      if (key in keys) {
        seen[key] += 1
        print key "=" keys[key]
        next
      }
      print
    }
    END {
      if (seen["BILLING_MODE"] != 1 || seen["BILLING_CHECKOUT_ENABLED"] != 1) exit 42
      for (key in keys) {
        if (seen[key] > 1) exit 42
        if (seen[key] == 0) print key "=" keys[key]
      }
    }
  ' "${app_env_file}" >"${next_env}"
  chmod 0600 "${next_env}"
  mv -f "${next_env}" "${app_env_file}"
  trap - RETURN

  echo "Global U.S. Stripe web checkout configured for post-change verification."
  echo "Apple purchase settings and provider credentials were not changed."
}

close_release() {
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

  echo "Global billing release closed and the exact prior environment restored."
}

seal_release() {
  require_protected_file "${app_env_file}"
  require_protected_file "${backup_file}"
  [[ $(env_value BILLING_MODE) == "live" ]] || {
    echo "Refusing to seal unless billing servicing is live." >&2
    exit 1
  }
  [[ $(env_value BILLING_CHECKOUT_ENABLED) == "true" ]] || {
    echo "Refusing to seal unless global checkout is enabled." >&2
    exit 1
  }
  [[ $(env_value LIVE_BILLING_APPROVED) == "true" ]] || {
    echo "Refusing to seal without operational live-billing approval." >&2
    exit 1
  }
  [[ $(env_value BILLING_LIVE_ACTIVATION_AUTHORIZED) == "true" ]] || {
    echo "Refusing to seal without current user-authorized activation." >&2
    exit 1
  }
  rm -f "${backup_file}"
  echo "Global U.S. Stripe web checkout activation sealed after verification."
}

case "${action}" in
  open)
    open_release
    ;;
  close)
    close_release
    ;;
  seal)
    seal_release
    ;;
  *)
    echo "Usage: $0 open us-web-global <authorized-at-utc>|close|seal" >&2
    exit 1
    ;;
esac
