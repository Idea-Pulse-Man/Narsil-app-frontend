/**
 * Supabase client.
 * ---------------------------------------------------------------------------
 * Reads the project URL + publishable (client-safe) key from env. If either is
 * missing the app simply runs on localStorage — every caller checks
 * `SUPABASE_ENABLED` / a null client and falls back gracefully.
 *
 * Tables (run `supabase/schema.sql` in the Supabase SQL editor):
 *   collections(user_id, artwork_id, kind)   -- kind: 'saved' | 'liked'
 *   follows(user_id, artist_id)
 *
 * Auth: v1 uses anonymous sign-in so each device gets a real user id (and Row
 * Level Security works) without a login screen. Step 6 upgrades these anonymous
 * users to real email/social accounts.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_ENABLED = Boolean(url && key);

// OAuth + email confirmation both return with a `?code=` that must be exchanged
// for a session (PKCE flow). We do this exchange ourselves — on native via the
// deep-link listener, on web via `completeAuthFromUrl` — so we can surface
// errors and strip the code from the URL. Hence `detectSessionInUrl: false`.
export const IS_NATIVE = Capacitor.isNativePlatform();

export const supabase: SupabaseClient | null = SUPABASE_ENABLED
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        flowType: "pkce",
        detectSessionInUrl: false,
      },
      realtime: {
        params: { eventsPerSecond: 20 },
      },
    })
  : null;
