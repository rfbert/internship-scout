import { describe, expect, it } from "vitest";
import {
  UNDELIVERED,
  dispatchBacklogLine,
  isComposedState,
  resolveDispatch,
  type DispatchRecord,
  type DispatchState,
} from "@/app/reports/meta";

/* ── Two invariants of the dispatch book ───────────────────────────────────
   1. A day's row is upserted across several runs, and only the SUCCESS path
      ever clears `error`. So a stale `error` can sit beside a fresh
      `skippedReason`, and the page must not read that as a transport failure.
   2. The footnote's numerator and denominator have to count the same
      population. They did not, and the page contradicted its own figures. */

/** A composed, undelivered dry-run report — the shape 23 of 26 rows on file have. */
const base: DispatchRecord = {
  sendMode: "DRY_RUN",
  sentAt: null,
  skippedReason: "dry-run mode",
  error: null,
  htmlChars: 1925,
  textChars: 518,
};

describe("a stale error beside a fresh skippedReason", () => {
  /* The reported sequence, exactly: 06:00 composes and the transport fails, so
     the row carries `error` and no `sentAt`. The owner turns email off in
     Settings and runs the agent again at 10:00. Run 2 composes in full, takes
     the `!prefs?.emailEnabled` branch and writes `skippedReason` — over an
     `error` nothing cleared. */
  const heldOverAFailure: DispatchRecord = {
    ...base,
    sendMode: "RESEND",
    error: "API key is invalid",
    skippedReason: "Email disabled or no recipient configured",
  };

  it("is HELD, not FAILED — the run never touched a transport", () => {
    expect(resolveDispatch(heldOverAFailure).state).toBe("HELD");
  });

  it("does not print the superseded error anywhere", () => {
    const out = resolveDispatch(heldOverAFailure);
    expect(out.detail).toBe("Email disabled or no recipient configured");
    // The ledger's STORED NOTE column prints `note`; quoting the dead error
    // there would reproduce the same contradiction one column over.
    expect(out.note).toBe("Email disabled or no recipient configured");
    expect(out.tone).not.toBe("carmine");
  });

  it("still calls a genuine transport failure FAILED", () => {
    // The transport branch writes `{ error, skippedReason: null }` in one
    // object, so a real failure never carries a skip note. That is precisely
    // what makes the rule above safe.
    const out = resolveDispatch({
      ...base,
      sendMode: "RESEND",
      error: "451 mailbox unavailable",
      skippedReason: null,
    });
    expect(out.state).toBe("FAILED");
    expect(out.detail).toBe("451 mailbox unavailable");
    expect(out.note).toBe("451 mailbox unavailable");
  });

  it("reads a quiet day over an old failure as NOT COMPOSED", () => {
    const out = resolveDispatch({
      ...base,
      sendMode: "RESEND",
      error: "API key is invalid",
      skippedReason: "No valuable news; skip preference active",
      htmlChars: 0,
      textChars: 0,
    });
    expect(out.state).toBe("NOT_COMPOSED");
  });

  it("keeps a delivered day SENT whatever is stale on the row", () => {
    const out = resolveDispatch({
      ...base,
      sentAt: new Date("2026-08-12T14:23:10Z"),
      error: "API key is invalid",
    });
    expect(out.state).toBe("SENT");
  });

  it("leaves the dry-run reading alone, which is 23 of the 26 rows on file", () => {
    expect(resolveDispatch(base).state).toBe("DRY_RUN");
    expect(resolveDispatch({ ...base, error: "API key is invalid" }).state).toBe("DRY_RUN");
  });
});

describe("the footnote's population", () => {
  /* The live book at the time of the fix: 26 reports, 23 dry-run, 3 quiet,
     0 sent. The old line read "23 OF 26 NEVER LEFT THE APP" — asserting that
     3 of them did, directly under a figure strip reading `Sent 0`. */
  const live: DispatchState[] = [
    ...Array<DispatchState>(23).fill("DRY_RUN"),
    ...Array<DispatchState>(3).fill("NOT_COMPOSED"),
  ];

  it("counts numerator and denominator over the same rows", () => {
    expect(dispatchBacklogLine(live)).toBe(
      "23 OF 23 COMPOSED DIGESTS NEVER LEFT THE APP · SENDING IS OFF UNTIL A PROVIDER KEY IS SET"
    );
  });

  it("never claims more digests left than the SENT figure shows", () => {
    // The property the old line broke: denominator − numerator must never
    // exceed the number actually sent.
    const cases: DispatchState[][] = [
      live,
      ["SENT", "DRY_RUN", "NOT_COMPOSED", "HELD", "FAILED"],
      ["SENT", "SENT", "NOT_COMPOSED"],
      ["DRY_RUN", "PENDING"],
    ];
    for (const states of cases) {
      const line = dispatchBacklogLine(states);
      const m = /^(\d+) OF (\d+) /.exec(line);
      if (!m) continue;
      const [, unread, total] = m.map(Number);
      const sent = states.filter((s) => s === "SENT").length;
      expect(total - unread, line).toBeLessThanOrEqual(sent);
    }
  });

  it("drops the sending-is-off clause the morning a key lands", () => {
    const line = dispatchBacklogLine(["SENT", "DRY_RUN", "NOT_COMPOSED"]);
    expect(line).toBe("1 OF 2 COMPOSED DIGESTS NEVER LEFT THE APP");
  });

  it("says something true when every day in the window was quiet", () => {
    expect(dispatchBacklogLine(["NOT_COMPOSED", "NOT_COMPOSED"])).toBe(
      "NO DIGEST WAS COMPOSED IN THIS WINDOW"
    );
  });

  it("says nothing at all on an empty book", () => {
    expect(dispatchBacklogLine([])).toBe("NO DISPATCH ON FILE");
  });

  it("agrees with UNDELIVERED about what a quiet day is", () => {
    // The two must not drift: NOT_COMPOSED is out of the backlog set, and it
    // is out of the population the footnote divides by. That pairing IS the
    // fix, so it gets asserted rather than assumed.
    expect(UNDELIVERED.has("NOT_COMPOSED")).toBe(false);
    expect(isComposedState("NOT_COMPOSED")).toBe(false);
    for (const s of UNDELIVERED) expect(isComposedState(s)).toBe(true);
  });
});
