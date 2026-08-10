/**
 * StoreKit 2 bridge — the native half of Narsil Pro.
 * ---------------------------------------------------------------------------
 * Deliberately a hand-rolled Capacitor plugin rather than RevenueCat or
 * cordova-plugin-purchase. The backend verifies purchases against Apple's
 * servers itself, and to do that it needs the raw **JWS representation** of the
 * transaction (`VerificationResult.jwsRepresentation`). StoreKit 2 hands that
 * to native code; the wrapper libraries reshape it into their own formats and
 * don't reliably expose it.
 *
 * The native implementation lives in `native/ios/NarsilStoreKit.swift` — see
 * `native/ios/README.md` for how to add it to the Xcode project.
 *
 * Everything here degrades gracefully off-iOS: `isAvailable()` is false on web
 * and Android, and the paywall renders an explanatory state instead of a buy
 * button. Narsil Pro is iOS-only by product decision, not by accident.
 */
import { registerPlugin } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";

/** Product ids as configured in App Store Connect. */
export const PRO_MONTHLY = "com.narsil.museum.pro.monthly";
export const PRO_ANNUAL = "com.narsil.museum.pro.annual";
export const PRO_PRODUCT_IDS = [PRO_MONTHLY, PRO_ANNUAL] as const;

export type ProProductId = (typeof PRO_PRODUCT_IDS)[number];

export interface StoreProduct {
  id: string;
  /** Localised, currency-formatted price string — display this, never format it yourself. */
  displayPrice: string;
  displayName: string;
  description: string;
  /** "month" | "year" — the renewal period. */
  period: string;
  /** Free-trial length in days when an introductory offer applies, else 0. */
  trialDays: number;
}

export interface StoreTransaction {
  /** The signed JWS the backend verifies against Apple's root certificates. */
  jws: string;
  productId: string;
}

export interface NarsilStoreKitPlugin {
  /** Fetch the subscription products from App Store Connect. */
  getProducts(options: { productIds: string[] }): Promise<{
    products: StoreProduct[];
  }>;
  /** Present Apple's purchase sheet. Resolves with no transaction if cancelled. */
  purchase(options: { productId: string }): Promise<{
    transaction: StoreTransaction | null;
    cancelled: boolean;
  }>;
  /**
   * Re-read entitlements already attached to this Apple ID. Required by App
   * Review — an app that sells a subscription must offer Restore Purchases.
   */
  restore(): Promise<{ transactions: StoreTransaction[] }>;
}

const StoreKit = registerPlugin<NarsilStoreKitPlugin>("NarsilStoreKit");

/**
 * True when a plugin call failed because the native side isn't in the build —
 * `NarsilStoreKit.swift` was never copied into the Xcode target. That is a
 * build mistake, not a transient App Store hiccup, and the paywall shows a
 * different message for it so the two aren't confused during testing.
 */
export function isPluginMissing(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, message } = err as { code?: string; message?: string };
  return code === "UNIMPLEMENTED" || /not implemented/i.test(message ?? "");
}

/** True only where StoreKit actually exists — native iOS. */
export function isAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function getProducts(): Promise<StoreProduct[]> {
  if (!isAvailable()) return [];
  const { products } = await StoreKit.getProducts({
    productIds: [...PRO_PRODUCT_IDS],
  });
  // Keep App Store Connect's ordering intentional rather than incidental:
  // annual first, so the better-value option is what the eye lands on.
  return [...products].sort((a, b) =>
    a.id === PRO_ANNUAL ? -1 : b.id === PRO_ANNUAL ? 1 : 0,
  );
}

/**
 * Buy a subscription. Returns the signed transaction for the backend to verify,
 * or null when the user cancelled — cancellation is a normal outcome, not an
 * error, and must not surface as one.
 */
export async function purchase(
  productId: ProProductId,
): Promise<StoreTransaction | null> {
  if (!isAvailable()) {
    throw new Error("The Explorer's Guild is available on iPhone and iPad.");
  }
  const { transaction, cancelled } = await StoreKit.purchase({ productId });
  return cancelled ? null : transaction;
}

/** Every entitlement Apple still recognises for the signed-in Apple ID. */
export async function restore(): Promise<StoreTransaction[]> {
  if (!isAvailable()) return [];
  const { transactions } = await StoreKit.restore();
  return transactions;
}
