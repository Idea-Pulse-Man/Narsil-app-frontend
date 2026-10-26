/**
 * Calm solo-piano recordings for museum-style background ambience, bundled in
 * `public/music/` so playback works offline and contacts no third party.
 *
 * Every recording was released into the public domain (CC0) by its own
 * performer or producer, not merely tagged so by an uploader, and the
 * compositions are centuries out of copyright, so they are safe for
 * commercial use (App Store 5.2.1). Each MP3 is the producer's own encode of
 * a 24-bit studio master. Don't add a track without the same provenance.
 */
export const CLASSICAL_TRACKS = [
  {
    id: "bach-goldberg-aria",
    title: "Bach — Goldberg Variations, Aria",
    url: "/music/bach-goldberg-aria.mp3",
    credit: "Kimiko Ishizaka, The Open Goldberg Variations (CC0)",
  },
  {
    id: "bach-prelude-c-major",
    title: "Bach — Prelude No. 1 in C major, BWV 846",
    url: "/music/bach-prelude-c-major.mp3",
    credit: "Kimiko Ishizaka, The Open Well-Tempered Clavier (CC0)",
  },
  {
    id: "chopin-nocturne-op9-no2",
    title: "Chopin — Nocturne in E-flat, Op. 9 No. 2",
    url: "/music/chopin-nocturne-op9-no2.mp3",
    credit: "Musopen, The Complete Works of Chopin (CC0)",
  },
  {
    id: "chopin-berceuse-op57",
    title: "Chopin — Berceuse in D-flat, Op. 57",
    url: "/music/chopin-berceuse-op57.mp3",
    credit: "Musopen, The Complete Works of Chopin (CC0)",
  },
] as const;

/** Per-source credits shown in Settings. CC0 needs none, but we credit anyway. */
export const MUSIC_CREDITS = [
  {
    label: "Kimiko Ishizaka",
    url: "https://www.opengoldbergvariations.org/",
  },
  {
    label: "Musopen",
    url: "https://musopen.org/",
  },
] as const;

export const MUSIC_VOLUME = 0.2;

export function pickRandomTrack() {
  return CLASSICAL_TRACKS[Math.floor(Math.random() * CLASSICAL_TRACKS.length)];
}
