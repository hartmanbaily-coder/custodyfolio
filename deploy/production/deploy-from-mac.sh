#!/usr/bin/env bash
set -Eeuo pipefail

host="${1:-}"
release_tag="${2:-$(git rev-parse --short=12 HEAD)}"
port="${DEPLOY_PORT:-22}"
user="${DEPLOY_USER:-losttofound}"
known_hosts="${DEPLOY_KNOWN_HOSTS:-${HOME}/.ssh/losttofound_known_hosts}"
remote_path="/srv/losttofound/app"
backup_env_source="${LOSTTOFOUND_BACKUP_ENV_SOURCE:-}"

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

repo_root="$(git rev-parse --show-toplevel)"

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
  "cd '${remote_path}' && ./deploy/production/deploy.sh '${release_tag}'"
