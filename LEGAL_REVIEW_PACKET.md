# Legal Review Packet

Review status: the operator adopted the contract, privacy, subscription, deletion, retention, and attorney-sharing policies through disclosed operator self-review on August 24, 2026. On August 27, 2026, the operator approved a United States-only direct Stripe checkout footprint with `not_collecting` tax mode and monthly threshold monitoring; App Store distribution remains worldwide. No qualified-counsel or tax-professional approval is represented. Runtime activation remains fail closed pending incident-contact evidence, release verification, and the monitored activation controls.

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
- `/privacy` proposed public page
- `/terms` proposed public page
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
7. Stripe web and Apple in-app subscription, renewal, cancellation, trial, refund, and tax disclosures are operative through disclosed operator self-review. Direct Stripe checkout requires a United States service address; Apple prices and renewal terms are shown by StoreKit before purchase, and Stripe checkout is not presented inside iOS.
8. The `heic-to` and libheif components are identified on a public open-source notice page with license and corresponding-source links.

## Decisions Still Recommended For Counsel Review

1. The operator confirmed the exact registered name `Slantwire Studios, LLC`, is based in Alaska, and has directed that no street or mailing address be published on the Custody Folio website. Public copy uses the confirmed name and monitored email contacts. EU App Store trader disclosure is accepted separately, with the exact verified business-address format still to be resolved.
2. Select any governing-law and forum language appropriate to the intended launch footprint; no state-specific forum is currently published.
3. Validate Washington My Health My Data Act scope, consent wording, processor contracts, rights workflow, and appeal language for Washington consumers. The Washington policy is not a statement that the operator is located in Washington.
4. Validate child/third-party record notices, the adult-only positioning, and any state privacy disclosures beyond Washington.
5. The operator accepts the stated retention maximums; confirm them against provider contracts and production configuration before treating them as operationally verified.
6. Review liability limits, warranty disclaimers, evidence/report language, legal-request process, and incident notification rules.
7. Confirm that the published LGPL notices and distribution method satisfy the exact web and native bundles shipped.

## Product Wording To Approve

The operator approved these product descriptions on August 24, 2026. Qualified-counsel review of their legal effect remains recommended; the current approval basis is operator self-review, not counsel approval:

- The app helps organize records and does not provide legal advice.
- Users remain responsible for deciding what to file, share, or present in court.
- Generated reports and timelines are organizational tools, not legal findings.
- Evidence uploads may be rejected or blocked by malware scanning.
- Deleted data may remain in encrypted backups until backup retention expires.
- Users should avoid entering unnecessary real child names, full account numbers, or unrelated third-party details.

Technical status: Stripe and Apple subscription clauses and the separate attorney-sharing authorization are operative. Production billing remains gated by the United States checkout control, incident-response evidence, provider verification, and activation checks. This status note is not part of the Product Wording section approved by the operator.

## Launch Approval Evidence

Before setting or renewing `LEGAL_REVIEW_APPROVED=true`, generate the protected manifest with `npm run approval:prepare` and record:

- the real approver name and role
- `operator_self_review` with `counselReviewStatus: not_obtained`, or qualified counsel's organization and license jurisdiction(s)
- date reviewed
- exact generated SHA-256 digests for every required document
- approval expiration/review date
- required changes
- approval decision
- any jurisdiction or product limitations

After the authorized reviewer adopts the exact bundle, run `npm run verify:approvals -- --legal --output-env-file /path/to/protected/approval.env` and install that mode-0600 file through the protected deployment workflow. The verifier never prints the reversible approval value to terminal or CI logs. Changing any covered policy or runbook changes the bundle digest and blocks readiness until it is reviewed again. Operator self-review must remain explicitly labeled and does not substitute for or imply qualified legal advice.

Do not commit the manifest or store privileged legal advice in public issue trackers, logs, analytics, or user-visible audit records. Keep detailed advice outside the manifest; record only the non-privileged evidence needed to substantiate the gate.
