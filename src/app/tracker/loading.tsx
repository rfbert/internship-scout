import { Skeleton, SkeletonRows } from "@/components/register/skeleton";

/**
 * The register, waiting. Eleven `rounded-*` skeletons of the transit line and
 * the 100px table become the shapes that actually land: a 64px spine strip of
 * five group frames and a run of 34px ledger rows, so nothing resizes when the
 * data arrives.
 */
export default function Loading() {
  // The real spine's five frames, at their real drawer counts (3·2·5·1·3).
  const FRAMES = [3, 2, 5, 1, 3];

  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading the tracker…</span>

      <div className="pb-3 pt-3.5">
        <Skeleton className="mb-2 h-2.5 w-64" />
        <Skeleton className="h-6 w-56" />
      </div>

      <div className="flex flex-wrap gap-3.5 pb-3.5 pt-1.5" aria-hidden>
        {FRAMES.map((drawers, f) => (
          <div key={f} className="rounded border border-rule bg-surface">
            <div className="border-b border-feint px-2 pb-1 pt-1.5">
              <Skeleton className="h-2 w-24" />
            </div>
            <div className="flex">
              {Array.from({ length: drawers }, (_, i) => (
                <div key={i} className="w-[88px] border-l border-feint px-2 pb-[7px] pt-1.5 first:border-l-0">
                  <Skeleton className="h-3.5 w-4" />
                  <Skeleton className="mt-[5px] h-2 w-14" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <SkeletonRows n={10} />
    </div>
  );
}
