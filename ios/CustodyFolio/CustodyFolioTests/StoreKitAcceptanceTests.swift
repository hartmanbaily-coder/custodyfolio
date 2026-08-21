import StoreKit
import StoreKitTest
import XCTest
@testable import CustodyFolio

@MainActor
final class StoreKitAcceptanceTests: XCTestCase {
    private var session: SKTestSession!

    override func setUpWithError() throws {
        try super.setUpWithError()
        let configurationURL = try XCTUnwrap(
            Bundle(for: Self.self).url(
                forResource: "CustodyFolio",
                withExtension: "storekit"
            )
        )
        session = try SKTestSession(contentsOf: configurationURL)
        session.resetToDefaultState()
        session.disableDialogs = true
        session.clearTransactions()
    }

    override func tearDownWithError() throws {
        session.clearTransactions()
        session = nil
        try super.tearDownWithError()
    }

    func testPurchaseRestoreCancellationAndRefundLifecycle() async throws {
        let appAccountToken = UUID()
        do {
            _ = try await session.buyProduct(
                identifier: NativeBillingBridgePolicy.monthlyProductId,
                options: [.appAccountToken(appAccountToken)]
            )
        } catch {
            throw XCTSkip(
                "The simulator StoreKit test service rejected this development host: \(error)"
            )
        }

        let restored = await StoreKitBillingManager.shared.handle(
            NativeBillingBridgeRequest(
                action: .restore,
                requestId: UUID(),
                appAccountToken: appAccountToken,
                productId: nil
            )
        )
        XCTAssertEqual(restored["status"] as? String, "success")
        XCTAssertEqual((restored["signedTransactions"] as? [String])?.count, 1)

        let mismatchedRestore = await StoreKitBillingManager.shared.handle(
            NativeBillingBridgeRequest(
                action: .currentEntitlements,
                requestId: UUID(),
                appAccountToken: UUID(),
                productId: nil
            )
        )
        XCTAssertEqual(mismatchedRestore["status"] as? String, "success")
        XCTAssertEqual(
            (mismatchedRestore["signedTransactions"] as? [String])?.count,
            0
        )

        let purchasedTransaction = try XCTUnwrap(
            session.allTransactions().first(where: {
                $0.productIdentifier == NativeBillingBridgePolicy.monthlyProductId
            })
        )
        XCTAssertTrue(purchasedTransaction.autoRenewingEnabled)

        try session.disableAutoRenewForTransaction(
            identifier: purchasedTransaction.identifier
        )
        let cancelledTransaction = try XCTUnwrap(
            session.allTransactions().first(where: {
                $0.identifier == purchasedTransaction.identifier
            })
        )
        XCTAssertFalse(cancelledTransaction.autoRenewingEnabled)

        try session.refundTransaction(identifier: purchasedTransaction.identifier)
        try await waitUntil {
            self.session.allTransactions().contains(where: {
                $0.identifier == purchasedTransaction.identifier && $0.cancelDate != nil
            })
        }

        let entitlementsAfterRefund = await StoreKitBillingManager.shared.handle(
            NativeBillingBridgeRequest(
                action: .currentEntitlements,
                requestId: UUID(),
                appAccountToken: appAccountToken,
                productId: nil
            )
        )
        XCTAssertEqual(entitlementsAfterRefund["status"] as? String, "success")
        XCTAssertEqual(
            (entitlementsAfterRefund["signedTransactions"] as? [String])?.count,
            0
        )
    }

    private func waitUntil(
        timeout: Duration = .seconds(5),
        condition: @escaping @MainActor () -> Bool
    ) async throws {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: timeout)
        while clock.now < deadline {
            if condition() {
                return
            }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTFail("StoreKit test state did not converge before the timeout.")
    }
}
