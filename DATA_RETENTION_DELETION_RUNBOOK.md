# Data Retention and Deletion Runbook

Effective date: August 10, 2026

Policy owner: Slantwire Studios

Custody Folio keeps sensitive records only as long as users need them and as long as a specific operational, security, legal, or backup constraint requires. This runbook defines the production deletion and retention model. A qualified legal reviewer must approve material changes before `LEGAL_REVIEW_APPROVED=true` is set.

This is product and operations guidance, not legal advice.

## Data Categories

| Category | Examples | Default Handling |
| --- | --- | --- |
| Account data | email, profile, timezone, auth identifiers | Keep while account is active |
| Case metadata | case labels, roles, child display labels, order nickname | Keep while case is active |
| Parenting-time records | exchange rules, exchange logs, custody schedule, exceptions | Keep while case is active |
| Notes | date notes, tags, report inclusion flags | Keep while case is active |
| Child support data | orders, payment records, due/paid amounts, agency labels | Keep while case is active |
| Expense data | expenses, reimbursement status, receipts metadata | Keep while case is active |
| Evidence files | private uploaded files and metadata | Keep while case is active |
| Reports/exports | generated CSV/JSON/print-to-PDF outputs | Browser/user controlled unless server-side export storage is added |
| Audit logs | login, create/update/delete/export/upload metadata | Keep for security/accountability period |
| Security logs | route, status, request id, user id hash, operational errors | Keep for security period without sensitive content |

## Data Minimization Rules

- Do not require real child names.
- Encourage labels like `Child 1`, `Parent A`, and `Parent B`.
- Do not collect full Social Security numbers, full bank account numbers, full card numbers, debit card numbers, bank login credentials, or unrelated third-party details.
- Do not use advertising trackers or session replay.
- Do not store raw storage paths, file contents, note bodies, payment references, or generated report bodies in logs.

## Export Before Deletion

Before account or case deletion, offer export where practical:

- records JSON
- report CSV/JSON
- evidence file downloads
- evidence index
- audit summary

Warn users that exported files leave the app's protected storage and become their responsibility.

## Case Deletion

Required behavior:

1. User requests deletion for a case.
2. App confirms the case label and warns that deletion removes records and private evidence files.
3. App deletes private evidence objects first.
4. App deletes or overwrites case dataset/snapshots.
5. App records a minimal deletion audit event without sensitive content.
6. App confirms deletion completion.

If deletion is queued:

- mark the case as deletion pending
- disable new uploads for that case
- finish deletion within the committed service window
- expose deletion status to the user

## Account Deletion

Required behavior:

1. User requests account deletion.
2. App confirms identity and reauthentication.
3. User is offered export.
4. All user cases are queued for deletion.
5. Private evidence objects are deleted.
6. Records snapshots and normalized records are deleted.
7. Supabase Auth user is deleted or disabled after records cleanup.
8. Active sessions are revoked.
9. Minimal deletion audit metadata is retained for the security retention period if lawful and necessary.

## Evidence Deletion

Evidence deletion must:

- delete the private storage object
- delete or update evidence metadata
- not expose raw storage paths to the browser URL or logs
- record a minimal audit event
- fail closed if storage deletion fails

## Backup Aging

Backups may retain deleted data until they expire. The production privacy policy must disclose this.

Required backup model:

- encrypted automated backups
- restricted backup access
- restore tests at least every 180 days
- a maximum 180-day backup retention period
- deleted data ages out of backups no later than 180 days after verified deletion
- restored environments must reapply deletion requests before being used for production traffic

Production limits:

- Database backup retention: no more than 180 days
- Private storage backup retention: no more than 180 days
- Raw application and request logs: no more than 180 days; minimize IP addresses and user agents where practical
- Authentication, security, attorney-access, and deletion audit events: no more than 365 days unless a documented legal hold applies
- Closed support and privacy correspondence: no more than 24 months unless an active request, dispute, or documented legal hold requires longer
- Backup restore owner: the Slantwire Studios infrastructure operator or a specifically designated incident lead
- Backup restore test cadence: at least once every 180 days and after a material backup-provider change

The operator must review provider settings at least quarterly. If a provider cannot meet these maximums, do not place new production customer data with that provider until the mismatch is corrected or the public policy is lawfully revised with required notice or consent.

After a restore drill, copy `ops/backup-restore-evidence.example.json` to the ignored path `ops/backup-restore-evidence.json`, replace every placeholder with the real non-sensitive restore evidence, and run:

```bash
npm run verify:backup-restore
```

Do not include real custody, child, court, payment, health, school, note, evidence contents, raw storage paths, or secrets in the evidence artifact.
The verifier intentionally rejects the `.example.json` template and common placeholder text.

## Legal Hold

A deletion request may be paused only when a documented legal requirement or a written, case-specific legal assessment requires it.

- Placement: only the Slantwire Studios operator, acting on documented legal process or advice, may place a hold.
- Scope: identify the account, exact data categories, legal basis, start date, and the least amount of data necessary. Do not copy record contents into the hold log.
- Notice: notify the affected user unless the law or legal process prohibits notice; record the reason if notice is delayed or withheld.
- Protection: restrict held data to specifically authorized personnel and preserve existing encryption and access logging.
- Review: review each hold at least every 90 days and record whether it remains necessary.
- Release: the operator releases the hold when the documented basis ends, then completes the pending deletion promptly and records completion.

Do not create broad, speculative, or indefinite holds.

## Security Log Retention

Security logs should be retained long enough to investigate abuse and incidents, but should not include sensitive record contents.

- application security logs: up to 180 days
- auth/security events: 365 days
- deletion audit metadata: 365 days
- attorney-access events: 365 days
- raw request logs with IP addresses: up to 180 days, minimized where possible

## Deletion Verification

For each deletion request, verify:

- dataset no longer loads for that user/case
- private evidence storage objects are removed
- user sessions are revoked when account deletion occurs
- readiness/monitoring did not report deletion failures
- backup-aging disclosure applies until backup retention expires

## Change Control

- Signed-in account deletion is immediate for active records and private files; backup aging follows the 180-day maximum above.
- Case deletion is self-service and immediate for active case data and evidence.
- Minimal audit metadata may remain for up to 365 days when reasonably necessary for security, action verification, or legal compliance; it must not contain record contents.
- Privacy and Washington consumer-health-data requests are acknowledged and completed within applicable legal deadlines; the public policy commits to a 45-day Washington response period and appeal process.
- Court or law-enforcement requests are reviewed for validity and scope. Disclose only what is legally required, preserve confidentiality, and notify the user unless legally prohibited.
- Any extension, new data category, new provider, new secondary use, or new legal-hold practice requires a documented privacy review and a matching public-policy update before it takes effect.
