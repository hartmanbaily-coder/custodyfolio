# Apple IAP Off-Device Recovery Vault

The protected production IAP key must never be committed, attached to a ticket, printed in logs, or copied into the application bundle. Custody Folio uses two Apple-synchronized stores with client-side encryption:

- an AES-256-GCM ciphertext archive in the Account Holder's iCloud Drive; and
- a separate synchronizable Keychain item containing the random 256-bit recovery key.

The helper refuses symbolic-link sources and destination overwrites, writes owner-only files, verifies an immediate decrypt through the Keychain lookup, and prints only the key ID and ciphertext digest.

Important macOS constraint: `kSecAttrSynchronizable` requires an appropriately entitled process. An unsigned `swift` command-line invocation fails safely with `errSecMissingEntitlement` (-34018) before it writes ciphertext. Do not remove the synchronizable attribute and call the result off-device recovery. Apple Passwords is therefore used as the iCloud Passwords & Keychain-backed store for the separate random recovery secret.

## Recovery evidence — August 15, 2026

- Production key ID: `9QT92XYQXZ`.
- Ciphertext: `~/Library/Mobile Documents/com~apple~CloudDocs/CustodyFolio Vault/Apple IAP/SubscriptionKey_9QT92XYQXZ.cfvault`.
- Ciphertext mode and size: `0600`, 285 bytes.
- Ciphertext SHA-256: `543128d5afaf0d17228da2951c867b3f8a3ad09d1fbaafc6ce1b70e5ce36eb6a`.
- Separate recovery secret: saved in Apple Passwords as `Custody Folio Apple IAP recovery`, account `Apple IAP key 9QT92XYQXZ`, website `https://iap-vault.custodyfolio.com`.
- Same-device recovery: passed. The password was copied back from the saved record into a new mode-`0600` temporary file, the archive was decrypted, and the restored key matched the protected original byte-for-byte and by SHA-256.
- Cleanup: passed. Both temporary recovery files and the temporary restored key were removed, and the clipboard was cleared. The original protected `.p8` was not deleted.
- Second-trusted-device recovery: pending. Do not destroy the protected original until this final recovery test passes.

For the Apple Passwords route, stage the encrypted archive and a mode-0600 temporary recovery secret only after Passwords is unlocked:

```bash
swift scripts/apple-iap-vault.swift stage-passwords \
  "$HOME/Library/Application Support/CustodyFolio/Secrets/SubscriptionKey_9QT92XYQXZ.p8" \
  "$HOME/Library/Mobile Documents/com~apple~CloudDocs/CustodyFolio Vault/Apple IAP/SubscriptionKey_9QT92XYQXZ.cfvault" \
  "/private/tmp/custodyfolio-iap-recovery-9QT92XYQXZ.txt" \
  9QT92XYQXZ
```

Create a Passwords entry for website `https://iap-vault.custodyfolio.com`, account `Apple IAP key 9QT92XYQXZ`, and the staged secret as its password. Retrieve that password back into a new temporary mode-0600 file and verify an actual restore:

```bash
swift scripts/apple-iap-vault.swift restore-passwords \
  "$HOME/Library/Mobile Documents/com~apple~CloudDocs/CustodyFolio Vault/Apple IAP/SubscriptionKey_9QT92XYQXZ.cfvault" \
  "/private/tmp/SubscriptionKey_9QT92XYQXZ-restored.p8" \
  "/private/tmp/custodyfolio-iap-recovery-retrieved-9QT92XYQXZ.txt" \
  9QT92XYQXZ
```

Compare the restored key with the protected original, then securely remove both temporary recovery files and the temporary restored key. Do not delete the original production key until recovery is verified from a second trusted device.

Archive:

```bash
swift scripts/apple-iap-vault.swift archive \
  "$HOME/Library/Application Support/CustodyFolio/Secrets/SubscriptionKey_9QT92XYQXZ.p8" \
  "$HOME/Library/Mobile Documents/com~apple~CloudDocs/CustodyFolio Vault/Apple IAP/SubscriptionKey_9QT92XYQXZ.cfvault" \
  9QT92XYQXZ
```

Restore to a new path only:

```bash
swift scripts/apple-iap-vault.swift restore \
  "$HOME/Library/Mobile Documents/com~apple~CloudDocs/CustodyFolio Vault/Apple IAP/SubscriptionKey_9QT92XYQXZ.cfvault" \
  "$HOME/Library/Application Support/CustodyFolio/Secrets/SubscriptionKey_9QT92XYQXZ-restored.p8" \
  9QT92XYQXZ
```

After archiving, confirm iCloud Drive and Passwords & Keychain synchronization are enabled for the Account Holder's Apple Account. A same-device decrypt proves archive integrity and key lookup; a recovery test on another trusted Mac signed in to the same Apple Account is required before the local `.p8` can be destroyed.
