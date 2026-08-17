"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OutlineVerb } from "@/components/register/stamp";
import { postJson } from "@/lib/client-api";

/**
 * What the Danger Zone becomes on the public demo.
 *
 * The demo is meant to be used, not just looked at — accepting a listing,
 * moving an application, writing a note all work, because a review queue you
 * cannot work is a screenshot. The cost of that is drift, so this is the way
 * back: it wipes whatever anyone did and rebuilds the dataset by re-running the
 * scoring engines over the same invented postings.
 *
 * It replaces `DangerZone` rather than sitting beside it. "Clear sample data"
 * would delete the demo outright and is refused server-side here, so offering
 * the button and then rejecting the click would only waste the reader's time.
 */
export function DemoZone() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function reset() {
    if (
      !window.confirm(
        "Rebuild the demo data?\n\n" +
          "Anything anyone changed — accepted listings, tracker stages, notes — goes back " +
          "to how it was deployed. Takes a few seconds; every posting is scored again."
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await postJson<{ reset: boolean; tookMs: number }>("/api/demo/reset");
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "danger", text: res.error });
      return;
    }
    setMessage({
      tone: "success",
      text: `Rebuilt in ${(res.data.tookMs / 1000).toFixed(1)}s.`,
    });
    router.refresh();
  }

  return (
    <div className="rounded border border-rule bg-surface px-3.5 py-3">
      <p className="text-[12.5px] leading-relaxed text-ink-2">
        This is the public demo. The companies and postings are invented, so nothing here is worth
        protecting — go ahead and work the review queue, move applications, write notes. Two things
        are held back because they are global rather than per-record: the scoring weights, and
        deleting records outright.
      </p>
      <p className="mt-1.5 font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.04em] text-ink-3">
        Rebuilding re-runs the scoring engines over every posting — the numbers are computed, not stored.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <OutlineVerb disabled={busy} onClick={reset}>
          {busy ? "Rebuilding…" : "Reset demo data"}
        </OutlineVerb>
        {message ? (
          <span
            className={`font-mono text-[10.5px] uppercase tracking-[0.06em] ${
              message.tone === "danger" ? "text-carmine" : "text-green"
            }`}
            role="status"
          >
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
