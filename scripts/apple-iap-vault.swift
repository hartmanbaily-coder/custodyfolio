import CryptoKit
import Foundation
import Security

enum VaultFailure: Error, CustomStringConvertible {
    case usage
    case invalidSource(String)
    case destinationExists(String)
    case keychain(OSStatus)
    case missingKey
    case verificationFailed

    var description: String {
        switch self {
        case .usage:
            return "Usage: swift scripts/apple-iap-vault.swift archive <source.p8> <encrypted-output> <key-id> | restore <encrypted-input> <restored-output.p8> <key-id> | stage-passwords <source.p8> <encrypted-output> <recovery-output> <key-id> | restore-passwords <encrypted-input> <restored-output.p8> <recovery-input> <key-id>"
        case .invalidSource(let path):
            return "Source is missing, empty, or a symbolic link: \(path)"
        case .destinationExists(let path):
            return "Refusing to overwrite existing destination: \(path)"
        case .keychain(let status):
            return "Synchronizable Keychain operation failed with status \(status)."
        case .missingKey:
            return "The synchronizable recovery key is not available in Keychain."
        case .verificationFailed:
            return "Encrypted recovery verification failed."
        }
    }
}

func serviceName(keyID: String) -> String {
    "com.custodyfolio.apple-iap-vault.\(keyID)"
}

func requireRegularNonemptyFile(_ path: String) throws -> Data {
    let url = URL(fileURLWithPath: path)
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
    guard values.isRegularFile == true,
          values.isSymbolicLink != true,
          (values.fileSize ?? 0) > 0 else {
        throw VaultFailure.invalidSource(path)
    }
    return try Data(contentsOf: url, options: [.mappedIfSafe])
}

func requireNewDestination(_ path: String) throws {
    if FileManager.default.fileExists(atPath: path) {
        throw VaultFailure.destinationExists(path)
    }
}

func keychainQuery(keyID: String) -> [String: Any] {
    [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: serviceName(keyID: keyID),
        kSecAttrAccount as String: "Slantwire Studios, LLC",
    ]
}

func addSynchronizableKey(_ keyData: Data, keyID: String) throws {
    var query = keychainQuery(keyID: keyID)
    query[kSecAttrLabel as String] = "Custody Folio Apple IAP recovery key \(keyID)"
    query[kSecAttrSynchronizable as String] = kCFBooleanTrue
    query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    query[kSecValueData as String] = keyData

    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else { throw VaultFailure.keychain(status) }
}

func removeSynchronizableKey(keyID: String) {
    var query = keychainQuery(keyID: keyID)
    query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
    SecItemDelete(query as CFDictionary)
}

func loadSynchronizableKey(keyID: String) throws -> Data {
    var query = keychainQuery(keyID: keyID)
    query[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
    query[kSecReturnData as String] = kCFBooleanTrue
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { throw VaultFailure.missingKey }
    guard status == errSecSuccess, let keyData = result as? Data else {
        throw VaultFailure.keychain(status)
    }
    return keyData
}

func writeProtected(_ data: Data, to path: String) throws {
    let destination = URL(fileURLWithPath: path)
    try FileManager.default.createDirectory(
        at: destination.deletingLastPathComponent(),
        withIntermediateDirectories: true,
        attributes: [.posixPermissions: 0o700]
    )
    try data.write(to: destination, options: [.atomic])
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path)
}

func encryptedArchive(_ plaintext: Data, using key: SymmetricKey) throws -> Data {
    let sealed = try AES.GCM.seal(plaintext, using: key)
    guard let combined = sealed.combined else { throw VaultFailure.verificationFailed }
    return combined
}

func verifyArchive(_ combined: Data, plaintext: Data, using key: SymmetricKey) throws {
    let verified = try AES.GCM.open(AES.GCM.SealedBox(combined: combined), using: key)
    guard verified == plaintext else { throw VaultFailure.verificationFailed }
}

func archive(source: String, destination: String, keyID: String) throws {
    try requireNewDestination(destination)
    let plaintext = try requireRegularNonemptyFile(source)
    let key = SymmetricKey(size: .bits256)
    let combined = try encryptedArchive(plaintext, using: key)
    let keyData = key.withUnsafeBytes { Data($0) }

    try addSynchronizableKey(keyData, keyID: keyID)
    do {
        try writeProtected(combined, to: destination)
        let recoveredKeyData = try loadSynchronizableKey(keyID: keyID)
        let recoveredKey = SymmetricKey(data: recoveredKeyData)
        try verifyArchive(combined, plaintext: plaintext, using: recoveredKey)
    } catch {
        try? FileManager.default.removeItem(atPath: destination)
        removeSynchronizableKey(keyID: keyID)
        throw error
    }

    let digest = SHA256.hash(data: combined).map { String(format: "%02x", $0) }.joined()
    print("Encrypted Apple IAP recovery archive created and locally restore-verified.")
    print("Key ID: \(keyID)")
    print("Ciphertext SHA-256: \(digest)")
    print("Recovery key: synchronizable macOS Keychain item \(serviceName(keyID: keyID))")
}

func stageForPasswords(
    source: String,
    destination: String,
    recoveryDestination: String,
    keyID: String
) throws {
    try requireNewDestination(destination)
    try requireNewDestination(recoveryDestination)
    let plaintext = try requireRegularNonemptyFile(source)
    let key = SymmetricKey(size: .bits256)
    let combined = try encryptedArchive(plaintext, using: key)
    let keyData = key.withUnsafeBytes { Data($0) }
    let recoveryText = Data(keyData.base64EncodedString().utf8)

    do {
        try writeProtected(combined, to: destination)
        try writeProtected(recoveryText, to: recoveryDestination)
        let stagedRecovery = try requireRegularNonemptyFile(recoveryDestination)
        guard let decodedKey = Data(
            base64Encoded: stagedRecovery,
            options: [.ignoreUnknownCharacters]
        ), decodedKey.count == 32 else {
            throw VaultFailure.verificationFailed
        }
        try verifyArchive(combined, plaintext: plaintext, using: SymmetricKey(data: decodedKey))
    } catch {
        try? FileManager.default.removeItem(atPath: destination)
        try? FileManager.default.removeItem(atPath: recoveryDestination)
        throw error
    }

    let digest = SHA256.hash(data: combined).map { String(format: "%02x", $0) }.joined()
    print("Encrypted Apple IAP archive staged and locally restore-verified for Apple Passwords.")
    print("Key ID: \(keyID)")
    print("Ciphertext SHA-256: \(digest)")
    print("Store the staged recovery secret in Apple Passwords, verify retrieval, then delete the staging file.")
}

func restoreFromRecoveryFile(
    source: String,
    destination: String,
    recoverySource: String,
    keyID: String
) throws {
    try requireNewDestination(destination)
    let combined = try requireRegularNonemptyFile(source)
    let recoveryText = try requireRegularNonemptyFile(recoverySource)
    guard let keyData = Data(
        base64Encoded: recoveryText,
        options: [.ignoreUnknownCharacters]
    ), keyData.count == 32 else {
        throw VaultFailure.verificationFailed
    }
    let plaintext = try AES.GCM.open(
        AES.GCM.SealedBox(combined: combined),
        using: SymmetricKey(data: keyData)
    )
    guard !plaintext.isEmpty else { throw VaultFailure.verificationFailed }
    try writeProtected(plaintext, to: destination)
    print("Apple IAP key \(keyID) restored with owner-only permissions.")
}

func restore(source: String, destination: String, keyID: String) throws {
    try requireNewDestination(destination)
    let combined = try requireRegularNonemptyFile(source)
    let keyData = try loadSynchronizableKey(keyID: keyID)
    let plaintext = try AES.GCM.open(AES.GCM.SealedBox(combined: combined), using: SymmetricKey(data: keyData))
    guard !plaintext.isEmpty else { throw VaultFailure.verificationFailed }
    try writeProtected(plaintext, to: destination)
    print("Apple IAP key restored with owner-only permissions to \(destination).")
}

do {
    let arguments = CommandLine.arguments
    guard arguments.count == 5 || arguments.count == 6 else {
        throw VaultFailure.usage
    }
    let operation = arguments[1]
    let source = arguments[2]
    let destination = arguments[3]
    let keyID = arguments.last!
    guard keyID.range(of: #"^[A-Z0-9]{10}$"#, options: .regularExpression) != nil else {
        throw VaultFailure.usage
    }

    switch operation {
    case "archive":
        guard arguments.count == 5 else { throw VaultFailure.usage }
        try archive(source: source, destination: destination, keyID: keyID)
    case "restore":
        guard arguments.count == 5 else { throw VaultFailure.usage }
        try restore(source: source, destination: destination, keyID: keyID)
    case "stage-passwords":
        guard arguments.count == 6 else { throw VaultFailure.usage }
        try stageForPasswords(
            source: source,
            destination: destination,
            recoveryDestination: arguments[4],
            keyID: keyID
        )
    case "restore-passwords":
        guard arguments.count == 6 else { throw VaultFailure.usage }
        try restoreFromRecoveryFile(
            source: source,
            destination: destination,
            recoverySource: arguments[4],
            keyID: keyID
        )
    default:
        throw VaultFailure.usage
    }
} catch {
    fputs("apple-iap-vault: \(error)\n", stderr)
    exit(1)
}
