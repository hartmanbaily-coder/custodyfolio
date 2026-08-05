import Foundation
import Security
import WebKit

@MainActor
final class SecureSessionCookieStore: NSObject, WKHTTPCookieStoreObserver {
    static let shared = SecureSessionCookieStore()

    private struct StoredCookie: Codable {
        let name: String
        let value: String
        let domain: String
        let path: String
        let expiresAt: Date?
        let isSecure: Bool
        let isHTTPOnly: Bool

        init(_ cookie: HTTPCookie) {
            name = cookie.name
            value = cookie.value
            domain = cookie.domain
            path = cookie.path
            expiresAt = cookie.expiresDate
            isSecure = cookie.isSecure
            isHTTPOnly = cookie.isHTTPOnly
        }

        var cookie: HTTPCookie? {
            let host = domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))
            guard let originURL = URL(string: "https://\(host)") else { return nil }

            var properties: [HTTPCookiePropertyKey: Any] = [
                .name: name,
                .value: value,
                .originURL: originURL,
                .path: path,
                .sameSitePolicy: "lax",
            ]

            if let expiresAt {
                properties[.expires] = expiresAt
            }
            if isSecure {
                properties[.secure] = "TRUE"
            }
            if isHTTPOnly {
                properties[HTTPCookiePropertyKey("HttpOnly")] = "TRUE"
            }

            return HTTPCookie(properties: properties)
        }
    }

    private let keychainAccount = "records-session-cookies-v1"
    private let keychainService = "io.lendori.losttofound"

    private weak var observedStore: WKHTTPCookieStore?
    private var isRestoring = false

    private override init() {
        super.init()
    }

    func hasRestorableSession(_ cookieStore: WKHTTPCookieStore) async -> Bool {
        if SessionCookiePolicy.hasRefreshCookie(await cookies(in: cookieStore)) {
            return true
        }

        let hasBackup = SessionCookiePolicy.hasRefreshCookie(load().compactMap(\.cookie))
        if !hasBackup {
            deleteBackup()
        }
        return hasBackup
    }

    func prepare(_ cookieStore: WKHTTPCookieStore) async {
        if let observedStore, observedStore !== cookieStore {
            observedStore.remove(self)
        }

        let currentCookies = await cookies(in: cookieStore)
        if SessionCookiePolicy.hasRefreshCookie(currentCookies) {
            save(currentCookies)
        } else {
            let restoredCookies = load().compactMap(\.cookie)
            if SessionCookiePolicy.hasRefreshCookie(restoredCookies) {
                isRestoring = true
                for cookie in restoredCookies {
                    await set(cookie, in: cookieStore)
                }
                isRestoring = false
            } else {
                deleteBackup()
            }
        }

        if observedStore !== cookieStore {
            cookieStore.add(self)
            observedStore = cookieStore
        }
    }

    func synchronize(_ cookieStore: WKHTTPCookieStore) async {
        save(await cookies(in: cookieStore))
    }

    func clearLocalSession(_ cookieStore: WKHTTPCookieStore) async {
        deleteBackup()

        for cookie in SessionCookiePolicy.managedCookies(await cookies(in: cookieStore)) {
            await delete(cookie, from: cookieStore)
        }

        deleteBackup()
    }

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        guard !isRestoring else { return }

        Task { @MainActor [weak self] in
            guard let self else { return }
            self.save(await self.cookies(in: cookieStore))
        }
    }

    private func cookies(in cookieStore: WKHTTPCookieStore) async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in
            cookieStore.getAllCookies { cookies in
                continuation.resume(returning: cookies)
            }
        }
    }

    private func set(_ cookie: HTTPCookie, in cookieStore: WKHTTPCookieStore) async {
        await withCheckedContinuation { continuation in
            cookieStore.setCookie(cookie) {
                continuation.resume()
            }
        }
    }

    private func delete(_ cookie: HTTPCookie, from cookieStore: WKHTTPCookieStore) async {
        await withCheckedContinuation { continuation in
            cookieStore.delete(cookie) {
                continuation.resume()
            }
        }
    }

    private func save(_ cookies: [HTTPCookie]) {
        let relevant = SessionCookiePolicy.relevantCookies(cookies)
        guard SessionCookiePolicy.hasRefreshCookie(relevant) else {
            deleteBackup()
            return
        }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .millisecondsSince1970
        guard let data = try? encoder.encode(relevant.map(StoredCookie.init)) else { return }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]

        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        guard status == errSecItemNotFound else { return }

        var item = query
        item.merge(attributes) { _, new in new }
        SecItemAdd(item as CFDictionary, nil)
    }

    private func load() -> [StoredCookie] {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else {
            return []
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
        return (try? decoder.decode([StoredCookie].self, from: data)) ?? []
    }

    private func deleteBackup() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
