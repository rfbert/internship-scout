"use client";

import { ErrorState, loadFailed } from "@/components/ui";
import { OutlineVerb } from "@/components/register/stamp";

/**
 * `reset` is kept deliberately. Next 16.2 added `unstable_retry` and documents
 * it as preferred, but `reset` is still supported and swapping to an
 * `unstable_`-prefixed API is a behaviour change outside this conversion (C10).
 */
export default function OpportunitiesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pt-3.5">
      <ErrorState message={loadFailed("Opportunities", error.digest)} />
      <div className="mt-3">
        <OutlineVerb onClick={reset}>Try again</OutlineVerb>
      </div>
    </div>
  );
}
