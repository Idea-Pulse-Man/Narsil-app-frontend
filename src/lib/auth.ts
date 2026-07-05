/**
 * Authentication helpers (email/password + Google/Apple OAuth).
 * ---------------------------------------------------------------------------
 * The app already signs users in anonymously (see `userData.ensureSession`) so
 * saved/liked/following work before login. These helpers UPGRADE that guest to
 * a real account when possible so their data carries over.
 *
 * OAuth on iOS: `signInWithOAuth` can't redirect a native WebView the way a
 * browser tab can, so we open the provider in an in-app Safari view and let it
 * deep-link back into the app via the `com.narsil.museum://auth-callback`
 * scheme. `initNativeAuthListener` (called once at startup) catches that
 * redirect and exchanges the PKCE `code` for a session.
 */

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase, IS_NATIVE as isNative } from "./supabase";

export type OAuthProvider = "google" | "apple";

/** Custom URL scheme registered in the iOS project (see Info.plist). */
const NATIVE_REDIRECT = "com.narsil.museum://auth-callback";

function ensureClient() {
  if (!supabase) throw new Error("Authentication is not configured.");
  return supabase;
}

/** Sign in with an existing email + password. */
export async function signInWithEmail(email: string, password: string) {
  return ensureClient().auth.signInWithPassword({ email, password });
}

/**
 * Create an account. If the current session is an anonymous guest we upgrade it
 * in place (`updateUser`) so their saved art carries over; otherwise we do a
 * fresh sign-up. `fullName` is stored in user metadata, which the database
 * trigger copies into `profiles.full_name`.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  fullName?: string,
) {
  const client = ensureClient();
  const metadata = fullName?.trim() ? { full_name: fullName.trim() } : undefined;
  const { data } = await client.auth.getSession();
  if (data.session?.user?.is_anonymous) {
    return client.auth.updateUser({ email, password, data: metadata });
  }
  return client.auth.signUp({
    email,
    password,
    options: metadata ? { data: metadata } : undefined,
  });
}

/** Start an OAuth sign-in. On iOS this opens an in-app browser. */
export async function signInWithProvider(provider: OAuthProvider) {
  const client = ensureClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: isNative ? NATIVE_REDIRECT : window.location.origin,
      // On native we open the URL ourselves instead of a full-page redirect.
      skipBrowserRedirect: isNative,
    },
  });
  if (error) throw error;
  if (isNative && data?.url) {
    await Browser.open({ url: data.url, presentationStyle: "popover" });
  }
}

/** Sign the user out (returns them to an anonymous/guest state on next load). */
export async function signOut() {
  await supabase?.auth.signOut();
}

/**
 * Complete a web sign-in that returned via a redirect (OAuth, magic link, or an
 * email-confirmation link). Reads the `?code=` from the current URL, exchanges
 * it for a session, then strips the auth params so a refresh can't reuse a
 * spent code. Returns true when a session was established. No-ops on native.
 */
export async function completeAuthFromUrl(): Promise<boolean> {
  if (!supabase || isNative || typeof window === "undefined") return false;
  try {
    const parsed = new URL(window.location.href);
    const errorDescription = parsed.searchParams.get("error_description");
    if (errorDescription) {
      console.warn("Auth: redirect returned an error.", errorDescription);
    }
    const code = parsed.searchParams.get("code");
    if (!code) return false;

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    // Clean the URL regardless, so the spent code doesn't linger / retry.
    for (const key of ["code", "error", "error_code", "error_description"]) {
      parsed.searchParams.delete(key);
    }
    window.history.replaceState(
      {},
      "",
      parsed.pathname + parsed.search + parsed.hash,
    );

    if (error) {
      console.warn("Auth: code exchange failed.", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Auth: failed to complete redirect sign-in.", err);
    return false;
  }
}

let listenerRegistered = false;

/**
 * Register the deep-link listener that completes native OAuth. Safe to call
 * multiple times; only the first call takes effect and it no-ops on web.
 */
export function initNativeAuthListener() {
  if (!isNative || listenerRegistered || !supabase) return;
  listenerRegistered = true;
  const client = supabase;

  void App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(NATIVE_REDIRECT)) return;
    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get("code");
      if (code) {
        await client.auth.exchangeCodeForSession(code);
      }
    } catch (err) {
      console.warn("Auth: failed to complete OAuth redirect.", err);
    } finally {
      // Close the in-app Safari view now that we're back in the app.
      try {
        await Browser.close();
      } catch {
        /* browser already closed */
      }
    }
  });
}
