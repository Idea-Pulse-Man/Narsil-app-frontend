import type { Artwork } from "./types";

/**
 * Image URLs use Wikimedia Commons' Special:FilePath endpoint, which redirects
 * to a sized thumbnail of the original public-domain file. This keeps the mock
 * data resilient without hard-coding fragile hashed CDN paths.
 *
 * NOTE: the three "freelance" pieces reuse public-domain abstract works as
 * stand-in imagery for the future artist-posting feature. They are clearly
 * flagged `origin: "artist-original"` and attributed to sample freelance
 * artists — swap in real uploads when the Create flow is wired to storage.
 */
const wm = (file: string, width = 1000) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    file
  )}?width=${width}`;

export const artworks: Artwork[] = [
  // ── Historical paintings & prints ───────────────────────────────────
  {
    id: "view-of-delft",
    title: "View of Delft",
    artistId: "vermeer",
    year: "c. 1660 – 1661",
    period: "Baroque",
    medium: "Oil on canvas",
    source: "Mauritshuis, The Hague",
    image: wm("Johannes Vermeer - View of Delft - 92 - Mauritshuis.jpg"),
    accent: "#243140",
    description:
      "Vermeer's only surviving cityscape and the most celebrated view in Dutch art. Morning light breaks over the harbour walls of Delft, glinting on still water while the town waits in serene silence — a study in atmosphere, reflection, and the poetry of an ordinary day.",
    tags: ["Baroque", "Cityscape", "Oil Painting", "Dutch Golden Age"],
    category: "paintings",
    origin: "public-domain",
  },
  {
    id: "starry-night",
    title: "The Starry Night",
    artistId: "van-gogh",
    year: "1889",
    period: "Post-Impressionism",
    medium: "Oil on canvas",
    source: "The Museum of Modern Art",
    image: wm("Van Gogh - Starry Night - Google Art Project.jpg"),
    accent: "#10203f",
    description:
      "Painted from the window of his asylum room at Saint-Rémy, Van Gogh transformed a quiet village under the night sky into a turbulent, swirling cosmos. The rolling sky and flame-like cypress remain icons of emotional landscape painting.",
    tags: ["Post-Impressionism", "Landscape", "Oil Painting", "Night"],
    category: "modern-art",
    origin: "public-domain",
  },
  {
    id: "great-wave",
    title: "The Great Wave off Kanagawa",
    artistId: "hokusai",
    year: "c. 1831",
    period: "Edo Period",
    medium: "Woodblock print",
    source: "The Met Collection",
    image: wm("Tsunami_by_hokusai_19th_century.jpg"),
    accent: "#13384a",
    description:
      "The most famous work of Japanese art in the world, this print shows a towering wave threatening boats off the coast, with Mount Fuji small in the distance. Its dynamic composition and Prussian-blue palette captivated audiences across the globe.",
    tags: ["Ukiyo-e", "Landscape", "Woodblock Print", "Edo Period"],
    category: "japanese-art",
    origin: "public-domain",
    empire: "Japanese",
  },
  {
    id: "last-supper",
    title: "The Last Supper",
    artistId: "da-vinci",
    year: "c. 1495 – 1498",
    period: "Renaissance",
    medium: "Tempera and oil on plaster",
    source: "Santa Maria delle Grazie, Milan",
    image: wm(
      "Leonardo da Vinci (1452-1519) - The Last Supper (1495-1498).jpg"
    ),
    accent: "#2a2418",
    description:
      "Leonardo captures the charged instant after Christ announces that one among the table will betray him. Each figure reacts in a wave of gesture and emotion, while a rigorous one-point perspective draws every line toward his calm, central face — a landmark of Renaissance composition.",
    tags: ["Renaissance", "Fresco", "Religious", "Perspective"],
    category: "paintings",
    origin: "public-domain",
  },
  {
    id: "birch-forest",
    title: "Birch Forest",
    artistId: "klimt",
    year: "1903",
    period: "Art Nouveau",
    medium: "Oil on canvas",
    source: "Paul G. Allen Collection",
    image: wm("Gustav Klimt, Birch Forest, 1903 - Paul G. Allen Collection.jpg"),
    accent: "#3a2f1c",
    description:
      "Klimt dissolves a stand of birch trees into a shimmering tapestry of gold, russet, and green. Slim white trunks rise like columns from a carpet of fallen leaves, turning the forest floor into the same ornamental, near-abstract surface that defined his celebrated golden phase.",
    tags: ["Art Nouveau", "Landscape", "Oil Painting", "Pattern"],
    category: "modern-art",
    origin: "public-domain",
  },
  {
    id: "map-of-hell",
    title: "Map of Hell",
    artistId: "botticelli",
    year: "c. 1485",
    period: "Renaissance",
    medium: "Silverpoint, ink and tempera on parchment",
    source: "Vatican Library",
    image: wm("Sandro Botticelli - La Carte de l'Enfer.jpg"),
    accent: "#2a1a16",
    description:
      "Drawn to illustrate Dante's Inferno, Botticelli charts the funnel of Hell as a vast inverted cone descending through nine circles toward the centre of the earth. Tiny figures crowd each terrace, transforming a cosmological diagram into one of the Renaissance's most haunting visions.",
    tags: ["Renaissance", "Drawing", "Allegory", "Dante"],
    category: "etching-writing-books",
    origin: "public-domain",
  },
  {
    id: "the-scream",
    title: "The Scream",
    artistId: "munch",
    year: "1893",
    period: "Expressionism",
    medium: "Oil, tempera & pastel on cardboard",
    source: "National Gallery of Norway",
    image: wm(
      "Edvard Munch, 1893, The Scream, oil, tempera and pastel on cardboard, 91 x 73 cm, National Gallery of Norway.jpg"
    ),
    accent: "#5a3410",
    description:
      "Against a blood-red sky, a figure clutches its face in a wave of existential dread. Munch described the moment of inspiration as a scream passing through nature — and the image has become the universal symbol of modern anxiety.",
    tags: ["Expressionism", "Symbolism", "Emotion", "Modern"],
    category: "modern-art",
    origin: "public-domain",
  },
  {
    id: "wanderer-fog",
    title: "Wanderer above the Sea of Fog",
    artistId: "friedrich",
    year: "c. 1818",
    period: "Romanticism",
    medium: "Oil on canvas",
    source: "Hamburger Kunsthalle",
    image: wm("Caspar David Friedrich - Wanderer above the sea of fog.jpg"),
    accent: "#2b3138",
    description:
      "A lone figure stands atop a rocky summit, gazing over a sea of mist and distant peaks. The painting has become the defining image of Romanticism — a meditation on the individual confronting the sublime vastness of nature.",
    tags: ["Romanticism", "Landscape", "Oil Painting", "Sublime"],
    category: "paintings",
    origin: "public-domain",
  },

  // ── Ancient sculpture & pottery ─────────────────────────────────────
  {
    id: "winged-victory",
    title: "Winged Victory of Samothrace",
    artistId: "pythokritos",
    year: "c. 190 BC",
    period: "Hellenistic Greece",
    medium: "Parian marble",
    source: "Musée du Louvre, Paris",
    image: wm("Nike of Samothrake Louvre Ma2369 n4.jpg"),
    accent: "#3a352c",
    description:
      "The goddess Nike descends onto the prow of a warship, wings sweeping back and drapery pressed against her by the sea wind. Carved in Parian marble around 190 BC, this Hellenistic masterpiece captures motion and triumph with breathtaking energy — even without its head or arms.",
    tags: ["Hellenistic", "Sculpture", "Marble", "Mythology"],
    category: "sculptures",
    origin: "public-domain",
    empire: "Greek",
  },
  {
    id: "tutankhamun-mask",
    title: "Mask of Tutankhamun",
    artistId: "egyptian-royal-workshop",
    year: "c. 1323 BC",
    period: "New Kingdom",
    medium: "Gold, lapis lazuli & glass",
    source: "Egyptian Museum, Cairo",
    image: wm("CairoEgMuseumTaaMaskMostlyPhotographed.jpg"),
    accent: "#4a3a12",
    description:
      "The golden funerary mask of the boy-king Tutankhamun is the most famous artifact of ancient Egypt. Wrought from over ten kilograms of gold and inlaid with lapis lazuli, carnelian, and coloured glass, it covered the face of the pharaoh's mummy and remains a dazzling emblem of New Kingdom craftsmanship.",
    tags: ["Ancient Egypt", "Sculpture", "Gold", "Funerary"],
    category: "sculptures",
    origin: "public-domain",
    empire: "Egyptian",
  },
  {
    id: "capitoline-wolf",
    title: "Capitoline Wolf",
    artistId: "etruscan-workshop",
    year: "5th c. BC · twins added c. 1471",
    period: "Roman",
    medium: "Bronze",
    source: "Capitoline Museums, Rome",
    image: wm("Capitoline she-wolf Musei Capitolini MC1181.jpg"),
    accent: "#3a2a1c",
    description:
      "The bronze she-wolf suckling the infant twins Romulus and Remus is the enduring emblem of Rome's foundation myth. The wolf is traditionally dated to the Etruscan era, while the suckling twins were added during the Renaissance — a single icon spanning two thousand years of Roman identity.",
    tags: ["Roman", "Sculpture", "Bronze", "Mythology"],
    category: "sculptures",
    origin: "public-domain",
    empire: "Roman",
  },
  {
    id: "exekias-amphora",
    title: "Dionysos Amphora",
    artistId: "exekias",
    year: "c. 540 BC",
    period: "Archaic Greece",
    medium: "Black-figure terracotta",
    source: "Staatliche Antikensammlungen, Munich",
    image: wm(
      "Exekias Dionysos Staatliche Antikensammlungen 2044 n2.jpg"
    ),
    accent: "#3a241a",
    description:
      "A pinnacle of Archaic black-figure pottery by the Athenian master Exekias. The interior shows Dionysos reclining in a ship as vines sprout from the mast and dolphins circle below — a quiet, poetic image rendered with extraordinary precision in clay.",
    tags: ["Archaic Greek", "Pottery", "Black-figure", "Mythology"],
    category: "pottery",
    origin: "public-domain",
    empire: "Greek",
  },

  // ── Sample freelance artist originals (mock imagery) ────────────────
  {
    id: "concentric-hours",
    title: "Concentric Hours",
    artistId: "aurora-vane",
    year: "2025",
    period: "Contemporary",
    medium: "Acrylic on canvas",
    source: "Narsil · Artist Original",
    image: wm(
      "Vassily Kandinsky, 1913 - Color Study, Squares with Concentric Circles.jpg"
    ),
    accent: "#5a4a2a",
    description:
      "A grid of concentric color studies exploring how warm and cool rings vibrate against one another. Part of Aurora's ongoing series on color as a measure of time. Available as a limited canvas run.",
    tags: ["Abstract", "Color Field", "Contemporary", "Geometric"],
    category: "modern-art",
    origin: "artist-original",
  },
  {
    id: "field-composition",
    title: "Field Composition",
    artistId: "aurora-vane",
    year: "2024",
    period: "Contemporary",
    medium: "Oil and acrylic on linen",
    source: "Narsil · Artist Original",
    image: wm("Vassily Kandinsky, 1913 - Composition 6.jpg"),
    accent: "#3c4250",
    description:
      "An energetic abstract field where forms dissolve and recombine across the surface. Aurora builds the composition in translucent layers, letting earlier marks glow through the final image.",
    tags: ["Abstract", "Expressive", "Contemporary", "Layered"],
    category: "modern-art",
    origin: "artist-original",
  },
  {
    id: "suprematist-drift",
    title: "Suprematist Drift",
    artistId: "mateo-cruz",
    year: "2025",
    period: "Contemporary",
    medium: "Acrylic on panel",
    source: "Narsil · Artist Original",
    image: wm("Kazimir Malevich - Suprematism - Google Art Project.jpg"),
    accent: "#3a3530",
    description:
      "Floating geometric forms drift across an open field in Mateo's minimalist study of balance and tension. A meditation on weightlessness, negative space, and the quiet drama of pure shape.",
    tags: ["Minimal", "Suprematism", "Contemporary", "Geometric"],
    category: "modern-art",
    origin: "artist-original",
  },
];

/**
 * Serve imagery locally from `public/img/artworks/<id>.jpg` (downloaded from the
 * Wikimedia sources noted above). Wikimedia's on-demand thumbnailer was slow and
 * unreliable over the network, so the feed now loads instantly from the app's
 * own origin. Swap these for real uploads when the Create flow gets storage.
 */
for (const artwork of artworks) {
  artwork.image = `/img/artworks/${artwork.id}.jpg`;
}

export const artworkMap: Record<string, Artwork> = Object.fromEntries(
  artworks.map((a) => [a.id, a])
);
