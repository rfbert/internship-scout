/**
 * Loading skeletons for all thirteen `loading.tsx` files.
 *
 * 34px stripes at 2px radius on `--surface-2` — the same row height the real
 * ledger uses, so the page does not resize when data lands. The pulse is a
 * plain CSS animation, which the global `prefers-reduced-motion` block zeroes
 * (D2); nothing here conveys information by motion.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-surface-2 ${className}`} />;
}

/** `n` ledger rows inside a ledger-shaped frame. */
export function SkeletonRows({ n = 8 }: { n?: number }) {
  return (
    <div className="rounded border border-rule bg-surface" aria-hidden>
      <div className="h-[28px] border-b border-rule" />
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex h-[34px] items-center gap-3 border-b border-feint px-3 last:border-b-0">
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 flex-1" />
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

/**
 * A whole page: head, optional figure strip, then rows. `role="status"` with a
 * polite live region so a screen reader is told the page is loading rather than
 * being handed a silent tree of empty boxes.
 *
 * `label` is REQUIRED, and it is required because it used to be absent: this
 * component announced a bare "Loading…" for five different destinations, so a
 * screen-reader user who clicked Runs and a screen-reader user who clicked
 * Settings heard the same word and could not tell whether the click had
 * landed. Every caller now names its own surface, in the one frame every
 * `loading.tsx` in the app uses: `Loading <what>…`.
 */
export function SkeletonPage({
  label,
  rows = 8,
  figures = 0,
}: {
  /** What is loading, e.g. `the dashboard` — printed as `Loading <label>…`. */
  label: string;
  rows?: number;
  /** Cells in the figure strip. `0` omits the strip. */
  figures?: number;
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading {label}…</span>
      <div className="pb-3 pt-3.5">
        <Skeleton className="mb-2 h-2.5 w-56" />
        <Skeleton className="h-6 w-72" />
      </div>
      {figures > 0 ? (
        <div className="mb-4 flex rounded border border-rule bg-surface" aria-hidden>
          {Array.from({ length: figures }, (_, i) => (
            <div key={i} className="flex-1 border-l border-feint px-3.5 py-2.5 first:border-l-0">
              <Skeleton className="mb-1.5 h-4 w-8" />
              <Skeleton className="h-2 w-20" />
            </div>
          ))}
        </div>
      ) : null}
      <SkeletonRows n={rows} />
    </div>
  );
}
