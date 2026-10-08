import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useCatalog } from "@/data/catalog";
import { WORLD } from "@/data/worldCopy";
import { fetchCanvasOrders, type CanvasOrder } from "@/lib/orders";
import BlurImage from "./BlurImage";
import { CloseIcon } from "./Icons";
import { SkeletonCards } from "./Skeleton";

/**
 * User-friendly view of each order status. Backend states that are internal
 * retry bookkeeping (paid, fulfillment_failed) all read as "Processing" —
 * the customer's money is captured and fulfillment is in progress either way.
 */
const STATUS_DISPLAY: Record<
  CanvasOrder["status"],
  { label: string; className: string }
> = {
  registered: {
    label: "Registered",
    className: "border-white/20 bg-white/[0.06] text-white/70",
  },
  pending_payment: {
    label: "Awaiting payment",
    className: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  },
  paid: {
    label: "Processing",
    className: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  },
  submitted: {
    label: "Printing",
    className: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  },
  fulfillment_failed: {
    label: "Processing",
    className: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  },
  shipped: {
    label: "Shipped",
    className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  },
  completed: {
    label: "Delivered",
    className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-red-400/30 bg-red-400/10 text-red-300",
  },
};

interface OrdersSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Bottom-sheet listing the user's canvas orders with live status — from
 * checkout (Awaiting payment / Processing) through Printful (Printing) to the
 * courier (Shipped, with the carrier tracking link, then Delivered). Status
 * changes land via the backend's Stripe + Printful webhooks; opening the
 * sheet re-reads them.
 */
export default function OrdersSheet({ open, onClose }: OrdersSheetProps) {
  const { getArtwork } = useCatalog();
  const [orders, setOrders] = useState<CanvasOrder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const list = await fetchCanvasOrders();
      if (cancelled) return;
      setOrders(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="absolute inset-0 z-[70] bg-ink/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 34 }}
            className="absolute inset-x-0 bottom-0 z-[71] max-h-[88%] overflow-y-auto rounded-t-[28px] border-t border-white/12 bg-ink-soft text-white shadow-placard [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex flex-col items-center pb-1 pt-3">
              <div className="h-1.5 w-11 rounded-full bg-white/15" />
            </div>

            <div className="flex items-center justify-between px-6 pt-2">
              <h2 className="font-serif text-xl text-white">Canvas orders</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="relative -mr-1 flex h-8 w-8 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white after:absolute after:-inset-2 after:content-['']"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 pb-10 pt-4">
              {loading && <SkeletonCards count={3} />}

              {!loading && orders.length === 0 && (
                <p className="py-8 text-center text-sm text-white/45">
                  No canvas orders yet — pick a piece from {WORLD.gallery}.
                </p>
              )}

              {!loading && orders.length > 0 && (
                <div className="space-y-3">
                  {orders.map((order) => {
                    const artwork = getArtwork(order.artwork_id);
                    const display = STATUS_DISPLAY[order.status] ?? {
                      label: order.status,
                      className: "border-white/20 bg-white/[0.06] text-white/70",
                    };
                    const placed = new Date(order.created_at).toLocaleDateString(
                      undefined,
                      { year: "numeric", month: "short", day: "numeric" },
                    );
                    return (
                      <div
                        key={order.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                            {artwork ? (
                              <BlurImage
                                src={artwork.image}
                                alt={artwork.title}
                                accent={artwork.accent}
                              />
                            ) : (
                              <div className="h-full w-full bg-white/[0.06]" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">
                              {artwork?.title ?? "Canvas print"}
                            </p>
                            <p className="mt-0.5 text-xs text-white/50">
                              {order.size} {order.product ?? "canvas"}
                              {order.price != null ? ` · $${order.price}` : ""}
                            </p>
                            <p className="mt-0.5 text-[11px] text-white/50">
                              Ordered {placed}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${display.className}`}
                          >
                            {display.label}
                          </span>
                        </div>

                        {order.status === "shipped" && order.tracking_url && (
                          <a
                            href={order.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 flex w-full items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-400/20"
                          >
                            Track package
                            {order.tracking_number
                              ? ` · ${order.tracking_number}`
                              : ""}
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
