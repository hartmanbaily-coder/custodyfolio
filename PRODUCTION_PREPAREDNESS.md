# Production Preparedness

Custody Folio can run against either the local demo store or the Supabase-backed dataset snapshot API. This document tracks the remaining work required before accepting real custody, parenting-time, support, and evidence records.

## Current Production-Prep Additions

- `src/lib/production/readiness.ts` evaluates production blockers without exposing secrets.
- `src/app/api/records/readiness/route.ts` returns readiness status and uses HTTP 503 in production when blockers remain.
- `scripts/check-production-readiness.mjs` blocks CI/deploy when required production environment variables are missing, rejects the old staging Supabase project, and prints vendor/audit review warnings.
- `npm run check:pre-supabase` runs the same readiness guard while intentionally deferring the final Supabase Auth, storage, restore, and isolation gates.
- `scripts/verify-production-env-template.mjs` verifies `.env.production.example` stays complete, points at the intended production records host/project, and does not contain real secrets.
- `scripts/verify-security-headers.mjs` verifies CSP, HSTS, frame blocking, referrer policy, content-type sniffing protection, and browser permissions policy.
- `.github/workflows/deploy.yml` runs lint, typecheck, unit tests, secret scanning, dependency audit, environment-template verification, and build without holding production host credentials or dispatching another repository.
- `database/supabase/production_schema.sql` defines the first Supabase/Postgres schema with RLS, server-mediated table access, FK indexes, and private evidence bucket policies.
- Supabase client helpers now fail when called without production config, not at module import time.
- `src/app/api/records/auth/login/route.ts`, `session/route.ts`, and `logout/route.ts` add Supabase Auth through server-managed HttpOnly cookies.
- `src/app/api/records/auth/mfa/verify/route.ts` and `src/app/api/records/auth/mfa/enroll/verify/route.ts` add Supabase TOTP MFA verification and enrollment completion while keeping tokens in HttpOnly cookies.
- `src/app/api/records/dataset/route.ts` adds a Supabase-backed dataset snapshot API authenticated by server-managed records cookies.
- `src/app/api/records/evidence/preflight/route.ts` gates Supabase-mode evidence metadata behind authenticated server preflight and malware-provider readiness.
- `src/app/api/records/evidence/upload/route.ts`, `download/route.ts`, and `delete/route.ts` provide server-mediated private evidence file handling with scan-before-store behavior.
- `src/lib/security/rateLimit.ts` adds an app-level fallback limiter for records auth, dataset, and evidence routes.
- `src/lib/security/securityEvents.ts` emits sanitized security events for login/MFA/evidence alerts, with optional HTTPS webhook delivery.
- `PRIVACY_SECURITY_READINESS.md` defines the privacy/security launch gates, runbooks, and two-user isolation test.
- `MONITORING_ALERTING_RUNBOOK.md` defines production security monitoring sources, alert thresholds, log privacy rules, and escalation paths.
- `INCIDENT_RESPONSE_RUNBOOK.md` defines incident severity, containment, investigation, notification review, recovery, and post-incident review steps.
- `DATA_RETENTION_DELETION_RUNBOOK.md` defines the production retention, export, deletion, backup-aging, and legal-hold model to finalize before launch.
- `SUPABASE_AUTH_LAUNCH_CHECKLIST.md` defines the dashboard-only Supabase Auth settings, redirect URLs, and matching dedicated-host values required before Auth readiness can be marked complete.
- `scripts/verify-two-user-isolation.mjs` runs an executable synthetic two-user isolation check against a deployed Supabase-mode app.
- `scripts/verify-supabase-auth-public-settings.mjs` checks the public Supabase Auth settings endpoint for email auth, anonymous/phone auth drift, email autoconfirm, and direct-signup alignment with the app signup gate.
- `scripts/verify-malware-scanner.mjs` verifies the production malware scanner with clean and EICAR test payloads.
- `scripts/verify-security-event-sink.mjs` emits or delivers a synthetic sanitized security event for monitoring-sink verification.
- `scripts/verify-backup-restore-evidence.mjs` validates restore-drill evidence before `BACKUP_RESTORE_TESTED_AT` is trusted.
- `scripts/check-live-readiness.mjs` verifies the deployed `/api/records/readiness` endpoint before traffic cutover.
- `scripts/delete-retired-grant-bucket.mjs` deletes only the retired private empty `grant-documents` bucket from the production project through the Storage API.
- `scripts/check-secrets.mjs` scans tracked source files for common committed secret patterns before deploy.
- `npm run security:audit` runs a high-severity production dependency audit before deploy.
- `package.json` pins the PostCSS floor at `^8.5.15` and uses an npm override so nested consumers, including Next, resolve to the patched PostCSS line.
- `.env.production.example` defines the production host/Supabase target and required secret placeholders.
- `EDGE_SECURITY_RULES.md` defines provider-ready WAF/rate-limit targets for records routes.
- `LEGAL_REVIEW_PACKET.md` packages the documents and decisions needed for legal review.
- `/launch-readiness` renders a production launch cockpit from the same readiness engine as `/api/records/readiness`.
- `/launch-wizard` separates pre-Supabase work from the final Supabase live-data step.
- `.github/workflows/live-isolation.yml` verifies two-user isolation against `https://custodyfolio.com` with synthetic users.
- `.github/workflows/retired-artifact-cleanup.yml` runs the guarded retired Storage bucket cleanup using the repository service-role secret.
- `SUPABASE_LIVE_VERIFICATION.md` records the current live Supabase project verification state and open advisor findings.
- `PRODUCTION_LAUNCH_REHEARSAL.md` records the latest go/no-go rehearsal, current Supabase evidence, and remaining live launch gates.
- The production deployment now runs internal ClamAV scanning for evidence uploads and verified clean/EICAR behavior on 2026-06-28.
- The dedicated Custody Folio host reads production settings from `/srv/losttofound/config/app.env` with mode `0600`; the config directory is outside the rsynced application tree, and production SSH credentials and environment secrets are intentionally not stored in GitHub or Listhaus.
- `/privacy` and `/terms` now contain records-specific public drafts that must be reviewed before launch.
- `src/lib/records/clientStore.ts` can run in `local` mode or `supabase` mode using `NEXT_PUBLIC_RECORDS_STORAGE_MODE`.
- The Records Timeline view now merges custody calendar days, scheduled exchanges, logged exchanges, notes, evidence, support, and expenses into expandable court-packet-oriented rows with CSV export.

## Supabase Project State

Production project: `cieuilbpnwuvnrxrlczj`

Production project URL: `https://cieuilbpnwuvnrxrlczj.supabase.co`

Production project name: `losttofound-records-production`

Production project region: `us-west-1`

Staging/mixed-use project: `adhnoiicwfvppzenwcgv`

Staging/mixed-use project URL: `https://adhnoiicwfvppzenwcgv.supabase.co`

Applied production migrations:

- `20260617182822_create_records_production_schema`
- `20260628050702_remove_retired_grant_database_artifacts`

Verified:

- 13 `public.records_*` tables exist with RLS enabled.
- No direct `anon` or `authenticated` table privileges remain on `public.records_*`.
- No exposed `public` schema functions exist in production.
- Private Storage bucket `records-evidence` exists with a 10 MB file limit and restricted MIME types.
- Supabase security advisor still reports `auth_leaked_password_protection` as disabled in the production project. This blocks real-record launch until the Supabase Auth dashboard setting is enabled.
- The readiness gate requires `SUPABASE_AUTH_HARDENING_VERIFIED_AT` after dashboard settings and Supabase advisors are checked, so env flags alone cannot mark Auth hardening complete.
- Supabase performance advisor reports expected records unused-index INFO notices until real query traffic exists.
- The old staging/mixed-use project still has lost-pet public table/bucket findings and disabled leaked-password protection. Keep it out of production records traffic.
- Retired `grant_*` tables, grant helper functions, grant Storage policies, and the empty private `grant-documents` bucket have been removed from production.
- Live two-user isolation passed on 2026-06-28 with synthetic users and evidence, and production readiness now reflects `TWO_USER_ISOLATION_TESTED_AT=2026-06-28`.
- Live malware scanning passed on 2026-06-28 with clean and EICAR payloads, and production readiness now reflects `MALWARE_SCANNER_TESTED_AT=2026-06-28`.

## Required Before Real User Data

1. Run `npm run verify:env-template`, `npm run security:secrets`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, and `npm run build`.
2. Configure edge/WAF rate limits and bot protections for auth, dataset, evidence, exports, and write-heavy routes, then set provider names.
3. Configure monitoring/alerting for failed logins, MFA failures, evidence access, storage errors, server errors, and readiness failures, then run `npm run verify:security-events`.
4. Keep malware-scanner verification current; `MALWARE_SCANNER_TESTED_AT` must stay within 30 days before accepting real evidence.
5. Approve retention/deletion, backup aging, incident response, monitoring/alerting, legal review, and vendor review runbooks.
6. Run `npm run check:pre-supabase` to confirm all non-Supabase launch gates are clear.
7. Keep production secrets in `/srv/losttofound/config/app.env` on the dedicated host using project `cieuilbpnwuvnrxrlczj`, and deploy only through the rootless Custody Folio stack.
8. Set `EXPECTED_SUPABASE_PROJECT_REF=cieuilbpnwuvnrxrlczj` so production readiness fails if secrets point at the old staging project.
9. Keep production invite-only until launch by setting `NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED=false` and `RECORDS_SIGNUPS_ENABLED=false`; also disable direct Supabase Auth signup while invite-only mode is active. Enable self-registration only after Supabase SMTP, abuse controls, direct-signup policy, and App Store review account handling are ready.
10. Complete `SUPABASE_AUTH_LAUNCH_CHECKLIST.md`, including direct-signup policy, SMTP, redirect URLs, leaked-password protection, reset-token settings, password-change reauthentication, and session/device revocation in Supabase Auth.
11. Set `RECORDS_ENFORCE_MFA=true` after the Supabase TOTP flow is verified in staging.
12. Keep two-user RLS/storage verification current by dispatching `Verify Live Isolation`; the latest passing value is `TWO_USER_ISOLATION_TESTED_AT=2026-06-28`.
13. Run a restore drill, save `ops/backup-restore-evidence.json`, and run `npm run verify:backup-restore`.
14. Seed staging with synthetic data only and run end-to-end tests against staging.
15. Set verified readiness values directly in the host environment file; do not duplicate them into Listhaus or GitHub repository secrets.
16. Keep `custodyfolio.com` on the current records build only after `npm run verify:headers` passes; accept real records only after readiness API returns `ready` and `npm run check:live` passes.

## Verification Commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run security:secrets
npm run security:audit
npm run build
npm run test:e2e
npm run verify:env-template
npm run verify:headers
npm run check:pre-supabase
npm run check:production
npm run verify:malware
npm run check:live
npm run verify:isolation
npm run verify:supabase-auth
npm run verify:security-events
npm run verify:backup-restore
```

`npm run check:pre-supabase` is the right guard while Supabase is intentionally saved for last. `npm run check:production` is expected to fail locally until real production environment variables are present. `npm run verify:isolation` requires a deployed Supabase-mode app URL and service-role credentials; run it only with synthetic data. `npm run verify:backup-restore` expects ignored real evidence at `ops/backup-restore-evidence.json`; keep the committed example free of real data.

## Known Remaining Gap

The user-facing records app now has Supabase Auth cookie routes, TOTP MFA enrollment/verification endpoints, production AAL2 enforcement, a Supabase snapshot persistence adapter, server-mediated private evidence upload/download/delete routes, app-level rate-limit fallback, sanitized security event logging, CI secret/dependency scanning, production template/header verifiers, a court-oriented Records Timeline, a launch wizard, live two-user isolation and malware-scanner verification reflected in production readiness, and the records schema applied in Supabase. Production launch still requires the remaining non-Supabase owner/provider approvals plus live Supabase Auth dashboard hardening, edge WAF/rate limits, monitoring, backup restore verification, and final deployed readiness before any real custody, child, payment, court, or evidence content is entered.
