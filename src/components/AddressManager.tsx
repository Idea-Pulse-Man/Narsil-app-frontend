import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  fetchAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  type Address,
} from "@/lib/orders";
import { addressProblem, normalizeAddress } from "@/lib/address";
import { SHIPPING_COUNTRIES, SHIPPING_COUNTRY, subdivisionsFor } from "@/lib/countries";
import { CloseIcon, CheckIcon } from "./Icons";
import type { ToastState } from "./Toast";

interface AddressManagerProps {
  open: boolean;
  onClose: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

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

type FormState = typeof EMPTY_FORM;

function toForm(a: Address): FormState {
  return {
    recipient_name: a.recipient_name ?? "",
    phone: a.phone ?? "",
    line1: a.line1 ?? "",
    line2: a.line2 ?? "",
    city: a.city ?? "",
    region: a.region ?? "",
    postal_code: a.postal_code ?? "",
    country: a.country ?? "",
  };
}

export default function AddressManager({
  open,
  onClose,
  showToast,
}: AddressManagerProps) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  // null = list view; "new" = adding; string id = editing that address.
  const [editing, setEditing] = useState<null | "new" | string>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const list = await fetchAddresses();
      if (cancelled) return;
      setAddresses(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const refresh = async () => {
    const list = await fetchAddresses();
    setAddresses(list);
  };

  const setField = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Only US/CA/AU need a state code; everywhere else keeps a free-text field.
  const states = subdivisionsFor(form.country);

  const startAdd = () => {
    setForm({ ...EMPTY_FORM });
    setEditing("new");
  };

  const startEdit = (a: Address) => {
    setForm(toForm(a));
    setEditing(a.id);
  };

  const save = async () => {
    // Same rules the backend enforces at checkout — catching them here means a
    // saved address is always one Printful can actually ship to.
    const problem = addressProblem(form);
    if (problem) {
      showToast(problem, "error");
      return;
    }
    const clean = normalizeAddress(form);
    setBusy(true);
    try {
      if (editing === "new") {
        await createAddress({ ...clean, is_default: addresses.length === 0 });
        showToast("Address added");
      } else if (editing) {
        await updateAddress(editing, clean);
        showToast("Address updated");
      }
      await refresh();
      setEditing(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not save", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await deleteAddress(id);
      await refresh();
      showToast("Address removed");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not delete", "error");
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (id: string) => {
    setBusy(true);
    try {
      await setDefaultAddress(id);
      await refresh();
      showToast("Default address set");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not update", "error");
    } finally {
      setBusy(false);
    }
  };

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

            <div className="px-6 pb-8 pt-3">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl text-white">
                  {editing ? "Address details" : "Delivery addresses"}
                </h2>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="relative flex h-8 w-8 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white after:absolute after:-inset-2 after:content-['']"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>

              {/* LIST VIEW */}
              {!editing && (
                <div className="mt-5">
                  {loading ? (
                    <p className="py-8 text-center text-sm text-white/45">
                      Loading…
                    </p>
                  ) : addresses.length === 0 ? (
                    <p className="py-6 text-center text-sm text-white/45">
                      No addresses yet. Add one for faster canvas checkout.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {addresses.map((a) => (
                        <div
                          key={a.id}
                          className="rounded-2xl border border-white/12 bg-white/[0.03] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 text-sm font-medium text-white">
                                <span className="truncate">
                                  {a.recipient_name || a.label}
                                </span>
                                {a.is_default && (
                                  <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/80">
                                    Default
                                  </span>
                                )}
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-white/50">
                                {[
                                  a.line1,
                                  a.line2,
                                  a.city,
                                  a.region,
                                  a.postal_code,
                                  a.country,
                                ]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {!a.is_default && (
                              <button
                                disabled={busy}
                                onClick={() => makeDefault(a.id)}
                                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 transition-colors hover:text-white disabled:opacity-50"
                              >
                                Set default
                              </button>
                            )}
                            <button
                              disabled={busy}
                              onClick={() => startEdit(a)}
                              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 transition-colors hover:text-white disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => remove(a.id)}
                              className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300 transition-colors hover:text-red-200 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={startAdd}
                    className="mt-4 w-full rounded-full bg-accent py-3.5 text-sm font-semibold text-ink transition-transform active:scale-[0.98]"
                  >
                    Add a new address
                  </button>
                </div>
              )}

              {/* FORM VIEW */}
              {editing && (
                <div className="mt-5 space-y-2">
                  <Input
                    placeholder="Full name"
                    value={form.recipient_name}
                    onChange={(v) => setField("recipient_name", v)}
                  />
                  <Input
                    placeholder="Address line 1"
                    value={form.line1}
                    onChange={(v) => setField("line1", v)}
                  />
                  <Input
                    placeholder="Address line 2 (optional)"
                    value={form.line2}
                    onChange={(v) => setField("line2", v)}
                  />
                  <Select
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
                    <Input
                      placeholder="City"
                      value={form.city}
                      onChange={(v) => setField("city", v)}
                    />
                    {states ? (
                      <Select
                        label="State / province"
                        value={form.region}
                        options={states}
                        onChange={(v) => setField("region", v)}
                      />
                    ) : (
                      <Input
                        placeholder="State / region (optional)"
                        value={form.region}
                        onChange={(v) => setField("region", v)}
                      />
                    )}
                  </div>
                  <Input
                    placeholder="Postal code"
                    value={form.postal_code}
                    onChange={(v) => setField("postal_code", v)}
                  />
                  <Input
                    placeholder="Phone"
                    value={form.phone}
                    onChange={(v) => setField("phone", v)}
                  />

                  <div className="flex items-center gap-3 pt-3">
                    <button
                      onClick={() => setEditing(null)}
                      className="flex-1 rounded-full border border-white/15 bg-white/5 py-3.5 text-sm font-medium text-white/80 transition-colors hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={save}
                      disabled={busy}
                      className="flex flex-[1.4] items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-sm font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
                    >
                      {busy ? (
                        "Saving…"
                      ) : (
                        <>
                          <CheckIcon className="h-4 w-4" />
                          Save address
                        </>
                      )}
                    </button>
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

function Input({
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
      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/45 transition-colors focus:border-white/25 focus:outline-none"
    />
  );
}

/**
 * Native <select> so iOS shows its own picker wheel. The options need an
 * explicit dark background — on some platforms the popup is rendered by the OS
 * and doesn't inherit the sheet's styling.
 */
function Select({
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
        value ? "text-white" : "text-white/50"
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
