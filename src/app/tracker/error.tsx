"use client";

import { ErrorState, loadFailed } from "@/components/ui";
import { OutlineVerb } from "@/components/register/stamp";

/**
 * `reset` is kept deliberately. Next 16.2 added `unstable_retry` and documents
 * it as preferred, but `reset` is still supported, and swapping to an
 * `unstable_`-prefixed API is a behavior change outside this conversion's remit
 * (spec C10).
 */
export default function TrackerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pt-4">
      <ErrorState message={loadFailed("The tracker", error.digest)} />
      <div className="mt-3">
        <OutlineVerb onClick={reset}>Try again</OutlineVerb>
      </div>
    </div>
  );
}
