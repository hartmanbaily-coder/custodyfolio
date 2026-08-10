#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Configure backup readiness as the non-root losttofound user." >&2
  exit 1
fi

app_env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
backup_env_file="${LOSTTOFOUND_BACKUP_ENV_FILE:-/srv/losttofound/config/backup.env}"
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

for env_file in "${app_env_file}" "${backup_env_file}"; do
  if [[ ! -f ${env_file} || ! -r ${env_file} || -L ${env_file} ]]; then
    echo "Production configuration is missing, unreadable, or symlinked." >&2
    exit 1
  fi
  if [[ $(file_mode "${env_file}") != "600" || $(file_owner_uid "${env_file}") != "${runtime_uid}" ]]; then
    echo "Production configuration must be owned by the deployment user with mode 0600." >&2
    exit 1
  fi
done

read_backup_value() {
  local key="$1"
  local count
  local value
  count="$(grep -Ec "^${key}=" "${backup_env_file}" || true)"
  if [[ ${count} != "1" ]]; then
    echo "Backup configuration must contain exactly one ${key} entry." >&2
    exit 1
  fi
  value="$(grep -E "^${key}=" "${backup_env_file}")"
  value="${value#*=}"
  if [[ -z ${value} ]]; then
    echo "Backup configuration ${key} must not be empty." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

for required_key in \
  OFFSITE_BACKUP_S3_ENDPOINT \
  OFFSITE_BACKUP_S3_REGION \
  OFFSITE_BACKUP_S3_BUCKET \
  OFFSITE_BACKUP_S3_ACCESS_KEY_ID \
  OFFSITE_BACKUP_S3_SECRET_ACCESS_KEY; do
  read_backup_value "${required_key}" >/dev/null
done

retention_days="$(read_backup_value OFFSITE_BACKUP_RETENTION_DAYS)"
lock_mode="$(read_backup_value OFFSITE_BACKUP_OBJECT_LOCK_MODE)"
lifecycle_delete_days="$(read_backup_value OFFSITE_BACKUP_LIFECYCLE_DELETE_DAYS)"
key_expires_at="$(read_backup_value OFFSITE_BACKUP_KEY_EXPIRES_AT)"
restore_tested_at="$(read_backup_value OFFSITE_BACKUP_RESTORE_TESTED_AT)"

if [[ ! ${retention_days} =~ ^[1-9][0-9]*$ || ! ${lifecycle_delete_days} =~ ^[1-9][0-9]*$ ]]; then
  echo "Backup retention and lifecycle deletion values must be positive integers." >&2
  exit 1
fi
if (( retention_days + lifecycle_delete_days > 180 )); then
  echo "Backup Object Lock plus lifecycle deletion must not exceed 180 days." >&2
  exit 1
fi
if [[ ${lock_mode} != "COMPLIANCE" ]]; then
  echo "Backup Object Lock must use COMPLIANCE mode." >&2
  exit 1
fi
if [[ ! ${key_expires_at} =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ || ! ${restore_tested_at} =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Backup key expiry and restore-test dates must use YYYY-MM-DD." >&2
  exit 1
fi

next_env="$(mktemp "${app_env_file}.next.XXXXXX")"
trap 'rm -f "${next_env}"' EXIT
awk '
  !/^(OFFSITE_STORAGE_BACKUP_ENABLED|OFFSITE_STORAGE_BACKUP_RETENTION_DAYS|OFFSITE_STORAGE_BACKUP_LIFECYCLE_DELETE_DAYS|OFFSITE_STORAGE_BACKUP_KEY_EXPIRES_AT|BACKUP_RESTORE_TESTED_AT)=/
' "${app_env_file}" >"${next_env}"
printf '%s\n' \
  "OFFSITE_STORAGE_BACKUP_ENABLED=true" \
  "OFFSITE_STORAGE_BACKUP_RETENTION_DAYS=${retention_days}" \
  "OFFSITE_STORAGE_BACKUP_LIFECYCLE_DELETE_DAYS=${lifecycle_delete_days}" \
  "OFFSITE_STORAGE_BACKUP_KEY_EXPIRES_AT=${key_expires_at}" \
  "BACKUP_RESTORE_TESTED_AT=${restore_tested_at}" >>"${next_env}"
chmod 0600 "${next_env}"
mv -f "${next_env}" "${app_env_file}"
trap - EXIT

echo "Off-site backup readiness settings updated without exposing credentials."
