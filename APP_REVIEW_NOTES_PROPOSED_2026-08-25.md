# Proposed Custody Folio 1.0 App Review Notes

Status: proposed for product-owner review. Do not copy these notes into App Store Connect until the product owner approves them and the review fixtures below are verified.

Keep the existing App Review contact information and all 1,440 characters of the current notes unchanged, including the owner review-account credentials, device-unlock instructions, and authenticator setup information. Append the section below. Do not move credentials or authenticator secrets into this repository.

## Proposed section to append to the current notes

NATIVE SUBSCRIPTION TEST

After signing in as the owner, open Settings > Subscription. This synthetic review account is intentionally in export-only state so both choices are visible. Select “Choose monthly in App Store” or “Choose annual in App Store” and complete Apple’s Sandbox purchase sheet. App Review and TestFlight purchases use Apple Sandbox; they do not create a Stripe charge. Confirm full access, then test “Restore purchases” and “Manage App Store subscription.” The iOS app never presents Stripe Checkout; Stripe is used only for direct web subscriptions.

ATTORNEY READ-ONLY ACCESS

Confidential credentials below include the existing owner identity and a dedicated synthetic adult-attorney identity. As the owner, open Attorney access. The prepared accepted grant can be reviewed immediately. Sign out, open Attorney sign in, and use the attorney credentials/MFA instructions. In Shared With Me, select the synthetic client and matter. The attorney can view the selected case and download reports/evidence, but cannot create, edit, delete, upload, change report inclusion, invite users, access billing, or access owner settings.

To test revocation, sign in as owner, open Attorney access, and select Revoke access; the attorney’s next portal request is denied. To retest onboarding, authorize sharing, enter the dedicated attorney email, select Create invitation, open the one-time private link shown in the app, and sign in as the attorney. Links expire after seven days and become unusable after acceptance.

Attorney access does not establish representation or attorney-client privilege. Revocation stops future access but cannot recall a downloaded copy. All review data is synthetic. Please test permanent account deletion last because it removes these fixtures.

## Required verified fixtures before these notes are used

- The existing owner review account is the only production account authorized to submit Apple Sandbox transactions during review, and that authorization has an expiration.
- The owner review account's app-managed trial is ended so its effective entitlement is export-only before the first StoreKit purchase.
- A dedicated synthetic adult attorney review account exists with password and authenticator instructions stored only in App Store Connect.
- The dedicated attorney account has an accepted, active, read-only grant to the owner's synthetic case.
- Owner and attorney sign-in, MFA, portal access, download warning, revocation, post-revocation denial, and re-invitation are re-tested after fixture creation.
- The App Review Sandbox exception automatically rejects every user ID other than the owner review account and is closed after App Review.

## Production actions that require product-owner approval

1. End the trial only for the synthetic owner review account and verify export-only state. This does not change the 30-day trial feature for any customer.
2. Create the dedicated synthetic attorney review account and accepted read-only grant, then store its confidential credentials and authenticator instructions in App Store Connect.
3. Replace the current App Review notes with the wording above while retaining the existing confidential owner credentials and authenticator section.
4. Enable the expiring, one-account Apple Sandbox exception for the review window. This does not enable Sandbox purchases for any other account and does not alter Stripe's web-checkout state.
