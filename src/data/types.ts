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
  /**
   * Famous work titles (Wikipedia / Wikidata) shown on For You artist story
   * cards — e.g. "Starry Night", "Sunflowers".
   */
  famousWorks?: string[];
  /**
   * True when the AWS artist-profile cron stored a real person photograph and
   * a detailed Wikipedia bio. Artist story cards only appear when this is set.
   */
  profileReady?: boolean;
  /**
   * Seeded at ingest because museum APIs have no social graph. The profile
   * does not show these — it uses live follows plus likes and saves on works.
   */
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
  /**
   * When true, never resolve an online portrait for this artist — show the
   * monogram instead. Used for entities that have no likeness of the person:
   * anonymous workshops and ancient figures known only by their work (looking
   * them up returns their artwork, not a face).
   */
  noLookup?: boolean;
  /** Whether this artist opted in to selling prints on Narsil. */
  sellOptIn?: boolean;
  /** Artist revenue share percentage on print sales (default 30). */
  revenueSharePct?: number;
}

/** Denormalized artist story card for the For You snap feed. */
export interface FypArtistCard {
  id: string;
  artistId: string;
  name: string;
  lifespan?: string;
  nationality?: string;
  portraitUrl: string;
  famousFor?: string;
  bio: string;
  backdropArtworkId?: string;
  backdropImageUrl?: string;
  backdropTitle?: string;
  active: boolean;
  sortOrder: number;
}

/** How a piece entered the catalogue — drives the badge on the feed card. */
export type ArtworkOrigin = "public-domain" | "artist-original" | "fan-study";

/** Top-level browse categories — the Search filter keys and Create's category picker. */
export type CategoryId =
  | "paintings"
  | "sculptures"
  | "pottery"
  | "etching-writing-books"
  | "roman"
  | "greek"
  | "egyptian"
  | "renaissance"
  | "medieval"
  | "japanese-art"
  | "modern-art";

export type UserRole = "user" | "admin";

export interface Artwork {
  id: string;
  title: string;
  artistId: string;
  year: string;
  /** Art-historical period, e.g. "Renaissance", "Edo Period". */
  period: string;
  medium: string;
  source: string;
  /** Display image — the staged S3 copy (843px). Not the print/download master. */
  image: string;
  /**
   * The museum's own image URL, which full-resolution downloads and canvas
   * print files are derived from. Resolved server-side; the app only needs it
   * to know whether a high-resolution version exists at all.
   */
  sourceImage?: string;
  /** Master pixel dimensions when known — shown on the download sheet. */
  imageWidth?: number;
  imageHeight?: number;
  /** Dominant color used for the blur-up placeholder background. */
  accent: string;
  description: string;
  tags: string[];
  /** Primary browse category. */
  category: CategoryId;
  origin: ArtworkOrigin;
  /** Ancient civilisation / empire, when applicable (Roman, Greek, Egyptian…). */
  empire?: string;
  /** Engagement counters from Supabase (0 when unavailable). */
  likeCount?: number;
  saveCount?: number;
  /** Admin-curated: always show in feed regardless of engagement. */
  featured?: boolean;
  /** Admin-hidden from default feed (still searchable). */
  hidden?: boolean;
  /** Freelance works opted in for canvas sales. Museum PD when on the legal allowlist. */
  forSale?: boolean;
  /** AI-generated placard copy when available (Phase 6). */
  aiDescription?: string;
  /** Community tags merged at read time. */
  communityTags?: string[];
}
