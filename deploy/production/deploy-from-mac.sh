#!/usr/bin/env bash
set -Eeuo pipefail

host="${1:-}"
release_tag="${2:-$(git rev-parse --short=12 HEAD)}"
port="${DEPLOY_PORT:-22}"
user="${DEPLOY_USER:-losttofound}"
known_hosts="${DEPLOY_KNOWN_HOSTS:-${HOME}/.ssh/losttofound_known_hosts}"
remote_path="/srv/losttofound/app"
backup_env_source="${LOSTTOFOUND_BACKUP_ENV_SOURCE:-}"
approval_manifest_source="${PRODUCTION_APPROVAL_MANIFEST_SOURCE:-}"
approval_scopes="${PRODUCTION_APPROVAL_SCOPES:-}"
auth_redirects_verified_at="${SUPABASE_AUTH_REDIRECTS_VERIFIED_AT:-}"
auth_hardening_verified_at="${SUPABASE_AUTH_HARDENING_VERIFIED_AT:-}"
allow_launch_pending="${ALLOW_LAUNCH_PENDING_DEPLOY:-false}"

if [[ -z ${host} ]]; then
  echo "Usage: $0 <host> [release-tag]" >&2
  exit 1
fi
if [[ ! ${port} =~ ^[0-9]{1,5}$ ]]; then
  echo "DEPLOY_PORT must be numeric." >&2
  exit 1
fi
if [[ ${user} != "losttofound" ]]; then
  echo "DEPLOY_USER must remain the non-root losttofound account." >&2
  exit 1
fi
if [[ ! -s ${known_hosts} ]]; then
  echo "Pinned host-key file is missing: ${known_hosts}" >&2
  exit 1
fi
if [[ ! ${release_tag} =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; then
  echo "Release tag contains unsupported characters." >&2
  exit 1
fi
if [[ ${allow_launch_pending} != "true" && ${allow_launch_pending} != "false" ]]; then
  echo "ALLOW_LAUNCH_PENDING_DEPLOY must be true or false." >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"

if [[ -n ${approval_manifest_source} ]]; then
  if [[ ${approval_manifest_source} == /* || ! ${approval_manifest_source} =~ ^[A-Za-z0-9._/-]+$ || ${approval_manifest_source} == .. || ${approval_manifest_source} == ../* || ${approval_manifest_source} == */../* || ${approval_manifest_source} == */.. ]]; then
    echo "PRODUCTION_APPROVAL_MANIFEST_SOURCE must be a safe repository-relative path." >&2
    exit 1
  fi
  approval_manifest_path="${repo_root}/${approval_manifest_source}"
  if [[ ! -f ${approval_manifest_path} || ! -r ${approval_manifest_path} || -L ${approval_manifest_path} ]]; then
    echo "Approval manifest source is missing, unreadable, or symlinked." >&2
    exit 1
  fi
fi
if [[ -n ${approval_scopes} && ! ${approval_scopes} =~ ^(retention|incident|legal)(,(retention|incident|legal))*$ ]]; then
  echo "PRODUCTION_APPROVAL_SCOPES must contain only retention, incident, or legal." >&2
  exit 1
fi
if [[ -n ${approval_scopes} && -z ${approval_manifest_source} ]]; then
  echo "PRODUCTION_APPROVAL_SCOPES requires PRODUCTION_APPROVAL_MANIFEST_SOURCE." >&2
  exit 1
fi
if [[ -n ${auth_redirects_verified_at} || -n ${auth_hardening_verified_at} ]]; then
  if [[ ! ${auth_redirects_verified_at} =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] ||
    [[ ! ${auth_hardening_verified_at} =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "Both Supabase Auth verification dates must be supplied in YYYY-MM-DD format." >&2
    exit 1
  fi
fi
if [[ -n ${approval_scopes} ]]; then
  (
    cd "${repo_root}"
    node scripts/generate-production-policy-bundle.mjs
    IFS=',' read -r -a requested_scopes <<<"${approval_scopes}"
    for scope in "${requested_scopes[@]}"; do
      PRODUCTION_APPROVAL_MANIFEST_FILE="${approval_manifest_source}" \
        node scripts/verify-production-approval-manifest.mjs "--${scope}"
    done
  )
fi

rsync -az --delete \
  --exclude '.git/' \
  --exclude '.agents/' \
  --exclude '.codex/' \
  --exclude '.mcp.json' \
  --exclude '.next/' \
  --exclude 'node_modules/' \
  --exclude 'ios/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'coverage/' \
  --exclude 'playwright-report/' \
  --exclude 'test-results/' \
  -e "ssh -p ${port} -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${known_hosts}" \
  "${repo_root}/" "${user}@${host}:${remote_path}/"

if [[ -n ${approval_manifest_source} ]]; then
  ssh -p "${port}" -o BatchMode=yes -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile="${known_hosts}" \
    "${user}@${host}" \
    "cd '${remote_path}' && PRODUCTION_APPROVAL_SCOPES='${approval_scopes}' ./deploy/production/configure-approval-evidence.sh '${approval_manifest_source}'"
fi

if [[ -n ${auth_redirects_verified_at} ]]; then
  ssh -p "${port}" -o BatchMode=yes -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile="${known_hosts}" \
    "${user}@${host}" \
    "cd '${remote_path}' && ./deploy/production/configure-supabase-auth-readiness.sh '${auth_redirects_verified_at}' '${auth_hardening_verified_at}'"
fi

if [[ -n ${backup_env_source} ]]; then
  if [[ ! -f ${backup_env_source} || ! -r ${backup_env_source} || -L ${backup_env_source} ]]; then
    echo "Backup credential source is missing, unreadable, or symlinked." >&2
    exit 1
  fi
  remote_backup_next="/srv/losttofound/config/backup.env.next-${release_tag}"
  scp -P "${port}" -o BatchMode=yes -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile="${known_hosts}" \
    "${backup_env_source}" "${user}@${host}:${remote_backup_next}"
  ssh -p "${port}" -o BatchMode=yes -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile="${known_hosts}" \
    "${user}@${host}" \
    "chmod 0600 '${remote_backup_next}' && mv -f '${remote_backup_next}' '/srv/losttofound/config/backup.env' && cd '${remote_path}' && ./deploy/production/configure-storage-backup-readiness.sh"
fi

ssh -p "${port}" -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="${known_hosts}" \
  "${user}@${host}" \
  "cd '${remote_path}' && ALLOW_LAUNCH_PENDING_DEPLOY='${allow_launch_pending}' ./deploy/production/deploy.sh '${release_tag}'"
