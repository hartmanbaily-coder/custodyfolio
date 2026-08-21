# Privacy Rights Operations

Effective date: August 12, 2026

Policy owner: Slantwire Studios privacy operations owner

This runbook governs access, deletion, correction, consent-withdrawal, and appeal requests involving Custody Folio data. It is an operational control, not legal advice. Qualified counsel must approve the legal deadlines, exceptions, and Washington consumer-health-data handling before launch.

## Intake and Identity Verification

1. Record the request without copying custody, child, court, school, health, payment, note, or evidence content into the operations record.
2. Assign an opaque request ID. Do not use an email address, account ID, case label, child name, or raw storage path as the ID.
3. Confirm the request type, received time, applicable response deadline, and the least data scope needed to fulfill it.
4. Authenticate the requester through the signed-in account or a documented identity-verification process. Do not collect more identity data than is necessary.
5. If identity cannot be verified, pause fulfillment, explain the minimum additional verification needed, and do not disclose whether another person's records exist.

## System and Recipient Inventory

For every request, review each current target even when it is not applicable:

- `records_database`: account and case datasets, metadata, and normalized records
- `private_evidence_storage`: private uploaded objects and their metadata
- `auth_identity`: Supabase Auth identity and active sessions
- `application_exports`: any server-held export, if server-side export storage is later added
- `security_audit_records`: minimized security, access, and deletion audit records
- `supabase`: database, authentication, and Storage processor
- `hetzner`: application hosting
- `backblaze`: encrypted off-site evidence backups
- `cloudflare`: website traffic protection, DNS, and security processing
- `apple_icloud_mail`: privacy, support, and security mailbox processing
- `resend`: authentication and security email delivery
- `have_i_been_pwned`: k-anonymous compromised-password screening
- `security_monitoring`: logging, alerting, or security-event processors
- `attorney_recipient_copies`: files or records an adult user intentionally downloaded or disclosed to an attorney
- `other_recipients`: legal-process, business-transfer, or other recipients, if any

When a vendor, recipient, export store, analytics service, support system, or subprocessor changes, update this inventory, the verifier's required target list, and the public subprocessor/policy materials before relying on this runbook. Each request artifact must carry the exact current Subprocessors page digest so an old inventory cannot be reused after that page changes.

## Fulfillment Order

For deletion or consent withdrawal:

1. Revoke active attorney grants and sessions for the affected scope.
2. Delete private evidence objects through the Storage API and confirm success.
3. Delete active records and metadata. Do not report success if object deletion or the dataset update fails.
4. Delete or disable the Auth identity only after active records cleanup succeeds when the entire account is being deleted.
5. Notify each applicable processor, contractor, or recipient that remains under Custody Folio's control. Record the notice time, acknowledgement, and a non-sensitive ticket or evidence reference.
6. Record the deletion so a later restore re-applies it before restored data can serve production traffic.
7. Confirm the backup aging deadline is no later than 180 days after active deletion.
8. Send the completion response only after every applicable active-system and downstream check passes.

For access or correction requests, use the same inventory, provide only the authenticated requester's data, and propagate corrections to applicable controlled processors or recipients. Use an encrypted or authenticated delivery method appropriate for sensitive records.

## Controlled and Uncontrolled Copies

- A processor or contractor cannot be marked `not_controllable`; obtain acknowledgement or keep the request open and escalate.
- A copy already downloaded by the user or deliberately disclosed to an attorney may be outside Custody Folio's technical control. Record it as a `user_controlled_copy`, explain the limitation, and provide any legally required notice or forwarding request. Do not represent that copy as deleted.
- A legal hold or other retention exception must be documented, narrowly scoped, time-bounded, access-restricted, and reviewed under `DATA_RETENTION_DELETION_RUNBOOK.md`. The user response must accurately describe any lawful limitation unless notice is prohibited.

## Failure and Escalation

- A failed or unacknowledged controlled downstream deletion keeps the request incomplete.
- Retry transient provider failures and escalate persistent failures to the privacy operations owner and incident commander.
- Treat cross-user disclosure, public evidence, lost deletion state, or an inability to honor a validated deletion as a potential incident under `INCIDENT_RESPONSE_RUNBOOK.md`.
- Obtain counsel promptly for deadline extensions, denials, appeals, legal holds, or health-data notification questions.

## Evidence and Verification

Copy `ops/privacy-rights-request.example.json` to an ignored request-specific file under `ops/privacy-rights-requests/`. Replace every placeholder with non-sensitive operational evidence, then run:

```bash
PRIVACY_RIGHTS_REQUEST_FILE=ops/privacy-rights-requests/REQUEST_ID.json npm run verify:privacy-rights
```

The verifier rejects example templates, stale placeholders, incomplete active-system work, pending controlled recipients, uncontrolled processor claims, late completion, and backup aging beyond 180 days. The operational artifact must not contain record contents, email addresses, child or party names, case labels, court details, note text, evidence filenames, raw storage paths, secrets, or privileged legal advice.

Before setting retention approval evidence, conduct a synthetic end-to-end rehearsal, verify its request artifact, and record the rehearsal date in the protected production approval manifest. A rehearsal does not substitute for completing real requests.
