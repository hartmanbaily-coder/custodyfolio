# Custody Folio Billing Launch Checklist

Status: not approved. The committed production template keeps billing disabled. Checkboxes require actual evidence; this file is not itself approval.

## Product and policy

- [ ] Qualified counsel approved the exact Terms, Privacy, subprocessor, subscription disclosure, refund, grace, account-deletion, and billing-retention text.
- [ ] A qualified tax professional reviewed sales-tax/VAT/GST obligations and confirmed registrations. `TAX_VAT_GST_REVIEW_PACKET.md` was prepared on 2026-08-15; independent review is still required. Stripe automatic tax remains off unless active registrations are independently verified.
- [x] Monthly web charge is exactly $5.99 and annual charge is exactly $59.99; annual total and 16.5% savings are displayed. Verified in the live Stripe catalog on 2026-08-14.
- [x] One universal 30-day no-card trial is confirmed in the database entitlement policy and customer copy; Stripe Checkout does not add a provider trial, and both App Store subscription products have no introductory offer. Reverified 2026-08-15.
- [ ] Export-only, attorney access, cancellation, refunds, and Apple-managed billing are acceptance-tested.

## Stripe Dashboard — separate checklist

- [x] One Custody Folio product with separate monthly and annual recurring live Prices. Product `prod_V4da9Q1hyonZpl`; verified 2026-08-14.
- [x] Price currency, amount, interval, and active state match the server allowlist. Monthly `price_1U4UJ7IcPfzDuv3F7wUsUHVZ`; annual `price_1U4UJHIcPfzDuv3F9khkkrfH`.
- [x] Customer Portal permits payment-method changes, invoices, and end-of-period cancellation with feedback; configuration `bpc_1U4UKUIcPfzDuv3FYdyEsKyV`, verified 2026-08-14.
- [x] Dedicated live webhook endpoint `we_1U4VmHIcPfzDuv3FE68An1sM` uses `/api/records/billing/stripe/webhook` and includes the required checkout, subscription, invoice, refund, and dispute events; configured and verified 2026-08-14.
- [x] A dedicated live restricted key is installed with only the product, price, Portal, Checkout Session, customer, subscription, invoice, charge, and refund access required by the server. Product, both Prices, and Portal reads authenticated successfully on 2026-08-14; webhook-read is intentionally not granted or required.
- [x] Stripe access policy `Custody Folio production server` restricts only the Custody Folio live restricted key to production egress IPv4 `87.99.132.119`; dashboard scope and address were reverified 2026-08-14.
- [x] Shared Stripe account legal links now use `https://custodyfolio.com/terms` and `https://custodyfolio.com/privacy`; both account-wide links and the Custody Folio live/test Portal displays were reverified on 2026-08-15. This account-wide change applies to every Slantwire product in the Stripe account.
- [x] Dynamic payment methods remain enabled; no hardcoded `payment_method_types`.
- [x] Automatic tax remains disabled; it must not be enabled unless registrations and the correct tax code/tax behavior are reviewed and configured.
- [x] Test Checkout, Portal, success return state, reconciliation, end-of-period cancellation, entitlement removal, full refund, provider-originated payment failure, and dispute create/close passed end-to-end on 2026-08-15 using dedicated sandbox webhook `we_1U4c1SIcPfzDuv3FJ9EXGEbO`. The dispute-created run exposed an ordering defect that is fixed in deployed release `custodyfolio-stripe-restriction-20260815-0820`. Test dispute `du_1U4kOMIcPfzDuv3F3irdehNz` was then accepted/lost in Dashboard; after a controlled test-only servicing window, the exact signed `charge.dispute.closed` retry returned `200 OK`, event `evt_1U4r0vIcPfzDuv3FukArj31f` was recorded `processed`, the subscription projected `revoked`, and the entitlement returned to `export_only`. Production was immediately restored healthy with billing disabled, checkout false, and the live canary off.

## App Store Connect — separate checklist

- [x] Existing bundle identity `io.lendori.losttofound` is confirmed as the production app identity.
- [x] One Custody Folio subscription group contains `io.custodyfolio.subscription.monthly` and `io.custodyfolio.subscription.annual`; both products are `READY_TO_SUBMIT`, have the correct monthly/annual durations, and are at subscription-group level 1. Reverified through the App Store Connect API on 2026-08-15.
- [x] Localized name, description, price, renewal duration, review screenshot, and required subscription disclosures are complete in App Store Connect; verified 2026-08-14.
- [x] No introductory offer, promotional offer, or offer code creates a second trial.
- [ ] App Store Server Notifications V2 production and sandbox endpoints were tested and the verified date recorded. App Store Connect configuration was reverified on 2026-08-15: both environments use `https://custodyfolio.com/api/records/billing/apple/notifications` and version 2. A fresh controlled test-only window at `2026-08-16T05:46:59Z` kept checkout and the live canary off; Apple accepted the sandbox request, returned the signed payload, and reported `SUCCESS`. The verifier now retries Apple's transient `4040008` status-not-yet-available response instead of misclassifying it as failure. The production request still returns HTTP 401 before Apple accepts it, so production delivery remains unverified. This matches Apple staff guidance that production App Store Server API access remains locked until an app has a production release. The exact prior environment was restored and independently confirmed as `BILLING_MODE=disabled`, checkout false, and live canary false. The API audit still reports app version 1.0.0 as `PREPARE_FOR_SUBMISSION` and both subscriptions as `READY_TO_SUBMIT`.
- [x] A dedicated In-App Purchase server key (`9QT92XYQXZ`) and fingerprint-verified Apple root certificates are installed in the protected production environment. The local recovery copy is outside the repository at `~/Library/Application Support/CustodyFolio/Secrets/SubscriptionKey_9QT92XYQXZ.p8`, with its directory mode `0700` and file mode `0600`, verified 2026-08-14.
- [ ] Copy the Apple IAP key into the encrypted iCloud Drive + Passwords recovery vault documented in `APPLE_IAP_OFF_DEVICE_VAULT.md`, verify same-device and second-device recovery, then explicitly retain or destroy the local recovery copy. The Passwords-backed AES-256-GCM archive and same-device recovery passed on 2026-08-15: the Passwords-retrieved secret decrypted the archive to a mode-`0600` key that matched the protected original byte-for-byte and by SHA-256, after which the clipboard and all temporary secret-bearing files were cleared or removed. The checkbox remains open only for recovery from a second trusted device and the explicit local-copy retention/destruction decision.
- [x] The older non-production IAP key exposed from the ignored local environment was revoked on 2026-08-15. Apple rejected the revoked key with HTTP 401, and its local key ID, issuer ID, and private-key values were scrubbed. `APPLE_IAP_KEY_ROTATION_2026-08-15.md` records the response; the protected production key remains separate and active.
- [ ] StoreKit purchase, pending, cancellation, verified/unverified transaction, restore, current entitlements, manage subscription, grace, retry, refund, revoke, expiration, and reconciliation flows passed. The native iPhone 17 Pro / iOS 26.5 suite was rerun on 2026-08-15 and again passed 15 tests with zero failures and one StoreKit lifecycle test skipped because Xcode 26.6 returned `notEntitled`. The DEBUG-only acceptance harness again loaded both real subscription products and opened Apple's sandbox sign-in from the monthly purchase action. The dedicated United States Sandbox Apple Account credential was supplied from protected Keychain without logging it, and every temporary handoff and clipboard was cleared. Credential-safe logs again showed AuthKit success followed by AppleMediaServices `AMSErrorDomain` authentication failure (`Password reuse not available` / unrecognized authentication failure); iOS did not retain the account. Provider purchase/refund/restore therefore remain unresolved rather than passed.
- [x] App Review notes explain the universal account trial and native StoreKit purchase path. No Stripe purchase UI is presented inside iOS.
- [x] TestFlight build 14 is `VALID` and `IN_BETA_TESTING` in External Beta; the public link and TesterBuddy redirect resolve correctly, with 3 of 10 tester seats in use. The external-distribution API preflight was rerun successfully on 2026-08-15.

## Apple Small Business Program — verification checklist

- [ ] Current eligibility was reviewed against Apple’s current rules by the account owner; Apple requires a declaration of every Associated Developer Account, so this cannot be inferred by the technical reviewer.
- [x] Agreements, Tax, and Banking account state is complete; verified active in App Store Connect on 2026-08-14.
- [x] `not_enrolled` was explicitly recorded on 2026-08-15 in `APPLE_SMALL_BUSINESS_STATUS_2026-08-15.md`; the signed-in Apple Developer page displayed the enrollment form rather than an active enrollment.
- [x] Financial forecasts must use the standard subscription proceeds schedule—70% during the first paid year and 85% after one year, minus applicable taxes—until Apple approves an enrollment. Program approval would allow 85% from day one when Apple's adjusted proceeds take effect.

## Environment and secrets

- [ ] Production readiness has zero blockers; approval manifest digests match the exact reviewed policy/runbook files.
- [x] Billing migration was applied to production Supabase project `cieuilbpnwuvnrxrlczj` as `20260814232024_custody_folio_billing_entitlements`. Forced RLS, revoked browser-role access, service-role-only functions, provider conflict handling, and transactional rollback tests were verified on 2026-08-14. Advisor `rls_enabled_no_policy` notices are intentional for these server-only tables.
- [x] The billing-environment hardening migration was applied to production as migration version `20260815004355`. A transactional production probe verified that the same synthetic test subscription returned `export_only` in `live` and `active` in `test`; rollback left zero synthetic rows.
- [x] `20260815163000_preserve_provider_access_restrictions.sql` was applied to production as migration `20260815164317`. A rollback-only production sequence verified active → stale dispute → grace → newer active preserved grace → lost dispute close → revoked → later active preserved terminal restriction. All synthetic rows were rolled back and cleanup was confirmed on 2026-08-15.
- [x] `20260815170000_index_billing_reconciliation_account.sql` was applied to production as migration `20260815170142`. Supabase’s follow-up advisor reports zero unindexed foreign keys; the new index’s unused status is expected before launch.
- [x] Separate Stripe test/live credentials, webhook secrets, Price IDs, and Portal configuration IDs are installed in the protected production environment. The dedicated test webhook destination and signing secret completed the end-to-end sandbox lifecycle on 2026-08-15.
- [x] Apple App ID, bundle ID, product IDs, API issuer/key/private key, root CAs, and notification URL are present in the protected server environment. The local owner-only IAP-key backup is tracked separately above.
- [x] `BILLING_RETURN_STATE_SECRET`, `BILLING_DELETION_HASH_SECRET`, and `AUTH_SECRET` are separate strong values; server-side boolean-only verification passed on 2026-08-15 without printing the values.
- [x] The current vendor-security and starter-capacity reviews are documented in `VENDOR_SECURITY_REVIEW_2026-08-15.md` and `CAPACITY_REVIEW_2026-08-15.md`. The vendor review supports its readiness flag; the 4 GiB starter-capacity warning intentionally remains until the host is upgraded and retested.
- [ ] Provider, reconciliation, migration, policy-version, notification, and Portal verification dates are current.
- [x] Repository secret scan passed on 2026-08-15, and no live credential or signed provider payload is knowingly present in Git, client JavaScript, the iOS bundle, tickets, or analytics. The ignored local legacy Apple key exposed in tool output was revoked, rejection-tested, and scrubbed on 2026-08-15.

## Automated validation evidence

- [x] Repository unit/integration suite passed 396/396 tests on 2026-08-15, including all billing and security regression tests.
- [x] Chromium product acceptance suite passed 29/29 tests on 2026-08-15.
- [x] WebKit/iOS product acceptance suite passed 29/29 tests on 2026-08-15.
- [x] Native iOS simulator suite passed 15 tests with zero failures and one StoreKit provider acceptance test skipped on iPhone 17 Pro / iOS 26.5 on 2026-08-15. The skip remains represented by the unchecked provider-scenario item above.
- [x] Production build, TypeScript check, 113-key environment-template verification, repository secret scan, and npm production dependency audit passed on 2026-08-15; npm reported zero vulnerabilities.
- [x] Production smoke test passed on 2026-08-15 with only the three expected human-approval blockers: data retention, incident response, and legal review.
- [x] Production synthetic attorney-access verification passed invitation, mailbox-provider handoff, MFA, read-only portal, revocation, post-revocation denial, and cleanup on 2026-08-14. Inbox placement was outside this synthetic test.
- [x] A synthetic privacy-rights deletion workflow rehearsal passed all 14 route/evidence tests and the protected request-evidence verifier on 2026-08-15. It used no customer data and mocked provider boundaries.
- [x] An incident-response tabletop was completed and documented on 2026-08-15 using the real Stripe out-of-order dispute discovery, containment, rollback, repair, and post-deploy verification. Named responder ownership and independent contact-channel tests remain pending.

## Activation

- [ ] The user explicitly authorizes production activation after reviewing this evidence.
- [ ] `LIVE_BILLING_APPROVED=true` is set by the authorized operator.
- [ ] `BILLING_LIVE_ACTIVATION_AUTHORIZED=true` is set for the same monitored release window.
- [ ] `BILLING_MODE=live`, `APPLE_BILLING_ENVIRONMENT=production`, and `BILLING_CHECKOUT_ENABLED=true` are applied together.
- [ ] A synthetic live purchase is performed only if expressly authorized and legally/operationally appropriate; verify entitlement, management, cancellation, export-only, and reconciliation.
- [ ] Monitoring covers provider failures, conflicts, reconciliation, account-deletion billing cancellation, and unusual webhook volume.

## Rollback

- [ ] Set `BILLING_CHECKOUT_ENABLED=false` and restart the application; keep live provider servicing and reconciliation available for existing subscribers.
- [ ] Confirm current product functionality, exports, downloads, deletion, and attorney grants remain available.
- [ ] Do not delete provider subscriptions/resources or roll back the database migration.
- [ ] Reconcile provider state before any later reactivation and obtain renewed explicit approval.
