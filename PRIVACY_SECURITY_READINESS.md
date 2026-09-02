# Privacy and Security Readiness

Custody Folio handles custody, parenting-time, child support, court, school, health-adjacent, financial, and evidence records. Treat production data as highly sensitive even when it is not regulated as medical, financial, or child-directed data.

## Target Baseline

- NIST Cybersecurity Framework 2.0: Govern, Identify, Protect, Detect, Respond, Recover.
- NIST Privacy Framework 1.0: privacy risk management, data processing awareness, and individual privacy protection.
- OWASP ASVS 5.0.0 Level 2 for application security verification.
- CIS Controls v8.1 Implementation Group 1 as minimum operational hygiene, with IG2 controls where practical.
- FTC data security principles: know what is collected, keep only what is needed, protect it, dispose of it safely, and plan for incidents.

## Production Launch Gates

These gates are enforced by `src/lib/production/readiness.ts` and `scripts/check-production-readiness.mjs` where they can be represented as deployment configuration. The same status is visible in the app at `/launch-readiness`, and `/launch-wizard` separates pre-Supabase work from the final Supabase live-data step.

| Gate | Required signal | Status |
| --- | --- | --- |
| HTTPS production URL | `NEXT_PUBLIC_APP_URL=https://custodyfolio.com` | Required |
| Host-only records domain | `NEXT_PUBLIC_RECORDS_HOST=custodyfolio.com` | Required |
| Supabase mode | `RECORDS_STORAGE_MODE=supabase` and `NEXT_PUBLIC_RECORDS_STORAGE_MODE=supabase` | Required |
| Production Supabase project guard | `EXPECTED_SUPABASE_PROJECT_REF=cieuilbpnwuvnrxrlczj`; production must not point at staging project `adhnoiicwfvppzenwcgv` | Required |
| Server-only service role | `SUPABASE_SERVICE_ROLE_KEY` only in server secrets | Required |
| Account authentication method | `RECORDS_AUTH_METHOD=email_otp` | Required |
| Supabase email OTP | `SUPABASE_EMAIL_OTP_ENABLED=true`, length `6`, expiry `600` seconds | Required |
| Legacy mandatory MFA disabled | `RECORDS_ENFORCE_MFA=false`; `SUPABASE_MFA_POLICY=optional` or `disabled` | Required |
| Custom SMTP | Supabase Auth sends Custody Folio email codes through the approved Resend configuration | Required |
| Supabase Auth verification | `SUPABASE_AUTH_HARDENING_VERIFIED_AT` within 30 days after dashboard settings and advisors are checked | Required |
| Private evidence bucket | `RECORDS_EVIDENCE_BUCKET=records-evidence` | Required |
| Malware scanning | Real `MALWARE_SCAN_PROVIDER`; HTTP providers require HTTPS `MALWARE_SCAN_ENDPOINT`; `MALWARE_SCANNER_TESTED_AT` within 30 days | Required |
| Edge rate limits | `EDGE_RATE_LIMITING_ENABLED=true` and `EDGE_RATE_LIMITING_PROVIDER` set | Required |
| WAF/bot controls | `EDGE_WAF_ENABLED=true` and `EDGE_WAF_PROVIDER` set | Required |
| Security monitoring | `SECURITY_MONITORING_ENABLED=true` and `SECURITY_EVENT_SINK` set to `platform`, `siem`, or `webhook` | Required |
| Backup restore test | `BACKUP_RESTORE_TESTED_AT` within 180 days | Required |
| Two-user isolation test | `TWO_USER_ISOLATION_TESTED_AT` within 30 days | Required |
| Retention/deletion policy | `DATA_RETENTION_POLICY_APPROVED=true` plus current digest-bound retention approval and a privacy-rights rehearsal in `PRODUCTION_APPROVAL_MANIFEST_BASE64` | Required |
| Incident response plan | `INCIDENT_RESPONSE_PLAN_APPROVED=true` plus current digest-bound staffed-team contacts or disclosed solo-operator/provider escalations, and recent tabletop evidence | Required |
| Privacy policy | Exact HTTPS `/privacy` URL on `NEXT_PUBLIC_APP_URL`, with no query or fragment | Required |
| Legal/policy adoption | `LEGAL_REVIEW_APPROVED=true` plus a protected manifest recording either qualified-counsel review or disclosed operator self-review of the exact generated policy digests | Required |
| Operative public clauses | Stripe billing clauses must be `operative`; attorney clauses may remain pending only while `ATTORNEY_GUEST_FEATURE_ENABLED=false` | Required |
| Security contact | `SECURITY_CONTACT_EMAIL` monitored mailbox | Warning |
| Vendor security review | `VENDOR_SECURITY_REVIEW_APPROVED=true` | Warning |
| Audit review process | `AUDIT_LOG_REVIEW_ENABLED=true` | Warning |

## Privacy Commitments

- Do not collect child accounts or child login credentials.
- Do not add public profiles, co-parent messaging, advertising trackers, or third-party session replay.
- Keep user-entered labels privacy-friendly by default; encourage labels like `Child 1` and `Parent B`.
- Avoid collecting Social Security numbers, full bank account numbers, card numbers, unrelated third-party information, and unnecessary medical detail.
- Evidence files stay private, are scanned before storage, and are downloaded only through authenticated server routes.
- Reports must not include raw storage paths, hashes, service URLs, or internal identifiers that are not needed by the user.
- Until current protected readiness evidence exists, permit informational public pages and synthetic/internal testing only; do not accept real custody, child, court, financial, school, communication, or health-related records.

## Operational Runbooks Required Before Launch

- Backup and restore: document backup cadence, encryption, access, restore owner, restore test evidence, and backup aging after deletion.
- Deletion and export: use `DATA_RETENTION_DELETION_RUNBOOK.md` to document how users request export/deletion, what is deleted immediately, what remains in backups, and how long backups age out.
- Privacy rights operations: use `PRIVACY_RIGHTS_OPERATIONS.md` to account for active systems, processors, recipients, user-controlled copies, appeals, and backup aging. Verify every request artifact before reporting completion.
- Incident response: use `INCIDENT_RESPONSE_RUNBOOK.md` for severity levels, containment steps, contact owner, user notification decision process, evidence preservation, and post-incident review.
- Monitoring and alerting: use `MONITORING_ALERTING_RUNBOOK.md` for alert sources, thresholds, escalation channels, log minimization rules, and review cadence.
- Access review: document who has Supabase, hosting, domain, deployment, monitoring, and malware-scanner access; review before launch and at least quarterly.
- Vendor review: `VENDOR_SECURITY_REVIEW_2026-08-15.md` documents Supabase, hosting/CDN, malware scanner, email, backup, billing, logging/monitoring, and DNS security posture. Review it quarterly and after material provider or data-flow changes.
- Edge security: use `EDGE_SECURITY_RULES.md` before setting the WAF and rate-limit readiness flags.
- Supabase Auth: use `SUPABASE_AUTH_LAUNCH_CHECKLIST.md` before setting Auth readiness flags or enabling self-registration.
- Legal review: use `LEGAL_REVIEW_PACKET.md` before setting `LEGAL_REVIEW_APPROVED=true`.

## Version-Bound Approval Evidence

The boolean approval flags are necessary but not sufficient. Readiness also validates an ignored manifest containing reviewer authority, scope, limitations, validity dates, required exercise dates, the staffed-team contacts or solo-operator/provider escalations, and the SHA-256 of every covered document.

```bash
npm run approval:prepare
npm run verify:approvals
```

Keep `ops/production-approval-manifest.json` and the emitted `PRODUCTION_APPROVAL_MANIFEST_BASE64` secret out of source control. Never replace a missing reviewer or responder assignment with a placeholder. Operator self-review must be disclosed as `operator_self_review` with counsel status `not_obtained`; it is not a claim that counsel approved or that the product complies with every law. Any covered document change invalidates the deployed evidence until the appropriate reviewer approves the new digest.

## Two-User Isolation Test

Before setting `TWO_USER_ISOLATION_TESTED_AT`, verify with two real Supabase Auth test users:

1. User A creates a records dataset and uploads a clean synthetic evidence file.
2. User B cannot load User A's dataset through `/api/records/dataset`.
3. User B cannot download or delete User A's evidence through evidence routes, even if User B submits copied metadata.
4. User A can still load, download, and delete their own synthetic evidence.
5. Supabase storage contains no public evidence object URLs.
6. Logs do not include note bodies, evidence file contents, payment references, or raw storage paths.

Use synthetic records only. Do not test with real custody, child, court, health, school, financial, or evidence material.

An executable verifier is available:

```bash
npm run verify:isolation
```

Set `RECORDS_APP_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `RECORDS_EVIDENCE_BUCKET` before running it against staging or production. See `SUPABASE_LIVE_VERIFICATION.md` for the latest live-project notes.

## Operational Verification Commands

Run these with synthetic data only:

```bash
npm run verify:env-template
npm run verify:headers
npm run check:pre-supabase
npm run verify:malware
npm run verify:isolation
npm run verify:supabase-auth
npm run verify:security-events
npm run verify:backup-restore
npm run verify:privacy-rights
npm run verify:approvals
npm run check:live
```
