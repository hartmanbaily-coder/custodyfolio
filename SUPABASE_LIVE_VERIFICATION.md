# Supabase Live Verification

Verification date: 2026-07-09

Latest advisor refresh: 2026-07-08

Production project: `cieuilbpnwuvnrxrlczj`

Production project URL: `https://cieuilbpnwuvnrxrlczj.supabase.co`

Production project name: `losttofound-records-production`

Production project region: `us-west-1`

Staging/mixed-use project: `adhnoiicwfvppzenwcgv`

Staging/mixed-use project URL: `https://adhnoiicwfvppzenwcgv.supabase.co`

Status from Supabase connector: `ACTIVE_HEALTHY` as of 2026-07-09

Production database: Postgres 17, region `us-west-1`

Recommended launch role: use `cieuilbpnwuvnrxrlczj` for records production. Keep `adhnoiicwfvppzenwcgv` as staging/mixed-use unless the old lost-pet public tables/bucket are isolated or removed.

## Records Schema Checks

Verified through Supabase SQL inspection on production project `cieuilbpnwuvnrxrlczj`:

- All 13 `public.records_*` tables have RLS enabled.
- No direct `anon` or `authenticated` table privileges remain on `public.records_*`.
- No functions exist in the exposed `public` schema, so there are no public `SECURITY DEFINER` functions or public function execute grants to remediate.
- The `records-evidence` Storage bucket exists.
- `records-evidence` is private, not public.
- `records-evidence` file size limit is `10485760` bytes.
- `records-evidence` MIME allow-list is limited to PDF, PNG, JPEG, HEIC/HEIF, plain text, and CSV.
- No direct `anon` or `authenticated` Storage object policies remain for `records-evidence`; evidence object access is server-mediated through the Next.js API routes and Supabase service role.
- Applied production migration: `20260617182822_create_records_production_schema`.
- Applied cleanup migration: `20260628050702_remove_retired_grant_database_artifacts`.
- Applied evidence policy hardening migration: `20260708195205_remove_records_evidence_direct_storage_policies`.

Latest read-only SQL recheck: 2026-07-09. The production
project was `ACTIVE_HEALTHY`, all exposed records/storage tables had RLS
enabled, no direct browser-role table grants existed on `public`, no public
schema functions existed, and the `records-evidence` bucket remained private
with the expected size and MIME limits.

## Retired Non-Records Artifacts

A temporary grant-operations prototype was removed from the application source on
2026-06-24. The retired `grant_*` tables, grant helper
functions, and grant Storage policies were removed from production by migration
`20260628050702_remove_retired_grant_database_artifacts`. The empty private
`grant-documents` bucket was removed through the Supabase Storage API on
2026-06-28 using the guarded `Cleanup Retired Artifacts` workflow.

The local `.env.local` file still points at staging project `adhnoiicwfvppzenwcgv` for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Do not switch only the public URL/key. The server-side `SUPABASE_SERVICE_ROLE_KEY` must also be replaced with the production project service-role key from the Supabase dashboard before running Supabase mode locally or in production.

## Production API Key Guidance

Supabase connector inspection confirmed the production project has an active modern publishable key named `default` and an active legacy anon JWT. Use the `default` `sb_publishable_...` key for `NEXT_PUBLIC_SUPABASE_ANON_KEY` in production host secrets. Do not use or commit the legacy anon JWT for new production deploys, and never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.

## Supabase Advisor Findings

Production project `cieuilbpnwuvnrxrlczj`:

- Supabase security advisor currently reports `auth_leaked_password_protection` as disabled. This blocks production readiness until the Supabase Auth dashboard control is enabled. Remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Supabase performance advisor currently returns only records unused-index INFO notices. Records indexes should stay until real workload traffic exists.

Staging/mixed-use project `adhnoiicwfvppzenwcgv`:

Open project-level findings that still matter if this project is ever considered for production records:

- Supabase Auth leaked-password protection is disabled. This blocks production readiness.
- Existing non-records tables and buckets from the lost-pet product have public GraphQL/Data API/storage advisories: `finder_messages`, `pets`, `profiles`, `sightings`, `user_profiles`, and public bucket `pet-photos`. They may be intentional for the public lost-pet product, but they must be isolated, reviewed, or moved before this project is treated as a clean production records environment.
- Recent API logs show traffic against the old `pets` REST endpoint, not records endpoints. That reinforces treating this project as staging for records unless the public lost-pet product is separated.

## Auth Settings Still Requiring Dashboard Verification

The available Supabase connector exposes project, SQL, advisor, log, and Edge Function tools. It does not expose direct Auth configuration mutation for MFA, password minimums, leaked-password protection, or password-change reauthentication.

Before production records launch, verify in the Supabase dashboard and reflect the setting in deployment env:

- `SUPABASE_MFA_POLICY=required`
- `RECORDS_ENFORCE_MFA=true`
- When public signup is disabled, Supabase Auth direct signup must also be disabled, including when Attorney Access is enabled. First-time attorneys are created through a server-admin invitation email, and the app requires fresh mailbox proof plus the exact pending invitation before creating a records profile or session.
- `SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED=true`
- `SUPABASE_PASSWORD_MIN_LENGTH=12` or higher
- `SUPABASE_PASSWORD_REAUTH_ENABLED=true`
- `SUPABASE_CURRENT_PASSWORD_REQUIRED=true`
- `SUPABASE_AUTH_HARDENING_VERIFIED_AT=<YYYY-MM-DD>` after dashboard settings and Supabase advisors are verified

The app now includes a Supabase TOTP MFA login/enrollment flow and production AAL2 enforcement. The Supabase dashboard settings above still need live confirmation before accepting real records.

Public Auth settings check on 2026-07-09 showed email auth enabled, anonymous users disabled, phone auth disabled, and email autoconfirm disabled. It also showed `disable_signup=false` while the app-level records signup gate was disabled. Disable provider signup before clearing Auth hardening; Attorney Access now uses server-admin invitation emails and does not require direct signup.

## Two-User Isolation Verification

Live status: passed against the production service on 2026-06-28 through
the GitHub Actions `Verify Live Isolation` workflow.
The workflow created two synthetic confirmed Supabase Auth users, enrolled MFA,
verified User B could not load, download, or delete User A evidence, verified
User A could download and delete the same evidence, and cleaned up the synthetic
users, snapshot, and storage object. The emitted value was:

```text
TWO_USER_ISOLATION_TESTED_AT=2026-06-28
```

The production host environment now includes that value, and the deployed
readiness API marks the isolation gate complete.

Run this against staging or production after the app is deployed with Supabase mode:

```bash
RECORDS_APP_BASE_URL=https://custodyfolio.com \
NEXT_PUBLIC_SUPABASE_URL=https://cieuilbpnwuvnrxrlczj.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
RECORDS_EVIDENCE_BUCKET=records-evidence \
npm run verify:isolation
```

The verifier creates two temporary confirmed Supabase Auth users, signs both into the records app, saves a synthetic dataset for User A, creates a synthetic private evidence object for User A, confirms User B cannot load/delete/download it, confirms User A can download/delete it, and cleans up the synthetic users, snapshot, and storage object.

A manual GitHub Actions workflow, `Verify Live Isolation`, can run the same check
against `https://custodyfolio.com` using the repository `SUPABASE_SERVICE_ROLE_KEY`
secret without exposing the key locally.

## Malware Scanner Verification

Run this against the real production scanner after `MALWARE_SCAN_PROVIDER` is configured:

```bash
MALWARE_SCAN_PROVIDER=clamav \
CLAMAV_HOST=... \
CLAMAV_PORT=3310 \
npm run verify:malware
```

For HTTP/webhook scanners, set `MALWARE_SCAN_ENDPOINT` and `MALWARE_SCAN_API_KEY`. If it passes, record the emitted `MALWARE_SCANNER_TESTED_AT` value in the deployment environment.

Live deployment status: the internal ClamAV scanner passed clean/EICAR verification on 2026-06-28, and production readiness now reflects `MALWARE_SCANNER_TESTED_AT=2026-06-28`.

Use synthetic data only. Do not use real custody, child, court, school, health, payment, or evidence material for verification.
