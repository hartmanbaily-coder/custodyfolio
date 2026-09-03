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
allow_launch_pending="${ALLOW_LAUNCH_PENDING_DEPLOY:-false}"
if [[ ${allow_launch_pending} != "true" && ${allow_launch_pending} != "false" ]]; then
  echo "ALLOW_LAUNCH_PENDING_DEPLOY must be true or false." >&2
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

env_value() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key { value = substr($0, index($0, "=") + 1); count += 1 } END { if (count != 1) exit 42; print value }' "${env_file}"
}

if [[ ${allow_launch_pending} == "true" ]]; then
  for disabled_flag in \
    RECORDS_SIGNUPS_ENABLED \
    NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED \
    BILLING_CHECKOUT_ENABLED \
    MARKETING_ANALYTICS_ENABLED \
    CUSTOMER_FEEDBACK_INVITE_ENABLED; do
    if [[ $(env_value "${disabled_flag}") != "false" ]]; then
      echo "Launch-pending deployment requires ${disabled_flag}=false." >&2
      exit 1
    fi
  done
fi

runtime_uid="$(id -u)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/${runtime_uid}}"
export DOCKER_HOST="${DOCKER_HOST:-unix://${XDG_RUNTIME_DIR}/docker.sock}"
export COMPOSE_PROJECT_NAME=losttofound
export LOSTTOFOUND_ENV_FILE="${env_file}"
export LOSTTOFOUND_IMAGE_TAG="${release_tag}"

build_cache_retention="${DOCKER_BUILD_CACHE_RETENTION:-48h}"
if [[ ! ${build_cache_retention} =~ ^[1-9][0-9]*[hm]$ ]]; then
  echo "DOCKER_BUILD_CACHE_RETENTION must be a positive duration in hours or minutes." >&2
  exit 1
fi

reload_caddy() {
  local attempts="${CADDY_RELOAD_ATTEMPTS:-12}"
  local sleep_seconds="${CADDY_RELOAD_SLEEP_SECONDS:-2}"

  if [[ ! ${attempts} =~ ^[1-9][0-9]*$ ]]; then
    echo "CADDY_RELOAD_ATTEMPTS must be a positive integer." >&2
    return 1
  fi
  if [[ ! ${sleep_seconds} =~ ^[0-9]+$ ]]; then
    echo "CADDY_RELOAD_SLEEP_SECONDS must be a non-negative integer." >&2
    return 1
  fi

  for attempt in $(seq 1 "${attempts}"); do
    if docker compose --env-file "${env_file}" -f "${compose_file}" exec -T caddy \
      caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
      echo "Caddy configuration reloaded in place; the Cloudflare origin stayed online."
      return 0
    fi
    if [[ ${attempt} -lt ${attempts} ]]; then
      sleep "${sleep_seconds}"
    fi
  done

  echo "Caddy configuration could not be reloaded without restarting the origin." >&2
  return 1
}

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
# Rootless BuildKit keeps cache from every release unless it is pruned explicitly.
# Bound that cache before building so a full disk cannot prevent a safe deployment.
# Tagged release images remain untouched for rollback and incident recovery.
docker builder prune --all --force --filter "until=${build_cache_retention}" >/dev/null
docker compose --env-file "${env_file}" -f "${compose_file}" build --pull losttofound
docker compose --env-file "${env_file}" -f "${compose_file}" up -d --remove-orphans

set +e
reload_caddy
caddy_reload_status=$?
if [[ ${caddy_reload_status} -eq 0 ]]; then
  "${script_dir}/smoke-test.sh"
  smoke_status=$?
else
  smoke_status=1
fi
set -e

if [[ ${smoke_status} -eq 2 && ${allow_launch_pending} != "true" ]]; then
  echo "Deployment readiness blockers are present; refusing to publish this release." >&2
  smoke_status=1
fi

if [[ ${smoke_status} -ne 0 && ${smoke_status} -ne 2 ]]; then
  echo "Deployment validation failed." >&2
  docker compose --env-file "${env_file}" -f "${compose_file}" logs --tail 200 >&2 || true

  if [[ ${previous_image} == losttofound:* ]]; then
    export LOSTTOFOUND_IMAGE_TAG="${previous_image#losttofound:}"
    echo "Rolling back to ${previous_image}." >&2
    docker compose --env-file "${env_file}" -f "${compose_file}" up -d --no-build --remove-orphans
    reload_caddy || true
    "${script_dir}/smoke-test.sh" || true
  else
    echo "No previous release is available; stopping the failed first-deployment stack." >&2
    docker compose --env-file "${env_file}" -f "${compose_file}" down --remove-orphans
  fi
  exit 1
fi

"${script_dir}/install-health-watchdog.sh"
printf '%s\n' "${release_tag}" >"${state_dir}/current-release"
backup_env_file="${LOSTTOFOUND_BACKUP_ENV_FILE:-/srv/losttofound/config/backup.env}"
if [[ -r ${backup_env_file} ]]; then
  "${script_dir}/install-storage-backup-timer.sh"
else
  echo "Off-site backup timer installation deferred until backup.env is configured."
fi
printf '%s\n' "healthy" >"${state_dir}/current-deployment"
docker image prune --force >/dev/null
if [[ ${smoke_status} -eq 2 ]]; then
  printf '%s\n' "launch-approval-pending" >"${state_dir}/current-readiness"
  echo "Custody Folio release ${release_tag} deployed successfully for testing. Customer launch approval checks remain pending."
else
  printf '%s\n' "customer-ready" >"${state_dir}/current-readiness"
  echo "Custody Folio release ${release_tag} deployed successfully and is customer-ready."
fi
