import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import {
  PRODUCT_LABELS,
  PRODUCT_SIZES,
  priceForSize,
  priceFromId,
  productsFor,
  useCanvasPrices,
  WORLD,
  type CanvasSize,
  type Artwork,
  type PrintProduct,
} from "@/data";
import { useCatalog } from "@/data/catalog";
import { useAppState } from "./AppState";
import { fetchAddresses, createAddress, type Address } from "@/lib/orders";
import { addressProblem, normalizeAddress } from "@/lib/address";
import { SHIPPING_COUNTRIES, SHIPPING_COUNTRY, subdivisionsFor } from "@/lib/countries";
import {
  PAYMENTS_ENABLED,
  IS_NATIVE,
  getStripe,
  createPaymentIntent,
  finalizeOrder,
  payWithNativeSheet,
  type CheckoutIntent,
} from "@/lib/checkout";
import { isCanvasSellable } from "@/lib/sellability";
import BlurImage from "./BlurImage";
import { CloseIcon, CheckIcon } from "./Icons";
import type { ToastState } from "./Toast";
import { track } from "@/lib/telemetry";
import { askForPushAfter } from "@/lib/push";

const EMPTY_FORM = {
  recipient_name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postal_code: "",
  country: SHIPPING_COUNTRY,
};

/** Dark PaymentElement styling to match the sheet. */
const STRIPE_APPEARANCE: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: "#c4a574",
    colorBackground: "#1f1915",
    colorText: "#f4efe6",
    colorTextPlaceholder: "rgba(244,239,230,0.35)",
    borderRadius: "16px",
  },
};

type Step = "details" | "payment" | "placed";

interface CanvasPurchaseSheetProps {
  /** The artwork to order a canvas of. `null` keeps the sheet closed. */
  artwork: Artwork | null;
  onClose: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

/**
 * Bottom-sheet for ordering a canvas print of an artwork.
 * Three steps: size + delivery address → Stripe payment (PaymentElement,
 * PaymentIntent created by the backend) → confirmation. After the payment
 * succeeds the backend submits the print order to Printful — see
 * lib/checkout.ts for the full flow. Shared by the Buy grid and the Saved
 * collection so both flows stay identical.
 */
export default function CanvasPurchaseSheet({
  artwork,
  onClose,
  showToast,
}: CanvasPurchaseSheetProps) {
  const dragControls = useDragControls();
  useCanvasPrices(); // re-render with the server's prices once they load
  const { getArtist } = useCatalog();
  const { isGuest, requestSignIn } = useAppState();
  const [size, setSize] = useState<CanvasSize>("Medium");
  const [product, setProduct] = useState<PrintProduct>("canvas");
  const [step, setStep] = useState<Step>("details");
  const [intent, setIntent] = useState<CheckoutIntent | null>(null);
  const [placing, setPlacing] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Latest callbacks, so the reset effect below runs per artwork — not every
  // time a parent re-renders with a new inline onClose.
  const showToastRef = useRef(showToast);
  const onCloseRef = useRef(onClose);
  showToastRef.current = showToast;
  onCloseRef.current = onClose;

  // Reset the selection each time a new artwork opens the sheet, and load the
  // signed-in user's saved addresses.
  useEffect(() => {
    if (!artwork) return;
    track("checkout_open", { origin: artwork.origin });
    if (!isCanvasSellable(artwork)) {
      showToastRef.current("This artwork is not available as a print.");
      onCloseRef.current();
      return;
    }
    setSize("Medium");
    setProduct("canvas");
    setStep("details");
    setIntent(null);
    setPlacing(false);
    setForm({ ...EMPTY_FORM });

    let cancelled = false;
    if (isGuest) {
      setAddresses([]);
      setSelectedAddressId(null);
      setShowForm(false);
      return;
    }
    void (async () => {
      const list = await fetchAddresses();
      if (cancelled) return;
      setAddresses(list);
      setSelectedAddressId(list[0]?.id ?? null);
      setShowForm(list.length === 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [artwork, isGuest]);

  const artist = artwork ? getArtist(artwork.artistId) : undefined;
  const products = productsFor(artwork?.origin);
  const priceFrom = artwork ? priceFromId(artwork.id, product, artwork.origin) : 0;
  const sizes = PRODUCT_SIZES[product];
  const label = PRODUCT_LABELS[product];

  const setField = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Only US/CA/AU need a state code; everywhere else keeps a free-text field.
  const states = subdivisionsFor(form.country);

  /** Step 1 → 2: save the address if needed, then ask the backend for a
   *  PaymentIntent (the price is computed server-side). */
  const handleContinue = async () => {
    if (!artwork) return;
    if (isGuest) {
      requestSignIn();
      return;
    }
    if (!PAYMENTS_ENABLED) {
      showToast("Payments aren't available yet", "error");
      return;
    }
    setPlacing(true);
    try {
      let addressId = showForm ? null : selectedAddressId;
      if (addressId) {
        // A saved address can predate the delivery checks — don't let it fail
        // as a 400 after the customer has already committed to a size.
        const saved = addresses.find((a) => a.id === addressId);
        const problem = saved ? addressProblem(saved) : null;
        if (problem) {
          showToast(
            `${problem} Fix it under ${WORLD.member} → Delivery addresses.`,
            "error",
          );
          return;
        }
      } else {
        if (!form.line1.trim()) {
          setShowForm(true);
          showToast("Add a delivery address", "error");
          return;
        }
        const problem = addressProblem(form);
        if (problem) {
          showToast(problem, "error");
          return;
        }
        const created = await createAddress({
          ...normalizeAddress(form),
          is_default: addresses.length === 0,
        });
        addressId = created?.id ?? null;
        if (!addressId) throw new Error("Could not save the address");
      }
      const checkout = await createPaymentIntent({
        artworkId: artwork.id,
        size,
        addressId,
        product,
      });
      setIntent(checkout);
      setStep("payment");
      track("checkout_payment", { size, product });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not start checkout",
        "error",
      );
    } finally {
      setPlacing(false);
    }
  };

  /** Step 2 → 3: the card was charged — hand the order to the backend, which
   *  verifies the payment with Stripe and creates the Printful order. */
  const handlePaid = async () => {
    setStep("placed");
    track("checkout_paid", { size, product });
    // "We'll tell you when it ships" — the moment notifications make sense.
    void askForPushAfter("order");
    showToast(WORLD.acquisitionSecured);
    if (!intent) return;
    try {
      await finalizeOrder(intent.orderId);
    } catch {
      // Payment is captured; the backend's Stripe webhook retries fulfillment,
      // so the customer still sees success.
    }
  };

  return (
    <AnimatePresence>
      {artwork && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="absolute inset-0 z-40 bg-black/55"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 500) onClose();
            }}
            className="absolute inset-x-0 bottom-0 z-50 flex max-h-[88%] flex-col rounded-t-[28px] border-t border-white/10 bg-ink-soft/95 text-white shadow-placard backdrop-blur-2xl"
          >
            {/* Swipe-down handle — drag starts here, not on the scrollable form below. */}
            <div
              className="shrink-0 touch-none"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="flex flex-col items-center pb-1 pt-3">
                <div className="h-1.5 w-11 rounded-full bg-white/15" />
              </div>

              <div className="flex items-start justify-between gap-3 px-6 pt-2">
                <div className="min-w-0">
                  <h2 className="truncate font-serif text-xl text-white">
                    {artwork.title}
                  </h2>
                  <p className="mt-1 truncate text-sm text-white/55">
                    {artist?.name} · {label} print
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="mx-6 mt-4 overflow-hidden rounded-2xl">
                <div className="aspect-[4/3] w-full">
                  <BlurImage
                    src={artwork.image}
                    alt={artwork.title}
                    accent={artwork.accent}
                    fit="contain"
                  />
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {step === "details" && (
              <>
            {/* Product selection — posters are the cheaper way in. */}
            {products.length > 1 && (
              <div className="px-6 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  Choose a print
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {products.map((p) => {
                    const selected = product === p;
                    const from = artwork ? priceFromId(artwork.id, p, artwork.origin) : 0;
                    return (
                      <button
                        key={p}
                        onClick={() => setProduct(p)}
                        className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                          selected
                            ? "border-white/50 bg-white/10"
                            : "border-white/12 bg-white/[0.03] hover:bg-white/[0.06]"
                        }`}
                      >
                        <p className="text-sm font-medium text-white">{PRODUCT_LABELS[p]}</p>
                        <p className="text-xs text-white/45">
                          {p === "canvas" ? "Gallery-wrapped" : "Matte paper"} · from ${from}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Size selection */}
            <div className="px-6 pt-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                Choose a size
              </p>
              <div className="mt-3 space-y-2">
                {sizes.map((opt) => {
                  const selected = size === opt.size;
                  const price = priceForSize(priceFrom, opt.size, product, artwork.origin);
                  return (
                    <button
                      key={opt.size}
                      onClick={() => setSize(opt.size)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                        selected
                          ? "border-white/50 bg-white/10"
                          : "border-white/12 bg-white/[0.03] hover:bg-white/[0.06]"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-white">
                          {opt.size}
                        </p>
                        <p className="text-xs text-white/45">{opt.dimensions}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-white">
                          ${price}
                        </span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                            selected
                              ? "border-accent bg-accent text-ink"
                              : "border-white/30"
                          }`}
                        >
                          {selected && <CheckIcon className="h-3 w-3" />}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Delivery address */}
            {!isGuest && (
              <div className="px-6 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  Deliver to
                </p>

                {addresses.length > 0 && !showForm && (
                  <div className="mt-3 space-y-2">
                    {addresses.map((addr) => {
                      const selected = selectedAddressId === addr.id;
                      const problem = addressProblem(addr);
                      return (
                        <button
                          key={addr.id}
                          onClick={() => setSelectedAddressId(addr.id)}
                          className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                            selected
                              ? "border-white/50 bg-white/10"
                              : "border-white/12 bg-white/[0.03] hover:bg-white/[0.06]"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-white">
                              {addr.recipient_name || addr.label}
                            </span>
                            <span className="block truncate text-xs text-white/50">
                              {[
                                addr.line1,
                                addr.city,
                                addr.region,
                                addr.postal_code,
                                addr.country,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                            {problem && (
                              <span className="mt-1 block text-xs text-amber-300/80">
                                {problem} Edit it under {WORLD.member}
                                → Delivery addresses.
                              </span>
                            )}
                          </span>
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              selected
                                ? "border-accent bg-accent text-ink"
                                : "border-white/30"
                            }`}
                          >
                            {selected && <CheckIcon className="h-3 w-3" />}
                          </span>
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setShowForm(true)}
                      className="text-sm text-white/60 transition-colors hover:text-white"
                    >
                      + Add a new address
                    </button>
                  </div>
                )}

                {showForm && (
                  <div className="mt-3 space-y-2">
                    <AddressInput
                      placeholder="Full name"
                      value={form.recipient_name}
                      onChange={(v) => setField("recipient_name", v)}
                    />
                    <AddressInput
                      placeholder="Address line 1"
                      value={form.line1}
                      onChange={(v) => setField("line1", v)}
                    />
                    <AddressInput
                      placeholder="Address line 2 (optional)"
                      value={form.line2}
                      onChange={(v) => setField("line2", v)}
                    />
                    <AddressSelect
                      label="Country"
                      value={form.country}
                      options={SHIPPING_COUNTRIES}
                      onChange={(v) => {
                        setField("country", v);
                        // The old region belongs to the old country's list.
                        setField("region", "");
                      }}
                    />
                    <div className="flex gap-2">
                      <AddressInput
                        placeholder="City"
                        value={form.city}
                        onChange={(v) => setField("city", v)}
                      />
                      {states ? (
                        <AddressSelect
                          label="State / province"
                          value={form.region}
                          options={states}
                          onChange={(v) => setField("region", v)}
                        />
                      ) : (
                        <AddressInput
                          placeholder="State / region (optional)"
                          value={form.region}
                          onChange={(v) => setField("region", v)}
                        />
                      )}
                    </div>
                    <AddressInput
                      placeholder="Postal code"
                      value={form.postal_code}
                      onChange={(v) => setField("postal_code", v)}
                    />
                    <AddressInput
                      placeholder="Phone"
                      value={form.phone}
                      onChange={(v) => setField("phone", v)}
                    />
                    {addresses.length > 0 && (
                      <button
                        onClick={() => setShowForm(false)}
                        className="text-sm text-white/60 transition-colors hover:text-white"
                      >
                        Use a saved address
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Acquire */}
            <div className="px-6 pb-8 pt-5">
              <button
                onClick={handleContinue}
                disabled={placing}
                className="flex w-full items-center justify-center rounded-full bg-accent py-3.5 text-sm font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {placing
                  ? `Preparing to ${WORLD.acquire.toLowerCase()}…`
                  : `${WORLD.acquire} · $${priceForSize(priceFrom, size, product, artwork.origin)}`}
              </button>
              {isGuest && (
                <button
                  type="button"
                  onClick={requestSignIn}
                  className="mt-3 w-full text-center text-[13px] font-medium text-accent underline-offset-2 hover:underline"
                >
                  Sign in to order a print
                </button>
              )}
            </div>
              </>
            )}

            {step === "payment" && intent && (
              <div className="px-6 pb-8 pt-5">
                <div className="rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {size} {label.toLowerCase()}
                      </p>
                      <p className="text-xs text-white/45">
                        {sizes.find((s) => s.size === size)?.dimensions}
                        {" · "}
                        {WORLD.dispatchIncluded}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-white">
                      {/* The server decides the discount; this only renders it. */}
                      {intent.discountPct > 0 && (
                        <span className="mr-2 font-normal text-white/35 line-through">
                          ${intent.listPrice}
                        </span>
                      )}
                      ${intent.price}
                    </span>
                  </div>
                  {intent.discountPct > 0 && (
                    <p className="mt-2 border-t border-white/10 pt-2 text-xs font-medium text-amber-300">
                      {WORLD.explorersGuild} · {WORLD.patronsAdvantage} (
                      {intent.discountPct}% off) — you saved $
                      {(intent.listPrice - intent.price).toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="mt-4">
                  {IS_NATIVE ? (
                    <NativePaymentForm
                      intent={intent}
                      onPaid={handlePaid}
                      onBack={() => {
                        setIntent(null);
                        setStep("details");
                      }}
                      showToast={showToast}
                    />
                  ) : (
                    <Elements
                      stripe={getStripe()}
                      options={{
                        clientSecret: intent.clientSecret,
                        appearance: STRIPE_APPEARANCE,
                      }}
                    >
                      <PaymentForm
                        price={intent.price}
                        onPaid={handlePaid}
                        onBack={() => {
                          setIntent(null);
                          setStep("details");
                        }}
                        showToast={showToast}
                      />
                    </Elements>
                  )}
                </div>
              </div>
            )}

            {step === "placed" && (
              <div className="px-6 pb-8 pt-5">
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-center">
                  <p className="font-medium text-emerald-200">
                    {WORLD.acquisitionSecured}
                  </p>
                  <p className="mt-1 text-sm text-white/60">
                    Payment received — your {size.toLowerCase()} {label.toLowerCase()} of{" "}
                    {artwork.title} is being prepared for printing. Track it
                    any time under {WORLD.member} → Canvas orders.
                  </p>
                </div>
              </div>
            )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Inner payment step — must be a child of <Elements> to reach the Stripe
 * hooks. Confirms the PaymentIntent without leaving the sheet (no redirect for
 * card payments).
 */
function PaymentForm({
  price,
  onPaid,
  onBack,
  showToast,
}: {
  price: number;
  onPaid: () => void;
  onBack: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: { return_url: window.location.href },
      });
      if (error) {
        showToast(error.message ?? "Payment failed", "error");
        return;
      }
      if (
        paymentIntent?.status === "succeeded" ||
        paymentIntent?.status === "processing"
      ) {
        onPaid();
      } else {
        showToast("Payment was not completed", "error");
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Payment failed",
        "error",
      );
    } finally {
      setPaying(false);
    }
  };

  return (
    <div>
      <PaymentElement onReady={() => setReady(true)} />
      <button
        onClick={handlePay}
        disabled={!ready || paying}
        className="mt-4 flex w-full items-center justify-center rounded-full bg-accent py-3.5 text-sm font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {paying ? "Processing…" : `${WORLD.acquire} $${price}`}
      </button>
      <button
        onClick={onBack}
        disabled={paying}
        className="mt-3 w-full text-center text-sm text-white/60 transition-colors hover:text-white disabled:opacity-50"
      >
        Back to size &amp; address
      </button>
    </div>
  );
}

/**
 * Native payment step (packaged iOS/Android app). Presents Stripe's native
 * payment sheet — Apple Pay + card — via @capacitor-community/stripe, using the
 * same PaymentIntent clientSecret the backend returned. Apple Pay JS can't run
 * inside the WebView, so this replaces the <PaymentElement> flow on-device.
 */
function NativePaymentForm({
  intent,
  onPaid,
  onBack,
  showToast,
}: {
  intent: CheckoutIntent;
  onPaid: () => void;
  onBack: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}) {
  const [paying, setPaying] = useState(false);

  const handlePay = async () => {
    setPaying(true);
    try {
      const result = await payWithNativeSheet(intent.clientSecret);
      if (result === "completed") {
        onPaid();
      } else if (result === "failed") {
        showToast("Payment was not completed", "error");
      }
      // "canceled" → user dismissed the sheet; stay on the step silently.
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Payment failed",
        "error",
      );
    } finally {
      setPaying(false);
    }
  };

  return (
    <div>
      <button
        onClick={handlePay}
        disabled={paying}
        className="flex w-full items-center justify-center rounded-full bg-accent py-3.5 text-sm font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {paying ? "Processing…" : `${WORLD.acquire} $${intent.price}`}
      </button>
      <button
        onClick={onBack}
        disabled={paying}
        className="mt-3 w-full text-center text-sm text-white/60 transition-colors hover:text-white disabled:opacity-50"
      >
        Back to size &amp; address
      </button>
    </div>
  );
}

function AddressInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/35 transition-colors focus:border-white/25 focus:outline-none"
    />
  );
}

/**
 * Native <select> so iOS shows its own picker wheel. The options need an
 * explicit dark background — on some platforms the popup is rendered by the OS
 * and doesn't inherit the sheet's styling.
 */
function AddressSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { code: string; name: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm transition-colors focus:border-white/25 focus:outline-none ${
        value ? "text-white" : "text-white/35"
      }`}
    >
      <option value="" className="bg-ink-soft text-white">
        {label}
      </option>
      {options.map((o) => (
        <option key={o.code} value={o.code} className="bg-ink-soft text-white">
          {o.name}
        </option>
      ))}
    </select>
  );
}
