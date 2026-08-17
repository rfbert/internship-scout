import { Skeleton, SkeletonRows } from "@/components/register/skeleton";

/**
 * The diary's own shape while it loads: page head, the six-cell figure strip,
 * the tape's 72px well, then agenda rows at the real 34px height, so nothing
 * resizes when the data lands (C10). `role="status"` announces the load rather
 * than handing a screen reader a silent tree of boxes; the pulse is zeroed by
 * the global `prefers-reduced-motion` block (D2).
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading the calendar…</span>

      <div className="pb-3 pt-3.5">
        <Skeleton className="mb-2 h-2.5 w-72" />
        <Skeleton className="h-6 w-64" />
      </div>

      <div className="mb-4 flex rounded border border-rule bg-surface" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex-1 border-l border-feint px-3.5 py-2.5 first:border-l-0">
            <Skeleton className="mb-1.5 h-4 w-8" />
            <Skeleton className="h-2 w-20" />
          </div>
        ))}
      </div>

      <Skeleton className="mb-6 h-[var(--tape-h)] w-full" />

      <div className="h-[28px] border-b border-t border-feint bg-surface-2" aria-hidden />
      <SkeletonRows n={6} />
    </div>
  );
}
