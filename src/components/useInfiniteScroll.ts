import { useEffect, useState, type RefObject } from "react";

interface Options {
  /** How many more items to reveal each time the sentinel scrolls into view. */
  pageSize?: number;
  /** Change this (e.g. active filters) to reset back to the first page. */
  resetKey?: unknown;
  /** Changes that should swap results without collapsing the visible window. */
  softResetKey?: unknown;
  /** Scroll container to observe against; defaults to the viewport. */
  rootRef?: RefObject<HTMLElement | null>;
  /** When false, stops prefetching more rows (e.g. tab hidden but keep-alive). */
  enabled?: boolean;
}

/**
 * Progressive "infinite scroll" over an in-memory list. Renders a growing
 * window of `items` and hands back a `sentinelRef` to place at the bottom of
 * the grid — when it scrolls near view, the window grows by `pageSize`.
 *
 * `sentinelRef` is a callback ref on purpose: grids inside AnimatePresence
 * mount only after the previous panel's exit animation, so a plain RefObject
 * would still be null when the observer effect runs and the observer would
 * never attach. The callback re-renders when the node appears, re-running the
 * effect with the real element.
 */
export function useInfiniteScroll<T>(items: T[], options: Options = {}) {
  const { pageSize = 24, resetKey, softResetKey, rootRef, enabled = true } =
    options;
  const [count, setCount] = useState(pageSize);
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);

  // Collapse back to the first page whenever the source query changes.
  useEffect(() => {
    setCount(pageSize);
  }, [resetKey, pageSize]);

  // Canvas tab switches keep the current window size so tiles don't remount.
  useEffect(() => {
    setCount((current) => Math.min(Math.max(current, pageSize), items.length));
  }, [softResetKey, items.length, pageSize]);

  const hasMore = count < items.length;

  useEffect(() => {
    if (!enabled || !hasMore || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setCount((c) => Math.min(c + pageSize, items.length));
        }
      },
      // Prefetch ahead of the fold so growth feels seamless while scrolling.
      { root: rootRef?.current ?? null, rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, hasMore, pageSize, items.length, rootRef, sentinel]);

  return { visible: items.slice(0, count), sentinelRef: setSentinel, hasMore };
}
