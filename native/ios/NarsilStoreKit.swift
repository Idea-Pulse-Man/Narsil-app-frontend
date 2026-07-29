import Foundation
import Capacitor
import StoreKit

/**
 * NarsilStoreKit — StoreKit 2 bridge for Narsil Pro.
 *
 * Exists so the backend can verify purchases itself. The one thing our server
 * needs is `VerificationResult.jwsRepresentation` — the signed transaction
 * Apple's App Store Server Library validates against Apple's root
 * certificates. Third-party purchase wrappers reshape purchases into their own
 * formats and don't reliably surface that string, which is why this is written
 * by hand.
 *
 * Deliberately NOT done here: deciding whether the user is entitled. This class
 * takes payment and reports signed transactions. Whether a subscription is live
 * is answered by our backend asking Apple, never by the device — a jailbroken
 * phone can say anything.
 *
 * Requires iOS 15+ for the StoreKit 2 API.
 */
@objc(NarsilStoreKit)
public class NarsilStoreKit: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NarsilStoreKit"
    public let jsName = "NarsilStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    /// Listens for renewals and for purchases made outside the app (Ask to Buy
    /// approvals, App Store subscription page). Without this, a renewal that
    /// happens while the app is backgrounded is never reported to our server.
    private var updatesTask: Task<Void, Never>?

    override public func load() {
        updatesTask = Task.detached { [weak self] in
            for await update in Transaction.updates {
                guard let self else { return }
                guard case .verified(let transaction) = update else { continue }
                self.notifyListeners("transactionUpdated", data: [
                    "jws": update.jwsRepresentation,
                    "productId": transaction.productID
                ])
                await transaction.finish()
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    // MARK: - getProducts

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self), !ids.isEmpty else {
            call.reject("productIds is required")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: ids)
                call.resolve(["products": products.map(Self.describe)])
            } catch {
                call.reject("Could not load products: \(error.localizedDescription)")
            }
        }
    }

    /// Price and period are returned already localised. Never format a price in
    /// JavaScript — App Review rejects paywalls showing the wrong currency, and
    /// `displayPrice` is the only string guaranteed correct in every storefront.
    private static func describe(_ product: Product) -> [String: Any] {
        var trialDays = 0
        if let offer = product.subscription?.introductoryOffer,
           offer.paymentMode == .freeTrial {
            trialDays = days(in: offer.period)
        }

        var period = ""
        if let unit = product.subscription?.subscriptionPeriod.unit {
            switch unit {
            case .day: period = "day"
            case .week: period = "week"
            case .month: period = "month"
            case .year: period = "year"
            @unknown default: period = ""
            }
        }

        return [
            "id": product.id,
            "displayPrice": product.displayPrice,
            "displayName": product.displayName,
            "description": product.description,
            "period": period,
            "trialDays": trialDays
        ]
    }

    private static func days(in period: Product.SubscriptionPeriod) -> Int {
        switch period.unit {
        case .day: return period.value
        case .week: return period.value * 7
        case .month: return period.value * 30
        case .year: return period.value * 365
        @unknown default: return 0
        }
    }

    // MARK: - purchase

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }

        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("Product \(productId) is not available")
                    return
                }

                let result = try await product.purchase()

                switch result {
                case .success(let verification):
                    // `.unverified` means Apple's own signature check failed on
                    // device. Refuse it here rather than forwarding a bad token
                    // and letting the server produce a confusing error.
                    guard case .verified(let transaction) = verification else {
                        call.reject("This purchase could not be verified.")
                        return
                    }
                    // Finish only after handing the JWS back. The server is the
                    // thing that records entitlement; finishing first would risk
                    // losing the transaction if the app died in between.
                    call.resolve([
                        "cancelled": false,
                        "transaction": [
                            "jws": verification.jwsRepresentation,
                            "productId": transaction.productID
                        ]
                    ])
                    await transaction.finish()

                case .userCancelled:
                    // A normal outcome, not an error — the JS layer treats a
                    // rejected promise as something worth showing the user.
                    call.resolve(["cancelled": true, "transaction": NSNull()])

                case .pending:
                    // Ask to Buy / SCA. Approval arrives later on
                    // `Transaction.updates`, which `load()` is listening to.
                    call.resolve(["cancelled": true, "transaction": NSNull()])

                @unknown default:
                    call.resolve(["cancelled": true, "transaction": NSNull()])
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - restore

    /// Required by App Review for any app selling a subscription, and the
    /// recovery path after a reinstall or a new device.
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            // Force a refresh from the App Store first; `currentEntitlements`
            // alone can be stale on a freshly installed app.
            try? await AppStore.sync()

            var transactions: [[String: Any]] = []
            for await entitlement in Transaction.currentEntitlements {
                guard case .verified(let transaction) = entitlement else { continue }
                guard transaction.productType == .autoRenewable else { continue }
                transactions.append([
                    "jws": entitlement.jwsRepresentation,
                    "productId": transaction.productID
                ])
            }
            call.resolve(["transactions": transactions])
        }
    }
}
