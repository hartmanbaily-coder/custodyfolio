import Foundation
import Security

struct SandboxCredential: Decodable {
    let email: String
    let password: String
    let country: String
}

enum CredentialFailure: Error, CustomStringConvertible {
    case usage
    case invalidInput
    case keychain(OSStatus)

    var description: String {
        switch self {
        case .usage:
            return "Usage: swift scripts/store-apple-sandbox-credential.swift <credential.json> | export <email> <new-output>"
        case .invalidInput:
            return "Credential input is missing or invalid."
        case .keychain(let status):
            return "Keychain operation failed with status \(status)."
        }
    }
}

let service = "com.custodyfolio.apple-sandbox-tester"

func baseQuery(email: String) -> [String: Any] {
    [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: email,
    ]
}

func exportPassword(email: String, destination: String) throws {
    guard email.contains("@"), !FileManager.default.fileExists(atPath: destination) else {
        throw CredentialFailure.invalidInput
    }
    var query = baseQuery(email: email)
    query[kSecReturnData as String] = kCFBooleanTrue
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let password = result as? Data, !password.isEmpty else {
        throw CredentialFailure.keychain(status)
    }
    let destinationURL = URL(fileURLWithPath: destination)
    try password.write(to: destinationURL, options: [.atomic])
    try FileManager.default.setAttributes(
        [.posixPermissions: 0o600],
        ofItemAtPath: destination
    )
    print("Exported the sandbox credential to a protected temporary handoff.")
}

do {
    if CommandLine.arguments.count == 4,
       CommandLine.arguments[1] == "export" {
        try exportPassword(
            email: CommandLine.arguments[2],
            destination: CommandLine.arguments[3]
        )
        exit(0)
    }
    guard CommandLine.arguments.count == 2 else { throw CredentialFailure.usage }
    let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
    let values = try inputURL.resourceValues(
        forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]
    )
    guard values.isRegularFile == true,
          values.isSymbolicLink != true,
          (values.fileSize ?? 0) > 0 else {
        throw CredentialFailure.invalidInput
    }

    let credential = try JSONDecoder().decode(
        SandboxCredential.self,
        from: Data(contentsOf: inputURL)
    )
    guard credential.email.contains("@"),
          !credential.password.isEmpty,
          credential.country == "United States" else {
        throw CredentialFailure.invalidInput
    }

    let baseQuery = baseQuery(email: credential.email)
    let attributes: [String: Any] = [
        kSecAttrLabel as String: "Custody Folio Apple sandbox tester",
        kSecAttrDescription as String: "United States StoreKit sandbox account",
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        kSecValueData as String: Data(credential.password.utf8),
    ]

    let updateStatus = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)
    if updateStatus == errSecItemNotFound {
        var addQuery = baseQuery
        attributes.forEach { addQuery[$0.key] = $0.value }
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw CredentialFailure.keychain(addStatus) }
    } else if updateStatus != errSecSuccess {
        throw CredentialFailure.keychain(updateStatus)
    }

    print("Stored the Apple sandbox tester credential in macOS Keychain for \(credential.email).")
} catch {
    fputs("store-apple-sandbox-credential: \(error)\n", stderr)
    exit(1)
}
