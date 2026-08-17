"use client";

import Link from "next/link";
import { ErrorState, loadFailed } from "@/components/ui";
import { OutlineVerb } from "@/components/register/stamp";

/**
 * `reset` is kept deliberately — see the sibling `/reports/error.tsx` note and
 * C10. The back link is here too: a report that will not load is a dead end,
 * and the book it came from is the one place worth offering.
 */
export default function ReportDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pt-3.5">
      <ErrorState message={loadFailed("This report", error.digest)} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <OutlineVerb onClick={reset}>Try again</OutlineVerb>
        <Link
          href="/reports"
          className="font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          ← All reports
        </Link>
      </div>
    </div>
  );
}
