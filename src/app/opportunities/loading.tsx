import { Skeleton, SkeletonRows } from "@/components/register/skeleton";

/**
 * The acquisitions ledger, pre-ink. Head, one chip line, then 34px stripes at
 * the ledger's own row height so nothing jumps when the data lands (C10).
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading new opportunities…</span>
      <div className="pb-3 pt-3.5">
        <Skeleton className="mb-2 h-2.5 w-64" />
        <Skeleton className="h-6 w-60" />
      </div>
      <div className="mb-4 flex items-center gap-1.5 border-b border-t border-feint py-2" aria-hidden>
        <Skeleton className="h-[21px] w-[86px]" />
        {["w-[132px]", "w-[104px]", "w-[148px]", "w-[96px]", "w-[118px]"].map((w) => (
          <Skeleton key={w} className={`h-[21px] ${w}`} />
        ))}
      </div>
      <SkeletonRows n={9} />
    </div>
  );
}
