# Incident-Response Exercise — Provider Event Ordering

Exercise date: August 15, 2026

Exercise type: Operator-directed technical tabletop with a live Stripe sandbox containment and recovery drill

Production customer impact: None. Billing remained disabled and checkout remained off. All provider transactions were Stripe test-mode objects.

## Scenario

A provider-originated `charge.dispute.created` event arrived after ordinary subscription events but carried a provider timestamp one second earlier. The database recorded the signed dispute event but its stale-event guard did not project the restriction, which could have left an otherwise active subscription entitled during an open dispute.

## Detection and Triage

- The checkout-disabled Stripe acceptance runner required the dispute to project `grace_period`.
- The assertion timed out even though the signed provider-event ledger recorded `charge.dispute.created` as processed.
- Event and subscription projections were inspected without reading payment credentials or customer record contents.
- The event sequence showed `charge.dispute.created` at `16:08:14Z` followed by provider timestamps at `16:08:15Z`, while the dispute webhook was received last.
- The issue was classified as billing-authorization integrity, not a confidentiality incident. No live purchase or production customer data was involved.

## Containment

- Every temporary test window kept `BILLING_CHECKOUT_ENABLED=false`.
- A rollback trap restored `BILLING_MODE=disabled` after success or failure.
- Temporary test subscriptions and payment methods were canceled or detached.
- The test entitlement was refreshed and returned to `export_only`.
- Live billing was not authorized or enabled.

## Remediation and Recovery

- The Stripe event application path now gives risk-reducing dispute, refund, and revocation events precedence when provider timestamps arrive out of order.
- Ordinary subscription updates cannot erase an existing Stripe grace or terminal refund/revocation projection; an explicit paid or dispute-closed event is required to clear applicable grace.
- A follow-up SQL migration records provider subscription IDs and durable access restrictions for transaction-level enforcement.
- Regression coverage was added for out-of-order dispute creation, grace preservation, paid recovery, and terminal refund preservation.
- The complete local gate passed again after the database and StoreKit acceptance work: 396 unit/integration tests, TypeScript, ESLint, and a production build.
- Release `custodyfolio-stripe-restriction-20260815-0820` deployed successfully with billing disabled. Production health, malware scanning, Supabase public-auth configuration, and security headers passed.
- A repeat Stripe sandbox run confirmed that the same real `charge.dispute.created` event now projected `grace_period` before cleanup.
- Migration `20260815164317` was later applied to production. A rollback-only production probe exercised dispute, refund, revocation, and later-active ordering and confirmed that no synthetic rows remained.

## Communications and Notification Decision

This was a pre-launch sandbox exercise with no production customer impact, data exposure, live charge, or required external notification. A real incident with customer impact would require the incident commander and qualified legal/privacy reviewer to assess user, regulator, processor, insurer, and law-enforcement notices under the incident runbook.

## Open Gaps

- Required primary and independent backup contacts are not yet named and tested for every incident role.
- Qualified legal/privacy review remains pending.
- Stripe test-key permissions do not include Payment Disputes Read/Write, so the provider-side lost-dispute closure could not be automated. Dispute creation and Custody Folio grace projection passed.
- The exercise therefore supports the tabletop date only. It does not approve the incident-response plan or satisfy contact-validation gates.

## Evidence

- `scripts/run-stripe-sandbox-acceptance.mjs`
- `tests/billing-policy.test.ts`
- `tests/release-security-regressions.test.ts`
- `supabase/migrations/20260815163000_preserve_provider_access_restrictions.sql`
- Release: `custodyfolio-stripe-restriction-20260815-0820`
- Verified privacy-rights rehearsal: `ops/privacy-rights-requests/synthetic-deletion-rehearsal-20260815.json`
