# Supabase database setup

Every `.sql` file here is run by hand in the **Supabase SQL Editor**, and each one is safe to re-run.
There is no migration tool, so **the order matters**. Several later files replace functions
that earlier files created (the admin overview is rewritten four times), and the version you
apply last is the one that's live.

## Building a database from scratch

Run these in this order. It's the order production was built in, adjusted for each file's
`REQUIRES:` header.

| # | File | What it adds |
|---|------|--------------|
| 1 | `schema.sql` | Core tables: profiles, artists, artworks, collections, orders, RLS |
| 2 | `catalog-columns.sql` | Columns the ingest job writes (source, tags, period, empire…) |
| 3 | `comments.sql` | Per-artwork discussion threads |
| 4 | `seen.sql` | Which works a user has already seen in For You |
| 5 | `migrations-roadmap.sql` | Roles, artist revenue share, admin RLS, artist/platform cut |
| 6 | `canvas-checkout.sql` | Stripe → Printful order lifecycle on `canvas_orders` |
| 7 | `quiz-progress.sql` | Daily quiz streak per account |
| 8 | `admin-dashboard.sql` | `is_admin()`, admin RPCs, user management |
| 9 | `artwork-source-image.sql` | Full-resolution `source_image_url` for prints and downloads |
| 10 | `subscriptions.sql` | Narsil Pro (Apple IAP) entitlements |
| 11 | `quiz-levels.sql` | Quiz points and level ladder (needs 7) |
| 12 | `artist-wiki-columns.sql` | Wikidata/Wikipedia artist columns, `profile_ready` |
| 13 | `fyp-artist-cards.sql` | For You artist cards (needs 12) |
| 14 | `licensed-museums.sql` | Museums whose works may legally be sold as canvas |
| 15 | `artwork-approval.sql` | Approval queue for uploaded artworks |
| 16 | `avatars.sql` | Profile photo storage bucket |
| 17 | `support-inbox.sql` | In-app support threads |
| 18 | `admin-users-enrich.sql` | Richer admin user list (needs 8, 10) |
| 19 | `admin-overview-charts.sql` | Admin overview charts (needs 8, 10) |
| 20 | `admin-exclude-guests.sql` | Overview without guest accounts (needs 18, 19) |
| 21 | `admin-alerts.sql` | Admin alert badges (needs 17, 20) |
| 22 | `support-realtime.sql` | Realtime for support threads (needs 17) |
| 23 | `support-thread-read.sql` | Unread badges for support threads (needs 17) |
| 24 | `quiz-badges.sql` | Seals earned for a perfect topic quiz |
| 25 | `news-posts.sql` | Admin news posts |
| 26 | `quiz-questions.sql` | Shared quiz question bank |
| 27 | `quiz-scores.sql` | Best star rating per topic trial |
| 28 | `profile-onboarding.sql` | Onboarding + preferences on profiles (needs 5, 8) |
| 29 | `daily-quiz.sql` | The shared daily Royal Assessment (needs 26) |
| 30 | `canvas-margin-guard.sql` | Caps artist share at 30% and adds `printful_cost` (needs 6, 8) |
| 31 | `catalog-facets.sql` | `catalog_facets()`: Search filter options across the whole archive |

When you add a file, give it a `REQUIRES:` header and add a row at the bottom of this table.

## One-off data repairs (not part of a fresh setup)

These fixed rows that older versions of the ingest job had already written. A new database
never needs them.

- `fix-museum-sources.sql` fixes museum names and credit lines on rows ingested before July 14, 2026.
- `cleanup-orphan-artists.sql` removes artists left with no artworks after the artist-name cleanup.

## Not applied yet?

To check whether a file is live, look for what it creates. For example, `catalog_facets`
appears under **Database → Functions** once file 31 has been run. The app keeps working
without it, but Search's filter lists only show what has already loaded.
