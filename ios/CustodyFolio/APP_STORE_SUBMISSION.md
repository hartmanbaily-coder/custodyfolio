# App Store Submission Packet

This packet describes the intended submission. Evidence checkboxes and external App Store Connect declarations must be completed before submission.

## App Identity

- App name: Custody Folio
- Display name: Custody Folio
- Bundle ID: `io.lendori.losttofound`
- Version: `1.0.0`
- Build: 16; uploaded, externally testing, and attached to version 1.0.0 on August 24, 2026
- Minimum iOS version: `17.0`
- Supported devices: iPhone and iPad
- Signing team: `HQG9VJ8JK2`
- SKU suggestion: `custodyfolio-ios`
- Primary category: Productivity
- Secondary category: Utilities
- Content rights: owned by the developer
- Support URL: `https://custodyfolio.com/contact`
- Privacy Policy URL: `https://custodyfolio.com/privacy`
- Terms URL: `https://custodyfolio.com/terms`

## Subtitle

Parenting Records & Reports

## Promotional Text Draft

Remove the emotion. Track the data. Organize custody events, parenting time, expenses, notes, and evidence in one private workspace.

## Description Draft

Custody Folio helps adult users privately organize custody records and supporting evidence.

Track dated notes, parenting-time exchanges, virtual contact, expenses, files, calendar items, and clear reports from one place. The app is built for factual organization and personal recordkeeping. It helps users maintain cleaner records for personal review or attorney conversations.

Key features:

- Private records workspace for custody and parenting plan documentation
- Timeline, calendar, notes, and file organization
- Document upload support through the protected workspace
- Report and export workflows for review
- Client-authorized, MFA-protected, read-only attorney access with revocation
- One 30-day no-card account trial, followed by optional monthly or annual auto-renewing access purchased through Apple in the iOS app
- Device level unlock with Face ID, Touch ID, or passcode
- Controlled records web view limited to Custody Folio-owned domains
- Privacy, security, and AI data use notices available in app

Important boundaries:

- Custody Folio does not provide legal advice.
- Custody Folio is not a law firm and does not create an attorney client relationship.
- Users are responsible for verifying records against original source material.
- The app is for adult users only and is not directed to children.
- The app is not an emergency service, law enforcement tool, supervised exchange tool, or coparent messaging system.

## Keywords Draft

coparenting,parenting time,evidence,incident log,expenses,calendar,attorney,family court,records

## Review Notes Draft

Custody Folio is a private records organizer for adult users documenting custody and parenting plan information. It is not a legal advice app, law firm, emergency service, child facing app, social network, payment processor, or coparent messaging platform.

The app uses a native SwiftUI shell with a device-authentication gate, native tab navigation, native privacy/support surfaces, and a controlled `WKWebView` workspace. The web view uses only `custodyfolio.com` and `www.custodyfolio.com` as app-bound domains; external web links and `mailto:` links open outside the records workspace.

Review flow:

1. Launch the app.
2. Unlock with the review device's Face ID, Touch ID, or passcode. The app uses Apple's LocalAuthentication framework and does not receive or store biometric data.
3. Open the Records tab and sign in with the review account below.
4. Review the Policies tab for native privacy, terms, security, AI data use, subprocessors, accessibility, and contact links.
5. Review the Support tab for support contact, account/data help, and the in-app self-service account deletion entry point. The deletion entry point opens `https://custodyfolio.com/account/delete`, where a signed-in records user can permanently delete the account after explicit confirmation.
6. Open Subscription while the review account is in export-only mode. Monthly and annual products are loaded from StoreKit and Apple's sheet shows localized price and renewal terms. Purchase, restore, refund request, and subscription management use Apple interfaces; no Stripe checkout is offered inside iOS.
7. Open Attorney Access. The client selects one case, identifies the adult attorney, separately authorizes sharing including any health-related information in that case, and creates a single-use invitation. The accepted grant is read-only and can be revoked by the client.

The dedicated review account credentials are stored only in App Store Connect and must never be committed here. Before submission, verify that the saved account uses synthetic data, is export-only so the StoreKit purchase controls are visible, and includes workable MFA instructions.

Account deletion path for review: Support tab -> Account and Data -> Delete account -> `https://custodyfolio.com/account/delete`. The direct deletion page lets a signed-in records user confirm the irreversible consequences and press "Permanently delete my account." The server removes private evidence files, revokes sessions, deletes the Auth account and cascaded active records, and reports completion without an approval queue. The public Privacy Policy also documents backup aging and legally required retention.

Current native build snapshot:

- Product: `CustodyFolio.app`
- Bundle ID: `io.lendori.losttofound`
- Version/build: `1.0.0` (16); build 16 includes the privacy-manifest correction and secure attorney/owner session-scope restoration
- Deployment target: iOS 17.0
- Records URL: `https://custodyfolio.com/records`
- Account deletion URL: `https://custodyfolio.com/account/delete`
- Web navigation allowlist: `custodyfolio.com` and `www.custodyfolio.com`
- Scene privacy behavior: app returns to locked state when it leaves the active scene
- Automated verification: the corrected native source built and ran 16 simulator tests on 2026-08-23; 15 passed, zero failed, and the StoreKit provider lifecycle test was skipped because Apple's simulator service returned `notEntitled`. A signed uploaded release-candidate binary still requires provider-backed purchase and restore verification.

Do not submit to App Review until the production backend is ready for review access, including auth email delivery, auth redirect URLs, leaked-password protection, monitoring, backup/restore evidence, adopted retention/deletion decisions, zero readiness blockers, and verified Apple purchase/restore behavior.

## App Privacy Labels Draft

Use App Store Connect's current privacy questionnaire. Based on the current product, expect to disclose at least:

- Contact Info: email address for account/support.
- Identifiers: user ID or account identifier.
- Purchases: subscription product, status, renewal dates, and signed provider transaction identifiers used to grant access and prevent fraud.
- User Content: notes, files, documents, message exports, calendar/timeline records, reports.
- Sensitive Info: custody, court, child-related, family, financial, or health-adjacent records may be entered by the user.
- Diagnostics: security events, logs, rate-limit events, and reliability diagnostics if collected.

Expected use purposes:

- App functionality
- Account management
- Security and fraud prevention
- Customer support
- Analytics/diagnostics only if explicitly enabled and documented

Expected tracking answer:

- No advertising tracking.
- No third-party advertising trackers.
- No selling custody records, evidence files, or account data.

Native authentication note:

- Face ID, Touch ID, and passcode checks are performed on device through LocalAuthentication.
- The app should not claim to collect biometric data unless another feature or vendor actually collects it.
- Keep App Store Connect privacy answers aligned with the live web workspace, support tooling, logging/monitoring, and malware scanning vendors.

Review the final privacy labels against the live implementation before submission.

## Age Rating Recommendation

Start with a conservative 17+ posture because users may store sensitive custody, family-court, financial, or child-related records, even though the app is adult-only and does not target children. Complete Apple's age-rating questionnaire based on final features.

## Export Compliance

The app uses standard HTTPS/TLS and account security. Complete Apple's encryption/export compliance questions in App Store Connect based on the final binary and counsel/account guidance.

## Screenshot Plan

Prepared final screenshots for the required iPhone 6.5" and iPad 13" display classes:

- `app-store-screenshots/final-01-home-1284x2778.jpg`
- `app-store-screenshots/final-02-timeline-1284x2778.jpg`
- `app-store-screenshots/final-03-attorney-access-1284x2778.jpg`
- `app-store-screenshots/final-ipad-01-home-2064x2752.jpg`
- `app-store-screenshots/final-ipad-02-timeline-2064x2752.jpg`
- `app-store-screenshots/final-ipad-03-attorney-access-2064x2752.jpg`

The screenshots use synthetic Apple Review data and cover:

1. Home/workspace overview with synthetic data only.
2. Timeline with synthetic records.
3. Permanent attorney access with client-controlled revocation.

Do not use real custody, child, court, message, phone, address, or evidence data in screenshots.

## Pre-Submission Checklist

- Apple Developer account active.
- Bundle ID created and assigned to the app.
- Signing team set in Xcode.
- App icon renders well at small sizes.
- TestFlight build installed on a real iPhone.
- App Review test account created with synthetic data.
- App Review notes include review-device unlock instructions and login/MFA instructions.
- Self-service account deletion tested in the native Support tab and at `https://custodyfolio.com/account/delete`.
- Privacy Policy, Terms, Security, AI Data Use, Accessibility, and Contact pages live.
- No production secrets committed.
- No real user data in screenshots or demo account.
- Native app tested for login, MFA/recovery path, file upload, report export, and support links.
- Apple monthly/annual purchase, cancellation, restore, pending, refund/revoke, and entitlement reconciliation tested with the release candidate.
- Attorney invitation, separate sharing authorization, MFA acceptance, read-only access, download warning, revocation, and post-revocation denial tested with synthetic data.
- Operator has adopted the exact versioned Terms, Privacy, consumer-health sharing consent, retention, tax, and incident-response decisions; any unresolved legal uncertainty remains disclosed rather than represented as compliance.

## Apple References

- App Review Guidelines: `https://developer.apple.com/app-store/review/guidelines/`
- Apple Developer Program: `https://developer.apple.com/programs/`
- App Store Connect Help: `https://developer.apple.com/help/app-store-connect/`
- TestFlight overview: `https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/`
- App privacy details: `https://developer.apple.com/help/app-store-connect/manage-app-privacy/`
