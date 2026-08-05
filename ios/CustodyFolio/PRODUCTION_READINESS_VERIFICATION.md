# Native iOS Production Readiness Verification

The native code now mitigates the locally fixable findings from the production-readiness review:

- Export files use complete iOS file protection.
- The `CustodyFolioExports` temporary directory is purged at app launch and when the app enters the background.
- Export files are removed when sharing finishes or when the share sheet cannot be presented.
- A web logout or rejected server session tells the native shell to clear its WebKit session cookies and Keychain cookie backup immediately.
- The app synchronizes WebKit cookie state before background locking.
- Self-service account deletion opens inside the app's shared, app-bound WebKit session instead of switching to a separate browser cookie context.
- Native unit tests cover cookie allow-listing and expiration, export limits and filename sanitization, navigation isolation, and export-file cleanup.

These safeguards reduce stale-session and temporary-file risk. They do not replace backend revocation or real-device verification.

## Automated verification status

On 2026-07-22, Xcode 26.6 discovered and ran the shared `CustodyFolio` test plan on an iPhone 17 Pro simulator. All 6 `NativeSecurityPolicyTests` passed with 0 failures. The shared scheme references `CustodyFolio.xctestplan`, so Product > Test and command-line test runs use the same test target instead of relying on Xcode's automatically generated test list.

Re-run with an available iPhone simulator before each public release:

```bash
xcodebuild test \
  -project ios/CustodyFolio/CustodyFolio.xcodeproj \
  -scheme CustodyFolio \
  -testPlan CustodyFolio \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO
```

## Required real-device TestFlight checks

Use a synthetic production test account. Record the build number, device model, iOS version, test time, and result for every case.

### Logout

1. Sign in and confirm the Records workspace loads.
2. Sign out from the Records workspace.
3. Force quit the app.
4. Relaunch and unlock it.
5. Confirm the sign-in screen appears and records cannot be opened.

### Account deletion

1. Sign in and open **Support > Account and Data > Delete account**.
2. Confirm the deletion page recognizes the signed-in account inside the app.
3. Check the irreversible-deletion confirmation and press **Permanently delete my account** for a synthetic account.
4. Confirm the page reports that deletion completed and the app invalidates its saved session.
5. Force quit and relaunch the app.
6. Confirm the deleted account cannot access records and its previous credentials cannot create a valid session.
7. Confirm the synthetic account's active database rows and evidence-storage prefix no longer exist.

### Remote invalidation

Run each case while the iPhone app still has a saved session, then force quit and relaunch:

- Change the account password from another device.
- Revoke the session server-side.
- Let the refresh token expire.

Expected result: the app shows sign-in and no Keychain-backed cookie restores records access.

### Export cleanup

1. Export a CSV, JSON, PDF, and representative evidence file.
2. Complete and cancel the share sheet in separate attempts.
3. Start another export, background the app, then relaunch it.
4. Confirm each export can be shared normally and no previous export is offered or reused after relaunch.

## Release decision

- **TestFlight:** proceed after the automated build and tests pass.
- **Public App Store release:** proceed only after every real-device session/deletion check above passes and App Store Connect privacy answers are reconciled with the live backend and vendors.
