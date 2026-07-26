# Custody Folio TestFlight Release Lane

## The rule

There are two different release paths:

| Change | Release action | TestFlight action |
| --- | --- | --- |
| Records website, Next.js UI, API, or content | Merge and push to `main`, then run the production SSH deployment lane for `custodyfolio.com` | None. Reload the Records tab or relaunch the installed app. |
| SwiftUI shell, native tabs, Face ID, WebView behavior, native assets, or iOS settings | Merge and push to `main`, then run the native release command below | A new build is uploaded and becomes available once Apple processing completes. |

The native Records tab loads `https://custodyfolio.com/records`. A website release is therefore visible inside the installed TestFlight app without a new iOS binary.

## One-time App Store Connect setup

1. In **Apps > Custody Folio > TestFlight**, create an **Internal Testing** group, such as `Core Testers`.
2. Add the internal App Store Connect users who should receive builds.
3. Enable **Automatic distribution** for that group.
4. In the TestFlight app on every test device, enable **Automatic Updates** for Custody Folio.

Use internal testing while iterating. External testers require a separate external group and may require Beta App Review.

## Xcode Cloud exception

Automatic distribution applies to builds uploaded from Xcode. Builds created by **Xcode Cloud** must still be added to an internal testing group manually in App Store Connect after their upload status becomes **Complete**. This is why builds can appear in Xcode Cloud and App Store Connect but testers remain on an older build.

For an already complete Cloud build: open **Apps > Custody Folio > TestFlight > iOS**, select the build, then add it to `Core Testers` and enter the **What to Test** notes. Do this now for build `12` after confirming that it is Complete and has no missing compliance prompt.

Use the local `npm run ios:testflight` lane below when automatic internal distribution is the priority. Do not alternate release lanes without checking the TestFlight group assignment.

## Every native release

1. Merge the native change to `main` and push it. Wait for the production validation/deploy workflow to pass.
2. Use a clean checkout that is exactly `origin/main`.
3. Confirm that the Apple account for team `HQG9VJ8JK2` is signed in under **Xcode > Settings > Accounts**.
4. Run:

   ```bash
   npm run ios:testflight
   ```

The command creates a Release archive and uploads it to App Store Connect. It uses the Xcode-supported `manageAppVersionAndBuildNumber` option, which chooses the next unused build number at upload time. The project’s configured build is synchronized to the latest known Cloud build (`12`); do not manually edit `CURRENT_PROJECT_VERSION` before every TestFlight build.

After the upload, open **Apps > Custody Folio > TestFlight > iOS > Build Uploads**:

- **Processing**: wait for Apple. Nothing else to do.
- **Complete**: the build is ready; the automatic internal group distributes it.
- **Failed**: open the status for the exact error. A failed build number can be reused after the error is fixed.
- **Missing Compliance**: complete the encryption/export-compliance prompt for that build.

The **Distribution** tab is only for a public App Store version. Do not create a new App Store version for routine TestFlight iterations. Keep the marketing version at `0.1.0` while testing that release and change it only when preparing a new public App Store version.

## Safe preflight

Before a release, verify the current checkout and Xcode configuration without creating an archive:

```bash
npm run ios:testflight:dry-run
```

The release command rejects dirty or stale checkouts. This prevents archiving a feature branch or a build number that has not reached production.

## Required account authority

The project deliberately does not contain Apple credentials. `xcodebuild` uses the Apple account signed into Xcode for automatic signing and upload. If this is later moved to GitHub Actions or Xcode Cloud, configure App Store Connect API credentials and signing assets in the provider’s encrypted secrets; never commit the `.p8` key.
