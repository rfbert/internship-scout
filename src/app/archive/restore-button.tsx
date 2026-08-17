"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OutlineVerb } from "@/components/register/stamp";
import { postJson } from "@/lib/client-api";

/**
 * The restore verb. The POST, the payload and the refresh are exactly what they
 * were; the lucide arrow is gone (icons are not the Register's marks, B5) and
 * the button is now the shared `OutlineVerb`. The request goes through
 * `postJson`, so a dead server now reads the same sentence here as everywhere
 * else instead of a bare "Network error".
 */
export function RestoreButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = async () => {
    setBusy(true);
    setError(null);
    const res = await postJson(`/api/decisions/${listingId}`, { action: "restore" });
    setBusy(false);
    if (!res.ok) {
      // Under ~24 characters or it wraps the 116px actions column. Long enough
      // to say the record did not move and that a second press is worth it.
      setError(res.error ?? "Not restored · retry");
      return;
    }
    router.refresh();
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      {error ? (
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-carmine">
          {error}
        </span>
      ) : null}
      <OutlineVerb
        onClick={() => void restore()}
        disabled={busy}
        title="Send this record back to the review queue"
      >
        {busy ? "Restoring…" : "Restore"}
      </OutlineVerb>
    </span>
  );
}
