import type { Artist } from "./types";

/**
 * Artists fall into two profile styles (see `ArtistProfileType`):
 *  - historical: museum masters and ancient/anonymous attributions
 *  - freelance:  sample contemporary creators for the future posting feature
 */

/** Public-domain portrait via Wikimedia Commons (same endpoint as artworks). */
const portrait = (file: string, width = 200) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    file
  )}?width=${width}`;
export const artists: Artist[] = [
  // ── Historical masters ──────────────────────────────────────────────
  {
    id: "vermeer",
    name: "Johannes Vermeer",
    initials: "JV",
    profileType: "historical",
    lifespan: "1632 – 1675",
    nationality: "Dutch",
    period: "Dutch Golden Age",
    style: "Baroque",
    knownFor: "Luminous domestic interiors and masterful use of natural light",
    bio: "A painter from Delft who worked slowly and with great care, producing a small but extraordinary body of work. Vermeer is celebrated for the quiet intimacy of his scenes and an almost photographic sensitivity to light, color, and texture.",
    followers: 184000,
    likes: 920000,
    saves: 256000,
  },
  {
    id: "van-gogh",
    name: "Vincent van Gogh",
    initials: "VG",
    avatar: portrait(
      "Vincent van Gogh - Self-Portrait - Google Art Project (454045).jpg"
    ),
    profileType: "historical",
    lifespan: "1853 – 1890",
    nationality: "Dutch",
    period: "Post-Impressionism",
    style: "Expressive Post-Impressionism",
    knownFor: "Bold color, dramatic brushwork, and emotional immediacy",
    bio: "One of the most influential figures in Western art, Van Gogh created nearly 2,100 works in just over a decade. His swirling skies and vivid palettes turned ordinary landscapes into deeply personal, electric visions.",
    followers: 1200000,
    likes: 4800000,
    saves: 1500000,
  },
  {
    id: "hokusai",
    name: "Katsushika Hokusai",
    initials: "KH",
    avatar: portrait("Hokusai portrait.jpg"),
    profileType: "historical",
    lifespan: "1760 – 1849",
    nationality: "Japanese",
    period: "Edo Period",
    style: "Ukiyo-e",
    knownFor: "Woodblock prints and the iconic Thirty-six Views of Mount Fuji",
    bio: "A master of the ukiyo-e tradition, Hokusai reshaped Japanese printmaking with dynamic compositions and a restless eye for nature. His work later rippled through European art, inspiring the Impressionists.",
    followers: 760000,
    likes: 2100000,
    saves: 880000,
  },
  {
    id: "da-vinci",
    name: "Leonardo da Vinci",
    initials: "LV",
    avatar: portrait(
      "Leonardo da Vinci - presumed self-portrait - WGA12798.jpg"
    ),
    profileType: "historical",
    lifespan: "1452 – 1519",
    nationality: "Italian",
    period: "High Renaissance",
    style: "Renaissance",
    knownFor: "Sfumato technique, anatomical precision, and timeless portraits",
    bio: "Painter, engineer, anatomist, and inventor, Leonardo embodied the Renaissance ideal. His surviving paintings are few but legendary, defined by subtle gradations of light and an uncanny sense of human presence.",
    followers: 2100000,
    likes: 6400000,
    saves: 1900000,
  },
  {
    id: "klimt",
    name: "Gustav Klimt",
    initials: "GK",
    avatar: portrait("Klimt.jpg"),
    profileType: "historical",
    lifespan: "1862 – 1918",
    nationality: "Austrian",
    period: "Vienna Secession",
    style: "Symbolism / Art Nouveau",
    knownFor: "Gilded surfaces, ornamental pattern, and sensual figures",
    bio: "A founder of the Vienna Secession, Klimt fused fine art with decorative gold leaf and intricate pattern. His 'golden phase' produced some of the most recognizable images in modern art.",
    followers: 540000,
    likes: 1700000,
    saves: 610000,
  },
  {
    id: "botticelli",
    name: "Sandro Botticelli",
    initials: "SB",
    avatar: portrait("Sandro Botticelli 083.jpg"),
    profileType: "historical",
    lifespan: "1445 – 1510",
    nationality: "Italian",
    period: "Early Renaissance",
    style: "Florentine Renaissance",
    knownFor: "Mythological allegory and flowing, linear grace",
    bio: "A leading painter of Renaissance Florence under Medici patronage, Botticelli is known for elegant figures and mythological themes rendered with delicate line and poetic atmosphere.",
    followers: 430000,
    likes: 1100000,
    saves: 390000,
  },
  {
    id: "munch",
    name: "Edvard Munch",
    initials: "EM",
    avatar: portrait("Edvard Munch 1933.jpg"),
    profileType: "historical",
    lifespan: "1863 – 1944",
    nationality: "Norwegian",
    period: "Symbolism / Expressionism",
    style: "Expressionism",
    knownFor: "Psychological intensity and the universal image of anxiety",
    bio: "A pioneer of Expressionism, Munch translated emotion directly onto the canvas. His themes of love, anxiety, and mortality gave modern art a new, deeply human vocabulary.",
    followers: 690000,
    likes: 2400000,
    saves: 820000,
  },
  {
    id: "friedrich",
    name: "Caspar David Friedrich",
    initials: "CF",
    profileType: "historical",
    lifespan: "1774 – 1840",
    nationality: "German",
    period: "Romanticism",
    style: "German Romanticism",
    knownFor: "Sublime landscapes and the lone figure before nature",
    bio: "The defining painter of German Romanticism, Friedrich rendered fog, mountains, and ruins as meditations on the spiritual and the infinite. His solitary figures invite the viewer to contemplate the vastness of nature.",
    followers: 310000,
    likes: 980000,
    saves: 360000,
  },

  // ── Ancient / anonymous attributions ────────────────────────────────
  {
    id: "pythokritos",
    name: "Pythokritos of Rhodes",
    initials: "PR",
    noLookup: true,
    profileType: "historical",
    lifespan: "fl. c. 200 – 150 BC",
    nationality: "Hellenistic Greek",
    period: "Hellenistic Greece",
    style: "Hellenistic Sculpture",
    knownFor: "The Winged Victory of Samothrace",
    bio: "A Rhodian sculptor of the Hellenistic age, often credited with the Winged Victory of Samothrace. His Nike alights on a ship's prow mid-motion, her wind-swept drapery making her one of the supreme achievements of Greek sculpture.",
    followers: 240000,
    likes: 560000,
    saves: 220000,
  },
  {
    id: "egyptian-royal-workshop",
    name: "Royal Workshop of Thebes",
    initials: "RT",
    noLookup: true,
    profileType: "historical",
    lifespan: "fl. c. 1323 BC",
    nationality: "Ancient Egyptian",
    period: "New Kingdom",
    style: "Funerary Goldwork",
    knownFor: "The golden funerary mask of Tutankhamun",
    bio: "The anonymous royal goldsmiths of Egypt's 18th Dynasty created the funerary treasures of the pharaohs. Their masterwork — the death mask of the boy-king Tutankhamun — fuses gold, lapis lazuli, and coloured glass into the most famous image of ancient Egypt.",
    followers: 300000,
    likes: 880000,
    saves: 340000,
  },
  {
    id: "exekias",
    name: "Exekias",
    initials: "EX",
    noLookup: true,
    profileType: "historical",
    lifespan: "fl. c. 545 – 530 BC",
    nationality: "Ancient Greek",
    period: "Archaic Greece",
    style: "Black-figure Pottery",
    knownFor: "The finest black-figure vase painting of Archaic Athens",
    bio: "Potter and painter of Archaic Athens, Exekias raised the black-figure technique to its peak with quiet, monumental compositions — most famously Dionysos sailing across a wine-dark sea.",
    followers: 140000,
    likes: 360000,
    saves: 150000,
  },
  {
    id: "etruscan-workshop",
    name: "Etruscan Bronze Workshop",
    initials: "EB",
    noLookup: true,
    profileType: "historical",
    lifespan: "5th century BC",
    nationality: "Etruscan · Roman",
    period: "Roman Republic",
    style: "Bronze Sculpture",
    knownFor: "The Capitoline Wolf, emblem of Rome",
    bio: "An anonymous workshop in the Etruscan-Roman tradition cast the Capitoline Wolf, the bronze she-wolf who suckles the twins Romulus and Remus. It became — and remains — the enduring emblem of the city of Rome.",
    followers: 130000,
    likes: 320000,
    saves: 120000,
  },

  // ── Sample freelance creators (future posting feature) ──────────────
  {
    id: "aurora-vane",
    name: "Aurora Vane",
    initials: "AV",
    profileType: "freelance",
    lifespan: "Joined 2025",
    nationality: "Independent · Lisbon",
    period: "Contemporary",
    style: "Geometric Abstraction",
    knownFor: "Rhythmic color fields and concentric studies",
    bio: "A contemporary abstract painter exploring color as rhythm. Aurora posts process studies and finished works directly to Narsil, building a following one canvas at a time.",
    followers: 8400,
    likes: 31200,
    saves: 9700,
    accent: "#7c5cff",
  },
  {
    id: "mateo-cruz",
    name: "Mateo Cruz",
    initials: "MC",
    profileType: "freelance",
    lifespan: "Joined 2024",
    nationality: "Independent · Mexico City",
    period: "Contemporary",
    style: "Minimal Suprematism",
    knownFor: "Spare geometric compositions and bold negative space",
    bio: "A self-taught minimalist working in the lineage of early abstraction. Mateo sells limited canvas runs and shares studio notes with his Narsil community.",
    followers: 5100,
    likes: 18900,
    saves: 6200,
    accent: "#2f9e74",
  },
];

/**
 * Portrait strategy (see `ArtistAvatar` + `lib/artistPhoto`):
 *   1. `avatar` — a curated Wikimedia Commons portrait, used as-is when present.
 *      These load instantly with no lookup, so the famous masters never flicker
 *      as initials while a network request runs.
 *   2. name-based Wikipedia resolution — used only for artists WITHOUT a curated
 *      avatar (e.g. the live museum catalog), and falls back to a colored
 *      monogram when no photo is found.
 *
 * `ArtistAvatar` degrades gracefully: if a curated URL ever fails to load it
 * automatically falls back to the name-based resolver, then to initials. So we
 * keep the curated URLs rather than clearing them.
 *
 * To use local portraits instead, drop files in `public/img/artists/<id>.jpg`
 * and set `artist.avatar = "/img/artists/<id>.jpg"`.
 */

export const artistMap: Record<string, Artist> = Object.fromEntries(
  artists.map((a) => [a.id, a])
);

/**
 * Whether to resolve an online portrait for this artist. False for entities with
 * no likeness of a person — freelance (fictional) creators and the
 * `noLookup`-flagged anonymous/ancient makers — so we show a clean monogram
 * instead of their artwork or a same-name stranger.
 */
export function shouldResolvePortrait(artist: Artist): boolean {
  return artist.profileType !== "freelance" && !artist.noLookup;
}
