/**
 * First-party usage analytics + error reporting.
 * ---------------------------------------------------------------------------
 * Events and errors go to OUR backend (POST /api/telemetry), which rate-limits
 * them and stores them in Supabase for the admin Insights tab. No third-party
 * SDK, no account, nothing personal: every row carries a random per-install id,
 * never the user id, email or IP.
 *
 * App Store privacy label: "Usage Data → Product Interaction" and
 * "Diagnostics → Crash Data", both NOT linked to the user, not used for
 * tracking.
 *
 * Batched: events queue in memory and flush every 15 s, when the queue fills,
 * or when the app goes to the background (keepalive fetch). Losing a few
 * events on a crash is fine — this is for trends, not accounting.
 */
import { Capacitor } from "@capacitor/core";
import { API_URL } from "./api";

const INSTALL_KEY = "narsil.telemetry.install";
const FLUSH_MS = 15_000;
const MAX_QUEUE = 40;
/** Never report more than this many errors per app session (crash loops). */
const MAX_ERRORS_PER_SESSION = 20;
const APP_VERSION = "1.0.0";

export type TelemetryKind = "event" | "error";

interface TelemetryItem {
  kind: TelemetryKind;
  name: string;
  props?: Record<string, string | number | boolean | null>;
  at: string;
}

const queue: TelemetryItem[] = [];
const sessionId = randomId();
let installId: string | null = null;
let errorCount = 0;
const reportedErrors = new Set<string>();
let started = false;

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function getInstallId(): string {
  if (installId) return installId;
  try {
    installId = localStorage.getItem(INSTALL_KEY);
    if (!installId) {
      installId = randomId();
      localStorage.setItem(INSTALL_KEY, installId);
    }
  } catch {
    installId = sessionId;
  }
  return installId;
}

function flush(useKeepalive = false): void {
  if (queue.length === 0) return;
  const items = queue.splice(0, queue.length);
  const body = JSON.stringify({
    installId: getInstallId(),
    sessionId,
    platform: Capacitor.getPlatform(),
    appVersion: APP_VERSION,
    items,
  });
  void fetch(`${API_URL}/api/telemetry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: useKeepalive,
  }).catch(() => {
    // Offline or blocked — drop the batch rather than grow forever.
  });
}

function push(item: TelemetryItem): void {
  queue.push(item);
  if (queue.length >= MAX_QUEUE) flush();
}

/** Record a product event, e.g. track("checkout_step", { step: "payment" }). */
export function track(
  name: string,
  props?: Record<string, string | number | boolean | null>,
): void {
  push({ kind: "event", name, props, at: new Date().toISOString() });
}

/** Report an error. Duplicates within a session are sent once. */
export function reportError(error: unknown, context?: string): void {
  if (errorCount >= MAX_ERRORS_PER_SESSION) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${err.message}|${context ?? ""}`;
  if (reportedErrors.has(key)) return;
  reportedErrors.add(key);
  errorCount++;
  push({
    kind: "error",
    name: err.message.slice(0, 300) || "Unknown error",
    props: {
      context: context ?? null,
      stack: (err.stack ?? "").slice(0, 2000) || null,
      url: typeof location !== "undefined" ? location.pathname : null,
    },
    at: new Date().toISOString(),
  });
  // Errors are what we most want to see — don't wait for the timer.
  flush();
}

/** Install global handlers and the flush timer. Call once at startup. */
export function startTelemetry(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("error", (e) => {
    reportError(e.error ?? e.message, "window.onerror");
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportError(e.reason, "unhandledrejection");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.setInterval(() => flush(), FLUSH_MS);

  track("app_open");
}
