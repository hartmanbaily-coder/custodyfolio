#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Configure approval evidence as the non-root losttofound user." >&2
  exit 1
fi

manifest_file="${1:-}"
app_env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
approval_scopes="${PRODUCTION_APPROVAL_SCOPES:-}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_root="$(cd "${script_dir}/../.." && pwd)"
policy_bundle_file="${app_root}/src/generated/productionPolicyBundle.mjs"
runtime_uid="$(id -u)"

requested_scopes=()
requested_flags=()
seen_scopes=","
if [[ -n ${approval_scopes} ]]; then
  IFS=',' read -r -a supplied_scopes <<<"${approval_scopes}"
  for scope in "${supplied_scopes[@]}"; do
    case "${scope}" in
      retention)
        flag="DATA_RETENTION_POLICY_APPROVED"
        ;;
      incident)
        flag="INCIDENT_RESPONSE_PLAN_APPROVED"
        ;;
      legal)
        flag="LEGAL_REVIEW_APPROVED"
        ;;
      *)
        echo "PRODUCTION_APPROVAL_SCOPES must contain only retention, incident, or legal." >&2
        exit 1
        ;;
    esac
    if [[ ${seen_scopes} == *",${scope},"* ]]; then
      continue
    fi
    requested_scopes+=("${scope}")
    requested_flags+=("${flag}")
    seen_scopes+="${scope},"
  done
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

if [[ -z ${manifest_file} ]]; then
  echo "Usage: $0 <approval-manifest.json>" >&2
  exit 1
fi
if [[ ${manifest_file} != /* ]]; then
  manifest_file="${app_root}/${manifest_file}"
fi
if [[ ! -f ${manifest_file} || ! -r ${manifest_file} || -L ${manifest_file} ]]; then
  echo "Approval manifest is missing, unreadable, or symlinked." >&2
  exit 1
fi
if [[ ! -f ${app_env_file} || ! -r ${app_env_file} || -L ${app_env_file} ]]; then
  echo "Production environment is missing, unreadable, or symlinked." >&2
  exit 1
fi
if [[ $(file_mode "${app_env_file}") != "600" || $(file_owner_uid "${app_env_file}") != "${runtime_uid}" ]]; then
  echo "Production environment must be owned by the deployment user with mode 0600." >&2
  exit 1
fi

manifest_digest="$(jq -er '
  select(.schemaVersion == 1) |
  select(.approvals | type == "object") |
  .policyBundleSha256 |
  select(type == "string" and test("^sha256:[0-9a-f]{64}$"))
' "${manifest_file}")"
expected_digest="$(sed -n 's/^export const productionPolicyBundleSha256 = "\([^"]*\)";$/\1/p' "${policy_bundle_file}")"
if [[ -z ${expected_digest} || ${manifest_digest} != "${expected_digest}" ]]; then
  echo "Approval manifest policy digest does not match the deployed policy bundle." >&2
  exit 1
fi

encoded_manifest="$(base64 <"${manifest_file}" | tr -d '\r\n')"
if [[ -z ${encoded_manifest} || ${encoded_manifest} == *$'\n'* || ${encoded_manifest} == *$'\r'* ]]; then
  echo "Approval manifest encoding failed." >&2
  exit 1
fi

next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
trap 'rm -f "${next_env}"' EXIT
approval_flag_pattern='^PRODUCTION_APPROVAL_MANIFEST_BASE64='
if [[ -n ${approval_scopes} ]]; then
  for flag in "${requested_flags[@]}"; do
    approval_flag_pattern+="|^${flag}="
  done
fi
awk -v pattern="${approval_flag_pattern}" '$0 !~ pattern' "${app_env_file}" >"${next_env}"
printf '%s\n' "PRODUCTION_APPROVAL_MANIFEST_BASE64=${encoded_manifest}" >>"${next_env}"
if [[ -n ${approval_scopes} ]]; then
  for flag in "${requested_flags[@]}"; do
    printf '%s\n' "${flag}=true" >>"${next_env}"
  done
fi
chmod 0600 "${next_env}"
mv -f "${next_env}" "${app_env_file}"
trap - EXIT

echo "Digest-bound production approval evidence installed for ${manifest_digest}."
if [[ -n ${approval_scopes} ]]; then
  echo "Enabled verified approval scopes: ${requested_scopes[*]}."
fi
