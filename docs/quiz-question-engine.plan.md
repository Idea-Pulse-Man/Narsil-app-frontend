# Quiz Question Engine — plan

Status: **built 2026-10-19** (phases 1–4, batch 1 + batch 2). Not yet deployed:
the SQL, backend and app release still need to go out (see the QA list,
[quiz-question-engine.QA.md](quiz-question-engine.QA.md)).

### What was built (and where it differs from the plan below)

| Piece | Where |
|---|---|
| Tables + RPCs + style seeds | `supabase/quiz-engine.sql` (README row 38) |
| Generator, 27 styles, validator, scoring, tests | `narsil-museum-backend/src/quiz/` |
| Cron entry | `npm run quiz:generate[:prod]` → `src/ingest/quizGenerate.ts`, 00:10 UTC (INGEST.md) |
| Admin API | `GET /api/admin/quiz/engine/styles`, `POST …/preview`, `POST …/run`, `GET …/runs` |
| App renderers | `src/components/quiz/` (`EngineQuestion` + one renderer per answer type) |
| App data | `src/lib/quiz/engine/` (types, scoring, fetch) |
| Admin panel | `src/components/QuestionStylesAdmin.tsx`, top of the admin Quiz tab |

Differences from the plan:
- The old `quiz:daily` cron is **unchanged** and keeps feeding old app
  versions. The new job only fills `quiz_items` + `daily_quiz_items`.
- Admin endpoints live under `/api/admin/quiz/engine/*`.
- Intruder tile is a `single` answer with `options_as: "tiles"` (no separate
  `tap_area` renderer). `tap_area` and `map` are **not built**, so `map_pin`,
  `color_palette`, `spot_change`, `pin_it`, `price_guess`, `emoji_riddle` and
  `artist_quote` are still to do.
- The tile reveal style's id is `tiles_reveal`.
- Practice mixes engine questions with on-device classic ones. The admin sets
  the share ("Practice from styles %", `quiz_engine_config.practice_mix`).
- After an engine question the answer + explanation stay up (1.8 s for
  single/binary, 4.5 s for the rest) with a **Next** button to skip.

## Goal

Build the question system **once** so that, afterwards, new questions and
question styles are controlled from the **Admin page**, with no code change and
no app update:

- A **cron job on the EC2 backend** generates new questions on a schedule.
- The **Admin page** turns each question style on/off, sets how many to make,
  tunes settings, and has a **Generate now** button.
- The **app only displays** what the backend generated.

**Honest limit:** the admin can only switch on styles that the code already
knows. A brand-new *kind* of question still needs code once. So the first build
ships every style we plan to use, **all switched off**, and the admin turns them
on later. (See "Answer types" below. Most new styles will only need a backend
change, not an app release.)

---

## What exists today

| Piece | Where | Notes |
|---|---|---|
| Daily quiz cron | `narsil-museum-backend/src/ingest/dailyQuiz.ts`, `npm run quiz:daily:prod` at 00:15 UTC (INGEST.md) | Fills `daily_quizzes` / `daily_quiz_questions` up to 10 questions. Never touches `source='admin'` rows or locked days. |
| Daily quiz table | `museum-app/supabase/daily-quiz.sql` | **Hard-coded to 4 text options** (`jsonb_array_length(options) = 4`, `correct_index 0–3`). |
| Topic question bank | `supabase/quiz-questions.sql` + Admin "Quiz" tab (`AdminQuiz.tsx`) | Admin adds/deletes, plus OpenAI "Generate AI" via `POST /api/admin/quiz/generate`. Also 4 options only. |
| Daily admin | `DailyQuizAdmin.tsx` | Pin special questions, lock a day. |
| On-device generator | `src/lib/quiz/generator.ts`, `pool.ts`, `prompts.ts` | Practice, topic trials, and the fallback when the day has no rows. |
| One question UI | `QuizQuestion.tsx` | 1 image + 4 text buttons only. |
| 8 classic modes | `QuizMode` in `src/lib/quiz/types.ts` | Title, Artist, Date, Origin, Medium, Period, Collection, Subject. The same list is copied in the backend cron (`MODES`). |

Problems to solve:
1. The **database format** only fits "4 text options + 1 correct index".
2. The **app UI** only knows one layout.
3. Question logic is **duplicated** in the app and the backend.
4. There's no admin control over *what kind* of questions the cron makes.
5. **Old app versions** already installed on phones read `daily_quiz_questions`
   and expect 4 text options. New formats must never reach them.

---

## Design

### 1. Answer types: a small set of building blocks

The 33 question styles don't need 33 screens. They share a few **ways to answer**.
The app gets **one renderer per answer type**, and each style is just a
combination of an answer type and display options.

| Answer type | Used by styles |
|---|---|
| `single` (tap 1) | classic 8 modes, pick one image, odd one out, placard match, detail match, real or mirrored, missing piece, fill the title, clue ladder, color palette, two truths and a lie |
| `multi` (tap many) | select all, find the pair |
| `binary` (2 buttons) | true or false, before or after, older or newer, more loved |
| `order` (drag to sort) | timeline |
| `match` (drag onto targets) | match pairs, match to period, sort into groups |
| `numeric` (slider) | year slider, price guess |
| `map` (tap on map) | map pin |
| `text` (type, autocomplete) | type the artist, unscramble |
| `tap_area` (tap a spot on the image) | intruder tile, spot the change, pin it |

**Display options** (no image processing needed; the app does it with CSS):
- `options_as: "text" | "image"`: text buttons or an image grid.
- `reveal: "none" | "zoom" | "blur" | "tiles"`: the zoom-out, blur, and tile
  reveal styles. Answering earlier earns more points.
- `crop: {x, y, scale}`: the detail match style.
- `flip: true`: the real-or-mirrored style.

**Why this matters:** once the app knows these ~9 answer types and the display
options, **a new style that reuses them only needs a backend change**. The
backend deploys with `git pull` and `pm2`, with no App Store review. Only a truly
new answer type needs an app release.

### 2. One generic question format

```jsonc
{
  "style": "pick_image",            // which style made it
  "answer_type": "single",          // which app renderer shows it
  "prompt": "Which one is Roman?",
  "media": { "image_url": null, "reveal": "none" },  // main image, if any
  "options": [                      // text and/or image options
    { "id": "a", "image_url": "https://…/met-123.jpg", "artwork_id": "met-123" },
    { "id": "b", "image_url": "https://…/cma-9.jpg",   "artwork_id": "cma-9" }
  ],
  "answer": { "correct": ["b"] },   // shape depends on answer_type
  "explain": "Roman copy of a Greek original, 2nd century AD",
  "difficulty": "scholar",
  "artwork_ids": ["met-123", "cma-9"]
}
```

Answer shapes per type:
- `single` / `multi` / `binary`: `{ "correct": ["b"] }`
- `order`: `{ "order": ["c", "a", "d", "b"] }`
- `match`: `{ "pairs": { "a": "t2", "b": "t1" } }`
- `numeric`: `{ "value": 1642, "full_points_within": 10, "zero_points_beyond": 150 }`
- `map`: `{ "lat": 41.9, "lng": 12.5, "full_points_within_km": 200 }`
- `text`: `{ "accept": ["claude monet", "monet"] }`

Scoring is decided by the answer type, so it lives in **one shared function**
used by the app now and the server later (for battles).

### 3. New database tables (new file: `supabase/quiz-engine.sql`)

**`quiz_styles`**: one row per style. This is what the admin edits.

| column | meaning |
|---|---|
| `id` text PK | `classic`, `pick_image`, `select_all`, `year_slider`, … |
| `label` | name shown in the admin |
| `answer_type` | `single`, `multi`, … |
| `enabled` bool | **the on/off switch** (default `false`; `classic` starts `true`) |
| `per_run` int | how many new questions each cron run makes |
| `surfaces` text[] | where it can appear: `daily`, `practice`, `topic`, later `battle` |
| `settings` jsonb | style-specific settings: option count, timer seconds, which fields to use (period / empire / artist), difficulty mix |
| `min_app_version` text | app version needed to show it (admin sees "needs app 1.4+") |
| `updated_at`, `updated_by` | audit |

**`quiz_items`**: the question pool, in the generic format above.

| column | meaning |
|---|---|
| `id` uuid | |
| `style`, `answer_type` | |
| `prompt`, `media` jsonb, `options` jsonb, `explain` | what the player sees |
| `answer` jsonb | correct answer, **kept in its own column** so it can be hidden later (battles) |
| `difficulty` | apprentice / scholar / master |
| `topic_kind`, `topic_id` | optional (age / empire) for topic trials |
| `artwork_ids` text[] | for "don't repeat this artwork" checks |
| `fingerprint` text unique | hash of style + artworks + answer, to stop duplicates |
| `status` | `live`, `review`, `retired` |
| `source` | `generated`, `admin`, `ai` |
| `run_id` | which generator run made it |
| `shown_count`, `correct_count` | stats, used to flag bad questions |

**`daily_quiz_items`**: `quiz_date`, `position`, `item_id`, `source`. This is the
daily edition for new app versions, linking to `quiz_items`.

**`quiz_generation_runs`**: `id`, `started_at`, `finished_at`, `trigger`
(`cron` / `admin`), `status`, `created_count` per style, `log`. Shown in the
admin, and used as a lock so two runs never overlap.

RLS: anyone can read `live` items and enabled styles. Only admins write
(`public.is_admin()`), like the existing quiz tables.

**Old app versions:** keep `daily_quiz_questions` exactly as it is. The cron
keeps filling it with **classic** questions until old versions are gone. New
app versions read `daily_quiz_items` instead. Nothing new ever reaches an old app.

### 4. Backend: style registry + one generator job

```
narsil-museum-backend/src/quiz/
  types.ts            generic question format + answer types
  scoring.ts          score(answer_type, answer, playerAnswer) — shared logic
  catalog.ts          loads artworks + artists once per run (reuses dailyQuiz.ts loaders)
  styles/
    index.ts          registry: { [styleId]: StyleBuilder }
    classic.ts        the 8 existing modes (moved out of dailyQuiz.ts)
    pickImage.ts
    selectAll.ts
    yearSlider.ts
    …one file per style
  validate.ts         checks every item before saving (see below)
  generate.ts         runGeneration({ trigger, styles?, dryRun? })
src/ingest/quizGenerate.ts   CLI entry for cron: npm run quiz:generate:prod
```

Each style file exports:
```ts
{ id, label, answerType, defaultSettings, build(ctx, settings, rng): QuizItem | null }
```

`runGeneration` does this:
1. Take the run lock (`quiz_generation_runs`). Skip if another run is active.
2. Load **enabled** styles from `quiz_styles`.
3. For each style, build up to `per_run` items with its `settings`.
4. **Validate** each item: answer type known, all image URLs set, options
   distinct, answer points at a real option, no duplicate `fingerprint`, artwork
   not hidden.
5. Insert into `quiz_items` (status `live`, or `review` if the admin turned on
   "review before live" for that style).
6. Fill today's `daily_quiz_items`, mixing styles that include the `daily`
   surface. Keep filling the old `daily_quiz_questions` with classic questions
   for old apps.
7. Write the run summary.

**Cron:** add one line to INGEST.md (e.g. 00:10 UTC, before the daily push):
```cron
10 0 * * * /bin/bash -lc 'cd ~/narsil-museum-backend && echo "=== $(date -Is) quiz-generate ===" && npm run quiz:generate:prod' >> ~/quiz-generate-cron.log 2>&1
```
Later, `quiz:daily` can merge into this job.

**Admin API** (all behind `requireAdmin`, in `src/routes/admin.ts`):
- `POST /api/admin/quiz/run`: **Generate now**, either all enabled styles or one
  style (`{ style, count }`).
- `POST /api/admin/quiz/preview`: build 3 sample questions of a style with the
  given settings **without saving**, so the admin can see them first.
- `GET /api/admin/quiz/runs`: run history.

Style on/off and settings are written directly to Supabase under admin RLS,
the same way the dashboard already works.

### 5. App: renderer per answer type

```
museum-app/src/lib/quiz/engine/
  types.ts        same generic format as backend
  scoring.ts      same scoring as backend (copied, or shared later)
  fetch.ts        loads items: daily edition / practice batch / topic batch
museum-app/src/components/quiz/renderers/
  SingleChoice.tsx   (text or image grid, reveal / crop / flip)
  MultiChoice.tsx
  BinaryChoice.tsx
  OrderDrag.tsx
  MatchDrag.tsx
  NumericSlider.tsx
  MapPin.tsx
  TextAnswer.tsx
  TapArea.tsx
  index.ts           registry: { [answer_type]: Renderer }
```

Rules:
- The app sends the list of **answer types it supports** when fetching. The
  server returns only those, so the admin can never break an older app.
- An **unknown style or answer type is skipped**, never crashes.
- **Offline / empty pool:** fall back to today's on-device classic generator.
- `QuizOverlay` / `TopicQuizOverlay` call `renderers[item.answer_type]` instead
  of `QuizQuestion` directly. The classic mode becomes `SingleChoice`, so the
  current look stays the same.
- Practice (endless) gets batches from an RPC such as
  `next_quiz_items(surface, answer_types[], exclude_ids[], limit)`, so players
  see new questions every day without an update.

### 6. Admin page: "Question Styles" panel (new section in the Quiz tab)

For each style:
- **On / off switch**
- **Per run** count, **surfaces** (daily / practice / topic) checkboxes
- **Settings** form (built from the style's settings, e.g. option count, timer,
  field: period / empire / artist, difficulty mix)
- **Preview**: shows 3 samples without saving
- **Generate now**: runs this style once
- "Needs app X+" note from `min_app_version`

Plus:
- **Generate all now** button and the **run history** (time, trigger, how
  many created, errors).
- **Items list** per style: view, retire (`status = retired`), approve if in
  `review`.
- **Bad-question flags**: items with very low or very high correct rates after
  ~50 plays, to check by hand.

---

## Style list (ids for `quiz_styles`)

🟢 = generated from existing artwork data · 🟡 = needs one-time backend data
work · ✍️ = admin-written only (no generator)

| id | Style | Answer type | |
|---|---|---|---|
| `classic` | The 8 existing modes (setting: which modes) | single | 🟢 |
| `pick_image` | Pick one ("Which one is Roman?") | single | 🟢 |
| `select_all` | Select all | multi | 🟢 |
| `odd_one_out` | Odd one out | single | 🟢 |
| `find_pair` | Which 2 are by the same artist? | multi | 🟢 |
| `placard_match` | Description → pick the artwork | single | 🟢 |
| `sort_groups` | Drag into Greek / Roman | match | 🟢 |
| `detail_match` | Zoomed crop → which painting | single | 🟢 |
| `zoom_reveal` / `blur_reveal` / `tile_reveal` | Reveal styles | single | 🟢 |
| `mirror` | Real or mirrored | single | 🟢 |
| `intruder_tile` | Find the wrong tile | tap_area | 🟢 |
| `missing_piece` | Which piece fits | single | 🟢 |
| `timeline` | Oldest → newest | order | 🟢 |
| `match_pairs` | Artist ↔ artwork | match | 🟢 |
| `match_period` | Artwork ↔ period | match | 🟢 |
| `year_slider` | When was this made? | numeric | 🟢 |
| `before_after` | Before or after 1500? | binary | 🟢 |
| `older_newer` | Older or newer than the last | binary | 🟢 |
| `more_loved` | Which do members like more? | binary | 🟢 |
| `true_false` | "This is by Monet." | binary | 🟢 |
| `two_truths` | Two truths and a lie | single | 🟢 |
| `fill_title` | "The Starry ___" | single | 🟢 |
| `type_artist` | Type the artist | text | 🟢 |
| `unscramble` | T E N O M | text | 🟢 |
| `clue_ladder` | Clues one by one | single | 🟢 |
| `color_palette` | 5 colors → which painting | single | 🟡 palette extraction at ingest |
| `map_pin` | Where was this made? | map | 🟡 coordinates list for countries / museums |
| `spot_change`, `pin_it`, `price_guess`, `emoji_riddle`, `artist_quote` | | tap_area / numeric / single | ✍️ admin-authored |

---

## To-do

### Phase 0: Decide
- [ ] Confirm the plan with Daniel
- [ ] Choose: should generated questions go **live immediately**, or need
      **admin approval** first? (Suggestion: live, with "review" as a setting per style.)
- [x] Choose the cron time (suggestion: 00:10 UTC, before the daily push)
- [ ] Choose which styles go into the first app release (suggestion: all
      answer types except `map` and `tap_area`)

### Phase 1: Foundation (no visible change for players)
- [x] `supabase/quiz-engine.sql`: `quiz_styles`, `quiz_items`,
      `daily_quiz_items`, `quiz_generation_runs`, RLS, `next_quiz_items` RPC
- [x] Seed `quiz_styles` with every style id, all off except `classic`
- [x] Backend `src/quiz/`: types, scoring, catalog loader, validator, registry
- [x] Move the 8 classic modes into `styles/classic.ts`, so app and cron share
      one implementation
- [x] `runGeneration` + `npm run quiz:generate` / `quiz:generate:prod` (+ `--dry-run`)
- [x] Old `daily_quiz_questions` keeps its own `quiz:daily` cron for old app versions
- [x] Admin API: run, preview, runs
- [x] Cron line + log rotation in INGEST.md
- [x] Tests: each builder returns valid items; validator rejects bad ones;
      scoring per answer type

### Phase 2: Admin panel
- [x] "Question Styles" section in the Quiz tab: toggle, per run, surfaces, settings
- [x] Preview, Generate now, Generate all
- [x] Run history, items list (retire / approve), bad-question flags

### Phase 3: App (one release)
- [x] `src/lib/quiz/engine/`: types, scoring, fetch with supported answer types
- [x] Renderers: single (text and image grid, reveal / crop / flip), multi,
      binary, order, match, numeric, text
- [x] Daily + practice read (topic trials still on-device — not changed) from the new tables, with offline fallback
      to the on-device classic generator
- [x] Skip unknown styles safely; send `shown` / `correct` stats

### Phase 4: Style builders (backend only, turned on from admin)
- [x] Batch 1: `pick_image`, `select_all`, `year_slider`, `zoom_reveal`, `older_newer`
- [x] Batch 2: remaining 🟢 styles
- [ ] Batch 3: 🟡 `color_palette` (palette at ingest), `map_pin` (coordinates list)
      + app renderers `map` and `tap_area` (next app release)
- [ ] Admin form for ✍️ hand-written styles

### Later
- [ ] Battles read from the same `quiz_items` through an RPC that **never sends
      `answer`**, and check answers on the server (see quiz battle notes)
- [ ] Retire the old `daily_quiz_questions` once old app versions are gone
