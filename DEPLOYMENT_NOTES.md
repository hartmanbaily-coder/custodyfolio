# Deployment Notes

## Domains

Production domain: `custodyfolio.com`

Suggested staging subdomain: `staging-custodyfolio.com`

Only Custody Folio-owned production domains may route to this service.

## HTTPS

HTTPS is required before production use. Do not serve authenticated pages, evidence downloads, or generated reports over plain HTTP.

Enable HSTS only after HTTPS is verified end-to-end. The app currently sends:

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

Review whether `includeSubDomains` and `preload` are appropriate for all `custodyfolio.com` subdomains before final production launch.

## DNS Setup

- Point `custodyfolio.com` only to the active hosting provider.
- Verify ownership in the hosting provider dashboard.
- Use a separate staging host for staging.
- Avoid sharing auth cookies across sibling subdomains.
- Remove stale CNAME, A, AAAA, or provider verification records immediately when changing hosting providers.

Dangling DNS records can create subdomain takeover risk.

## Cookies

Production auth cookies must be:

- Host-only for `custodyfolio.com`
- Not scoped to `.custodyfolio.com`
- Secure
- HttpOnly
- SameSite=Lax or SameSite=Strict
- Preferably `__Host-` prefixed where compatible

## Environment Variables

Use deployment platform secret storage. Do not commit:

- Database URLs with credentials
- Auth secrets
- Supabase service role keys
- Storage credentials
- Email provider secrets
- Malware scanning credentials
- Production tokens

Rotate exposed credentials immediately.

Before production deploy, use `.env.production.example` as the source checklist and configure the host secrets used by the actual deployment path for `custodyfolio.com`:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_RECORDS_HOST`
- `NEXT_PUBLIC_RECORDS_STORAGE_MODE`
- `NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED`
- `RECORDS_STORAGE_MODE`
- `RECORDS_SIGNUPS_ENABLED`
- `NEXT_PUBLIC_SUPABASE_URL`
- `EXPECTED_SUPABASE_PROJECT_REF`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_MFA_POLICY`
- `RECORDS_ENFORCE_MFA`
- `SUPABASE_CUSTOM_SMTP_ENABLED`
- `SUPABASE_AUTH_REDIRECTS_VERIFIED_AT`
- `SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED`
- `PWNED_PASSWORD_CHECK_ENABLED` (required when the native Supabase leaked-password control is unavailable)
- `SUPABASE_PASSWORD_MIN_LENGTH`
- `SUPABASE_PASSWORD_REAUTH_ENABLED`
- `SUPABASE_CURRENT_PASSWORD_REQUIRED`
- `SUPABASE_AUTH_HARDENING_VERIFIED_AT`
- `AUTH_SECRET`
- `RECORDS_EVIDENCE_BUCKET`
- `EVIDENCE_MAX_FILE_BYTES`
- `MALWARE_SCAN_PROVIDER`
- `MALWARE_SCANNER_TESTED_AT`
- `CLAMAV_HOST`, `CLAMAV_PORT`, and `CLAMAV_TIMEOUT_MS` when using ClamAV/clamd
- `MALWARE_SCAN_ENDPOINT` and `MALWARE_SCAN_API_KEY` when using an HTTP/webhook scanner
- `EDGE_RATE_LIMITING_ENABLED`
- `EDGE_RATE_LIMITING_PROVIDER`
- `EDGE_WAF_ENABLED`
- `EDGE_WAF_PROVIDER`
- `SECURITY_MONITORING_ENABLED`
- `SECURITY_EVENT_SINK`
- `SECURITY_EVENT_WEBHOOK_URL` and `SECURITY_EVENT_WEBHOOK_TOKEN` when using a webhook sink
- `SECURITY_LOG_HASH_SALT`
- `AUDIT_LOG_REVIEW_ENABLED`
- `BACKUP_RESTORE_TESTED_AT`
- `TWO_USER_ISOLATION_TESTED_AT`
- `DATA_RETENTION_POLICY_APPROVED`
- `INCIDENT_RESPONSE_PLAN_APPROVED`
- `LEGAL_REVIEW_APPROVED`
- `PRIVACY_POLICY_URL`
- `VENDOR_SECURITY_REVIEW_APPROVED`
- `SECURITY_CONTACT_EMAIL`

Production for `custodyfolio.com` runs on a dedicated Ubuntu host under the non-root `losttofound` account. Its rootless Docker daemon owns only the Custody Folio, ClamAV, and Caddy containers. The Listhaus repository, host, secrets, Compose project, and deployment workflow are not part of this deployment boundary.

Use this deploy path for Custody Folio changes:

1. Commit and push the Custody Folio change to the `main` branch of the configured GitHub repository.
2. Confirm that the `Validate Custody Folio` workflow passes lint, typecheck, unit tests, secret scanning, production env template validation, dependency audit, and build.
3. From a trusted administrator Mac with the pinned SSH host key at `~/.ssh/losttofound_known_hosts`, run `deploy/production/deploy-from-mac.sh <host> <validated-commit-sha>`.
4. The remote deploy builds a release-tagged image, replaces the application container, reloads Caddy in place without disconnecting Cloudflare Tunnel, verifies readiness, verifies clean/EICAR malware scanning, verifies security headers, and rolls back to the prior image if validation fails.
5. Verify production after deploy:
   - `https://custodyfolio.com/records` serves the expected bundle/UI.
   - A fake login to `POST https://custodyfolio.com/api/records/auth/login` returns a handled `400` or `401` JSON response, not a blank `500`.
   - `https://custodyfolio.com/api/records/readiness` returns a structured `ready` or `not_ready` result with no unexpected infrastructure blocker. Policy and dashboard attestations remain visible and must not be marked complete without evidence.

Production deployment is intentionally not triggered by GitHub Actions. This keeps the production SSH key and host environment out of GitHub and removes the cross-repository `LISTHAUS_DEPLOY_TOKEN`. Run `npm run check:production` with the real host environment before accepting real records.

Routine application deployments must not force-recreate Caddy or cloudflared. Caddy configuration is applied through its admin API with `caddy reload`, which validates and swaps configuration without dropping the Tunnel origin. The public smoke check allows up to two minutes by default for an application-container replacement and suppresses expected transient connection noise until the final failed attempt. A healthy deployment with incomplete legal or operational launch attestations is recorded as `current-deployment=healthy` and `current-readiness=launch-approval-pending`; those launch checks do not make a TestFlight testing deployment fail.

Before each production image build, the deployment lane removes unused BuildKit cache older than 48 hours. This prevents release cache from filling the dedicated host while leaving tagged release images available for rollback. Override the window only with a positive hour or minute duration in `DOCKER_BUILD_CACHE_RETENTION`.

The dedicated host is bootstrapped once with `deploy/production/bootstrap-host.sh`. The host must use key-only SSH, disabled root login, UFW, fail2ban, unattended security updates, rootless Docker, and `/srv/losttofound/config/app.env` owned by `losttofound:losttofound` with mode `0600`. The config directory is separate from the rsynced application tree and is never stored in GitHub.

The 4 GiB starter profile uses strict aggregate container limits: 2560 MiB for ClamAV, 768 MiB for Custody Folio, and 128 MiB for Caddy. Set `STARTER_RESOURCE_PROFILE=true` on that host so production readiness shows a non-blocking capacity warning. This warning does not block customer use, deployment, TestFlight, or App Store submission. ClamAV uses two scan threads, a four-request queue, and `ConcurrentDatabaseReload no`, so new scans pause instead of loading two signature engines during the daily update. Evidence intake remains fail-closed when the scanner is unavailable. The rootless `losttofound-health-watchdog.timer` restarts an unhealthy or missing scanner and reruns the clean/EICAR verification without exposing the Docker socket to another container. Do not add disk-backed swap because evidence bytes or signature-processing memory could be paged to disk.

The owner-selected capacity policy is to upgrade no later than 100 customer accounts, or sooner if monitoring shows sustained memory or CPU pressure, slower responses, or evidence-upload retries. At upgrade, resize the host to at least 8 GiB, set `CLAMAV_MEMORY_LIMIT=4096m`, rerun a forced signature reload plus clean/EICAR verification, load-test normal and upload traffic, and set `STARTER_RESOURCE_PROFILE=false`. Security, privacy, legal, backup, and monitoring readiness checks remain separate from this capacity warning.

When Supabase is intentionally saved for last, run `npm run check:pre-supabase` first. That mode still checks host, secret strength, edge controls, monitoring, malware scanning, privacy/legal approvals, and other non-Supabase gates, while deferring the final Supabase Auth, storage, restore, and isolation checks.

Set `EXPECTED_SUPABASE_PROJECT_REF=cieuilbpnwuvnrxrlczj` in production. The readiness check rejects the older staging/mixed-use Supabase project so records traffic cannot accidentally launch against `adhnoiicwfvppzenwcgv`.

Run `npm run verify:env-template` before deploy to confirm the committed production template still points at `custodyfolio.com` and the clean records Supabase project without containing real secrets.

Run `npm run verify:headers` against the local or deployed app to confirm CSP, HSTS, frame blocking, referrer policy, content-type sniffing protection, and browser permissions policy are present. Non-local production URLs must use HTTPS.

Run `npm run verify:malware` against the real production scanner before setting `MALWARE_SCANNER_TESTED_AT`. The live deployment verified the internal ClamAV scanner on 2026-06-28 with clean and EICAR payloads. Run `npm run check:live` against the deployed HTTPS app before pointing production traffic at it.

Run `npm run verify:security-events` after configuring `SECURITY_EVENT_SINK`. For webhook sinks, the script sends a synthetic sanitized event and requires a successful HTTPS response. For platform/SIEM sinks, confirm the emitted event appears in the monitoring tool before marking monitoring complete.

Run a backup restore drill, save the non-sensitive evidence artifact at ignored path `ops/backup-restore-evidence.json`, and run `npm run verify:backup-restore` before setting `BACKUP_RESTORE_TESTED_AT`.

Private Supabase Storage evidence must also be copied daily to a separate S3-compatible account. Copy `deploy/production/backup.env.example` to `/srv/losttofound/config/backup.env`, keep it owned by the deployment user with mode `0600`, and use a bucket-scoped application key that cannot bypass Object Lock. The bucket and every uploaded object must use compliance retention no longer than 180 days. Deployments install `custodyfolio-storage-backup.timer` only after that secret file exists. Run `npm run verify:storage-backup` inside the one-shot backup container after the first backup and at each restore drill. Supabase database backups do not include Storage objects.

For production records, both storage mode variables must be set to `supabase`. Local/demo mode is intentionally blocked by the production readiness check.

Do not enable `RECORDS_ALLOW_BEARER_AUTH` in production. Records API authentication should use the server-managed HttpOnly cookies set by `/api/records/auth/login`.

## Database and Backups

Production data should use encrypted database connections, encryption at rest, encrypted backups, protected backup access, retention limits, and restoration testing.

Document the deletion process and how backups age out after account or case deletion.

The production Supabase/Postgres schema is in `database/supabase/production_schema.sql` and has been applied to production project `cieuilbpnwuvnrxrlczj` (`losttofound-records-production`) at `https://cieuilbpnwuvnrxrlczj.supabase.co`.

Applied production records migration:

- `20260617182822_create_records_production_schema`

The older Supabase project `adhnoiicwfvppzenwcgv` remains staging/mixed-use. It has these records migrations, but its legacy lost-pet public tables and public bucket mean it should not be used for records production traffic:

- `20260616005239_create_records_production_schema`
- `20260616005410_harden_records_direct_table_access`
- `20260616005828_tune_records_indexes_and_profile_policies`

The records tables are intentionally server-mediated: do not grant direct `anon` or `authenticated` table access unless a browser-side data path is separately designed and reviewed. Before production launch, verify RLS/storage behavior with two different authenticated test users and confirm backup restore procedures.

See `PRIVACY_SECURITY_READINESS.md` for the required two-user isolation test and privacy/security launch gates. See `SUPABASE_LIVE_VERIFICATION.md` for the latest live Supabase project notes and `npm run verify:isolation` usage.
See `DATA_RETENTION_DELETION_RUNBOOK.md` for the deletion, retention, backup-aging, and legal-hold model to finalize before accepting real records.
See `EDGE_SECURITY_RULES.md` for WAF and rate-limit targets.

## Object Storage

Evidence storage must be private:

- No public buckets
- No anonymous share links
- Authenticated server-mediated upload, download, and delete only
- Malware scanning before storage
- No raw storage paths in logs, reports, or client-visible URLs

The current app stores evidence files only through authenticated server routes. Uploads are validated, scanned, hashed, and then written to the private `records-evidence` bucket under an authenticated user/case path. Downloads stream through the app route after ownership and clean-scan checks; raw Supabase object URLs are not exposed to the browser.

## Logging

Do not log sensitive custody, child support, court, child, health, school, payment, note, evidence, file, agency, or reference details.

Email subjects and bodies must be generic.

## Production Readiness Checklist

- Server-side auth configured
- Auth and write route rate limits configured
- Edge rate limits and WAF configured
- Production env template verified
- Security headers verified
- Supabase MFA and password hardening configured
- Server-side authorization tests passing
- Private evidence storage configured
- Malware scanning provider configured
- Security monitoring and audit review configured
- Monitoring/alerting runbook approved
- Dependency and secret scanning enabled
- Backups encrypted and restorable
- Retention/deletion and incident response runbooks approved
- Incident response contact configured
- DNS records checked for dangling provider references
