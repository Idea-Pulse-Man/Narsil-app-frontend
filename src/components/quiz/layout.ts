/** Tailwind grid class for image / tile option grids (literal so it's kept). */
export function gridCols(columns: number | undefined): string {
  return columns === 4 ? "grid-cols-4" : columns === 3 ? "grid-cols-3" : "grid-cols-2";
}
