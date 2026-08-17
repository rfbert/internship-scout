"use client";

import { ErrorState, loadFailed } from "@/components/ui";
import { OutlineVerb } from "@/components/register/stamp";

/**
 * `reset`, not `unstable_retry` — still supported in Next 16.2, and swapping to
 * an `unstable_`-prefixed API is a behavior change outside this phase (C10).
 */
export default function RunsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pt-4">
      <ErrorState message={loadFailed("Runs", error.digest)} />
      <div className="mt-2.5">
        <OutlineVerb onClick={reset}>Try again</OutlineVerb>
      </div>
    </div>
  );
}
