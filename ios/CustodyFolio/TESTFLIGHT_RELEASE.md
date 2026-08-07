# Custody Folio TestFlight Release Lane

## The rule

There are two different release paths:

| Change | Release action | TestFlight action |
| --- | --- | --- |
| Records website, Next.js UI, API, or content | Merge and push to `main`, then run the production SSH deployment lane for `custodyfolio.com` | None. Reload the Records tab or relaunch the installed app. |
| SwiftUI shell, native tabs, Face ID, WebView behavior, native assets, or iOS settings | Merge and push to `main`, then run the native release command below | The command automatically uploads the exact build, adds it to `External Beta`, submits it, and verifies its status is `Testing`. |

The native Records tab loads `https://custodyfolio.com/records`. A website release is therefore visible inside the installed TestFlight app without a new iOS binary.

## One-time App Store Connect setup

1. The Account Holder requests App Store Connect API access under **Users and Access > Integrations** and waits for Apple to approve it.
2. An Account Holder or Admin creates an App Store Connect API key with sufficient App Manager access and downloads its `.p8` key exactly once.
3. Copy `.env.testflight.example` to ignored `.env.testflight`, fill in the issuer ID, key ID, and absolute `.p8` path, and never commit either file's secrets or the key.
4. In **Apps > Custody Folio > TestFlight**, create an **Internal Testing** group, add internal testers, and enable **Automatic distribution** for that group.
5. In the TestFlight app on every test device, enable **Automatic Updates** for Custody Folio.
6. Keep the `External Beta` group public link enabled and keep TesterBuddy mapped to that same TestFlight link.

Use internal testing while iterating. Internal automatic distribution does not distribute a new build to public or other external testers. Every new public beta build must be added to `External Beta` and may require Beta App Review.

## Xcode Cloud exception

Automatic distribution applies to builds uploaded from Xcode. Builds created by **Xcode Cloud** must still be added to an internal testing group manually in App Store Connect after their upload status becomes **Complete**. This is why builds can appear in Xcode Cloud and App Store Connect but testers remain on an older build.

For an already complete Cloud build, run:

```bash
npm run ios:testflight:external -- --build-number BUILD_NUMBER
```

This applies the same automated external-distribution gate to that exact existing build.

Use the local `npm run ios:testflight` lane below when automatic internal distribution is the priority. Do not alternate release lanes without checking the TestFlight group assignment.

## Every native release

1. Merge the native change to `main` and push it. Wait for the production validation/deploy workflow to pass.
2. Use a clean checkout that is exactly `origin/main`.
3. Confirm that the Apple account for team `HQG9VJ8JK2` is signed in under **Xcode > Settings > Accounts**.
4. Run:

   ```bash
   npm run ios:testflight
   ```

The command first verifies App Store Connect API authorization, `External Beta` configuration and capacity, and both public links. If any preflight check fails, it stops before creating or uploading an archive.

It then creates a Release archive and uploads it to App Store Connect. The Xcode-supported `manageAppVersionAndBuildNumber` option chooses the next unused build number at upload time. The automation identifies the one Custody Folio build uploaded after this release began; if multiple builds match, it refuses to guess and requires an explicit build number.

After upload, the same command automatically:

- waits for Apple processing to return `VALID`;
- creates or updates the build's English (U.S.) **What to Test** notes;
- enables **Automatically notify testers**;
- assigns the exact build to `External Beta`;
- submits it for Beta App Review;
- waits for the build's external state to become `IN_BETA_TESTING`;
- verifies group membership, public-link status and capacity, the TesterBuddy mapping, and the Custody Folio TestFlight page.

Processing failure, missing compliance, beta rejection, disabled/full/changed links, ambiguous build selection, authorization failure, or timeout all make the command fail. Do not announce the release when it fails.

## Mandatory external public-beta gate

Do not tell testers, TesterBuddy, or the user that a new native build is publicly available until `npm run ios:testflight` exits successfully with:

```text
PUBLIC TESTFLIGHT RELEASE COMPLETE: build BUILD_NUMBER is Testing in External Beta.
```

The current public TestFlight URL is `https://testflight.apple.com/join/rVmv2VAF`. The current TesterBuddy wrapper is `https://testerbuddy.app/join/684809d42ab353d76fc2ad69a7ea70b653a4c0acc38def27`. Both are pinned in the automation and a mismatch fails the release.

An older build may remain `Testing` while the newest upload is only `Complete` or `Ready to Submit`. That state preserves the old beta but does not release the new build. The release is complete only when the exact new build says `Testing` in `External Beta`.

Record these completion facts from the command output in the release handoff:

- Marketing version and build number
- `External Beta` status (`Testing` required)
- Public-link enabled/capacity check
- Tester notification setting
- Beta App Review result or remaining blocker

The **Distribution** tab is only for a public App Store version. Do not create a new App Store version for routine TestFlight iterations. The first public release uses marketing version `1.0.0`; increment it only when preparing a later public App Store version.

## Safe preflight

Before a release, verify the current checkout and Xcode configuration without creating an archive:

```bash
npm run ios:testflight:dry-run
```

The release command rejects dirty or stale checkouts and performs live read-only API, group, capacity, and public-link checks. This prevents archiving a feature branch, an unreleasable build, or a build whose public enrollment path is broken.

## Existing-build repair and audit

Complete external distribution for one already-uploaded build:

```bash
npm run ios:testflight:external -- --build-number 57
```

Audit an already-released build without modifying App Store Connect:

```bash
npm run ios:testflight:verify -- --build-number 57
```

## Required account authority

`xcodebuild` uses the Apple account signed into Xcode for automatic signing and upload. External TestFlight automation uses the App Store Connect API credentials in ignored `.env.testflight`. API access itself requires Account Holder approval from Apple; creating a sufficiently privileged key requires an Account Holder or Admin. Never commit `.env.testflight` or the `.p8` key. For CI, use the provider's encrypted secrets and signing-asset store.
