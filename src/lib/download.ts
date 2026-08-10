import type { Artwork } from "@/data";
import type { ToastState } from "@/components/Toast";
import { API_URL } from "@/lib/api";
import { ngrokFetch } from "@/lib/ngrok";
import { supabase } from "@/lib/supabase";

type ShowToast = (message: string, variant?: ToastState["variant"]) => void;

/**
 * Bearer token when signed in, nothing when not. The standard tier is public,
 * so an anonymous download must still work — the header only decides whether
 * the high tier can be authorised.
 */
async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Query-param key a shared link uses to deep-link into a single artwork. */
export const SHARE_ART_PARAM = "art";

/**
 * Build a link that, when opened by anyone, boots the app straight into this
 * artwork's viewer. `MobileShell` reads `?art=<id>` on load and opens it.
 */
export function buildArtworkShareUrl(artworkId: string): string {
  if (typeof window === "undefined") return "";
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?${SHARE_ART_PARAM}=${encodeURIComponent(artworkId)}`;
}

/**
 * Share an artwork via the native share sheet when available, otherwise copy a
 * deep link to the clipboard. The shared URL opens straight into this artwork.
 */
export async function shareArtwork(
  artworkId: string,
  artworkTitle: string,
  showToast: ShowToast,
): Promise<void> {
  const url = buildArtworkShareUrl(artworkId);
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({
        title: artworkTitle,
        text: `${artworkTitle} — on Narsil`,
        url,
      });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard && url) {
      await navigator.clipboard.writeText(url);
      showToast("Link copied to clipboard");
      return;
    }
    showToast("Sharing isn't available here");
  } catch {
    // User dismissed the native share sheet — no toast needed.
  }
}

/**
 * Return the largest available version of the image. Wikimedia's
 * `Special:FilePath` serves the full original when no `?width=` is present, so
 * we strip any sizing param we added for display. Other hosts (S3, etc.) are
 * already full-size, so they're returned unchanged.
 */
function fullResUrl(src: string): string {
  if (src.includes("commons.wikimedia.org/wiki/Special:FilePath")) {
    return src.replace(/([?&])width=\d+/g, "$1").replace(/[?&]$/, "");
  }
  return src;
}

/** Turn a title into a filesystem-friendly base name. */
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "artwork";
}

/** Pick a file extension from a blob MIME type, defaulting to jpg. */
function extForType(type: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg",
  };
  return map[type] || "jpg";
}

// The File System Access API (showSaveFilePicker) isn't in the default TS lib.
interface SaveFilePickerWindow {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

/** Trigger a classic browser download to the default folder (fallback path). */
function anchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Which of the two download tiers to request. */
export type DownloadTier = "standard" | "high";

/** Raised when the high-resolution tier is requested without Guild membership. */
export class ProRequiredError extends Error {
  constructor() {
    super("Master File extracts are an Explorer's Guild feature.");
    this.name = "ProRequiredError";
  }
}

/**
 * Human-readable size for the download sheet.
 *
 * The standard tier is a genuine 2000px downscale served by the museum's own
 * image server — not the same file relabelled — so the two options really do
 * differ. When the master's dimensions are known we show them, because
 * "3,842 × 5,120" is both more persuasive and more honest than "4K", which
 * would be false for the scans that top out around 2400px.
 */
export function describeTier(artwork: Artwork, tier: DownloadTier): string {
  if (tier === "standard") return "2000 px · JPEG";
  if (artwork.imageWidth && artwork.imageHeight) {
    return `${artwork.imageWidth.toLocaleString()} × ${artwork.imageHeight.toLocaleString()} px`;
  }
  return "Full resolution";
}

/**
 * Download an artwork image to the user's device via the backend proxy so S3
 * CORS does not block the fetch. In browsers that support the File System Access
 * API the user gets a "Save As" dialog; elsewhere it falls back to a standard
 * download. Freelance originals require the artist's permission and are blocked.
 *
 * `tier: "high"` requests the museum master and requires an active Narsil Pro
 * subscription — the backend checks entitlement itself and answers 402, which
 * surfaces here as `ProRequiredError` for the caller to turn into a paywall.
 */
export async function downloadArtwork(
  artwork: Artwork,
  showToast: ShowToast,
  tier: DownloadTier = "standard",
): Promise<void> {
  if (artwork.origin === "artist-original") {
    showToast("Extract needs the artist's permission");
    return;
  }

  const downloadUrl =
    `${API_URL}/api/artworks/${encodeURIComponent(artwork.id)}/download` +
    `?res=${tier}`;

  let blob: Blob;
  try {
    const res = await ngrokFetch(downloadUrl, {
      mode: "cors",
      headers: await authHeaders(),
    });
    if (res.status === 403) {
      showToast("Extract needs the artist's permission");
      return;
    }
    if (res.status === 402) {
      // Let the caller open the paywall — a toast here would bury the offer.
      throw new ProRequiredError();
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    blob = await res.blob();
  } catch (err) {
    if (err instanceof ProRequiredError) throw err;
    // Last resort — open the display image so the user can save manually.
    const fallback = fullResUrl(artwork.image);
    if (typeof window !== "undefined") window.open(fallback, "_blank", "noopener");
    showToast("Opened image in a new tab to save");
    return;
  }

  const ext = extForType(blob.type);
  const filename = `${slugify(artwork.title)}${tier === "high" ? "-hires" : ""}.${ext}`;
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;

  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [
          {
            description: "Image",
            accept: { [blob.type || "image/jpeg"]: [`.${ext}`] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      showToast(`"${artwork.title}" saved`);
      return;
    } catch (err) {
      // AbortError = user cancelled the dialog; stay silent in that case.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Any other picker failure falls through to the classic download.
    }
  }

  anchorDownload(blob, filename);
  showToast(`"${artwork.title}" downloaded`);
}
