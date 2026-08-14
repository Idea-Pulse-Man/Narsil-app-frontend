/**
 * Question generation.
 *
 * Given a target artwork and a pool to draw distractors from, build a
 * four-option multiple-choice question. Distractors are de-duped against the
 * correct answer and each other.
 */

import type { Artwork, CategoryId } from "@/data";
import { artistMap } from "@/data";
import type { QuizMode, QuizQuestion } from "./types";
import { MODE_PROMPT, QUIZ_MODES } from "./types";
import { answerFor, answerKey, eligibleFor, isModePlayable } from "./pool";
import type { Rng } from "./random";
import { shuffle } from "./random";

const OPTION_COUNT = 4;

const KIND_BY_CATEGORY: Partial<Record<CategoryId, string>> = {
  paintings: "painting",
  sculptures: "sculpture",
  pottery: "pottery",
  "etching-writing-books": "print",
};

/** Short kind of work for prompts ("painting", "sculpture") — not the full medium string. */
function kindOfWork(artwork: Artwork): string {
  const medium = artwork.medium?.trim() ?? "";
  const m = medium.toLowerCase();

  if (m && m !== "—") {
    if (/\bfresco\b/.test(m)) return "fresco";
    if (/\b(oil|tempera|acrylic|watercolor|gouache)\b/.test(m)) return "painting";
    if (/\b(woodblock|ukiyo-e|etching|engraving|lithograph|print)\b/.test(m)) {
      return "print";
    }
    if (/\b(marble|bronze|alabaster|ivory)\b/.test(m)) return "sculpture";
    if (/\b(ceramic|pottery|terracotta|earthenware|porcelain)\b/.test(m)) {
      return "pottery";
    }
    if (/\b(photograph|daguerreotype)\b/.test(m)) return "photograph";
    if (/\b(drawing|silverpoint|charcoal)\b/.test(m) && !/\bcanvas\b/.test(m)) {
      return "drawing";
    }
  }

  return KIND_BY_CATEGORY[artwork.category] ?? "artwork";
}

function artistName(artwork: Artwork, override?: string): string {
  const name =
    (override?.trim() || artistMap[artwork.artistId]?.name)?.trim() ?? "";
  if (!name || name === "—" || /^(unknown|anonymous|unidentified)\b/i.test(name)) {
    return "";
  }
  return name;
}

function workTitle(artwork: Artwork): string {
  const title = artwork.title?.trim().replace(/\s+/g, " ") ?? "";
  if (!title || title === "—" || /^untitled$/i.test(title)) return "";
  return title.length > 48 ? `${title.slice(0, 47).trimEnd()}…` : title;
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function isCollective(name: string): boolean {
  return /workshop|circle of|school of|studio of|followers of/i.test(name);
}

/** "Vincent van Gogh's painting The Starry Night" / "the sculpture by the Royal Workshop of Thebes". */
function namedWork(artist: string, kind: string, title: string): string {
  const collective = artist ? isCollective(artist) : false;

  if (artist && title && !collective) return `${possessive(artist)} ${kind} ${title}`;
  if (artist && title && collective) return `the ${kind} ${title} by ${artist}`;
  if (artist && !title) {
    return collective ? `this ${kind} by ${artist}` : `${possessive(artist)} ${kind}`;
  }
  if (title) return `the ${kind} ${title}`;
  return `this ${kind}`;
}

/**
 * Specific prompt for this artwork. "What" asks for the title, so the title is
 * omitted there; where/when name the work so the question isn't a stock phrase.
 *
 * Pass `artistDisplay` when the live catalog has the maker (static `artistMap`
 * only covers the curated mock set).
 */
export function promptFor(
  mode: QuizMode,
  artwork: Artwork,
  artistDisplay?: string,
): string {
  const kind = kindOfWork(artwork);
  const artist = artistName(artwork, artistDisplay);
  const title = workTitle(artwork);

  if (mode === "what") {
    return artist
      ? `What is the name of this ${kind} by ${artist}?`
      : `What is the name of this ${kind}?`;
  }

  const subject = namedWork(artist, kind, title);
  if (mode === "age") return `When was ${subject} made?`;
  if (mode === "where") return `Where is ${subject} from?`;
  return MODE_PROMPT[mode];
}

/** Long museum titles overflow the mobile buttons — cap them with an ellipsis. */
function trimOption(value: string, max = 60): string {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Candidate distractor values for a mode, excluding the correct answer. */
function distractorValues(
  mode: QuizMode,
  correct: string,
  target: Artwork,
  pool: Artwork[],
  rng: Rng,
): string[] {
  const correctK = answerKey(correct);
  const seen = new Set<string>([correctK]);
  const values: string[] = [];

  const consider = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const key = answerKey(value);
    if (seen.has(key)) return;
    seen.add(key);
    values.push(value);
  };

  for (const art of pool) {
    if (art.id === target.id) continue;
    consider(answerFor(art, mode));
  }

  return shuffle(values, rng);
}

/**
 * Build one question for `target`. Returns null when there aren't three
 * distinct distractors available (caller should skip and try another target).
 */
export function buildQuestion(
  mode: QuizMode,
  target: Artwork,
  pool: Artwork[],
  rng: Rng,
): QuizQuestion | null {
  const correct = answerFor(target, mode);
  if (!correct) return null;

  const distractors = distractorValues(mode, correct, target, pool, rng).slice(
    0,
    OPTION_COUNT - 1,
  );
  if (distractors.length < OPTION_COUNT - 1) return null;

  const options = shuffle(
    [correct, ...distractors].map((v) => trimOption(v)),
    rng,
  );
  const correctIndex = options.indexOf(trimOption(correct));
  if (correctIndex < 0) return null;

  return {
    id: `${target.id}:${mode}`,
    mode,
    artworkId: target.id,
    artwork: target,
    prompt: promptFor(mode, target),
    options,
    correctIndex,
  };
}

/** Playable modes for `pool`, in QUIZ_MODES order. */
export function playableModesFor(pool: Artwork[]): QuizMode[] {
  return QUIZ_MODES.filter((m) => isModePlayable(pool, m));
}

/** Pick a random playable mode (uniform). Falls back to any QUIZ_MODE. */
export function pickRandomMode(pool: Artwork[], rng: Rng): QuizMode {
  const playable = playableModesFor(pool);
  const modes = playable.length > 0 ? playable : QUIZ_MODES;
  return modes[Math.floor(rng() * modes.length)]!;
}

/**
 * One random question with a randomly chosen mode, avoiding artworks in
 * `excludeIds`. Returns null if the pool is exhausted.
 */
export function generateQuestion(
  pool: Artwork[],
  rng: Rng,
  excludeIds: Set<string> = new Set(),
  mode?: QuizMode,
): QuizQuestion | null {
  const chosen = mode ?? pickRandomMode(pool, rng);
  const candidates = shuffle(
    eligibleFor(pool, chosen).filter((a) => !excludeIds.has(a.id)),
    rng,
  );
  for (const target of candidates) {
    const question = buildQuestion(chosen, target, pool, rng);
    if (question) return question;
  }

  // If a forced mode failed, try the remaining playable modes so mixed practice
  // doesn't stall when one mode runs short of unused artworks.
  if (mode) return null;
  for (const fallback of shuffle(
    QUIZ_MODES.filter((m) => m !== chosen),
    rng,
  )) {
    const more = shuffle(
      eligibleFor(pool, fallback).filter((a) => !excludeIds.has(a.id)),
      rng,
    );
    for (const target of more) {
      const question = buildQuestion(fallback, target, pool, rng);
      if (question) return question;
    }
  }
  return null;
}
