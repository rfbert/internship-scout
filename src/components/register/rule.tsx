import type { ReactNode } from "react";
import { TOKEN_BG, TOKEN_TEXT, type ColorToken } from "@/lib/format";
import { eyebrowCls } from "@/components/ui";

/**
 * Rules — the Register's structural marks. A rule is not decoration: it says
 * "a new section of the same ledger starts here", which is why sections never
 * become cards.
 */

/**
 * A 28px section head: group tick, roman folio, mono-caps label, right-hand
 * summary. Collapsible sections (the tracker's terminal group V ships
 * collapsed) get `collapsed` + `onToggle` and carry `aria-expanded` (D7).
 */
export function SectionRule({
  label,
  roman,
  tick,
  right,
  collapsed,
  onToggle,
}: {
  label: string;
  /** `I`–`V` for stage groups. Printed alongside the word, never instead of it. */
  roman?: string;
  tick?: ColorToken;
  right?: ReactNode;
  /** Omit for a static rule; pass a boolean to make the head a disclosure. */
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const inner = (
    <>
      {tick ? <span aria-hidden className={`w-[3px] self-stretch ${TOKEN_BG[tick]}`} /> : null}
      {roman ? (
        <span className="w-[26px] shrink-0 text-center font-mono text-[10.5px] font-semibold text-ink-3">
          {roman}
        </span>
      ) : null}
      <span
        className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] ${
          collapsed ? "text-ink-3" : "text-ink-2"
        } ${roman ? "" : "pl-3.5"}`}
      >
        {label}
      </span>
      {right ? (
        <span className="ml-auto pr-3.5 font-mono text-[10.5px] text-ink-3">{right}</span>
      ) : null}
    </>
  );

  const cls = `flex h-[28px] items-center gap-2.5 border-b border-t border-feint ${
    collapsed ? "bg-inset" : "bg-surface-2"
  }`;

  if (!onToggle) {
    return <div className={cls}>{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className={`${cls} w-full text-left transition-colors duration-[120ms] ease-out hover:bg-sel`}
    >
      {inner}
    </button>
  );
}

/**
 * The accountant's total rule: 1px over, 3px double under. Used above `ON FILE`
 * in the census and under the assessment ledger's `SCORE`.
 */
export function DoubleRule({ children }: { children?: ReactNode }) {
  return (
    <div className="mt-1.5 flex items-baseline gap-2 border-b-[3px] border-t border-double border-t-ink-2 border-b-ink-2 py-1.5 font-mono text-[11px] font-semibold">
      {children}
    </div>
  );
}

/**
 * A dot-leader row — label, dotted leader, value. The census's 14 stages, the
 * dossier's terms, any two-column list that has to be readable across a gap.
 *
 * The LABEL is a row label, which in this type scale is the same job a column
 * head does — so it wears the eyebrow / column-head register, byte-identical
 * to what `Field` prints beside it in the `/companies/[id]` split. It used to
 * be 11px/400/+0.04em, which is the FOOTNOTE LEGEND register (`legendCls`) — a
 * different role wearing a footnote's clothes, and the two panels of one
 * dossier disagreeing about what a label looks like.
 *
 * "Byte-identical" IS the claim, so the label now imports `eyebrowCls` and
 * cannot drift from it. Spelling the metrics out here a second time is what
 * broke it before: the copy set size, weight, case and tracking but no colour,
 * and inherited `--ink-2` from the `<li>` while `Field` sets `--ink-3`. Four
 * axes matched and the most visible one did not — and because the `<li>` also
 * dims to `--ink-3` when `muted`, a label changed colour depending on whether
 * its own value happened to be zero. A label is a label; only the VALUE is
 * allowed to react to the value.
 *
 * The VALUE stays 11px mono tabular: that is the data-cell register, and a
 * value is data.
 */
export function DotLeader({
  label,
  value,
  tick,
  muted = false,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  tick?: ColorToken;
  /** A zero row: dimmed, but the `0` still prints. */
  muted?: boolean;
  title?: string;
}) {
  return (
    <li
      title={title}
      className={`flex items-baseline gap-2 py-[3px] font-mono text-[11px] ${
        muted ? "text-ink-3" : "text-ink-2"
      }`}
    >
      {tick ? (
        <span aria-hidden className={`size-2 shrink-0 self-center rounded-none ${TOKEN_BG[tick]}`} />
      ) : null}
      <span className={`${eyebrowCls} whitespace-nowrap`}>{label}</span>
      <span aria-hidden className="-translate-y-[3px] flex-1 border-b border-dotted border-rule" />
      <span className={`font-semibold tabular-nums ${muted ? "font-normal text-ink-3" : "text-ink"}`}>
        {value}
      </span>
    </li>
  );
}

/** A hairline between blocks inside one section. */
export function HairRule({ tone = "feint" }: { tone?: "feint" | "rule" | ColorToken }) {
  const cls =
    tone === "feint"
      ? "border-feint"
      : tone === "rule"
        ? "border-rule"
        : `border-current ${TOKEN_TEXT[tone]}`;
  return <hr className={`border-t ${cls}`} />;
}
