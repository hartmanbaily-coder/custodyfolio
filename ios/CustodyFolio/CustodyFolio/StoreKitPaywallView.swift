import StoreKit
import SwiftUI

struct StoreKitPaywallView: View {
    let appAccountToken: UUID
    let requestedProductID: String?
    let requestID: UUID
    let onResult: @MainActor ([String: Any]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var products: [Product] = []
    @State private var isLoading = true
    @State private var busyProductID: String?
    @State private var message: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("One complete tier")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color("AccentColor"))
                            .textCase(.uppercase)
                        Text("Custody Folio subscription")
                            .font(.title.bold())
                        Text("Choose monthly or annual access. Apple shows the localized total and renewal terms before you confirm.")
                            .foregroundStyle(.secondary)
                    }

                    if isLoading {
                        ProgressView("Loading App Store prices")
                            .frame(maxWidth: .infinity, minHeight: 120)
                    } else if products.isEmpty {
                        ContentUnavailableView(
                            "Subscriptions unavailable",
                            systemImage: "exclamationmark.triangle",
                            description: Text("App Store prices could not be loaded. Try again later.")
                        )
                    } else {
                        ForEach(orderedProducts, id: \.id) { product in
                            planCard(product)
                        }
                    }

                    Text("Eligible accounts receive one 30-day no-card Custody Folio trial. Apple does not add another introductory trial. Cancellation never prevents viewing or exporting existing records.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    HStack(spacing: 16) {
                        Link("Terms", destination: URL(string: "https://custodyfolio.com/terms")!)
                        Link("Privacy", destination: URL(string: "https://custodyfolio.com/privacy")!)
                    }
                    .font(.footnote.weight(.semibold))

                    if let message {
                        Text(message)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .accessibilityLabel("Subscription status: \(message)")
                    }
                }
                .padding()
            }
            .navigationTitle("Subscription")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Not now") {
                        onResult([
                            "action": "purchase",
                            "requestId": requestID.uuidString,
                            "status": "cancelled",
                        ])
                        dismiss()
                    }
                }
            }
            .task {
                await loadProducts()
            }
        }
        .interactiveDismissDisabled()
    }

    private var orderedProducts: [Product] {
        products.sorted { left, right in
            if left.id == requestedProductID { return true }
            if right.id == requestedProductID { return false }
            return left.id < right.id
        }
    }

    @ViewBuilder
    private func planCard(_ product: Product) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(product.displayName)
                .font(.headline)
            Text(product.displayPrice)
                .font(.title2.bold())
            if let period = product.subscription?.subscriptionPeriod {
                Text("Renews every \(periodDescription(period)) until cancelled in Apple subscription settings.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Button {
                Task { await purchase(product) }
            } label: {
                HStack {
                    Spacer()
                    if busyProductID == product.id {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("Continue with \(product.displayPrice)")
                    }
                    Spacer()
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(busyProductID != nil)
            .accessibilityHint("Apple will show the final localized charge before purchase.")
        }
        .padding()
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(product.id == requestedProductID ? Color("AccentColor") : Color(uiColor: .separator))
        }
    }

    @MainActor
    private func loadProducts() async {
        do {
            products = try await Product.products(
                for: NativeBillingBridgePolicy.allowedProductIds
            ).filter {
                NativeBillingBridgePolicy.allowedProductIds.contains($0.id)
            }
        } catch {
            products = []
        }
        isLoading = false
    }

    @MainActor
    private func purchase(_ product: Product) async {
        busyProductID = product.id
        message = nil
        let result = await StoreKitBillingManager.shared.handle(
            NativeBillingBridgeRequest(
                action: .purchase,
                requestId: requestID,
                appAccountToken: appAccountToken,
                productId: product.id
            )
        )
        onResult(result)
        let status = result["status"] as? String
        if status == "success" || status == "cancelled" || status == "pending" {
            dismiss()
        } else {
            message = result["message"] as? String ?? "The purchase could not be completed."
        }
        busyProductID = nil
    }

    private func periodDescription(_ period: Product.SubscriptionPeriod) -> String {
        let unit: String
        switch period.unit {
        case .day: unit = period.value == 1 ? "day" : "days"
        case .week: unit = period.value == 1 ? "week" : "weeks"
        case .month: unit = period.value == 1 ? "month" : "months"
        case .year: unit = period.value == 1 ? "year" : "years"
        @unknown default: unit = "billing period"
        }
        return "\(period.value) \(unit)"
    }
}

#if DEBUG
/// Deterministic StoreKit review fixture used only to capture App Store Connect
/// review screenshots. Release builds cannot activate or include this view.
struct StoreKitPaywallReviewView: View {
    private struct ReviewPlan: Identifiable {
        let id: String
        let displayName: String
        let displayPrice: String
        let period: String
    }

    private let plans = [
        ReviewPlan(
            id: NativeBillingBridgePolicy.monthlyProductId,
            displayName: "Custody Folio Monthly",
            displayPrice: "$6.99",
            period: "1 month"
        ),
        ReviewPlan(
            id: NativeBillingBridgePolicy.annualProductId,
            displayName: "Custody Folio Annual",
            displayPrice: "$69.99",
            period: "1 year"
        ),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("One complete tier")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Color("AccentColor"))
                            .textCase(.uppercase)
                        Text("Custody Folio subscription")
                            .font(.title.bold())
                        Text("Choose monthly or annual access. Apple shows the localized total and renewal terms before you confirm.")
                            .foregroundStyle(.secondary)
                    }

                    ForEach(plans) { plan in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(plan.displayName)
                                .font(.headline)
                            Text(plan.displayPrice)
                                .font(.title2.bold())
                            Text("Renews every \(plan.period) until cancelled in Apple subscription settings.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Button("Continue with \(plan.displayPrice)") {}
                                .buttonStyle(.borderedProminent)
                                .controlSize(.large)
                                .frame(maxWidth: .infinity)
                                .accessibilityHint("Apple will show the final localized charge before purchase.")
                        }
                        .padding()
                        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                        .overlay {
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color(uiColor: .separator))
                        }
                    }

                    Text("Eligible accounts receive one 30-day no-card Custody Folio trial. Apple does not add another introductory trial. Cancellation never prevents viewing or exporting existing records.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    HStack(spacing: 16) {
                        Link("Terms", destination: URL(string: "https://custodyfolio.com/terms")!)
                        Link("Privacy", destination: URL(string: "https://custodyfolio.com/privacy")!)
                    }
                    .font(.footnote.weight(.semibold))
                }
                .padding()
            }
            .navigationTitle("Subscription")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Not now") {}
                }
            }
        }
    }
}
#endif
