"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DangerVerb } from "@/components/register/stamp";
import { postJson } from "@/lib/client-api";

/**
 * The one destructive control in the app. Carmine OUTLINE only — accent color
 * never fills a verb (B3/stamp.tsx) — inside the section's carmine hairline
 * frame, which is the whole visual weight the panel gets.
 *
 * The accession note is required by A2 §4: `clear-samples` HARD-deletes sample
 * applications, and accession numbers are derived from creation order, so every
 * record filed after the seed shifts down. That is the one documented way a
 * record's permanent number can move, and the reader is told before they act.
 */
export function DangerZone({
  sampleListings,
  sampleCompanies,
}: {
  sampleListings: number;
  sampleCompanies: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const nothingToClear = sampleListings === 0 && sampleCompanies === 0;

  async function clearSamples() {
    // Name the applications. The route hard-deletes them
    // (`tx.application.deleteMany`, clear-samples/route.ts) alongside the
    // listings they point at, and the old prompt asked consent for listings
    // and companies only — the reader first learned an application had gone
    // from the success message, after the fact. Consent has to cover what is
    // actually destroyed. No count for them because the client is not told
    // one; "every application filed against them" is the honest shape.
    if (
      !window.confirm(
        `Delete ${sampleListings} sample listing${sampleListings === 1 ? "" : "s"}, ` +
          `${sampleCompanies} sample compan${sampleCompanies === 1 ? "y" : "ies"}, ` +
          `and every application filed against them?\n\n` +
          `Real data is untouched. This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await postJson<{
      applications: number;
      listings: number;
      companies: number;
    }>("/api/settings/clear-samples");
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "danger", text: res.error });
      return;
    }
    setMessage({
      tone: "success",
      text: `Removed ${res.data.listings} listing(s), ${res.data.companies} company(ies), ${res.data.applications} application(s).`,
    });
    router.refresh();
  }

  return (
    <div className="rounded border border-carmine bg-surface px-3.5 py-3">
      <p className="text-[12.5px] leading-relaxed text-ink-2">
        The seed installs clearly labeled SAMPLE listings and companies so the register is not empty
        on first launch. Remove them once real data is flowing.
        {nothingToClear ? " Nothing to clear right now." : ""}
      </p>
      <p className="mt-1.5 font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.04em] text-ink-3">
        Clearing samples changes the accession number of every record filed after the seed.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <DangerVerb disabled={busy || nothingToClear} onClick={clearSamples}>
          {busy
            ? "Clearing…"
            : `Clear sample data (${sampleListings} listing${sampleListings === 1 ? "" : "s"}, ${sampleCompanies} compan${sampleCompanies === 1 ? "y" : "ies"})`}
        </DangerVerb>
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
