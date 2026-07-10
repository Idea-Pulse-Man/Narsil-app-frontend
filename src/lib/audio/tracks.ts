/** Royalty-free classical tracks streamed from Classicals.de (CC). */
export const CLASSICAL_TRACKS = [
  {
    id: "bach-air",
    title: "Bach — Air on the G String",
    url: "https://www.classicals.de/files/audio/Bach%20-%20Air%20on%20the%20G%20String%20-%20BWV%201068%20-%20Arranged%20for%20Woodwinds%20and%20Strings.mp3",
    attribution: "Bach — Air on the G String (classicals.de, CC)",
  },
  {
    id: "brahms-waltz-1",
    title: "Brahms — Waltz No. 01",
    url: "https://www.classicals.de/files/audio/Brahms%20-%20Waltz%20No.%2001%20in%20B%20major,%20Tempo%20giusto.mp3",
    attribution: "Brahms — Waltz No. 01 (classicals.de, CC)",
  },
  {
    id: "chopin-waltz",
    title: "Chopin — Grande Valse Brillante",
    url: "https://www.classicals.de/files/audio/Chopin%20-%20Grande%20Valse%20Brillante,%20Opus%2018.mp3",
    attribution: "Chopin — Grande Valse Brillante (classicals.de, CC)",
  },
] as const;

export const CLASSICALS_ATTRIBUTION_URL = "https://www.classicals.de/";
export const MUSIC_VOLUME = 0.22;

export function pickRandomTrack() {
  return CLASSICAL_TRACKS[Math.floor(Math.random() * CLASSICAL_TRACKS.length)];
}
