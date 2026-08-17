import { Skeleton, SkeletonRows } from "@/components/register/skeleton";

/**
 * Two ledgers — automated connectors, then manual sources — and the two import
 * worksheets under them. Stripes sit at the ledger's own row height so nothing
 * jumps when the rows land (C10).
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading data sources…</span>
      <div className="pb-3 pt-3.5">
        <Skeleton className="mb-2 h-2.5 w-56" />
        <Skeleton className="h-6 w-44" />
      </div>
      <Skeleton className="mb-2 h-3 w-48" />
      <SkeletonRows n={6} />
      <Skeleton className="mb-2 mt-6 h-3 w-40" />
      <SkeletonRows n={3} />
      <div className="mt-6 grid gap-5 lg:grid-cols-2" aria-hidden>
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
