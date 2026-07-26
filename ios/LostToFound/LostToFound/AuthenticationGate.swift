import LocalAuthentication
import SwiftUI

struct AuthenticationGate: View {
    let onUnlock: () -> Void

    @Environment(\.scenePhase) private var scenePhase
    @State private var errorMessage: String?
    @State private var isAuthenticating = false

    var body: some View {
        VStack(spacing: 28) {
            Spacer()

            AppBrandMark(size: 76)

            VStack(spacing: 10) {
                Text(AppBrand.name)
                    .font(.largeTitle.bold())
                    .multilineTextAlignment(.center)

                Text(AppBrand.tagline)
                    .font(.headline)
                    .foregroundStyle(Color("AccentColor"))

                Text("Privately organize custody events, parenting time, expenses, notes, and evidence, then create clear reports for personal review or your attorney.")
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.callout)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.red)
                    .padding(.horizontal)
            }

            Button {
                Task { await authenticate() }
            } label: {
                Label(isAuthenticating ? "Unlocking" : "Unlock app", systemImage: "faceid")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(isAuthenticating)
            .padding(.horizontal, 32)

            Spacer()

            VStack(spacing: 6) {
                Text("Disclaimer")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Text(AppBrand.legalDisclaimer)
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 20)
        }
        .task {
            guard scenePhase == .active else { return }
            await authenticate()
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            Task { await authenticate() }
        }
    }

    @MainActor
    private func authenticate() async {
        guard !isAuthenticating else { return }

        #if targetEnvironment(simulator)
        onUnlock()
        return
        #else
        let context = LAContext()
        var authError: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authError) else {
            errorMessage = "Turn on a device passcode before using this private records app."
            return
        }

        isAuthenticating = true
        errorMessage = nil

        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: "Unlock Custody Folio on this device."
            )
            if success {
                onUnlock()
            }
        } catch {
            errorMessage = "Authentication did not complete. Try again when you are ready."
        }

        isAuthenticating = false
        #endif
    }
}
