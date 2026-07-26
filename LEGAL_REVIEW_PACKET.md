# Legal Review Packet

Review date target: before accepting real custody, parenting-time, child support, payment, court, school, health-adjacent, or evidence records.

This packet is not legal advice. It packages the current product materials for qualified counsel or an authorized reviewer.

## Product Scope To Review

Custody Folio is a privacy-first records workspace for parents or guardians to organize:

- custody and parenting-time schedules
- exchange logs and issues
- child support orders and payment records
- shared expenses and reimbursement tracking
- private evidence files
- notes and incident timelines
- court-packet-oriented reports and exports

The MVP does not provide legal advice, does not decide court strategy, does not guarantee admissibility, and does not create child accounts.

## Documents Included

- `PRIVACY_SECURITY_READINESS.md`
- `PRIVACY_NOTES.md`
- `TERMS_NOTES.md`
- `DATA_RETENTION_DELETION_RUNBOOK.md`
- `INCIDENT_RESPONSE_RUNBOOK.md`
- `MONITORING_ALERTING_RUNBOOK.md`
- `SECURITY.md`
- `THREAT_MODEL.md`
- `SUPABASE_LIVE_VERIFICATION.md`
- `PRODUCTION_LAUNCH_REHEARSAL.md`
- `/privacy` public page draft
- `/terms` public page draft

## Required Legal Decisions

1. Whether the service should launch invite-only or allow self-registration.
2. Required privacy policy language for custody, child, court, payment, school, health-adjacent, and evidence records.
3. Whether additional state-specific privacy disclosures are required.
4. Whether the product is child-directed, family-directed, or adult-directed for privacy-policy purposes.
5. Retention periods for account, case, evidence, audit, security, request, and backup logs.
6. Backup-aging disclosure after account or case deletion.
7. Legal-hold process and who can place or release a hold.
8. User export and deletion rights, timing, and exceptions.
9. Incident and breach notification thresholds.
10. Required disclaimers for timelines, reports, court packets, and issue summaries.
11. Whether report wording needs stronger limits around evidentiary use.
12. Vendor and subprocessors disclosure language.

## Product Wording To Approve

Approve or revise these positions before `LEGAL_REVIEW_APPROVED=true` is set:

- The app helps organize records and does not provide legal advice.
- Users remain responsible for deciding what to file, share, or present in court.
- Generated reports and timelines are organizational tools, not legal findings.
- Evidence uploads may be rejected or blocked by malware scanning.
- Deleted data may remain in encrypted backups until backup retention expires.
- Users should avoid entering unnecessary real child names, full account numbers, or unrelated third-party details.

## Launch Approval Evidence

Before setting `LEGAL_REVIEW_APPROVED=true`, record:

- reviewer name or role
- date reviewed
- document versions or commit hash reviewed
- required changes
- approval decision
- any jurisdiction or product limitations

Do not store privileged legal advice in public issue trackers, logs, analytics, or user-visible audit records.
