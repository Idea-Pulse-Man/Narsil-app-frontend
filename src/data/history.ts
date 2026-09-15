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
  /**
   * When false, Discover omits Trial of the Age for this period. Default true.
   * Use for ages we have not authored a quiz for.
   */
  quizPrepared?: boolean;
}

/** Learning timeline for the Discover page, oldest → newest. */
export const historyEras: HistoryEra[] = [
  {
    id: "ancient-egypt",
    title: "Ancient Egypt",
    years: "3100 – 30 BC",
    description:
      "Three thousand years of sculpture, painting, and craft devoted to gods, pharaohs, and the afterlife. Tomb walls, temple reliefs, and gold funerary masks followed strict order and symmetry — art meant to last forever in the land of the Nile.",
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
      "The classical ideal — balance, proportion, and the human form. Archaic Greek pottery and Hellenistic marble gave way to Rome's portraits, mosaics, and public monuments that still shape how we imagine antiquity.",
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
      "A thousand years of faith made visible. Gilded Byzantine icons, illuminated manuscripts, and soaring Gothic stone carved a sacred language of light, gold, and devotion across Europe and the Mediterranean.",
    artworkIds: [
      "justinian-mosaic",
      "vladimir-icon",
      "book-of-kells",
      "bayeux-tapestry",
      "giotto-lamentation",
    ],
    keywords: ["medieval", "gothic", "byzantin", "romanesque", "middle ages", "illuminat"],
    range: [400, 1399],
    quizPrepared: false,
  },
  {
    id: "renaissance",
    title: "Renaissance",
    years: "1400 – 1600",
    description:
      "A rebirth of classical ideals across Italy and beyond. Artists rediscovered perspective, anatomy, and luminous oil color — from Leonardo's sfumato and Michelangelo's monumental figures to Raphael's harmony and the Venetian glow of Titian. Humanism put people, not only saints, at the center of the picture.",
    artworkIds: ["map-of-hell", "last-supper"],
    keywords: ["renaissance", "mannerism"],
    range: [1400, 1599],
  },
  {
    id: "baroque",
    title: "Baroque & Dutch Golden Age",
    years: "1600 – 1750",
    description:
      "Drama, light, and intimate everyday life. Caravaggio's shadows, Rembrandt's psychology, and Vermeer's quiet rooms defined an age when paint could feel as alive as the people it depicted — from church altarpieces to Dutch Golden Age interiors.",
    artworkIds: ["view-of-delft"],
    keywords: ["baroque", "dutch golden", "golden age", "rococo"],
    range: [1600, 1749],
  },
  {
    id: "romanticism",
    title: "Romanticism & Edo",
    years: "1750 – 1850",
    description:
      "Nature's sublime power met bold graphic traditions. European Romantics chased mist, mountains, and emotion, while Edo Japan's ukiyo-e masters — Hokusai, Hiroshige — turned waves, roads, and everyday scenes into iconic prints the world still recognizes.",
    artworkIds: ["wanderer-fog", "great-wave"],
    keywords: ["romantic", "edo", "ukiyo"],
    range: [1750, 1849],
  },
  {
    id: "modern",
    title: "Modern Masters",
    years: "1850 – 1910",
    description:
      "Color, emotion, and ornament pushed to new extremes. Impressionists fractured light outdoors; Van Gogh, Munch, and Klimt turned feeling into paint — the birth of modern art as we know it, from Starry Night to The Scream.",
    artworkIds: ["starry-night", "the-scream", "birch-forest"],
    keywords: ["impression", "art nouveau", "symbolis", "pointill", "realism"],
    range: [1850, 1909],
  },
  {
    id: "modernism",
    title: "Modern Art",
    years: "1910 – 1960",
    description:
      "Cubism, Surrealism, and the avant-garde shattered tradition. Picasso, Matisse, and their peers reinvented form and feeling for a century of war, machines, and radical ideas — art that no longer had to look like the world to tell the truth about it.",
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
      "Pop, Minimalism, and living artists. From Warhol's soup cans to today's installations and street art, contemporary practice is still being written — art of the present, in museums and on city walls alike.",
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
