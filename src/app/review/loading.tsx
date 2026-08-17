import { Skeleton, SkeletonRows } from "@/components/register/skeleton";

/**
 * The review docket, pre-ink. Head, the band chip row, then stripes at the
 * queue's own row height so nothing jumps when the records land (C10).
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading the review queue…</span>
      <div className="pb-3 pt-3.5">
        <Skeleton className="mb-2 h-2.5 w-72" />
        <Skeleton className="h-6 w-52" />
      </div>
      <div className="mb-4 flex items-center gap-1.5 border-b border-t border-feint py-2" aria-hidden>
        {["w-[128px]", "w-[96px]", "w-[142px]", "w-[110px]", "w-[118px]"].map((w) => (
          <Skeleton key={w} className={`h-[21px] ${w}`} />
        ))}
      </div>
      <SkeletonRows n={9} />
    </div>
  );
}
