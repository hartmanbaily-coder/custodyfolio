import SwiftUI
import WebKit

struct AppRootView: View {
    @Environment(\.scenePhase) private var scenePhase

    @State private var isUnlocked = false
    @State private var hasUnlockedOnce = false
    @State private var hasCheckedForSession = false

    var body: some View {
        ZStack {
            if hasUnlockedOnce {
                NavigationStack {
                    WorkspaceScreen()
                }
                .allowsHitTesting(isUnlocked)
                .accessibilityHidden(!isUnlocked)
            } else {
                Color(uiColor: .systemBackground)
                    .ignoresSafeArea()
            }

            if !hasCheckedForSession {
                ProgressView()
                    .controlSize(.large)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(uiColor: .systemBackground).ignoresSafeArea())
                    .zIndex(1)
            } else if !isUnlocked {
                AuthenticationGate {
                    withAnimation(.snappy) {
                        hasUnlockedOnce = true
                        isUnlocked = true
                    }
                }
                .background(Color(uiColor: .systemBackground).ignoresSafeArea())
                .zIndex(1)
            }
        }
        .tint(Color("AccentColor"))
        .task {
            guard !hasCheckedForSession else { return }

            SensitiveExportStore.shared.purge()

            let cookieStore = WKWebsiteDataStore.default().httpCookieStore
            let hasSession = await SecureSessionCookieStore.shared.hasRestorableSession(cookieStore)
            hasCheckedForSession = true

            if !hasSession {
                hasUnlockedOnce = true
                isUnlocked = true
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .background {
                SensitiveExportStore.shared.purge()
            }

            guard isUnlocked, newPhase != .active else { return }

            Task { @MainActor in
                let cookieStore = WKWebsiteDataStore.default().httpCookieStore
                if newPhase == .background {
                    await SecureSessionCookieStore.shared.synchronize(cookieStore)
                }
                let hasSession = await SecureSessionCookieStore.shared.hasRestorableSession(cookieStore)
                guard scenePhase != .active, hasSession else { return }
                isUnlocked = false
            }
        }
    }
}
