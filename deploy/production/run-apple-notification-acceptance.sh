#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -eq 0 ]]; then
  echo "Run Apple notification acceptance as the non-root losttofound user." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_root="${LOSTTOFOUND_APP_ROOT:-$(cd "${script_dir}/../.." && pwd)}"
compose_file="${LOSTTOFOUND_COMPOSE_FILE:-${script_dir}/compose.yml}"
app_env_file="${LOSTTOFOUND_ENV_FILE:-/srv/losttofound/config/app.env}"
state_dir="${LOSTTOFOUND_STATE_DIR:-/srv/losttofound/state}"
docker_bin="${DOCKER_BIN:-docker}"
verifier_file="${app_root}/scripts/verify-apple-notifications-v2.mjs"
window_helper="${script_dir}/configure-billing-test-window.sh"
window_open=false

compose() {
  "${docker_bin}" compose --env-file "${app_env_file}" -f "${compose_file}" "$@"
}

wait_for_app() {
  local container_id status
  container_id="$(compose ps -q losttofound)"
  if [[ -z ${container_id} ]]; then
    echo "Custody Folio application container is missing." >&2
    return 1
  fi
  for _ in $(seq 1 60); do
    status="$("${docker_bin}" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else if .State.Running}}running{{else}}stopped{{end}}' "${container_id}")"
    if [[ ${status} == "healthy" || ${status} == "running" ]]; then
      return 0
    fi
    if [[ ${status} == "unhealthy" || ${status} == "stopped" ]]; then
      echo "Custody Folio application container became ${status}." >&2
      return 1
    fi
    sleep 1
  done
  echo "Timed out waiting for the Custody Folio application container." >&2
  return 1
}

assert_release_identity() {
  local container_id actual_image expected_image
  container_id="$(compose ps -q losttofound)"
  actual_image="$("${docker_bin}" inspect --format '{{.Config.Image}}' "${container_id}")"
  expected_image="losttofound:${release_tag}"
  if [[ ${actual_image} != "${expected_image}" ]]; then
    echo "Refusing acceptance against ${actual_image}; expected ${expected_image}." >&2
    return 1
  fi
}

restart_app() {
  compose up -d --no-deps --force-recreate losttofound
  wait_for_app
}

cleanup() {
  local exit_status=$?
  trap - EXIT
  if [[ ${window_open} == "true" ]]; then
    if "${window_helper}" close; then
      window_open=false
      restart_app || exit_status=1
    else
      echo "CRITICAL: billing test-window restoration failed; the protected backup remains in place." >&2
      exit_status=1
    fi
  fi
  exit "${exit_status}"
}
trap cleanup EXIT

if [[ ! -x ${window_helper} || ! -r ${verifier_file} ]]; then
  echo "Billing test-window helper or Apple notification verifier is unavailable." >&2
  exit 1
fi

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
export LOSTTOFOUND_IMAGE_TAG="${release_tag}"

"${window_helper}" open
window_open=true
restart_app
assert_release_identity

acceptance_status=0
for environment in sandbox production; do
  echo "Running Apple ${environment} Notifications V2 delivery acceptance."
  if ! compose exec -T \
    -e "APPLE_NOTIFICATION_TEST_ENVIRONMENT=${environment}" \
    losttofound node --input-type=module - <"${verifier_file}"; then
    acceptance_status=1
  fi
done

"${window_helper}" close
window_open=false
restart_app
assert_release_identity

compose exec -T losttofound node -e '
  const mode = process.env.BILLING_MODE;
  const checkout = process.env.BILLING_CHECKOUT_ENABLED;
  const canary = process.env.BILLING_LIVE_CANARY_AUTHORIZED;
  if (mode !== "disabled" || checkout !== "false" || canary !== "false") process.exit(1);
  console.log("Production billing state restored: mode=disabled, checkout=false, live-canary=false.");
'

exit "${acceptance_status}"
