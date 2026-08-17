"use client";

import { ErrorState, loadFailed } from "@/components/ui";
import { OutlineVerb } from "@/components/register/stamp";

/**
 * `reset`, not `unstable_retry` — see the note in `../error.tsx` (C10).
 */
export default function CompanyDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pt-4">
      <ErrorState message={loadFailed("This company record", error.digest)} />
      <div className="mt-2.5 flex items-center gap-1.5">
        <OutlineVerb onClick={reset}>Try again</OutlineVerb>
        <OutlineVerb href="/companies">All companies</OutlineVerb>
      </div>
    </div>
  );
}
