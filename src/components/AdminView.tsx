import { useCallback, useEffect, useState } from "react";
import { useCatalog } from "@/data/catalog";
import {
  fetchAdminArtworks,
  fetchAdminOrders,
  updateArtworkFlags,
  type AdminArtworkRow,
  type AdminOrderRow,
} from "@/lib/admin";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import type { ToastState } from "./Toast";

interface AdminViewProps {
  onBack: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

export default function AdminView({ onBack, showToast }: AdminViewProps) {
  const { refresh } = useCatalog();
  const [artworks, setArtworks] = useState<AdminArtworkRow[]>([]);
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [a, o] = await Promise.all([fetchAdminArtworks(), fetchAdminOrders()]);
    setArtworks(a);
    setOrders(o);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (
    id: string,
    field: "featured" | "hidden" | "forSale",
    current: boolean,
  ) => {
    setBusy(id);
    const err = await updateArtworkFlags(id, { [field]: !current });
    setBusy(null);
    if (err) {
      showToast(err, "error");
      return;
    }
    showToast("Updated");
    await load();
    await refresh();
  };

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/55 hover:text-white"
        >
          ← Back
        </button>
        <h1 className="mt-3 font-serif text-2xl text-white">Admin</h1>
        <p className="mt-1 text-sm text-white/50">
          Feature, hide, or approve sell flags on catalog works.
        </p>

        <section className="mt-8">
          <h2 className="font-serif text-lg text-white">Recent artworks</h2>
          <div className="mt-3 space-y-3">
            {artworks.map((art) => (
              <div
                key={art.id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <p className="truncate font-medium text-white">{art.title}</p>
                <p className="mt-1 text-xs text-white/45">
                  ♥ {art.like_count} · ★ {art.save_count}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(
                    [
                      ["featured", art.featured, "Feature"],
                      ["hidden", art.hidden, "Hide"],
                      ["forSale", art.for_sale, "Sell"],
                    ] as const
                  ).map(([field, on, label]) => (
                    <button
                      key={field}
                      type="button"
                      disabled={busy === art.id}
                      onClick={() => void toggle(art.id, field, on)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        on
                          ? "bg-white text-ink"
                          : "border border-white/15 text-white/70"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {artworks.length === 0 && (
              <p className="text-sm text-white/40">No artworks loaded.</p>
            )}
          </div>
        </section>

        <section className="mt-8 pb-6">
          <h2 className="font-serif text-lg text-white">Recent orders</h2>
          <div className="mt-3 space-y-2">
            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60"
              >
                {order.artwork_id} · {order.size} · ${order.price ?? "—"} ·{" "}
                {order.status}
              </div>
            ))}
            {orders.length === 0 && (
              <p className="text-sm text-white/40">No orders yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
