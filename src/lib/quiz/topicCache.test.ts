import { describe, expect, it } from "vitest";
import type { Artwork, Artist } from "@/data";
import {
  buildTopicQuiz,
  canPlayTopicQuiz,
  filterTopicTargets,
} from "./topic";
import {
  getCachedTopicQuiz,
  hasCachedTopicQuiz,
  warmTopicQuizCache,
} from "./topicCache";
import { mulberry32 } from "./random";

function art(
  partial: Partial<Artwork> & Pick<Artwork, "id" | "title" | "artistId">,
): Artwork {
  return {
    year: "1500",
    period: "Renaissance",
    medium: "Oil on canvas",
    source: "Test Museum",
    image: `https://example.com/${partial.id}.jpg`,
    accent: "#000",
    description: "",
    tags: ["portrait"],
    category: "paintings",
    origin: "public-domain",
    ...partial,
  };
}

function artist(id: string, name: string): Artist {
  return {
    id,
    name,
    initials: name.slice(0, 2).toUpperCase(),
    profileType: "historical",
    lifespan: "1400 – 1500",
    nationality: "Italian",
    period: "Renaissance",
    style: "Renaissance",
    knownFor: name,
    bio: name,
    followers: 0,
    likes: 0,
    saves: 0,
  };
}

const artists: Record<string, Artist> = {
  // Avoid "workshop" — generic maker names are ineligible for "who".
  egypt: artist("egypt", "Thutmose"),
  leo: artist("leo", "Leonardo da Vinci"),
  vg: artist("vg", "Vincent van Gogh"),
  rem: artist("rem", "Rembrandt"),
  mic: artist("mic", "Michelangelo"),
};

describe("topic quiz cache", () => {
  it("warms Ancient Egypt apprentice from a thin curated pool", () => {
    const pool = [
      art({
        id: "tut",
        title: "Mask of Tutankhamun",
        artistId: "egypt",
        year: "1323 BC",
        period: "New Kingdom",
        medium: "Gold",
        source: "Egyptian Museum, Cairo",
        empire: "Egyptian",
        tags: ["portrait", "funerary"],
        category: "sculptures",
      }),
      art({
        id: "starry",
        title: "Starry Night",
        artistId: "vg",
        year: "1889",
        period: "Post-Impressionism",
        source: "MoMA",
        tags: ["landscape"],
      }),
      art({
        id: "nightwatch",
        title: "The Night Watch",
        artistId: "rem",
        year: "1642",
        period: "Baroque",
        source: "Rijksmuseum",
        tags: ["group"],
      }),
      art({
        id: "mona",
        title: "Mona Lisa",
        artistId: "leo",
        year: "1503",
        period: "High Renaissance",
        source: "Louvre",
        tags: ["portrait"],
      }),
      art({
        id: "david",
        title: "David",
        artistId: "mic",
        year: "1504",
        period: "High Renaissance",
        medium: "Marble",
        category: "sculptures",
        source: "Accademia",
        tags: ["sculpture"],
      }),
    ];

    const topic = {
      kind: "age" as const,
      id: "ancient-egypt",
      title: "Ancient Egypt",
    };
    const targets = filterTopicTargets(pool, topic);
    expect(targets.map((t) => t.id)).toEqual(["tut"]);
    const built = buildTopicQuiz(
      targets,
      pool,
      "apprentice",
      mulberry32(1),
      artists,
      "age",
    );
    expect(built.length).toBeGreaterThanOrEqual(3);
    expect(canPlayTopicQuiz(targets, pool, "apprentice", artists, "age")).toBe(
      true,
    );

    warmTopicQuizCache(pool, artists);
    expect(hasCachedTopicQuiz(topic, "apprentice")).toBe(true);
    expect(getCachedTopicQuiz(topic, "apprentice")?.length).toBeGreaterThanOrEqual(
      3,
    );
  });
});
