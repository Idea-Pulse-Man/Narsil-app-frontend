export interface HistoryEra {
  id: string;
  title: string;
  years: string;
  description: string;
  artworkIds: string[];
}

/** Learning timeline for the History page, oldest → newest. */
export const historyEras: HistoryEra[] = [
  {
    id: "ancient-egypt",
    title: "Ancient Egypt",
    years: "3100 – 30 BC",
    description:
      "Three thousand years of sculpture, painting, and craft devoted to gods, pharaohs, and the afterlife — defined by order, symmetry, and permanence.",
    artworkIds: ["tutankhamun-mask"],
  },
  {
    id: "classical-antiquity",
    title: "Greek & Roman Antiquity",
    years: "800 BC – 400 AD",
    description:
      "The classical ideal — balance, proportion, and the human form — from Archaic Greek pottery and Hellenistic marble to the bronze emblems of Rome.",
    artworkIds: ["exekias-amphora", "winged-victory", "capitoline-wolf"],
  },
  {
    id: "renaissance",
    title: "Renaissance",
    years: "1400 – 1600",
    description:
      "A rebirth of classical ideals — humanism, perspective, and luminous color transformed European painting.",
    artworkIds: ["map-of-hell", "last-supper"],
  },
  {
    id: "baroque",
    title: "Baroque & Dutch Golden Age",
    years: "1600 – 1750",
    description:
      "Drama, light, and intimate domestic scenes. Masters captured everyday life with extraordinary precision.",
    artworkIds: ["view-of-delft"],
  },
  {
    id: "romanticism",
    title: "Romanticism & Edo",
    years: "1750 – 1850",
    description:
      "Nature's sublime power and bold graphic traditions — from misty peaks to towering waves.",
    artworkIds: ["wanderer-fog", "great-wave"],
  },
  {
    id: "modern",
    title: "Modern Masters",
    years: "1850 – 1910",
    description:
      "Color, emotion, and ornament pushed to new extremes — the birth of modern art as we know it.",
    artworkIds: ["starry-night", "the-scream", "birch-forest"],
  },
];

/** Artists spotlighted on the History page's "Featured artists" rail. */
export const featuredArtistIds: string[] = [
  "van-gogh",
  "hokusai",
  "da-vinci",
  "klimt",
  "vermeer",
  "munch",
];
