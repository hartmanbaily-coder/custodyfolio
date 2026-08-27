#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Configure billing readiness evidence as the non-root losttofound user." >&2
  exit 1
fi

provider_tested_at="${1:-}"
reconciliation_tested_at="${2:-}"
migration_verified_at="${3:-}"
policy_versions_verified_at="${4:-}"
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

validate_date() {
  local name="$1"
  local value="$2"
  local now_epoch parsed_epoch
  [[ ${value} =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)?$ ]] || {
    echo "${name} must be an ISO-8601 UTC date or timestamp." >&2
    exit 1
  }
  now_epoch="$(date -u +%s)"
  if date -u -d "${value}" +%s >/dev/null 2>&1; then
    parsed_epoch="$(date -u -d "${value}" +%s)"
  else
    parsed_epoch="$(date -j -u -f '%Y-%m-%d' "${value}" +%s 2>/dev/null || true)"
  fi
  [[ ${parsed_epoch} =~ ^[0-9]+$ ]] || {
    echo "${name} is not a valid date." >&2
    exit 1
  }
  if (( parsed_epoch > now_epoch || now_epoch - parsed_epoch > 30 * 24 * 60 * 60 )); then
    echo "${name} must be no more than 30 days old and not in the future." >&2
    exit 1
  fi
}

require_protected_file "${app_env_file}"
for backup in \
  "${app_env_file}.billing-test-window-backup" \
  "${app_env_file}.billing-live-canary-backup" \
  "${app_env_file}.apple-testflight-canary-backup"; do
  if [[ -e ${backup} ]]; then
    echo "Refusing to update evidence while a billing-window backup exists: ${backup}" >&2
    exit 1
  fi
done
validate_date BILLING_PROVIDER_TESTED_AT "${provider_tested_at}"
validate_date BILLING_RECONCILIATION_TESTED_AT "${reconciliation_tested_at}"
validate_date BILLING_MIGRATION_VERIFIED_AT "${migration_verified_at}"
validate_date BILLING_POLICY_VERSIONS_VERIFIED_AT "${policy_versions_verified_at}"

next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
trap 'rm -f "${next_env}"' EXIT
awk \
  -v provider_tested_at="${provider_tested_at}" \
  -v reconciliation_tested_at="${reconciliation_tested_at}" \
  -v migration_verified_at="${migration_verified_at}" \
  -v policy_versions_verified_at="${policy_versions_verified_at}" '
  BEGIN {
    keys["BILLING_PROVIDER_TESTED_AT"] = provider_tested_at
    keys["BILLING_RECONCILIATION_TESTED_AT"] = reconciliation_tested_at
    keys["BILLING_MIGRATION_VERIFIED_AT"] = migration_verified_at
    keys["BILLING_TERMS_VERSION"] = "2026-08-23"
    keys["BILLING_PRIVACY_VERSION"] = "2026-08-23"
    keys["BILLING_SUBPROCESSOR_VERSION"] = "2026-08-23"
    keys["BILLING_DISCLOSURE_VERSION"] = "2026-08-23-stripe-web"
    keys["BILLING_POLICY_APPROVED"] = "true"
    keys["BILLING_POLICY_APPROVAL_BASIS"] = "operator_self_review"
    keys["BILLING_POLICY_VERSIONS_VERIFIED_AT"] = policy_versions_verified_at
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
    for (key in keys) {
      if (seen[key] > 1) exit 42
      if (seen[key] == 0) print key "=" keys[key]
    }
  }
' "${app_env_file}" >"${next_env}"
chmod 0600 "${next_env}"
mv -f "${next_env}" "${app_env_file}"
trap - EXIT

echo "Recorded verified billing test, migration, and operator-approved policy-version evidence."
echo "Checkout, live-activation, tax, and Apple production-acceptance flags were not changed."
