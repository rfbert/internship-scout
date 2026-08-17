"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getJson, postJson } from "@/lib/client-api";
import { VERDICT_SENTENCES } from "./meta";
import type { DecisionAction, DiscardReasonOption, Verdict } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   THE DECISION LAYER

   Everything that talks to `/api/decisions`, `/api/listings/*` and
   `/api/discard-reasons`, lifted out of the 924-line list component so the
   shell is layout and the network is here.

   Two things this module owns beyond the fetches:

   1. VERDICT MEMORY (spec C2). A decided record leaves `PENDING_REVIEW` and so
      leaves the server query on the next `router.refresh()`. The docket must
      still show what you did to it during this sitting, so the verdict is held
      client-side and the row keeps rendering from the props already in hand.
      Zero query changes.
   2. Every request here goes through `@/lib/client-api` — the inline `postJson`
      duplicate that used to live at the top of `review-list.tsx` is gone (Part
      E, step 7), and the one raw `fetch` left, the discard-reason GET, now uses
      `getJson` so its failure reads like every other one.

   No API contract changes: same routes, same bodies, same `{ ok, error }`.
   ══════════════════════════════════════════════════════════════════════════ */

export type { DecisionAction } from "./types";

export interface ToastState {
  message: string;
  actions?: Array<{ label: string; onClick: () => void }>;
}

export interface DecisionExtras {
  discardReasonKey?: string;
  note?: string;
}

const TOAST_MS = 6000;

/** The discard-reason vocabulary, fetched once per mount. */
export function useDiscardReasons(): DiscardReasonOption[] {
  const [reasons, setReasons] = useState<DiscardReasonOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    // `getJson` resolves rather than rejects on a transport failure, so there
    // is nothing to catch: the vocabulary simply stays empty and the discard
    // menu falls back to its no-reason path.
    void getJson<DiscardReasonOption[]>("/api/discard-reasons").then((res) => {
      if (!cancelled && res.ok && res.data) setReasons(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return reasons;
}

export interface DecisionsApi {
  /** Per-listing in-flight set — disables that row's verbs, nothing else. */
  busy: Set<string>;
  bulkRunning: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  toast: ToastState | null;
  setToast: (t: ToastState | null) => void;
  /** listingId → what this sitting decided about it. Survives the refresh. */
  verdicts: Map<string, Verdict>;
  decide: (
    listingId: string,
    action: DecisionAction,
    extra?: DecisionExtras
  ) => Promise<boolean>;
  reanalyze: (listingId: string) => Promise<void>;
  saveNote: (listingId: string, body: string) => Promise<boolean>;
  runBulk: (
    listingIds: string[],
    action: DecisionAction,
    discardReasonKey?: string
  ) => Promise<void>;
}

export function useDecisions(): DecisionsApi {
  const router = useRouter();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [verdicts, setVerdicts] = useState<Map<string, Verdict>>(new Map());

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const setRowBusy = useCallback((listingId: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(listingId);
      else next.delete(listingId);
      return next;
    });
  }, []);

  const remember = useCallback((listingId: string, action: DecisionAction) => {
    setVerdicts((prev) => {
      const next = new Map(prev);
      // No accession here: `/api/decisions` answers with the decision row, and
      // `/review` never loads applications, so there is no A-number to read
      // without a new query (D4 forbids one). The stamp reads `FILED`; the
      // accession is the tracker's to print. See A2.
      next.set(listingId, { action, at: Date.now() });
      return next;
    });
  }, []);

  const forget = useCallback((listingId: string) => {
    setVerdicts((prev) => {
      if (!prev.has(listingId)) return prev;
      const next = new Map(prev);
      next.delete(listingId);
      return next;
    });
  }, []);

  const decide = useCallback<DecisionsApi["decide"]>(
    async (listingId, action, extra) => {
      setError(null);
      setRowBusy(listingId, true);
      const res = await postJson(`/api/decisions/${listingId}`, { action, ...extra });
      setRowBusy(listingId, false);
      if (!res.ok) {
        setError(res.error ?? "The decision could not be saved.");
        return false;
      }
      remember(listingId, action);

      // Undo stays on the toast — the mock's `UNDO LAST` header button would
      // need to know the last decided record across reloads, which is a new
      // query (C2, "two things NOT to build").
      const undo = {
        label: "Undo",
        onClick: () => {
          setToast(null);
          forget(listingId);
          void postJson(`/api/decisions/${listingId}`, { action: "restore" }).then(() =>
            router.refresh()
          );
        },
      };
      setToast({
        message: VERDICT_SENTENCES[action],
        actions:
          action === "accept"
            ? [{ label: "View", onClick: () => router.push("/tracker") }, undo]
            : [undo],
      });
      router.refresh();
      return true;
    },
    [router, remember, forget, setRowBusy]
  );

  const reanalyze = useCallback(
    async (listingId: string) => {
      setError(null);
      setRowBusy(listingId, true);
      const res = await postJson(`/api/listings/${listingId}/reanalyze`);
      setRowBusy(listingId, false);
      if (!res.ok) {
        setError(res.error ?? "Re-analysis failed.");
        return;
      }
      router.refresh();
    },
    [router, setRowBusy]
  );

  const saveNote = useCallback(
    async (listingId: string, body: string) => {
      const text = body.trim();
      if (!text) return false;
      setError(null);
      setRowBusy(listingId, true);
      const res = await postJson(`/api/listings/${listingId}/note`, { body: text });
      setRowBusy(listingId, false);
      if (!res.ok) {
        setError(res.error ?? "The note could not be saved.");
        return false;
      }
      router.refresh();
      return true;
    },
    [router, setRowBusy]
  );

  const runBulk = useCallback<DecisionsApi["runBulk"]>(
    async (listingIds, action, discardReasonKey) => {
      setError(null);
      setBulkRunning(true);
      let failures = 0;
      const decided: string[] = [];
      // Small concurrency window: much faster than serial for big queues
      // without stampeding the pooled database connection.
      const CHUNK = 6;
      for (let i = 0; i < listingIds.length; i += CHUNK) {
        const slice = listingIds.slice(i, i + CHUNK);
        const results = await Promise.allSettled(
          slice.map((listingId) =>
            postJson(`/api/decisions/${listingId}`, {
              action,
              ...(discardReasonKey ? { discardReasonKey } : {}),
            })
          )
        );
        results.forEach((r, j) => {
          if (r.status === "fulfilled" && r.value.ok) decided.push(slice[j]);
          else failures++;
        });
      }
      setBulkRunning(false);
      if (decided.length > 0) {
        const at = Date.now();
        setVerdicts((prev) => {
          const next = new Map(prev);
          for (const id of decided) next.set(id, { action, at });
          return next;
        });
      }
      if (failures > 0) {
        setError(`${failures} of the selected decisions failed — the rest were saved.`);
      }
      router.refresh();
    },
    [router]
  );

  return {
    busy,
    bulkRunning,
    error,
    setError,
    toast,
    setToast,
    verdicts,
    decide,
    reanalyze,
    saveNote,
    runBulk,
  };
}
