# Custody Folio Pre-Release QA Checklist

Use synthetic users, cases, records, files, and payment references only. Do not deploy, migrate production data, upload a build, or change App Store Connect while running this checklist.

Allowed result labels: `PASS`, `FIXED`, `FAIL`, `BLOCKED`, `MANUAL`, `NOT APPLICABLE`.

## 1. Scope and repository safety

- [ ] Confirm the public product name is **Custody Folio** and the production domain is `custodyfolio.com`.
- [ ] Record branch, revision, and working-tree state; preserve unrelated changes.
- [ ] Read applicable `AGENTS.md`, security guidance, deployment documentation, migrations, and iOS release notes.
- [ ] Confirm the environment is local, demo, test, or explicitly safe staging before creating data.
- [ ] Confirm no credentials, saved auth state, generated evidence, screenshots, exports, or personal data will be committed.
- [ ] Result: `__________`

## 2. Automated code gates

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:unit`
- [ ] `npm run test:e2e`
- [ ] `npm run build`
- [ ] `npm run security:secrets`
- [ ] `npm run security:audit`
- [ ] `npm run verify:env-template`
- [ ] `npm run test:deploy`
- [ ] Run `npm run verify:headers` against a production-mode local build.
- [ ] Run database schema/migration unit validation.
- [ ] Result: `__________`

## 3. Web workspace functional pass

For every supported record type: create, locate in source and derived views, reload, edit, recheck derived views, delete, and confirm removal without disturbing unrelated records.

- [ ] Dashboard: totals, date/case filters, issue definitions, charts, recent activity, empty/single/large states.
- [ ] Calendar: navigation, assignments, presets, exceptions, exchanges, colors, dates, boundaries, reload, delete, export.
- [ ] Import: every visible intake path, validation, review queue, editable drafts, approval, cancel, and derived views.
- [ ] Timeline: single/combined filters, ordering, source navigation, edit/delete rules, reload, empty/large states.
- [ ] Exchanges: standing rules, actual logs, statuses, early/late logic, witnesses, tags, charts, calendar/timeline, export.
- [ ] Notes: all categories and optional fields, quick issues, filtering, Unicode/long/HTML-like text, report inclusion, CRUD.
- [ ] Files: allowlist/signatures/limits, private upload/download, metadata, review status, related views, delete, filename safety.
- [ ] Screenshot PDFs: select, preview, reorder, remove, cover, page layout/order/numbers, download/share/save/reload/delete, limits.
- [ ] Child Support: orders/payments, dependencies, frequencies, statuses, decimal totals, trends, calendar/timeline, export.
- [ ] Expenses: categories, payer, reimbursement states, decimal totals, filters, derived views, export, CSV formula safety.
- [ ] Reports: every visible report/export, inclusion rules, totals, order, empty/single/large outputs, long content, disclaimers.
- [ ] Attorney Access: invite, resend, accept, AAL2, exact-case read-only access, report/evidence access, revoke, expiration/replay.
- [ ] Settings: case/matter fields, timezone, labels, storage, audit summary, data export, sessions, logout, deletion flows.
- [ ] Result: `__________`

## 4. Shared interaction and responsive pass

- [ ] Navigation, selected case, date range, browser back/forward, reload, loading/empty/success/error states.
- [ ] Unsaved forms, repeated saves, duplicate submissions, slow/failing requests, session expiry, and multiple tabs.
- [ ] Verify no stale data after create, edit, delete, case change, or date-range change.
- [ ] Check 375×812, 390×844, 844×390, 768×1024, and 1440×900.
- [ ] Confirm no document-level horizontal scroll, hidden controls, clipped dialogs, or unusable mobile tables.
- [ ] Check labels, accessible names, keyboard focus, visible focus, status/error announcements, non-color status cues, and chart summaries.
- [ ] Result: `__________`

## 5. Authentication, privacy, and authorization

- [ ] Signup gate, adult confirmation, email confirmation, login, generic failure messages, minimum password, leaked-password guard.
- [ ] Password recovery is bound to a verified recovery method, same user, and same session; ordinary sessions are rejected.
- [ ] TOTP enrollment and verification enforce product-profile approval; AAL2 is derived from validated session state.
- [ ] Password update requires verified recovery/recent-auth proof and confirms global session revocation.
- [ ] State-changing routes enforce origin/CSRF policy; authentication and write limits remain enabled.
- [ ] Use two synthetic users and two cases to test cross-user/cross-case reads, edits, deletes, and evidence downloads.
- [ ] Verify private files expose no public/raw Storage URLs, hashes, tokens, internal paths, or sensitive log/audit contents.
- [ ] Verify service-worker caching excludes `/records`, `/attorney`, `/account`, `/api`, auth responses, files, and reports.
- [ ] Verify CSP and security headers against the production-mode build.
- [ ] Result: `__________`

## 6. Production operational gates

- [ ] `npm run check:production` passes with the intended production secret source.
- [ ] `RECORDS_APP_BASE_URL=https://custodyfolio.com npm run check:live` returns ready.
- [ ] `npm run verify:edge-controls`
- [ ] `npm run verify:malware`
- [ ] `npm run verify:supabase-auth`
- [ ] `npm run verify:security-events`
- [ ] `npm run verify:backup-restore`
- [ ] `npm run verify:isolation` with two disposable users and cases.
- [ ] Validate pending Supabase migrations in safe staging before applying them to production.
- [ ] Confirm monitoring/alerting, SMTP, retention/deletion approval, incident response, vendor review, and backup evidence.
- [ ] Result: `__________`

## 7. Native automated gates

- [ ] Run the shared `LostToFound` Xcode test plan on an installed iPhone simulator.
- [ ] Verify navigation allowlist, cookie filtering/removal, export size/name controls, protected export cleanup, and privacy manifest.
- [ ] If any native metadata, Swift, assets, entitlements, or iOS settings changed, create a Release archive.
- [ ] Inspect the archive display name, version, build, bundle ID, icon, privacy manifest, and minimum deployment target.
- [ ] Result: `__________`

## 8. Physical iPhone script

- [ ] Fresh install; verify launch branding and no private-content flash.
- [ ] Login in Records; background and foreground; test successful, failed, and cancelled Face ID/Touch ID/passcode.
- [ ] Force quit and relaunch; verify approved session restoration and device unlock.
- [ ] Test Records, Policies, and Support tabs, text size, rotation, keyboard, poor network, and offline states.
- [ ] Open allowed product links; verify external HTTPS opens outside and unsupported schemes are blocked.
- [ ] Download/share small and boundary-size exports; verify sanitized names and protected temporary-file cleanup.
- [ ] Logout; verify every native tab/WebView and Keychain/WebKit session is cleared with no cached private records.
- [ ] Submit account deletion in the synthetic account; verify native session clearing and remote-session rejection.
- [ ] Result: `__________`

## 9. App Store Connect and policy review

- [ ] Confirm App Store name/display name **Custody Folio**, version/build, bundle ID, signing team, category, age rating, and SKU.
- [ ] Confirm privacy-policy, support, terms, and account-deletion URLs return 200.
- [ ] Complete privacy labels from actual collection/use; reconcile them with `PrivacyInfo.xcprivacy`.
- [ ] Review required-reason APIs, encryption/export compliance, permissions, screenshots, description, keywords, and review notes.
- [ ] Create a dedicated synthetic reviewer account and document MFA/device-unlock instructions without committing credentials.
- [ ] Confirm subscriptions/paid claims match the build and metadata promises no unavailable functionality.
- [ ] Obtain qualified privacy/legal review; do not represent draft review as approval.
- [ ] If native code or metadata changed, upload a new build and complete TestFlight/internal-device testing before submission.
- [ ] Result: `__________`

## 10. Deployment and migration handoff

- [ ] Review the final diff and rerun all affected focused tests.
- [ ] Merge through the normal review path; do not deploy a dirty or stale checkout.
- [ ] Apply database migrations only after safe-staging validation, backup confirmation, and an approved rollback plan.
- [ ] Deploy the web/API release through the documented rootless production lane; verify health, readiness, rollback, headers, and edge controls.
- [ ] Run post-deploy synthetic login/recovery/MFA, owner-only write, private download, and attorney-revoke smoke tests.
- [ ] Record release revision, migration versions, verification timestamps, operational approvals, and remaining manual tasks.
- [ ] Result: `__________`

## Latest completed pass — 2026-07-21

| Area | Result | Evidence |
| --- | --- | --- |
| Code, unit, browser, build, audit, secrets, headers, edge, deployment recovery | `PASS` | 174 unit tests, 12 Playwright tests, production build, zero audit vulnerabilities |
| Responsive notes/files and calendar accessibility | `FIXED` | Long-label regression and blank-calendar-cell accessibility assertions pass |
| Recovery, MFA approval, AAL/recent-auth, global revocation, login CSRF, attorney revoke quota | `FIXED` | Focused route/security regressions and full unit suite pass |
| Public branding and native display metadata | `FIXED` | Web/PWA/iOS metadata now uses Custody Folio; domain and technical identifiers retained |
| Native simulator test plan and unsigned Release archive | `PASS` | 6 native tests; archive version 0.1.0 build 12 contains privacy manifest |
| Production monitoring, backup restore, retention, incident response, legal approval | `BLOCKED` | Live readiness reports five blockers |
| Live two-user/case isolation rerun from this workstation | `BLOCKED` | Safe disposable credentials and explicit production/staging environment were unavailable |
| Physical iPhone behavior | `MANUAL` | Requires an actual device and biometric/passcode interaction |
| App Store Connect metadata, privacy labels, signing/upload/submission | `MANUAL` | Requires authenticated Apple access; no upload or submission was performed |
