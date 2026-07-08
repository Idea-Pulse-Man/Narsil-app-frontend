import type { Artwork } from "@/data";
import type { ToastState } from "@/components/Toast";

type ShowToast = (message: string, variant?: ToastState["variant"]) => void;

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

/**
 * Download an artwork image to the user's device. In browsers that support the
 * File System Access API the user gets a "Save As" dialog where they choose the
 * folder and name; elsewhere it falls back to a standard download. Freelance
 * originals require the artist's permission and are blocked. If the image can't
 * be fetched (e.g. CORS), the original opens in a new tab so the user can save
 * it manually.
 */
export async function downloadArtwork(
  artwork: Artwork,
  showToast: ShowToast,
): Promise<void> {
  if (artwork.origin === "artist-original") {
    showToast("Download needs the artist's permission");
    return;
  }

  const url = fullResUrl(artwork.image);

  let blob: Blob;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    blob = await res.blob();
  } catch {
    // Cross-origin or network failure — let the user save from a new tab.
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
    showToast("Opened image in a new tab to save");
    return;
  }

  const ext = extForType(blob.type);
  const filename = `${slugify(artwork.title)}.${ext}`;
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
