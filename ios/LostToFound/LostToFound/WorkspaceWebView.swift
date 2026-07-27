import Observation
import SwiftUI
import UIKit
import WebKit

@MainActor
enum WorkspaceDisplayPolicy {
    static let nativeRootFontScalePercent = 95

    static func apply(to userContentController: WKUserContentController) {
        let source = """
        (() => {
          const styleId = "custody-folio-native-display-scale";
          if (document.getElementById(styleId)) return;

          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = "html { font-size: \(nativeRootFontScalePercent)% !important; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }";
          (document.head || document.documentElement).appendChild(style);
        })();
        """
        userContentController.addUserScript(
            WKUserScript(
                source: source,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
    }
}

@MainActor
@Observable
final class WebViewModel {
    var canGoBack = false
    var canGoForward = false
    var isLoading = false
    var loadErrorMessage: String?

    fileprivate weak var webView: WKWebView?
    private var initialRequest: URLRequest?
    private var workspaceCanGoBack = false
    private var workspaceCanGoForward = false

    func goBack() {
        webView?.evaluateJavaScript("window.history.back()")
    }

    func goForward() {
        webView?.evaluateJavaScript("window.history.forward()")
    }

    func reload() {
        loadErrorMessage = nil

        if webView?.url != nil {
            webView?.reload()
        } else if let initialRequest {
            webView?.load(initialRequest)
        }
    }

    func retry() {
        loadErrorMessage = nil
        guard let webView, let initialRequest else { return }
        webView.load(initialRequest)
    }

    fileprivate func attach(_ webView: WKWebView, initialRequest: URLRequest) {
        self.webView = webView
        self.initialRequest = initialRequest
    }

    fileprivate func navigationStarted() {
        loadErrorMessage = nil
        workspaceCanGoBack = false
        workspaceCanGoForward = false
    }

    fileprivate func navigationFailed(with error: Error) {
        let error = error as NSError
        guard error.code != NSURLErrorCancelled else { return }

        if error.domain == NSURLErrorDomain {
            switch error.code {
            case NSURLErrorNotConnectedToInternet:
                loadErrorMessage = "Your device appears to be offline. Reconnect to the internet and try again."
            case NSURLErrorTimedOut:
                loadErrorMessage = "The connection timed out before the records workspace responded."
            case NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost:
                loadErrorMessage = "Custody Folio could not reach the records service. Check your connection and try again."
            case NSURLErrorSecureConnectionFailed, NSURLErrorServerCertificateUntrusted,
                 NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateHasUnknownRoot:
                loadErrorMessage = "A secure connection to Custody Folio could not be established."
            default:
                loadErrorMessage = "The records workspace could not be loaded. Please try again."
            }
            return
        }

        if error.domain == WKError.errorDomain,
           error.code == WKError.Code.navigationAppBoundDomain.rawValue {
            loadErrorMessage = "This link cannot open inside the secure records workspace."
            return
        }

        loadErrorMessage = "The records workspace could not be loaded. Please try again."
    }

    fileprivate func updateNavigationState(from webView: WKWebView) {
        canGoBack = webView.canGoBack || workspaceCanGoBack
        canGoForward = webView.canGoForward || workspaceCanGoForward
        isLoading = webView.isLoading
    }

    func workspaceHistoryChanged(canGoBack: Bool, canGoForward: Bool) {
        workspaceCanGoBack = canGoBack
        workspaceCanGoForward = canGoForward
        self.canGoBack = (webView?.canGoBack ?? false) || canGoBack
        self.canGoForward = (webView?.canGoForward ?? false) || canGoForward
    }
}

struct WorkspaceScreen: View {
    private let workspaceURL = URL(string: "https://custodyfolio.com/records")!

    var body: some View {
        SecureWebScreen(
            url: workspaceURL,
            title: "Records",
            showsWorkspaceControls: true
        )
    }
}

struct AccountDeletionScreen: View {
    var body: some View {
        SecureWebScreen(
            url: AppBrand.accountDeletionRequestURL,
            title: "Account Deletion",
            showsWorkspaceControls: false
        )
    }
}

private struct SecureWebScreen: View {
    let url: URL
    let title: String
    let showsWorkspaceControls: Bool

    @State private var model = WebViewModel()

    var body: some View {
        ZStack {
            WorkspaceWebView(url: url, model: model)

            if let loadErrorMessage = model.loadErrorMessage {
                ContentUnavailableView {
                    Label("Unable to Load Records", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(loadErrorMessage)
                } actions: {
                    Button {
                        model.retry()
                    } label: {
                        Label("Try Again", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.borderedProminent)
                }
                .background(Color(uiColor: .systemBackground))
            }
        }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .bottomBar) {
                    Button {
                        model.goBack()
                    } label: {
                        Label("Back", systemImage: "chevron.backward")
                    }
                    .disabled(!model.canGoBack)

                    Button {
                        model.goForward()
                    } label: {
                        Label("Forward", systemImage: "chevron.forward")
                    }
                    .disabled(!model.canGoForward)

                    Spacer()

                    if model.isLoading {
                        ProgressView()
                    } else {
                        Button {
                            model.reload()
                        } label: {
                            Label("Reload", systemImage: "arrow.clockwise")
                        }
                    }

                    if showsWorkspaceControls {
                        ShareLink(item: url) {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }
                    }
                }
            }
    }
}

struct WorkspaceWebView: UIViewRepresentable {
    let url: URL
    let model: WebViewModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let websiteDataStore = WKWebsiteDataStore.default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.limitsNavigationsToAppBoundDomains = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.websiteDataStore = websiteDataStore
        configuration.applicationNameForUserAgent = "LostToFound-iOS/0.1"
        WorkspaceDisplayPolicy.apply(to: configuration.userContentController)
        configuration.userContentController.add(
            WeakScriptMessageHandler(delegate: context.coordinator),
            name: Coordinator.nativeDownloadHandlerName
        )
        configuration.userContentController.add(
            WeakScriptMessageHandler(delegate: context.coordinator),
            name: Coordinator.nativeSessionHandlerName
        )
        configuration.userContentController.add(
            WeakScriptMessageHandler(delegate: context.coordinator),
            name: Coordinator.nativeNavigationHandlerName
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = false
        webView.navigationDelegate = context.coordinator

        let request = URLRequest(
            url: url,
            cachePolicy: .reloadRevalidatingCacheData,
            timeoutInterval: 30
        )
        model.attach(webView, initialRequest: request)
        model.isLoading = true

        Task { @MainActor in
            await SecureSessionCookieStore.shared.prepare(websiteDataStore.httpCookieStore)
            webView.load(request)
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        model.updateNavigationState(from: webView)
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(
            forName: Coordinator.nativeDownloadHandlerName
        )
        webView.configuration.userContentController.removeScriptMessageHandler(
            forName: Coordinator.nativeSessionHandlerName
        )
        webView.configuration.userContentController.removeScriptMessageHandler(
            forName: Coordinator.nativeNavigationHandlerName
        )
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        static let nativeDownloadHandlerName = "lostToFoundDownload"
        static let nativeSessionHandlerName = "lostToFoundSession"
        static let nativeNavigationHandlerName = "lostToFoundNavigation"

        private let allowedTextExportContentTypes = Set(["text/csv", "application/json"])
        private let model: WebViewModel

        init(model: WebViewModel) {
            self.model = model
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame,
                  let host = message.webView?.url?.host,
                  SessionCookiePolicy.allowedHosts.contains(host)
            else {
                return
            }

            if message.name == Self.nativeSessionHandlerName {
                let payload = message.body as? [String: Any]
                guard payload?["action"] as? String == "clearLocalSession",
                      let cookieStore = message.webView?.configuration.websiteDataStore.httpCookieStore
                else {
                    return
                }

                Task { @MainActor in
                    await SecureSessionCookieStore.shared.clearLocalSession(cookieStore)
                }
                return
            }

            if message.name == Self.nativeNavigationHandlerName {
                let payload = message.body as? [String: Any]
                guard payload?["action"] as? String == "historyChanged",
                      let canGoBack = payload?["canGoBack"] as? Bool,
                      let canGoForward = payload?["canGoForward"] as? Bool
                else {
                    return
                }
                model.workspaceHistoryChanged(
                    canGoBack: canGoBack,
                    canGoForward: canGoForward
                )
                return
            }

            let payload = message.body as? [String: Any]
            let renderAsPDF = payload?["renderAsPDF"] as? Bool ?? false
            let base64Encoded = payload?["base64Encoded"] as? Bool ?? false
            guard message.name == Self.nativeDownloadHandlerName,
                  let payload,
                  let requestedFileName = payload["fileName"] as? String,
                  let body = payload["body"] as? String,
                  let contentType = payload["contentType"] as? String,
                  renderAsPDF ? contentType == "text/html" : base64Encoded || allowedTextExportContentTypes.contains(contentType),
                  let data = exportData(
                    body: body,
                    base64Encoded: base64Encoded
                  ),
                  let fileURL = writeTextExport(
                    data: data,
                    requestedFileName: requestedFileName,
                    renderAsPDF: renderAsPDF
                  )
            else {
                return
            }

            presentShareSheet(for: fileURL)
        }

        private func exportData(body: String, base64Encoded: Bool) -> Data? {
            ExportSecurityPolicy.exportData(body: body, base64Encoded: base64Encoded)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction
        ) async -> WKNavigationActionPolicy {
            guard let targetURL = navigationAction.request.url else {
                return .cancel
            }

            switch WorkspaceNavigationPolicy.decision(for: targetURL) {
            case .allowInWorkspace:
                return .allow
            case .openExternally:
                await MainActor.run {
                    UIApplication.shared.open(targetURL)
                }
                return .cancel
            case .cancel:
                return .cancel
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            model.navigationStarted()
            model.updateNavigationState(from: webView)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            model.updateNavigationState(from: webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            model.navigationFailed(with: error)
            model.updateNavigationState(from: webView)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            model.navigationFailed(with: error)
            model.updateNavigationState(from: webView)
        }

        private func writeTextExport(data: Data, requestedFileName: String, renderAsPDF: Bool) -> URL? {
            guard let outputFileName = ExportSecurityPolicy.outputFileName(
                requestedFileName: requestedFileName,
                renderAsPDF: renderAsPDF
            ) else {
                return nil
            }

            let outputData: Data
            if renderAsPDF {
                guard let html = String(data: data, encoding: .utf8),
                      let pdf = renderPDF(html: html)
                else {
                    return nil
                }
                outputData = pdf
            } else {
                outputData = data
            }

            do {
                return try SensitiveExportStore.shared.write(outputData, fileName: outputFileName)
            } catch {
                return nil
            }
        }

        private func renderPDF(html: String) -> Data? {
            let renderer = UIPrintPageRenderer()
            let pageRect = CGRect(x: 0, y: 0, width: 612, height: 792)
            let printableRect = pageRect.insetBy(dx: 36, dy: 36)
            renderer.setValue(NSValue(cgRect: pageRect), forKey: "paperRect")
            renderer.setValue(NSValue(cgRect: printableRect), forKey: "printableRect")
            renderer.addPrintFormatter(UIMarkupTextPrintFormatter(markupText: html), startingAtPageAt: 0)
            renderer.prepare(forDrawingPages: NSMakeRange(0, renderer.numberOfPages))

            guard renderer.numberOfPages > 0 else { return nil }

            let pdf = NSMutableData()
            UIGraphicsBeginPDFContextToData(pdf, pageRect, nil)
            for page in 0 ..< renderer.numberOfPages {
                UIGraphicsBeginPDFPage()
                renderer.drawPage(at: page, in: UIGraphicsGetPDFContextBounds())
            }
            UIGraphicsEndPDFContext()
            return pdf as Data
        }

        private func presentShareSheet(for fileURL: URL) {
            guard let windowScene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive }),
                  let rootViewController = windowScene.windows.first(where: \.isKeyWindow)?.rootViewController
            else {
                SensitiveExportStore.shared.remove(fileURL)
                return
            }

            let presenter = visibleViewController(from: rootViewController)
            let shareSheet = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
            shareSheet.completionWithItemsHandler = { _, _, _, _ in
                SensitiveExportStore.shared.remove(fileURL)
            }

            if let popover = shareSheet.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = presenter.view.bounds
                popover.permittedArrowDirections = []
            }

            presenter.present(shareSheet, animated: true)
        }

        private func visibleViewController(from viewController: UIViewController) -> UIViewController {
            if let presented = viewController.presentedViewController {
                return visibleViewController(from: presented)
            }
            if let navigation = viewController as? UINavigationController,
               let visible = navigation.visibleViewController {
                return visibleViewController(from: visible)
            }
            if let tab = viewController as? UITabBarController,
               let selected = tab.selectedViewController {
                return visibleViewController(from: selected)
            }
            return viewController
        }
    }
}

private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(delegate: WKScriptMessageHandler) {
        self.delegate = delegate
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}
