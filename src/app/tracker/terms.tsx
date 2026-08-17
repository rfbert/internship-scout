"use client";

import { useState, type ReactNode } from "react";
import type { ReferralStage } from "@prisma/client";
import { DossierPanel } from "@/components/register/dossier";
import { Estimated, Sponsorship } from "@/components/register/notation";
import { OutlineVerb } from "@/components/register/stamp";
import { Quote } from "@/components/register/well";
import { inputCls, selectCls } from "@/components/ui";
import { CONFIDENCE_LABELS, TOKEN_TEXT } from "@/lib/format";
import { fmtDateShortTz, fmtDateTz } from "@/lib/dates";
import {
  REFERRAL_STAGE_LABELS,
  REFERRAL_STAGE_ORDER,
  referralColor,
} from "./meta";
import type { TrackerRow } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   TERMS & SPONSORSHIP — what the record says, and what the posting said.

   The old drawer stated a sponsorship classification as a pair of badges and
   asked the reader to trust it. Here the classification is followed by the
   posting's OWN WORDS in a pulled quote: `sponsorshipLanguage` and
   `workAuthLanguage` are already captured verbatim at analysis time and were
   simply never rendered. Evidence beats assertion, and it costs no query.

   Contacts and referrals live here rather than in their own sections because
   a referral IS a term of the application — the mock's `REFERRAL  D. Ramírez ·
   referral received JUL 05` line is the summary, and the roster below it is
   where the writes happen.
   ══════════════════════════════════════════════════════════════════════════ */

const EMPTY_CONTACT = { name: "", position: "", relationship: "", email: "", linkedinUrl: "" };

/** One `LABEL   value` line. The label column is fixed so the values align. */
function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-[68px] shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
        {label}
      </dt>
      <dd className="min-w-0 text-[12.5px] leading-snug text-ink-2">{children}</dd>
    </div>
  );
}

export function Terms({
  row,
  timezone,
  busy,
  onAddContact,
  onTrackReferral,
  onReferralStage,
}: {
  row: TrackerRow;
  timezone: string;
  busy: boolean;
  onAddContact: (form: typeof EMPTY_CONTACT) => Promise<boolean>;
  onTrackReferral: (contactId: string) => void;
  onReferralStage: (referralId: string, stage: ReferralStage) => void;
}) {
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);

  const referredContactIds = new Set(row.referrals.map((r) => r.contactId));
  // The headline referral is the furthest-along one; the roster below carries
  // the rest.
  const leadReferral = row.referrals[0] ?? null;
  const site = [row.location, row.workArrangement !== "UNKNOWN" ? row.workArrangement.toLowerCase() : null]
    .filter(Boolean)
    .join(" · ");
  const evidence = row.sponsorshipLanguage ?? row.workAuthLanguage;

  return (
    <DossierPanel title="Terms & sponsorship">
      <dl className="space-y-[7px]">
        <Term label="Sponsors">
          <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
            <Sponsorship
              category={row.sponsorshipCategory}
              confidence={row.sponsorshipConfidence}
            />
            <span className="text-ink-3">
              · {CONFIDENCE_LABELS[row.sponsorshipConfidence ?? "UNKNOWN"].toLowerCase()}
            </span>
          </span>
        </Term>

        {site ? <Term label="Site">{site}</Term> : null}
        {row.durationText ? <Term label="Term">{row.durationText}</Term> : null}

        <Term label="Deadline">
          {row.deadline ? (
            row.deadlineIsEstimated ? (
              <Estimated>{fmtDateTz(row.deadline, timezone)}</Estimated>
            ) : (
              fmtDateTz(row.deadline, timezone)
            )
          ) : (
            <span className="text-ink-3">none on file</span>
          )}
        </Term>

        <Term label="Filed">{fmtDateTz(row.acceptedAt, timezone)}</Term>

        {leadReferral ? (
          <Term label="Referral">
            <span className="font-medium text-ink">{leadReferral.contactName}</span>
            <span className={TOKEN_TEXT[referralColor(leadReferral.stage)]}>
              {" · "}
              {REFERRAL_STAGE_LABELS[leadReferral.stage].toLowerCase()}
            </span>
            {leadReferral.receivedAt ? (
              <span className="font-mono text-[10.5px] uppercase text-ink-3">
                {" "}
                {fmtDateShortTz(leadReferral.receivedAt, timezone)}
              </span>
            ) : null}
          </Term>
        ) : null}

        {row.tags.length > 0 ? (
          <Term label="Tags">{row.tags.map((t) => t.name).join(" · ")}</Term>
        ) : null}
      </dl>

      {/* The posting's own words. `↗` replaces the lucide ExternalLink (B5). */}
      {evidence ? (
        <Quote source="posting · captured at analysis">{`“${evidence}”`}</Quote>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {row.applyUrl ?? row.postingUrl ? (
          <a
            href={(row.applyUrl ?? row.postingUrl) as string}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-blue underline-offset-2 hover:underline"
          >
            Open application <span aria-hidden>↗</span>
          </a>
        ) : null}
        {row.postingUrl && row.postingUrl !== row.applyUrl ? (
          <a
            href={row.postingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-blue underline-offset-2 hover:underline"
          >
            Original posting <span aria-hidden>↗</span>
          </a>
        ) : null}
      </div>

      {/* ── Roster ───────────────────────────────────────────────────────── */}
      <h4 className="mb-1.5 mt-3.5 border-t border-feint pt-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        Contacts
      </h4>
      {row.contacts.length === 0 ? (
        <p className="text-[12px] text-ink-3">
          No contacts linked — add a recruiter, alum, or referrer.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {row.contacts.map((c) => (
            <li key={c.linkId} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
              <span className="font-medium text-ink">{c.name}</span>
              {c.position ? <span className="text-ink-3">{c.position}</span> : null}
              {c.relationship ? <span className="text-ink-3">· {c.relationship}</span> : null}
              {c.email ? (
                <a className="text-blue underline-offset-2 hover:underline" href={`mailto:${c.email}`}>
                  {c.email}
                </a>
              ) : null}
              {c.linkedinUrl ? (
                <a
                  className="text-blue underline-offset-2 hover:underline"
                  href={c.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  LinkedIn <span aria-hidden>↗</span>
                </a>
              ) : null}
              {!referredContactIds.has(c.contactId) ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onTrackReferral(c.contactId)}
                  className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
                >
                  Track referral
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {contactOpen ? (
        <div className="mt-2 space-y-1.5 rounded border border-rule bg-inset p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <input
              autoFocus
              className={inputCls}
              placeholder="Name (required)"
              value={contactForm.name}
              onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              className={inputCls}
              placeholder="Position"
              value={contactForm.position}
              onChange={(e) => setContactForm((f) => ({ ...f, position: e.target.value }))}
            />
            <input
              className={inputCls}
              placeholder="Relationship (alum, recruiter…)"
              value={contactForm.relationship}
              onChange={(e) => setContactForm((f) => ({ ...f, relationship: e.target.value }))}
            />
            <input
              className={inputCls}
              placeholder="Email"
              value={contactForm.email}
              onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
            />
            <input
              className={`${inputCls} col-span-2`}
              placeholder="LinkedIn URL"
              value={contactForm.linkedinUrl}
              onChange={(e) => setContactForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
            />
          </div>
          <div className="flex gap-1.5">
            <OutlineVerb
              disabled={busy || !contactForm.name.trim()}
              onClick={() => {
                void onAddContact(contactForm).then((ok) => {
                  if (ok) {
                    setContactOpen(false);
                    setContactForm(EMPTY_CONTACT);
                  }
                });
              }}
            >
              Add contact
            </OutlineVerb>
            <OutlineVerb onClick={() => setContactOpen(false)}>Cancel</OutlineVerb>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setContactOpen(true)}
          className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          + Add contact
        </button>
      )}

      {row.referrals.length > 0 ? (
        <>
          <h4 className="mb-1.5 mt-3 border-t border-feint pt-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            Referrals
          </h4>
          <ul className="space-y-1.5">
            {row.referrals.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                <span className="font-medium text-ink">{r.contactName}</span>
                {r.requestedAt ? (
                  <span className="font-mono text-[10px] uppercase text-ink-3">
                    req {fmtDateShortTz(r.requestedAt, timezone)}
                  </span>
                ) : null}
                {r.receivedAt ? (
                  <span className="font-mono text-[10px] uppercase text-ink-3">
                    rcv {fmtDateShortTz(r.receivedAt, timezone)}
                  </span>
                ) : null}
                <select
                  className={`${selectCls} ml-auto py-0.5 text-[10.5px]`}
                  value={r.stage}
                  disabled={busy}
                  onChange={(e) => onReferralStage(r.id, e.target.value as ReferralStage)}
                  aria-label={`Referral stage for ${r.contactName}`}
                >
                  {REFERRAL_STAGE_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {REFERRAL_STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
                {r.notesText ? (
                  <p className="w-full text-[12px] text-ink-3">{r.notesText}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </DossierPanel>
  );
}
