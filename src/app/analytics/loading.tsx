import { Skeleton, SkeletonRows } from "@/components/register/skeleton";

/**
 * The returns page's own shape while it loads: head, the five-cell figure
 * strip, funnel rows at the real 34px height, then the two instrument wells
 * (C10). `role="status"` announces the load; the pulse is zeroed by the global
 * `prefers-reduced-motion` block (D2).
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading analytics…</span>

      <div className="pb-3 pt-3.5">
        <Skeleton className="mb-2 h-2.5 w-64" />
        <Skeleton className="h-6 w-80" />
      </div>

      <div className="mb-4 flex rounded border border-rule bg-surface" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex-1 border-l border-feint px-3.5 py-2.5 first:border-l-0">
            <Skeleton className="mb-1.5 h-4 w-8" />
            <Skeleton className="h-2 w-20" />
          </div>
        ))}
      </div>

      <div className="h-[28px] border-b border-t border-feint bg-surface-2" aria-hidden />
      <SkeletonRows n={6} />

      <div className="mt-6 grid gap-3 lg:grid-cols-2" aria-hidden>
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    </div>
  );
}
