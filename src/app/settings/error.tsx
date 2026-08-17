"use client";

import { ErrorState, loadFailed } from "@/components/ui";
import { OutlineVerb } from "@/components/register/stamp";

/**
 * `reset` is kept deliberately. Next 16.2 documents `unstable_retry` as
 * preferred, but swapping to an `unstable_`-prefixed API is a behavior change
 * outside this conversion's remit (C10).
 */
export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pt-3.5">
      <ErrorState message={loadFailed("Settings", error.digest)} />
      <div className="mt-3">
        <OutlineVerb onClick={reset}>Try again</OutlineVerb>
      </div>
    </div>
  );
}
