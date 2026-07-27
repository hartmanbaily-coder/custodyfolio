import Foundation
import WebKit
import XCTest
@testable import LostToFound

final class NativeSecurityPolicyTests: XCTestCase {
    func testSessionCookiePolicyKeepsOnlyAllowedUnexpiredSessionCookies() throws {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let validRefresh = try makeCookie(
            name: "__Host-l2f-records-refresh",
            value: "refresh-token",
            host: "custodyfolio.com",
            expiresAt: now.addingTimeInterval(3_600)
        )
        let validAccess = try makeCookie(
            name: "__Host-l2f-records-access",
            value: "access-token",
            host: "www.custodyfolio.com",
            expiresAt: now.addingTimeInterval(600)
        )
        let expired = try makeCookie(
            name: "__Host-l2f-records-refresh",
            value: "expired",
            host: "losttofound.org",
            expiresAt: now.addingTimeInterval(-1)
        )
        let foreignHost = try makeCookie(
            name: "__Host-l2f-records-refresh",
            value: "foreign",
            host: "example.com",
            expiresAt: now.addingTimeInterval(3_600)
        )
        let unrelated = try makeCookie(
            name: "analytics",
            value: "value",
            host: "losttofound.org",
            expiresAt: now.addingTimeInterval(3_600)
        )

        let relevant = SessionCookiePolicy.relevantCookies(
            [validRefresh, validAccess, expired, foreignHost, unrelated],
            now: now
        )
        let managed = SessionCookiePolicy.managedCookies(
            [validRefresh, validAccess, expired, foreignHost, unrelated]
        )

        XCTAssertEqual(Set(relevant.map(\.name)), Set([validRefresh.name, validAccess.name]))
        XCTAssertEqual(managed.count, 3)
        XCTAssertTrue(SessionCookiePolicy.hasRefreshCookie(relevant, now: now))
        XCTAssertFalse(SessionCookiePolicy.hasRefreshCookie([expired, foreignHost], now: now))
    }

    func testExportFileNamesAreSanitizedAndBounded() {
        XCTAssertEqual(
            ExportSecurityPolicy.sanitizedFileName("Attorney issue summary 7/12.csv"),
            "Attorney-issue-summary-7-12.csv"
        )
        XCTAssertNil(ExportSecurityPolicy.sanitizedFileName(".."))
        XCTAssertEqual(
            ExportSecurityPolicy.outputFileName(
                requestedFileName: "Attorney Summary.html",
                renderAsPDF: true
            ),
            "Attorney-Summary.pdf"
        )
        XCTAssertEqual(
            ExportSecurityPolicy.sanitizedFileName(String(repeating: "a", count: 200))?.count,
            ExportSecurityPolicy.maximumFileNameCharacters
        )
    }

    func testOversizedExportPayloadsAreRejected() {
        let oversizedText = String(
            repeating: "x",
            count: ExportSecurityPolicy.maximumTextExportBytes + 1
        )
        XCTAssertNil(ExportSecurityPolicy.exportData(body: oversizedText, base64Encoded: false))

        let oversizedBinary = Data(
            repeating: 0x41,
            count: ExportSecurityPolicy.maximumBinaryExportBytes + 1
        ).base64EncodedString()
        XCTAssertNil(ExportSecurityPolicy.exportData(body: oversizedBinary, base64Encoded: true))
        XCTAssertEqual(
            ExportSecurityPolicy.exportData(body: "date,event", base64Encoded: false),
            Data("date,event".utf8)
        )
    }

    func testNavigationPolicyKeepsOnlyProductHTTPSInsideWorkspace() throws {
        XCTAssertEqual(
            WorkspaceNavigationPolicy.decision(for: try XCTUnwrap(URL(string: "https://custodyfolio.com/records"))),
            .allowInWorkspace
        )
        XCTAssertEqual(
            WorkspaceNavigationPolicy.decision(for: try XCTUnwrap(URL(string: "https://losttofound.org/records"))),
            .allowInWorkspace
        )
        XCTAssertEqual(
            WorkspaceNavigationPolicy.decision(for: try XCTUnwrap(URL(string: "https://example.com/help"))),
            .openExternally
        )
        XCTAssertEqual(
            WorkspaceNavigationPolicy.decision(for: try XCTUnwrap(URL(string: "mailto:support@custodyfolio.com"))),
            .openExternally
        )
        XCTAssertEqual(
            WorkspaceNavigationPolicy.decision(for: try XCTUnwrap(URL(string: "file:///tmp/report.csv"))),
            .cancel
        )
    }

    @MainActor
    func testWorkspaceHistoryBridgeEnablesBackWhenWebKitDoesNot() async throws {
        let webView = WKWebView(frame: .zero)
        webView.loadHTMLString("<!doctype html><title>Records</title><main>Dashboard</main>", baseURL: nil)

        for _ in 0 ..< 100 {
            let readyState = try? await webView.evaluateJavaScript("document.readyState") as? String
            if readyState == "complete" {
                break
            }
            try await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertFalse(webView.canGoBack)
        _ = try await webView.evaluateJavaScript(
            "history.pushState({ recordsView: 'Notes' }, '')"
        )
        XCTAssertFalse(webView.canGoBack)

        let model = WebViewModel()
        model.workspaceHistoryChanged(canGoBack: true, canGoForward: false)
        XCTAssertTrue(model.canGoBack)
        XCTAssertFalse(model.canGoForward)
    }

    @MainActor
    func testWorkspaceStartsAtComfortableDisplayScale() {
        let userContentController = WKUserContentController()

        WorkspaceDisplayPolicy.apply(to: userContentController)

        let script = userContentController.userScripts.first
        XCTAssertEqual(userContentController.userScripts.count, 1)
        XCTAssertEqual(script?.injectionTime, .atDocumentStart)
        XCTAssertEqual(script?.isForMainFrameOnly, true)
        XCTAssertTrue(script?.source.contains("font-size: 95%") ?? false)
        XCTAssertTrue(script?.source.contains("-webkit-text-size-adjust: 100%") ?? false)
    }

    func testSensitiveExportStoreRemovesWrittenFiles() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("LostToFoundTests-\(UUID().uuidString)", isDirectory: true)
        let store = SensitiveExportStore(directoryURL: directory)
        defer { store.purge() }

        let fileURL = try store.write(Data("private report".utf8), fileName: "report.csv")
        XCTAssertTrue(FileManager.default.fileExists(atPath: fileURL.path))

        store.remove(fileURL)
        XCTAssertFalse(FileManager.default.fileExists(atPath: fileURL.path))

        _ = try store.write(Data("private report".utf8), fileName: "report.csv")
        XCTAssertTrue(store.purge())
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.path))
    }

    @MainActor
    func testClearingLocalSessionRemovesManagedWebKitCookies() async throws {
        let websiteDataStore = WKWebsiteDataStore.nonPersistent()
        let cookieStore = websiteDataStore.httpCookieStore
        let refreshCookie = try makeCookie(
            name: "__Host-l2f-records-refresh",
            value: "refresh-token",
            host: "losttofound.org",
            expiresAt: Date().addingTimeInterval(3_600)
        )
        let unrelatedCookie = try makeCookie(
            name: "unrelated",
            value: "keep-me",
            host: "losttofound.org",
            expiresAt: Date().addingTimeInterval(3_600)
        )
        await set(refreshCookie, in: cookieStore)
        await set(unrelatedCookie, in: cookieStore)

        await SecureSessionCookieStore.shared.clearLocalSession(cookieStore)

        let cookies = await allCookies(in: cookieStore)
        XCTAssertFalse(cookies.contains { $0.name == refreshCookie.name })
        XCTAssertTrue(cookies.contains { $0.name == unrelatedCookie.name })
    }

    private func makeCookie(
        name: String,
        value: String,
        host: String,
        expiresAt: Date
    ) throws -> HTTPCookie {
        try XCTUnwrap(
            HTTPCookie(properties: [
                .name: name,
                .value: value,
                .domain: host,
                .path: "/",
                .secure: "TRUE",
                .expires: expiresAt,
            ])
        )
    }

    @MainActor
    private func set(_ cookie: HTTPCookie, in cookieStore: WKHTTPCookieStore) async {
        await withCheckedContinuation { continuation in
            cookieStore.setCookie(cookie) {
                continuation.resume()
            }
        }
    }

    @MainActor
    private func allCookies(in cookieStore: WKHTTPCookieStore) async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in
            cookieStore.getAllCookies { cookies in
                continuation.resume(returning: cookies)
            }
        }
    }
}
