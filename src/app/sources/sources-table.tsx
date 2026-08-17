"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ledger,
  LedgerCell,
  LedgerHead,
  LedgerRow,
  LedgerSection,
  type LedgerCol,
} from "@/components/register/ledger";
import { Chip } from "@/components/register/chip";
import { OutlineVerb } from "@/components/register/stamp";
import { TOKEN_TEXT, fmtAgo, type ColorToken } from "@/lib/format";
import { fmtDateTimeTz } from "@/lib/dates";
import { patchJson, postJson } from "@/lib/client-api";
import { warningSummary } from "@/app/runs/meta";
import { SOURCE_KIND_LABELS, configChips, sourceHealth } from "./meta";
import type { SourceRow } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   THE ROSTER — one ruled line per source (spec C7)

   Each row carries a health TICK on the margin (`--green` ok, `--ochre` stale,
   `--carmine` failing) and prints the health word beside it, because a tick on
   its own is a color and color never carries meaning alone (D3).

   `lastSuccessAt` / `lastErrorAt` are true INSTANTS, so every timestamp here
   reads in the user's stored timezone. The `timezone` prop used to be optional
   with a `DEFAULT_TIMEZONE` fallback, purely because the page had not adopted
   it; the page passes it now, so it is required and the fallback is gone —
   there is no longer a path on which this table and the rest of the app
   disagree about what time it is.
   ══════════════════════════════════════════════════════════════════════════ */

const COLS: LedgerCol[] = [
  { label: "Source", w: "minmax(0,1fr)" },
  { label: "Kind", w: "128px" },
  { label: "Enabled", w: "70px" },
  { label: "Priority", w: "64px", align: "right" },
  { label: "Rate ms", w: "78px", align: "right" },
  // Health carries a verdict, a distance AND what the connector warned about,
  // so it is the widest of the fixed tracks. MIN_WIDTH rose with it.
  { label: "Health", w: "268px" },
  { label: "Yield", w: "164px" },
  { label: "", w: "146px", align: "right" },
];

/** Below this the ledger scrolls inside itself — the page never does. */
const MIN_WIDTH = 1300;

const inlineInput =
  "w-full rounded border border-rule bg-surface px-1.5 py-[3px] text-right font-mono text-[11px] tabular-nums outline-none focus:border-blue";

export function SourcesTable({
  rows,
  timezone,
  now,
  label,
}: {
  rows: SourceRow[];
  /** `UserPreference.timezone` — required; see the note above. */
  timezone: string;
  /**
   * Epoch ms, minted once on the server. Staleness is computed against THIS
   * value rather than a fresh `Date.now()` inside the row, so the markup the
   * server sent and the markup the client hydrates cannot disagree.
   */
  now: number;
  /** Accessible name, e.g. "Automated connectors". */
  label: string;
}) {
  return (
    <Ledger cols={COLS} minWidth={MIN_WIDTH} label={label}>
      <LedgerHead cols={COLS} />
      <LedgerSection>
        {rows.map((row) => (
          <SourceTableRow key={row.id} row={row} timezone={timezone} now={now} />
        ))}
      </LedgerSection>
    </Ledger>
  );
}

function SourceTableRow({
  row,
  timezone,
  now,
}: {
  row: SourceRow;
  timezone: string;
  now: number;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(row.enabled);
  const [priority, setPriority] = useState(String(row.priority));
  const [rateLimitMs, setRateLimitMs] = useState(String(row.rateLimitMs));
  const [configText, setConfigText] = useState(() =>
    row.config == null ? "" : JSON.stringify(row.config, null, 2)
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: ColorToken; text: string; runLink?: boolean } | null>(
    null
  );

  const chips = configChips(row.config);
  const health = sourceHealth({ ...row, enabled }, now);
  /* A warning only reframes a health verdict that currently reads as good. On
     a FAILING or OFF row the stronger word already stands, and stacking an
     ochre qualifier under a carmine one would soften it. */
  const warned = health.code === "OK" && row.warnings.length > 0;

  async function save(body: Record<string, unknown>, successText?: string) {
    setBusy(true);
    setMessage(null);
    const res = await patchJson(`/api/sources/${row.id}`, body);
    setBusy(false);
    if (res.ok) {
      if (successText) setMessage({ tone: "green", text: successText });
      router.refresh();
    } else {
      setMessage({ tone: "carmine", text: res.error ?? "Update failed" });
    }
    return res.ok;
  }

  async function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    const okRes = await save({ enabled: next });
    if (!okRes) setEnabled(!next);
  }

  async function savePriority() {
    const n = Number(priority);
    if (!Number.isInteger(n) || n < 0 || n > 1000) {
      setMessage({ tone: "carmine", text: "Priority must be an integer between 0 and 1000" });
      setPriority(String(row.priority));
      return;
    }
    if (n !== row.priority) await save({ priority: n });
  }

  async function saveRateLimit() {
    const n = Number(rateLimitMs);
    if (!Number.isInteger(n) || n < 250 || n > 60000) {
      setMessage({ tone: "carmine", text: "Rate limit must be an integer between 250 and 60000 ms" });
      setRateLimitMs(String(row.rateLimitMs));
      return;
    }
    if (n !== row.rateLimitMs) await save({ rateLimitMs: n });
  }

  async function saveConfig() {
    let parsed: unknown;
    try {
      parsed = configText.trim() === "" ? null : JSON.parse(configText);
    } catch {
      setMessage({ tone: "carmine", text: "Config is not valid JSON — fix it and save again" });
      return;
    }
    await save({ config: parsed }, "Config saved");
  }

  async function runNow() {
    setBusy(true);
    setMessage(null);
    const res = await postJson(`/api/sources/${row.id}/run`);
    setBusy(false);
    setMessage(
      res.ok
        ? { tone: "blue", text: "Run started — follow it on", runLink: true }
        : { tone: "carmine", text: res.error ?? "Could not start the run" }
    );
  }

  const successStamp = row.lastSuccessAt
    ? `last success ${fmtDateTimeTz(row.lastSuccessAt, timezone)}`
    : "never fetched";
  const errorStamp = row.lastErrorAt
    ? ` · last failure ${fmtDateTimeTz(row.lastErrorAt, timezone)}`
    : "";

  return (
    <>
      <LedgerRow tick={warned ? "ochre" : health.color}>
        <LedgerCell title={`${row.name} · ${row.key}`}>
          <span className="text-[13px] font-semibold">{row.name}</span>
          <span className="ml-1.5 font-mono text-[10.5px] text-ink-3">{row.key}</span>
        </LedgerCell>

        <LedgerCell mono muted>
          {SOURCE_KIND_LABELS[row.kind].toUpperCase()}
        </LedgerCell>

        <LedgerCell>
          <EnabledSwitch
            enabled={enabled}
            busy={busy}
            name={row.name}
            onToggle={toggleEnabled}
          />
        </LedgerCell>

        <LedgerCell align="right">
          <input
            type="number"
            min={0}
            max={1000}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            onBlur={savePriority}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className={inlineInput}
            aria-label={`Priority for ${row.name}`}
          />
        </LedgerCell>

        <LedgerCell align="right">
          <input
            type="number"
            min={250}
            max={60000}
            step={250}
            value={rateLimitMs}
            onChange={(e) => setRateLimitMs(e.target.value)}
            onBlur={saveRateLimit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className={inlineInput}
            aria-label={`Rate limit in milliseconds for ${row.name}`}
          />
        </LedgerCell>

        {/* The health tooltip carries the full instant; the cell carries the
            word, the color and the distance.

            AND WHAT THE CONNECTOR SAID. `sourceHealth` reads timestamps, and a
            connector that returns nothing still sets `lastSuccessAt` — so a
            GitHub list whose repo has gone missing reported HEALTH OK · 10
            HOURS AGO, in green, on the page whose job is to tell you which
            sources are working. The fetch did succeed; the source is dead. The
            warning is printed beside the word and the tick turns ochre, so
            neither the color nor the text says "fine" on its own (D3). */}
        <LedgerCell
          mono
          title={
            warned
              ? `${health.sentence} · but the last run warned: ${row.warnings.join(" · ")} · ${successStamp}${errorStamp}`
              : `${health.sentence} · ${successStamp}${errorStamp}`
          }
        >
          <span className={`font-semibold ${TOKEN_TEXT[warned ? "ochre" : health.color]}`}>
            {health.code}
          </span>
          <span className="ml-1.5 text-ink-3">
            {row.lastSuccessAt ? fmtAgo(row.lastSuccessAt) : "—"}
          </span>
          {warned ? (
            <span className={`ml-1.5 ${TOKEN_TEXT.ochre}`}>
              · {warningSummary(row.warnings, 26)}
            </span>
          ) : null}
        </LedgerCell>

        <LedgerCell mono muted>
          {row.sightings} SIGHTINGS ·{" "}
          <span className={row.topBandListings > 0 ? TOKEN_TEXT.green : undefined}>
            {row.topBandListings}
          </span>{" "}
          TOP 4
        </LedgerCell>

        <LedgerCell align="right">
          <span className="inline-flex items-center justify-end gap-1.5">
            {row.automated ? (
              <OutlineVerb onClick={runNow} disabled={busy}>
                Run now
              </OutlineVerb>
            ) : null}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Collapse" : "Expand"} ${row.name} details`}
              className="inline-flex size-[22px] items-center justify-center rounded border border-rule bg-surface font-mono text-[12px] leading-none text-ink-2 transition-colors duration-[120ms] ease-out hover:border-ink-3 hover:text-ink"
            >
              <span aria-hidden>{expanded ? "−" : "+"}</span>
            </button>
          </span>
        </LedgerCell>
      </LedgerRow>

      {/* A reply from the server hangs under the row it answers, rather than
          crowding a 34px line. */}
      {message ? (
        <div role="row" className="border-b border-feint bg-surface-2 px-3.5 py-1">
          <div
            role="cell"
            className={`font-mono text-[10.5px] uppercase tracking-[0.06em] ${TOKEN_TEXT[message.tone]}`}
          >
            {message.text}
            {message.runLink ? (
              <>
                {" "}
                <Link href="/runs" className="underline underline-offset-2">
                  the intake log
                </Link>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {expanded ? (
        <div role="row" className="border-b border-feint bg-inset px-3.5 py-3">
          <div role="cell" className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                Config
              </h3>
              {chips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {chips.map((chip) => (
                    <Chip key={chip} label={chip} />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-ink-3">No config set.</p>
              )}
              {row.notes ? <p className="mt-2.5 text-[12px] text-ink-3">{row.notes}</p> : null}

              {/* The last failure, verbatim, in the inset treatment every
                  quoted machine string gets. */}
              {row.lastErrorMessage ? (
                <>
                  <h3 className="mt-3.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                    Last failure
                    {row.lastErrorAt ? (
                      <span className="ml-2 font-normal normal-case tracking-normal">
                        {fmtDateTimeTz(row.lastErrorAt, timezone)}
                      </span>
                    ) : null}
                  </h3>
                  <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded border border-rule bg-surface px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] text-carmine">
                    {row.lastErrorMessage}
                  </pre>
                </>
              ) : null}
            </div>

            <div className="min-w-0">
              <h3 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                Edit config (JSON)
              </h3>
              <textarea
                value={configText}
                onChange={(e) => setConfigText(e.target.value)}
                rows={6}
                spellCheck={false}
                className="mt-2 w-full rounded border border-rule bg-surface px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] outline-none focus:border-blue"
                aria-label={`Config JSON for ${row.name}`}
              />
              <div className="mt-1.5">
                <OutlineVerb onClick={saveConfig} disabled={busy}>
                  Save config
                </OutlineVerb>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * The enabled switch. The sliding pill filled with `--accent` is gone: an
 * accent fill is not part of this vocabulary, and a pill has no state you can
 * read without knowing the convention. This is the Register's own "active"
 * mark — the ink stamp — printing the word it means.
 *
 * `role="switch"` + `aria-checked` are preserved verbatim from the control it
 * replaces (D7).
 */
function EnabledSwitch({
  enabled,
  busy,
  name,
  onToggle,
}: {
  enabled: boolean;
  busy: boolean;
  name: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`${enabled ? "Disable" : "Enable"} ${name}`}
      disabled={busy}
      onClick={onToggle}
      className={`inline-flex w-[40px] items-center justify-center rounded border px-1.5 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-[120ms] ease-out disabled:pointer-events-none disabled:opacity-50 ${
        enabled
          ? "border-ink bg-ink text-paper"
          : "border-rule bg-surface text-ink-3 hover:border-ink-3 hover:text-ink"
      }`}
    >
      {enabled ? "On" : "Off"}
    </button>
  );
}
