# Threat Model

## Scope

Custody Folio stores private family-court documentation records for adult users. The highest-risk assets are account access, evidence files, note bodies, payment records, child-related details, generated reports, backups, and staff access pathways.

## Threats and Controls

### Account Takeover

Risk: an attacker gains access to a parent account and reads or exports private records.

Controls: strong auth provider, MFA, rate limiting, generic email content, session management, login notifications, server-side authorization, and audit logs.

### Abusive Partner Attempting Access

Risk: someone with personal knowledge guesses credentials, uses a shared device, or pressures the user for access.

Controls: MFA, session list, logout-all, discreet future PWA option, generic notification content, no public profiles, and clear shared-device warnings.

### Shared-Device Risk

Risk: browser sessions or downloaded reports remain accessible.

Controls: session timeout, explicit logout, export warnings, no sensitive email content, and future local-device privacy guidance.

### Cross-User Data Leakage

Risk: one user can access another user's case, note, evidence, child support, expense, or report data.

Controls: every production query must include authenticated `userId`; case-scoped queries must include `caseId`; tests must prove cross-user isolation.

### Malicious File Upload

Risk: executable or script files are uploaded as evidence.

Controls: server-side allow-list validation, file size limits, MIME and signature checks, malware scanning, private storage, and no direct public paths.

### Evidence Tampering

Risk: evidence originals or metadata are changed without trace.

Controls: preserve original upload, record upload timestamp, add file hashes in a future phase, keep audit logs, and create redacted copies separately.

### Leaked Logs

Risk: sensitive note bodies, court details, payment details, or file names leak through logs.

Controls: minimal metadata summaries only, structured logging review, no sensitive content in error messages, and restricted log access.

### Staff/Admin Overreach

Risk: internal staff browse user evidence or records without need.

Controls: no broad admin evidence viewer in the MVP. Future admin access must use strict RBAC, least privilege, audit logging, and support workflows that avoid casual browsing.

### Insecure Exports

Risk: generated reports or CSV/PDF exports are exposed.

Controls: private export downloads, no anonymous links, generic filenames where possible, explicit user action, audit export events, and secure report storage if server-rendered.

### Stolen Backups

Risk: database or object storage backups expose sensitive records.

Controls: encryption at rest, encrypted backups, least-privilege backup access, retention limits, restoration testing, and incident response.

### DNS or Subdomain Takeover

Risk: stale DNS records for `custodyfolio.com`, the transitional `losttofound.org` fallback, or future subdomains point to an unclaimed host.

Controls: remove stale CNAME/DNS records immediately when changing providers, verify hosting ownership, and monitor DNS.

### Third-Party Vendor Risk

Risk: vendors receive sensitive records or metadata.

Controls: minimize vendors, avoid ad/session replay tooling, review subprocessors, require encryption and deletion support, and avoid sending sensitive details in email.

### AI Privacy Risk for Future Features

Risk: future AI summaries expose selected records to a model provider or generate legal conclusions.

Controls: no AI in MVP. Future AI must use user-selected records only, cite source entries, avoid legal conclusions, avoid court outcome predictions, and include privacy review.

### Payment and Financial Data Sensitivity

Risk: users enter full bank/card data or the app is mistaken for a payment processor.

Controls: documentation-only wording, no payment processing, no bank scraping, no bank login collection, no full account/card/debit-card/SSN storage, and input warnings.
