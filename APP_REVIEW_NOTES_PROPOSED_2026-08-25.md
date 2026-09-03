# Proposed Custody Folio 1.0 App Review Notes

Status: approved authentication model; use only after the two synthetic review identities, fixed review codes, subscription state, and attorney grant are verified in production. Store the email addresses and six-digit codes only in App Store Connect, never in this repository.

## Review notes

Custody Folio is a private factual records organizer for adults. It is not a law firm, legal-advice service, emergency service, social network, payment processor, or coparent messaging system. All data in the review accounts is synthetic.

DEVICE UNLOCK

Launch the app and unlock it using the review device's Face ID, Touch ID, or device passcode. This check uses Apple's LocalAuthentication framework. Custody Folio does not receive or store biometric data.

OWNER SIGN-IN

Open Records. Enter the owner review email shown in Sign-In Information, confirm adult use and the Terms/Privacy acknowledgement, then select “I already have a code.” Enter the temporary six-digit owner review code stored in App Store Connect. Normal customers receive a single-use six-digit code by email; the fixed review code is limited to the exact synthetic owner account, expires automatically, is rate-limited, and will be removed after review. No authenticator app is required.

NATIVE SUBSCRIPTION TEST

After signing in as the owner, open Settings > Subscription. This synthetic review account is intentionally in export-only state so both choices are visible. Select “Choose monthly in App Store” or “Choose annual in App Store” and complete Apple's Sandbox purchase sheet. App Review and TestFlight purchases use Apple Sandbox and do not create a Stripe charge. Confirm full access, then test Restore Purchases and Manage App Store Subscription. The iOS app never presents Stripe Checkout; Stripe is used only for direct web subscriptions.

ATTORNEY READ-ONLY ACCESS

The owner review account has a prepared active grant to the separate synthetic attorney identity. Sign out, open Attorney sign in, enter the attorney review email included below these notes, confirm adult use and the Terms/Privacy acknowledgement, select “I already have a code,” and enter the separate six-digit attorney review code. The attorney review exception is limited to that exact synthetic attorney account and expires with the owner review exception.

In Shared With Me, select the synthetic client and matter. The attorney can view the selected case and download authorized reports/evidence, but cannot create, edit, delete, upload, change report inclusion, invite users, access billing, or access owner settings.

To test revocation, sign back in as the owner, open Attorney Access, and select Revoke access. The attorney's next portal request is denied. To retest onboarding, authorize sharing, enter the dedicated attorney email, create the invitation, open its single-use private link, and verify the exact attorney mailbox using its email code. Invitation links expire after seven days and cannot be reused after acceptance.

Attorney Access does not establish representation or attorney-client privilege. Revocation stops future access but cannot recall a downloaded copy. Test permanent account deletion last because it removes the synthetic fixtures.

## Required verified fixtures before submission

- The owner and attorney review emails and their separate six-digit codes are stored only in App Store Connect.
- Both fixed-code exceptions are limited to exact Supabase user IDs, stored server-side only as SHA-256 digests, share an expiration no more than 45 days away, and are closed after review.
- Only the owner review identity is authorized for Apple Sandbox purchases.
- The owner review account is export-only before the first StoreKit purchase, so monthly and annual purchase controls are visible.
- The attorney review identity has an accepted, active, read-only grant to the owner's synthetic case.
- Owner sign-in, attorney sign-in, purchase, restore, portal access, download warning, revocation, post-revocation denial, and re-invitation are re-tested after the production deployment.
