/**
 * Follow the iPhone's text size setting (Settings → Display & Brightness →
 * Text Size, or Accessibility → Larger Text).
 *
 * The WebView ignores Dynamic Type on its own, so the app reads the user's
 * preferred zoom with @capacitor/text-zoom and applies it to the page — at
 * launch and whenever the app comes back to the foreground (the user may
 * have changed it in Settings meanwhile). Clamped so the largest
 * accessibility sizes don't push buttons off small screens; the clamp still
 * gives a clear step up from the default.
 */
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { TextZoom } from "@capacitor/text-zoom";

const MIN_ZOOM = 0.85;
const MAX_ZOOM = 1.35;

async function applyPreferredTextSize(): Promise<void> {
  try {
    const { value } = await TextZoom.getPreferred();
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value || 1));
    await TextZoom.set({ value: zoom });
  } catch {
    // Plugin missing in this build — default text size.
  }
}

/** Call once at startup. No-op on the web, where the browser handles zoom. */
export function followSystemTextSize(): void {
  if (!Capacitor.isNativePlatform()) return;
  void applyPreferredTextSize();
  void App.addListener("resume", () => {
    void applyPreferredTextSize();
  });
}
