# Data Retention and Deletion Runbook

Custody Folio should keep sensitive records only as long as users need them and as long as legitimate operational, security, legal, or backup constraints require. This runbook defines the production deletion and retention model to finalize with counsel before launch.

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

Target behavior:

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

Target behavior:

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

Target backup model:

- encrypted automated backups
- restricted backup access
- restore tests at least every 180 days
- documented backup retention period
- deleted data ages out of backups by the end of the backup retention period
- restored environments must reapply deletion requests before being used for production traffic

Fill before launch:

- Database backup retention:
- Storage backup retention:
- Log retention:
- Audit retention:
- Backup restore owner:
- Backup restore test cadence:

After a restore drill, copy `ops/backup-restore-evidence.example.json` to the ignored path `ops/backup-restore-evidence.json`, replace every placeholder with the real non-sensitive restore evidence, and run:

```bash
npm run verify:backup-restore
```

Do not include real custody, child, court, payment, health, school, note, evidence contents, raw storage paths, or secrets in the evidence artifact.
The verifier intentionally rejects the `.example.json` template and common placeholder text.

## Legal Hold

A deletion request may need to be paused if legally required. Before launch, counsel must define:

- who can place a legal hold
- what records are held
- how the user is notified, if allowed
- who can release the hold
- how holds are reviewed
- how held data is protected

Do not create broad indefinite holds without documented legal basis and review dates.

## Security Log Retention

Security logs should be retained long enough to investigate abuse and incidents, but should not include sensitive record contents.

Suggested starting point to approve with counsel:

- application security logs: 180 days
- auth/security events: 365 days
- deletion audit metadata: 365 days
- raw request logs with IP addresses: 90 to 180 days, minimized where possible

## Deletion Verification

For each deletion request, verify:

- dataset no longer loads for that user/case
- private evidence storage objects are removed
- user sessions are revoked when account deletion occurs
- readiness/monitoring did not report deletion failures
- backup-aging disclosure applies until backup retention expires

## Open Production Decisions

- exact retention periods
- user self-service deletion scope
- whether account deletion is immediate or queued
- whether audit logs are retained after account deletion
- legal hold policy
- support contact and SLA
- backup retention and restore process
- how deletion requests are handled if records are subject to court/law enforcement requests
