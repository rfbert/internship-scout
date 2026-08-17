import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SEND_MODE_LABELS,
  UNDELIVERED,
  fmtChars,
  resolveDispatch,
  type DispatchRecord,
  type DispatchState,
} from "@/app/reports/meta";
import { frameHeight } from "@/app/reports/digest-frame";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** A composed, undelivered dry-run report — the shape 23 of 26 rows on file have. */
const base: DispatchRecord = {
  sendMode: "DRY_RUN",
  sentAt: null,
  skippedReason: "dry-run mode",
  error: null,
  htmlChars: 1925,
  textChars: 518,
};

const at = (iso: string) => new Date(iso);

describe("the dispatch state machine", () => {
  it("calls a delivered report SENT, whatever mode it went out in", () => {
    expect(resolveDispatch({ ...base, sendMode: "RESEND", sentAt: at("2026-08-12T14:23:10Z") }).state).toBe("SENT");
    // sentAt beats a stale dry-run note left on the row by an earlier attempt.
    expect(resolveDispatch({ ...base, sentAt: at("2026-08-12T14:23:10Z") }).state).toBe("SENT");
  });

  /* `skippedReason: null` is not decoration — it is what the transport branch
     actually writes beside an error (`{ error, skippedReason: … : null }`, one
     object, `src/agent/run.ts`). Spreading `base`'s "dry-run mode" under an
     error builds a row the database cannot hold, and a stale skip note beside
     an error now means something specific. See dispatch-precedence.test.ts. */
  it("calls a transport error FAILED and prints the error as the reason", () => {
    const out = resolveDispatch({
      ...base,
      sendMode: "RESEND",
      error: "451 mailbox unavailable",
      skippedReason: null,
    });
    expect(out.state).toBe("FAILED");
    expect(out.detail).toBe("451 mailbox unavailable");
    expect(out.tone).toBe("carmine");
  });

  /* THE REGRESSION THIS FILE EXISTS FOR.

     `src/agent/run.ts:1047` writes `skippedReason: "dry-run mode"` on a report
     that was composed IN FULL. A naive field order — sentAt, error,
     skippedReason, sendMode — labels it "SKIPPED", which tells the reader the
     agent had nothing for them on a morning it wrote them a complete digest.
     Composition is the discriminator, not the presence of a reason string. */
  it("does NOT call a composed dry-run report skipped", () => {
    const out = resolveDispatch(base);
    expect(out.state).toBe("DRY_RUN");
    expect(out.state).not.toBe("NOT_COMPOSED");
    expect(out.label).toBe("COMPOSED · NOT SENT");
    expect(out.composed).toBe(true);
    // And it must not read as a fault: carmine and ochre are the fault tones.
    expect(out.tone).toBe("blue");
    expect(out.detail).toMatch(/built and stored/i);
    // The machine's own note is not echoed back as if it were an explanation…
    expect(out.detail).not.toContain("dry-run mode");
    // …but it is still carried verbatim for the index's column.
    expect(out.note).toBe("dry-run mode");
  });

  /* The index prints `note`, the detail page prints `detail`. If they ever
     collapse into one field, the ledger goes back to repeating one long
     sentence down every row of a 26-row book. */
  it("keeps the stored note separate from the rendered prose", () => {
    const dry = resolveDispatch(base);
    expect(dry.note).not.toBe(dry.detail);
    expect(dry.note.length).toBeLessThan(dry.detail.length);

    // Where the database has real words, note and detail agree.
    const failed = resolveDispatch({
      ...base,
      sendMode: "RESEND",
      error: "451 mailbox unavailable",
      skippedReason: null,
    });
    expect(failed.note).toBe("451 mailbox unavailable");
    expect(failed.detail).toBe(failed.note);

    /* A skip reason outranks an error in the note, as it does in the state —
       this assertion used to read the other way round and that was the bug.
       The two fields are never co-written, so a row carrying both is a row
       whose error was left behind by an EARLIER run and then held or skipped
       by a later one. The note has to quote the write that actually explains
       the outcome. */
    const both = resolveDispatch({ ...base, sendMode: "SMTP", error: "boom", skippedReason: "held" });
    expect(both.note).toBe("held");
    expect(both.state).toBe("HELD");

    // Nothing stored means nothing printed — the cell falls back to an em dash.
    expect(resolveDispatch({ ...base, sentAt: at("2026-08-12T14:23:10Z"), skippedReason: null }).note).toBe("");
  });

  it("calls a report with no body at all NOT COMPOSED, with the run's reason", () => {
    const out = resolveDispatch({
      ...base,
      skippedReason: "No valuable news; skip preference active",
      htmlChars: 0,
      textChars: 0,
    });
    expect(out.state).toBe("NOT_COMPOSED");
    expect(out.composed).toBe(false);
    expect(out.detail).toBe("No valuable news; skip preference active");
  });

  it("calls a composed report held back in a LIVE mode HELD", () => {
    const out = resolveDispatch({
      ...base,
      sendMode: "SMTP",
      skippedReason: "Email disabled or no recipient configured",
    });
    expect(out.state).toBe("HELD");
    expect(out.detail).toBe("Email disabled or no recipient configured");
  });

  it("surfaces a non-dry-run reason even while the mode is dry run", () => {
    const out = resolveDispatch({
      ...base,
      skippedReason: "Email disabled or no recipient configured",
    });
    expect(out.state).toBe("DRY_RUN");
    expect(out.detail).toBe("Email disabled or no recipient configured");
  });

  it("does not silently invent an outcome when the run wrote none", () => {
    const out = resolveDispatch({ ...base, sendMode: "SMTP", skippedReason: null });
    expect(out.state).toBe("PENDING");
    expect(out.detail).not.toBe("");
  });

  /* D3: color is never the sole carrier of meaning. Every branch has to hand
     the page a WORD, because `tone` is only ever applied to that word. */
  it("always returns a printable label and a tone", () => {
    const cases: DispatchRecord[] = [
      { ...base, sentAt: at("2026-08-12T14:23:10Z") },
      // As written by the transport branch: an error, and no skip note.
      { ...base, error: "boom", skippedReason: null },
      { ...base, htmlChars: 0, textChars: 0 },
      base,
      { ...base, sendMode: "RESEND", skippedReason: "held" },
      { ...base, sendMode: "RESEND", skippedReason: null },
    ];
    const seen = new Set<DispatchState>();
    for (const c of cases) {
      const out = resolveDispatch(c);
      seen.add(out.state);
      expect(out.label.trim().length).toBeGreaterThan(0);
      expect(out.tone.length).toBeGreaterThan(0);
    }
    expect(seen.size).toBe(6);
  });

  it("counts every state that never reached a human as undelivered", () => {
    expect(UNDELIVERED.has("SENT")).toBe(false);
    // A quiet day is not a backlog item — there was nothing to read.
    expect(UNDELIVERED.has("NOT_COMPOSED")).toBe(false);
    for (const s of ["FAILED", "DRY_RUN", "HELD", "PENDING"] as DispatchState[]) {
      expect(UNDELIVERED.has(s), s).toBe(true);
    }
  });
});

/* The labels are keyed by the real `EmailSendMode` enum. If a value is added to
   the schema, the Record type stops compiling — but a rename would still pass
   typecheck against a stale generated client, so the schema text is the check. */
describe("the send-mode vocabulary", () => {
  it("covers exactly the EmailSendMode values in schema.prisma", () => {
    const block = /enum EmailSendMode \{([^}]*)\}/.exec(source("prisma/schema.prisma"));
    if (!block) throw new Error("EmailSendMode is no longer a plain enum block in schema.prisma");
    const values = block[1].split("\n").map((l) => l.trim()).filter(Boolean).sort();
    expect(values).toEqual(["DRY_RUN", "RESEND", "SMTP"]);
    expect(Object.keys(SEND_MODE_LABELS).sort()).toEqual(values);
  });
});

describe("stored sizes", () => {
  it("prints an empty body as a real zero rather than a blank", () => {
    expect(fmtChars(0)).toBe("0 B");
  });

  it("switches to KB above 1024 characters", () => {
    expect(fmtChars(1023)).toBe("1023 B");
    expect(fmtChars(1925)).toBe("1.9 KB");
  });
});

/* The app-wide ledger rule from `ledger-width.test.ts`: /opportunities at 1340
   is the ceiling, and 1350 is the content box of the 1440px reference laptop.
   A ledger wider than that makes the PAGE scroll sideways. */
describe("the /reports ledger width", () => {
  it("sits under the app-wide ceiling", () => {
    const match = /minWidth=\{(\d+)\}/.exec(source("src/app/reports/page.tsx"));
    if (!match) throw new Error("/reports no longer hands the ledger a literal minWidth");
    expect(Number(match[1])).toBeLessThanOrEqual(1340);
  });
});

/* The security property the detail page rests on. It is a one-line mistake to
   "simplify" the iframe away, and the failure is silent — the page still
   renders, it is just an XSS now. So it is pinned. */
describe("the rendered digest is quarantined", () => {
  const FRAME = "src/app/reports/digest-frame.tsx";

  // Matches the JSX PROP, not the word: `digest-frame.tsx` names it in prose to
  // explain why it is not used, and a bare substring check would fail on that.
  it("never inlines stored email markup into the app's own DOM", () => {
    for (const rel of [FRAME, "src/app/reports/[id]/page.tsx", "src/app/reports/page.tsx"]) {
      expect(/dangerouslySetInnerHTML\s*=/.test(source(rel)), rel).toBe(false);
    }
  });

  /* The heights are fitted to measurements taken in a real browser (see the
     table in digest-frame.tsx). Pinned so a later "tidy-up" of the magic
     numbers has to confront the measurements instead of guessing past them.
     Under-estimating is the harmful direction: it hides the bottom of a digest
     behind a nested scrollbar. */
  it("gives every digest on file enough room for its measured height", () => {
    const measured: Array<[chars: number, trueHeight: number]> = [
      [1925, 403],
      [4685, 706],
      [8831, 1385],
    ];
    for (const [chars, trueHeight] of measured) {
      expect(frameHeight(chars), `${chars} chars`).toBeGreaterThanOrEqual(trueHeight);
    }
  });

  it("stays within a sane band and never collapses on a tiny body", () => {
    expect(frameHeight(1)).toBeGreaterThanOrEqual(320);
    expect(frameHeight(500_000)).toBeLessThanOrEqual(1600);
    // Monotonic: a bigger digest never gets a shorter frame.
    expect(frameHeight(8831)).toBeGreaterThan(frameHeight(1925));
  });

  it("feeds the markup to a sandboxed iframe with scripting off", () => {
    const text = source(FRAME);
    expect(text).toContain("srcDoc=");
    expect(text).toContain('sandbox=""');
    expect(text).not.toContain("allow-scripts");
    // No `src`: nothing about the preview is fetched over the network.
    expect(/<iframe[\s\S]*?\ssrc=/.test(text)).toBe(false);
  });
});
