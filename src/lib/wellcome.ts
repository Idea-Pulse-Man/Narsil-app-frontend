/** Wellcome Collection artwork ids are stored as `wc-{workId}`. */
export function wellcomeWorkUrl(artworkId: string): string | null {
  const match = /^wc-(.+)$/i.exec(artworkId);
  if (!match) return null;
  return `https://wellcomecollection.org/works/${match[1]}`;
}

export function isWellcomeCollection(source: string): boolean {
  return source.trim().toLowerCase() === "wellcome collection";
}
