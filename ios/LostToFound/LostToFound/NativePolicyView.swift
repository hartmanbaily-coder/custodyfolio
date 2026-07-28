import SwiftUI

enum AppBrand {
    static let name = "Custody Folio"
    static let tagline = "Remove the emotion. Track the data."
    static let supportEmail = "support@custodyfolio.com"
    static let privacyEmail = "privacy@custodyfolio.com"
    static let securityEmail = "security@custodyfolio.com"
    static let accountDeletionRequestURL = URL(
        string: "https://custodyfolio.com/account/delete"
    )!
    static let legalDisclaimer = "This app helps organize records and does not provide legal advice. Consult a qualified attorney about your situation."
}

private let appPolicyLinks: [PolicyLink] = [
    PolicyLink(title: "Privacy Policy", url: URL(string: "https://custodyfolio.com/privacy")!),
    PolicyLink(title: "Terms of Use", url: URL(string: "https://custodyfolio.com/terms")!),
    PolicyLink(title: "Account Deletion", url: AppBrand.accountDeletionRequestURL),
    PolicyLink(title: "Contact", url: URL(string: "https://custodyfolio.com/contact")!)
]

struct AppBrandMark: View {
    var size: CGFloat = 56

    var body: some View {
        Image("BookGavelLogo")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

struct AppBrandHeader: View {
    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            AppBrandMark(size: 52)

            VStack(alignment: .leading, spacing: 3) {
                Text(AppBrand.name)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text(AppBrand.tagline)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

struct HelpCenterView: View {
    var body: some View {
        List {
            Section {
                AppBrandHeader()

                VStack(alignment: .leading, spacing: 8) {
                    Text("Help and policies")
                        .font(.headline)
                    Text("Find product help, privacy information, account controls, and the correct contact inbox in one place.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }

            Section("Data Boundaries") {
                Label("No child accounts", systemImage: "person.crop.circle.badge.xmark")
                Label("No public profiles or social feeds", systemImage: "eye.slash")
                Label("No advertising trackers", systemImage: "hand.raised")
                Label("User controlled records and exports", systemImage: "doc.text.magnifyingglass")
                Label("Account deletion available in the app", systemImage: "person.crop.circle.badge.xmark")
            }

            Section("Contact") {
                Link(destination: URL(string: "mailto:\(AppBrand.supportEmail)")!) {
                    Label("Support — \(AppBrand.supportEmail)", systemImage: "envelope")
                }

                Link(destination: URL(string: "mailto:\(AppBrand.privacyEmail)")!) {
                    Label("Privacy — \(AppBrand.privacyEmail)", systemImage: "hand.raised")
                }

                Link(destination: URL(string: "mailto:\(AppBrand.securityEmail)")!) {
                    Label("Security — \(AppBrand.securityEmail)", systemImage: "lock.shield")
                }

                Link(destination: URL(string: "https://custodyfolio.com/contact")!) {
                    Label("Contact page", systemImage: "safari")
                }
            }

            Section("Account and Data") {
                NavigationLink {
                    AccountDeletionScreen()
                } label: {
                    Label("Delete account", systemImage: "person.crop.circle.badge.xmark")
                }

                Link(destination: URL(string: "https://custodyfolio.com/privacy")!) {
                    Label("Privacy and deletion policy", systemImage: "doc.text.magnifyingglass")
                }

                Text("Self-service deletion opens inside the app so your signed-in account can be verified and deleted immediately after confirmation. Support can also help with data export, correction, privacy questions, and recovery. Do not include sensitive case details unless support asks for them.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            NativePolicyFooterSections()
        }
        .navigationTitle("Help & Policies")
    }
}

private struct NativePolicyFooterSections: View {
    var body: some View {
        Section("Policy Center") {
            ForEach(appPolicyLinks) { link in
                Link(destination: link.url) {
                    Label(link.title, systemImage: "safari")
                }
            }
        }

        Section("Disclaimer") {
            Text(AppBrand.legalDisclaimer)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

private struct PolicyLink: Identifiable {
    let title: String
    let url: URL

    var id: String { url.absoluteString }
}
