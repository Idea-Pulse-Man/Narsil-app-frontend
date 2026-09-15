import { describe, expect, it } from "vitest";
import type { Artwork, Artist } from "@/data";
import {
  badgeId,
  buildTopicQuiz,
  canPlayTopicQuiz,
  earnsBadge,
  filterTopicTargets,
  groupBadgesByTopic,
  listBadgeCatalog,
  accessTopicQuiz,
  isTopicQuizPrepared,
  priorDifficulty,
  QUIZ_DIFFICULTIES,
} from "./topic";
import { applyTopicResult, mergeBadges, type BadgeMap } from "./badges";
import {
  applyTopicScore,
  mergeScores,
  starsFromScore,
  type ScoreMap,
} from "./scores";
import { mulberry32 } from "./random";

function art(
  partial: Partial<Artwork> & Pick<Artwork, "id" | "title" | "artistId">,
): Artwork {
  return {
    year: "1500",
    period: "Renaissance",
    medium: "Oil on canvas",
    source: "Test",
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
  leo: artist("leo", "Leonardo da Vinci"),
  mic: artist("mic", "Michelangelo"),
  rap: artist("rap", "Raphael"),
  tit: artist("tit", "Titian"),
  car: artist("car", "Caravaggio"),
  rem: artist("rem", "Rembrandt"),
  ver: artist("ver", "Vermeer"),
  vg: artist("vg", "Vincent van Gogh"),
  hok: artist("hok", "Hokusai"),
  unk: artist("unk", "Unknown Maker"),
};

const renaissanceWorks: Artwork[] = [
  art({
    id: "mona",
    title: "Mona Lisa",
    artistId: "leo",
    year: "1503",
    period: "High Renaissance",
    medium: "Oil on poplar",
    source: "Louvre",
  }),
  art({
    id: "supper",
    title: "The Last Supper",
    artistId: "leo",
    year: "1498",
    period: "High Renaissance",
    medium: "Tempera on plaster",
    source: "Santa Maria delle Grazie",
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
  }),
  art({
    id: "school",
    title: "The School of Athens",
    artistId: "rap",
    year: "1511",
    period: "High Renaissance",
    medium: "Fresco",
    source: "Vatican",
  }),
  art({
    id: "venus",
    title: "Venus of Urbino",
    artistId: "tit",
    year: "1538",
    period: "Venetian Renaissance",
    medium: "Oil on canvas",
    source: "Uffizi",
  }),
  art({
    id: "sistine",
    title: "The Creation of Adam",
    artistId: "mic",
    year: "1512",
    period: "High Renaissance",
    medium: "Fresco",
    source: "Vatican",
  }),
  art({
    id: "lady",
    title: "Lady with an Ermine",
    artistId: "leo",
    year: "1490",
    period: "High Renaissance",
    medium: "Oil on panel",
    source: "Czartoryski",
  }),
  art({
    id: "bacchus",
    title: "Bacchus and Ariadne",
    artistId: "tit",
    year: "1523",
    period: "Venetian Renaissance",
    medium: "Oil on canvas",
    source: "National Gallery",
  }),
  art({
    id: "fornarina",
    title: "La Fornarina",
    artistId: "rap",
    year: "1520",
    period: "High Renaissance",
    medium: "Oil on panel",
    source: "Galleria Barberini",
  }),
  art({
    id: "giorgio",
    title: "Portrait of a Man",
    artistId: "rap",
    year: "1515",
    period: "High Renaissance",
    medium: "Oil on canvas",
    source: "Louvre",
  }),
];

const romanWorks: Artwork[] = [
  art({
    id: "wolf",
    title: "Capitoline Wolf",
    artistId: "unk",
    year: "500 BC",
    period: "Etruscan",
    medium: "Bronze",
    category: "sculptures",
    empire: "Roman",
    tags: ["animal"],
    source: "Capitoline",
  }),
  art({
    id: "augustus",
    title: "Augustus of Prima Porta",
    artistId: "unk",
    year: "20 BC",
    period: "Augustan",
    medium: "Marble",
    category: "sculptures",
    empire: "Roman",
    source: "Vatican",
  }),
  art({
    id: "colosseum",
    title: "The Colosseum",
    artistId: "unk",
    year: "80",
    period: "Imperial Roman",
    medium: "Stone",
    empire: "Roman",
    tags: ["cityscape"],
    source: "Rome",
  }),
  art({
    id: "trajan",
    title: "Trajan's Column",
    artistId: "unk",
    year: "113",
    period: "Imperial Roman",
    medium: "Marble",
    category: "sculptures",
    empire: "Roman",
    source: "Rome",
  }),
  art({
    id: "mosaic",
    title: "Alexander Mosaic",
    artistId: "unk",
    year: "100 BC",
    period: "Hellenistic",
    medium: "Mosaic",
    empire: "Roman",
    tags: ["battle"],
    source: "Naples",
  }),
];

const greekWorks: Artwork[] = [
  art({
    id: "nike",
    title: "Winged Victory",
    artistId: "unk",
    year: "190 BC",
    period: "Hellenistic",
    medium: "Marble",
    category: "sculptures",
    empire: "Greek",
    source: "Louvre",
  }),
  art({
    id: "amphora",
    title: "Exekias Amphora",
    artistId: "unk",
    year: "540 BC",
    period: "Archaic",
    medium: "Terracotta",
    category: "pottery",
    empire: "Greek",
    source: "Vatican",
  }),
  art({
    id: "discus",
    title: "Discobolus",
    artistId: "unk",
    year: "450 BC",
    period: "Classical",
    medium: "Marble",
    category: "sculptures",
    empire: "Greek",
    source: "Rome",
  }),
];

const laterWorks: Artwork[] = [
  art({
    id: "nightwatch",
    title: "The Night Watch",
    artistId: "rem",
    year: "1642",
    period: "Dutch Golden Age",
    medium: "Oil on canvas",
    source: "Rijksmuseum",
  }),
  art({
    id: "delft",
    title: "View of Delft",
    artistId: "ver",
    year: "1661",
    period: "Dutch Golden Age",
    medium: "Oil on canvas",
    tags: ["cityscape"],
    source: "Mauritshuis",
  }),
  art({
    id: "starry",
    title: "Starry Night",
    artistId: "vg",
    year: "1889",
    period: "Post-Impressionism",
    medium: "Oil on canvas",
    tags: ["landscape", "night"],
    source: "MoMA",
  }),
  art({
    id: "wave",
    title: "The Great Wave",
    artistId: "hok",
    year: "1831",
    period: "Edo Period",
    medium: "Woodblock print",
    tags: ["seascape"],
    empire: "Japanese",
    source: "British Museum",
  }),
  art({
    id: "calling",
    title: "The Calling of Saint Matthew",
    artistId: "car",
    year: "1600",
    period: "Baroque",
    medium: "Oil on canvas",
    source: "San Luigi",
  }),
];

const pool: Artwork[] = [
  ...renaissanceWorks,
  ...romanWorks,
  ...greekWorks,
  ...laterWorks,
];

describe("topic quizzes", () => {
  it("filters age targets to that era's works", () => {
    const targets = filterTopicTargets(pool, {
      kind: "age",
      id: "renaissance",
      title: "Renaissance",
    });
    expect(targets.length).toBeGreaterThanOrEqual(renaissanceWorks.length);
    expect(targets.every((a) => !a.empire || a.empire !== "Roman")).toBe(true);
    expect(targets.some((a) => a.id === "starry")).toBe(false);
  });

  it("filters empire targets to that empire only", () => {
    const targets = filterTopicTargets(pool, {
      kind: "empire",
      id: "Roman",
      title: "Roman",
    });
    expect(targets.every((a) => a.empire === "Roman")).toBe(true);
    expect(targets.length).toBe(romanWorks.length);
  });

  it("does not offer a Medieval & Byzantine trial", () => {
    const topic = {
      kind: "age" as const,
      id: "medieval",
      title: "Medieval & Byzantine",
    };
    expect(isTopicQuizPrepared(topic)).toBe(false);
    expect(
      accessTopicQuiz(topic, "apprentice", new Set(), true, true).status,
    ).toBe("insufficient");
  });

  it("builds more questions for higher difficulties", () => {
    const targets = filterTopicTargets(pool, {
      kind: "age",
      id: "renaissance",
      title: "Renaissance",
    });
    const easy = buildTopicQuiz(
      targets,
      pool,
      "apprentice",
      mulberry32(1),
      artists,
      "age",
    );
    const hard = buildTopicQuiz(
      targets,
      pool,
      "master",
      mulberry32(1),
      artists,
      "age",
    );
    expect(easy.length).toBeGreaterThanOrEqual(3);
    expect(hard.length).toBeGreaterThan(easy.length);
    expect(hard.length).toBeLessThanOrEqual(10);
  });

  it("never asks origin on an empire quiz", () => {
    const targets = filterTopicTargets(pool, {
      kind: "empire",
      id: "Roman",
      title: "Roman",
    });
    const quiz = buildTopicQuiz(
      targets,
      pool,
      "apprentice",
      mulberry32(7),
      artists,
      "empire",
    );
    expect(quiz.every((q) => q.mode !== "where")).toBe(true);
    expect(quiz.every((q) => q.artwork.empire === "Roman")).toBe(true);
  });

  it("only uses topic works as the pictured target", () => {
    const targets = filterTopicTargets(pool, {
      kind: "age",
      id: "renaissance",
      title: "Renaissance",
    });
    const ids = new Set(targets.map((a) => a.id));
    const quiz = buildTopicQuiz(
      targets,
      pool,
      "scholar",
      mulberry32(3),
      artists,
      "age",
    );
    expect(quiz.length).toBeGreaterThan(0);
    expect(quiz.every((q) => ids.has(q.artworkId))).toBe(true);
  });

  it("enables a trial when the pool can support it", () => {
    const targets = filterTopicTargets(pool, {
      kind: "age",
      id: "renaissance",
      title: "Renaissance",
    });
    expect(canPlayTopicQuiz(targets, pool, "apprentice", artists, "age")).toBe(
      true,
    );
  });

  it("fills a thin era by reusing one work across modes", () => {
    const lone = art({
      id: "lone-egypt",
      title: "Funerary Mask",
      artistId: "leo",
      year: "1323 BC",
      period: "New Kingdom",
      medium: "Gold",
      source: "Cairo",
      empire: "Egyptian",
      tags: ["portrait"],
    });
    const thinPool = [...pool, lone];
    const quiz = buildTopicQuiz(
      [lone],
      thinPool,
      "apprentice",
      mulberry32(11),
      artists,
      "age",
    );
    expect(quiz.length).toBeGreaterThanOrEqual(3);
    expect(canPlayTopicQuiz([lone], thinPool, "apprentice", artists, "age")).toBe(
      true,
    );
  });
});

describe("badge unlocks", () => {
  const topic = { kind: "age" as const, id: "renaissance", title: "Renaissance" };

  it("grants a badge only on 100%", () => {
    expect(earnsBadge(5, 5)).toBe(true);
    expect(earnsBadge(4, 5)).toBe(false);
    expect(earnsBadge(0, 0)).toBe(false);

    const miss = applyTopicResult({}, topic, "apprentice", 4, 5);
    expect(miss.unlocked).toBe(false);
    expect(miss.map[miss.badgeId]).toBeUndefined();

    const perfect = applyTopicResult({}, topic, "apprentice", 5, 5);
    expect(perfect.unlocked).toBe(true);
    expect(perfect.map[perfect.badgeId]).toBeDefined();
  });

  it("gives a distinct higher-level badge for a harder trial", () => {
    const apprentice = badgeId(topic, "apprentice");
    const master = badgeId(topic, "master");
    expect(apprentice).not.toBe(master);

    let map: BadgeMap = {};
    map = applyTopicResult(map, topic, "apprentice", 5, 5).map;
    map = applyTopicResult(map, topic, "master", 10, 10).map;
    expect(map[apprentice]).toBeDefined();
    expect(map[master]).toBeDefined();
    expect(QUIZ_DIFFICULTIES.map((d) => d.rank)).toEqual([1, 2, 3]);
  });

  it("does not restamp an already-earned seal", () => {
    const first = applyTopicResult({}, topic, "scholar", 7, 7);
    const again = applyTopicResult(first.map, topic, "scholar", 7, 7);
    expect(first.unlocked).toBe(true);
    expect(again.unlocked).toBe(false);
    expect(again.map[first.badgeId]?.unlockedAt).toBe(
      first.map[first.badgeId]?.unlockedAt,
    );
  });

  it("merges remote and local seals by union", () => {
    const merged = mergeBadges(
      { "age:renaissance:apprentice": { id: "age:renaissance:apprentice", unlockedAt: "2026-01-01" } },
      { "age:renaissance:master": { id: "age:renaissance:master", unlockedAt: "2026-02-01" } },
    );
    expect(Object.keys(merged).sort()).toEqual([
      "age:renaissance:apprentice",
      "age:renaissance:master",
    ]);
  });

  it("lists every age and empire seal so the profile can gray them out", () => {
    const catalog = listBadgeCatalog(["Roman"]);
    const groups = groupBadgesByTopic(catalog);
    const renaissance = groups.find((g) => g.topic.id === "renaissance");
    const roman = groups.find((g) => g.topic.id === "Roman");
    expect(renaissance?.badges).toHaveLength(3);
    expect(roman?.badges).toHaveLength(3);
    expect(catalog.some((b) => b.difficulty === "apprentice")).toBe(true);
    expect(catalog.some((b) => b.difficulty === "master")).toBe(true);
    expect(catalog.some((b) => b.topicId === "medieval")).toBe(false);
  });
});

describe("topic quiz access", () => {
  const egypt = {
    kind: "age" as const,
    id: "ancient-egypt",
    title: "Ancient Egypt",
  };
  const renaissance = {
    kind: "age" as const,
    id: "renaissance",
    title: "Renaissance",
  };

  it("free plan only enables Ancient Egypt Apprentice at first", () => {
    const unlocked = new Set<string>();
    expect(
      accessTopicQuiz(egypt, "apprentice", unlocked, false, true).status,
    ).toBe("playable");
    expect(
      accessTopicQuiz(egypt, "scholar", unlocked, false, true).status,
    ).toBe("need_prior");
    expect(
      accessTopicQuiz(egypt, "master", unlocked, false, true).status,
    ).toBe("need_prior");
    expect(
      accessTopicQuiz(renaissance, "apprentice", unlocked, false, true).status,
    ).toBe("need_pro");
  });

  it("unlocks Scholar after Apprentice seal, then Master", () => {
    const unlocked = new Set([badgeId(egypt, "apprentice")]);
    expect(
      accessTopicQuiz(egypt, "scholar", unlocked, false, true).status,
    ).toBe("playable");
    expect(
      accessTopicQuiz(egypt, "master", unlocked, false, true).status,
    ).toBe("need_prior");

    unlocked.add(badgeId(egypt, "scholar"));
    expect(
      accessTopicQuiz(egypt, "master", unlocked, false, true).status,
    ).toBe("playable");
  });

  it("Pro unlocks other topics but still needs prior seals", () => {
    const unlocked = new Set<string>();
    expect(
      accessTopicQuiz(renaissance, "apprentice", unlocked, true, true).status,
    ).toBe("playable");
    expect(
      accessTopicQuiz(renaissance, "scholar", unlocked, true, true),
    ).toEqual({ status: "need_prior", prior: "apprentice" });
    expect(priorDifficulty("master")).toBe("scholar");
  });

  it("sends free users to Pro for other topics even if the pool is thin", () => {
    const unlocked = new Set<string>();
    expect(
      accessTopicQuiz(renaissance, "apprentice", unlocked, false, false).status,
    ).toBe("need_pro");
  });
});

describe("quiz stars", () => {
  const topic = {
    kind: "age" as const,
    id: "ancient-egypt",
    title: "Ancient Egypt",
  };

  it("maps score onto 0–5 stars", () => {
    expect(starsFromScore(0, 5)).toBe(0);
    expect(starsFromScore(4, 5)).toBe(4);
    expect(starsFromScore(5, 5)).toBe(5);
    expect(starsFromScore(7, 10)).toBe(4);
    expect(starsFromScore(0, 0)).toBe(0);
  });

  it("keeps the best star rating across replays", () => {
    let map: ScoreMap = {};
    map = applyTopicScore(map, topic, "apprentice", 3, 5).map;
    expect(map[badgeId(topic, "apprentice")]?.stars).toBe(3);

    const worse = applyTopicScore(map, topic, "apprentice", 1, 5);
    expect(worse.improved).toBe(false);
    expect(worse.map[badgeId(topic, "apprentice")]?.stars).toBe(3);

    const better = applyTopicScore(map, topic, "apprentice", 5, 5);
    expect(better.improved).toBe(true);
    expect(better.bestStars).toBe(5);
  });

  it("merges remote and local by higher stars", () => {
    const merged = mergeScores(
      {
        "age:ancient-egypt:apprentice": {
          id: "age:ancient-egypt:apprentice",
          stars: 3,
          score: 3,
          total: 5,
          updatedAt: "2026-01-01",
        },
      },
      {
        "age:ancient-egypt:apprentice": {
          id: "age:ancient-egypt:apprentice",
          stars: 5,
          score: 5,
          total: 5,
          updatedAt: "2026-02-01",
        },
      },
    );
    expect(merged["age:ancient-egypt:apprentice"]?.stars).toBe(5);
  });
});
