# Apple IAP Key Rotation Record — August 15, 2026

Status: **revocation verified; encrypted off-device recovery for the protected production key remains pending**.

## Scope

- An older, non-production In-App Purchase server key was stored in the ignored local `.env.local` file.
- Its private-key material was exposed in local tool output during a diagnostic command. The private key must therefore be treated as compromised even though it is not tracked by Git.
- A sandbox Request Test Notification authenticated successfully with this key before rotation on 2026-08-15, confirming that Apple still accepted it at discovery time.
- The affected key is separate from the protected production key identified in the billing launch checklist. Do not revoke the protected production key as part of this rotation.

## Required response

1. [x] In App Store Connect, revoke the older non-production IAP key.
2. [x] Confirm that requests signed with the revoked key fail.
3. [x] Remove the affected key ID, issuer ID, and private-key value from `.env.local`.
4. [ ] If local sandbox automation still needs its own key, generate a replacement only after revocation and store it in an approved encrypted off-device vault. Keep only an owner-restricted working copy on the development machine.
5. [x] Record the revocation time, operator, replacement decision, and recovery test below.

## Evidence to complete

- Revoked at: `2026-08-15` (App Store Connect recorded date)
- Revoked by: `Baily Hartman`, through the authenticated App Store Connect account and an explicitly approved Codex browser action
- Revocation verified at: `2026-08-15T21:32:45Z`; Apple sandbox authentication returned HTTP 401
- Replacement created: `No`; the separate protected production key remains active and local sandbox credentials are intentionally blank
- Encrypted off-device vault location: `PENDING`
- Recovery test completed at: revoked-key rejection passed `2026-08-15T21:32:45Z`; protected production-key vault recovery remains pending

The compromised key is revoked and locally scrubbed. The protected production key is not considered safely archived until its encrypted off-device vault location and recovery test are recorded. Do not paste any private key into this record.
