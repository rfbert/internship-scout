import type { EmailSendMode } from "@prisma/client";
import type { ColorToken } from "@/lib/format";

/* ══════════════════════════════════════════════════════════════════════════
   THE DISPATCH BOOK — shared vocabulary for /reports and /reports/[id]

   Sending is not live (docs/ACTIVATION.md — the owner adds the key). Until it
   is, the row in `email_reports` is the ONLY record of what the agent decided
   each morning, and `sendMode` / `skippedReason` / `error` are the only
   explanation of why nothing arrived. So the outcome has to be resolved
   honestly, and the honest answer is not the naive field order.

   WHY THE ORDER BELOW IS NOT "sentAt → error → skippedReason → sendMode":
   `src/agent/run.ts:1047` writes `skippedReason: "dry-run mode"` on a report
   that was composed IN FULL and simply had no transport to leave by. A rule
   that checks `skippedReason` before `sendMode` labels 23 of the 26 rows on
   file "SKIPPED" — which reads as "the agent had nothing for you" when in fact
   it wrote you a complete digest. That is the single most misleading thing this
   page could say, so `skippedReason` is NOT the third test.

   The real discriminator is whether a body was ever composed. Two different
   writes produce a `skippedReason`:

     · `run.ts:1009-1021` — no valuable news, skip preference on. Subject is
       literally "(skipped)" and BOTH bodies are empty strings. Nothing was
       composed. This is a true skip.
     · `run.ts:1037` / `run.ts:1047` — a full digest was composed and stored,
       then held back (email disabled, no recipient) or dropped on the floor by
       the dry-run adapter (`src/server/email/send.ts:62`, which returns
       `{ sent: false }` and no error). Something exists to read.

   Hence: sent → failed → nothing-composed → dry-run → held → pending.
   ══════════════════════════════════════════════════════════════════════════ */

export type DispatchState =
  /** `sentAt` is set: it left the building. */
  | "SENT"
  /** The transport reported an error. */
  | "FAILED"
  /** No body was ever built — the run had nothing worth reporting. */
  | "NOT_COMPOSED"
  /** Composed in full; EMAIL_MODE is dry-run, so no transport was attempted. */
  | "DRY_RUN"
  /** Composed in full; a live mode held it back (disabled / no recipient). */
  | "HELD"
  /** Composed, and no delivery outcome was ever written. Should not happen. */
  | "PENDING";

/** Everything the outcome depends on, and nothing else — so it unit-tests. */
export interface DispatchRecord {
  sendMode: EmailSendMode;
  sentAt: Date | null;
  skippedReason: string | null;
  error: string | null;
  /** Characters of stored HTML. `0` is the "nothing was composed" signal. */
  htmlChars: number;
  /** Characters of stored plain text. */
  textChars: number;
}

export interface DispatchOutcome {
  state: DispatchState;
  /**
   * The mono-caps headline. Always a WORD, never a color alone (D3) — every
   * caller prints this string, and `tone` only colors it.
   */
  label: string;
  /** The sentence under the headline: why. Empty when the label says it all. */
  detail: string;
  /**
   * The stored explanation VERBATIM — `error`, else `skippedReason`, else "".
   *
   * The index prints this rather than `detail`, and the difference matters: on
   * a book where 23 of 26 rows are dry runs, `detail` puts the same 78-character
   * sentence in every cell of the column, and a column that reads identically
   * all the way down is a column that says nothing. The raw note is short
   * ("dry-run mode"), varies where the rows actually differ, and is the thing
   * the database really holds. The prose belongs on the detail page, where it
   * is said once.
   */
  note: string;
  tone: ColorToken;
  /** True when there is a stored digest to read. Drives the detail page. */
  composed: boolean;
}

/**
 * The stored dry-run reason is the machine's own note to itself. "COMPOSED ·
 * NOT SENT" plus "Dry run — no transport configured" already says it in
 * English, and echoing `dry-run mode` under it is the same fact twice.
 */
const REDUNDANT_REASONS = new Set(["dry-run mode"]);

/**
 * WHICH OF `error` AND `skippedReason` IS THE TRUTH WHEN BOTH ARE SET.
 *
 * A day's row is UPSERTED, and the day is explicitly re-runnable: the
 * idempotency guard skips only when `sentAt || skippedReason` is set, so a row
 * left carrying only an `error` is picked up again by the next run. Nothing in
 * the compose path clears `error`, so it can outlive the run that wrote it.
 *
 * It cannot outlive it AMBIGUOUSLY, though, because of how the two fields are
 * written (`src/agent/run.ts`):
 *
 *   · The transport branch writes BOTH in one object —
 *     `{ error, skippedReason: outcome.mode === "DRY_RUN" ? "dry-run mode" : null }`
 *     — and the dry-run adapter (`src/server/email/send.ts`) returns
 *     `{ mode: "DRY_RUN", sent: false }` with NO error. So a transport write
 *     that sets `error` always sets `skippedReason` to null in the same write.
 *   · Both branches that write a `skippedReason` (nothing worth reporting;
 *     email disabled or no recipient) `return` before any transport is
 *     attempted, so neither can also write an `error` in that run.
 *
 * The two therefore cannot be co-written. If both are set they came from
 * DIFFERENT runs, and only one ordering is reachable: a run wrote `error`,
 * then a later run held or skipped the day and wrote `skippedReason` over the
 * top. The reverse cannot produce this state, because the transport write that
 * sets `error` clears `skippedReason`.
 *
 * So `skippedReason` is always the fresher of the two, and a stale `error`
 * beside it is history — not the outcome. Rendering it as FAILED puts a
 * carmine "API key is invalid" on a run that never touched a transport, when
 * the honest answer is HELD.
 *
 * THE DURABLE FIX IS NOT HERE: the upsert's `update` branch in `run.ts` should
 * clear `error` alongside the fields it already rewrites. This function is the
 * reader's defence against rows that were written before it does.
 */
const freshError = (r: DispatchRecord): string | null =>
  r.skippedReason != null ? null : r.error;

export function resolveDispatch(r: DispatchRecord): DispatchOutcome {
  const composed = r.htmlChars > 0 || r.textChars > 0;
  const error = freshError(r);
  // `note` is the stored explanation VERBATIM, so it has to quote the field
  // that actually explains this outcome — quoting a superseded error would put
  // the same contradiction in the ledger's STORED NOTE column.
  const note = error ?? r.skippedReason ?? "";

  if (r.sentAt) {
    return { state: "SENT", label: "SENT", detail: "", note, tone: "green", composed };
  }

  if (error) {
    return { state: "FAILED", label: "FAILED", detail: error, note, tone: "carmine", composed };
  }

  if (!composed) {
    return {
      state: "NOT_COMPOSED",
      label: "NOT COMPOSED",
      detail: r.skippedReason ?? "No digest was built for this day.",
      note,
      tone: "ink-3",
      composed,
    };
  }

  if (r.sendMode === "DRY_RUN") {
    const extra = r.skippedReason && !REDUNDANT_REASONS.has(r.skippedReason) ? r.skippedReason : "";
    return {
      state: "DRY_RUN",
      label: "COMPOSED · NOT SENT",
      // Says plainly that this is the configured normal, not a fault. Sending
      // is off until a provider key is added; the digest below is complete.
      detail: extra || "Dry run — the digest was built and stored, but no mail transport was used.",
      note,
      tone: "blue",
      composed,
    };
  }

  if (r.skippedReason) {
    return {
      state: "HELD",
      label: "HELD",
      detail: r.skippedReason,
      note,
      tone: "ochre",
      composed,
    };
  }

  return {
    state: "PENDING",
    label: "NO OUTCOME RECORDED",
    detail: "The digest was stored but the run never wrote a delivery result.",
    note,
    tone: "ink-3",
    composed,
  };
}

/** How the stored `EmailSendMode` is printed. The enum lives in schema.prisma. */
export const SEND_MODE_LABELS: Record<EmailSendMode, string> = {
  RESEND: "Resend",
  SMTP: "SMTP",
  DRY_RUN: "Dry run",
};

/**
 * Which states mean "a human never saw this". Counted on the index so the
 * page can state the backlog in one number instead of implying it with color.
 *
 * NOT_COMPOSED is deliberately absent, and that is the whole subtlety: a quiet
 * day has nothing that could have been delivered, so it is not part of the
 * backlog. Which means it must not be part of the DENOMINATOR either — see
 * `dispatchBacklogLine`.
 */
export const UNDELIVERED: ReadonlySet<DispatchState> = new Set<DispatchState>([
  "FAILED",
  "DRY_RUN",
  "HELD",
  "PENDING",
]);

/** A day the agent actually wrote a digest for — the population that CAN be sent. */
export const isComposedState = (s: DispatchState): boolean => s !== "NOT_COMPOSED";

/**
 * The footnote's one figure: how many written digests never reached anybody.
 *
 * The numerator and the denominator MUST describe the same population, and
 * they used to not. `UNDELIVERED` excludes NOT_COMPOSED while the denominator
 * was `reports.length`, which includes it — so on the live book (26 reports:
 * 23 dry-run, 3 quiet, 0 sent) the line read "23 OF 26 NEVER LEFT THE APP",
 * asserting that 3 of them did, directly under a figure strip reading
 * `Sent 0`. Both ends now count only days with a digest on file.
 */
export function dispatchBacklogLine(states: readonly DispatchState[]): string {
  const composed = states.filter(isComposedState);
  const undelivered = composed.filter((s) => UNDELIVERED.has(s)).length;
  const sent = states.filter((s) => s === "SENT").length;

  if (states.length === 0) return "NO DISPATCH ON FILE";
  // Every day in the window was a quiet one: there is no backlog to report,
  // and "0 OF 0" is not a sentence.
  if (composed.length === 0) return "NO DIGEST WAS COMPOSED IN THIS WINDOW";

  /* The "sending is off" clause is conditional on nothing having been sent,
     not printed for every non-empty book. It is true today — all 26 rows are
     dry runs — but hard-coding it means that the morning after a provider key
     lands, this line sits under a column of SENT rows still insisting mail is
     disabled. A footnote that cannot become false is not a fact, it is
     decoration. */
  const off = sent === 0 ? " · SENDING IS OFF UNTIL A PROVIDER KEY IS SET" : "";
  return `${undelivered} OF ${composed.length} COMPOSED DIGESTS NEVER LEFT THE APP${off}`;
}

/** `1925` → `1.9 KB`. Sizes are evidence that a body exists, so `0 B` prints. */
export function fmtChars(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}
