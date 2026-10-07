/**
 * iPhone push notifications (Capacitor PushNotifications → APNs).
 * ---------------------------------------------------------------------------
 * The backend sends: daily quiz / streak reminders, "your print has shipped",
 * and "new paid order" to admins (narsil-museum-backend services/push.ts).
 * This side asks permission, registers the device token against the signed-in
 * account (register_push_token, supabase/push-notifications.sql) and routes
 * a tapped notification to the right screen.
 *
 * Permission is asked at moments where the value is obvious — right after
 * buying a print ("we'll tell you when it ships") or finishing the daily quiz
 * ("we'll remind you tomorrow") — never on first launch. iOS only shows its
 * dialog once; after that the choice lives in iOS Settings.
 */
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "./supabase";

/** Payload keys the backend sets on a notification. */
export interface PushTap {
  type?: "quiz" | "orders" | "artwork" | "admin_orders" | string;
  id?: string;
}

export type PushPermission = "granted" | "denied" | "prompt" | "unsupported";

const isIos = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

let listenersReady = false;
let tapHandler: ((tap: PushTap) => void) | null = null;
let pendingTap: PushTap | null = null;

async function saveToken(token: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("register_push_token", {
    p_token: token,
    p_platform: "ios",
  });
  if (error) console.warn("Push: token not saved.", error.message);
}

function addListeners(): void {
  if (listenersReady) return;
  listenersReady = true;
  void PushNotifications.addListener("registration", ({ value }) => {
    void saveToken(value);
  });
  void PushNotifications.addListener("registrationError", (err) => {
    console.warn("Push: registration failed.", err.error);
  });
  void PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = (action.notification.data ?? {}) as PushTap;
    if (tapHandler) tapHandler(data);
    else pendingTap = data; // tapped from a cold start, before the shell mounted
  });
}

export async function pushPermission(): Promise<PushPermission> {
  if (!isIos()) return "unsupported";
  const { receive } = await PushNotifications.checkPermissions();
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  return "prompt";
}

/**
 * Call once the shell is mounted (and again when the account changes): wires
 * the tap handler and, if permission was already given, re-registers so the
 * token is stored against the current account.
 */
export async function initPush(onTap: (tap: PushTap) => void): Promise<void> {
  if (!isIos()) return;
  tapHandler = onTap;
  addListeners();
  if (pendingTap) {
    onTap(pendingTap);
    pendingTap = null;
  }
  if ((await pushPermission()) === "granted") await PushNotifications.register();
}

/**
 * Ask for permission if iOS hasn't asked yet, then register. Returns whether
 * notifications are on. Safe to call repeatedly — iOS shows its dialog once.
 */
export async function enablePush(): Promise<boolean> {
  if (!isIos()) return false;
  addListeners();
  let state = await pushPermission();
  if (state === "prompt") {
    const { receive } = await PushNotifications.requestPermissions();
    state = receive === "granted" ? "granted" : "denied";
  }
  if (state !== "granted") return false;
  await PushNotifications.register();
  return true;
}

/** Ask at a good moment — only when iOS hasn't asked before. */
export async function askForPushAfter(_moment: "order" | "quiz"): Promise<void> {
  try {
    if ((await pushPermission()) === "prompt") await enablePush();
  } catch {
    // Plugin missing in this build — notifications just stay off.
  }
}
