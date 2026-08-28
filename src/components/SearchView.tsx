import { lazy, Suspense, useDeferredValue, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  categories as allCategories,
  categoryMap,
  WORLD,
  placeTreeOf,
  type CategoryGroup,
  type CategoryId,
} from "@/data";
import { useCatalog } from "@/data/catalog";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import {
  SearchIcon,
  CloseIcon,
  ChevronDownIcon,
  ArrowLeftIcon,
} from "./Icons";
import ArtworkTile from "./ArtworkTile";
import { useInfiniteScroll } from "./useInfiniteScroll";
import type { ToastState } from "./Toast";

const CanvasPurchaseSheet = lazy(() => import("./CanvasPurchaseSheet"));

interface SearchViewProps {
  onOpenArtwork: (artworkId: string) => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

/** Every facet supports multiple selections; an artwork matches ANY value
 * within a facet, and must satisfy every facet that has selections. */
type CanvasFilter = "any" | "available" | "unavailable";

interface Selection {
  categories: CategoryId[];
  periods: string[];
  empires: string[];
  artistIds: string[];
  countries: string[];
  cities: string[];
  museums: string[];
  portraitsOnly: boolean;
  canvas: CanvasFilter;
}

const EMPTY_SELECTION: Selection = {
  categories: [],
  periods: [],
  empires: [],
  artistIds: [],
  countries: [],
  cities: [],
  museums: [],
  portraitsOnly: false,
  canvas: "any",
};

const CANVAS_FILTER_LABEL: Record<CanvasFilter, string> = {
  any: "All",
  available: "Canvas",
  unavailable: "No canvas",
};

const GROUP_LABEL: Record<CategoryGroup, string> = {
  medium: "Medium",
  empire: "Empire",
  movement: "Movement",
};

type FilterNode =
  | { kind: "root" }
  | { kind: "subject" }
  | { kind: "collections" }
  | { kind: "collection-group"; group: CategoryGroup }
  | { kind: "period" }
  | { kind: "empire" }
  | { kind: "place" }
  | { kind: "country"; country: string }
  | { kind: "city"; country: string; city: string }
  | { kind: "place-other" }
  | { kind: "artist" }
  | { kind: "artist-letter"; letter: string };

function categoryFilterKey(sel: Selection): string {
  return JSON.stringify({
    categories: sel.categories,
    periods: sel.periods,
    empires: sel.empires,
    artistIds: sel.artistIds,
    countries: sel.countries,
    cities: sel.cities,
    museums: sel.museums,
    portraitsOnly: sel.portraitsOnly,
  });
}

export default function SearchView({
  onOpenArtwork,
  showToast,
}: SearchViewProps) {
  const {
    artists,
    searchArtworks,
    searchFacets,
    artworks,
    getArtwork,
    catalogComplete,
    catalogTotal,
  } = useCatalog();
  const [text, setText] = useState("");
  const deferredText = useDeferredValue(text);
  const [sel, setSel] = useState<Selection>(EMPTY_SELECTION);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [node, setNode] = useState<FilterNode>({ kind: "root" });
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const categoryKey = categoryFilterKey(sel);

  const results = useMemo(() => {
    return searchArtworks({
      text: deferredText,
      categories: sel.categories.length ? sel.categories : undefined,
      periods: sel.periods.length ? sel.periods : undefined,
      empires: sel.empires.length ? sel.empires : undefined,
      artistIds: sel.artistIds.length ? sel.artistIds : undefined,
      countries: sel.countries.length ? sel.countries : undefined,
      cities: sel.cities.length ? sel.cities : undefined,
      museums: sel.museums.length ? sel.museums : undefined,
      portraitsOnly: sel.portraitsOnly || undefined,
      canvas: sel.canvas,
    });
  }, [deferredText, sel, searchArtworks]);

  const { visible, sentinelRef, hasMore } = useInfiniteScroll(results, {
    resetKey: `${deferredText}|${categoryKey}`,
    softResetKey: sel.canvas,
    rootRef: scrollRef,
  });

  const searchableArtists = useMemo(() => {
    const ids = new Set(artworks.map((a) => a.artistId));
    return artists
      .filter((a) => ids.has(a.id))
      .slice()
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [artists, artworks]);

  const artistsByLetter = useMemo(() => {
    const map = new Map<string, typeof searchableArtists>();
    for (const artist of searchableArtists) {
      const letter = (artist.name.trim()[0] ?? "#").toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : "#";
      const list = map.get(key) ?? [];
      list.push(artist);
      map.set(key, list);
    }
    return map;
  }, [searchableArtists]);

  const artistLetters = useMemo(
    () =>
      Array.from(artistsByLetter.keys()).sort((a, b) => {
        if (a === "#") return 1;
        if (b === "#") return -1;
        return a.localeCompare(b);
      }),
    [artistsByLetter],
  );

  const collectionGroups = useMemo(() => {
    const available = new Set(searchFacets.categories);
    const groups: CategoryGroup[] = ["medium", "empire", "movement"];
    return groups
      .map((group) => ({
        group,
        items: allCategories.filter(
          (c) => c.group === group && available.has(c.id),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [searchFacets.categories]);

  const placeTree = useMemo(() => placeTreeOf(artworks), [artworks]);

  const activeArtwork = canvasId ? getArtwork(canvasId) ?? null : null;

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
    sel.artistIds.length +
    sel.countries.length +
    sel.cities.length +
    sel.museums.length +
    (sel.portraitsOnly ? 1 : 0);
  const hasCategoryFilters = totalSelected > 0;
  const hasCanvasFilter = sel.canvas !== "any";
  const hasFilters = hasCategoryFilters || hasCanvasFilter;

  const clearAll = () => setSel(EMPTY_SELECTION);

  const closeFilters = () => {
    setFiltersOpen(false);
    setNode({ kind: "root" });
  };

  const openFilters = () => {
    setNode({ kind: "root" });
    setFiltersOpen(true);
  };

  const goBack = () => {
    switch (node.kind) {
      case "collection-group":
        setNode({ kind: "collections" });
        break;
      case "artist-letter":
        setNode({ kind: "artist" });
        break;
      case "country":
      case "place-other":
        setNode({ kind: "place" });
        break;
      case "city":
        setNode({ kind: "country", country: node.country });
        break;
      case "root":
        break;
      default:
        setNode({ kind: "root" });
    }
  };

  const summary = (() => {
    const parts: string[] = [];
    const add = (list: string[], one: string, many: string) => {
      if (list.length === 1) parts.push(one);
      else if (list.length > 1) parts.push(`${list.length} ${many}`);
    };
    add(
      sel.categories,
      sel.categories[0] ? categoryMap[sel.categories[0]].label : "",
      "categories",
    );
    add(sel.periods, sel.periods[0] ?? "", "periods");
    add(sel.empires, sel.empires[0] ?? "", "empires");
    add(
      sel.artistIds,
      searchableArtists.find((a) => a.id === sel.artistIds[0])?.name ?? "",
      "artists",
    );
    add(sel.countries, sel.countries[0] ?? "", "countries");
    add(sel.cities, sel.cities[0] ?? "", "cities");
    add(sel.museums, sel.museums[0] ?? "", "museums");
    if (sel.portraitsOnly) parts.push("Portraits");
    return parts.length ? parts.join(" · ") : "All categories";
  })();

  const branchTitle = (() => {
    switch (node.kind) {
      case "root":
        return "Choose a filter";
      case "subject":
        return "Subject";
      case "collections":
        return WORLD.collections;
      case "collection-group":
        return GROUP_LABEL[node.group];
      case "period":
        return "Period";
      case "empire":
        return "Empire";
      case "place":
        return "Place";
      case "country":
        return node.country;
      case "city":
        return node.city;
      case "place-other":
        return "Other museums";
      case "artist":
        return "Artist";
      case "artist-letter":
        return node.letter === "#" ? "Other" : `Artists · ${node.letter}`;
    }
  })();

  return (
    <div ref={scrollRef} className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          {WORLD.discover}
        </p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
          Find a masterpiece
        </h1>

        <div className="mt-5 flex items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.04] px-4 py-3">
          <SearchIcon className="h-[18px] w-[18px] shrink-0 text-white/45" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={WORLD.discoverPlaceholder}
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

        <div className="mt-4">
          <button
            onClick={() => (filtersOpen ? closeFilters() : openFilters())}
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

          <div className="mt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
              Canvas prints
            </p>
            <div className="flex gap-2">
              {(["any", "available", "unavailable"] as const).map((value) => {
                const active = sel.canvas === value;
                return (
                  <button
                    key={value}
                    onClick={() =>
                      setSel((prev) => ({ ...prev, canvas: value }))
                    }
                    aria-pressed={active}
                    className={`min-w-0 flex-1 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                      active
                        ? "border-accent/40 bg-accent/20 text-accent"
                        : "border-white/12 bg-white/[0.04] text-white/70 hover:text-white"
                    }`}
                  >
                    {CANVAS_FILTER_LABEL[value]}
                  </button>
                );
              })}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {filtersOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-2 flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                  <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5">
                    {node.kind !== "root" ? (
                      <button
                        onClick={goBack}
                        aria-label="Back"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                      >
                        <ArrowLeftIcon className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="w-8" />
                    )}
                    <p className="min-w-0 flex-1 truncate text-center text-sm font-medium text-white">
                      {branchTitle}
                    </p>
                    <button
                      onClick={closeFilters}
                      className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-ink"
                    >
                      Done
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
                    {node.kind === "root" && (
                      <div className="space-y-1">
                        <BranchRow
                          label="Subject"
                          detail={sel.portraitsOnly ? "Portraits" : "Any"}
                          count={sel.portraitsOnly ? 1 : 0}
                          onClick={() => setNode({ kind: "subject" })}
                        />
                        <BranchRow
                          label={WORLD.collections}
                          detail={`${collectionGroups.reduce((n, g) => n + g.items.length, 0)} groups`}
                          count={sel.categories.length}
                          onClick={() => setNode({ kind: "collections" })}
                        />
                        <BranchRow
                          label="Period"
                          detail={`${searchFacets.periods.length} options`}
                          count={sel.periods.length}
                          onClick={() => setNode({ kind: "period" })}
                        />
                        <BranchRow
                          label="Empire"
                          detail={`${searchFacets.empires.length} options`}
                          count={sel.empires.length}
                          onClick={() => setNode({ kind: "empire" })}
                        />
                        {(placeTree.countries.length > 0 ||
                          placeTree.otherMuseums.length > 0) && (
                          <BranchRow
                            label="Place"
                            detail={
                              placeTree.countries.length
                                ? `${placeTree.countries.length} countries · ${searchFacets.museums.length} museums`
                                : `${searchFacets.museums.length} museums`
                            }
                            count={
                              sel.countries.length +
                              sel.cities.length +
                              sel.museums.length
                            }
                            onClick={() => setNode({ kind: "place" })}
                          />
                        )}
                        <BranchRow
                          label="Artist"
                          detail={`${searchableArtists.length} artists · A–Z`}
                          count={sel.artistIds.length}
                          onClick={() => setNode({ kind: "artist" })}
                        />
                      </div>
                    )}

                    {node.kind === "subject" && (
                      <OptionList>
                        <OptionRow
                          active={sel.portraitsOnly}
                          onClick={() =>
                            setSel((prev) => ({
                              ...prev,
                              portraitsOnly: !prev.portraitsOnly,
                            }))
                          }
                        >
                          Portraits
                        </OptionRow>
                      </OptionList>
                    )}

                    {node.kind === "collections" && (
                      <div className="space-y-1">
                        {collectionGroups.map(({ group, items }) => {
                          const selectedInGroup = items.filter((c) =>
                            sel.categories.includes(c.id),
                          ).length;
                          return (
                            <BranchRow
                              key={group}
                              label={GROUP_LABEL[group]}
                              detail={`${items.length} categories`}
                              count={selectedInGroup}
                              onClick={() =>
                                setNode({
                                  kind: "collection-group",
                                  group,
                                })
                              }
                            />
                          );
                        })}
                      </div>
                    )}

                    {node.kind === "collection-group" && (
                      <OptionList>
                        {allCategories
                          .filter(
                            (c) =>
                              c.group === node.group &&
                              searchFacets.categories.includes(c.id),
                          )
                          .map((c) => (
                            <OptionRow
                              key={c.id}
                              active={sel.categories.includes(c.id)}
                              onClick={() => toggle("categories", c.id)}
                            >
                              {c.label}
                            </OptionRow>
                          ))}
                      </OptionList>
                    )}

                    {node.kind === "period" && (
                      <OptionList>
                        {searchFacets.periods.map((p) => (
                          <OptionRow
                            key={p}
                            active={sel.periods.includes(p)}
                            onClick={() => toggle("periods", p)}
                          >
                            {p}
                          </OptionRow>
                        ))}
                      </OptionList>
                    )}

                    {node.kind === "empire" && (
                      <OptionList>
                        {searchFacets.empires.map((e) => (
                          <OptionRow
                            key={e}
                            active={sel.empires.includes(e)}
                            onClick={() => toggle("empires", e)}
                          >
                            {e}
                          </OptionRow>
                        ))}
                      </OptionList>
                    )}

                    {node.kind === "place" && (
                      <div className="space-y-1">
                        {placeTree.countries.map((country) => {
                          const citySet = new Set(
                            country.cities.map((c) => c.city),
                          );
                          const museumSet = new Set(
                            country.cities.flatMap((c) => c.museums),
                          );
                          const selectedHere =
                            (sel.countries.includes(country.country) ? 1 : 0) +
                            sel.cities.filter((c) => citySet.has(c)).length +
                            sel.museums.filter((m) => museumSet.has(m)).length;
                          return (
                            <BranchRow
                              key={country.country}
                              label={country.country}
                              detail={`${country.cities.length} ${
                                country.cities.length === 1 ? "city" : "cities"
                              }`}
                              count={selectedHere}
                              onClick={() =>
                                setNode({
                                  kind: "country",
                                  country: country.country,
                                })
                              }
                            />
                          );
                        })}
                        {placeTree.otherMuseums.length > 0 && (
                          <BranchRow
                            label="Other museums"
                            detail={`${placeTree.otherMuseums.length} museums`}
                            count={
                              sel.museums.filter((m) =>
                                placeTree.otherMuseums.includes(m),
                              ).length
                            }
                            onClick={() => setNode({ kind: "place-other" })}
                          />
                        )}
                      </div>
                    )}

                    {node.kind === "country" && (
                      <div className="space-y-1">
                        <OptionRow
                          active={sel.countries.includes(node.country)}
                          onClick={() => toggle("countries", node.country)}
                        >
                          All of {node.country}
                        </OptionRow>
                        {(
                          placeTree.countries.find(
                            (c) => c.country === node.country,
                          )?.cities ?? []
                        ).map((city) => {
                          const selectedHere =
                            (sel.cities.includes(city.city) ? 1 : 0) +
                            sel.museums.filter((m) =>
                              city.museums.includes(m),
                            ).length;
                          return (
                            <BranchRow
                              key={city.city}
                              label={city.city}
                              detail={`${city.museums.length} ${
                                city.museums.length === 1
                                  ? "museum"
                                  : "museums"
                              }`}
                              count={selectedHere}
                              onClick={() =>
                                setNode({
                                  kind: "city",
                                  country: node.country,
                                  city: city.city,
                                })
                              }
                            />
                          );
                        })}
                      </div>
                    )}

                    {node.kind === "city" && (
                      <OptionList>
                        <OptionRow
                          active={sel.cities.includes(node.city)}
                          onClick={() => toggle("cities", node.city)}
                        >
                          All of {node.city}
                        </OptionRow>
                        {(
                          placeTree.countries
                            .find((c) => c.country === node.country)
                            ?.cities.find((c) => c.city === node.city)
                            ?.museums ?? []
                        ).map((museum) => (
                          <OptionRow
                            key={museum}
                            active={sel.museums.includes(museum)}
                            onClick={() => toggle("museums", museum)}
                          >
                            {museum}
                          </OptionRow>
                        ))}
                      </OptionList>
                    )}

                    {node.kind === "place-other" && (
                      <OptionList>
                        {placeTree.otherMuseums.map((museum) => (
                          <OptionRow
                            key={museum}
                            active={sel.museums.includes(museum)}
                            onClick={() => toggle("museums", museum)}
                          >
                            {museum}
                          </OptionRow>
                        ))}
                      </OptionList>
                    )}

                    {node.kind === "artist" && (
                      <div className="space-y-1">
                        {artistLetters.map((letter) => {
                          const list = artistsByLetter.get(letter) ?? [];
                          const selectedHere = list.filter((a) =>
                            sel.artistIds.includes(a.id),
                          ).length;
                          return (
                            <BranchRow
                              key={letter}
                              label={letter === "#" ? "#" : letter}
                              detail={`${list.length} artists`}
                              count={selectedHere}
                              onClick={() =>
                                setNode({ kind: "artist-letter", letter })
                              }
                            />
                          );
                        })}
                      </div>
                    )}

                    {node.kind === "artist-letter" && (
                      <OptionList>
                        {(artistsByLetter.get(node.letter) ?? []).map((a) => (
                          <OptionRow
                            key={a.id}
                            active={sel.artistIds.includes(a.id)}
                            onClick={() => toggle("artistIds", a.id)}
                          >
                            {a.name}
                          </OptionRow>
                        ))}
                      </OptionList>
                    )}
                  </div>

                  {hasFilters && (
                    <div className="shrink-0 border-t border-white/10 px-3 py-2">
                      <button
                        onClick={clearAll}
                        className="w-full rounded-full py-2 text-xs text-white/55 hover:bg-white/5 hover:text-white"
                      >
                        Clear all filters
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

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

        {!catalogComplete && (
          <p className="mt-1.5 flex items-center gap-2 text-[11px] text-white/45">
            <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-white/25 border-t-accent" />
            {catalogTotal
              ? `Searching ${artworks.length.toLocaleString()} of ${catalogTotal.toLocaleString()} artworks — still loading the archive…`
              : "Still loading the archive…"}
          </p>
        )}

        {results.length === 0 ? (
          <p className="mt-8 text-center text-sm text-white/45">
            No artworks match your search. Try a different term or filter.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {visible.map((art, i) => (
                <ArtworkTile
                  key={art.id}
                  artwork={art}
                  index={i}
                  onOpen={onOpenArtwork}
                  onOrderCanvas={setCanvasId}
                  animateOnMount={i < 2}
                  deferPaint={i >= 8}
                />
              ))}
            </div>
            {hasMore && (
              <div
                ref={sentinelRef}
                className="mt-6 flex justify-center py-4 text-xs text-white/40"
              >
                Loading more…
              </div>
            )}
          </>
        )}
      </div>

      {canvasId && (
        <Suspense fallback={null}>
          <CanvasPurchaseSheet
            artwork={activeArtwork}
            onClose={() => setCanvasId(null)}
            showToast={showToast}
          />
        </Suspense>
      )}
    </div>
  );
}

function BranchRow({
  label,
  detail,
  count,
  onClick,
}: {
  label: string;
  detail: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/[0.06]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="mt-0.5 block text-[11px] text-white/40">{detail}</span>
      </span>
      {count > 0 && (
        <span className="rounded-full bg-accent/25 px-2 py-0.5 text-[10px] font-semibold text-accent">
          {count}
        </span>
      )}
      <ChevronDownIcon className="h-3.5 w-3.5 -rotate-90 text-white/35" />
    </button>
  );
}

function OptionList({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1">{children}</div>;
}

function OptionRow({
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
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
        active
          ? "bg-accent/20 text-accent"
          : "text-white/80 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          active
            ? "border-accent bg-accent text-ink"
            : "border-white/25 bg-transparent"
        }`}
      >
        {active && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
            <path
              d="M2.5 6.2 4.8 8.5 9.5 3.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
    </button>
  );
}
