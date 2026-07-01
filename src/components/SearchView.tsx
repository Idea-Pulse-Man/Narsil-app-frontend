import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { categoryMap, type CategoryId } from "@/data";
import { useCatalog } from "@/data/catalog";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { SearchIcon, CloseIcon, ChevronDownIcon } from "./Icons";
import ArtworkTile from "./ArtworkTile";

interface SearchViewProps {
  initialCategory?: CategoryId | null;
  onOpenArtwork: (artworkId: string) => void;
}

/** Every facet supports multiple selections; an artwork matches ANY value
 * within a facet, and must satisfy every facet that has selections. */
interface Selection {
  categories: CategoryId[];
  periods: string[];
  empires: string[];
  artistIds: string[];
}

const EMPTY_SELECTION: Selection = {
  categories: [],
  periods: [],
  empires: [],
  artistIds: [],
};

export default function SearchView({
  initialCategory,
  onOpenArtwork,
}: SearchViewProps) {
  const { artists, searchArtworks, searchFacets } = useCatalog();
  const [text, setText] = useState("");
  const [sel, setSel] = useState<Selection>(EMPTY_SELECTION);
  // Filters live in a collapsible dropdown so the art results stay visible.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // When arriving from a Discover category card, pre-select that category.
  useEffect(() => {
    if (initialCategory) {
      setSel({ ...EMPTY_SELECTION, categories: [initialCategory] });
    }
  }, [initialCategory]);

  const results = useMemo(
    () =>
      searchArtworks({
        text,
        categories: sel.categories.length ? sel.categories : undefined,
        periods: sel.periods.length ? sel.periods : undefined,
        empires: sel.empires.length ? sel.empires : undefined,
        artistIds: sel.artistIds.length ? sel.artistIds : undefined,
      }),
    [text, sel, searchArtworks]
  );

  // Toggle any value in/out of its facet (keeps the panel open for multi-pick).
  const toggle = (kind: keyof Selection, value: string) => {
    setSel((prev) => {
      const list = prev[kind] as string[];
      const next = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value];
      return { ...prev, [kind]: next };
    });
  };

  const totalSelected =
    sel.categories.length +
    sel.periods.length +
    sel.empires.length +
    sel.artistIds.length;
  const hasFilters = totalSelected > 0;

  const clearAll = () => setSel(EMPTY_SELECTION);

  // Human-readable summary shown on the collapsed filter button.
  const summary = (() => {
    const parts: string[] = [];
    const add = (list: string[], one: string, many: string) => {
      if (list.length === 1) parts.push(one);
      else if (list.length > 1) parts.push(`${list.length} ${many}`);
    };
    add(
      sel.categories,
      sel.categories[0] ? categoryMap[sel.categories[0]].label : "",
      "categories"
    );
    add(sel.periods, sel.periods[0] ?? "", "periods");
    add(sel.empires, sel.empires[0] ?? "", "empires");
    add(
      sel.artistIds,
      artists.find((a) => a.id === sel.artistIds[0])?.name ?? "",
      "artists"
    );
    return parts.length ? parts.join(" · ") : "All categories";
  })();

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Search
        </p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
          Find a masterpiece
        </h1>

        {/* Search box */}
        <div className="mt-5 flex items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.04] px-4 py-3">
          <SearchIcon className="h-[18px] w-[18px] shrink-0 text-white/45" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search artworks, artists, periods…"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
          />
          {text && (
            <button
              onClick={() => setText("")}
              aria-label="Clear search"
              className="text-white/40 hover:text-white"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Collapsible filter dropdown — keeps the art results visible up top */}
        <div className="mt-4">
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            className={`flex w-full items-center justify-between rounded-full border px-4 py-3 text-sm transition-colors ${
              hasFilters || filtersOpen
                ? "border-white/25 bg-white/[0.08] text-white"
                : "border-white/12 bg-white/[0.04] text-white/80 hover:text-white"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-white/45">Filter</span>
              <span className="truncate font-medium">{summary}</span>
            </span>
            <motion.span
              animate={{ rotate: filtersOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="ml-2 shrink-0 text-white/55"
            >
              <ChevronDownIcon className="h-4 w-4" />
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {filtersOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 pb-4">
                  <FacetRow title="Category">
                    {searchFacets.categories.map((id) => (
                      <Chip
                        key={id}
                        active={sel.categories.includes(id)}
                        onClick={() => toggle("categories", id)}
                      >
                        {categoryMap[id].label}
                      </Chip>
                    ))}
                  </FacetRow>

                  <FacetRow title="Period">
                    {searchFacets.periods.map((p) => (
                      <Chip
                        key={p}
                        active={sel.periods.includes(p)}
                        onClick={() => toggle("periods", p)}
                      >
                        {p}
                      </Chip>
                    ))}
                  </FacetRow>

                  <FacetRow title="Empire">
                    {searchFacets.empires.map((e) => (
                      <Chip
                        key={e}
                        active={sel.empires.includes(e)}
                        onClick={() => toggle("empires", e)}
                      >
                        {e}
                      </Chip>
                    ))}
                  </FacetRow>

                  <FacetRow title="Artist">
                    {artists.map((a) => (
                      <Chip
                        key={a.id}
                        active={sel.artistIds.includes(a.id)}
                        onClick={() => toggle("artistIds", a.id)}
                      >
                        {a.name}
                      </Chip>
                    ))}
                  </FacetRow>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Results */}
        <div className="mt-7 flex items-baseline justify-between">
          <h2 className="font-serif text-lg text-white">
            {results.length} {results.length === 1 ? "result" : "results"}
          </h2>
          {hasFilters && (
            <button
              onClick={clearAll}
              className="text-xs text-white/45 hover:text-white"
            >
              Clear filters
            </button>
          )}
        </div>

        {results.length === 0 ? (
          <p className="mt-8 text-center text-sm text-white/45">
            No artworks match your search. Try a different term or filter.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {results.map((art, i) => (
              <ArtworkTile
                key={art.id}
                artwork={art}
                index={i}
                onOpen={onOpenArtwork}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FacetRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-white text-ink"
          : "border border-white/15 bg-white/5 text-white/70 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
