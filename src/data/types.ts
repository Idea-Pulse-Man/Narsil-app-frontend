/**
 * Core domain types for Narsil v1.0.
 *
 * Everything here is plain, serializable data so it can be sourced from local
 * mock files today and swapped for a Supabase query later without touching the
 * UI. See `src/lib/supabase.ts` for the planned integration shape.
 */

export type ArtistProfileType = "historical" | "freelance";

export interface Artist {
  id: string;
  name: string;
  initials: string;
  /** "historical" → museum master; "freelance" → contemporary creator. */
  profileType: ArtistProfileType;
  /** Lifespan for historical artists; "Joined 2025" style text for freelance. */
  lifespan: string;
  nationality: string;
  period: string;
  style: string;
  knownFor: string;
  bio: string;
  /** Mock social proof — rendered on the profile, persisted nowhere in v1. */
  followers: number;
  likes: number;
  saves: number;
  /** Avatar background for freelance artists (no portrait artwork). */
  accent?: string;
  /**
   * Profile picture (self-portrait / photo) for the action rail and profile
   * header. Optional — artists without a portrait (anonymous/ancient/freelance)
   * fall back to a representative artwork, then to initials.
   */
  avatar?: string;
}

/** How a piece entered the catalogue — drives the badge on the feed card. */
export type ArtworkOrigin = "public-domain" | "artist-original" | "fan-study";

/** Top-level browse categories surfaced on the Discover page. */
export type CategoryId =
  | "paintings"
  | "sculptures"
  | "pottery"
  | "etching-writing-books"
  | "roman"
  | "greek"
  | "egyptian"
  | "renaissance"
  | "japanese-art"
  | "modern-art";

export interface Artwork {
  id: string;
  title: string;
  artistId: string;
  year: string;
  /** Art-historical period, e.g. "Renaissance", "Edo Period". */
  period: string;
  medium: string;
  source: string;
  image: string;
  /** Dominant color used for the blur-up placeholder background. */
  accent: string;
  description: string;
  tags: string[];
  /** Primary browse category. */
  category: CategoryId;
  origin: ArtworkOrigin;
  /** Ancient civilisation / empire, when applicable (Roman, Greek, Egyptian…). */
  empire?: string;
}
