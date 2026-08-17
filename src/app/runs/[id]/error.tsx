"use client";

import { ErrorState, loadFailed } from "@/components/ui";
import { OutlineVerb } from "@/components/register/stamp";

/** `reset`, not `unstable_retry` (C10). */
export default function RunDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pt-4">
      <ErrorState message={loadFailed("This run", error.digest)} />
      <div className="mt-2.5">
        <OutlineVerb onClick={reset}>Try again</OutlineVerb>
      </div>
    </div>
  );
}
