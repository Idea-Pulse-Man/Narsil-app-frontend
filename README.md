# Narsil — Museum App

Mobile-first art discovery app: public-domain masterpieces from museum open-access collections (the Met, Rijksmuseum, Cleveland, Wellcome and more), canvas prints, daily quizzes and a Pro subscription. Ionic/Capacitor/React, running on iOS, Android and the web.

## Stack

- **React 19** + **Vite**
- **Ionic React** (app shell, native integration)
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
| `npm run cap:sync` | Build, copy to the native projects and patch iOS Info.plist |

GitHub Actions runs lint, type-check, tests and build on every push to `main`
(`.github/workflows/ci.yml`). Vercel deploys the web build from `main`.

## What's in the app

- **For You:** a personalised feed, loaded from Supabase in batches of 80 as you scroll
- **Discover:** the art-history timeline, eras and artist profiles
- **Search:** text and filters (collection, period, empire, place, portraits, canvas) run
  on the server across the whole archive. The filter lists come from `catalog_facets()`
  (`supabase/catalog-facets.sql`).
- **Buy:** canvas prints via Stripe (card, plus Apple Pay on iOS) and Printful. US
  addresses only. Prices come from the backend (`GET /api/prices`).
- **Royal Assessment:** daily and topic quizzes, levels, seals and rankings
- **Narsil Pro:** Apple in-app subscription (iOS); high-resolution downloads and quiz perks
- **You:** collections, orders, delivery addresses, support inbox
- **Admin** (for `profiles.role = 'admin'`): overview, users, orders, artwork approval,
  news, quiz questions, support

Shared links (`?art=<id>`) open straight into that artwork, fetching it if it hasn't
loaded yet.

## Project layout

| Path | Description |
|------|-------------|
| `src/components/` | Screens, sheets and admin UI |
| `src/data/` | Types, categories, places and canvas pricing; `catalog.tsx` is the live catalog provider; bundled artworks are an offline fallback only |
| `src/lib/` | Supabase access (`catalog`, `orders`, `admin`, `comments`, `support`…), backend calls (`api`, `checkout`, `download`), quiz engine, StoreKit and auth |
| `src/lib/searchIndex.ts` | Exact Search rules, applied to loaded rows and to server results |
| `supabase/` | Database setup SQL. **Run in the order in [supabase/README.md](supabase/README.md)** |
| `native/ios/` | iOS-specific setup (StoreKit testing, see its README) |
| `public/` | Static assets |

## Backend and database

- **Backend:** [narsil-museum-backend](https://github.com/Idea-Pulse-Man/Narsil-museum-backend),
  live at `https://d2lvgalchu2nps.cloudfront.net` (`VITE_API_URL`).
- **Database:** Supabase. The app uses the public anon key and row-level security; anything
  privileged (orders, payments, admin checks) goes through the backend or a
  `security definer` function.
