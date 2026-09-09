---
name: Narsil Pro — Apple Subscription
overview: Historical implementation plan. The canvas discount was removed from the final subscription offer; current perks are defined in ProPaywall.tsx.
todos:
  - id: reprice-canvas
    content: "Re-cost the canvas price list against real Printful US figures; update pricing.ts + shop.ts together"
    status: pending
  - id: entitlement-store
    content: "Backend: subscriptions table + isSubscriber() helper + GET /api/me/subscription"
    status: pending
  - id: storekit-purchase
    content: "App: StoreKit 2 purchase flow, paywall screen, Restore Purchases button"
    status: pending
  - id: receipt-verify
    content: "Backend: POST /api/apple/verify — validate the signed JWS, resolve authoritative status via App Store Server API"
    status: pending
  - id: apple-notifications
    content: "Backend: POST /api/apple/notifications — App Store Server Notifications V2 listener, idempotent"
    status: pending
  - id: checkout-discount
    content: "Backend: apply 20% in createCheckout for subscribers; discount comes out of platform cut, not the artist's"
    status: pending
  - id: download-tiers
    content: "Two-tier download — ?res=standard (2000px) free, ?res=high (max) gated; wsrv.nl fallback for non-IIIF"
    status: pending
  - id: image-dimensions
    content: "Ingest: store image_width/image_height from IIIF info.json; backfill; label the tier 'High Resolution'"
    status: pending
  - id: endless-quiz
    content: "App: endless quiz mode — free users get 5 questions per session, then paywall. Daily quiz stays 7 and free"
    status: pending
  - id: review-compliance
    content: "Paywall metadata, Terms/Privacy links, sandbox test matrix, Small Business Program enrollment"
    status: pending
---

# Narsil Pro — Apple Subscription Plan

> Historical note: the client removed the 20% canvas discount from the offer.
> Discount-related sections below document the original proposal only and must
> not be implemented. The live product copy in `ProPaywall.tsx` is authoritative.

## Diagnosis — what exists, what doesn't

| Piece | State |
|---|---|
| Canvas checkout (Stripe → Printful) | Works. Server-side pricing, idempotent fulfillment |
| Shipping baked into price | Already true — no shipping charge exists anywhere |
| Full-resolution images | Already available via IIIF; already used for printing |
| Public-domain rights filtering | Already enforced at ingest across all six sources |
| Auth (Supabase, email + OAuth + anonymous) | Works |
| **Canvas prices** | **Placeholders.** `shop.ts:5` — *"pricing is illustrative"* |
| **Endless quiz** | **Does not exist.** `daily.ts:17` — `DAILY_COUNT = 7`, one session/day |
| **Subscription / IAP** | **Nothing.** Zero lines in either project |

Two design decisions fall out of that table and are baked into this plan:

1. **Re-price before discounting.** At 20% off, the Small canvas nets ~$7.50.
   `reprice-canvas` blocks `checkout-discount`.
2. **Daily quiz stays free at 7.** Daniel's "free users get 5" would remove two
   questions from every existing user. Instead the 5-question cap applies to the
   *new* endless mode; the daily challenge is untouched. Free users gain nothing
   they had, lose nothing they had.

## Build order

`reprice-canvas` → `entitlement-store` → everything else. The entitlement flag
is the single source of truth that the discount, the download gate and the quiz
gate all read; nothing that consumes it can be built first.

---

## 1 — Re-price the canvas list (`reprice-canvas`)

Pull Printful's current US catalogue for the three variants. Price up from the
**discounted** price, since that is the real floor:

```
landed = printful_base + printful_us_shipping
list   = (landed + target_margin) ÷ (1 − 0.029) ÷ 0.80
```

Update `services/pricing.ts` and `data/shop.ts` in the same commit — the file
header already warns they must stay in sync. Keep the `priceFromId` hash offset.

Expected direction (confirm against real figures): Small $59 → ~$69,
Medium $99 holds, Large $149 → ~$169.

## 2 — Entitlement store (`entitlement-store`)

Supabase table `subscriptions`:

| Column | Notes |
|---|---|
| `user_id` | FK `auth.users` |
| `original_transaction_id` | **unique** — Apple's stable per-subscriber id |
| `product_id` | monthly / annual |
| `status` | `active` \| `grace` \| `expired` \| `revoked` |
| `expires_at` | timestamptz |
| `environment` | `Production` \| `Sandbox` |

`isSubscriber(userId)` → `status IN ('active','grace') AND expires_at > now()`.
Grace counts as subscribed: Apple retries failed billing for up to 60 days and
revoking early punishes people whose card simply expired.

`GET /api/me/subscription` returns the flag for the app's UI. **The UI reads
this; nothing else does.** Server-side consumers call `isSubscriber()` directly
— a client-supplied flag is never trusted.

**Guest accounts.** The app allows anonymous sessions (`AppState.tsx:198`).
Require a real account before purchase — simplest, and `original_transaction_id`
being unique means Restore re-links correctly if they later sign in on a new
device.

## 3 — Purchase flow (`storekit-purchase`)

App Store Connect: one subscription group `Narsil Pro`, two products
(`…pro.monthly` $4.99, `…pro.annual` $39.99), 7-day introductory free trial on
both. Same group ⇒ Apple prorates upgrades automatically.

Bridge: `cordova-plugin-purchase` v13 (StoreKit 2, Capacitor-compatible, no
third-party service). A small custom Swift Capacitor plugin is the
zero-dependency alternative — `Product.products(for:)`, `product.purchase()`,
`Transaction.updates`.

Flow: purchase → app receives the signed JWS transaction → POST to
`/api/apple/verify` → server writes the entitlement → app refetches
`/api/me/subscription`.

**Restore Purchases button is mandatory** — Apple rejects without it.

## 4 — Verification (`receipt-verify`)

`@apple/app-store-server-library` (Apple official). Needs an App Store Connect
API key (`.p8`), key id, issuer id, bundle id `com.narsil.museum`.

`POST /api/apple/verify` — verify the JWS signature against Apple's root certs,
extract `originalTransactionId`, then call `getAllSubscriptionStatuses` for the
authoritative state and upsert. Never trust the transaction body alone.

## 5 — Notifications (`apple-notifications`)

`POST /api/apple/notifications`, registered in App Store Connect (Production and
Sandbox URLs both). Verify the `signedPayload`, then handle:

`SUBSCRIBED` · `DID_RENEW` · `DID_CHANGE_RENEWAL_STATUS` · `EXPIRED` ·
`GRACE_PERIOD_EXPIRED` · `REFUND` · `REVOKE`

Idempotent, fail-soft, returns 200 quickly (Apple retries non-200). **Without
this, a cancelled or refunded user keeps the 20% discount forever.**

## 6 — Checkout discount (`checkout-discount`)

In `createCheckout`, after `priceForSize`:

```
if (await isSubscriber(user.id)) price = round2(price * 0.80)
```

Persist `discount_pct` on the `canvas_orders` row for accounting, and derive the
Stripe amount from the discounted price.

**Artist revenue split.** `revenueSplit()` currently takes 30% of `price` for
artist originals. If the discount shrinks `price`, the artist silently absorbs
part of a promotion they never agreed to. **The discount must come out of the
platform cut** — compute the artist's share from the *undiscounted* price.

The app shows the discount as its own line in the checkout bar, per Daniel.

## 7 — Two-tier download (`download-tiers`)

IIIF serves any size, so this is a URL parameter — no image processing.

```
free   →  ?res=standard  →  width 2000
paid   →  ?res=high      →  IIIF `max`
```

`GET /api/artworks/:id/download` gains optional auth; `res=high` requires
`isSubscriber()`, else 402. Existing `artist-original` 403 stays.

Non-IIIF families (`utils/imageDownload.ts` shows four): Wikimedia takes
`?width=`, wsrv.nl takes `&w=`, raw S3/Flickr have no width param — wrap those
through wsrv.nl for the standard tier and serve the original for high.

Do **not** request an explicit `4000,` — IIIF 3.0 errors on sizes above the
original unless prefixed `^`. `max` never fails.

## 8 — Real dimensions (`image-dimensions`)

Fetch `info.json` via the existing `IiifImageService.infoUrl()` at ingest; store
`image_width` / `image_height` on the artwork row. Backfill existing rows
(mirror the `backfill:descriptions` script pattern, dry-run first).

Label the tier **"High Resolution"** and show real numbers —
`3,842 × 5,120` — not "4K". Some masters are ~2400px, so a hard "4K" claim is
false for part of the catalogue and is exactly what App Review flags.

## 9 — Endless quiz (`endless-quiz`) — **shipped as a gate, not a new mode**

Correction to the original diagnosis: **the endless mode already existed.**
`QuizOverlay`'s *Practice* section is described in its own UI as "Endless
questions", and `nextPractice` explicitly re-seeds the pool once exhausted "so
practice stays endless". A separate survival mode was written and then deleted —
duplicating a free feature would have been dead weight.

What shipped instead is exactly Daniel's spec: `FREE_PRACTICE_QUESTIONS = 5` in
`lib/quiz/index.ts`, enforced in `QuizOverlay.handleSelect`. A non-subscriber
gets five practice questions per run, the answer is revealed, then the paywall
opens on the hub. Pro removes the cap.

The **daily quiz is untouched** — still 7 questions, still free. Capping it
would have taken two questions from every existing user to sell a $4.99
subscription, against a canvas funnel worth ~4× more per user.

## 10 — Review compliance (`review-compliance`)

The paywall screen itself must carry: subscription title, duration, price,
auto-renew disclosure, and links to Terms/EULA and Privacy Policy (`TermsView`
already exists), plus the Restore button. This is the most common first-
submission rejection.

Enroll the developer account in the **App Store Small Business Program** —
under $1M/yr proceeds drops Apple's commission 30% → 15% from day one.

---

## Verification

1. **Pricing** — every size shows positive margin at the discounted price
   against real Printful figures.
2. **Sandbox matrix** — purchase, renew, cancel, expire, refund, and billing-
   retry each land the correct `status` in `subscriptions`.
3. **Revocation** — cancel in sandbox, confirm the 20% disappears from checkout
   and `res=high` returns 402.
4. **Restore** — delete and reinstall, sign in, press Restore, entitlement
   returns via `original_transaction_id`.
5. **Downloads** — standard and high differ in bytes and pixel dimensions for an
   IIIF work, a Wikimedia work, and a raw-S3 work.
6. **Artist split** — a discounted artist-original order pays the artist the
   same amount as an undiscounted one.
7. **Kill-switch** — Apple keys absent ⇒ subscription features no-op, canvas
   checkout and free download unaffected.

## Explicitly out of scope

- Android and web subscription paths (iOS only, confirmed)
- International shipping (US only, confirmed)
- Promo codes / offer codes stacking with the 20%
- Family Sharing
- The free-entry leaderboard idea (revivable later; not part of this ship)
