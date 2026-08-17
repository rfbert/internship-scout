import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { prisma } from "@/lib/prisma";

/** Single-user app: every API route resolves the one seeded user. */
export async function currentUser() {
  return prisma.user.findFirstOrThrow();
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/* ── Naming a field back to the reader ─────────────────────────────────────
   A Zod issue path is a REQUEST-BODY key, which is a database column name in
   all but a handful of cases. Printed raw it produced sentences like

     Validation failed: appliedAt: Invalid ISO date string

   for a reader who had just typed into a box labelled "Applied on" and had
   never seen the word `appliedAt` anywhere in the app. The map below is the
   translation back: every key a form in this app can submit, spelled the way
   the control that submits it is spelled. Add a row whenever a form gains a
   field — an unmapped key falls back to its own name, which is the old
   behavior and is never worse than it was. */
const FIELD_LABELS: Record<string, string> = {
  // /tracker · details worksheet
  priority: "Priority",
  followUpAt: "Follow-up date",
  appliedAt: "Applied on",
  nextAction: "Next action",
  recruiterName: "Recruiter",
  hiringManagerName: "Hiring manager",
  contactEmail: "Contact email",
  contactLinkedin: "Contact LinkedIn",
  referralStatus: "Referral status",
  finalOutcome: "Final outcome",
  rejectionReason: "Rejection reason",
  // /tracker · next action
  stage: "Stage",
  changedAt: "Transition date",
  // /calendar · deadline worksheet
  kind: "Kind",
  dueAt: "Due date",
  isEstimated: "Estimated",
  listingId: "Link to listing",
  applicationId: "Link to application",
  completedAt: "Completed",
  // /sources · URL import, /tracker · new record
  companyName: "Company",
  title: "Title",
  locationRaw: "Location",
  postingUrl: "Posting URL",
  applyUrl: "Apply URL",
  compensationText: "Compensation",
  description: "Description",
  deadline: "Application deadline",
  deadlineIsEstimated: "Estimated deadline",
  note: "Notes",
  body: "Note",
  url: "Posting URL",
  // /companies · overview and evidence worksheets
  priorityScore: "Priority",
  industry: "Industry",
  sizeRange: "Size range",
  reputationNote: "Reputation note",
  aiRelevance: "AI relevance",
  internshipProgramNote: "Internship program",
  reliability: "Reliability",
  sourceName: "Source name",
  sourceUrl: "Source URL",
  evidenceDate: "Date",
  summary: "Summary",
  // /settings
  scoringWeights: "Scoring weights",
  reviewThresholdBand: "Review cut",
  notationMode: "Notation",
  preferredArrangement: "Preferred arrangement",
  timezone: "IANA timezone",
  graduationDate: "Graduation date",
  targetSeason: "Target cycle",
  sponsorshipRequired: "Needs sponsorship",
  roleAlignmentScores: "Role priorities",
  bandThresholds: "Band thresholds",
  emailEnabled: "Send the daily report email",
  emailOnEmptyRuns: "Send a brief no-news email",
  emailTo: "Send to",
  // referrals and contacts
  name: "Name",
  position: "Position",
  relationship: "Relationship",
  email: "Email",
  linkedinUrl: "LinkedIn URL",
  discardReasonKey: "Discard reason",
  min: "Minimum score",
};

/**
 * Zod's own generic complaints, in the reader's words. Only the three a form
 * in this app can actually produce — everything else in the schemas already
 * carries a written message ("Title is required"), and those are left alone.
 */
const PLAIN_ISSUE: Array<[RegExp, string]> = [
  [/^invalid (iso )?date/i, "must be a date"],
  [/^invalid email/i, "must be an email address"],
  [/^invalid url/i, "must be a web address"],
];

/** `["scoringWeights", "careerValue"]` → `Scoring weights · careerValue`. */
function issueLine(path: PropertyKey[], message: string): string {
  const label = path
    .map((seg, i) =>
      typeof seg === "string" ? (i === 0 ? (FIELD_LABELS[seg] ?? seg) : seg) : `#${String(seg) }`
    )
    .join(" · ");
  const plain = PLAIN_ISSUE.find(([rx]) => rx.test(message))?.[1] ?? message;
  return label ? `${label}: ${plain}` : plain;
}

/** The one sentence a rejected form gets back, on every route. */
export function validationMessage(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  return `Not saved — ${issues.map((i) => issueLine(i.path, i.message)).join("; ")}`;
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  // Strict JSON only: blocks text/plain form smuggling (CSRF hardening).
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError("Content-Type must be application/json", 415);
  }
  const json = await req.json().catch(() => {
    throw new ApiError("Invalid JSON body", 400);
  });
  try {
    return schema.parse(json);
  } catch (e) {
    if (e instanceof ZodError) {
      throw new ApiError(validationMessage(e.issues), 422);
    }
    throw e;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

/** Wrap a route handler with uniform error handling. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return fail(e.message, e.status);
      console.error(e);
      // Not "Internal error". The reader is holding a form that did not save
      // and needs to know two things: nothing they typed was lost, and what
      // to do next. The server log is where the cause is, and saying so is
      // the difference between a dead end and a next step.
      return fail(
        "The server could not finish this request. Nothing was saved — try again, and check the server log if it keeps failing.",
        500
      );
    }
  };
}
