# Narsil — Museum App

Ionic/Capacitor/React mobile app converted from the `scrolling-museum` Next.js mockup.

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
   npm run cap:ios
   ```

4. In Xcode → target `App` → Signing & Capabilities: pick your team, confirm the
   bundle id is `com.narsil.museum`, and add the **Apple Pay** capability with the
   `merchant.com.narsil.museum` merchant id. Skip this and the app still builds —
   the payment sheet just falls back to card entry.

After any web change: `npm run cap:sync`.

## Project layout

| Path | Description |
|------|-------------|
| `src/components/` | UI from the mockup (feed, nav, modals, tutorial) |
| `src/data/` | Local mock dataset (artworks, artists, categories) |
| `src/lib/` | Storage helpers and Supabase placeholder |
| `src/App.tsx` | Ionic `IonApp` wrapper |
| `src/main.tsx` | Entry point + Capacitor status bar setup |

## Migrated from mockup

All mockup modules were carried over:

- Views: For You feed, Discover (art-history timeline), Buy, Search, Create, Saved, You
- Shared: `AppState`, navigation, tutorial coach, preference modal, toasts
- Data layer: unchanged local JSON-style modules

Next.js-specific pieces were removed (`"use client"`, `next/font`, app router). The desktop phone-frame preview is kept for browser dev; on native Capacitor builds the app runs full-screen.
