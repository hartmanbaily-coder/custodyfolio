# Custody Folio Billing Acceptance Report — August 15, 2026

Overall result: **not approved for live billing**. Core Stripe billing, provider-originated payment failure, the complete dispute create/close restriction path, the database defense-in-depth migration, Apple sandbox notification delivery, compromised Apple key rotation, and Passwords-backed same-device IAP-key recovery pass. Apple production acceptance, StoreKit provider scenarios, second-trusted-device vault recovery, and external professional approvals remain incomplete. Production is intentionally left with billing disabled and checkout off.

## Completed

### Stripe

- Corrected the Stripe account-wide Terms URL to `https://custodyfolio.com/terms`.
- Corrected the Stripe account-wide Privacy URL to `https://custodyfolio.com/privacy`.
- Created and installed the dedicated sandbox webhook `we_1U4c1SIcPfzDuv3FJ9EXGEbO` with the 14 approved billing lifecycle events.
- Completed a sandbox monthly Checkout using Custody Folio’s authenticated owner flow.
- Verified the success return, subscription entitlement, Customer Portal, end-of-period cancellation, reconciliation, full refund, and post-refund export-only state.
- Verified recorded provider events for checkout, subscription creation/update, paid invoice, refund, and reconciliation.
- Deployed and regression-tested fixes for scheduled cancellation mapping, fully refunded invoice reconciliation, test-mode readiness, billing-provider refresh visibility, and smoke-test blocker classification.
- Completed a provider-originated sandbox payment-failure run and verified the signed `invoice.payment_failed` event was processed.
- Completed a real `charge.dispute.created` run. The webhook arrived after newer subscription events and exposed a restriction-ordering defect; release `custodyfolio-stripe-restriction-20260815-0820` now gives risk-reducing dispute/refund/revocation events monotonic precedence and prevents generic active updates from erasing Stripe grace.
- Reran the dispute-created scenario after deployment and verified the subscription projected `grace_period` correctly. The sandbox account was cleaned up and returned to `export_only` after the run.
- Accepted test dispute `du_1U4kOMIcPfzDuv3F3irdehNz` in Stripe Dashboard on 2026-08-15, intentionally losing/refunding the $5.99 test charge. The first two `charge.dispute.closed` deliveries correctly failed closed with HTTP 503 because the deployment had already returned to `BILLING_MODE=disabled`.
- Opened a controlled test-only servicing window with `BILLING_MODE=test`, checkout disabled, and the live canary disabled; resent the exact signed event; and observed `200 OK` in Stripe Workbench. Production Supabase recorded event `evt_1U4r0vIcPfzDuv3FukArj31f` as `processed`, projected subscription `sub_1U4kOKIcPfzDuv3FaLSG7MXN` as `revoked` with `access_restriction=revoked`, and returned the effective entitlement to `export_only`.
- Immediately restored production to `BILLING_MODE=disabled`, `BILLING_CHECKOUT_ENABLED=false`, and `BILLING_LIVE_CANARY_AUTHORIZED=false`; the application container returned healthy. This completes the provider-originated Stripe payment-failure and dispute create/close lifecycle acceptance.

### Apple

- Apple’s sandbox Request Test Notification API accepted the installed IAP key.
- Apple reported `SUCCESS` for a signed App Store Server Notifications V2 `TEST` delivery to `https://custodyfolio.com/api/records/billing/apple/notifications` on August 15, 2026.
- The app verified the Apple signature and recorded the test notification while billing was in test mode.
- A fresh controlled test-only window at `2026-08-16T05:46:59Z` again produced a signed sandbox payload and Apple-reported `SUCCESS`; checkout and the live canary remained off throughout. The verifier was corrected to retry Apple's transient `4040008` status-not-yet-available response. The window then restored the exact prior environment, removed its backup, restarted the application, and independently confirmed billing disabled, checkout false, live canary false, and healthy production containers.
- The native iPhone 17 Pro / iOS 26.5 test suite passed 15 tests with zero failures and one provider-backed StoreKit acceptance test skipped after Apple’s local StoreKit service rejected the automated purchase host. The test now fails fast instead of hanging and remains a required provider scenario.
- App Store Connect API verification confirmed that production and sandbox server-notification URLs both use the production HTTPS endpoint and Notifications V2. The reusable read-only audit is `npm run audit:apple-billing`.
- The monthly and annual subscriptions are both `READY_TO_SUBMIT`, use the correct durations, and share subscription-group level 1.
- External TestFlight preflight was rerun successfully; build 14 remains valid and in External Beta, the public link is enabled, and 3 of 10 tester seats are in use.
- A signed-in App Store Connect audit confirmed that version 1.0.0 has build 14 attached, three current iPhone screenshots, complete product-page metadata, manual release, a published privacy disclosure, 18+/17+ regional age ratings, the correct notification URLs, and complete review contact/demo-account fields. Draft iOS submission `32e81b32-e449-48bc-a44b-9dfcfebf5ab1` now contains four `READY_FOR_REVIEW` items: app version 1.0.0/build 14, the first subscription group, the annual subscription, and the monthly subscription. The draft has not been submitted to Apple.
- App availability is intentionally unresolved rather than silently broadened: the current configuration shows the United States available and 174 countries or regions unavailable. Expanding distribution requires an owner decision because it changes tax, privacy, and legal scope.
- Created the dedicated United States Sandbox Apple Account `hartman.baily+custodyfolio.sandbox.us.20260815.1@gmail.com` in App Store Connect and stored its generated password in the local encrypted macOS Keychain without logging it.

Apple’s production Request Test Notification API still returns HTTP 401 before accepting a request, while the same installed IAP credentials succeed against sandbox. Production V2 delivery is therefore not verified; this matches Apple staff guidance that production App Store Server API access remains locked until an app has a production release. The fresh API audit shows app version 1.0.0 and all four draft submission items in `READY_FOR_REVIEW`; the parent subscription resources remain `READY_TO_SUBMIT` until submission and review. Nothing has been submitted, approved, or released. The DEBUG acceptance harness again loaded both real products and opened the Apple sandbox sign-in. Credential-safe logs showed AuthKit success followed by AppleMediaServices `AMSErrorDomain` failure (`Password reuse not available` / unrecognized authentication failure), and iOS did not retain the account. The same-run `SKTestSession` lifecycle remained skipped because the iOS 26.5/Xcode 26.6 StoreKit test service returned `notEntitled`. Purchase, restore, cancellation, and refund are therefore not represented as passed.

An older non-production IAP key in the ignored local environment was exposed in local tool output. It was revoked in App Store Connect on 2026-08-15, Apple’s sandbox API then rejected it with HTTP 401, and its local key ID, issuer ID, and private-key values were scrubbed. This is recorded in `APPLE_IAP_KEY_ROTATION_2026-08-15.md`; the protected production key is separate and was not exposed by that event.

### Build and security evidence

- Unit/integration: 396/396 passed.
- Chromium product acceptance: 29/29 passed.
- WebKit/iOS product acceptance: 29/29 passed.
- Native iOS: 15 passed, 0 failed, 1 StoreKit provider test skipped.
- TypeScript: passed.
- ESLint: passed.
- Next.js production build: passed.
- Deployment recovery tests: passed.
- Production environment template: 113 keys verified.
- Repository secret scan: passed.
- npm production dependency audit: zero vulnerabilities.
- Production billing secrets: boolean-only verification confirmed strong values and pairwise separation; no secret values were printed.
- Production Supabase migration `20260815164317` now enforces durable provider restriction precedence, and transactional rollback-only probes verified dispute, refund, revocation, and later-active ordering without leaving synthetic rows.
- Production Supabase migration `20260815170142` indexes reconciliation history by billing account. The post-migration advisor reports zero unindexed foreign keys and no new security finding; remaining notices are informational.
- The exact deployed image passed a fresh isolated production attorney-access verification on 2026-08-15: invitation, mailbox-provider handoff, MFA, read-only portal, revocation, post-revocation denial, and synthetic cleanup all passed. Inbox placement was outside the synthetic test.

## Approval and operational evidence

- Prepared `TAX_VAT_GST_REVIEW_PACKET.md`; independent qualified tax review remains pending.
- Completed a synthetic privacy-rights deletion rehearsal on 2026-08-15: all 14 targeted tests passed and the protected request-evidence verifier reported complete. No customer data was used.
- Completed and documented an incident-response tabletop on 2026-08-15 using the real Stripe event-ordering defect and its containment, rollback, remediation, deployment, and post-fix verification.
- Generated protected digest-bound approval manifest `ops/production-approval-manifest-20260815-post-apple-notification.json` for policy bundle `sha256:e3ce2dde22ab3d3b588665a6cea376145aea6a965abf6726b79376ff15726b0c`.
- The authorized operator approved the exact retention/privacy-operations scope through 2027-08-15 after the verified 2026-08-15 synthetic privacy-rights rehearsal. The retention verifier passes. The approval is operator self-review and is not represented as qualified legal advice.
- The deployment path now validates each explicitly requested approval scope on the trusted deployment Mac, checks the exact bundle digest again on the host, and atomically installs only the matching approval flag. Unknown scopes fail closed. Incident-response and legal approval remain pending because named/tested responders and qualified-counsel evidence do not exist yet.
- The AES-256-GCM archive for production IAP key `9QT92XYQXZ` was created in iCloud Drive with mode `0600`; its separate 256-bit recovery secret was stored in Apple Passwords under the dedicated Custody Folio recovery record. The secret was retrieved back from Passwords into a mode-`0600` temporary file, and an actual decrypt produced a mode-`0600` key that matched the protected original byte-for-byte and by SHA-256. The clipboard and all staged recovery/restored-key files were then cleared or removed. The original remains retained because recovery from a second trusted device has not yet been tested.
- The older exposed non-production Apple key was revoked and locally scrubbed. Encrypted iCloud storage and same-device Passwords recovery for the separate protected production key are complete; second-trusted-device recovery remains pending.
- Apple Small Business Program status is recorded locally as `not_enrolled` in `APPLE_SMALL_BUSINESS_STATUS_2026-08-15.md`; production continues to report the readiness warning until that evidence is deployed.

## Current production state

- Deployed technical/evidence release: `custodyfolio-owner-retention-20260815-2200`.
- `BILLING_MODE=disabled`.
- `BILLING_CHECKOUT_ENABLED=false`.
- `BILLING_LIVE_CANARY_AUTHORIZED=false`.
- `APPLE_BILLING_ENVIRONMENT=production`.
- Installed policy bundle and approval manifest digest: `sha256:e3ce2dde22ab3d3b588665a6cea376145aea6a965abf6726b79376ff15726b0c`. `DATA_RETENTION_POLICY_APPROVED=true`; incident-response and legal flags remain false.
- Application health: healthy; malware, Supabase public-auth settings, security headers, scanner watchdog, and off-site backup timer checks passed.
- Production readiness has only `incident-response-plan` and `legal-review` blockers. Capacity and vendor-security review remain warnings.

## Remaining launch blockers

Production readiness:

1. `incident-response-plan` — a responsible incident owner must approve the exact plan and name/test primary and backup contacts through independent channels. The tabletop is complete.
2. `legal-review` — qualified counsel must approve the exact policy digests.

Live billing readiness additionally blocks on:

1. live billing mode;
2. checkout enablement;
3. zero production-readiness blockers;
4. production App Store Server Notifications V2 verification;
5. recent complete provider/reconciliation acceptance, including StoreKit purchase/restore/refund; Stripe dispute closure is complete;
6. qualified counsel approval of billing policy versions;
7. qualified tax approval;
8. both activation approvals in the same monitored release window.

Apple Small Business Program status is a readiness warning until `enrolled`, `not_enrolled`, or `not_eligible` is verified and recorded.

## Activation decision

The completed technical fix and non-approval evidence may be deployed with billing disabled. Live authorization flags, the live-billing switch, and a real purchase/cancel/refund cannot be performed truthfully until the blockers above are resolved. When they are resolved, rerun approval verification and readiness first; only a zero-blocker report may open the monitored live window.
