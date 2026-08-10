#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Run evidence backups as the non-root losttofound user." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_root="${LOSTTOFOUND_APP_ROOT:-$(cd "${script_dir}/../.." && pwd)}"
compose_file="${LOSTTOFOUND_COMPOSE_FILE:-${script_dir}/compose.yml}"
env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
backup_env_file="${LOSTTOFOUND_BACKUP_ENV_FILE:-/srv/losttofound/config/backup.env}"
state_dir="${LOSTTOFOUND_STATE_DIR:-/srv/losttofound/state}"
docker_bin="${DOCKER_BIN:-docker}"
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

for secret_file in "${env_file}" "${backup_env_file}"; do
  if [[ ! -r ${secret_file} || -L ${secret_file} ]]; then
    echo "Backup secret file is missing, unreadable, or symlinked: ${secret_file}" >&2
    exit 1
  fi
  if [[ $(file_mode "${secret_file}") != "600" || $(file_owner_uid "${secret_file}") != "${runtime_uid}" ]]; then
    echo "Backup secret files must be owned by the deployment user with mode 0600." >&2
    exit 1
  fi
done

release_file="${state_dir}/current-release"
if [[ ! -r ${release_file} ]]; then
  echo "Current production release state is unavailable." >&2
  exit 1
fi
release_tag="$(<"${release_file}")"
if [[ ! ${release_tag} =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; then
  echo "Current production release tag is invalid." >&2
  exit 1
fi

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/${runtime_uid}}"
export DOCKER_HOST="${DOCKER_HOST:-unix://${XDG_RUNTIME_DIR}/docker.sock}"
export COMPOSE_PROJECT_NAME=losttofound
export LOSTTOFOUND_ENV_FILE="${env_file}"
export LOSTTOFOUND_BACKUP_ENV_FILE="${backup_env_file}"
export LOSTTOFOUND_IMAGE_TAG="${release_tag}"

cd "${app_root}"
"${docker_bin}" compose --profile ops --env-file "${env_file}" -f "${compose_file}" \
  run --rm --no-deps backup
install -d -m 0700 "${state_dir}"
date -u +%Y-%m-%dT%H:%M:%SZ >"${state_dir}/storage-backup-last-success"
chmod 0600 "${state_dir}/storage-backup-last-success"
