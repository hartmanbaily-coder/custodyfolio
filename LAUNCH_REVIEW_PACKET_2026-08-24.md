# Custody Folio 1.0 Launch Review Packet

Status: operator policy review approved August 24, 2026; United States-only direct-web tax decision approved August 27, 2026; solo-operator incident model approved August 28, 2026. This packet is a decision aid, not legal or tax advice, and does not by itself activate production configuration.

## Confirmed Launch Scope

The product owner has directed that version 1.0 include:

- Apple monthly and annual subscriptions in the iOS app;
- Stripe monthly and annual subscriptions on the web; and
- invitation-only, read-only attorney access.

The release candidate may exercise these flows in non-production testing. Production remains fail closed until this review and the technical acceptance checks are complete.

## Product-Owner Facts Confirmed August 24, 2026

- Slantwire Studios, LLC is owned and operated from Alaska, United States, not Washington.
- `Slantwire Studios, LLC` is the confirmed exact registered contracting name.
- No street or mailing address will be published on the public site. Monitored support, privacy, and security email addresses remain the public contact methods.
- Custody Folio accounts are adult-only. Children may be described in an adult's custody records but may not create or use accounts.
- The Product Wording section in `LEGAL_REVIEW_PACKET.md` is approved as an accurate description of the product.
- Washington references describe protections for Washington consumers; they do not describe the operator's location.
- The intended direct-Stripe web footprint is worldwide. The intended App Store footprint is all available countries and regions, including the European Union.
- The existing prices are approved: web USD $5.99 monthly / $59.99 annually and App Store U.S. storefront $6.99 monthly / $69.99 annually, with Apple-localized prices elsewhere.
- The 180-day backup/log, 365-day audit-event, and 24-month closed-correspondence maximums are accepted as product commitments, subject to the required operational verification.

The no-address decision above applies to the Custody Folio website. App Store distribution is separate. App Store Connect identifies Custody Folio as a trader. Apple states that a trader distributing an app in any EU App Store must have an address, phone number, and email displayed on the App Store product page; for an organization, Apple says the address associated with its D-U-N-S Number is displayed. The product owner accepts the existing verified trader profile for EU distribution. On August 24, 2026, App Store availability was changed from the United States only to all 175 current countries and regions. Automatic enrollment in future new App Store countries or regions remains off. See [Apple's EU Digital Services Act trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements).

## Read These Documents First

Codex's completed product-accuracy review is [Custody Folio Policy Accuracy Review](POLICY_ACCURACY_REVIEW_2026-08-24.md). It compares the policy wording with the implemented app so the product owner is not expected to inspect source code. It also contains the completed technical reviews of reading-list items 5 and 7.

Read in this order:

1. [Legal Review Packet](LEGAL_REVIEW_PACKET.md)
2. [proposed Terms source](src/app/terms/page.tsx)
3. [proposed Privacy Policy source](src/app/privacy/page.tsx)
4. [proposed Consumer Health Data Policy source](src/app/consumer-health-data/page.tsx)
5. [proposed Subprocessors source](src/app/subprocessors/page.tsx)
6. [Tax / VAT / GST Review Packet](TAX_VAT_GST_REVIEW_PACKET.md)
7. [Data Retention and Deletion Runbook](DATA_RETENTION_DELETION_RUNBOOK.md)
8. [Privacy Rights Operations](PRIVACY_RIGHTS_OPERATIONS.md)
9. [Incident Response Runbook](INCIDENT_RESPONSE_RUNBOOK.md)
10. [Billing Launch Checklist](BILLING_LAUNCH_CHECKLIST.md)

## Decisions Requiring the Product Owner

Do not approve an item unless the statement is accurate. Record revisions instead of approving uncertain text.

### Business identity and contract terms

- [x] The public operator name `Slantwire Studios, LLC` is exact.
- [x] The operator is based in Alaska, United States.
- [x] Omitting a public street or mailing address is intentional. Public contact is by monitored email.
- [x] The Terms should omit a state-specific governing-law and exclusive-forum clause.
- [x] The adult-only account rule and the statement that children cannot create accounts are accurate.
- [x] The no-legal-advice and no-admissibility statements accurately describe the app.
- [x] The warranty, liability, dispute, and user-responsibility clauses are accepted as contract terms through disclosed operator self-review. They are not code behavior or attorney approval.

### Subscription terms

- [x] Web pricing is USD $5.99 monthly and USD $59.99 annually. The amounts match the source and the previously verified live Stripe catalog.
- [x] App Store U.S. pricing is USD $6.99 monthly and USD $69.99 annually, subject to Apple's localized storefront display. Both current U.S. prices were directly reverified in App Store Connect on August 24, 2026.
- [x] Every eligible account receives one app-managed, 30-day, no-card trial; neither Stripe nor Apple adds a second introductory trial.
- [x] Stripe purchases are offered only on the web; the iOS app presents only Apple's StoreKit purchase flow.
- [x] Automatic renewal, cancellation timing, refund-provider responsibility, grace handling, and export-only behavior are accepted as written.
- [x] The account-deletion and provider-record-retention descriptions are accurate.

### Attorney access and sensitive sharing

- [x] Attorney access is invitation-only, revocable, read-only, and free to the attorney. Invitation links are single-use and expire; an accepted grant continues until the owner revokes it, the attorney leaves, or the case/account is deleted.
- [x] The owner must select the case, name the intended adult attorney, and separately authorize sharing before an invitation is created.
- [x] The separate authorization expressly covers consumer-health or health-adjacent information in the selected case.
- [x] Download warnings, audit records, MFA, revocation behavior, and the limitation on copies already downloaded by an attorney are accepted.

### Privacy, deletion, and retention

- [x] The listed providers and their described data uses are complete and accurate.
- [x] Active case/account deletion behavior is accurately described.
- [x] Encrypted backup aging of no more than 180 days is acceptable as a product commitment. Provider verification remains a technical acceptance requirement.
- [x] Raw request logs up to 180 days, security/auth/attorney/deletion audit events up to 365 days, and closed support/privacy correspondence up to 24 months are accepted as product commitments. Operational verification remains required.
- [x] Washington consumer-health-data consent, rights, appeal, and downstream-recipient handling are accepted for Washington consumers in the intended launch footprint. This is separate from the operator's Alaska location.
- [x] Legal-hold language and review cadence are accepted.

### Tax decision for direct Stripe sales

Apple's merchant/platform handling does not by itself resolve the tax treatment of direct Stripe sales. Before live Stripe checkout, record one supported decision:

- [ ] `automatic`: every required registration is active, the Stripe product tax code and price tax behavior are verified, and collection/filing ownership is assigned; or
- [x] `not_collecting`: the operator approved United States-only direct Stripe checkout based on the documented Alaska launch facts, with monthly threshold monitoring and review before geographic expansion.

Also record:

- direct Stripe web sales are initially limited to United States service addresses;
- all App Store countries and regions are intended, including European Union distribution with verified trader contact information displayed;
- business, personnel, and contractor locations relevant to nexus;
- current and forecast sales by jurisdiction;
- registration and filing obligations; and
- whether non-US direct sales must be restricted.

### Incident and operational ownership

- [x] The operator selected the disclosed solo-operator model and accepted that no alternate human incident commander is currently designated.
- [x] The operator supplied a monitored business email and directed that no personal phone number be stored or published.
- [x] Supabase, hosting, edge-network/DNS, backup-storage, and business-email escalation portals are required and recorded in the protected manifest.
- [x] The retention/privacy-operations owner accepts the deletion and request workflow through operator self-review.
- [x] The incident-response owner accepts the runbook, the documented tabletop, and the solo-operator availability limitation.

Names, phone numbers, private addresses, credentials, and privileged advice belong only in the ignored protected approval manifest or an appropriate private system. Do not add them to this repository.

## Technical Acceptance Codex Will Verify

These are evidence checks, not product-owner policy decisions:

Current local and App Store Connect results are recorded in
[SUBMISSION_READINESS_AUDIT_2026-08-24.md](SUBMISSION_READINESS_AUDIT_2026-08-24.md).
Local code/build checks have passed. TestFlight build 16 was uploaded on August 24,
2026, verified as Testing in External Beta, and attached to App Store version 1.0.0.
Physical-device Apple sandbox acceptance, live provider acceptance, and the final
no-blocker production-readiness check remain pending.

- web lint, type checking, unit/integration tests, WebKit acceptance tests, production build, secret scan, and dependency audit;
- native iOS build and native test suite;
- privacy manifest inclusion in the archive;
- Apple product loading plus sandbox purchase, pending/cancel, restore, refund/revoke, expiration, notification, and reconciliation paths;
- Stripe test checkout, portal, cancellation, payment failure, refund, dispute, webhook, and reconciliation paths;
- attorney invitation, consent, MFA, read-only access, export/download warning, revocation, post-revocation denial, and audit paths;
- exact production readiness report with no stale provider evidence; and
- new TestFlight release-candidate build, App Store Connect attachment, subscription inclusion, and review metadata consistency.

## Approval Sequence

1. Record requested wording changes or explicitly approve the review items above.
2. Codex applies the approved text and changes the source-controlled legal release states from `feature_disabled_pending_review` to `operative`.
3. Regenerate the policy bundle and review its exact digest.
4. Generate a new ignored production approval manifest bound to that digest.
5. Fill and verify retention, incident, and legal sections without placeholders.
6. Complete provider and attorney acceptance testing against the release candidate.
7. Authorize the monitored production activation window separately.
8. Upload and test the new TestFlight build.
9. Confirm again before submitting the App Store review package.

No checkbox in this document, by itself, changes production configuration or represents professional legal or tax advice.
