"use client";

import { ErrorState, loadFailed } from "@/components/ui";
import { OutlineVerb } from "@/components/register/stamp";

/**
 * `reset`, not `unstable_retry`. Next 16.2 added the latter and documents it as
 * preferred, but `reset` is still supported and swapping to an `unstable_` API
 * is a behavior change outside this phase's remit (C10).
 */
export default function CompaniesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pt-4">
      <ErrorState message={loadFailed("Companies", error.digest)} />
      <div className="mt-2.5">
        <OutlineVerb onClick={reset}>Try again</OutlineVerb>
      </div>
    </div>
  );
}
