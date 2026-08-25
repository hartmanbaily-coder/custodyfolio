# Custody Folio 1.0 Submission Readiness Audit

Audit date: August 24, 2026 (America/Anchorage; live checks recorded August 25 UTC)

Status: **not ready to submit yet**. The code candidate is locally healthy and App Store Connect is staged correctly, but operator review, live provider acceptance, and a replacement binary are still required.

This document records verification evidence. It does not approve policy text, enable production features, upload a build, or submit the app.

## Product-Owner Review

Start with [LAUNCH_REVIEW_PACKET_2026-08-24.md](LAUNCH_REVIEW_PACKET_2026-08-24.md). It identifies every business, legal, retention, incident-response, attorney-sharing, subscription, and tax decision that remains for the product owner or an appropriate professional reviewer.

The product owner has confirmed the exact registered name `Slantwire Studios, LLC`, Alaska ownership/operation, adult-only accounts, no public website street or mailing address, the Product Wording section of the legal packet, the existing web/App Store prices, the stated retention maximums, and worldwide web/App Store intent. Washington references are consumer-specific and do not identify the operator as a Washington business. Codex's comparison of the proposed public language with the implemented app is recorded in [POLICY_ACCURACY_REVIEW_2026-08-24.md](POLICY_ACCURACY_REVIEW_2026-08-24.md).

Production billing and attorney access remain fail closed until that review is recorded. Non-production testing remains available.

## App Store Connect

Read-only App Store Connect audit result at `2026-08-25T00:21:49.419Z`:

- App: Custody Folio, Apple ID `6789433883`, bundle ID `io.lendori.losttofound`.
- Version 1.0.0 is `READY_FOR_REVIEW` and has not been submitted.
- Build 15 is `VALID` and attached to the version.
- The draft review submission contains the app version, monthly subscription, annual subscription, and subscription group; all four items are `READY_FOR_REVIEW`.
- Monthly and annual subscriptions are both `READY_TO_SUBMIT`.
- Direct App Store Connect inspection on August 24, 2026 reconfirmed current U.S. subscription prices of $6.99 monthly and $69.99 annually. Each subscription already has localized pricing for all 175 App Store countries and regions.
- Review contact, demo information, review notes, and version metadata are complete.
- Three iPhone and three iPad screenshots are uploaded.
- Build 15 is in TestFlight beta testing, and the public link is enabled.
- The App Store Connect API sandbox-tester endpoint returned HTTP 404. This is an API limitation and does not verify whether a sandbox tester exists; confirm the tester in the App Store Connect interface before purchase testing.

Direct inspection on August 24, 2026 initially found the app available on release only in the United States. With explicit product-owner authorization, App Store availability was changed and reverified as `Available on App Release` in all 175 current countries and regions. Automatic enrollment in future new App Store countries or regions remains off. App Store Connect identifies Custody Folio as a trader, and the product owner accepts use of the existing verified trader profile for EU distribution. Apple states that a trader distributing in any EU App Store must have verified contact information, including an address, displayed on the App Store product page; for an organization, Apple displays the address associated with its D-U-N-S Number. Trader status and address information were not changed. Reference: [Apple's EU trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements).

Apple requires a first auto-renewable subscription to be submitted with a new app version. The current four-item review package follows that model. References: [submit an in-app purchase](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/) and [offer auto-renewable subscriptions](https://developer.apple.com/help/app-store-connect/manage-subscriptions/offer-auto-renewable-subscriptions/).

### Replacement binary required

Do not submit build 15. The following release changes are newer than that binary:

- the required-reason privacy-manifest correction; and
- native preservation of the attorney/owner role-scope cookie across secure WebKit-session restoration.

Upload and test a new build, then replace build 15 on version 1.0.0 before submission.

## Verified Code and Release Controls

All checks below passed in the current checkout:

- ESLint: pass.
- TypeScript: pass.
- Production Next.js build: pass.
- Unit/integration tests: 404 passed across 69 files.
- WebKit end-to-end tests: 29 passed, including attorney invitation/access, read-only portal, multi-client switching, account recovery/deletion, exports, and mobile layouts.
- Native iOS tests: 15 policy/security tests passed with 0 failures.
- Native StoreKit acceptance suite: 1 test skipped because the simulator StoreKit service returned `notEntitled`; this requires real sandbox/TestFlight verification.
- Secret-pattern scan: pass.
- Production dependency audit: 0 vulnerabilities.
- Production environment template: all 119 expected keys verified.
- App Store release-script tests: 14 passed.
- Generated policy-bundle digest: `sha256:fb0ff852a56ee5a50c3fa0caaef39a50dde060556e2ebd48cd8f4d65df8195e9`.
- Targeted security review: 0 reportable findings across authentication, attorney authorization, records/evidence isolation, billing, deletion, native bridge/session handling, Supabase controls, and production ingress. The review was bounded to submission-risk surfaces, not a line-by-line review of every tracked file.

## Live Production Readiness

The public readiness endpoint returned HTTP 503 / `not_ready` at `2026-08-25T00:36:01.475Z` with ten blockers and two warnings.

### Already configured successfully

- Production HTTPS app/records host and Supabase records mode.
- Attorney feature flag, separate cryptographic secret, owner-share delivery, and disabled development delivery.
- Supabase project, browser key, server-only service key, MFA, password, redirect, SMTP, and auth-hardening controls.
- Private evidence storage, malware scanning, WAF/rate limits, monitoring, backup/restore, and two-user isolation controls.
- Stripe live restricted key, webhook secret, monthly/annual Price allowlist, Customer Portal allowlist, and recent portal verification.
- Apple bundle/product identity plus App Store Server API credentials and trust roots.

### Blockers that remain

1. Approve the exact retention/deletion policy and record recent privacy-rights evidence.
2. Approve the incident-response plan with named primary/backup contacts and current exercise evidence.
3. Approve or revise the exact Terms, Privacy, billing, attorney-sharing, and runbook text. The current source release states remain `feature_disabled_pending_review`.
4. Record the direct-Stripe tax decision, launch footprint, registrations, product tax code/price behavior, and filing ownership.
5. Verify the exact App Store Server Notifications V2 endpoint with current test evidence.
6. Complete recent Stripe test-mode, Apple sandbox/TestFlight, reconciliation, and migration acceptance evidence.
7. Bind the approved billing policy versions to the generated policy digest and protected approval manifest.
8. Resolve the general production-readiness blockers before creating live entitlements.
9. Keep new checkout disabled until the separately authorized activation window.
10. Record both the operational live-billing approval and the user-authorized activation flag at activation time.

Warnings remain for the starter-capacity host profile and incomplete vendor-security review. The Apple Small Business Program status is also not recorded for fee forecasting.

## Required Functional Acceptance Before Submission

### Apple / iOS

- Install the replacement TestFlight build on a physical iPhone and iPad where practical.
- Use an App Store Connect sandbox tester to load both products and complete a purchase.
- Verify pending/cancel handling, restore purchases, current entitlement after relaunch, Manage Subscription, refund/revocation, expiration, notification processing, and server reconciliation.
- Confirm the iOS app never offers Stripe checkout. Apple requires in-app purchase for digital functionality unlocked in the app and requires a restore mechanism. References: [App Review Guidelines 3.1.1](https://developer.apple.com/app-store/review/guidelines/) and [restoring purchased products](https://developer.apple.com/documentation/storekit/restoring-purchased-products).
- Initiate account deletion from inside the app and confirm the flow completes. Reference: [Apple account-deletion requirement](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

### Stripe / web

- Run the guarded Stripe test-mode acceptance harness with checkout disabled.
- Verify monthly and annual Checkout, webhook processing, portal access, cancellation, payment failure/grace, refund, dispute/revocation, reconciliation, and account-deletion cancellation.
- Confirm tax configuration matches the approved tax decision before live checkout is enabled.

### Attorney access

- Create a fresh invitation for a synthetic adult attorney and verify explicit case-sharing/health-data authorization.
- Complete email binding, password or magic-link setup as applicable, and authenticator MFA.
- Verify the attorney sees only the selected case through the read-only projection.
- Verify multi-client switching, report/evidence downloads and warnings, access-event logging, owner revocation, attorney leave, post-revocation denial, relaunch/session restoration, case deletion, and account deletion.
- Confirm no owner edit, billing, invitation, or account-management action is exposed from the attorney-scoped session.

## Controlled Release Order

1. Product owner reviews and revises or approves the launch packet.
2. Apply approved wording and make the legal release states operative.
3. Regenerate and review the exact policy digest; create and verify the protected approval manifest.
4. Build the release image and replacement iOS archive from the reviewed source.
5. Run Stripe test-mode and isolated attorney acceptance against that exact candidate.
6. Upload the replacement TestFlight build and complete physical-device Apple sandbox acceptance.
7. Re-run public readiness until it returns HTTP 200 with no blockers.
8. Confirm separately before activating live checkout or changing production feature flags.
9. Attach the replacement build in App Store Connect and re-run the submission audit.
10. Obtain final confirmation before submitting the four-item review package.

App Store availability was changed from the United States only to all 175 current countries and regions with explicit product-owner authorization. No production application configuration, App Store build, trader profile, release mode, or review submission was changed.
