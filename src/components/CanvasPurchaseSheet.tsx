import { useEffect, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
  CANVAS_SIZES,
  priceForSize,
  priceFromId,
  type CanvasSize,
  type Artwork,
} from "@/data";
import { useCatalog } from "@/data/catalog";
import { useAppState } from "./AppState";
import {
  fetchAddresses,
  createAddress,
  createCanvasOrder,
  type Address,
} from "@/lib/orders";
import BlurImage from "./BlurImage";
import { CloseIcon, CheckIcon } from "./Icons";
import type { ToastState } from "./Toast";

const EMPTY_FORM = {
  recipient_name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "",
};

interface CanvasPurchaseSheetProps {
  /** The artwork to order a canvas of. `null` keeps the sheet closed. */
  artwork: Artwork | null;
  onClose: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

/**
 * Bottom-sheet for ordering a canvas print of an artwork — size selection plus a
 * "register interest" capture (checkout is not wired in v1). Shared by the Buy
 * grid and the Saved collection so both flows stay identical.
 */
export default function CanvasPurchaseSheet({
  artwork,
  onClose,
  showToast,
}: CanvasPurchaseSheetProps) {
  const dragControls = useDragControls();
  const { getArtist } = useCatalog();
  const { isGuest } = useAppState();
  const [size, setSize] = useState<CanvasSize>("Medium");
  const [placed, setPlaced] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Reset the selection each time a new artwork opens the sheet, and load the
  // signed-in user's saved addresses.
  useEffect(() => {
    if (!artwork) return;
    setSize("Medium");
    setPlaced(false);
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
  const priceFrom = artwork ? priceFromId(artwork.id) : 0;

  const setField = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleBuy = async () => {
    if (!artwork) return;
    if (isGuest) {
      showToast("Sign in from the You tab to order", "error");
      return;
    }
    setPlacing(true);
    try {
      let addressId = showForm ? null : selectedAddressId;
      if (!addressId) {
        if (!form.line1.trim()) {
          setShowForm(true);
          showToast("Add a delivery address", "error");
          return;
        }
        const created = await createAddress({
          ...form,
          is_default: addresses.length === 0,
        });
        addressId = created?.id ?? null;
      }
      const { error } = await createCanvasOrder({
        artworkId: artwork.id,
        size,
        price: priceForSize(priceFrom, size),
        addressId,
      });
      if (error) {
        showToast(error.message, "error");
        return;
      }
      setPlaced(true);
      showToast("Order placed");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not place order",
        "error",
      );
    } finally {
      setPlacing(false);
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
                    {artist?.name} · Canvas print
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
            {/* Size selection */}
            <div className="px-6 pt-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                Choose a size
              </p>
              <div className="mt-3 space-y-2">
                {CANVAS_SIZES.map((opt) => {
                  const selected = size === opt.size;
                  const price = priceForSize(priceFrom, opt.size);
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
                              ? "border-white bg-white text-ink"
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
            {!placed && !isGuest && (
              <div className="px-6 pt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  Deliver to
                </p>

                {addresses.length > 0 && !showForm && (
                  <div className="mt-3 space-y-2">
                    {addresses.map((addr) => {
                      const selected = selectedAddressId === addr.id;
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
                              {[addr.line1, addr.city, addr.postal_code]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          </span>
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              selected
                                ? "border-white bg-white text-ink"
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
                    <div className="flex gap-2">
                      <AddressInput
                        placeholder="City"
                        value={form.city}
                        onChange={(v) => setField("city", v)}
                      />
                      <AddressInput
                        placeholder="Postal code"
                        value={form.postal_code}
                        onChange={(v) => setField("postal_code", v)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <AddressInput
                        placeholder="Country"
                        value={form.country}
                        onChange={(v) => setField("country", v)}
                      />
                      <AddressInput
                        placeholder="Phone"
                        value={form.phone}
                        onChange={(v) => setField("phone", v)}
                      />
                    </div>
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

            {/* Buy */}
            <div className="px-6 pb-8 pt-5">
              {placed ? (
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-center">
                  <p className="font-medium text-emerald-200">Order placed</p>
                  <p className="mt-1 text-sm text-white/60">
                    Your {size.toLowerCase()} canvas of {artwork.title} is
                    registered. We&apos;ll email you when it ships.
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleBuy}
                  disabled={placing}
                  className="flex w-full items-center justify-center rounded-full bg-white py-3.5 text-sm font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  {placing
                    ? "Placing order…"
                    : `Buy Canvas · $${priceForSize(priceFrom, size)}`}
                </button>
              )}
              {isGuest && !placed && (
                <p className="mt-3 text-center text-[11px] text-white/35">
                  Sign in from the You tab to order a canvas.
                </p>
              )}
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
