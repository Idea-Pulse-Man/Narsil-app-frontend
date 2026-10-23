# Quiz Question Engine — QA checklist

Test checklist for the new question styles, the generator cron and the admin
**Question Styles** panel. Plan and file map:
[quiz-question-engine.plan.md](quiz-question-engine.plan.md).

Tick each box on a **real iPhone build** unless it says "admin" (admin runs in
the same app). ✅ = expected result.

---

## 0. Setup (once, in this order)

- [ ] **SQL:** Supabase → SQL Editor → run `supabase/quiz-engine.sql`.
      ✅ Tables `quiz_styles` (27 rows, only `classic` on), `quiz_items`,
      `daily_quiz_items`, `quiz_generation_runs`, `quiz_engine_config` (1 row).
- [ ] Run the same file **again**. ✅ No error, and your switches/settings are unchanged.
- [ ] **Backend:** deploy (`npm run deploy` on EC2). ✅ `pm2 logs` shows no start-up error.
- [ ] **Dry run on EC2:** `npm run quiz:generate -- --dry-run`.
      ✅ Prints `catalog: N artworks…`, then `classic: built 10/10`, sample prompts, and `dry-run: built …`.
      Nothing is written.
- [ ] Dry run for every style at once:
      `npm run quiz:generate -- --dry-run --style=pick_image,select_all,odd_one_out,find_pair,placard_match,detail_match,zoom_reveal,blur_reveal,tiles_reveal,mirror,intruder_tile,missing_piece,timeline,match_pairs,match_period,sort_groups,year_slider,before_after,older_newer,more_loved,true_false,two_truths,fill_title,type_artist,unscramble,clue_ladder --count=3`
      ✅ Each style builds 3/3. **Write down any style that builds 0** — the real
      catalog is missing data for it (e.g. `more_loved` needs like counts,
      `placard_match` needs descriptions). Leave that style off.
- [ ] **Cron:** add the `quiz-generate` line from INGEST.md (00:10 UTC) and the logrotate block.
- [ ] **App:** build and install the new app version on an iPhone.

---

## 1. Generator + cron

- [ ] Real run: `npm run quiz:generate`. ✅ `classic: saved 10/10 …`, `daily 2026-…: added 10, now 10`.
- [ ] Run it again right away. ✅ New classic questions are saved; daily says `added 0` (already full).
- [ ] Start two runs at the same time (two terminals). ✅ The second one fails with "A generation run is already in progress".
- [ ] `--no-daily`. ✅ Questions are saved, the daily edition is untouched.
- [ ] `--date=<tomorrow>`. ✅ Tomorrow's edition is filled; today's is unchanged.
- [ ] Next morning: `tail -n 40 ~/quiz-generate-cron.log`. ✅ The cron ran at 00:10 UTC with no errors.
- [ ] The old cron still works: `~/daily-quiz-cron.log` shows its 00:15 run (old app versions depend on it).
- [ ] Supabase → `quiz_items`: no two rows share a `fingerprint` (duplicates are skipped).

---

## 2. Admin panel (Admin → Quiz tab → "Question styles")

- [ ] The panel loads: engine settings, buttons, last run, and 27 style cards. ✅ Only Classic shows **On**.
- [ ] Backend down (stop pm2) → open the panel. ✅ A clear error with "Try again", no crash. Start pm2 again.
- [ ] **On/Off:** turn Pick one on → toast "Pick one on", border turns green. Turn it off again. ✅ Change survives a refresh.
- [ ] **Surfaces:** toggle Daily / Practice chips. ✅ Saved instantly, the card subtitle updates.
- [ ] **Settings:** open Pick one, change "Ask about" to Period, "Images" to 6 → **Save settings**. ✅ Toast; after Refresh the values stay.
- [ ] Number fields can't go outside their min/max (type 99 into Images → becomes 6).
- [ ] Multiselect (Classic → Modes): you can't untick the last mode.
- [ ] **Preview 3:** ✅ 3 sample cards with prompt, options (✓ ring on the right one), and an "Answer:" line.
      Nothing new appears in the item counts.
- [ ] Preview with impossible settings (e.g. Select all, min right answers 4, Images 4). ✅ Toast explains no sample could be built, no crash.
- [ ] **Generate now** on one style. ✅ Toast "Generated N questions · daily +X"; "live" count on the card goes up; Last run updates.
- [ ] **Generate now** on a style that is **Off**. ✅ Questions are saved, but players still don't see them until it's turned On.
- [ ] **Generate all now.** ✅ All enabled styles generate; run history lists each style's count.
- [ ] **Review before live** on → Generate now. ✅ New items land in **To review**, not Live. "Make live" moves one to Live.
- [ ] **Only this (focus mode):** tap **Only this** on Year slider. ✅ Amber banner "Focus: every question is “Year slider”", card marked FOCUS; if it had fewer than the daily count, a toast says it's generating more.
- [ ] With focus on, play practice (fresh round) and start a daily on an account that hasn't played today. ✅ **Every** question is a year slider — no classic or other styles.
- [ ] Focus on a style that is **Off**. ✅ Still used for every question (focus overrides the switch).
- [ ] Focus on a style with **0** questions while the backend is down. ✅ Banner warns "None yet"; players get classic questions until it's generated.
- [ ] **Clear focus**. ✅ Banner gone; the next practice round is the normal mix again.
- [ ] **Questions → Retire** one live question. ✅ It moves to Retired and stops appearing in practice.
- [ ] **Flagged** tab: empty at first. (After ≥30 plays, questions with <15% or >97% right appear here.)
- [ ] **Engine settings:** set Daily questions = 6 and Practice % = 100 → Save. ✅ Persists after refresh; tomorrow's daily has 6.
- [ ] Sign in as a **non-admin** → the admin tab isn't available; trying the API without admin returns 403.

---

## 3. Every new question (common checks)

Turn a style on, set Practice % to 100, then **Generate now** so practice uses only that style.

- [ ] Images load (no grey squares stuck for more than ~3 s on Wi-Fi).
- [ ] The badge at the top shows the style name (e.g. "PICK ONE").
- [ ] Answering shows ✅ **Correct** / **Not quite** / **Partly right · 50%** plus the explanation line.
- [ ] **Next ›** moves on at once; without tapping, it moves on by itself (≈2 s single/binary, ≈4.5 s others).
- [ ] You can't answer twice (double taps do nothing).
- [ ] Haptics: success buzz when right, error buzz when wrong.
- [ ] Small iPhone (SE / mini): everything reachable by scrolling, Submit button not hidden.
- [ ] Back arrow mid-question → hub, no crash.

---

## 4. Per style

| ✓ | Style | How to test | ✅ Expected |
|---|---|---|---|
| [ ] | **Classic** | Play a few | Same look as before: 1 image, 4 text answers |
| [ ] | **Pick one** | Tap a wrong image, then another question tap the right one | Wrong: red ring + the right one green; notes (e.g. "Greek · 400 BC") appear under each image |
| [ ] | **Select all** | Tap 1 right only → Check | "Partly right"; missed ones get a dashed amber ring. Check button disabled with 0 picked |
| [ ] | **Odd one out** | Answer | The intruder gets the ✓; notes show why |
| [ ] | **Find the pair** | Tap 1, then a 3rd after 2 | Button reads "Pick 2" until exactly 2; a 3rd tap replaces the oldest pick |
| [ ] | **Placard match** | Read the label | No artist name or title visible in the text (shown as ▁▁▁) |
| [ ] | **Detail match** | Look at the main image | Shows a zoomed **part** of one of the 4 options |
| [ ] | **Zoom-out** | Wait without answering | Image starts very zoomed and zooms out over ~10 s; answering shows the full image at once |
| [ ] | **Blur reveal** | Wait | Starts blurred, sharpens over ~10 s |
| [ ] | **Tile reveal** | Wait | 9 dark tiles open one by one; answering removes them all |
| [ ] | **Real or mirrored** | Answer | One image is flipped; notes say "Original" / "Mirrored" |
| [ ] | **Intruder tile** | Look at the 3×3 grid | 8 tiles form one picture, 1 tile is clearly from another work; tapping answers |
| [ ] | **Missing piece** | Look at the main image | A dashed dark square hides one part; the right piece matches that part |
| [ ] | **Timeline** | Tap 4 works in order; tap a numbered one to remove it | Numbers 1–4 appear; Submit only when all 4 placed; after: years shown, wrong ones show "2→3" |
| [ ] | **Match pairs** | Tap work → tap artist chip | Next unmatched work auto-selects; Check only when all matched; wrong ones show "→ right name" |
| [ ] | **Match to period** | Same as above | Period chips instead of artists |
| [ ] | **Sort into groups** | Sort 6 works into 2 chips | Six taps on the chips are enough (auto-advance) |
| [ ] | **Year slider** | Drag, Lock in | Slider middle is **not** the answer; after: "Answer: 1642 · 18 years off"; ≥50% counts as Correct |
| [ ] | **Before or after** | Answer | Two side-by-side buttons "Before 1500" / "After 1500" |
| [ ] | **Older or newer** | Look at the image | Small "vs <title>" picture in the corner; Older / Newer buttons |
| [ ] | **More loved** | Answer | Notes show like counts under each image |
| [ ] | **True or false** | Answer several | Mix of true and false statements (not always "True") |
| [ ] | **Two truths and a lie** | Answer | 3 statements; exactly one is false |
| [ ] | **Fill the title** | Answer | Prompt shows "Complete the title: “The ___ …”"; 4 one-word options |
| [ ] | **Type the artist** | Type "mon" | Suggestions appear and fill the box when tapped; "monet" (any case, no accents) is accepted |
| [ ] | **Unscramble** | Tap letters, Undo, Check | Slots fill in order; Undo removes the last; Check only when all letters used |
| [ ] | **Clue ladder** | Wait | Clues appear one by one (~3 s); the image stays hidden until you answer |

---

## 5. Daily quiz (Royal Assessment)

- [ ] With styles on for **Daily** and the cron/Generate having filled today: Start. ✅ A **mix** of styles, count = admin "Daily questions".
- [ ] Answer 3, close the app, reopen → **Resume**. ✅ Continues at question 4, same questions.
- [ ] Finish. ✅ Results show score, points, and **Review works** rows (prompt + style name + Correct/Missed). Tapping a row opens that artwork.
- [ ] Reopen the hub → **Review**. ✅ Same results, no replay.
- [ ] Time bonus: answer fast vs slow on two days. ✅ Points differ like before.
- [ ] Empty edition: delete today's `daily_quiz_items` rows → Start. ✅ Falls back to the classic shared edition (or on-device), never a blank quiz.
- [ ] Streak and Hall ranking still update after finishing (signed-in account).

## 6. Practice (Uncharted Archives)

- [ ] Practice % = 60. ✅ Roughly 6 in 10 questions are new styles, the rest classic.
- [ ] Practice % = 0. ✅ Only classic questions (old behaviour).
- [ ] Free account: after **5** questions the Guild paywall opens (after the 5th answer is shown).
- [ ] Pro: play 40+ questions. ✅ Never stalls; new batches load in the background.
- [ ] Play, leave, come back. ✅ Recently played engine questions don't repeat (up to the last 400).
- [ ] Airplane mode → start practice. ✅ Starts within ~4 s with classic questions only.
- [ ] Supabase → `quiz_items`: `shown_count` / `correct_count` go up as you play.

## 7. Safety and old versions

- [ ] **Old app version** (installed before this release): daily quiz still works, classic only.
- [ ] Turn a style **off** mid-day. ✅ Practice stops showing it at once; today's daily keeps it (the day stays the same for everyone).
- [ ] Retire a question that's in today's daily. ✅ It disappears from the daily for players who haven't started yet.
- [ ] Break a row on purpose (Supabase: set one item's `answer` to `{}`). ✅ The app skips it, nothing crashes. Restore it afterwards.
- [ ] Before the SQL is run (staging / fresh DB): the app behaves exactly like the old version.

## 8. Known limits (not bugs)

- `more_loved` stores like counts at generation time; they can drift. Retire old ones if needed.
- Answers are checked on the phone (fine for solo play). Battles will need server checking.
- Topic trials (Discover ages / empires) still use on-device classic questions.
- Not built yet: map pin, color palette, and the hand-written styles (spot the change, pin it, price guess, emoji riddle, artist quote).
