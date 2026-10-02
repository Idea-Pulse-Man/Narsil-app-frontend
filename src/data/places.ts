/**
 * Holding-institution geography for Search filters.
 *
 * Artwork rows store the museum on `source` (and sometimes as "Museum, City").
 * Country / city are derived here so Place can drill Country → City → Museum
 * without a catalog schema change.
 */
import type { Artwork } from "./types";

export interface ArtworkPlace {
  museum: string;
  city?: string;
  country?: string;
}

interface KnownPlace {
  /** Normalized haystack needles — first match wins. */
  needles: string[];
  museum: string;
  city: string;
  country: string;
}

const KNOWN: KnownPlace[] = [
  {
    needles: ["art institute of chicago"],
    museum: "The Art Institute of Chicago",
    city: "Chicago",
    country: "United States",
  },
  {
    needles: ["cleveland museum of art"],
    museum: "The Cleveland Museum of Art",
    city: "Cleveland",
    country: "United States",
  },
  {
    needles: ["museum of modern art", "moma"],
    museum: "The Museum of Modern Art",
    city: "New York",
    country: "United States",
  },
  {
    needles: ["metropolitan museum", "the met collection", "the met"],
    museum: "The Met",
    city: "New York",
    country: "United States",
  },
  {
    needles: ["library of congress"],
    museum: "The Library of Congress",
    city: "Washington",
    country: "United States",
  },
  {
    needles: ["paul g allen", "paul g. allen"],
    museum: "Paul G. Allen Collection",
    city: "Seattle",
    country: "United States",
  },
  {
    needles: ["rijksmuseum"],
    museum: "The Rijksmuseum",
    city: "Amsterdam",
    country: "Netherlands",
  },
  {
    needles: ["mauritshuis"],
    museum: "Mauritshuis",
    city: "The Hague",
    country: "Netherlands",
  },
  {
    needles: ["wellcome"],
    museum: "Wellcome Collection",
    city: "London",
    country: "United Kingdom",
  },
  {
    needles: ["british library"],
    museum: "The British Library",
    city: "London",
    country: "United Kingdom",
  },
  {
    needles: ["louvre"],
    museum: "Musée du Louvre",
    city: "Paris",
    country: "France",
  },
  {
    needles: ["santa maria delle grazie"],
    museum: "Santa Maria delle Grazie",
    city: "Milan",
    country: "Italy",
  },
  {
    needles: ["capitoline"],
    museum: "Capitoline Museums",
    city: "Rome",
    country: "Italy",
  },
  {
    needles: ["vatican"],
    museum: "Vatican Library",
    city: "Vatican City",
    country: "Vatican City",
  },
  {
    needles: ["hamburger kunsthalle"],
    museum: "Hamburger Kunsthalle",
    city: "Hamburg",
    country: "Germany",
  },
  {
    needles: ["antikensammlungen"],
    museum: "Staatliche Antikensammlungen",
    city: "Munich",
    country: "Germany",
  },
  {
    needles: ["national gallery of norway", "nasjonalmuseet"],
    museum: "National Gallery of Norway",
    city: "Oslo",
    country: "Norway",
  },
  {
    needles: ["egyptian museum"],
    museum: "Egyptian Museum",
    city: "Cairo",
    country: "Egypt",
  },
  {
    needles: ["san vitale"],
    museum: "Basilica of San Vitale",
    city: "Ravenna",
    country: "Italy",
  },
  {
    needles: ["tretyakov"],
    museum: "Tretyakov Gallery",
    city: "Moscow",
    country: "Russia",
  },
  {
    needles: ["trinity college"],
    museum: "Trinity College Library",
    city: "Dublin",
    country: "Ireland",
  },
  {
    needles: ["tapisserie", "bayeux"],
    museum: "Musée de la Tapisserie",
    city: "Bayeux",
    country: "France",
  },
  {
    needles: ["scrovegni"],
    museum: "Scrovegni Chapel",
    city: "Padua",
    country: "Italy",
  },
];

const CITY_COUNTRY: Record<string, string> = {
  amsterdam: "Netherlands",
  cairo: "Egypt",
  chicago: "United States",
  cleveland: "United States",
  hamburg: "Germany",
  london: "United Kingdom",
  milan: "Italy",
  munich: "Germany",
  "new york": "United States",
  oslo: "Norway",
  paris: "France",
  rome: "Italy",
  seattle: "United States",
  "the hague": "Netherlands",
  "vatican city": "Vatican City",
  washington: "United States",
  ravenna: "Italy",
  moscow: "Russia",
  dublin: "Ireland",
  bayeux: "France",
  padua: "Italy",
};

const ID_PREFIX: Record<string, string> = {
  aic: "The Art Institute of Chicago",
  met: "The Met",
  cma: "The Cleveland Museum of Art",
  rijks: "The Rijksmuseum",
  wc: "Wellcome Collection",
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+\(flickr commons\)\s*$/i, "")
    .replace(/[’']/g, "'")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function knownPlace(haystack: string): ArtworkPlace | undefined {
  const n = normalize(haystack);
  if (!n || n.startsWith("narsil")) return undefined;
  return KNOWN.find((entry) =>
    entry.needles.some((needle) => n.includes(needle))
  );
}

function parseTrailingCity(source: string): ArtworkPlace | undefined {
  const parts = source
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return undefined;
  const city = parts[parts.length - 1];
  const museum = parts.slice(0, -1).join(", ");
  if (!museum || !city) return undefined;
  const country = CITY_COUNTRY[normalize(city)];
  return { museum, city, ...(country ? { country } : {}) };
}

function sourceFromId(id: string): string | undefined {
  const prefix = id.split("-")[0];
  return ID_PREFIX[prefix];
}

/** Holding museum + city/country for one artwork. */
export function placeOfArtwork(art: Artwork): ArtworkPlace {
  return placeOfSource(art.source?.trim() || sourceFromId(art.id) || "");
}

/** Holding museum + city/country for a stored `source` value. */
export function placeOfSource(source: string): ArtworkPlace {
  const fromKnown = knownPlace(source) ?? (source ? parseTrailingCity(source) : undefined);
  if (fromKnown) {
    return {
      museum: fromKnown.museum,
      ...(fromKnown.city ? { city: fromKnown.city } : {}),
      ...(fromKnown.country ? { country: fromKnown.country } : {}),
    };
  }
  if (source && !/^narsil/i.test(source)) {
    return { museum: source.replace(/\s+\(Flickr Commons\)\s*$/i, "").trim() };
  }
  return { museum: source || "Unknown" };
}

export interface PlaceCityNode {
  city: string;
  museums: string[];
}

export interface PlaceCountryNode {
  country: string;
  cities: PlaceCityNode[];
}

/**
 * Country → city → museum tree for the current catalog, plus any stored
 * `source` values known from the whole archive (Search's facet list).
 */
export function placeTreeOf(
  artworks: Artwork[],
  extraSources: string[] = [],
): {
  countries: PlaceCountryNode[];
  otherMuseums: string[];
} {
  const byCountry = new Map<string, Map<string, Set<string>>>();
  const other = new Set<string>();

  const places = [
    ...artworks.map(placeOfArtwork),
    ...extraSources.map(placeOfSource),
  ];
  for (const place of places) {
    if (!place.museum || /^narsil/i.test(place.museum) || place.museum === "Unknown") {
      continue;
    }
    if (!place.country || !place.city) {
      other.add(place.museum);
      continue;
    }
    const cities = byCountry.get(place.country) ?? new Map<string, Set<string>>();
    const museums = cities.get(place.city) ?? new Set<string>();
    museums.add(place.museum);
    cities.set(place.city, museums);
    byCountry.set(place.country, cities);
  }

  const countries: PlaceCountryNode[] = Array.from(byCountry.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([country, cities]) => ({
      country,
      cities: Array.from(cities.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([city, museums]) => ({
          city,
          museums: Array.from(museums).sort((a, b) => a.localeCompare(b)),
        })),
    }));

  return {
    countries,
    otherMuseums: Array.from(other).sort((a, b) => a.localeCompare(b)),
  };
}

export function uniquePlaceFacets(artworks: Artwork[]): {
  countries: string[];
  cities: string[];
  museums: string[];
} {
  const countries = new Set<string>();
  const cities = new Set<string>();
  const museums = new Set<string>();
  for (const art of artworks) {
    const place = placeOfArtwork(art);
    if (place.country) countries.add(place.country);
    if (place.city) cities.add(place.city);
    if (place.museum && !/^narsil/i.test(place.museum) && place.museum !== "Unknown") {
      museums.add(place.museum);
    }
  }
  const byName = (a: string, b: string) => a.localeCompare(b);
  return {
    countries: Array.from(countries).sort(byName),
    cities: Array.from(cities).sort(byName),
    museums: Array.from(museums).sort(byName),
  };
}

/**
 * The stored `source` values whose place matches a Search selection (any
 * selected museum, city or country). Lets the server filter the whole
 * archive by `source` instead of only the artworks already loaded.
 */
export function sourcesForPlaces(
  sources: string[],
  sel: { countries: string[]; cities: string[]; museums: string[] },
): string[] {
  return sources.filter((source) => {
    const place = placeOfSource(source);
    if (sel.countries.length && !sel.countries.includes(place.country ?? "")) {
      return false;
    }
    if (sel.cities.length && !sel.cities.includes(place.city ?? "")) return false;
    if (sel.museums.length && !sel.museums.includes(place.museum)) return false;
    return true;
  });
}
