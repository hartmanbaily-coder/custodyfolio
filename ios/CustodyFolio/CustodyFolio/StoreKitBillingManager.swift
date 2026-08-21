import StoreKit
import UIKit

extension Notification.Name {
    static let custodyFolioStoreKitTransaction = Notification.Name(
        "custody-folio-storekit-transaction"
    )
}

@MainActor
final class StoreKitBillingManager {
    static let shared = StoreKitBillingManager()

    private var transactionUpdatesTask: Task<Void, Never>?
    private var activeAppAccountToken: UUID?

    private init() {
        transactionUpdatesTask = observeTransactionUpdates()
    }

    func handle(_ request: NativeBillingBridgeRequest) async -> [String: Any] {
        activeAppAccountToken = request.appAccountToken
        do {
            switch request.action {
            case .loadProducts:
                return await loadProducts(requestId: request.requestId)
            case .purchase:
                guard let productId = request.productId else {
                    return failed(request, message: "The selected App Store product is unavailable.")
                }
                return try await purchase(
                    productId: productId,
                    appAccountToken: request.appAccountToken,
                    requestId: request.requestId
                )
            case .currentEntitlements:
                return await currentEntitlements(
                    appAccountToken: request.appAccountToken,
                    requestId: request.requestId
                )
            case .restore:
                try await AppStore.sync()
                return await currentEntitlements(
                    appAccountToken: request.appAccountToken,
                    requestId: request.requestId,
                    action: "restore"
                )
            case .manageSubscriptions:
                guard let scene = UIApplication.shared.connectedScenes
                    .compactMap({ $0 as? UIWindowScene })
                    .first(where: { $0.activationState == .foregroundActive })
                else {
                    return failed(request, message: "The App Store subscription screen is unavailable.")
                }
                try await AppStore.showManageSubscriptions(in: scene)
                return success(request, message: "App Store subscription management opened.")
            }
        } catch {
            return failed(
                request,
                message: "The App Store request could not be completed. Try again."
            )
        }
    }

    private func loadProducts(requestId: UUID) async -> [String: Any] {
        do {
            let products = try await Product.products(
                for: NativeBillingBridgePolicy.allowedProductIds
            )
            let summaries: [[String: Any]] = products
                .sorted { $0.id < $1.id }
                .map { product in
                    let periodDescription: String
                    if let period = product.subscription?.subscriptionPeriod {
                        periodDescription = subscriptionPeriodDescription(period)
                    } else {
                        periodDescription = "Subscription period unavailable"
                    }
                    return [
                        "productId": product.id,
                        "displayName": product.displayName,
                        "displayPrice": product.displayPrice,
                        "periodDescription": periodDescription,
                    ]
                }
            return [
                "action": "loadProducts",
                "requestId": requestId.uuidString,
                "status": "success",
                "products": summaries,
            ]
        } catch {
            return [
                "action": "loadProducts",
                "requestId": requestId.uuidString,
                "status": "failed",
                "message": "App Store prices are temporarily unavailable.",
            ]
        }
    }

    private func purchase(
        productId: String,
        appAccountToken: UUID,
        requestId: UUID
    ) async throws -> [String: Any] {
        guard AppStore.canMakePayments else {
            return [
                "action": "purchase",
                "requestId": requestId.uuidString,
                "status": "failed",
                "message": "Purchases are not allowed on this device.",
            ]
        }
        guard let product = try await Product.products(for: [productId]).first,
              NativeBillingBridgePolicy.allowedProductIds.contains(product.id)
        else {
            return [
                "action": "purchase",
                "requestId": requestId.uuidString,
                "status": "failed",
                "message": "The selected App Store subscription is unavailable.",
            ]
        }

        let result = try await product.purchase(
            options: [.appAccountToken(appAccountToken)]
        )
        switch result {
        case .success(let verification):
            guard case .verified(let transaction) = verification else {
                return [
                    "action": "purchase",
                    "requestId": requestId.uuidString,
                    "status": "failed",
                    "message": "The App Store purchase could not be verified on this device.",
                ]
            }
            let signedTransactionInfo = verification.jwsRepresentation
            await transaction.finish()
            return [
                "action": "purchase",
                "requestId": requestId.uuidString,
                "status": "success",
                "signedTransactionInfo": signedTransactionInfo,
            ]
        case .pending:
            return [
                "action": "purchase",
                "requestId": requestId.uuidString,
                "status": "pending",
            ]
        case .userCancelled:
            return [
                "action": "purchase",
                "requestId": requestId.uuidString,
                "status": "cancelled",
            ]
        @unknown default:
            return [
                "action": "purchase",
                "requestId": requestId.uuidString,
                "status": "failed",
                "message": "The App Store returned an unknown purchase result.",
            ]
        }
    }

    private func currentEntitlements(
        appAccountToken: UUID,
        requestId: UUID,
        action: String = "currentEntitlements"
    ) async -> [String: Any] {
        var signedTransactions: [String] = []
        for await verification in Transaction.currentEntitlements {
            guard case .verified(let transaction) = verification,
                  NativeBillingBridgePolicy.allowedProductIds.contains(transaction.productID),
                  transaction.appAccountToken == appAccountToken
            else {
                continue
            }
            signedTransactions.append(verification.jwsRepresentation)
        }
        return [
            "action": action,
            "requestId": requestId.uuidString,
            "status": "success",
            "signedTransactions": signedTransactions,
            "message": signedTransactions.isEmpty
                ? "No current App Store subscription was found."
                : "App Store purchases were restored.",
        ]
    }

    private func observeTransactionUpdates() -> Task<Void, Never> {
        Task { [weak self] in
            for await verification in Transaction.updates {
                guard self != nil,
                      case .verified(let transaction) = verification,
                      NativeBillingBridgePolicy.allowedProductIds.contains(transaction.productID),
                      transaction.appAccountToken == self?.activeAppAccountToken
                else {
                    continue
                }
                let signedTransactionInfo = verification.jwsRepresentation
                await transaction.finish()
                NotificationCenter.default.post(
                    name: .custodyFolioStoreKitTransaction,
                    object: nil,
                    userInfo: ["signedTransactionInfo": signedTransactionInfo]
                )
            }
        }
    }

    private func subscriptionPeriodDescription(
        _ period: Product.SubscriptionPeriod
    ) -> String {
        let unit: String
        switch period.unit {
        case .day:
            unit = period.value == 1 ? "day" : "days"
        case .week:
            unit = period.value == 1 ? "week" : "weeks"
        case .month:
            unit = period.value == 1 ? "month" : "months"
        case .year:
            unit = period.value == 1 ? "year" : "years"
        @unknown default:
            unit = "billing period"
        }
        return "\(period.value) \(unit)"
    }

    private func success(
        _ request: NativeBillingBridgeRequest,
        message: String
    ) -> [String: Any] {
        [
            "action": request.action.rawValue,
            "requestId": request.requestId.uuidString,
            "status": "success",
            "message": message,
        ]
    }

    private func failed(
        _ request: NativeBillingBridgeRequest,
        message: String
    ) -> [String: Any] {
        [
            "action": request.action.rawValue,
            "requestId": request.requestId.uuidString,
            "status": "failed",
            "message": message,
        ]
    }
}
