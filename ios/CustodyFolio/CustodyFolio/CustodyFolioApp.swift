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
            AppRootView()
                .preferredColorScheme(preferredColorScheme)
        }
    }
}
