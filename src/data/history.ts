import type { Artwork } from "./types";

export interface HistoryEra {
  id: string;
  title: string;
  years: string;
  description: string;
  /** Hand-picked set pieces, pinned at the top of the era's works. */
  artworkIds: string[];
  /** Live-catalog matching: ancient empires that place a work in this era. */
  empires?: string[];
  /** Live-catalog matching: substrings looked up in a work's period + tags. */
  keywords?: string[];
  /**
   * Live-catalog fallback: inclusive year range, negative years = BC. Ranges
   * are disjoint across eras so a date-only work lands in exactly one — they
   * can differ from the displayed `years` where real eras overlap (e.g.
   * Ptolemaic Egypt vs. Greek antiquity: a date-only Mediterranean work from
   * those centuries is assigned to antiquity).
   */
  range?: [number, number];
}

/** Learning timeline for the Discover page, oldest → newest. */
export const historyEras: HistoryEra[] = [
  {
    id: "ancient-egypt",
    title: "Ancient Egypt",
    years: "3100 – 30 BC",
    description:
      "Three thousand years of sculpture, painting, and craft devoted to gods, pharaohs, and the afterlife — defined by order, symmetry, and permanence.",
    artworkIds: ["tutankhamun-mask"],
    empires: ["Egyptian"],
    keywords: ["egypt", "pharaoh", "ptolema"],
    range: [-3100, -801],
  },
  {
    id: "classical-antiquity",
    title: "Greek & Roman Antiquity",
    years: "800 BC – 400 AD",
    description:
      "The classical ideal — balance, proportion, and the human form — from Archaic Greek pottery and Hellenistic marble to the bronze emblems of Rome.",
    artworkIds: ["exekias-amphora", "winged-victory", "capitoline-wolf"],
    empires: ["Greek", "Roman"],
    keywords: ["greek", "greece", "roman", "hellenis", "etrusc", "attic", "archaic"],
    range: [-800, 399],
  },
  {
    id: "medieval",
    title: "Medieval & Byzantine",
    years: "400 – 1400",
    description:
      "A thousand years of faith made visible — gilded icons, illuminated manuscripts, and Gothic craft reaching for heaven.",
    artworkIds: [],
    keywords: ["medieval", "gothic", "byzantin", "romanesque", "middle ages", "illuminat"],
    range: [400, 1399],
  },
  {
    id: "renaissance",
    title: "Renaissance",
    years: "1400 – 1600",
    description:
      "A rebirth of classical ideals — humanism, perspective, and luminous color transformed European painting.",
    artworkIds: ["map-of-hell", "last-supper"],
    keywords: ["renaissance", "mannerism"],
    range: [1400, 1599],
  },
  {
    id: "baroque",
    title: "Baroque & Dutch Golden Age",
    years: "1600 – 1750",
    description:
      "Drama, light, and intimate domestic scenes. Masters captured everyday life with extraordinary precision.",
    artworkIds: ["view-of-delft"],
    keywords: ["baroque", "dutch golden", "golden age", "rococo"],
    range: [1600, 1749],
  },
  {
    id: "romanticism",
    title: "Romanticism & Edo",
    years: "1750 – 1850",
    description:
      "Nature's sublime power and bold graphic traditions — from misty peaks to towering waves.",
    artworkIds: ["wanderer-fog", "great-wave"],
    keywords: ["romantic", "edo", "ukiyo"],
    range: [1750, 1849],
  },
  {
    id: "modern",
    title: "Modern Masters",
    years: "1850 – 1910",
    description:
      "Color, emotion, and ornament pushed to new extremes — the birth of modern art as we know it.",
    artworkIds: ["starry-night", "the-scream", "birch-forest"],
    keywords: ["impression", "art nouveau", "symbolis", "pointill", "realism"],
    range: [1850, 1909],
  },
  {
    id: "modernism",
    title: "Modern Art",
    years: "1910 – 1960",
    description:
      "Cubism, Surrealism, and the avant-garde shatter tradition — form and feeling reinvented for a new century.",
    artworkIds: [],
    keywords: [
      "expressionis",
      "cubis",
      "surreal",
      "dada",
      "bauhaus",
      "fauvis",
      "futurism",
      "constructiv",
      "abstract expression",
    ],
    range: [1910, 1959],
  },
  {
    id: "contemporary",
    title: "Contemporary",
    years: "1960 – today",
    description:
      "Pop, Minimalism, and living artists — art of the present, still being written.",
    artworkIds: [],
    keywords: [
      "pop art",
      "minimalis",
      "contemporary",
      "conceptual",
      "postmodern",
      "color field",
      "street art",
    ],
    range: [1960, 3000],
  },
];

/**
 * Best-effort year from a museum date string. Handles "c. 1831",
 * "1503 – 1506" (first year wins), "c. 190 BC", and "5th century"
 * (mid-century). Returns null when no year can be read.
 */
function parseYear(text: string): number | null {
  const bc = /\bB\.?C\.?E?\.?/i.test(text);
  const century = text.match(/(\d{1,2})(?:st|nd|rd|th)\s*c(?:entury\b|\.)/i);
  if (century) {
    const mid = (Number(century[1]) - 1) * 100 + 50;
    return bc ? -mid : mid;
  }
  const year = text.match(/\d{1,4}/);
  if (!year) return null;
  return bc ? -Number(year[0]) : Number(year[0]);
}

/** Direct signal — the work's empire or period/tags name this era. */
function strongMatch(era: HistoryEra, art: Artwork): boolean {
  if (art.empire && era.empires?.includes(art.empire)) return true;
  if (!era.keywords) return false;
  const haystack = [art.period, ...art.tags].join(" ").toLowerCase();
  return era.keywords.some((keyword) => haystack.includes(keyword));
}

/**
 * The single era a live-catalog work belongs to, or undefined. Named signals
 * (empire, period, tags) win over the date fallback so e.g. an Edo print dated
 * 1860 still lands in "Romanticism & Edo" rather than "Modern Masters".
 */
export function eraForArtwork(art: Artwork): HistoryEra | undefined {
  const strong = historyEras.find((era) => strongMatch(era, art));
  if (strong) return strong;
  const year = parseYear(art.year);
  if (year === null) return undefined;
  return historyEras.find(
    (era) => era.range && year >= era.range[0] && year <= era.range[1],
  );
}

/** Artists spotlighted on the Discover page's "Featured artists" rail. */
export const featuredArtistIds: string[] = [
  "van-gogh",
  "hokusai",
  "da-vinci",
  "klimt",
  "vermeer",
  "munch",
];
