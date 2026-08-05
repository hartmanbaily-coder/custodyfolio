# Production Launch Rehearsal

Rehearsal date: 2026-06-28

## Decision

Status: `NO-GO for real user records`

Reason: the records application and records-specific Supabase schema are in good MVP shape, and the production Supabase project is active. Live two-user isolation and malware scanning have passed with synthetic/test payloads and are reflected in production readiness, but Supabase Auth hardening, edge/provider controls, monitoring, backup restore evidence, and legal review are still incomplete.

## Supabase Project Split

Production candidate: `cieuilbpnwuvnrxrlczj`

Production URL: `https://cieuilbpnwuvnrxrlczj.supabase.co`

Production project name: `losttofound-records-production`

Production region: `us-west-1`

Staging/mixed-use project: `adhnoiicwfvppzenwcgv`

Staging URL: `https://adhnoiicwfvppzenwcgv.supabase.co`

Recommended role for `adhnoiicwfvppzenwcgv`: staging only.

## Production Supabase Posture

Evidence from 2026-06-17 production project setup:

- Project `cieuilbpnwuvnrxrlczj` is `ACTIVE_HEALTHY`.
- Schema migration applied: `20260617182822_create_records_production_schema`.
- 13 `public.records_*` tables exist.
- All `public.records_*` tables have RLS enabled.
- No direct `anon` or `authenticated` grants remain on `public.records_*`.
- `records-evidence` bucket exists and is private.
- `records-evidence` file limit is `10485760` bytes.
- `records-evidence` MIME allow-list is PDF, PNG, JPEG, HEIC/HEIF, plain text, and CSV.
- 4 storage policies reference `records-evidence`.
- Supabase security advisor reports `auth_leaked_password_protection` as disabled.
- Supabase performance advisor reports records unused-index INFO notices, expected before real workload traffic.
- Retired `grant_*` tables, grant helper functions, and grant Storage policies were removed by migration `20260628050702_remove_retired_grant_database_artifacts`.
- The retired empty private `grant-documents` bucket was removed through the guarded Storage API cleanup workflow.
- Live two-user isolation passed on 2026-06-28 with synthetic users and evidence, and production readiness now reflects `TWO_USER_ISOLATION_TESTED_AT=2026-06-28`.
- Internal ClamAV malware scanning is deployed for CustodyFolio evidence uploads, blocked the EICAR test payload on 2026-06-28, and production readiness now reflects `MALWARE_SCANNER_TESTED_AT=2026-06-28`.

## Staging Supabase Posture

Evidence from 2026-06-17 inspection:

- Project `adhnoiicwfvppzenwcgv` is `ACTIVE_HEALTHY`.
- Database is Postgres 17 in `us-west-2`.
- Records migrations applied to staging:
  - `20260616005239_create_records_production_schema`
  - `20260616005410_harden_records_direct_table_access`
  - `20260616005828_tune_records_indexes_and_profile_policies`
- 13 `public.records_*` tables exist.
- All `public.records_*` tables have RLS enabled.
- No direct `anon` or `authenticated` grants remain on `public.records_*`.
- `records-evidence` bucket exists and is private.
- `records-evidence` file limit is `10485760` bytes.
- `records-evidence` MIME allow-list is PDF, PNG, JPEG, HEIC/HEIF, plain text, and CSV.
- 4 storage policies reference `records-evidence`.
- Recent Supabase API logs show activity against the old `pets` REST endpoint, not records endpoints.

Staging-only Supabase/project findings:

- Existing non-records objects still produce advisor findings: `finder_messages`, `pets`, `profiles`, `sightings`, `user_profiles`, and public bucket `pet-photos`.
- Records performance advisor notices are unused-index INFO findings, expected before real workload traffic.

## Launch Gates

Completed in repo/app:

- Server-managed Supabase Auth cookies for records routes.
- Records TOTP MFA enrollment/verification flow.
- Production AAL2 enforcement gate.
- Server-mediated records dataset API.
- Private evidence upload/download/delete routes.
- Malware-scanner readiness gate for evidence upload.
- App-level fallback rate limits.
- Sanitized security event logging.
- Production readiness API and CI gate.
- Secret-pattern scan.
- High-severity production dependency audit.
- Production dependency audit currently reports `0` vulnerabilities after the PostCSS nested dependency override.
- Two-user isolation verifier script.
- Malware scanner verifier script.
- Live readiness verifier script.
- Security event sink verifier script.
- Backup restore evidence verifier script.
- Production launch cockpit at `/launch-readiness`.
- Production environment template at `.env.production.example`.
- Legal review packet and edge security rule packet.
- Privacy, terms, retention/deletion, incident response, monitoring, and security docs drafted.
- Clean records-only production Supabase project created.
- Production records schema applied and verified.
- Current Custody Folio source deployed to `https://custodyfolio.com`; live security headers pass and legacy grant routes return 404.
- Live two-user isolation verified through the `Verify Live Isolation` workflow and synthetic artifacts cleaned up.
- Live malware scanning verified through the deployment workflow using a clean payload and the EICAR test payload.
- Guarded `Cleanup Retired Artifacts` workflow deleted the empty retired `grant-documents` Storage bucket through the Storage API.

Still blocked before real user data:

- Configure production Supabase Auth settings:
  - MFA required.
  - Leaked-password protection enabled.
  - Password minimum at least 12.
  - Current-password/reauth required for password changes.
  - Invite-only or self-registration policy decided.
- Configure provider-level WAF, bot controls, and rate limits for auth, dataset, evidence, exports, and writes.
- Configure security monitoring sink and alert routing.
- Run and document a backup restore drill.
- Complete vendor/security review.
- Complete legal review of privacy, terms, retention/deletion, incident response, and court-report wording.
- Run `npm run check:live` against the deployed production URL after all env gates are set.

## Recommended Next Action

Configure production Supabase Auth hardening in project `cieuilbpnwuvnrxrlczj`, then complete the remaining operational launch gates.

Use this sequence:

1. Enable leaked-password protection in the Supabase dashboard.
2. Re-run Supabase advisors and set `SUPABASE_AUTH_HARDENING_VERIFIED_AT` only after Auth findings are clear.
3. Configure WAF/rate limits and security monitoring.
4. Run a backup restore drill and record the evidence date.
5. Run `npm run check:live`.
6. Complete legal and vendor review before real user data.

## Cutover Rule

Do not point real users or real custody records at production until:

- `/api/records/readiness` returns `ready` in production.
- `npm run check:live` passes.
- `TWO_USER_ISOLATION_TESTED_AT`, `MALWARE_SCANNER_TESTED_AT`, and `BACKUP_RESTORE_TESTED_AT` are set from real verification.
- `LEGAL_REVIEW_APPROVED=true` is backed by actual review, not just an environment flag.
