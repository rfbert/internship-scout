import type { ReactNode } from "react";
import { TOKEN_TEXT, TOKEN_BORDER, type ColorToken } from "@/lib/format";
import { Figure } from "@/components/register/page-frame";

/* ══════════════════════════════════════════════════════════════════════════
   TIER 0 — the shared vocabulary, rewritten in place.

   Every export name here is unchanged: `btn`, `btnPrimary`, `btnDanger`,
   `inputCls` and `selectCls` are imported by ~20 files, so redefining those
   five strings restyles roughly 40% of the app without any page agent
   touching anything. The components keep their names and props and get
   Register bodies.

   The class-string constants below the components are the Register's
   typography kit — nine page agents share them so a column head is the same
   column head on all eleven pages.
   ══════════════════════════════════════════════════════════════════════════ */

/** The legacy five-tone vocabulary, mapped onto Register color tokens. */
type Tone = "accent" | "success" | "warning" | "danger" | "neutral";

const TONE_TOKEN: Record<Tone, ColorToken> = {
  accent: "blue",
  success: "green",
  warning: "ochre",
  danger: "carmine",
  neutral: "ink-3",
};

/**
 * A bordered mono-caps mark. Never a fill: in the Register, an inverted
 * background means "stamp" (a verdict), and a badge is not a verdict.
 */
export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const token = TONE_TOKEN[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${TOKEN_TEXT[token]} ${TOKEN_BORDER[token]}`}
    >
      {children}
    </span>
  );
}

/** Scores are numerals, not chips — mono, tabular, right-aligned in the cell. */
export function ScoreBadge({ score, tone }: { score: number | null | undefined; tone: Tone }) {
  if (score == null) return <span className="font-mono text-[11px] text-ink-3">—</span>;
  return (
    <span
      className={`font-mono text-[12.5px] font-semibold tabular-nums ${TOKEN_TEXT[TONE_TOKEN[tone]]}`}
    >
      {score}
    </span>
  );
}

/** A ruled sheet. No shadow — only a pulled record casts one. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded border border-rule bg-surface ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-rule px-3.5 py-2">
      <div className="min-w-0">
        <h2 className={sectionLabelCls}>{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[12px] text-ink-3">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * @deprecated Use `FigureStrip` + `Figure` from `@/components/register/page-frame`.
 * Kept so `/analytics` keeps compiling until P6 converts it; renders exactly one
 * `Figure` inside its own one-cell strip.
 */
export function StatTile({ label, value, hint, href }: { label: string; value: ReactNode; hint?: string; href?: string }) {
  return (
    <div className="flex h-full rounded border border-rule bg-surface">
      <Figure value={value} label={label} sub={hint} href={href} />
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        {title}
      </p>
      {hint ? <p className="max-w-sm text-[12.5px] text-ink-3">{hint}</p> : null}
      {action}
    </div>
  );
}

/**
 * THE ONE SENTENCE AN ERROR BOUNDARY PRINTS.
 *
 * `what` names the surface the reader is standing on, in the words the
 * masthead above the boundary is still showing them — the boundary replaces
 * the page, so its own eyebrow and title are gone and cannot be borrowed.
 *
 * `digest` is Next's own reference for the server-side stack. It is the ONLY
 * technical detail that belongs here. What used to be appended instead was
 * `error.message`, which is an exception string, not copy: on this app it is
 * usually Prisma's, and a reader whose dashboard failed was shown
 * "Invalid `prisma.deadline.findMany()` invocation" and asked to make sense
 * of it. The digest is short, quotable to a log search, and says nothing it
 * cannot back up.
 */
export function loadFailed(what: string, digest?: string): string {
  return `${what} failed to load${digest ? ` (ref ${digest})` : ""}.`;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded border border-carmine bg-inset px-3.5 py-2.5 text-[13px] text-carmine">
      <span className="mr-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]">
        Error
      </span>
      {message}
    </div>
  );
}

/**
 * @deprecated Use `PageFrame` from `@/components/register/page-frame` — it adds
 * the figure strip and the verb slot. Restyled here so unconverted pages match.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-4 pb-3">
      <div className="min-w-0">
        {eyebrow ? <p className={`${eyebrowCls} mb-1`}>{eyebrow}</p> : null}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13px] text-ink-2">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ManualBadge({ origin }: { origin?: "SCRAPED" | "MANUAL" }) {
  if (origin !== "MANUAL") return null;
  return (
    <Badge tone="accent" title="Added by you — exempt from automated rescoring and auto-rejection.">
      MANUAL
    </Badge>
  );
}

export function SampleBadge({ isSample }: { isSample?: boolean }) {
  if (!isSample) return null;
  return (
    /* The tooltip used to send the reader to a terminal (`npm run
       db:clear-samples`) for something Settings does with one button — and a
       reader looking at a badge in a browser may not have a terminal open, or
       a checkout. The button is named here exactly as it is labelled there. */
    <Badge
      tone="warning"
      title="Seed data for illustration — not a real posting. Settings → Danger zone → Clear sample data removes it."
    >
      SAMPLE
    </Badge>
  );
}

/* ── Verbs ─────────────────────────────────────────────────────────────────
   Primary verbs are INK STAMPS, not accent fills: --ink background, --paper
   text, self-inverting across themes. Accent color never fills a button;
   carmine only ever outlines the destructive one. */

export const btn =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-rule bg-surface px-[11px] py-[6px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-2 transition-colors duration-[120ms] ease-out hover:border-ink-3 hover:text-ink disabled:pointer-events-none disabled:opacity-50";

export const btnPrimary =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-ink bg-ink px-[11px] py-[6px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-paper transition-opacity duration-[120ms] ease-out hover:opacity-90 disabled:pointer-events-none disabled:opacity-50";

export const btnDanger =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-carmine bg-surface px-[11px] py-[6px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-carmine transition-colors duration-[120ms] ease-out hover:bg-inset disabled:pointer-events-none disabled:opacity-50";

export const inputCls =
  "rounded border border-rule bg-surface px-2 py-1.5 text-[13px] outline-none placeholder:text-ink-3 focus:border-blue";

export const selectCls =
  "rounded border border-rule bg-surface px-2 py-1.5 font-mono text-[11.5px] outline-none focus:border-blue";

/* ── The typography kit ────────────────────────────────────────────────────
   The Register's type scale, as class strings, so nine agents render the same
   column head. Floors from B1: nothing below 10px; mono caps below 11px never
   lighter than --ink-2. */

/** Page/section eyebrow: `REGISTER OF APPLICATIONS · SUMMER 2027 · F-1 AWARE`. */
export const eyebrowCls =
  "font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-3";

/**
 * One labelled field of a worksheet: mono-caps eyebrow over the control.
 *
 * Lives here rather than beside any one form because every form in the app
 * labels its controls the same way — a sans sentence-case label a pixel from a
 * mono-caps leader-dot row is the single loudest "two people built this" tell
 * the design review found. `hint` prints under the control in the same mono,
 * for the one-line caveats that used to be sentences nobody read.
 */
export function Field({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className={`${eyebrowCls} mb-1 block`}>{label}</span>
      {children}
      {hint ? <span className="mt-1 block font-mono text-[10px] text-ink-3">{hint}</span> : null}
    </label>
  );
}

/** Ledger column head: `NO.  COMPANY — ROLE  STAGE …`. */
export const colHeadCls =
  "font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3 whitespace-nowrap";

/** Section-rule label: `I · SCOUTING`, `EVIDENCE & EXAMINER'S NOTES`. */
export const sectionLabelCls =
  "font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-2";

/** A data cell: numbers, dates, codes. Mono, tabular, one line, ellipsised. */
export const cellMonoCls =
  "font-mono text-[11px] tabular-nums text-ink-2 whitespace-nowrap overflow-hidden text-ellipsis";

/** A row title: `Anthropic — AI Product Intern, Claude Platform`. */
export const rowTitleCls =
  "text-[13px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis";

/** The de-emphasised half of a row title (the role after the em dash). */
export const rowRoleCls = "font-normal text-ink-2";

/** Footnote legend / keycap strip text. */
export const legendCls = "font-mono text-[11px] tracking-[0.04em] text-ink-3";

/** Bottom-center status toast with optional actions (e.g. Undo). */
export function Toast({
  message,
  actions,
  onDismiss,
}: {
  message: string;
  actions?: Array<{ label: string; onClick: () => void }>;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="fixed bottom-[calc(var(--footnote-h)+12px)] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded border border-rule bg-surface px-4 py-2.5 text-[13px] shadow-[var(--shadow-pulled)]"
    >
      <span>{message}</span>
      {actions?.map((a) => (
        <button
          key={a.label}
          onClick={a.onClick}
          className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-blue underline-offset-2 hover:underline"
        >
          {a.label}
        </button>
      ))}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="font-mono text-[13px] leading-none text-ink-3 hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}
