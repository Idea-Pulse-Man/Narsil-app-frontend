# Narsil — Subscription Plan Analysis

> Analysis of the client (Daniel) chat from 27 Jul 2026, checked against the
> actual `museum-app` / `narsil-museum-backend` code. Written for a
> non-technical read.
>
> Historical note: the client later removed the 20% canvas discount from the
> subscription. Discount discussion below is background, not a current feature.
>
> **Status update (2026-10-19).** This is a snapshot of July 2026. Since then:
> - The whole subscription system is **built**: StoreKit 2 paywall with Restore
>   Purchases, `POST /api/apple/verify`, App Store Server Notifications V2, and
>   `GET /api/me/subscription` (§5 no longer applies).
> - Endless practice shipped as a gate: 5 free questions per round
>   (`FREE_PRACTICE_QUESTIONS`). The daily quiz is 10 questions and free.
> - Download tiers shipped: `?res=standard` (2000px, free) / `?res=high` (Pro).
> - Canvas prices were re-costed against Printful on 2026-09-28: **$59 / $89 /
>   $129** (artist originals: Small $69), and **posters** were added at
>   $29 / $35 / $45 (`narsil-museum-backend/src/services/pricing.ts`).
> - Current Pro perks: endless practice, every age / empire trial beyond Ancient
>   Egypt, Master File downloads, uploading in Create (`ProPaywall.tsx`).
> - The quiz now has a question engine with 26 extra styles
>   ([quiz-question-engine.plan.md](quiz-question-engine.plan.md)).

---

## 1. What the project is

**Narsil is an iPhone art museum app.** Users browse famous paintings, read
about them, play a daily art quiz, and can order a painting printed on canvas
and mailed to them.

Two separate programs:

| Program | Role |
|---|---|
| `museum-app/` | The phone app. A website wrapped by **Capacitor** into a real iOS app. React 19 + Vite + Tailwind + Framer Motion. |
| `narsil-museum-backend/` | The server (Node.js + Express) on Amazon EC2. Holds artwork data, calculates prices, takes payments, orders the prints. Invisible to the user. |

**Supabase** (a hosted database) stores everything permanent — accounts, orders,
addresses, comments, artworks.

---

## 2. Where the art comes from

Six real museum sources:

- The Met · Cleveland Museum of Art · Art Institute of Chicago
- Rijksmuseum · Wellcome Collection · Flickr Commons

**Every source is filtered to public-domain / CC0 works only** — copyright has
expired, so anyone may print and sell them. The filtering is enforced in code
at ingest time:

- `cma.ts:147` — discards anything not `share_license_status === "CC0"`
- `rijks.ts:280` — rejects images without a Creative Commons public-domain mark
- `met.ts` — takes only objects flagged `Is Public Domain`
- `flickr.ts:68` — whitelists three safe licence codes
- `artic.ts:168` — requires `is_public_domain`

**Selling canvas prints of this catalogue is legally clean.** This is the issue
that most commonly kills art-print businesses, and it is already handled
correctly.

A second category exists: **freelance artists upload their own work**
(`artworkUpload.ts`), marked `origin: "artist-original"`. On sale the artist
takes a revenue share, default 30% (`checkout.ts:102`).

**AI usage:** there is no AI image generation. Claude Haiku writes the short
description paragraph when a museum record has none
(`ingest/aiDescription.ts`) — roughly **$1 per 1,000 artworks**, generated once
and cached. Effectively free.

---

## 3. How money works today

Canvas purchase chain (`services/checkout.ts`):

1. User picks a painting and a size.
2. App asks the server to create an order.
3. **Server calculates the price itself** — it never trusts a price sent by the
   phone. (Otherwise the app could be edited to buy a $149 canvas for $1.)
4. Order saved as `pending_payment`; Stripe issues a PaymentIntent.
5. User pays by Apple Pay or card.
6. Stripe confirms payment.
7. Server sends the job to **Printful**, who print and ship.
8. Printful bills Daniel separately for print + postage.

Order lifecycle: `pending_payment → paid → submitted`, with
`fulfillment_failed` as a retryable branch.

### Prices at the time (July 2026 — see the status update for today's)

| Size | Dimensions | Price |
|---|---|---|
| Small | 12 × 16" | $59 |
| Medium | 18 × 24" | $99 |
| Large | 24 × 36" | $149 |

Plus a deterministic $0 / $5 / $10 per-artwork variation.

**There is no shipping charge anywhere in the codebase.** The customer pays the
canvas price only; Daniel absorbs postage out of margin.

---

## 4. Daniel's three requests, checked against the code

### Request 1 — 20% subscriber discount + shipping baked into the price

**Shipping is already baked in.** No shipping calculation exists in
`services/`. That half of the request is already the current behaviour.

**The discount itself is small work.** Checkout already carries the user's
Supabase session (`museum-app/src/lib/checkout.ts:108`), so the server can look
up subscriber status and apply 20% before charging. Hours, not days.

#### ⚠️ The pricing problem underneath it

`museum-app/src/data/shop.ts:5` states plainly:

> *"pricing is illustrative"*

$59 / $99 / $149 were chosen to look realistic in the demo. **They were never
calculated from Printful's real costs.** Applying 20% on top of untested prices:

| Size | Subscriber pays | Est. landed cost | Est. margin |
|---|---|---|---|
| Small | $47.20 | ~$38 | **~$7.50** ⚠️ |
| Medium | $79.20 | ~$57 | ~$19.60 |
| Large | $119.20 | ~$86 | ~$29.45 |

*(Printful figures are estimates and must be confirmed against their current
US catalogue — but the shape of the problem holds.)*

At ~$7 margin, a single damaged-in-transit reprint erases five small-canvas
sales. **Re-cost the price list from real Printful numbers before the discount
ships.**

### Request 2 — "Endless quiz mode", free users capped at 5 questions

**Bigger than it sounds.** `museum-app/src/lib/quiz/daily.ts:17`:

```ts
export const DAILY_COUNT = 7;
```

The *daily* quiz is a **Wordle-style challenge**: 7 questions, once a day,
deterministic, with a streak counter.

But `QuizOverlay` also has a second section — **Practice — which is already
endless and already free.** Its own UI says "Endless questions", and
`nextPractice` re-seeds the pool when exhausted so it never runs out. So the
endless mode was never missing; it just had no cap on it.

That makes Daniel's request small rather than large: put the five-question
limit on Practice, which is precisely "give access to quizzes after initial 5
questions". Hours, not days.

**The daily quiz stays at 7 and stays free.** Capping it would take two
questions from every existing user in order to sell a $4.99 subscription, when
the canvas funnel is worth roughly 4× more per user — a bad trade.

### Request 3 — Paid "4K" download (client suggested no real quality difference)

**Recommendation: make it genuinely higher resolution. Do not fake it.**

Museum images are served over **IIIF**, a standard that delivers the same
painting at any requested size. The backend already uses it (`museum/iiif.ts`),
and checkout already pulls the giant version for printing
(`checkout.ts:291` → `fullResImageUrl`). The large file already exists.

**Today the free download is the good one.** `download.ts:117` serves full
resolution, free, through a server proxy. So the work is inverted from the
client's description: **shrink the free version**, and keep the existing
full-res path for subscribers.

#### Implementation: two IIIF URLs, no image processing

IIIF serves any requested size, and the plumbing is already built:
`iiif.ts:78-80` builds the size segment from a width, and the proxy route
already reads `?w=<px>` and `?full=1` (`routes/image.ts:50-56`).

```
free   →  /api/image/:id?w=2000     →  .../full/2000,/0/default.jpg
paid   →  /api/image/:id?full=1     →  .../full/max/0/default.jpg
```

No `sharp`, no re-encoding, no server CPU — the museum's image server resizes
and the proxy streams. Two caveats:

- **Not every artwork is IIIF.** `fullResImageUrl` reveals four image families.
  IIIF (`?w=`), Wikimedia Commons (`Special:FilePath?width=`) and the wsrv.nl
  wrapper (`&w=`) all resize by URL alone. Only raw S3 / Flickr images lack a
  width param — route those through wsrv.nl for the free tier. Artist originals
  are already blocked from download (`routes/artworks.ts:52`).
- **"4K" isn't true for every work.** `max` returns whatever the museum holds;
  some masters are ~2400px. Label the tier **"High resolution"** rather than
  "4K", and store real dimensions at ingest via `iiif.ts:91` `infoUrl()` →
  `info.json`, so the sheet can show `3,842 × 5,120` — more convincing than a
  marketing number, and accurate for every work. Do **not** request an explicit
  `4000,`: under IIIF 3.0 a size larger than the original errors unless
  prefixed with `^`. `max` never fails.
- **Watch bandwidth.** `max` on a large master can be 20–50 MB over CloudFront.
  If that shows in the bills, use the stored width to request
  `min(4000, actualWidth)`.

Two reasons this matters:

1. **App Review risk.** Apple reviews every app. If a reviewer downloads both
   files and finds them identical, the app is rejected for misleading claims —
   costing weeks. Genuinely compressing the free version removes the risk for
   roughly half a day of work.
2. **Retention.** If the free file is already perfect, subscribers who compare
   find no value and churn.

A paywall branch already exists in that file: `download.ts:121` blocks
downloads of freelance artists' originals.

---

## 5. The largest missing piece

**No subscription code exists anywhere in the project.** All of the following
must be built from nothing:

- The Apple purchase screen and **StoreKit** integration
- Server-side verification with Apple ("is this person really still paying?") —
  the phone cannot be trusted to answer this
- **App Store Server Notifications V2** listener, so cancellations, refunds and
  failed cards actually revoke the 20% discount
- A **Restore Purchases** button — Apple requires it and rejects apps without one

RevenueCat (which would provide all four) has been ruled out, so each is
hand-built. This is the single largest chunk of work in the plan — larger than
the discount and the download combined.

### Guest accounts vs subscriptions

The app supports anonymous guest sessions (`AppState.tsx:198` checks
`is_anonymous`). Good for onboarding, but a guest who subscribes and then
reinstalls loses their identity while Apple still bills them. Needs resolving —
either require an account before purchase, or key entitlement off StoreKit's
`originalTransactionId` and re-link on restore. Cheap now, painful later.

---

## 6. Fees and earnings

Two entirely separate fee structures:

| Sold | Who takes a cut | How much |
|---|---|---|
| **Canvas** (Stripe + Apple Pay) | Stripe only | ~2.9% + $0.30 |
| **Subscription** (In-App Purchase) | Apple | 30%, or **15%** |

**Apple takes nothing from canvas sales.** Apple Pay is a card-tap method, not
Apple's in-app purchase system; Apple charges merchants nothing for it. The 30%
applies only to digital goods sold in-app — here, only the subscription.

**Enrol in the App Store Small Business Program.** Under $1M/year in App Store
proceeds drops the fee to **15% from day one**. Free, minutes to apply, and a
new app qualifies automatically. It doubles net revenue per subscriber.

### Rough model

Per 1,000 monthly active users, assuming 1% order a canvas and 3% subscribe:

| Stream | Volume | Per unit | Monthly |
|---|---|---|---|
| Canvas | ~10 orders | ~$33 blended margin | ~$330 |
| Subscription | ~30 subs | ~$4.24 after 15% | ~$127 |
| **Total** | | | **~$450** |

Scaling: 10,000 MAU ≈ $4,500/month; 50,000 MAU ≈ $22,500/month. Running costs
are small (~$150/month hosting at that scale), so most survives to profit —
before advertising spend, which is the real variable.

**~75% of revenue is canvas, not subscription.** One large canvas sale earns
more margin than a subscriber pays in eighteen months. Effort spent improving
the canvas funnel is worth several times the same effort on the paywall.

### Suggested pricing

- **Subscription:** $4.99/month + $39.99/year, with a 7-day free trial. Both in
  one App Store Connect subscription group so users can switch and Apple
  prorates automatically.
- **Canvas:** re-cost from real Printful figures. Price up from the *discounted*
  price, not down from list:
  `list = (landed cost + target margin) ÷ (1 − 0.029) ÷ 0.80`

---

## 7. Rejected: the paid-tournament model

The original proposal was paid entry to quiz sessions with canvases for the top
3. Daniel identified the problem himself: **entry fee + prize = gambling**, and
skill-contest exemptions vary by US state. Apple Guidelines 4.7 / 5.3 would
also apply. Correctly dropped.

**The leaderboard idea survives if decoupled from payment.** Free entry plus
prizes is a sweepstakes, not gambling — same retention mechanic, no legal
exposure, and it gives subscribers (with endless mode) a reason to climb.

---

## 8. Summary

**Already done — no work needed**
- Legal rights to sell every painting
- Shipping absorbed into the price
- Full-resolution images available and already used for printing
- Payments, printing, shipping, order tracking
- User accounts and login

**Small work**
- 20% subscriber discount at checkout
- Two-tier download — a second IIIF URL (`?w=2000` vs `?full=1`), not image
  processing. Plus storing real image dimensions at ingest so the tier can be
  labelled honestly.

**Real work**
- Endless quiz mode — a new feature, not a paywall
- The entire Apple subscription system, hand-built

**Decide before building, not after**
- Canvas prices are demo placeholders, never costed against Printful. Adding
  20% off untested prices is the one item here that can lose money on every
  sale without anyone noticing.
- Guest accounts and subscriptions do not yet mix cleanly.

**Confirmed constraints**
- iOS only
- No RevenueCat — StoreKit hand-rolled
- US shipping only
