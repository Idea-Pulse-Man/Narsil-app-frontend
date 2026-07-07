import { useEffect, useRef, useState, type RefObject } from "react";

interface Options {
  /** How many more items to reveal each time the sentinel scrolls into view. */
  pageSize?: number;
  /** Change this (e.g. active filters) to reset back to the first page. */
  resetKey?: unknown;
  /** Scroll container to observe against; defaults to the viewport. */
  rootRef?: RefObject<HTMLElement | null>;
}

/**
 * Progressive "infinite scroll" over an in-memory list. Renders a growing
 * window of `items` and hands back a `sentinelRef` to place at the bottom of
 * the grid — when it scrolls near view, the window grows by `pageSize`.
 */
export function useInfiniteScroll<T>(items: T[], options: Options = {}) {
  const { pageSize = 24, resetKey, rootRef } = options;
  const [count, setCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Collapse back to the first page whenever the source query changes.
  useEffect(() => {
    setCount(pageSize);
  }, [resetKey, pageSize]);

  const hasMore = count < items.length;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setCount((c) => Math.min(c + pageSize, items.length));
        }
      },
      // Prefetch ahead of the fold so growth feels seamless while scrolling.
      { root: rootRef?.current ?? null, rootMargin: "800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, pageSize, items.length, rootRef]);

  return { visible: items.slice(0, count), sentinelRef, hasMore };
}
