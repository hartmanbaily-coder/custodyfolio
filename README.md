# Custody Folio

Custody Folio is a privacy focused product for organizing custody, parenting time, child support, expense, evidence, and family court records.

Production domain: `custodyfolio.com`

Custody Folio must not depend on or accept navigation from any retired product domain.

The product is for factual documentation and organization only. It does not provide legal advice, predict court outcomes, or claim that any record is legally established.

## MVP Status

This repository now ships a working records workspace with synthetic demo data by default and an optional Supabase-backed records mode:

- Adult-user login/register demo flow
- Custody matter setup
- Simple recurring exchange rules
- Exchange logging and late/early/missed calculations
- Monthly calendar, list view, timeline, and day detail
- Date-based notes with categories, tags, and report inclusion
- Evidence records with file allow-list validation and server-mediated private upload/download/delete in Supabase mode
- Child support orders and payment records
- Expense and reimbursement tracking
- Dashboard charts with Recharts
- CSV, JSON, and browser print-to-PDF report flows
- Local audit entries that avoid note bodies, court details, file contents, and payment reference values
- Security headers in `next.config.ts`
- Focused Vitest unit tests and a Playwright smoke test

Important: local mode is a browser demo store. Do not enter real custody, child, court, school, health, payment, or evidence details until production auth settings, server-side authorization, private storage isolation, malware scanning, backups, and deletion controls are configured and reviewed in the deployment environment.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Zod
- Recharts
- Supabase Auth, private Storage, and server-mediated records APIs for production preparation
- Vitest
- Playwright

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The demo login is pre-filled. It only validates adult-use confirmation, email shape, and an 8-character password locally.

## Environment Variables

See `.env.example`.

Real secrets belong in `.env.local` or the deployment platform secret store. Do not commit production credentials, service-role keys, API keys, private files, real user data, or evidence files.

## Useful Commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
npm run check:production
npm run verify:malware
npm run check:live
npm run verify:isolation
```

Playwright may require browser installation on a fresh machine:

```bash
npx playwright install chromium
```

## Production Notes

Before storing real user records, verify the production deployment end to end:

- Supabase Auth settings, MFA/session policy, and rate limits
- Records API AAL2 enforcement with TOTP MFA verification in Supabase mode
- PostgreSQL tables with row-level access controls and server-enforced `userId` and `caseId` authorization
- Private object storage isolation for evidence
- Authenticated server-mediated evidence access only
- Malware scanning before evidence is stored or downloaded
- Malware scanner clean/EICAR verification with `npm run verify:malware`
- Encrypted database connections, encrypted backups, and protected backup access
- Data export and deletion workflows
- Monitoring/alerting, incident response, deletion, retention, and backup-aging runbooks
- Server-side audit logs
- Rate limits on auth and write-heavy routes
- Deployed readiness verification with `npm run check:live`

## custodyfolio.com

Production cookies must be host-only for `custodyfolio.com`. Do not set auth cookies for `.custodyfolio.com`.

Use Secure, HttpOnly, SameSite=Lax or SameSite=Strict cookies, and prefer `__Host-` prefixed cookies where compatible.

See `DEPLOYMENT_NOTES.md` for DNS, HTTPS, HSTS, and subdomain takeover controls.

## iOS App Store Preparation

The App Store prep package lives in `ios/CustodyFolio`.

- `ios/CustodyFolio/CustodyFolio.xcodeproj` contains the native SwiftUI iOS shell.
- `ios/CustodyFolio/README.md` covers local Xcode setup.
- `ios/CustodyFolio/APP_STORE_SUBMISSION.md` contains draft App Store metadata, privacy-label notes, screenshot guidance, review notes, and pre-submission checklist.

The iOS shell is intentionally more than a website shortcut: it includes a native device-authentication gate, native tabs for workspace/privacy/support, app icons, and controlled workspace navigation.

## Security Reminders

- No child accounts
- No public profiles
- No co-parent messaging in the MVP
- No payment processing
- No bank scraping
- No full bank account, card, debit card, or Social Security numbers
- No advertising trackers or third-party session replay tools
- No public evidence links or anonymous share links
- No broad staff evidence viewer

See `SECURITY.md`, `PRIVACY_SECURITY_READINESS.md`, `MONITORING_ALERTING_RUNBOOK.md`, `INCIDENT_RESPONSE_RUNBOOK.md`, `DATA_RETENTION_DELETION_RUNBOOK.md`, `SUPABASE_LIVE_VERIFICATION.md`, `PRIVACY_NOTES.md`, `TERMS_NOTES.md`, and `THREAT_MODEL.md`.
