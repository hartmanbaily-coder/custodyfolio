#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_file="${script_dir}/compose.yml"
env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
runtime_uid="$(id -u)"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/${runtime_uid}}"
export DOCKER_HOST="${DOCKER_HOST:-unix://${XDG_RUNTIME_DIR}/docker.sock}"
export COMPOSE_PROJECT_NAME=losttofound
export LOSTTOFOUND_ENV_FILE="${env_file}"
public_url="${LOSTTOFOUND_PUBLIC_URL:-https://custodyfolio.com}"

for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:8080/caddy-health >/dev/null && \
    curl --fail --silent --show-error http://127.0.0.1:8080/records >/dev/null; then
    break
  fi
  if [[ ${attempt} -eq 30 ]]; then
    echo "Local Caddy/app health checks did not become ready." >&2
    exit 1
  fi
  sleep 5
done

for attempt in $(seq 1 12); do
  cloudflared_container="$(docker compose --env-file "${env_file}" -f "${compose_file}" ps -q cloudflared)"
  if [[ -n ${cloudflared_container} ]] && \
    [[ $(docker inspect --format '{{.State.Running}}' "${cloudflared_container}") == "true" ]] && \
    docker compose --env-file "${env_file}" -f "${compose_file}" logs --no-color cloudflared 2>&1 | \
      grep -q 'Registered tunnel connection' && \
    curl --fail --silent --show-error "${public_url}/records" >/dev/null; then
    break
  fi
  if [[ ${attempt} -eq 12 ]]; then
    echo "Cloudflare Tunnel did not become reachable at ${public_url}." >&2
    exit 1
  fi
  sleep 5
done

readiness_file="$(mktemp)"
trap 'rm -f "${readiness_file}"' EXIT
readiness_http="$(curl --silent --show-error --output "${readiness_file}" \
  --write-out '%{http_code}' http://127.0.0.1:8080/api/records/readiness)"
if [[ ${readiness_http} != "200" && ${readiness_http} != "503" ]]; then
  echo "Readiness API returned unexpected HTTP ${readiness_http}." >&2
  exit 1
fi

readiness_status="$(jq -r '.status // ""' "${readiness_file}")"
if [[ ${readiness_status} != "ready" && ${readiness_status} != "not_ready" ]]; then
  echo "Readiness API returned unknown status '${readiness_status}'." >&2
  exit 1
fi

if ! jq -e '
  (.blockers | type == "array" and all(.[]; (.id | type == "string") and (.id | length > 0))) and
  (.checks | type == "array" and all(.[]; (.id | type == "string") and (.id | length > 0)))
' "${readiness_file}" >/dev/null; then
  echo "Readiness API returned malformed blockers or checks." >&2
  exit 1
fi

mapfile -t readiness_blockers < <(jq -r '.blockers[].id' "${readiness_file}")
for blocker in "${readiness_blockers[@]}"; do
  if ! jq -e --arg blocker "${blocker}" \
    '.checks | any(.id == $blocker)' "${readiness_file}" >/dev/null; then
    echo "Readiness API blocker '${blocker}' is not present in its checks catalog." >&2
    exit 1
  fi
done

if [[ ${readiness_status} == "not_ready" && ${#readiness_blockers[@]} -eq 0 ]]; then
  echo "Readiness API returned not_ready without an explanatory blocker." >&2
  exit 1
fi
readiness_blocked=false
if [[ ${readiness_status} == "not_ready" ]]; then
  readiness_blocked=true
  echo "Customer readiness remains BLOCKED: ${readiness_blockers[*]}" >&2
fi

login_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Origin: ${public_url%/}" \
  --header 'Sec-Fetch-Site: same-origin' \
  --data '{"email":"deploy-probe","password":"not-a-real-password","adultConfirmed":true}' \
  http://127.0.0.1:8080/api/records/auth/login)"
if [[ ${login_status} != "400" && ${login_status} != "401" ]]; then
  echo "Login probe returned unexpected HTTP ${login_status}." >&2
  exit 1
fi

docker compose --env-file "${env_file}" -f "${compose_file}" exec -T losttofound \
  node scripts/verify-malware-scanner.mjs
docker compose --env-file "${env_file}" -f "${compose_file}" exec -T losttofound \
  node scripts/verify-supabase-auth-public-settings.mjs
docker compose --env-file "${env_file}" -f "${compose_file}" exec -T losttofound \
  env RECORDS_APP_BASE_URL=http://caddy:8080 ALLOW_INSECURE_HEADER_CHECK=true \
  node scripts/verify-security-headers.mjs

if [[ ${readiness_blocked} == "true" ]]; then
  echo "Application health checks passed, but customer readiness is blocked." >&2
  exit 2
fi

echo "Local deployment and customer-readiness checks passed."
