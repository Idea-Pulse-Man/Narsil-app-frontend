import { useState } from "react";
import { motion } from "framer-motion";
import { categories, type CategoryId, type ArtworkOrigin } from "@/data";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import type { ToastState } from "./Toast";

interface CreateViewProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

/**
 * v1 artist posting flow — local/mock only (nothing is uploaded or persisted).
 * FUTURE (v1.1 / v2): real image upload to storage, moderation/review queue,
 * and rich media posts (video + music) — intentionally out of scope for v1.0.
 */
const ORIGIN_OPTIONS: { value: ArtworkOrigin; label: string }[] = [
  { value: "artist-original", label: "Original" },
  { value: "public-domain", label: "Public Domain" },
  { value: "fan-study", label: "Fan Study" },
];

export default function CreateView({ showToast }: CreateViewProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategoryId>("paintings");
  const [origin, setOrigin] = useState<ArtworkOrigin>("artist-original");
  const [hasImage, setHasImage] = useState(false);

  const canPublish = title.trim().length > 0 && description.trim().length > 0;

  const handlePublish = () => {
    if (!canPublish) return;
    showToast("Post submitted (demo)");
    setTitle("");
    setDescription("");
    setCategory("paintings");
    setOrigin("artist-original");
    setHasImage(false);
  };

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Contribute
        </p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
          Create
        </h1>
        <p className="mt-2 max-w-[92%] text-[15px] leading-relaxed text-white/60">
          Post your own artwork to Narsil. Freelance creators can share originals,
          studies, and curated public-domain finds.
        </p>

        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            setHasImage(true);
            showToast("Image selected (demo)");
          }}
          className={`mt-6 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-10 transition-colors ${
            hasImage
              ? "border-emerald-400/40 bg-emerald-400/10"
              : "border-white/15 bg-white/[0.02] hover:border-white/25"
          }`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-2xl text-white/70">
            +
          </span>
          <span className="text-sm font-medium text-white/80">
            {hasImage ? "Image ready" : "Upload artwork image"}
          </span>
          <span className="text-xs text-white/40">JPG or PNG · max 10 MB</span>
        </motion.button>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handlePublish();
          }}
        >
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Concentric Hours"
              className="field-input"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell the story behind this work…"
              rows={4}
              className="field-input resize-none"
            />
          </Field>

          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryId)}
              className="field-input appearance-none"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="bg-ink-soft text-white">
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
              Type
            </span>
            <div className="mt-2 flex gap-2">
              {ORIGIN_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOrigin(opt.value)}
                  className={`flex-1 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                    origin === opt.value
                      ? "bg-white text-ink"
                      : "border border-white/15 bg-white/5 text-white/70 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <motion.button
            type="submit"
            disabled={!canPublish}
            whileTap={canPublish ? { scale: 0.98 } : undefined}
            className="mt-2 flex w-full items-center justify-center rounded-full bg-white py-3.5 text-sm font-semibold text-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Post to Narsil
          </motion.button>
        </form>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-white/30">
          Demo only — posts aren&apos;t uploaded or saved. Video &amp; music
          posting are planned for a future release.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
