import { useEffect, useRef, useState } from "react";

interface UseInViewOptions {
  /** When false, treats the element as immediately visible (e.g. above-the-fold). */
  enabled?: boolean;
  rootMargin?: string;
}

/**
 * Fires once when the element enters (or nears) the viewport.
 * Used to defer image downloads until the user can actually see them.
 */
export function useInView({
  enabled = true,
  rootMargin = "250px",
}: UseInViewOptions = {}) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setInView(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return { ref, inView };
}
