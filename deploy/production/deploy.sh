#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Run deployments as the non-root losttofound user." >&2
  exit 1
fi

release_tag="${1:-manual-$(date -u +%Y%m%d%H%M%S)}"
if [[ ! ${release_tag} =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; then
  echo "Release tag contains unsupported characters." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_root="$(cd "${script_dir}/../.." && pwd)"
compose_file="${script_dir}/compose.yml"
env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
state_dir="${LOSTTOFOUND_STATE_DIR:-/srv/losttofound/state}"

if [[ ! -r ${env_file} ]]; then
  echo "Production environment file is missing or unreadable: ${env_file}" >&2
  exit 1
fi
if [[ -L ${env_file} ]]; then
  echo "Refusing to use a symlinked production environment file." >&2
  exit 1
fi
env_mode="$(stat -c '%a' "${env_file}")"
env_owner_uid="$(stat -c '%u' "${env_file}")"
if [[ ${env_mode} != "600" || ${env_owner_uid} != "$(id -u)" ]]; then
  echo "Production environment file must be owned by the deployment user with mode 0600." >&2
  exit 1
fi

runtime_uid="$(id -u)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/${runtime_uid}}"
export DOCKER_HOST="${DOCKER_HOST:-unix://${XDG_RUNTIME_DIR}/docker.sock}"
export COMPOSE_PROJECT_NAME=losttofound
export LOSTTOFOUND_ENV_FILE="${env_file}"
export LOSTTOFOUND_IMAGE_TAG="${release_tag}"

if ! docker info --format '{{json .SecurityOptions}}' | grep -q rootless; then
  echo "Refusing to deploy: Docker is not running in rootless mode." >&2
  exit 1
fi

mkdir -p "${state_dir}"
previous_image=""
existing_container="$(docker compose --env-file "${env_file}" -f "${compose_file}" ps -q losttofound || true)"
if [[ -n ${existing_container} ]]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "${existing_container}")"
fi

cd "${app_root}"
docker compose --env-file "${env_file}" -f "${compose_file}" config --quiet
docker compose --env-file "${env_file}" -f "${compose_file}" build --pull losttofound
docker compose --env-file "${env_file}" -f "${compose_file}" up -d --remove-orphans
docker compose --env-file "${env_file}" -f "${compose_file}" up -d --force-recreate caddy

set +e
"${script_dir}/smoke-test.sh"
smoke_status=$?
set -e

if [[ ${smoke_status} -ne 0 && ${smoke_status} -ne 2 ]]; then
  echo "Deployment validation failed." >&2
  docker compose --env-file "${env_file}" -f "${compose_file}" logs --tail 200 >&2 || true

  if [[ ${previous_image} == losttofound:* ]]; then
    export LOSTTOFOUND_IMAGE_TAG="${previous_image#losttofound:}"
    echo "Rolling back to ${previous_image}." >&2
    docker compose --env-file "${env_file}" -f "${compose_file}" up -d --no-build --remove-orphans
    docker compose --env-file "${env_file}" -f "${compose_file}" up -d --force-recreate caddy
    "${script_dir}/smoke-test.sh" || true
  else
    echo "No previous release is available; stopping the failed first-deployment stack." >&2
    docker compose --env-file "${env_file}" -f "${compose_file}" down --remove-orphans
  fi
  exit 1
fi

"${script_dir}/install-health-watchdog.sh"
printf '%s\n' "${release_tag}" >"${state_dir}/current-release"
docker image prune --force >/dev/null
if [[ ${smoke_status} -eq 2 ]]; then
  printf '%s\n' "blocked" >"${state_dir}/current-readiness"
  echo "Custody Folio release ${release_tag} is running, but customer readiness remains BLOCKED." >&2
else
  printf '%s\n' "ready" >"${state_dir}/current-readiness"
  echo "Custody Folio release ${release_tag} deployed successfully and is customer-ready."
fi
