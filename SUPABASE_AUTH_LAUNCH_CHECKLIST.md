# Supabase Auth Launch Checklist

Production project: `cieuilbpnwuvnrxrlczj` (`losttofound-records-production`)

This checklist covers dashboard-controlled Supabase Auth settings that cannot be changed through the app repository. Do not mark the matching readiness variables complete until the setting is live and the verification step passes.

## Current Policy

Custody Folio uses passwordless email codes for owner and attorney accounts. It does not require a password or authenticator app. The production flags must reflect the product owner's separately approved signup and Attorney Access launch state:

- `RECORDS_AUTH_METHOD=email_otp`
- `SUPABASE_EMAIL_OTP_ENABLED=true`
- `SUPABASE_EMAIL_OTP_LENGTH=6`
- `SUPABASE_EMAIL_OTP_EXPIRY_SECONDS=600`
- `RECORDS_ENFORCE_MFA=false`
- `SUPABASE_MFA_POLICY=optional`

The public and server signup flags must match each other. When public owner signup is disabled, Supabase direct signup must also be disabled. Attorney creation remains gated by an exact, pending, case-specific invitation. A copied invitation cannot be accepted using a different email address.

## Dashboard Settings

Open Supabase Dashboard for project `cieuilbpnwuvnrxrlczj`.

1. Auth signups
   - Go to Authentication settings for Email auth.
   - Match Supabase direct signup to `RECORDS_SIGNUPS_ENABLED` and `NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED`.
   - Keep email confirmations required.
   - Keep anonymous sign-ins disabled.
   - Keep phone auth disabled unless a separate phone-auth review is completed.
   - Verify with:
     ```bash
     NEXT_PUBLIC_SUPABASE_URL=https://cieuilbpnwuvnrxrlczj.supabase.co \
     NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_RKkpBRXSYI9XIGHjd39nvQ_fMvePdti \
     RECORDS_SIGNUPS_ENABLED=false \
     NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED=false \
     ATTORNEY_GUEST_FEATURE_ENABLED=false \
     npm run verify:supabase-auth
     ```

2. Email-code template and custom SMTP
   - Go to Authentication > Emails > SMTP Settings.
   - Configure a production sender on the `custodyfolio.com` domain or an approved transactional email domain.
   - Current production fallback is `support@lendori.io` because `lendori.io` is the verified Resend domain on the free account and Resend flags `no-reply` senders as a deliverability risk. Migrate to `support@custodyfolio.com` only after `custodyfolio.com` is added and verified in Resend.
   - Keep `_dmarc.lendori.io` published as `v=DMARC1; p=none;` while monitoring delivery, then tighten the policy only after all legitimate senders are confirmed aligned.
   - Set **Sender name** exactly to `Custody Folio`; do not use the retired `My Custody Case` name.
   - Disable provider link tracking for auth links if the provider offers it.
   - In the Magic Link template, display `{{ .Token }}` as the six-digit Custody Folio sign-in code. Do not use `{{ .ConfirmationURL }}` for the normal owner or attorney sign-in flow.
   - Set the email-code expiry to `600` seconds.
   - Send and receive a code using a synthetic owner and a synthetic invited attorney.
   - Confirm each received email displays `Custody Folio` as the sender name, contains a six-digit code, and contains no case, child, court, health, or evidence information.
   - After any sender or template change, inspect a new message in Resend. Treat `delivered` only as recipient-server acceptance; resolve every deliverability warning and verify the message appears in the actual destination mailbox before closing the issue.
   - For a missing code, verify all three layers before changing app code: a successful OTP request in Supabase Auth logs, `delivered` or a specific failure in Resend Emails, and the recipient's junk/spam mailbox. A successful Supabase response only confirms provider handoff; it does not prove inbox placement.
   - After verification, set Listhaus repo variable `LOSTTOFOUND_SUPABASE_CUSTOM_SMTP_ENABLED=true`.

3. Redirect URLs
   - Go to Authentication > URL Configuration.
   - Set Site URL to `https://custodyfolio.com`.
   - Allow exact production redirects used by the app:
     - `https://custodyfolio.com/records`
     - `https://custodyfolio.com/attorney`
     - `https://custodyfolio.com/attorney/accept`
   - Remove redirect URLs for retired or repurposed domains before making those domains available to another product.
   - Avoid broad production wildcards.
   - Verify owner email-code onboarding and attorney invitation acceptance with synthetic accounts.
   - After verification, set Listhaus repo variable `LOSTTOFOUND_SUPABASE_AUTH_REDIRECTS_VERIFIED_AT=YYYY-MM-DD`.

4. Passwordless and session security
   - Confirm the customer UI and production API do not offer password signup, password reset, password update, or mandatory TOTP enrollment.
   - Confirm code request and verification routes use generic responses and both edge and app-level rate limits.
   - Confirm a code cannot be reused after successful verification and fails after ten minutes.
   - Confirm native session restoration still requires Face ID, Touch ID, or the device passcode on iOS.
   - After verification, set `LOSTTOFOUND_SUPABASE_AUTH_HARDENING_VERIFIED_AT=YYYY-MM-DD`.

5. Advisors
   - Run/review Supabase Security Advisor.
   - Confirm no production-blocking records findings remain.
   - Do not treat unused-index INFO notices as launch blockers until real workload traffic exists.

## Required Before Marking Auth Ready

- `npm run verify:supabase-auth` passes.
- Synthetic owner signup/sign-in sends and verifies a six-digit code when enabled.
- Synthetic attorney onboarding verifies the exact invited mailbox by six-digit code and auto-accepts only the pending invitation.
- Invalid, expired, reused, and rate-limited code paths are verified without revealing whether the account exists.
- The temporary Apple Review code is restricted to the exact synthetic owner user ID, stored only as a SHA-256 digest on the server, expires within 45 days, and is removed after review.
- `SUPABASE_AUTH_HARDENING_VERIFIED_AT` is set only after dashboard settings and advisors are checked.

## Sources

Supabase passwordless email documentation requires the Magic Link template to use `{{ .Token }}` when a one-time code is desired. Supabase production guidance recommends custom SMTP, short OTP expiry, rate limiting, production URL configuration, and dashboard advisor review.
