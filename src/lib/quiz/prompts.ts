/**
 * Piece-specific quiz copy.
 *
 * Generic "What is it?" could apply to any work. Each prompt is built from
 * *other* facts about this artwork (medium, period, artist, subject…) so the
 * question names the piece without leaking the answer.
 */

import type { Artwork } from "@/data";
import type { QuizMode } from "./types";
import { MODE_PROMPT } from "./types";
import {
  artistName,
  museumOf,
  subjectOf,
  whereFrom,
  type ArtistIndex,
} from "./pool";
import type { Rng } from "./random";

const SCENE_KIND = [
  "portrait",
  "self-portrait",
  "landscape",
  "cityscape",
  "seascape",
  "still life",
  "interior",
  "marine",
  "night",
  "floral",
  "domestic",
];

function workNoun(art: Artwork): string {
  if (art.category === "sculptures") return "sculpture";
  if (art.category === "pottery") return "vessel";
  if (/fresco|plaster/i.test(art.medium)) return "fresco";
  if (/woodblock|ukiyo/i.test(art.medium)) return "print";
  if (/print|etching|lithograph|engraving/i.test(art.medium)) return "print";
  if (art.category === "etching-writing-books") {
    if (/parchment|drawing|ink|silverpoint/i.test(art.medium)) return "drawing";
    return "print";
  }
  if (art.category === "japanese-art" && /print|woodblock|paper/i.test(art.medium)) {
    return "print";
  }
  return "painting";
}

function createdVerb(art: Artwork): string {
  const noun = workNoun(art);
  if (noun === "painting" || noun === "fresco") return "painted";
  if (noun === "sculpture") return "sculpted";
  return "created";
}

/** Short medium phrase for use inside a prompt (never as the medium answer). */
function mediumHint(art: Artwork): string {
  const m = art.medium.trim();
  if (!m || m === "—") return workNoun(art);
  if (/oil on canvas/i.test(m)) return "oil painting";
  if (/acrylic on canvas/i.test(m)) return "acrylic painting";
  if (/woodblock/i.test(m)) return "woodblock print";
  if (/watercolor|watercolour/i.test(m)) return "watercolor";
  if (/tempera/i.test(m) && /plaster|fresco/i.test(m)) return "fresco";
  if (/tempera/i.test(m)) return "tempera painting";
  if (/fresco/i.test(m)) return "fresco";
  if (/marble/i.test(m)) return "marble sculpture";
  if (/^bronze$/i.test(m)) return "bronze";
  if (/terracotta|ceramic/i.test(m)) return "ceramic";
  if (/gold/i.test(m) && art.category === "sculptures") return "gold sculpture";
  const first = m.split(",")[0]?.trim() ?? "";
  if (first.length > 0 && first.length <= 24) return first.toLowerCase();
  return workNoun(art);
}

/** "Post-Impressionism" → "Post-Impressionist" so it reads as a modifier. */
function periodModifier(period: string): string {
  const p = period.trim();
  if (/ism$/i.test(p)) return p.replace(/ism$/i, "ist");
  return p;
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]!;
}

/**
 * One adjective/name that identifies this piece, never the field being asked.
 * Prefers artist, then period, year, origin, short museum — then picks among
 * the top two so the same work isn't always worded identically.
 */
function modifierFor(
  art: Artwork,
  mode: QuizMode,
  rng: Rng,
  artists?: ArtistIndex,
): string {
  const ranked: string[] = [];

  if (mode !== "who") {
    const name = artistName(art, artists);
    if (name) ranked.push(name);
  }
  if (mode !== "period") {
    const period = art.period?.trim();
    if (period && period !== "—") ranked.push(periodModifier(period));
  }
  if (mode !== "age") {
    const year = art.year?.trim();
    if (year && year !== "—" && year.length <= 18) ranked.push(year);
  }
  if (mode !== "where") {
    const origin = whereFrom(art, artists);
    if (origin) ranked.push(origin);
  }
  if (mode !== "museum") {
    const museum = museumOf(art);
    if (museum && museum.length <= 22) ranked.push(museum);
  }

  if (ranked.length === 0) return "";
  return pick(ranked.slice(0, 2), rng);
}

/** Noun for the piece: scene tag, then medium, then category ("painting"). */
function kindFor(art: Artwork, mode: QuizMode): string {
  if (mode !== "subject") {
    const subject = subjectOf(art).toLowerCase();
    if (subject && SCENE_KIND.includes(subject)) return subject;
  }
  if (mode !== "medium") return mediumHint(art);
  return workNoun(art);
}

/** "this Vermeer cityscape" / "this Baroque oil painting". */
export function piecePhrase(
  art: Artwork,
  mode: QuizMode,
  rng: Rng,
  artists?: ArtistIndex,
): string {
  const kind = kindFor(art, mode);
  const modifier = modifierFor(art, mode, rng, artists);
  if (!modifier) return `this ${kind}`;
  if (answerKeyish(modifier) === answerKeyish(kind)) return `this ${kind}`;
  return `this ${modifier} ${kind}`;
}

function answerKeyish(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Human prompt for `mode` on this artwork. Deterministic given `rng`. */
export function promptFor(
  mode: QuizMode,
  art: Artwork,
  rng: Rng,
  artists?: ArtistIndex,
): string {
  const piece = piecePhrase(art, mode, rng, artists);
  const verb = createdVerb(art);

  const options: Record<QuizMode, string[]> = {
    what: [
      `What is the title of ${piece}?`,
      `Which title belongs to ${piece}?`,
      `${cap(piece)} is titled…`,
    ],
    who: [
      verb === "painted" ? `Who painted ${piece}?` : `Who ${verb} ${piece}?`,
      `Which artist created ${piece}?`,
      `Who is the maker of ${piece}?`,
    ],
    age: [
      `When was ${piece} made?`,
      `When was ${piece} created?`,
      `Which date belongs to ${piece}?`,
    ],
    where: [
      `Where is ${piece} from?`,
      `Which culture produced ${piece}?`,
      `Where does ${piece} come from?`,
    ],
    medium: [
      `What medium is ${piece}?`,
      `How was ${piece} made?`,
      `${cap(piece)} was created in which medium?`,
    ],
    period: [
      `Which period does ${piece} belong to?`,
      `${cap(piece)} is an example of which movement?`,
      `Which art-historical period is ${piece}?`,
    ],
    museum: [
      `Where is ${piece} held today?`,
      `Which collection houses ${piece}?`,
      `Where can ${piece} be seen?`,
    ],
    subject: [
      `What kind of scene is ${piece}?`,
      `${cap(piece)} is best described as a…`,
      `What is the subject of ${piece}?`,
    ],
  };

  return pick(options[mode], rng) || MODE_PROMPT[mode];
}

function cap(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
