import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { categories, type CategoryId, type ArtworkOrigin } from "@/data";
import { WORLD } from "@/data/worldCopy";
import { useCatalog } from "@/data/catalog";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { useAppState } from "./AppState";
import {
  uploadArtworkImage,
  ensureArtistForUser,
  createArtwork,
  setArtistSellOptIn,
} from "@/lib/artworkUpload";
import { addCommunityTag } from "@/lib/tags";
import ContactAdminSheet from "./ContactAdminSheet";
import type { ToastState } from "./Toast";

interface CreateViewProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
  /** Called after a successful post so the shell can jump away from Create. */
  onPublished?: () => void;
}

/**
 * Artist posting flow — uploads the image to Supabase Storage and inserts a row
 * into `artworks`, attributed to the user's freelance artist profile.
 * Only Explorer's Guild (Pro) members may publish; posts wait for admin approval.
 */
const ORIGIN_OPTIONS: { value: ArtworkOrigin; label: string }[] = [
  { value: "artist-original", label: "Original" },
  { value: "public-domain", label: "Public Domain" },
  { value: "fan-study", label: "Fan Study" },
];

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export default function CreateView({ showToast, onPublished }: CreateViewProps) {
  const { isGuest, isPro, profile, user, requestPro, requestSignIn } = useAppState();
  const { refresh } = useCatalog();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategoryId>("paintings");
  const [origin, setOrigin] = useState<ArtworkOrigin>("artist-original");
  const [forSale, setForSale] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canPublish =
    isPro &&
    !isGuest &&
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    !busy;

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      showToast("Image too large (max 10 MB)", "error");
      return;
    }
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const reset = () => {
    setTitle("");
    setDescription("");
    setCategory("paintings");
    setOrigin("artist-original");
    setForSale(false);
    setTagInput("");
    setTags([]);
    setImageFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePublish = async () => {
    if (isGuest) {
      requestSignIn();
      return;
    }
    if (!isPro) {
      requestPro("create-upload");
      return;
    }
    if (!canPublish) return;
    setBusy(true);
    try {
      const imageUrl = imageFile ? await uploadArtworkImage(imageFile) : null;
      const authorName =
        profile?.full_name ?? user?.email?.split("@")[0] ?? "Artist";
      const artistId = await ensureArtistForUser(authorName);
      if (artistId && forSale) {
        await setArtistSellOptIn(artistId, true);
      }
      const { data, error } = await createArtwork({
        title: title.trim(),
        description: description.trim(),
        imageUrl,
        category,
        origin,
        artistId,
        forSale: origin === "artist-original" ? forSale : false,
        tags,
      });
      if (error) {
        showToast(error.message, "error");
        return;
      }
      const artworkId = data?.id as string | undefined;
      if (artworkId) {
        for (const tag of tags) {
          await addCommunityTag(artworkId, tag);
        }
      }
      showToast("Submitted for admin review");
      reset();
      await refresh();
      onPublished?.();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to publish",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  if (isGuest || !isPro) {
    return (
      <div className={screenScrollClass}>
        <div className={screenContentClass}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Contribute
          </p>
          <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
            Create
          </h1>
          <div className="mt-8 rounded-2xl border border-accent/30 bg-accent/10 p-5">
            <h2 className="font-serif text-xl text-white">
              {WORLD.explorersGuild} only
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Uploading artwork is a Guild benefit. Subscribe to submit originals
              for admin review, then contact us if you need help.
            </p>
            <button
              type="button"
              onClick={() => {
                if (isGuest) {
                  requestSignIn();
                  return;
                }
                requestPro("create-upload");
              }}
              className="mt-5 w-full rounded-full bg-accent py-3.5 text-sm font-semibold text-ink"
            >
              {isGuest ? "Sign in to continue" : `Join ${WORLD.explorersGuild}`}
            </button>
            {!isGuest && (
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className="mt-3 w-full rounded-full border border-white/15 py-3 text-sm text-white/70"
              >
                Contact admin
              </button>
            )}
          </div>
          <ContactAdminSheet
            open={contactOpen}
            onClose={() => setContactOpen(false)}
            showToast={showToast}
            emailSubject="Narsil Create / Guild question"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Contribute
        </p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
          Create
        </h1>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={pickImage}
          className="hidden"
        />
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-6 flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed transition-colors ${
            previewUrl
              ? "border-emerald-400/40 bg-emerald-400/10 p-0"
              : "border-white/15 bg-white/[0.02] py-10 hover:border-white/25"
          }`}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Selected artwork"
              className="max-h-64 w-full object-contain"
            />
          ) : (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-2xl text-white/70">
                +
              </span>
              <span className="text-sm font-medium text-white/80">
                Upload artwork image
              </span>
              <span className="text-xs text-white/50">
                JPG or PNG · max 10 MB
              </span>
            </>
          )}
        </motion.button>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handlePublish();
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
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
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
                      ? "bg-accent text-ink"
                      : "border border-white/15 bg-white/5 text-white/70 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {origin === "artist-original" && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <input
                type="checkbox"
                checked={forSale}
                onChange={(e) => setForSale(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-medium text-white">
                  Sell prints on Narsil
                </span>
                <span className="mt-0.5 block text-xs text-white/45">
                  Opt in to offer canvas prints. You receive 30% of each sale.
                </span>
              </span>
            </label>
          )}

          <Field label="Tags">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTags((t) => t.filter((x) => x !== tag))}
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white"
                >
                  {tag} ×
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const t = tagInput.trim().toLowerCase();
                    if (t && !tags.includes(t)) setTags([...tags, t]);
                    setTagInput("");
                  }
                }}
                placeholder="Add a tag and press Enter"
                className="field-input flex-1"
              />
            </div>
          </Field>

          <motion.button
            type="submit"
            disabled={!canPublish}
            whileTap={canPublish ? { scale: 0.98 } : undefined}
            className="mt-2 flex w-full items-center justify-center rounded-full bg-accent py-3.5 text-sm font-semibold text-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Submitting…" : "Submit for review"}
          </motion.button>
        </form>

        <button
          type="button"
          onClick={() => setContactOpen(true)}
          className="mt-5 w-full text-center text-sm text-white/55 underline-offset-2 hover:text-white/80 hover:underline"
        >
          Contact admin
        </button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-white/50">
          Posts stay hidden until an admin approves them. Email support first, or
          use live chat as a last option.
        </p>

        <ContactAdminSheet
          open={contactOpen}
          onClose={() => setContactOpen(false)}
          showToast={showToast}
          emailSubject="Narsil artwork submission"
        />
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
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
