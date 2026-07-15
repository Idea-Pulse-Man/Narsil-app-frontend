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
