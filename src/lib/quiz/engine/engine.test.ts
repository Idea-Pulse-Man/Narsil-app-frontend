import { describe, expect, it } from "vitest";
import { scoreResponse, normalizeText, formatYear } from "./scoring";
import { itemToQuestion, normalizeItem } from "./fetch";

const pickRow = {
  id: "11111111-1111-1111-1111-111111111111",
  style: "pick_image",
  answer_type: "single",
  prompt: "Which one is Roman?",
  media: { label: "Pick one", options_as: "image", columns: 2 },
  options: [
    { id: "a", image_url: "https://img/1.jpg", artwork_id: "met-1", note: "Greek" },
    { id: "b", image_url: "https://img/2.jpg", artwork_id: "met-2", note: "Roman" },
    { id: "c", image_url: "https://img/3.jpg", artwork_id: "met-3", note: "Etruscan" },
  ],
  answer: { correct: ["b"] },
  explain: "Statue — 120 AD",
  difficulty: "scholar",
  artwork_ids: ["met-2", "met-1", "met-3"],
};

describe("engine items from Supabase", () => {
  it("accepts a valid row and wraps it as a QuizQuestion", () => {
    const item = normalizeItem(pickRow);
    expect(item).not.toBeNull();
    const q = itemToQuestion(item!);
    expect(q.item?.id).toBe(pickRow.id);
    expect(q.correctIndex).toBe(0);
    // The review row links to the right answer's artwork.
    expect(q.artworkId).toBe("met-2");
    expect(q.artwork.image).toBe("https://img/2.jpg");
  });

  it("parses jsonb that arrives as strings", () => {
    const item = normalizeItem({
      ...pickRow,
      media: JSON.stringify(pickRow.media),
      options: JSON.stringify(pickRow.options),
      answer: JSON.stringify(pickRow.answer),
    });
    expect(item?.options).toHaveLength(3);
  });

  it("drops rows it can't render", () => {
    expect(normalizeItem({ ...pickRow, answer_type: "map" })).toBeNull();
    expect(normalizeItem({ ...pickRow, answer: { correct: ["z"] } })).toBeNull();
    expect(normalizeItem({ ...pickRow, media: {} })).toBeNull();
    expect(
      normalizeItem({
        ...pickRow,
        answer_type: "numeric",
        options: [],
        media: { label: "Year" },
        answer: { value: 1600, full_within: 10, zero_beyond: 100, display: "1600" },
      }),
    ).toBeNull();
  });
});

describe("engine scoring (mirror of the backend)", () => {
  it("scores every answer type", () => {
    expect(scoreResponse("single", { correct: ["b"] }, { kind: "choice", ids: ["b"] }).correct).toBe(true);
    expect(scoreResponse("multi", { correct: ["a", "b"] }, { kind: "choice", ids: ["a"] }).fraction).toBe(0.5);
    expect(scoreResponse("order", { order: ["a", "b", "c"] }, { kind: "order", ids: ["a", "b", "c"] }).correct).toBe(true);
    expect(scoreResponse("match", { pairs: { a: "t1" } }, { kind: "match", pairs: { a: "t2" } }).correct).toBe(false);
    const year = { value: 1642, full_within: 10, zero_beyond: 110, display: "1642" };
    expect(scoreResponse("numeric", year, { kind: "numeric", value: 1702 }).fraction).toBeCloseTo(0.5);
    expect(
      scoreResponse("text", { accept: ["Dürer"], display: "Albrecht Dürer" }, { kind: "text", value: " durer " }).correct,
    ).toBe(true);
  });

  it("formats text and years", () => {
    expect(normalizeText("Vincent van GOGH!")).toBe("vincent van gogh");
    expect(formatYear(-120)).toBe("120 BC");
    expect(formatYear(1642)).toBe("1642");
  });
});
