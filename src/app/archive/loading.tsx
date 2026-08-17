import { Skeleton, SkeletonRows } from "@/components/register/skeleton";

/** The closed-records ledger, pre-ink (C10). */
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading the archive…</span>
      <div className="pb-3 pt-3.5">
        <Skeleton className="mb-2 h-2.5 w-72" />
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="mb-4 flex items-center gap-1.5 border-b border-t border-feint py-2" aria-hidden>
        <Skeleton className="h-[21px] w-[86px]" />
        {["w-[104px]", "w-[136px]", "w-[132px]", "w-[122px]"].map((w) => (
          <Skeleton key={w} className={`h-[21px] ${w}`} />
        ))}
      </div>
      <SkeletonRows n={8} />
    </div>
  );
}
