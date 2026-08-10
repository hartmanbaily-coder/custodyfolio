# Privacy Notes

## Data Collected

The product may collect account profile data, custody matter labels, exchange rules, exchange logs, date-based notes, evidence metadata, child support order records, payment records, expense records, report exports, and audit events.

The local demonstration mode uses browser storage. Production account mode uses Supabase authentication, database storage, and private object storage through the server-side access controls described in the public Privacy, Security, and Subprocessors pages.

## Sensitive Data Categories

Potentially sensitive categories include custody records, child-related records, school and medical notes, family-court details, child support payment records, expenses, evidence files, agency case numbers, and report exports.

## Data Minimization

The UI encourages privacy-friendly labels such as `Child 1`, `Parent A`, and `Other Parent`. Real child names are not required.

Users should not enter Social Security numbers, full bank account numbers, full card numbers, full debit card numbers, bank login credentials, unrelated third-party details, or unnecessary medical/school details.

## Child Privacy

- Adult users only
- No child accounts
- No public child profiles
- No child-facing social features
- No co-parent messaging in the MVP

## Evidence Storage

Production evidence storage must be private by default:

- No public buckets
- No anonymous share links
- Authenticated server-mediated access only
- Malware scanning before storage and access
- Preserve upload timestamp and metadata
- Do not alter originals in ways that affect record integrity
- Add redaction tooling before export in a future phase

## Deletion and Export

The product includes case/profile exports, file downloads, case deletion, and signed-in account deletion. Production operations must keep documented:

- Account export format
- Case export format
- Evidence download behavior
- Direct vs queued deletion
- Backup retention
- Legal hold or abuse-report exceptions if any

See `DATA_RETENTION_DELETION_RUNBOOK.md` for the production deletion, retention, backup-aging, and legal-hold model. Material changes require privacy and legal review before the public commitments change.

## Third-Party Vendors

Avoid advertising trackers, session replay tools, unnecessary analytics, and vendors that receive sensitive custody, child support, court, child, health, school, or payment details.

Vendor contracts should be reviewed for encryption, retention, deletion, staff access, incident notice, and subprocessors.

## Logging Restrictions

Do not log note bodies, child names, court details, agency case numbers, payment reference numbers, evidence file contents, raw storage paths, or generated report bodies.
