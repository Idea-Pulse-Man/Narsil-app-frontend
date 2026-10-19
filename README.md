# Narsil — Museum App

Mobile-first art discovery app: public-domain masterpieces from museum open-access collections (the Met, Rijksmuseum, Cleveland, Wellcome and more), canvas and poster prints, daily quizzes and a Pro subscription. React + Capacitor, built for iPhone (and the web).

## Stack

- **React 19** + **Vite**
- **Capacitor** (iOS / Android builds)
- **Tailwind CSS v4** + **Framer Motion**

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in a mobile-sized viewport or your device browser.

## Native builds

Add platforms once:

```bash
npm run build
npx cap add android
npx cap add ios   # macOS only
```

After code changes:

```bash
npm run cap:sync
```

Open native IDEs:

```bash
npm run cap:android
npm run cap:ios
```

## iOS build (macOS only)

The backend already runs on EC2 behind CloudFront, so the phone build only needs
the right env vars — nothing has to be started locally.

1. Clone and install:

   ```bash
   git clone https://github.com/Idea-Pulse-Man/Narsil-app-frontend.git
   cd Narsil-app-frontend
   npm install
   ```

2. Create `.env.local` (gitignored — the values are baked into the bundle at
   build time, so this must exist *before* `npm run build`):

   ```dotenv
   VITE_API_URL=https://d2lvgalchu2nps.cloudfront.net
   VITE_SUPABASE_URL=…            # same values as the Windows .env.local
   VITE_SUPABASE_ANON_KEY=…
   VITE_STRIPE_PUBLISHABLE_KEY=…  # unset ⇒ checkout shows "payments unavailable"
   VITE_APPLE_PAY_MERCHANT_ID=merchant.com.narsil.museum
   ```

   Without `VITE_API_URL` the app falls back to `http://localhost:4000`, which on
   a device means every request fails (and iOS blocks cleartext HTTP anyway).

3. Add the platform and open Xcode:

   ```bash
   npm run build
   npx cap add ios      # runs pod install; needs Xcode + CocoaPods
   npm run cap:sync     # also patches Info.plist (Photos save permission)
   npm run cap:ios
   ```

4. In Xcode → target `App` → Signing & Capabilities: pick your team, confirm the
   bundle id is `com.narsil.museum`, and add the **Apple Pay** capability with the
   `merchant.com.narsil.museum` merchant id. Skip this and the app still builds —
   the payment sheet just falls back to card entry.

After any web change: `npm run cap:sync`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (http://localhost:5173) |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run typecheck` | Type-check only |
| `npm run lint` | oxlint |
| `npm test` | Unit tests (Vitest) |
| `npm run preview` | Serve the production build locally |
| `npm run cap:sync` | Build, copy to the native projects and patch iOS Info.plist |
| `npm run patch:ios-plist` | Re-apply the iOS Info.plist patch only |
| `npm run cap:android` / `cap:ios` | Open Android Studio / Xcode |

GitHub Actions runs lint, type-check, tests and build on every push to `main`
(`.github/workflows/ci.yml`). Vercel deploys the web build from `main`.

## What's in the app

Navigation: top tabs **Discover · Narsil · Gallery · Search**, bottom bar **Vault · Create ·
Profile · Study** (`src/components/navigation.ts`; labels in `src/data/worldCopy.ts`).

- **Narsil (For You):** a personalised full-screen feed, loaded from Supabase in batches
  of 80 as you scroll, with artist story cards and per-artwork discussion
- **Discover:** the art-history timeline, eras, empires and artist profiles. Guests are
  asked to sign in first
- **Gallery:** canvas and poster prints via Stripe (card, plus Apple Pay on iOS) and
  Printful. US addresses only. Prices come from the backend (`GET /api/prices`).
  Artists' own works are canvas only
- **Search:** text and filters (collection, period, empire, place, portraits, canvas) run
  on the server across the whole archive. The filter lists come from `catalog_facets()`
  (`supabase/catalog-facets.sql`)
- **Vault:** saved works
- **Study (The Royal Assessment):** the daily quiz, practice (Uncharted Archives), age and
  empire trials, levels, seals and the Halls rankings. Beyond the classic card, the
  **question engine** serves 26 more styles (pick the image, select all, timeline, year
  slider, zoom reveal, match, type the artist…), generated nightly by the backend and
  switched on per style from the admin. See
  [docs/quiz-question-engine.plan.md](docs/quiz-question-engine.plan.md) and the test list in
  [docs/quiz-question-engine.QA.md](docs/quiz-question-engine.QA.md)
- **Create:** artists upload their own work (Explorer's Guild members only); posts wait
  for admin approval
- **Profile:** collections, orders, delivery addresses, news, support inbox,
  notifications, **Delete account** (required by Apple)
- **Narsil Pro (The Explorer's Guild):** Apple in-app subscription (iOS). Perks: endless
  practice (free users get 5 questions per round), every age / empire trial beyond Ancient
  Egypt, uncompressed Master File downloads, and uploading in Create
  (`src/components/ProPaywall.tsx`)
- **Push notifications (iOS):** daily quiz and streak reminders, "your print has
  shipped", and "new paid order" for admins. Setup is in `native/ios/README.md`.
- **Admin** (for `profiles.role = 'admin'`): overview, users, orders (with a badge for
  paid orders waiting in Printful), artwork approval, news, quiz (question styles, daily
  edition, question bank), support, and **Insights** (anonymous usage, checkout drop-off,
  crash reports)

Shared links point at the backend's `/share/<id>` page: WhatsApp and iMessage show the
painting as a preview, and tapping opens the iPhone app (Universal Links) or the web app
(`?art=<id>`).

**Privacy labels (App Store Connect):** the app collects anonymous **Usage Data →
Product Interaction** and **Diagnostics → Crash Data** through its own servers. Neither is
linked to the user, and neither is used for tracking (`src/lib/telemetry.ts`).

## Project layout

| Path | Description |
|------|-------------|
| `src/components/` | Screens, sheets and admin UI; `quiz/` holds the question-engine renderers (one per answer type) |
| `src/data/` | Types, categories, places and canvas pricing; `catalog.tsx` is the live catalog provider; bundled artworks are an offline fallback only |
| `src/lib/` | Supabase access (`catalog`, `orders`, `admin`, `comments`, `support`…), backend calls (`api`, `checkout`, `download`), quiz (`quiz/`, with the question engine's types, scoring and loading in `quiz/engine/`), StoreKit and auth |
| `src/lib/searchIndex.ts` | Exact Search rules, applied to loaded rows and to server results |
| `supabase/` | Database setup SQL. **Run in the order in [supabase/README.md](supabase/README.md)** |
| `docs/` | Feature plans and QA lists (subscription, quiz question engine) |
| `native/ios/` | iOS-specific setup (StoreKit testing, see its README) |
| `public/` | Static assets |

## Backend and database

- **Backend:** [narsil-museum-backend](https://github.com/Idea-Pulse-Man/Narsil-museum-backend),
  live at `https://d2lvgalchu2nps.cloudfront.net` (`VITE_API_URL`).
- **Database:** Supabase. The app uses the public anon key and row-level security; anything
  privileged (orders, payments, admin checks) goes through the backend or a
  `security definer` function.
