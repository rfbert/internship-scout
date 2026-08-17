"use client";

import { Quote } from "@/components/register/well";
import { Estimated, Sponsorship } from "@/components/register/notation";
import { TOKEN_TEXT } from "@/lib/format";
import { fmtDateTimeTz, fmtDateTz } from "@/lib/dates";
import {
  ARRANGEMENT_LABELS,
  UG_ELIGIBILITY_LABELS,
  seasonWords,
  ugEligibilityColor,
} from "./meta";
import type { ReviewRow } from "./types";

/**
 * EVIDENCE & EXAMINER'S NOTES — the right half of the worksheet.
 *
 * The examiner's case for the sponsorship verdict, in the order an examiner
 * would build it: the verdict, the reasoning, the season check, the POSTING'S
 * OWN WORDS with a retrieval timestamp, then the eligibility facts.
 *
 * Quoted language sits in a `Quote`, not a `Well`: a well is for instruments —
 * anything with a bar, tick or gauge. A quotation is prose evidence, so it goes
 * on `--inset` with a rule flag, the way a pulled quote does on paper.
 */
export function Evidence({ row, timezone }: { row: ReviewRow; timezone: string }) {
  const a = row.assessment;
  const seasonConfirmed = !!row.seasonEvidence;

  const eligibility = [
    UG_ELIGIBILITY_LABELS[row.ugEligibility],
    row.location,
    ARRANGEMENT_LABELS[row.workArrangement].toLowerCase(),
    row.compensationText ? `pay posted ${row.compensationText}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-3">
      {/* ── The verdict itself ─────────────────────────────────────────── */}
      <div>
        <Field label="Sponsorship">
          <Sponsorship
            category={row.sponsorshipCategory}
            confidence={row.sponsorshipConfidence}
          />
        </Field>
        {a?.explanation ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{a.explanation}</p>
        ) : (
          <p className="mt-1.5 text-[13px] text-ink-3">
            Sponsorship has not been assessed for this posting yet.
          </p>
        )}
        {a?.conflictingInfo ? (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ochre">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em]">
              Conflicting
            </span>{" "}
            {a.conflictingInfo}
          </p>
        ) : null}
      </div>

      {/* ── Season check ───────────────────────────────────────────────── */}
      <Field label="Season">
        <span
          className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] ${
            seasonConfirmed ? TOKEN_TEXT.green : TOKEN_TEXT.ochre
          }`}
          title={row.seasonEvidence ?? "No evidence of the season was captured for this posting."}
        >
          {seasonWords(row.season)} {seasonConfirmed ? "confirmed" : "not confirmed"}
        </span>
      </Field>

      {/* ── The posting's own words ────────────────────────────────────── */}
      {a && a.matchedText.length > 0 ? (
        <div>
          {a.matchedText.map((q, i) => (
            <Quote
              key={i}
              source={
                i === a.matchedText.length - 1 ? (
                  <>
                    {a.evidenceSource ?? "posting text"}
                    {a.retrievedAt ? ` · retrieved ${fmtDateTimeTz(a.retrievedAt, timezone)}` : null}
                  </>
                ) : undefined
              }
            >
              “{q}”
            </Quote>
          ))}
        </div>
      ) : (
        <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
          No posting language quoted — the assessment ran without retrievable text.
        </p>
      )}

      {/* ── Eligibility facts ──────────────────────────────────────────── */}
      <div>
        <FieldLabel>Eligibility</FieldLabel>
        <p className="mt-1 text-[13px] leading-relaxed">
          <span className={TOKEN_TEXT[ugEligibilityColor(row.ugEligibility)]}>
            {eligibility[0]}
          </span>
          {eligibility.slice(1).map((part) => (
            <span key={part} className="text-ink-2">
              {" · "}
              {part}
            </span>
          ))}
          {row.deadline ? (
            <span className="text-ink-2">
              {" · apply by "}
              {row.deadlineIsEstimated ? (
                <Estimated>{fmtDateTz(row.deadline, timezone)}</Estimated>
              ) : (
                fmtDateTz(row.deadline, timezone)
              )}
            </span>
          ) : null}
        </p>
      </div>

      {/* ── The posting itself ─────────────────────────────────────────── */}
      {row.description ? (
        <div>
          <FieldLabel>Posting text</FieldLabel>
          <p className="mt-1 max-h-[132px] overflow-y-auto whitespace-pre-wrap border-l border-feint pl-2.5 text-[12.5px] leading-relaxed text-ink-2">
            {row.description}
          </p>
        </div>
      ) : (
        <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
          No description captured — open the posting to read it.
        </p>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
      {children}
    </span>
  );
}

/** `SPONSORSHIP · <value>` — the examiner's one-line heading form. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <span aria-hidden className="text-ink-3">
        ·
      </span>
      {children}
    </div>
  );
}
