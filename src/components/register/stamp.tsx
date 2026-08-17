import type { ReactNode } from "react";
import Link from "next/link";
import { Keycap } from "./keycap";

/**
 * Verbs.
 *
 * Primary verbs are INK STAMPS, not accent fills: `--ink` background, `--paper`
 * text, self-inverting across themes. Accent color NEVER fills a button —
 * carmine only ever outlines the destructive one. That rule is what keeps the
 * page from looking like a dashboard.
 *
 * The optional `keycap` prints the shortcut inside the verb; it is
 * `aria-hidden`, so the button's accessible name still begins with its own word
 * (D1 — the e2e accept matcher depends on it).
 */

export interface VerbProps {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  /** A single printed key, e.g. `"A"`. Rendered `aria-hidden`. */
  keycap?: string;
  className?: string;
  title?: string;
}

const base =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded px-[11px] py-[6px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] transition-colors duration-[120ms] ease-out disabled:pointer-events-none disabled:opacity-50";

const VARIANT = {
  /** The page's one authoritative verb. */
  stamp: `${base} border border-ink bg-ink text-paper hover:opacity-90`,
  /** Everything else. */
  outline: `${base} border border-rule bg-surface text-ink-2 hover:border-ink-3 hover:text-ink`,
  /** Destructive. Outlined in carmine — never filled. */
  danger: `${base} border border-carmine bg-surface text-carmine hover:bg-inset`,
} as const;

function Verb({
  variant,
  children,
  onClick,
  href,
  disabled,
  keycap,
  className = "",
  title,
}: VerbProps & { variant: keyof typeof VARIANT }) {
  const cls = `${VARIANT[variant]} ${className}`;
  const inner = (
    <>
      {keycap ? <Keycap>{keycap}</Keycap> : null}
      {children}
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={cls} title={title} onClick={onClick}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls} title={title}>
      {inner}
    </button>
  );
}

export function Stamp(props: VerbProps) {
  return <Verb variant="stamp" {...props} />;
}

export function OutlineVerb(props: VerbProps) {
  return <Verb variant="outline" {...props} />;
}

export function DangerVerb(props: VerbProps) {
  return <Verb variant="danger" {...props} />;
}

/**
 * An ink stamp that is a navigation, not an action — always renders an
 * `<a>`, so middle-click and "open in new tab" work.
 */
export function StampLink({
  href,
  children,
  keycap,
  className = "",
  title,
  external = false,
}: Omit<VerbProps, "href" | "onClick" | "disabled"> & {
  href: string;
  /** Off-site: adds the mono `↗` glyph and the usual rel guard. */
  external?: boolean;
}) {
  const inner = (
    <>
      {keycap ? <Keycap>{keycap}</Keycap> : null}
      {children}
      {external ? <span aria-hidden>↗</span> : null}
    </>
  );
  const cls = `${VARIANT.outline} ${className}`;

  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls} title={title}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls} title={title}>
      {inner}
    </Link>
  );
}
