# Custody Folio Billing Operations Runbook

Status: Stripe web activation runbook. Billing remains disabled until the readiness checks and explicit activation flags pass. This runbook does not authorize deployment or external provider changes.

## Safety rules

- Keep `BILLING_MODE=disabled` and `BILLING_CHECKOUT_ENABLED=false` in production until every launch gate is evidenced and the user explicitly approves activation.
- After the first real subscription exists, do not use `BILLING_MODE=disabled` as a routine rollback: that mode intentionally bypasses billing enforcement and provider servicing. Pause only checkout unless the incident plan explicitly addresses active subscribers.
- Never disable record viewing, exports, evidence downloads, deletion, billing management, or attorney revocation during a provider incident.
- Never paste provider secrets, signed Apple payloads, customer payment information, case data, or evidence names into tickets or logs.
- Treat the internal billing account UUID—not email or provider metadata—as the authoritative cross-system identity.
- Do not manually edit entitlement rows. Apply verified provider events or reconcile provider state.

## Stripe webhook failure or replay

1. Disable new checkout with `BILLING_CHECKOUT_ENABLED=false`. Keep the active provider mode and credentials available so webhooks, reconciliation, management, and account-deletion cancellation continue safely.
2. Confirm signature failures, response status, and request IDs without recording raw payloads or secrets.
3. Restore endpoint/key configuration, then replay only signed events from Stripe Workbench in test mode first.
4. Event IDs are deduplicated. A replay must not create a second subscription row or extend access twice.
5. Run the authenticated Stripe reconciliation endpoint for affected synthetic/test accounts and compare the resulting status with Stripe.

## Apple notification failure

1. Invalid JWS receives a non-retryable 400. Temporary database or processing failures receive 500 with `Retry-After` so Apple can retry.
2. Review App Store Server Notification history without copying signed payloads into general logs.
3. Correct the endpoint or trust configuration, request provider retry where available, then reconcile the affected original transaction through the App Store Server API.
4. Confirm notification UUID deduplication and out-of-order protection.

## Key rotation

- Stripe: create a new least-privilege restricted key, test required API calls, switch the secret-manager reference, verify logs, then revoke the old key. Rotate the webhook signing secret through an overlap period if Stripe supports it.
- Apple: create a new App Store Server API key, update the server-only secret, test reconciliation, then revoke the old key in App Store Connect.
- Custody Folio: rotate return-state and deletion-hash secrets independently. Retain a previous pseudonym secret only as long as the documented retention purpose requires; never reuse `AUTH_SECRET`.

## Duplicate provider subscriptions

1. Stop new checkout for the account; do not delete provider records.
2. Reconcile Stripe and Apple independently and confirm provider customer/original-transaction ownership.
3. Preserve the paid period most favorable to the customer while support determines which subscription the customer wants to keep.
4. Cancel/refund only through the managing provider with customer confirmation and documented authorization.
5. The database prevents simultaneous current provider relationships; a provider conflict must generate a privacy-safe audit event.

## Refunds, disputes, chargebacks, revocations

- Full refunds and Apple revocations end the provider entitlement; partial refunds do not automatically revoke a paid period.
- A Stripe dispute temporarily enters the configured grace path. A lost dispute may revoke provider entitlement.
- Export-only access remains available after entitlement loss.
- Apple controls App Store refund decisions; Stripe-managed web refunds are handled through Stripe under the reviewed policy.

## Support boundaries

- Support may use account email solely to locate the billing account and provider-management source.
- Staff must not open custody records or evidence to answer billing questions.
- Ask for provider invoice/transaction identifiers only when necessary. Do not request card numbers, court records, or screenshots containing private case data.

## Account deletion with billing

- Stripe: list the mapped customer’s subscriptions and cancel every state that could still bill. If cancellation or verification fails, stop before deleting customer data.
- Apple: Apple billing cannot be cancelled by Custody Folio. Explain that it may continue, provide native subscription management, and still allow immediate account deletion.
- After sessions and evidence are removed, replace the billing user link with a keyed pseudonymous hash and remove trial and effective-entitlement records before deleting Auth identity.

## Provider outage behavior

- Use the bounded stored-entitlement tolerance only when the last verified state is recent and not expired.
- When safe verification exceeds the tolerance, switch affected owners to export-only—not lockout.
- Attorneys retain client-granted read-only access and are never paywalled.

## Test-to-live activation

Follow `BILLING_LAUNCH_CHECKLIST.md`. Run production readiness and billing readiness with secret presence reported only as pass/fail. Activate during a monitored window by setting `BILLING_MODE=live` and `BILLING_CHECKOUT_ENABLED=true` only after both `LIVE_BILLING_APPROVED=true` and `BILLING_LIVE_ACTIVATION_AUTHORIZED=true` are explicitly authorized.

## Rollback

1. Set `BILLING_CHECKOUT_ENABLED=false` and restart the app. This stops new Stripe Checkout and removes standard StoreKit purchase actions while retaining Portal/subscription management, verified provider events, reconciliation, account-deletion cancellation, entitlements, and exports.
2. Do not delete provider resources, subscriptions, customers, database migrations, or billing records during rollback.
3. Keep provider webhooks reachable. If an exceptional security incident requires disabling provider processing, obtain an incident decision, record the gap, and reconcile before reactivation.
4. Investigate, test in Stripe test mode, rerun readiness, and obtain a new explicit activation approval. Apple sandbox/StoreKit testing is required only before `APPLE_PURCHASE_ENABLED=true`.
