import { Skeleton, SkeletonRows } from "@/components/register/skeleton";

/**
 * The company dossier's own shape while it loads: page head, the pulled record
 * frame, then the listings ledger at the real 34px row height. `role="status"`
 * with a polite live region so a screen reader is told the page is loading
 * rather than handed a silent tree of empty boxes; the pulse is zeroed by the
 * global `prefers-reduced-motion` block (D2).
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading this company record…</span>
      <div className="pb-3 pt-3.5">
        <Skeleton className="mb-2 h-2.5 w-64" />
        <Skeleton className="h-6 w-56" />
      </div>
      <div
        aria-hidden
        className="mb-3.5 ml-6 mr-3.5 mt-2.5 grid gap-0 rounded border border-rule border-l-carmine bg-surface lg:grid-cols-[1.15fr_2fr]"
      >
        <div className="px-4 pb-3.5 pt-3">
          <Skeleton className="mb-3 h-2.5 w-20" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="mb-2 h-2.5 w-full" />
          ))}
        </div>
        <div className="border-l border-feint px-4 pb-3.5 pt-3 max-lg:border-l-0 max-lg:border-t">
          <Skeleton className="mb-3 h-2.5 w-28" />
          <div className="grid gap-2.5 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
          <Skeleton className="mt-2.5 h-16 w-full" />
        </div>
      </div>
      <SkeletonRows n={6} />
    </div>
  );
}
