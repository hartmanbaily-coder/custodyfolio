#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Run production rollback as the non-root losttofound user." >&2
  exit 1
fi

target_tag="${1:-}"
if [[ ! ${target_tag} =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; then
  echo "Usage: $0 <validated-image-tag>" >&2
  exit 1
fi

app_root="${LOSTTOFOUND_APP_ROOT:-/srv/losttofound/app}"
compose_file="${app_root}/deploy/production/compose.yml"
smoke_test="${app_root}/deploy/production/smoke-test.sh"
env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
state_dir="${LOSTTOFOUND_STATE_DIR:-/srv/losttofound/state}"
target_image="losttofound:${target_tag}"

if [[ ! -r ${compose_file} || ! -x ${smoke_test} ]]; then
  echo "Production rollback files are missing from ${app_root}." >&2
  exit 1
fi
if [[ ! -f ${env_file} || ! -r ${env_file} || -L ${env_file} ]]; then
  echo "Production environment file is missing, unreadable, or symlinked." >&2
  exit 1
fi
if [[ $(stat -c '%a' "${env_file}") != "600" || $(stat -c '%u' "${env_file}") != "$(id -u)" ]]; then
  echo "Production environment file must be owned by the deployment user with mode 0600." >&2
  exit 1
fi

runtime_uid="$(id -u)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/${runtime_uid}}"
export DOCKER_HOST="${DOCKER_HOST:-unix://${XDG_RUNTIME_DIR}/docker.sock}"
export COMPOSE_PROJECT_NAME=losttofound
export LOSTTOFOUND_ENV_FILE="${env_file}"

if ! docker info --format '{{json .SecurityOptions}}' | grep -q rootless; then
  echo "Refusing to roll back: Docker is not running in rootless mode." >&2
  exit 1
fi
if ! docker image inspect "${target_image}" >/dev/null 2>&1; then
  echo "Validated rollback image is not present on the production host: ${target_image}" >&2
  exit 1
fi

current_container="$(docker compose --env-file "${env_file}" -f "${compose_file}" ps -q losttofound)"
if [[ -z ${current_container} ]]; then
  echo "The current production app container is missing; refusing an unprotected rollback." >&2
  exit 1
fi
current_image="$(docker inspect --format '{{.Config.Image}}' "${current_container}")"
if [[ ! ${current_image} =~ ^losttofound:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; then
  echo "The current production image tag is invalid; refusing an unprotected rollback." >&2
  exit 1
fi

reload_caddy() {
  docker compose --env-file "${env_file}" -f "${compose_file}" exec -T caddy \
    caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
}

run_smoke() {
  "${smoke_test}"
}

export LOSTTOFOUND_IMAGE_TAG="${target_tag}"
docker compose --env-file "${env_file}" -f "${compose_file}" up -d --no-build --remove-orphans
reload_caddy

set +e
run_smoke
smoke_status=$?
set -e
if [[ ${smoke_status} -ne 0 && ${smoke_status} -ne 2 ]]; then
  export LOSTTOFOUND_IMAGE_TAG="${current_image#losttofound:}"
  echo "Rollback validation failed; restoring ${current_image}." >&2
  docker compose --env-file "${env_file}" -f "${compose_file}" up -d --no-build --remove-orphans
  reload_caddy || true
  set +e
  run_smoke
  set -e
  exit 1
fi

mkdir -p "${state_dir}"
printf '%s\n' "${target_tag}" >"${state_dir}/current-release"
printf '%s\n' "healthy" >"${state_dir}/current-deployment"
if [[ ${smoke_status} -eq 2 ]]; then
  printf '%s\n' "launch-approval-pending" >"${state_dir}/current-readiness"
else
  printf '%s\n' "customer-ready" >"${state_dir}/current-readiness"
fi

echo "Production restored to validated image ${target_image}."
