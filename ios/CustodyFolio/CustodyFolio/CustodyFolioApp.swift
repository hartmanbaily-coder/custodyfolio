import SwiftUI

@main
struct CustodyFolioApp: App {
    @AppStorage(AppearancePreferencePolicy.storageKey)
    private var appearancePreference = "system"

    init() {
        SensitiveExportStore.shared.purge()
    }

    private var preferredColorScheme: ColorScheme? {
        switch appearancePreference {
        case "light":
            return .light
        case "dark":
            return .dark
        default:
            return nil
        }
    }

    var body: some Scene {
        WindowGroup {
            Group {
                #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("-CustodyFolioReviewPaywall") {
                    StoreKitPaywallReviewView()
                } else if ProcessInfo.processInfo.arguments.contains("-CustodyFolioStoreKitAcceptance") {
                    StoreKitPaywallView(
                        appAccountToken: UUID(uuidString: "A4D507B0-CC8A-4D17-AF9C-76F09B39DCE8")!,
                        requestedProductID: nil,
                        requestID: UUID(),
                        onResult: { _ in }
                    )
                } else {
                    AppRootView()
                }
                #else
                AppRootView()
                #endif
            }
                .preferredColorScheme(preferredColorScheme)
        }
    }
}
