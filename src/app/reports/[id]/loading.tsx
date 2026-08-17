import { Skeleton } from "@/components/register/skeleton";

/**
 * The detail page is a head, a dot-leader record, then two tall reading panels
 * — no ledger and no figure strip, so this is a hand-built shape rather than
 * `SkeletonPage` (C10). The digest block is stubbed at 560px: the real frame is
 * sized from the report's byte count (`../digest-frame.tsx`) and lands anywhere
 * in 420–900px, so the middle of that range is the stub that moves the page
 * least, and no stub can be exactly right before the row is read.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading this report…</span>
      <div className="pt-3.5">
        <Skeleton className="h-2.5 w-24" />
      </div>
      <div className="pb-3 pt-3.5">
        <Skeleton className="mb-2 h-2.5 w-64" />
        <Skeleton className="h-6 w-96 max-w-full" />
      </div>

      {/* I · the delivery record: two columns of dot-leader rows. */}
      <Skeleton className="h-[28px] w-full" />
      <div className="grid gap-x-10 px-1 pt-3 lg:grid-cols-2" aria-hidden>
        {Array.from({ length: 2 }, (_, col) => (
          <div key={col}>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="mb-2 h-2.5 w-full" />
            ))}
          </div>
        ))}
      </div>

      {/* II · the rendered digest, at the middle of the frame's range. */}
      <Skeleton className="mt-5 h-[28px] w-full" />
      <Skeleton className="mt-2 h-[560px] w-full" />

      {/* III · the plain-text alternative. */}
      <Skeleton className="mt-5 h-[28px] w-full" />
      <Skeleton className="mt-2 h-40 w-full" />
    </div>
  );
}
