# Security

## Security Model

Custody Folio is designed for private parent-owned records scoped by authenticated `userId` and selected `caseId`.

The current MVP can run in local demo mode or Supabase-backed mode. It must not be used for real sensitive records until the remaining production gates are complete. Production must enforce authorization server-side on every record read, write, export, and evidence access request.

## Vulnerability Reporting

Responsible disclosure email: `security@custodyfolio.com`

Please include affected route, impact, reproduction steps, and whether sensitive data may be involved. Do not include real custody, child, court, payment, or evidence content in reports.

## Supported Versions

Only the current `main` branch MVP is supported during initial development.

## Security Controls

- Security headers are configured in `next.config.ts`.
- Production readiness status is exposed at `/api/records/readiness` without returning secret values.
- CI runs source validation checks. The deployment environment must run `npm run check:production` with real host secrets before accepting real records.
- Supabase/Postgres RLS schema baseline lives in `database/supabase/production_schema.sql`.
- Records login, session, and logout use Supabase Auth through server-managed HttpOnly cookies.
- The Supabase dataset adapter requires a server-validated records session cookie before loading or saving records.
- Bearer-token fallback is disabled in production and must only be used for explicit non-production diagnostics.
- Authentication, dataset, and evidence routes have an app-level rate-limit fallback; production must still use edge/WAF rate limiting.
- Supabase Auth must require MFA, leaked-password protection, strong password minimums, and password-change reauthentication before production use.
- Cookies must be host-only for `custodyfolio.com`.
- Secure, HttpOnly, SameSite=Lax or SameSite=Strict cookies are required in production.
- Server-side authorization must check both `userId` and `caseId`.
- Evidence metadata and files in Supabase mode require authenticated server routes.
- Evidence files must be private, stored under the authenticated user path prefix, and downloaded only through the server-mediated evidence route.
- Evidence upload uses extension and MIME allow-lists, file size limits, SHA-256 hashing, and real malware scanning before storage.
- Logs must not include note bodies, child names, court details, agency case numbers, payment reference numbers, file contents, or raw storage paths.

## Supabase Notes

- RLS must stay enabled for every `records_*` table.
- Policies must check both `user_id = auth.uid()` and selected `case_id` ownership.
- SQL-created tables may require explicit Data API exposure/grants depending on project settings.
- `SUPABASE_SERVICE_ROLE_KEY` must never be used in browser/client code.
- Evidence objects belong in the private `records-evidence` bucket under a user-id and case-id path prefix.
- Supabase Storage access uses the server-side service role only; never expose raw object paths as public URLs.
- The 2026 Supabase Data API grant-default change is intentionally compatible with this app because records tables remain server-mediated and direct `anon`/`authenticated` table grants are revoked.

## Privacy Readiness

See `PRIVACY_SECURITY_READINESS.md` for production privacy/security gates, required runbooks, and the two-user isolation test that must pass before real user data is accepted.

## Dependency and Secrets Scanning

Recommended production checks:

- `npm audit`
- GitHub Dependabot or equivalent dependency scanning
- GitHub secret scanning or equivalent
- CI check that `.env.local`, private keys, and evidence files are not committed

Current dependency hardening includes a PostCSS override so Next and other nested consumers resolve to the patched app-level PostCSS version.

If a credential is exposed, rotate it immediately, review logs for use, and invalidate affected sessions or storage tokens.

## Incident Response Overview

1. Contain affected credentials, sessions, tokens, and storage access.
2. Preserve minimal audit evidence without storing sensitive record contents in tickets or logs.
3. Patch the vulnerable component.
4. Rotate secrets and invalidate sessions as needed.
5. Notify affected users when required.
6. Review whether backups, exports, or evidence links were accessed.
