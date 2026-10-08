/**
 * Loading placeholders — grey shapes where content is about to appear, so a
 * screen never sits blank (or reads as "empty") while the network answers.
 * Follows Reduce Motion through the global CSS rule in index.css.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-white/[0.07] ${className}`}
    />
  );
}

/** Stand-in for a grid of artwork tiles (Search, artist works). */
export function SkeletonTileGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
          <Skeleton className="mt-2 h-3 w-3/4" />
          <Skeleton className="mt-1.5 h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Stand-in for a list of cards (orders, inbox threads). */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3"
        >
          <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
          <div className="flex-1 pt-1">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="mt-2 h-2.5 w-1/3" />
            <Skeleton className="mt-2 h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
