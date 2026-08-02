# Custody Folio iOS

This folder prepares Custody Folio for the Apple App Store path.

The iOS app is a native SwiftUI shell with:

- Device authentication gate using Face ID, Touch ID, or device passcode.
- Native tab structure for Records, Policies, and Support.
- A controlled `WKWebView` workspace pointed at `https://custodyfolio.com/records`.
- WebKit app-bound domains for `custodyfolio.com` and `www.custodyfolio.com`, with the former `losttofound.org` domains retained temporarily for transition compatibility.
- External link handling that opens non-product links outside the workspace.
- Native privacy/support summaries that mirror the public policy pages and expose account deletion support.
- App icon assets generated from the Custody Folio book, records, graph, and gavel logo.

## Local Setup

1. Open `ios/LostToFound/LostToFound.xcodeproj` in Xcode.
2. Select the `LostToFound` target.
3. Set your Apple Developer Team under Signing & Capabilities.
4. Confirm the bundle identifier. The placeholder is `io.lendori.losttofound`.
5. Build and run on a physical iPhone before TestFlight because the app uses device authentication.

## App Store Path

1. Enroll in the Apple Developer Program.
2. Create the app record in App Store Connect.
3. Configure signing, bundle identifier, app category, privacy details, age rating, and export compliance.
4. Archive from Xcode and upload to App Store Connect.
5. Use internal TestFlight while iterating. For any public/external beta, follow the mandatory `External Beta` completion gate in `TESTFLIGHT_RELEASE.md`; upload completion alone does not release a new build to external testers.
6. Submit for App Review after privacy/legal copy and screenshots are final.

Before App Review, create a dedicated synthetic review account and make sure the review notes explain device unlock, login/MFA, native policy/support tabs, and the Support tab self-service deletion path at `https://custodyfolio.com/account/delete`, including the signed-in "Permanently delete my account" control.

## Native Value

Apple may reject a plain web wrapper under minimum-functionality review. This project is intentionally not just a website shortcut: it adds native app structure, device-level privacy lock, native policy/support surfaces, app icons, and App Store-ready metadata. Future native features that would strengthen review include native document import, local deadline reminders, push notifications, and native PDF/share workflows.

Complete the real-device session, deletion, revocation, and export checks in `PRODUCTION_READINESS_VERIFICATION.md` before a public App Store release.
