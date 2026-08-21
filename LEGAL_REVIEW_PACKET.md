# Legal Review Packet

Review status: public policies revised August 10, 2026; independent legal approval remains pending.

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
- `/consumer-health-data` Washington consumer health data policy
- `/open-source` third-party license and source notice
- versioned signup acceptance and attorney case-sharing authorization flows

## Decisions Implemented For Safer Operation

1. Accounts and attorney access are limited to adults; attorney accounts remain invitation-gated and free.
2. Customer records are not used for advertising or AI training, and AI processing remains disabled pending a separate opt-in design.
3. Washington consumer health data has a separate policy and a separate, affirmative attorney-sharing authorization.
4. Active account and case deletion is immediate; encrypted backup aging is capped at 180 days.
5. Raw request logs are capped at 180 days; security, authentication, attorney-access, and deletion audit events are capped at 365 days; closed support/privacy correspondence is capped at 24 months absent a documented exception.
6. Legal holds require a documented basis, narrow scope, access controls, user notice unless prohibited, and review at least every 90 days.
7. No payment is currently required. Future subscription, renewal, cancellation, trial, and refund terms must be presented separately before any charge.
8. The `heic-to` and libheif components are identified on a public open-source notice page with license and corresponding-source links.

## Counsel Validation Still Required

1. Confirm the operator name and notice address after Apple approves the Slantwire Studios entity conversion.
2. Confirm Alaska governing-law and venue language for the intended launch footprint.
3. Validate Washington My Health My Data Act scope, consent wording, processor contracts, rights workflow, and appeal language.
4. Validate child/third-party record notices, the adult-only positioning, and any state privacy disclosures beyond Washington.
5. Confirm retention maximums against provider contracts and production configuration.
6. Review liability limits, warranty disclaimers, evidence/report language, legal-request process, and incident notification rules.
7. Confirm that the published LGPL notices and distribution method satisfy the exact web and native bundles shipped.

## Product Wording To Approve

Approve or revise these positions before `LEGAL_REVIEW_APPROVED=true` is set:

- The app helps organize records and does not provide legal advice.
- Users remain responsible for deciding what to file, share, or present in court.
- Generated reports and timelines are organizational tools, not legal findings.
- Evidence uploads may be rejected or blocked by malware scanning.
- Deleted data may remain in encrypted backups until backup retention expires.
- Users should avoid entering unnecessary real child names, full account numbers, or unrelated third-party details.

## Launch Approval Evidence

Before setting `LEGAL_REVIEW_APPROVED=true`, generate the protected manifest with `npm run approval:prepare` and record:

- qualified counsel's name and organization
- counsel license jurisdiction(s)
- date reviewed
- exact generated SHA-256 digests for every required document
- approval expiration/review date
- required changes
- approval decision
- any jurisdiction or product limitations

After counsel approves the exact bundle, run `npm run verify:approvals -- --legal --output-env-file /path/to/protected/approval.env` and install that mode-0600 file through the protected deployment workflow. The verifier never prints the reversible approval value to terminal or CI logs. Changing any covered policy or runbook changes the bundle digest and blocks readiness until it is reviewed again. An internal product-owner review cannot satisfy the `qualified_counsel` role.

Do not commit the manifest or store privileged legal advice in public issue trackers, logs, analytics, or user-visible audit records. Keep detailed advice outside the manifest; record only the non-privileged evidence needed to substantiate the gate.
