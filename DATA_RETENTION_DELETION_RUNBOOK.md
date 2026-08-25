# Data Retention and Deletion Runbook

Effective date: August 10, 2026

Policy owner: Slantwire Studios, LLC

Custody Folio keeps sensitive records only as long as users need them and as long as a specific operational, security, legal, or backup constraint requires. This runbook defines the production deletion and retention model. An authorized reviewer must adopt material changes and record the exact document digest before `LEGAL_REVIEW_APPROVED=true` is set. Operator self-review must be disclosed as such and is not qualified legal advice.

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
3. Server marks the case deletion-pending in the authoritative snapshot so new uploads are blocked.
4. App revokes active attorney access for the case.
5. Server recursively enumerates the authenticated account/case Storage prefix and deletes every object through the Storage API in batches of at most 1,000. It does not trust mutable evidence metadata to discover objects.
6. Server re-lists the prefix and requires it to be empty.
7. Only after Storage confirms deletion, app deletes or overwrites the case dataset/snapshot.
8. App records a minimal deletion audit event without sensitive content.
9. App confirms deletion completion only after the server operation succeeds.

The deletion endpoint is fail-closed: an invalid object name, listing failure, removal failure, verification failure, or unsafe batch size returns an error and leaves the case in deletion-pending state rather than persisting a snapshot that hides a still-existing object. The browser keeps or restores the case and shows the failure when the server cannot confirm cleanup. The upload route checks case state immediately before and after upload; if deletion wins the race, it removes the just-uploaded object instead of returning usable evidence metadata. Metadata-only legacy evidence entries do not block deletion because Storage prefix enumeration remains authoritative.

If deletion is queued:

- mark the case as deletion pending
- disable new uploads for that case
- finish deletion within the committed service window
- expose deletion status to the user

## Account Deletion

Required behavior:

1. The signed-in user opens the self-service deletion page, where export remains available before the irreversible action.
2. The deletion request requires the authenticated records session, the configured MFA assurance level, CSRF verification, rate limiting, the `account:delete` capability, and the exact `DELETE` confirmation.
3. The server creates an account-deletion tombstone before cleanup. Evidence uploads check that tombstone and are blocked while deletion is active.
4. The server checks provider billing. Active Stripe web subscriptions are cancelled before deletion; deletion stops if cancellation or billing verification cannot be confirmed. App Store billing is controlled by Apple and does not delay account deletion, so the user is told to cancel separately in Apple subscription settings.
5. The server recursively enumerates and deletes the authenticated user's private evidence-storage prefix and requires Storage cleanup to succeed.
6. The server globally revokes the Supabase Auth session before removing the account.
7. Billing identity is replaced with a keyed pseudonymous deletion hash, and active trial/entitlement links are removed through the billing redaction procedure.
8. The server deletes the Supabase Auth user. Database foreign-key cascades remove the user's records snapshots, normalized records, profiles, invitations, grants, and owner audit rows; events owned by another user retain no deleted actor identity.
9. The server marks the non-Auth deletion tombstone completed so an in-flight upload cannot recreate data after Auth deletion.
10. The app clears local session cookies and records only minimal deletion-completion or failure telemetry without custody-record content.

The route fails closed at each safety boundary. If Stripe cancellation, evidence cleanup, session revocation, billing redaction, Auth deletion, or tombstone finalization cannot be confirmed, it returns a specific failure state instead of claiming complete deletion. Some later-stage failures occur after files or sessions have already been removed; the user is instructed to contact support so the remaining step can be completed.

## Evidence Deletion

Evidence deletion must:

- delete the private storage object
- delete or update evidence metadata
- not expose raw storage paths to the browser URL or logs
- record a minimal audit event
- fail closed if storage deletion fails

## Privacy Requests and Downstream Recipients

Use `PRIVACY_RIGHTS_OPERATIONS.md` for every access, deletion, correction, consent-withdrawal, or appeal request. The operator must review all active systems and every listed processor, contractor, or recipient; an applicable controlled target cannot remain pending when completion is reported.

For deletion and consent withdrawal:

- notify each applicable controlled processor, contractor, or recipient
- retain a non-sensitive notice and acknowledgement reference
- distinguish a user- or attorney-controlled downloaded copy from a provider copy without claiming the downloaded copy was deleted
- record deletion for replay after any backup restore
- set a backup aging deadline no later than 180 days after active deletion
- do not send a completion notice while active cleanup or a controlled downstream action is pending or failed

Verify each request-specific operational artifact with:

```bash
PRIVACY_RIGHTS_REQUEST_FILE=ops/privacy-rights-requests/REQUEST_ID.json npm run verify:privacy-rights
```

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
- Backup restore owner: the Slantwire Studios, LLC infrastructure operator or a specifically designated incident lead
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

- Placement: only the Slantwire Studios, LLC operator, acting on documented legal process or advice, may place a hold.
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
- every applicable processor, contractor, and recipient has acknowledged its controlled action
- the request-specific operational evidence passes `npm run verify:privacy-rights`

## Change Control

- Signed-in account deletion is immediate for active records and private files; backup aging follows the 180-day maximum above.
- Case deletion is self-service and immediate for active case data and evidence.
- Minimal audit metadata may remain for up to 365 days when reasonably necessary for security, action verification, or legal compliance; it must not contain record contents.
- Privacy and Washington consumer-health-data requests are acknowledged and completed within applicable legal deadlines; the public policy commits to a 45-day Washington response period and appeal process.
- Court or law-enforcement requests are reviewed for validity and scope. Disclose only what is legally required, preserve confidentiality, and notify the user unless legally prohibited.
- Any extension, new data category, new provider, new secondary use, or new legal-hold practice requires a documented privacy review and a matching public-policy update before it takes effect.
