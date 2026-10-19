/**
 * Scoring per answer type. Mirrors narsil-museum-backend/src/quiz/scoring.ts.
 */
import type {
  AnswerType,
  ChoiceAnswer,
  ItemAnswer,
  MatchAnswer,
  NumericAnswer,
  OrderAnswer,
  PlayerResponse,
  ScoreResult,
  TextAnswer,
} from "./types";

/** A numeric guess at or above this fraction counts as correct. */
export const NUMERIC_CORRECT_AT = 0.5;

/** Lower-case, strip accents and punctuation, collapse spaces. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function numericFraction(answer: NumericAnswer, guess: number): number {
  const d = Math.abs(guess - answer.value);
  if (d <= answer.full_within) return 1;
  if (d >= answer.zero_beyond) return 0;
  return 1 - (d - answer.full_within) / (answer.zero_beyond - answer.full_within);
}

const WRONG: ScoreResult = { correct: false, fraction: 0 };

export function scoreResponse(
  answerType: AnswerType,
  answer: ItemAnswer,
  response: PlayerResponse,
): ScoreResult {
  switch (answerType) {
    case "single":
    case "binary": {
      if (response.kind !== "choice") return WRONG;
      const ok =
        response.ids.length === 1 &&
        (answer as ChoiceAnswer).correct.includes(response.ids[0]!);
      return { correct: ok, fraction: ok ? 1 : 0 };
    }
    case "multi": {
      if (response.kind !== "choice") return WRONG;
      const correct = new Set((answer as ChoiceAnswer).correct);
      let hits = 0;
      let wrong = 0;
      for (const id of new Set(response.ids)) {
        if (correct.has(id)) hits++;
        else wrong++;
      }
      return {
        correct: hits === correct.size && wrong === 0,
        fraction: Math.max(0, (hits - wrong) / Math.max(1, correct.size)),
      };
    }
    case "order": {
      if (response.kind !== "order") return WRONG;
      const order = (answer as OrderAnswer).order;
      const right = order.filter((id, i) => response.ids[i] === id).length;
      return {
        correct: right === order.length,
        fraction: order.length ? right / order.length : 0,
      };
    }
    case "match": {
      if (response.kind !== "match") return WRONG;
      const pairs = Object.entries((answer as MatchAnswer).pairs);
      const right = pairs.filter(([k, v]) => response.pairs[k] === v).length;
      return {
        correct: right === pairs.length,
        fraction: pairs.length ? right / pairs.length : 0,
      };
    }
    case "numeric": {
      if (response.kind !== "numeric" || !Number.isFinite(response.value)) {
        return WRONG;
      }
      const fraction = numericFraction(answer as NumericAnswer, response.value);
      return { correct: fraction >= NUMERIC_CORRECT_AT, fraction };
    }
    case "text": {
      if (response.kind !== "text") return WRONG;
      const guess = normalizeText(response.value);
      const ok =
        guess.length > 0 &&
        (answer as TextAnswer).accept.some((a) => normalizeText(a) === guess);
      return { correct: ok, fraction: ok ? 1 : 0 };
    }
    default:
      return WRONG;
  }
}

/** "1642" / "120 BC" */
export function formatYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} BC` : String(year);
}
