#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Run the synthetic attorney test as the non-root losttofound user." >&2
  exit 1
fi

image_tag="${1:-}"
if [[ ! ${image_tag} =~ ^losttofound:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; then
  echo "Usage: $0 losttofound:<validated-release-tag>" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_root="$(cd "${script_dir}/../.." && pwd)"
env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
network="${LOSTTOFOUND_DOCKER_NETWORK:-losttofound_edge}"
container_name="custodyfolio-attorney-check-$(date -u +%Y%m%d%H%M%S)"
verifier="${app_root}/scripts/verify-attorney-access.mjs"

if [[ ! -r ${env_file} || -L ${env_file} ]]; then
  echo "Production environment file is missing, unreadable, or symlinked." >&2
  exit 1
fi
if [[ ! -r ${verifier} || -L ${verifier} ]]; then
  echo "Synthetic attorney verifier is missing, unreadable, or symlinked." >&2
  exit 1
fi
if ! docker info --format '{{json .SecurityOptions}}' | grep -q rootless; then
  echo "Refusing to test: Docker is not running in rootless mode." >&2
  exit 1
fi
if ! docker image inspect "${image_tag}" >/dev/null 2>&1; then
  echo "Validated release image is unavailable: ${image_tag}" >&2
  exit 1
fi

cleanup() {
  docker stop --time 10 "${container_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run --rm --detach \
  --name "${container_name}" \
  --network "${network}" \
  --env-file "${env_file}" \
  --mount "type=bind,src=${verifier},dst=/app/scripts/verify-attorney-access.mjs,readonly" \
  "${image_tag}" >/dev/null

for attempt in $(seq 1 30); do
  if docker exec "${container_name}" node -e \
    "fetch('http://127.0.0.1:3000/api/ping').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
    break
  fi
  if [[ ${attempt} -eq 30 ]]; then
    echo "Isolated secured app did not become healthy." >&2
    exit 1
  fi
  sleep 1
done

set +e
docker exec \
  --env ALLOW_SYNTHETIC_ATTORNEY_TEST=true \
  --env RECORDS_APP_BASE_URL=http://127.0.0.1:3000 \
  "${container_name}" \
  node /app/scripts/verify-attorney-access.mjs
verification_status=$?
set -e

if [[ ${verification_status} -ne 0 ]]; then
  docker logs "${container_name}" 2>&1 \
    | tail -n 100 >&2 || true
fi
exit "${verification_status}"
