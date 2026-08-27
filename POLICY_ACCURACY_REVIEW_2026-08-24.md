# Custody Folio Policy Accuracy Review

> Superseded by the [August 27, 2026 policy accuracy review](POLICY_ACCURACY_REVIEW_2026-08-27.md), which reflects the final pre-submission follow-up audit and proposed wording corrections.

Reviewed August 24, 2026 against the current application code, database migrations, tested user flows, live readiness output, App Store Connect configuration, and Stripe integration.

Purpose: answer whether the proposed public wording accurately describes what the app actually does. This is a technical and product-accuracy review, not a legal opinion about enforceability.

## Confirmed Operator Facts

- Operator: Slantwire Studios, LLC.
- The product owner confirmed that `Slantwire Studios, LLC` is the exact registered contracting name.
- Owned and operated from Alaska, United States, not Washington.
- Public street and mailing address: intentionally not published.
- Public contact: monitored support, privacy, and security email addresses.
- Accounts: adults only. Adults may store custody records that refer to children; children cannot create or use accounts.

The current public pages do not publish a street address or claim the company is based in Washington. Washington references are limited to a policy and rights workflow for Washington consumers.

This website wording does not control what Apple displays on the App Store. The product owner selected worldwide App Store availability and accepts required EU trader disclosure using the existing verified profile. App Store Connect identifies the app as a trader, and Apple states that it will display the verified developer-account address and contact information for EU distribution. On August 24, 2026, the app was configured for all 175 current App Store countries and regions; automatic enrollment in future new storefronts remains off.

## Plain-English Verdict

The Terms, Privacy Policy, Consumer Health Data Policy, and Subprocessors page are substantially accurate descriptions of the implemented app. I found no public claim that the app is a law firm, gives legal advice, guarantees admissibility, allows child accounts, offers Stripe inside iOS, or gives attorneys edit access.

The following qualifications must remain visible before the policies are adopted:

1. The warranty, liability, dispute, and governing-law sections are contract provisions. Code review can confirm they do not misdescribe the product, but code cannot determine whether a court would enforce them.
2. Washington coverage is consumer-specific. It does not mean the operator is located in Washington. The app is currently internet-accessible and does not exclude Washington users, so removing the Washington page solely because the operator is in Alaska would create a gap.
3. Active account/case deletion behavior is implemented and tested, but the 180-day/365-day/24-month retention schedule also depends on provider settings and ongoing operator procedures. The public maximums should not be treated as verified until the protected retention approval and privacy-rights rehearsal pass.
4. The Subprocessors page accurately names the providers visible in code and current readiness evidence. The exact production security-monitoring destination still needs to be identified if a third-party SIEM or webhook receives production events.
5. The direct-Stripe tax statement is accurate only while checkout either does not collect tax or follows a separately approved Stripe Tax configuration. No tax-registration conclusion can be inferred from the operator being in Alaska.

## Terms of Use

### Accurate product statements

- Adult-only accounts match signup and attorney-account rules.
- The service organizes custody calendars, exchanges, notes, expenses, child-support records, files, reports, and attorney access.
- It does not provide legal advice, court findings, representation, emergency service, or an admissibility guarantee.
- Users own their records and grant only the processing permission needed to provide and secure the service.
- Account security, acceptable-use, and malware restrictions match the implemented controls.
- One client may grant one adult attorney account read-only access. The attorney may view and export but cannot alter the client's case.
- Revocation stops future access but cannot recall files the attorney already downloaded.

### Subscription section — accurate

- One app-managed 30-day no-card trial is created by the database entitlement procedure.
- Stripe and Apple do not add a second provider trial.
- Web prices are $5.99 monthly and $59.99 annually.
- iOS prices come from Apple's StoreKit sheet and may be localized.
- Stripe Checkout exists only on the web; the server rejects Stripe checkout from the native iOS user agent.
- The app prevents a second provider purchase while full access already comes from Stripe or Apple.
- Subscriptions reconcile active, cancellation-at-period-end, grace, expiration, refund, dispute, and revocation states.
- After trial/paid access ends, the account becomes export-only while view, download, export, delete, billing management, and attorney revocation remain available.
- Account deletion cancels active Stripe subscriptions first. Apple subscriptions must be cancelled separately through Apple.

Testing nuance: purchase buttons do not appear while the universal trial is active. A sandbox/TestFlight purchase test therefore needs a dedicated test account whose trial has ended and whose entitlement is `export_only`. Changing this would change product behavior and requires product-owner approval.

### Contract language — technically consistent, legal effect not determined

- The disclaimers accurately say the app can be unavailable or contain errors and cannot guarantee evidentiary or legal outcomes.
- The $100-or-12-month-fees liability cap, consequential-loss exclusion, user-responsibility allocation, informal-dispute request, and absence of mandatory arbitration do not contradict app behavior. They are legal risk allocations, not technical facts.
- The Terms currently select no state-specific governing law or exclusive forum. The operator's Alaska location is now recorded in the review materials, but choosing Alaska law would be a separate contract decision.

## Privacy Policy

### Accurate

- Data categories match the records schema and evidence features.
- Security metadata is minimized and hashed where implemented; record contents are intentionally excluded from security events.
- Customer records are not used for advertising or AI training, and AI import remains disabled.
- Supabase, Backblaze, Hetzner, Cloudflare, Resend, Have I Been Pwned, Apple mail, Stripe, and Apple billing roles match the code and deployment design.
- Custody Folio does not store full payment-card numbers.
- Attorney access requires affirmative sharing authorization and remains read-only.
- Active account deletion removes private evidence, revokes sessions, removes Auth/data rows through database cascades, minimizes billing identity, and ends attorney access.
- Users can view, correct, export, delete, revoke attorney access, and request privacy review.

### Operational verification still required

- Backup aging no later than 180 days.
- Raw request logs no longer than 180 days.
- Security/auth/attorney/deletion audit events no longer than 365 days.
- Closed support/privacy correspondence no longer than 24 months.
- Notice and acknowledgement from applicable controlled downstream processors or recipients after a verified request.

The code includes readiness gates and evidence verifiers for these commitments, but the live readiness endpoint still reports retention approval and the privacy-rights rehearsal as incomplete.

## Consumer Health Data Policy

The policy accurately describes optional health-related information that a user may place in a custody record. The app does not require health data, obtain it from medical providers/devices, sell it, or use it for advertising or profiling.

The separate attorney-sharing authorization matches the implemented invitation flow. It is not buried in general Terms acceptance.

The Washington page is appropriately limited to Washington residents and people whose consumer health data is collected in Washington. It is not an operator-location statement. Because Custody Folio is not currently geographically restricted, the page should remain unless the launch scope affirmatively excludes Washington consumers and that restriction is actually enforced.

The 45-day response, appeal, processor notice, and backup-deletion language describes an operator workflow rather than an automatic in-app function. It remains pending until the privacy-rights operations rehearsal is complete.

## Subprocessors Page — Item 5 Review

If “number 5” meant the fifth document in the launch reading list, this is the result:

- Supabase: accurate for Auth, Postgres records, and private file storage.
- Hetzner: accurate for application hosting.
- Backblaze: accurate for encrypted, access-restricted off-site evidence backups.
- Cloudflare: accurate for DNS, tunnel/network delivery, and security controls.
- Apple iCloud Mail: accurate for the published support/privacy/security mailboxes.
- Resend: accurate for Supabase authentication email delivery.
- Have I Been Pwned: accurate; only the five-character SHA-1 range prefix is sent by the compromised-password check.
- Stripe: accurate for hosted web checkout, subscriptions, portal, invoices, refunds, disputes, and billing information.
- Apple: accurate for StoreKit purchases and provider transaction state.
- Security monitoring: technically accurate at the category level, but name the actual third-party recipient here before it receives production security events.

## Retention and Deletion Runbook — Item 7 Review

If “number 7” meant the seventh document in the launch reading list, I reviewed it against the deletion routes and migrations.

I corrected its account-deletion sequence. The prior version described queued case deletion and deleting database rows before Auth. The actual app instead:

1. requires authenticated MFA/CSRF/capability checks and exact confirmation;
2. creates a durable deletion tombstone that blocks uploads;
3. cancels/verifies Stripe billing;
4. recursively deletes private evidence;
5. globally revokes the Auth session;
6. pseudonymizes billing identity;
7. deletes the Auth user, which cascades the owned database rows and attorney grants; and
8. finalizes the durable tombstone.

That revised sequence now matches the code and tests. The stated retention maximums remain operational commitments that must be verified in the providers and protected rehearsal evidence before approval.

## Legal Review Packet — Items 5 and 7

If the numbers referred to the numbered lists inside `LEGAL_REVIEW_PACKET.md`:

- Implemented decision 5 (180-day logs, 365-day audit events, 24-month correspondence): matches the intended retention model, but still needs live provider/operator evidence.
- Implemented decision 7 (Stripe/Apple subscription disclosures): matches the actual billing implementation, including StoreKit-only iOS purchase, Stripe-only web purchase, one app trial, provider-managed cancellation/refunds, and server reconciliation.

## Remaining Non-Code Decisions

These cannot be truthfully resolved by reading source code alone:

- whether to select Alaska governing law/forum or continue without a state-specific clause;
- the exact tax registrations and collection/filing model required for the confirmed worldwide direct-web footprint;
- which tax registrations, if any, are active and the resulting Stripe Tax mode;
- whether a non-public but legally usable notice address is required anywhere;
- the actual named incident-response contacts and security-monitoring recipient.

Everything else above has been reviewed technically so the product owner does not need to inspect source code.
