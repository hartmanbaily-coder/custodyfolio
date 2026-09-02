#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

env_file="${tmp_dir}/app.env"
owner_hash_file="${tmp_dir}/owner.sha256"
attorney_hash_file="${tmp_dir}/attorney.sha256"
invalid_hash_file="${tmp_dir}/invalid.sha256"
owner_id="724f81aa-b6d1-4b8a-ab59-aec5fe29e7ea"
attorney_id="36d2681c-6a30-4395-b2e9-bcce7502ea21"

printf '%s' '123456' | shasum -a 256 | awk '{ print $1 }' >"${owner_hash_file}"
printf '%s' '654321' | shasum -a 256 | awk '{ print $1 }' >"${attorney_hash_file}"
printf '%s\n' 'not-a-hash' >"${invalid_hash_file}"

cat >"${env_file}" <<'EOF'
BILLING_MODE=live
BILLING_CHECKOUT_ENABLED=true
BILLING_LIVE_CANARY_AUTHORIZED=false
APPLE_PURCHASE_ENABLED=false
APPLE_TESTFLIGHT_CANARY_AUTHORIZED=false
APPLE_REVIEW_SANDBOX_ENABLED=false
APPLE_REVIEW_SANDBOX_USER_ID=
APPLE_REVIEW_SANDBOX_EXPIRES_AT=
APPLE_REVIEW_AUTH_CODE_SHA256=
APPLE_REVIEW_ATTORNEY_USER_ID=
APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256=
EOF
chmod 0600 "${env_file}" "${owner_hash_file}" "${attorney_hash_file}" "${invalid_hash_file}"

expires_at="$(date -u -v+7d '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '+7 days' '+%Y-%m-%dT%H:%M:%SZ')"

legacy_env_file="${tmp_dir}/legacy.env"
cat >"${legacy_env_file}" <<EOF
BILLING_MODE=live
BILLING_CHECKOUT_ENABLED=true
BILLING_LIVE_CANARY_AUTHORIZED=false
APPLE_PURCHASE_ENABLED=false
APPLE_TESTFLIGHT_CANARY_AUTHORIZED=false
APPLE_REVIEW_SANDBOX_ENABLED=true
APPLE_REVIEW_SANDBOX_USER_ID=${owner_id}
APPLE_REVIEW_SANDBOX_EXPIRES_AT=${expires_at}
EOF
chmod 0600 "${legacy_env_file}"
LOSTTOFOUND_ENV_FILE="${legacy_env_file}" \
  "${script_dir}/configure-apple-review-sandbox.sh" migrate
grep -Fqx 'APPLE_REVIEW_SANDBOX_ENABLED=true' "${legacy_env_file}"
grep -Fqx "APPLE_REVIEW_SANDBOX_USER_ID=${owner_id}" "${legacy_env_file}"
grep -Fqx "APPLE_REVIEW_SANDBOX_EXPIRES_AT=${expires_at}" "${legacy_env_file}"
grep -Fqx 'APPLE_REVIEW_AUTH_CODE_SHA256=' "${legacy_env_file}"
grep -Fqx 'APPLE_REVIEW_ATTORNEY_USER_ID=' "${legacy_env_file}"
grep -Fqx 'APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256=' "${legacy_env_file}"

LOSTTOFOUND_ENV_FILE="${env_file}" \
  "${script_dir}/configure-apple-review-sandbox.sh" open-hashed \
  "${owner_id}" "${expires_at}" "${owner_hash_file}" \
  "${attorney_id}" "${attorney_hash_file}"

grep -Fqx 'APPLE_REVIEW_SANDBOX_ENABLED=true' "${env_file}"
grep -Fqx "APPLE_REVIEW_SANDBOX_USER_ID=${owner_id}" "${env_file}"
grep -Fqx "APPLE_REVIEW_ATTORNEY_USER_ID=${attorney_id}" "${env_file}"
grep -Fqx "APPLE_REVIEW_AUTH_CODE_SHA256=$(tr -d '\r\n' <"${owner_hash_file}")" "${env_file}"
grep -Fqx "APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256=$(tr -d '\r\n' <"${attorney_hash_file}")" "${env_file}"
if grep -Eq '123456|654321' "${env_file}"; then
  echo "Plaintext review codes must never be stored in the production environment." >&2
  exit 1
fi

LOSTTOFOUND_ENV_FILE="${env_file}" \
  "${script_dir}/configure-apple-review-sandbox.sh" close
grep -Fqx 'APPLE_REVIEW_SANDBOX_ENABLED=false' "${env_file}"
grep -Fqx 'APPLE_REVIEW_AUTH_CODE_SHA256=' "${env_file}"
grep -Fqx 'APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256=' "${env_file}"

if LOSTTOFOUND_ENV_FILE="${env_file}" \
  "${script_dir}/configure-apple-review-sandbox.sh" open-hashed \
  "${owner_id}" "${expires_at}" "${invalid_hash_file}" \
  "${attorney_id}" "${attorney_hash_file}" 2>"${tmp_dir}/invalid.log"; then
  echo "Invalid App Review code hashes must be rejected." >&2
  exit 1
fi
grep -q 'must contain exactly one SHA-256 hexadecimal value' "${tmp_dir}/invalid.log"

echo "Apple App Review hash-only configuration tests passed."
