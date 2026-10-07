import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { Artwork } from "@/data";
import type { ToastState } from "@/components/Toast";
import { API_URL } from "@/lib/api";
import { ngrokFetch } from "@/lib/ngrok";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/telemetry";

type ShowToast = (message: string, variant?: ToastState["variant"]) => void;

export type DownloadProgress = {
  /** Bytes received so far. */
  received: number;
  /** Total from Content-Length when known; 0 if unknown. */
  total: number;
};

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
 * Build a link that, when opened by anyone, lands on this artwork. It points
 * at the backend's share page (`/share/:id`), which gives WhatsApp / iMessage
 * a picture preview, opens the iPhone app when installed (Universal Links)
 * and otherwise forwards to the web app's `?art=<id>`. Never the WebView's
 * own origin — on iOS that is `capacitor://localhost`, useless to anyone else.
 */
export function buildArtworkShareUrl(artworkId: string): string {
  return `${API_URL}/share/${encodeURIComponent(artworkId)}`;
}

/** The artwork id in a share link (`…/share/<id>`), or null. */
export function artworkIdFromShareUrl(url: string): string | null {
  const match = url.match(/\/share\/([^/?#]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Chrome/Edge on Windows desktop expose `navigator.share`, but that opens the
 * OS "Share link" overlay. That sheet often never finishes loading (grey
 * placeholders) and stays modal, so the app looks frozen. Copy the link
 * instead; native Capacitor / mobile Web Share still use the system sheet.
 */
function windowsShareSheetIsUnreliable(): boolean {
  if (typeof navigator === "undefined") return false;
  if (Capacitor.isNativePlatform()) return false;
  return /Windows/i.test(navigator.userAgent) && !/Mobile/i.test(navigator.userAgent);
}

function isShareAbort(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: string }).name === "AbortError"
  );
}

async function copyShareLink(url: string, showToast: ShowToast): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard || !url) return false;
  await navigator.clipboard.writeText(url);
  showToast("Link copied to clipboard");
  return true;
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
  track("share_artwork");
  const payload = {
    title: artworkTitle,
    text: `${artworkTitle} — on Narsil`,
    url,
  };

  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Share.canShare();
      if (value) {
        await Share.share({
          ...payload,
          dialogTitle: "Share artwork",
        });
        return;
      }
    }

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      !windowsShareSheetIsUnreliable()
    ) {
      await navigator.share(payload);
      return;
    }

    if (await copyShareLink(url, showToast)) return;
    showToast("Sharing isn't available here");
  } catch (err) {
    // User dismissed the native share sheet — no toast needed.
    if (isShareAbort(err)) return;
    try {
      if (await copyShareLink(url, showToast)) return;
    } catch {
      /* clipboard may also be blocked */
    }
    showToast("Sharing isn't available here");
  }
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
interface FileSystemWritable {
  write: (data: BufferSource | Blob) => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
}

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<FileSystemWritable>;
  }>;
}

type SaveOutcome = "saved" | "shared" | "cancelled" | "unavailable";

/**
 * Classic <a download> fallback for desktop browsers. Delay revoke — some
 * browsers cancel the download if the blob URL disappears immediately.
 * Does NOT work reliably inside iOS WKWebView.
 */
function anchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Raw base64 (no data: prefix) for Capacitor Filesystem on native. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /cancel|dismiss|abort/i.test(msg);
}

/**
 * iOS / Android (and mobile Safari): hand the image to the system share sheet
 * so the user can Save Image, Save to Files, AirDrop, etc.
 *
 * Prefer Web Share Level 2 with a File (no base64 doubling). Fall back to
 * Capacitor Filesystem + Share for WKWebView builds where canShare(files)
 * is missing.
 */
async function saveViaShareSheet(
  blob: Blob,
  filename: string,
  title: string,
): Promise<SaveOutcome> {
  const type = blob.type || "image/jpeg";
  const file = new File([blob], filename, { type });

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (err) {
      if (isAbortError(err)) return "cancelled";
      // Fall through to Capacitor plugins.
    }
  }

  if (!Capacitor.isNativePlatform()) {
    return "unavailable";
  }

  const base64 = await blobToBase64(blob);
  const path = `extracts/${Date.now()}-${filename}`;
  const written = await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });

  try {
    await Share.share({
      title,
      files: [written.uri],
      dialogTitle: "Save artwork",
    });
    return "shared";
  } catch (err) {
    if (isAbortError(err)) return "cancelled";
    throw err;
  } finally {
    // Share reads the file asynchronously — delete after a grace period.
    window.setTimeout(() => {
      void Filesystem.deleteFile({
        path,
        directory: Directory.Cache,
      }).catch(() => {});
    }, 120_000);
  }
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

function parseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain?.[1]?.trim() || fallback;
}

/**
 * Read a fetch body in chunks, reporting progress. Prefer this over
 * `res.blob()` so the UI can show activity and large masters don't feel hung.
 */
async function readBody(
  res: Response,
  onProgress?: (p: DownloadProgress) => void,
): Promise<Blob> {
  const total = Number(res.headers.get("content-length")) || 0;
  const type = res.headers.get("content-type") || "image/jpeg";

  if (!res.body) {
    const blob = await res.blob();
    onProgress?.({ received: blob.size, total: blob.size });
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.({ received, total });
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Blob([bytes], { type });
}

/**
 * Desktop Chromium: stream into Save As. Skipped on native / iOS — the picker
 * API is absent there, and buffering into an <a download> is unreliable in
 * WKWebView.
 */
async function streamToSavePicker(
  res: Response,
  filename: string,
  contentType: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return false;

  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (!picker || !res.body) return false;

  const ext = extForType(contentType);
  let handle;
  try {
    handle = await picker({
      suggestedName: filename,
      types: [
        {
          description: "Image",
          accept: { [contentType || "image/jpeg"]: [`.${ext}`] },
        },
      ],
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    return false;
  }

  const writable = await handle.createWritable();
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  let received = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      await writable.write(value);
      received += value.byteLength;
      onProgress?.({ received, total });
    }
    await writable.close();
    return true;
  } catch (err) {
    try {
      await writable.abort();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

function prefersShareSheetSave(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  // iPhone / iPad Safari (not Capacitor) — <a download> is ignored; share works.
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}

/**
 * Download an artwork image via the backend proxy (avoids S3 CORS).
 *
 *  - Desktop Chromium → Save As (streamed)
 *  - iOS / Capacitor WebView → system share sheet (Save Image / Files)
 *  - Other browsers → classic download
 */
export async function downloadArtwork(
  artwork: Artwork,
  showToast: ShowToast,
  tier: DownloadTier = "standard",
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  if (artwork.origin === "artist-original") {
    showToast("Extract needs the artist's permission");
    return;
  }

  const downloadUrl =
    `${API_URL}/api/artworks/${encodeURIComponent(artwork.id)}/download` +
    `?res=${tier}`;

  let res: Response;
  try {
    res = await ngrokFetch(downloadUrl, {
      mode: "cors",
      headers: await authHeaders(),
    });
  } catch {
    showToast("Could not reach the archive — try again");
    return;
  }

  if (res.status === 403) {
    showToast("Extract needs the artist's permission");
    return;
  }
  if (res.status === 402) {
    throw new ProRequiredError();
  }
  if (res.status === 429) {
    showToast("Download limit reached — try again in a few minutes");
    return;
  }
  if (!res.ok) {
    showToast(`Extract failed (${res.status})`);
    return;
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ext = extForType(contentType);
  const fallbackName = `${slugify(artwork.title)}${tier === "high" ? "-hires" : ""}.${ext}`;
  const filename = parseFilename(
    res.headers.get("content-disposition"),
    fallbackName,
  );

  // Desktop Save As — stream without holding a second full copy when possible.
  if (!prefersShareSheetSave()) {
    try {
      const streamed = await streamToSavePicker(
        res,
        filename,
        contentType,
        onProgress,
      );
      if (streamed) {
        showToast(`"${artwork.title}" saved`);
        return;
      }
    } catch (err) {
      if (isAbortError(err)) return;
      try {
        res = await ngrokFetch(downloadUrl, {
          mode: "cors",
          headers: await authHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        showToast("Extract failed while saving");
        return;
      }
    }
  }

  let blob: Blob;
  try {
    blob = await readBody(res, onProgress);
  } catch {
    showToast("Extract failed while downloading");
    return;
  }

  if (blob.size === 0) {
    showToast("Extract returned an empty file");
    return;
  }

  if (prefersShareSheetSave()) {
    try {
      const outcome = await saveViaShareSheet(blob, filename, artwork.title);
      if (outcome === "cancelled") return;
      if (outcome !== "unavailable") {
        showToast(
          outcome === "shared"
            ? `"${artwork.title}" ready to save`
            : `"${artwork.title}" saved`,
        );
        return;
      }
      // Rare: iOS UA without canShare(files) and not Capacitor — try anchor.
    } catch {
      showToast("Extract failed while saving");
      return;
    }
  }

  try {
    anchorDownload(blob, filename);
    showToast(`"${artwork.title}" downloaded`);
  } catch {
    showToast("Extract failed while saving");
  }
}
