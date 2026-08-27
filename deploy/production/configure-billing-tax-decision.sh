#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Configure the billing tax decision as the non-root losttofound user." >&2
  exit 1
fi

action="${1:-}"
reviewed_at="${2:-}"
app_env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_root="$(cd "${script_dir}/../.." && pwd)"
runtime_uid="$(id -u)"

if [[ ${action} != "approve-us-only-not-collecting" ]]; then
  echo "Usage: $0 approve-us-only-not-collecting <reviewed-at-utc>" >&2
  exit 1
fi

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

if [[ ! -f ${app_env_file} || ! -r ${app_env_file} || -L ${app_env_file} ]]; then
  echo "Protected environment file is missing, unreadable, or symlinked: ${app_env_file}" >&2
  exit 1
fi
if [[ $(file_mode "${app_env_file}") != "600" || $(file_owner_uid "${app_env_file}") != "${runtime_uid}" ]]; then
  echo "Protected environment file must be owned by the deployment user with mode 0600: ${app_env_file}" >&2
  exit 1
fi
for backup in \
  "${app_env_file}.billing-test-window-backup" \
  "${app_env_file}.billing-live-canary-backup" \
  "${app_env_file}.apple-testflight-canary-backup"; do
  if [[ -e ${backup} ]]; then
    echo "Refusing to update the tax decision while a billing-window backup exists: ${backup}" >&2
    exit 1
  fi
done

if [[ ! ${reviewed_at} =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)?$ ]]; then
  echo "The review date must be an ISO-8601 UTC date or timestamp." >&2
  exit 1
fi
now_epoch="$(date -u +%s)"
if date -u -d "${reviewed_at}" +%s >/dev/null 2>&1; then
  reviewed_epoch="$(date -u -d "${reviewed_at}" +%s)"
else
  reviewed_epoch="$(date -j -u -f '%Y-%m-%d' "${reviewed_at}" +%s 2>/dev/null || true)"
fi
if [[ ! ${reviewed_epoch} =~ ^[0-9]+$ ]] || (( reviewed_epoch > now_epoch || now_epoch - reviewed_epoch > 7 * 24 * 60 * 60 )); then
  echo "The tax decision must be valid, not in the future, and no more than seven days old." >&2
  exit 1
fi

grep -Fq 'export const stripeWebCheckoutCountry = "US" as const;' \
  "${app_root}/src/lib/billing/stripe.ts" || {
  echo "The reviewed release does not enforce the United States Checkout country constant." >&2
  exit 1
}
grep -Fq 'allowed_countries: [stripeWebCheckoutCountry]' \
  "${app_root}/src/lib/billing/stripe.ts" || {
  echo "The reviewed release does not restrict hosted Checkout to the United States." >&2
  exit 1
}
grep -Fq '...stripeUnitedStatesCheckoutControls()' \
  "${app_root}/src/app/api/records/billing/stripe/checkout/route.ts" || {
  echo "The Stripe Checkout route does not install the reviewed market control." >&2
  exit 1
}
grep -Fq 'Direct Stripe web checkout is currently limited to customers with a United States service address.' \
  "${app_root}/src/app/terms/page.tsx" || {
  echo "The reviewed United States-only Checkout disclosure is missing." >&2
  exit 1
}

next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
trap 'rm -f "${next_env}"' EXIT
awk -v reviewed_at="${reviewed_at}" '
  BEGIN {
    keys["STRIPE_TAX_MODE"] = "not_collecting"
    keys["BILLING_TAX_REVIEW_APPROVED"] = "true"
    keys["BILLING_TAX_REVIEWED_AT"] = reviewed_at
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

echo "Recorded the operator-approved United States-only direct-web tax decision."
echo "Stripe automatic tax, Checkout activation, live-billing approval, and Apple purchase flags were not changed."
