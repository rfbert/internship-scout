import type { EventLevel } from "@prisma/client";
import type { ColorToken } from "@/lib/format";

/* ══════════════════════════════════════════════════════════════════════════
   THE INTAKE LOG — shared vocabulary for /runs and /runs/[id] (spec C7)

   `STATUS_LABELS` / `STATUS_TONES` used to live here. They are gone: the
   Register's canonical run vocabulary is `RUN_STATUS_LABELS` + `runStatusColor`
   in `src/lib/format.ts`, which FOUNDATION pre-moved there precisely so this
   page agent would not have to keep a second copy in step (spec C1 note). What
   is left here is what only the log books need: durations, and the grammar of
   the run's `stats` JSON blob.
   ══════════════════════════════════════════════════════════════════════════ */

export const TRIGGER_LABELS: Record<"SCHEDULED" | "MANUAL", string> = {
  SCHEDULED: "Scheduled",
  MANUAL: "Manual",
};

/** An event's level. Printed as its own word, so color is never alone (D3). */
export const LEVEL_COLOR: Record<EventLevel, ColorToken> = {
  INFO: "ink-3",
  WARN: "ochre",
  ERROR: "carmine",
};

export function fmtDuration(start: Date, end: Date | null): string {
  if (!end) return "running…";
  const ms = Math.max(0, end.getTime() - start.getTime());
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/* ── How long it took, or what happened instead ─────────────────────────────
   `scripts/janitor-stale-runs.ts` closes out runs that have been RUNNING for
   more than 24h, and it stamps `finishedAt` with ITS OWN clock. So for a reaped
   run the subtraction above does not measure the run — it measures how long the
   corpse lay there before anyone looked. One MANUAL run on file collected
   nothing, died in its first minutes, was reaped ten days later, and reported

     FAILED · 237h 45m

   which reads as a run that ground away for ten days. Its own event log says
   otherwise, in as many words: "Marked FAILED by janitor: still RUNNING 238h
   after start (process presumed dead)."

   `REAP_AFTER_H` is how long a run may sit in RUNNING before this page stops
   believing it. In the full deployment a scheduled janitor writes the matching
   verdict into the database, and the two thresholds were pinned to each other
   by a test that read the number back out of the janitor's source. That script
   is part of the ingestion side and is not in this repository, so the pin is
   gone with it — this constant now stands alone and owns the number outright.
   Stated plainly because the alternative is a comment citing a file no reader
   can open, which is indistinguishable from having no guard at all. */
export const REAP_AFTER_H = 24;

export interface RunDuration {
  /** The DURATION cell — short enough for a ledger column. */
  text: string;
  /** The same fact with its reason, for the detail page's status line. */
  sentence: string;
  /** The cell's `title` — the full explanation. */
  title: string;
  /** True when `text` is not a duration at all. */
  unfinished: boolean;
}

/**
 * How long the run took, or — when the number would be a lie — what happened.
 *
 * A FAILED run whose wall clock ran past the janitor's threshold did not take
 * that long. The agent's own failure path (`run.ts`, the `catch` around the
 * pipeline) stamps `finishedAt: new Date()` at the moment it catches, so a
 * genuinely failed run's span IS its runtime and lands far below the
 * threshold; the reaped shape is therefore distinguishable from the honest one
 * without knowing which writer touched the row. This does not claim to know
 * that, and the sentence holds either way: the run did not finish, and the
 * number is the age at which that was noticed rather than a runtime.
 */
export function runDuration(run: {
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
}): RunDuration {
  if (!run.finishedAt) {
    return {
      text: "running…",
      sentence: "running…",
      title: "Still running — no finishing update yet.",
      unfinished: false,
    };
  }
  const hours = (run.finishedAt.getTime() - run.startedAt.getTime()) / 3_600_000;
  if (run.status === "FAILED" && hours >= REAP_AFTER_H) {
    // The janitor's own rounding, so the cell and its event agree to the hour.
    const h = Math.round(hours);
    return {
      text: "did not finish",
      sentence: `did not finish · reaped after ${h}h`,
      title: `Still RUNNING when the janitor closed it out ${h}h after start, so ${h}h is the run's age, not its runtime.`,
      unfinished: true,
    };
  }
  const text = fmtDuration(run.startedAt, run.finishedAt);
  return { text, sentence: text, title: `Ran ${text}.`, unfinished: false };
}

/* ── The version stamp ──────────────────────────────────────────────────────
   `run.ts` writes `process.env.APP_VERSION ?? "dev"`, and APP_VERSION is set
   in no environment this app deploys to — so every row on file, production
   included, carries the literal string "dev" and every footnote printed
   "AGENT DEV". A stamp that reads the same on every record identifies nothing;
   it is the absence of a version wearing the costume of one.

   Until `run.ts` stops writing the placeholder (it is not this agent's file),
   "dev" means UNSTAMPED and the label is omitted rather than printed. A real
   version — a tag, a commit — still prints. */
export function agentVersionLabel(version: string | null | undefined): string | null {
  if (!version) return null;
  const v = version.trim();
  return v === "" || v.toLowerCase() === "dev" ? null : v;
}

/**
 * Numeric entries of a run's `stats` JSON, in reading order rather than
 * insertion order.
 *
 * The blob is written by `bump()` in `src/agent/run.ts`, so its key order is
 * whatever the pipeline happened to touch first — which puts `dropped_PHD_ONLY`
 * ahead of `fetched` on some runs and behind it on others, and a column that
 * reorders itself between rows cannot be read down. `RANK` fixes the reading
 * order: what came in, what it became, then what went wrong. Unknown keys keep
 * their relative order in the middle, ahead of the error tail.
 */
const RANK: Record<string, number> = {
  fetched: 0,
  new: 1,
  changed: 2,
  requeued: 3,
  queued: 4,
  closed: 5,
  autoRejected: 6,
};

const rankOf = (key: string): number => {
  if (key in RANK) return RANK[key];
  if (/error/i.test(key)) return 40;
  if (/^dropped_/.test(key)) return 30;
  return 20;
};

export function statEntries(stats: unknown): Array<[string, number]> {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return [];
  return Object.entries(stats as Record<string, unknown>)
    .filter((e): e is [string, number] => typeof e[1] === "number")
    .sort((a, b) => rankOf(a[0]) - rankOf(b[0]));
}

/** One numeric stat, or null. */
export function statNum(stats: unknown, key: string): number | null {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return null;
  const v = (stats as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Every error bucket in one number — the same sum `run.ts:1087` grades on. */
export const statErrors = (stats: unknown): number =>
  statEntries(stats).reduce((n, [k, v]) => (/error/i.test(k) ? n + v : n), 0);

export function statColor(key: string): ColorToken {
  if (/error/i.test(key)) return "carmine";
  if (key === "new" || key === "queued") return "green";
  if (key === "requeued" || key === "changed") return "blue";
  if (key === "closed" || /^dropped_/.test(key) || key === "autoRejected") return "ochre";
  return "ink-3";
}

/**
 * `dropped_PHD_ONLY` → `DROPPED · PHD ONLY`, `sourceErrors` → `SOURCE ERRORS`.
 * The blob's keys are two different machine conventions (camelCase from
 * `bump("sourceErrors")`, SCREAMING_SNAKE from `bump(\`dropped_${reason}\`)`);
 * the log prints one.
 */
export function statLabel(key: string): string {
  return key
    .replace(/^dropped_/, "dropped · ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toUpperCase();
}

/** `544 FETCHED · 4 NEW · 2 QUEUED` — a one-line digest, for tooltips. */
export const statLine = (stats: unknown, take = 4): string =>
  statEntries(stats)
    .slice(0, take)
    .map(([k, v]) => `${v} ${statLabel(k)}`)
    .join(" · ");

/* ── The COUNTERS column ────────────────────────────────────────────────────
   This column printed "the top few non-zero counters", which means the key in
   any given position was whatever that particular run happened to record. Two
   adjacent rows read

     549 FETCHED · 6 NEW · 4 CHANGED ·  1 QUEUED
     543 FETCHED · 4 CHANGED · 12 QUEUED · 464 RESCORED

   — the third position is CHANGED on one line and QUEUED on the next, and NEW
   is simply absent from the second, so the one question the column exists to
   answer ("how many new listings, day over day?") cannot be answered by
   reading down it. A column whose meaning changes per row is a list that has
   been given a column's shape.

   So the set is FIXED and the order is fixed, and a counter the run did not
   record prints as an em dash rather than vanishing: a missing number and a
   zero are the same fact here (`bump()` only ever creates a key when it has
   something to add to it), and both are worth seeing in position.

   Four counters, chosen as the intake narrative: what came in, what was new,
   what changed, what reached the queue. The rest of the blob is not lost —
   `/runs/[id]` prints every key as a chip, and the cell's tooltip still
   carries the full digest. */
export const LEDGER_COUNTERS = ["fetched", "new", "changed", "queued"] as const;

export interface CounterCell {
  key: string;
  /** `FETCHED`, `NEW`, … */
  label: string;
  /** `null` when the run recorded no such counter — printed as `—`. */
  value: number | null;
}

export function statCounters(stats: unknown): CounterCell[] {
  return LEDGER_COUNTERS.map((key) => ({
    key,
    label: statLabel(key),
    value: statNum(stats, key),
  }));
}

/* ── The stats blob, logged at itself ───────────────────────────────────────
   `run.ts` closes every run by logging `Run ${status}: ${JSON.stringify(stats)}`
   as an ordinary event. On `/runs/[id]` that lands in the event stream as a
   wall of JSON truncated mid-key —

     Run SUCCESS: {"fetched":549,"resighted":456,"dropped_NOT_AN_INTERNSH…

   — roughly 400px below a chip row that renders the identical numbers, laid
   out and labelled. The stream is the page's evidence and this line is the one
   row in it that carries nothing a reader can use, so it is dropped.

   The test is deliberately narrow: the same `report`-stage line also carries
   the run's failure MESSAGE on the throwing path (`Run FAILED: ${message}`),
   and that one is often the only statement of what went wrong. Requiring the
   payload to open with `{` keeps the message variant in the stream, where it
   belongs. */
export function isStatsDigestEvent(e: { stage: string; message: string }): boolean {
  return e.stage === "report" && /^Run [A-Z]+: \{/.test(e.message);
}

/* ══════════════════════════════════════════════════════════════════════════
   WARNINGS — the failure this product cannot afford to render as success

   On 12 Aug the agent logged six WARN events: two GitHub lists reporting
   `NOT_YET_AVAILABLE: repo or branch missing`, one whose HTML no longer has a
   table it recognises, and three ATS watchlists that came back reachable with
   zero intern-titled postings between them. Five of the eleven automated
   connectors brought back nothing. The run was stamped SUCCESS, counted under
   "13 CLEAN" on `/runs`, footnoted "0 COUNTED ERRORS", and every one of those
   sources showed HEALTH OK on `/sources`.

   Nothing lied. `run.ts` grades on `CollectionError` rows and a WARN event
   creates none (`errorCount === 0 ? "SUCCESS"` at run.ts:1163); `statErrors`
   greps the stats blob, and no warning ever reaches it. Every counter was
   correct and the composite they formed was false — which is the dangerous
   kind, because a tool whose entire purpose is not missing a posting had
   quietly stopped reading half its sources and said so nowhere.

   The status column belongs to `run.ts` and is not this agent's to change. So
   warnings are surfaced ALONGSIDE it, in every place a run is counted or
   graded: the `/runs` figure strip (CLEAN now means clean), the WARNINGS
   column, the detail page's header and footnote, and the `/sources` health
   cell. The remaining debt is written down in the report — `run.ts` should
   grade PARTIAL on warnings, and until it does, "SUCCESS" on this page means
   only "no CollectionError rows".
   ══════════════════════════════════════════════════════════════════════════ */

export interface AboveInfo {
  warn: number;
  error: number;
  /** Everything the run logged above INFO. */
  total: number;
}

/**
 * WARN and ERROR counted apart, because they are not the same news.
 *
 * A single count called "warnings" printed "1 WARNING" over a run whose only
 * non-INFO line was the janitor's ERROR declaring it dead. The stream keeps
 * the two levels distinct and so does everything that summarises it.
 */
export function aboveInfo(events: ReadonlyArray<{ level: EventLevel }>): AboveInfo {
  let warn = 0;
  let error = 0;
  for (const e of events) {
    if (e.level === "WARN") warn++;
    else if (e.level === "ERROR") error++;
  }
  return { warn, error, total: warn + error };
}

/** `6 WARN`, `1 ERROR`, `2 WARN · 1 ERROR`, or `—`. */
export function aboveInfoLabel(a: AboveInfo, short = false): string {
  const parts: string[] = [];
  if (a.warn > 0) parts.push(`${a.warn} WARN`);
  if (a.error > 0) parts.push(`${a.error} ${short ? "ERR" : "ERROR"}${a.error === 1 || short ? "" : "S"}`);
  return parts.length === 0 ? "—" : parts.join(short ? " " : " · ");
}

/** Carmine once anything errored, ochre for warnings alone. */
export const aboveInfoColor = (a: AboveInfo): ColorToken | undefined =>
  a.error > 0 ? "carmine" : a.warn > 0 ? "ochre" : undefined;

/**
 * The warning stripped of the source key `run.ts` prefixes it with.
 *
 * `collect()` logs `${source.key}: ${warning}`, so the key is the join back to
 * a row on `/sources`. Returns null when the message belongs to another source
 * — matching on the exact prefix, not a substring, because source keys nest
 * (`github:speedyapply/2027-AI-College-Jobs` and
 * `github:speedyapply/2027-SWE-College-Jobs` share sixteen characters).
 */
export function warningForSource(message: string, sourceKey: string): string | null {
  const prefix = `${sourceKey}: `;
  return message.startsWith(prefix) ? message.slice(prefix.length) : null;
}

/**
 * A warning short enough for a ledger cell.
 *
 * Connector warnings lead with a machine code the reader does not need
 * (`NOT_YET_AVAILABLE: repo or branch missing`); the words after it are the
 * finding. Anything else is passed through and clipped.
 */
export function shortWarning(warning: string, max = 44): string {
  const body = warning.replace(/^[A-Z][A-Z0-9_]{3,}:\s*/, "").trim();
  return body.length <= max ? body : `${body.slice(0, max - 1).trimEnd()}…`;
}

/** `repo or branch missing +1 more` — several warnings in one cell's worth. */
export function warningSummary(warnings: readonly string[], max = 44): string {
  if (warnings.length === 0) return "";
  const first = shortWarning(warnings[0], max);
  return warnings.length === 1 ? first : `${first} +${warnings.length - 1} more`;
}

/* ── Failure text, made safe to look at ─────────────────────────────────────
   `CollectionError.message` is whatever the thrower produced, and for a
   Prisma failure that is a multi-line report naming the file the query lives
   in, by ABSOLUTE PATH, followed by an excerpt of this repository's source:

     Invalid `tx.listingScore.upsert()` invocation in
     /Users/dev/projects/internship-scout/src/agent/run.ts:738:41

   Thirteen of those rendered on one failed run — two full screens publishing
   a home directory, the ORM's internals and the code around the call. On a
   deployed host it publishes the server's paths instead. None of it helps the
   one reader this page has, who wants to know which stage broke and whether
   to re-run.

   So: `redactPaths` first, always, on anything shown; `summarizeFailure` for
   the line that leads. The raw text stays available behind a disclosure
   because it is genuine evidence when a run really has to be debugged — but
   redacted there too, since the paths are never the evidence. */

/**
 * Absolute paths → their last segment. POSIX, Windows, UNC, in prose or a stack.
 *
 * The first version of this required the final segment to carry a FILE
 * EXTENSION, and matched nothing at all without one — so every path ending in
 * a directory survived untouched, which is most of them:
 *
 *   Cannot find module '/Users/…/src/lib/prisma'        ← unchanged
 *   ENOENT … scandir '/Users/…/data'                    ← unchanged
 *   Working directory is /Users/…/internship-scout      ← unchanged
 *
 * `Cannot find module` and `ENOENT … directory` are ordinary failures for a
 * bundled app on a serverless host, so the guard was absent exactly where it
 * was most likely to be needed. The comment on the calling page said "no
 * branch can put a path on screen"; the function never delivered that.
 *
 * It also ate URLs. `https://raw.githubusercontent.com/org/repo/main/README.md`
 * became `https:/README.md`, and since `run.ts` files GitHub collection errors
 * with no `url` column, WHICH REPO FAILED became unrecoverable from anywhere
 * on the page. A URL is not a filesystem path and is often the whole evidence,
 * so URLs are lifted out before any redaction and put back afterwards.
 *
 * Three segments minimum, deliberately: it keeps route-shaped strings like
 * `/api/settings` and `/review?sort=posted` intact, which are meaningful to a
 * reader and disclose nothing.
 */
export function redactPaths(text: string): string {
  // 1 · Park every URL behind a placeholder no regex below can match.
  const urls: string[] = [];
  let out = text.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>]+/gi, (u) => {
    urls.push(u);
    return `\u0000URL${urls.length - 1}\u0000`;
  });

  out = out
    // 2 · UNC first — it also starts with separators, so it must beat Windows.
    .replace(/\\\\[^\\\s]+(?:\\[^\\\s]+){2,}/g, (m) => m.split("\\").filter(Boolean).pop() ?? m)
    // 3 · Windows, including the JSON-escaped `C:\\Users\\…` form.
    .replace(/[A-Za-z]:(?:\\{1,2}[^\\/\s"']+){2,}/g, (m) => m.split(/\\+/).pop() ?? m)
    // 4 · POSIX. No space in the class: a space would let one match run across
    //     prose and swallow the words between two unrelated paths.
    .replace(/(?:\/[\w.@+-]+){3,}/g, (m) => m.split("/").pop() ?? m);

  // 5 · Put the URLs back exactly as they were.
  return out.replace(/\u0000URL(\d+)\u0000/g, (_, i) => urls[Number(i)]);
}

/**
 * One line a reader can act on, from a machine's paragraph.
 *
 * Prisma leads with the failing invocation and buries the cause several lines
 * down, so neither the first line nor the last is reliably the useful one.
 * This takes the invocation as the subject when it is there, and the most
 * specific cause line it can find as the predicate. Everything is redacted on
 * the way out, including the fallback, so no path can reach the page by any
 * branch.
 */
export function summarizeFailure(message: string): string {
  const clean = redactPaths(message).replace(/\s+$/, "");
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);

  const op = clean.match(/Invalid `([^`]+)` invocation/)?.[1];
  const cause = lines.find((l) =>
    /^(Transaction (?:API )?error|Timed out|Can't reach|Unique constraint|Foreign key|Raw query|Error|Server has closed)/i.test(l)
  );

  if (op && cause) return clip(`${op} — ${cause}`);
  if (op) return clip(`${op} failed`);
  if (cause) return clip(cause);
  // Not a shape we recognise: first line only, capped. Never the whole blob.
  return lines[0] ? clip(lines[0]) : "Unknown failure";
}

/**
 * Cap at 200 characters, on a word boundary, with an ellipsis that says so.
 *
 * A hard slice cut "…expired transaction. The tim" and left the reader unsure
 * whether the sentence had ended or the renderer had given up. The full text
 * is one disclosure away, so the only job here is to end somewhere that looks
 * deliberate.
 */
function clip(s: string, max = 200): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:\s]+$/, "")}…`;
}
