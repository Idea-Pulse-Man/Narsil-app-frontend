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

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_ENABLED = Boolean(url && key);

export const supabase: SupabaseClient | null = SUPABASE_ENABLED
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
