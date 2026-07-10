/**
 * Calm public-domain classical recordings for museum-style background
 * ambience. Sourced from the Internet Archive — compositions and recordings
 * are in the public domain, so they are safe for commercial use.
 */
export const CLASSICAL_TRACKS = [
  {
    id: "bach-air-g-string",
    title: "Bach — Air on the G String",
    url: "https://archive.org/download/Bach-airOnTheGString/LaMusicaClasicaMasRelajanteDelMundo-Bach-AirOnTheGString.mp3",
    attribution: "Bach — Air on the G String (public domain, Internet Archive)",
  },
  {
    id: "bach-goldberg-aria",
    title: "Bach — Goldberg Variations, Aria",
    url: "https://archive.org/download/Bachs_Aria_Goldberg_Variations_BWV_988-2809/Aaron_Dunn_-_Goldberg_Variations_BWV_988_-_Aria.mp3",
    attribution: "Bach — Goldberg Variations Aria (Musopen, public domain)",
  },
  {
    id: "debussy-clair-de-lune",
    title: "Debussy — Clair de Lune",
    url: "https://archive.org/download/01-debussey-clair-de-lune/01%20-%20Debussey%20-%20Clair%20de%20Lune.mp3",
    attribution: "Debussy — Clair de Lune (public domain, Internet Archive)",
  },
  {
    id: "chopin-nocturne-e-flat",
    title: "Chopin — Nocturne in E-flat, Op. 9 No. 2",
    url: "https://archive.org/download/NocturneInE-flat/NocturneInE-flat.mp3",
    attribution: "Chopin — Nocturne in E-flat (public domain, Internet Archive)",
  },
] as const;

/** Public-domain source; shown as attribution in the music prompt/settings. */
export const MUSIC_ATTRIBUTION_URL = "https://archive.org/details/opensource_audio";
export const MUSIC_ATTRIBUTION_LABEL = "Internet Archive (public domain)";
export const MUSIC_VOLUME = 0.2;

export function pickRandomTrack() {
  return CLASSICAL_TRACKS[Math.floor(Math.random() * CLASSICAL_TRACKS.length)];
}
