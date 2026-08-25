# Custody Folio Agent Instructions

These instructions apply to the entire repository.

## TestFlight releases must finish automatically

A native TestFlight release is **not complete** when Xcode finishes uploading or when App Store Connect shows the upload as `Complete` or the build as `Ready to Submit`. Use `npm run ios:testflight`; do not stop after its Xcode upload phase or substitute an upload-only command.

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

The release command must automate steps 2–7 through the App Store Connect API. It performs an authenticated API and public-link preflight **before** archiving, identifies the one build uploaded during that release, refuses to guess if multiple builds match, and exits successfully only after that exact build reaches `IN_BETA_TESTING`. For an existing upload, run `npm run ios:testflight:external -- --build-number NUMBER`; to audit an existing build without changing it, run `npm run ios:testflight:verify -- --build-number NUMBER`.

App Store Connect API credentials belong only in the ignored `.env.testflight` file and an external `.p8` key path. If credentials or API authorization are missing, do not upload a new build and do not silently fall back to manual completion.

Do not print, copy into documentation, or commit App Store Connect credentials, review-account passwords, API private keys, or other secrets.

## Bounded audit and scan policy

For liability, legal, privacy, accessibility, compliance, or security-review work:

- Use one targeted, read-only pass over relevant tracked source, configuration, and documentation.
- Exclude dependency, build, cache, generated, upload, and vendor directories unless a specific finding requires one of them.
- A liability-coverage pass is not authorization to start a Codex Security deep scan, attack-path analysis, background job, subagent, or multi-agent run.
- Start a security scan only when the current user explicitly requests that scan. Before any deep or potentially credit-intensive scan, state its scope and obtain the user's explicit approval.
- Do not automatically continue, resume, or replace a failed, interrupted, or timed-out scan.
- Poll an asynchronous tool at most three times. If its status is unchanged after three checks or ten minutes, whichever comes first, stop polling and return the available partial result with the unresolved limitation.
- Retry a failed tool call at most once, and only when the failure is clearly transient. Never restart an entire audit as a retry.
- End a standard liability or review pass after 15 minutes of agent runtime. Report completed evidence and remaining work instead of extending the run.
- Do not repeat equivalent progress messages while waiting. One initial update and one timeout/failure update are sufficient.
- Do not spawn subagents for these reviews unless the current user explicitly requests delegation.

Success for a bounded review means a concise evidence-backed risk list, affected files or pages,
safe corrections completed within scope, and clearly identified unresolved items. It does not require
an exhaustive security scan.
