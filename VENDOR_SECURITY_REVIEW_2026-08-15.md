# Custody Folio Vendor Security Review — 2026-08-15

Status: technically approved for the current production and prelaunch billing scope. This is an operational security review, not legal, tax, privacy-law, or regulatory advice. Material provider, data-flow, region, contract, or security-control changes require a new review.

Reviewer: Slantwire Studios operator with Codex-assisted evidence collection.

## Scope and decision

The review covers the providers named by the deployed readiness gate and the public subprocessor notice: Supabase, Hetzner, Backblaze, Cloudflare, Resend, Apple iCloud Mail, Have I Been Pwned, Stripe, Apple, GitHub monitoring, and the self-hosted ClamAV scanner.

Decision: the vendors and controls are acceptable for the current limited launch scope, with the residual actions below tracked as operational work. This decision supports `VENDOR_SECURITY_REVIEW_APPROVED=true`; it does not authorize billing and does not satisfy the separate counsel, tax, retention, or incident-response approvals.

## Evidence reviewed

| Provider/control | Data and role | Current evidence and deployed control | Decision |
| --- | --- | --- | --- |
| Supabase | Authentication, Postgres records, and private evidence storage | Supabase states that its hosted product is SOC 2 Type II audited and documents a shared-responsibility boundary. The production project has forced RLS/service-role-only billing tables, a private evidence bucket, MFA/AAL2 enforcement, current Auth hardening evidence, a recent two-user isolation test, and a verified restore drill. On 2026-08-15 the database was 14 MB with 8 Auth users, 7 storage objects, and 12 of 60 connections in use. Security advisors reported only informational `rls_enabled_no_policy` notices on intentionally server-only tables; no warning or error severity finding was reported. | Accept. Continue monthly advisor review and re-check the Auth connection strategy before a compute upgrade. |
| Hetzner | Dedicated application host | Hetzner documents information-security controls and makes audit evidence available to customers with a DPA. The deployed host uses key-only SSH, a non-root operator, rootless containers, UFW/fail2ban/unattended updates, read-only application containers, dropped Linux capabilities, bounded memory/CPU/PIDs, and local log rotation. | Accept. Retain the DPA and current audit evidence in the business compliance file when obtained. |
| Backblaze B2 | Encrypted, immutable off-site evidence backups | Backblaze documents TLS, AES-256 server-side encryption, Object Lock/WORM, access controls, monitoring, and independent testing. The production readiness gate reports immutable off-site backup enabled, and the 2026-08-10 isolated restore evidence remains verifier-valid. Backup credentials are kept outside the app environment. | Accept. Keep object names free of sensitive labels, rotate the scoped application key before expiry, and repeat restore verification at least every 180 days. |
| Cloudflare | DNS, Tunnel, WAF, rate limiting, and edge security events | Cloudflare publishes ISO 27001/27018/27701 and SOC 2 Type II coverage and an incident-notification security exhibit. Production uses a token-file tunnel, no public origin port, current edge-control verification, and a monitored security-event sink. | Accept. Review account membership, MFA, WAF rules, and audit events quarterly. |
| Resend | Supabase Auth transactional email | Resend publishes SOC 2 Type II, TLS 1.3+, encryption at rest, 30-day point-in-time backups, annual penetration testing, MFA, and vulnerability-remediation targets. Custody-record contents are excluded from messages. | Accept. Keep the API key scoped to transactional email and review message templates for data minimization. |
| Apple iCloud Mail | Support, privacy, and security mailboxes | Used only for inbound/outbound business mailbox content; Cloudflare manages the domain's MX/SPF/DKIM records. The published security contact is live. | Accept with operational limitation: preserve a tested independent incident-contact channel because one mailbox provider is not sufficient for incident command. |
| Have I Been Pwned | Compromised-password range check | The app sends only the first five SHA-1 hash characters through the range API; it does not send the password, email, full hash, or records. | Accept. Keep the request fail-safe and do not add identifying query data or logs. |
| ClamAV / Cisco Talos signatures | Self-hosted malware scanner for evidence uploads | ClamAV documents signed signature databases and `freshclam` updates. The deployed scanner was healthy on 2026-08-15 and reported ClamAV 1.5.3 with database 28093 dated 2026-08-15. Uploads fail closed, are bounded to 25 MB, and clean/EICAR verification is part of deployment. | Accept as one control, not a guarantee that files are safe. Alert on stale signatures or unhealthy scanner state and keep the engine on a supported branch. |
| Stripe | Hosted web checkout, subscriptions, invoices, refunds, disputes, and Portal when enabled | Stripe is PCI Level 1 and publishes annual SOC 1/SOC 2 controls. Custody Folio uses hosted Checkout/Portal, restricted live keys, a dedicated signed webhook, an egress-IP access policy, minimized provider identifiers, and no card-number handling. Billing remains disabled. | Accept for the implemented scope. Complete the remaining sandbox dispute-close test and tax/counsel gates before activation. |
| Apple App Store / StoreKit | iOS purchases, subscription status, refunds, and server notifications when approved | Apple manages payment data and signs StoreKit/App Store Server payloads. Custody Folio validates signed payloads against pinned Apple roots, uses a dedicated IAP key, separates sandbox/live state, and presents no Stripe purchase path inside iOS. Billing remains disabled. | Accept for the implemented scope. Complete sandbox purchase/restore/refund coverage, production Notifications V2 verification, first-subscription submission, and protected off-device key recovery before activation. |
| GitHub | Source control, CI, dependency/security validation, and scheduled live-monitor workflow | Production deployment is deliberately not triggered by GitHub Actions, and production SSH/provider secrets are kept off GitHub. CI performs tests, secret scanning, dependency audit, and production-template checks; scheduled monitoring creates/updates a `live-monitor` issue. | Accept as a secondary monitoring and validation channel, not the sole incident channel. Enforce MFA and review repository access quarterly. |

## Current platform-change review

The Supabase changelog was reviewed on 2026-08-15. Relevant items are addressed as follows:

- Supabase client libraries dropped Node.js 20 support on 2026-06-30; Custody Folio builds and runs on Node.js 22.
- The Management API `logs.all` endpoint is removed on 2026-09-23; no Custody Folio script currently depends on it. Recheck external monitoring before that date.
- New public-schema tables will no longer be exposed automatically to the Data API for all projects on 2026-10-30. Future migrations must explicitly verify required API exposure and grants.
- Supabase connection logging may be off by default. Custody Folio's application audit events and recurring review remain required regardless of platform connection-log defaults.

## Residual actions and review cadence

- Obtain and retain current provider contracts, DPAs, and restricted audit reports where the provider makes them available.
- Test the named primary and independent backup incident contacts; this remains part of the separate incident-response approval.
- Review vendor access, advisories, incidents, subprocessor changes, and security evidence quarterly and after any material provider or data-flow change.
- Keep legal, tax, retention, incident-response, billing activation, and Apple/Stripe acceptance gates separate. None is approved by this document.

## Primary references

- Supabase: [SOC 2 compliance](https://supabase.com/docs/guides/security/soc-2-compliance), [shared responsibility](https://supabase.com/docs/guides/deployment/shared-responsibility-model), [changelog](https://supabase.com/changelog.md)
- Hetzner: [information security](https://docs.hetzner.com/general/company-and-policy/information-security-at-hetzner/), [DPA](https://www.hetzner.com/AV/DPA_en.pdf)
- Backblaze: [B2 security](https://www.backblaze.com/cloud-storage/security), [DPA controls](https://www.backblaze.com/company/policy/dpa-for-eea-eu-residents)
- Cloudflare: [Trust Hub](https://www.cloudflare.com/trust-hub/), [security exhibit](https://www.cloudflare.com/security-exhibit/)
- Resend: [security](https://resend.com/docs/security)
- Stripe: [integration security](https://docs.stripe.com/security/guide), [security program](https://docs.stripe.com/security)
- Apple: [developer security](https://developer.apple.com/security/), [App Store privacy](https://www.apple.com/legal/privacy/data/en/appstore/)
- ClamAV: [signature management](https://docs.clamav.net/manual/Usage/SignatureManagement.html), [versions](https://docs.clamav.net/appendix/FunctionalityLevels.html)
