# Custody Folio Agent Instructions

These instructions apply to the entire repository.

## TestFlight releases are two-phase releases

A native TestFlight release is **not complete** when Xcode finishes uploading or when App Store Connect shows the upload as `Complete` or the build as `Ready to Submit`.

Whenever a user asks to upload, release, publish, or update the iOS TestFlight build, Codex must complete and verify both phases:

1. Archive and upload the native build.
2. Wait for App Store Connect to finish processing it.
3. Add that exact build to the `External Beta` external-testing group.
4. Enter the build's **What to Test** notes and leave **Automatically notify testers** enabled unless the user explicitly asks otherwise.
5. Submit the build for Beta App Review or start testing, depending on the action App Store Connect offers.
6. Verify that the exact new build shows `Testing` inside `External Beta`.
7. Verify that the public link remains enabled and has capacity before telling the user or TesterBuddy that the build is publicly available.

Internal testing, upload status `Complete`, and build status `Ready to Submit` do not satisfy the external-testing release gate. An older externally approved build can remain available while a newer upload is not yet assigned to the external group.

The TestFlight public link targets the external group rather than a specific build. The current public link is `https://testflight.apple.com/join/rVmv2VAF`, and the TesterBuddy enrollment page is expected to resolve to that URL. Re-verify both if the public link is ever disabled, recreated, or changed.

Never claim a TestFlight release is finished without observing the exact new build in `External Beta` with status `Testing`. If authentication, processing, review, or user approval prevents that verification, report the release as incomplete and state the remaining gate.

Do not print, copy into documentation, or commit App Store Connect credentials, review-account passwords, API private keys, or other secrets.
