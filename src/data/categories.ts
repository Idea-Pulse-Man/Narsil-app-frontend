import type { Artwork, CategoryId } from "./types";

/** Discover groups the categories into sections (per the client's sketch). */
export type CategoryGroup = "medium" | "empire" | "movement";

export interface Category {
  id: CategoryId;
  label: string;
  blurb: string;
  /** Which Discover section this category belongs to. */
  group: CategoryGroup;
  /** Gradient accents for the Discover card. */
  from: string;
  to: string;
}

/**
 * Discover browse categories. Per the client's sketch these are laid out as a
 * grouped vertical list — mediums first, then "by empire", then movements — and
 * double as the filter keys used on Search.
 */
export const categories: Category[] = [
  { id: "paintings", label: "Paintings", blurb: "Oil, tempera & canvas", group: "medium", from: "#3a2f5a", to: "#1a1530" },
  { id: "sculptures", label: "Sculptures", blurb: "Marble, bronze & stone", group: "medium", from: "#4a4338", to: "#221f1a" },
  { id: "pottery", label: "Pottery", blurb: "Vessels & ceramic art", group: "medium", from: "#5a3a28", to: "#2a1c14" },
  { id: "etching-writing-books", label: "Etching · Writing · Books", blurb: "Drawing & the printed page", group: "medium", from: "#2f4a45", to: "#142220" },
  { id: "roman", label: "Roman", blurb: "Empire & antiquity", group: "empire", from: "#5a2f2f", to: "#2a1616" },
  { id: "greek", label: "Greek", blurb: "Classical & Hellenistic", group: "empire", from: "#2f425a", to: "#161f2a" },
  { id: "egyptian", label: "Egyptian", blurb: "Pharaohs & the Nile", group: "empire", from: "#5a4a22", to: "#2a2210" },
  { id: "renaissance", label: "Renaissance", blurb: "Rebirth of the classical", group: "movement", from: "#3a3320", to: "#1c180e" },
  { id: "japanese-art", label: "Japanese Art", blurb: "Ukiyo-e & the Edo world", group: "movement", from: "#274a52", to: "#122226" },
  { id: "modern-art", label: "Modern Art", blurb: "Color, emotion & abstraction", group: "movement", from: "#3a2a4a", to: "#1a1424" },
];

export const categoryMap: Record<CategoryId, Category> = Object.fromEntries(
  categories.map((c) => [c.id, c])
) as Record<CategoryId, Category>;

/**
 * Whether an artwork belongs to a category. We match generously — by primary
 * category, empire, period, or tags — so every Discover card resolves to a
 * meaningful set (e.g. "Renaissance" finds works tagged or dated Renaissance,
 * "Greek" finds Greek-empire pieces).
 */
export function artworkMatchesCategory(art: Artwork, id: CategoryId): boolean {
  if (art.category === id) return true;
  const label = categoryMap[id]?.label.toLowerCase() ?? id;
  const haystack = [
    art.period,
    art.empire ?? "",
    ...art.tags,
  ]
    .join(" ")
    .toLowerCase();

  switch (id) {
    case "roman":
      return art.empire === "Roman";
    case "greek":
      return art.empire === "Greek";
    case "egyptian":
      return art.empire === "Egyptian";
    case "japanese-art":
      return art.empire === "Japanese" || haystack.includes("ukiyo");
    case "renaissance":
      return haystack.includes("renaissance");
    case "modern-art":
      return (
        art.category === "modern-art" ||
        haystack.includes("modern") ||
        haystack.includes("expressionism") ||
        haystack.includes("contemporary")
      );
    default:
      return haystack.includes(label);
  }
}
