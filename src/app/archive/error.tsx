"use client";

import { ErrorState, loadFailed } from "@/components/ui";
import { OutlineVerb } from "@/components/register/stamp";

/** `reset` is kept deliberately — see the note in `opportunities/error.tsx` (C10). */
export default function ArchiveError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pt-3.5">
      <ErrorState message={loadFailed("The archive", error.digest)} />
      <div className="mt-3">
        <OutlineVerb onClick={reset}>Try again</OutlineVerb>
      </div>
    </div>
  );
}
