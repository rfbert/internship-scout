import { Skeleton, SkeletonRows } from "@/components/register/skeleton";

/**
 * The detail page is a head, a chip line and two ledgers — not a figure strip,
 * so this is `SkeletonRows` under a hand-built head rather than `SkeletonPage`
 * (C10). Stripes are 24px here to match the event stream's micro-rows.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading this run…</span>
      <div className="pb-3 pt-3.5">
        <Skeleton className="mb-2 h-2.5 w-64" />
        <Skeleton className="h-6 w-80" />
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-feint py-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[19px] w-24" />
        ))}
      </div>
      <div className="mt-4">
        <Skeleton className="h-[28px] w-full" />
        <div className="mt-1">
          <SkeletonRows n={10} />
        </div>
      </div>
    </div>
  );
}
