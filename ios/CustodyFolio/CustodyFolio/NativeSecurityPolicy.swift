import Foundation

enum AppearancePreferencePolicy {
    static let storageKey = "custody-folio-appearance"
    static let allowedPreferences = Set(["system", "light", "dark"])

    static func preference(from payload: [String: Any]?) -> String? {
        guard payload?["action"] as? String == "setAppearance",
              let preference = payload?["preference"] as? String,
              allowedPreferences.contains(preference)
        else {
            return nil
        }
        return preference
    }
}

enum SessionCookiePolicy {
    static let allowedHosts = Set([
        "custodyfolio.com",
        "www.custodyfolio.com",
    ])
    static let refreshCookieName = "__Host-l2f-records-refresh"
    static let sessionCookieNames = Set([
        "__Host-l2f-records-access",
        "__Host-l2f-records-refresh",
        "__Host-l2f-records-case",
    ])

    static func managedCookies(_ cookies: [HTTPCookie]) -> [HTTPCookie] {
        cookies.filter { cookie in
            let host = cookie.domain
                .trimmingCharacters(in: CharacterSet(charactersIn: "."))
                .lowercased()
            return allowedHosts.contains(host) && sessionCookieNames.contains(cookie.name)
        }
    }

    static func relevantCookies(_ cookies: [HTTPCookie], now: Date = Date()) -> [HTTPCookie] {
        managedCookies(cookies).filter { cookie in
            let unexpired = cookie.expiresDate.map { $0 > now } ?? true
            return unexpired && !cookie.value.isEmpty
        }
    }

    static func hasRefreshCookie(_ cookies: [HTTPCookie], now: Date = Date()) -> Bool {
        relevantCookies(cookies, now: now).contains { $0.name == refreshCookieName }
    }
}

enum ExportSecurityPolicy {
    static let maximumTextExportBytes = 10 * 1024 * 1024
    static let maximumBinaryExportBytes = 25 * 1024 * 1024
    static let maximumBinaryChunkBytes = 64 * 1024
    static let maximumFileNameCharacters = 160

    static func exportData(body: String, base64Encoded: Bool) -> Data? {
        if base64Encoded {
            let maximumBase64Bytes = (maximumBinaryExportBytes * 4 / 3) + 8
            guard body.utf8.count <= maximumBase64Bytes,
                  let data = Data(base64Encoded: body),
                  data.count <= maximumBinaryExportBytes
            else {
                return nil
            }
            return data
        }

        guard body.utf8.count <= maximumTextExportBytes else { return nil }
        return body.data(using: .utf8)
    }

    static func sanitizedFileName(_ requestedFileName: String) -> String? {
        let allowedCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
        let sanitized = requestedFileName.unicodeScalars
            .map { allowedCharacters.contains($0) ? String($0) : "-" }
            .joined()
            .prefix(maximumFileNameCharacters)
        let safeName = String(sanitized).trimmingCharacters(in: CharacterSet(charactersIn: "."))

        guard !safeName.isEmpty, safeName != ".", safeName != ".." else { return nil }
        return safeName
    }

    static func outputFileName(requestedFileName: String, renderAsPDF: Bool) -> String? {
        guard let sanitizedFileName = sanitizedFileName(requestedFileName) else { return nil }
        guard renderAsPDF else { return sanitizedFileName }

        let baseName = URL(fileURLWithPath: sanitizedFileName)
            .deletingPathExtension()
            .lastPathComponent
        guard !baseName.isEmpty else { return nil }
        return "\(baseName).pdf"
    }
}

struct ChunkedExportAccumulator {
    let expectedBytes: Int
    private(set) var data = Data()
    private(set) var nextSequence = 0

    init?(expectedBytes: Int) {
        guard expectedBytes >= 0,
              expectedBytes <= ExportSecurityPolicy.maximumBinaryExportBytes
        else {
            return nil
        }
        self.expectedBytes = expectedBytes
    }

    mutating func append(base64Body: String, sequence: Int) -> Bool {
        let maximumBase64ChunkCharacters =
            (ExportSecurityPolicy.maximumBinaryChunkBytes * 4 / 3) + 8
        guard sequence == nextSequence,
              base64Body.utf8.count <= maximumBase64ChunkCharacters,
              let chunk = Data(base64Encoded: base64Body),
              chunk.count <= ExportSecurityPolicy.maximumBinaryChunkBytes,
              data.count + chunk.count <= expectedBytes
        else {
            return false
        }

        data.append(chunk)
        nextSequence += 1
        return true
    }

    func isComplete(reportedChunks: Int) -> Bool {
        reportedChunks == nextSequence && data.count == expectedBytes
    }
}

enum WorkspaceNavigationDecision: Equatable {
    case allowInWorkspace
    case openExternally
    case cancel
}

enum WorkspaceNavigationPolicy {
    static func decision(for url: URL) -> WorkspaceNavigationDecision {
        if url.scheme == "mailto" {
            return .openExternally
        }

        if url.scheme == "https", let host = url.host, SessionCookiePolicy.allowedHosts.contains(host) {
            return .allowInWorkspace
        }

        if url.scheme == "https" || url.scheme == "http" {
            return .openExternally
        }

        return .cancel
    }
}
