"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

/* ══════════════════════════════════════════════════════════════════════════
   THE MASTHEAD (spec A4)

   The sidebar is abolished — it spent 224px of every viewport on eleven links.
   The masthead carries all of them in 46px of height the page head needed
   anyway, and the returned width is the entire density argument.

   Five primary destinations are always visible; the rest ride a `MORE ▾`
   drawer at narrow widths and sit inline at 1460px and up. That is a
   CSS-BREAKPOINT DECISION — both sets are always in the DOM, with the two
   variants below deciding which one paints. No JS width measurement, no
   ResizeObserver: no hydration mismatch and no layout thrash.

   The masthead never wraps and never horizontal-scrolls.

   WHY THIS IS `min-[1460px]:` AND NOT THE `nav:` TOKEN IT USED TO BE.
   `--breakpoint-nav: 1360px` was sized for eleven links and was
   ALREADY 18px short of them: measured in Chrome at exactly 1360px, the inline
   set needs 790px of a 772px track, so the last link clipped. Adding REPORTS (a
   twelfth, 64px + 2px gap) took the shortfall to 84px. The inline set needs
   856px, the non-nav furniture (logo, datestamp, theme toggle, gutters) takes a
   constant 578px, so the switch cannot happen below ~1444px; 1460 is that with
   a little slack. The literal lives here rather than in the token because the
   number is a fact about THIS component's contents — it has to move every time
   a destination is added, and the two files were already out of step. The
   token has since been deleted rather than corrected: nothing read it, and a
   second unread copy of a number is not a source of truth, it is a decoy.

   The number is written out as literal `min-[1460px]:` class strings in two
   places below — Tailwind scans source text and cannot build a variant from a
   runtime constant, so the two must be edited together. Adding a thirteenth
   destination means re-measuring and raising both.
   ══════════════════════════════════════════════════════════════════════════ */

const PRIMARY = [
  { href: "/", label: "Dashboard" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/review", label: "Review" },
  { href: "/tracker", label: "Tracker" },
  { href: "/companies", label: "Companies" },
] as const;

/**
 * The secondary set. `Reports` sits immediately after `Runs` because they are
 * the two halves of the same daily record — `/runs` is what the agent
 * collected, `/reports` is the digest it wrote about it — and the drawer is
 * where an ops surface belongs (A4). It does not go in the primary row: the
 * five there are the daily working set, and adding a sixth is what the
 * breakpoint decision below exists to avoid.
 */
const OVERFLOW = [
  { href: "/calendar", label: "Calendar" },
  { href: "/analytics", label: "Analytics" },
  { href: "/runs", label: "Runs" },
  { href: "/reports", label: "Reports" },
  { href: "/sources", label: "Sources" },
  { href: "/settings", label: "Settings" },
  { href: "/archive", label: "Archive" },
] as const;

/** Exact for `/`, prefix otherwise — so `/companies/[id]` lights COMPANIES. */
const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

/**
 * Everything about a nav link EXCEPT its colour.
 *
 * The colour is deliberately absent. This used to carry `text-ink-3` with the
 * active state appending `text-ink`, which does not work: both are plain
 * utilities in the same namespace at the same specificity, so the winner is
 * Tailwind's emission order — alphabetical — and `text-ink` loses to
 * `text-ink-3` every time. The current page rendered in byte-identical ink to
 * every other link (measured: rgb(154,152,144) for both), leaving the carmine
 * underline as the only signal, while a merely HOVERED link went full `--ink`
 * and out-shouted the page you were actually on. Hover worked only because a
 * variant outranks a base utility.
 *
 * So exactly one `text-*` reaches the element, chosen in the ternary below.
 * The same trap cost this codebase a FAILED agent run printed in the ink of a
 * successful one; the fix there was the same — make the conflict unwritable.
 */
const linkCls =
  "flex items-center whitespace-nowrap border-b-2 border-transparent px-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] transition-colors duration-[120ms] ease-out";

/** The one place a nav link's colour is decided. */
const linkTone = (active: boolean) =>
  active ? "border-b-carmine text-ink" : "text-ink-3 hover:text-ink";

export function Masthead() {
  const pathname = usePathname();
  const overflowActive = OVERFLOW.some((n) => isActive(pathname, n.href));

  return (
    <header className="register-masthead sticky top-0 z-40 border-b border-rule bg-paper">
      <div className="mx-auto flex h-[46px] max-w-[1800px] items-stretch gap-4 px-[var(--gutter)] pl-[calc(var(--margin-rule)+var(--gutter))]">
        <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap">
          <span
            aria-hidden
            className="inline-flex size-[22px] items-center justify-center rounded border-[1.5px] border-ink font-mono text-[9px] font-bold leading-none tracking-[0.08em]"
          >
            IS
          </span>
          <span className="text-[14.5px] font-bold tracking-[0.01em]">Internship Scout</span>
          <span className="rounded border border-rule px-[5px] pb-px pt-[3px] font-mono text-[10px] font-medium leading-none tracking-[0.1em] text-ink-3 max-[1100px]:hidden">
            S27 · REGISTER
          </span>
        </Link>

        <nav aria-label="Primary" className="flex min-w-0 items-stretch gap-0.5">
          {PRIMARY.map((n) => (
            <NavLink key={n.href} {...n} active={isActive(pathname, n.href)} />
          ))}

          {/* Inline at ≥ INLINE_AT … */}
          {OVERFLOW.map((n) => (
            <NavLink
              key={n.href}
              {...n}
              active={isActive(pathname, n.href)}
              className="hidden min-[1460px]:flex"
            />
          ))}

          {/* … and behind one trigger below it. */}
          <MoreMenu pathname={pathname} active={overflowActive} />
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Datestamp />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  label,
  active,
  className = "",
}: {
  href: string;
  label: string;
  active: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${linkCls} ${linkTone(active)} ${className}`}
    >
      {label}
    </Link>
  );
}

function MoreMenu({ pathname, active }: { pathname: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemsRef = useRef<Array<HTMLAnchorElement | null>>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      if (returnFocus) triggerRef.current?.focus();
    },
    [],
  );

  // Escape closes and returns focus to the trigger; a click outside just closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);

  const focusItem = (i: number) => {
    const n = OVERFLOW.length;
    itemsRef.current[((i % n) + n) % n]?.focus();
  };

  return (
    <div ref={wrapRef} className="relative flex items-stretch min-[1460px]:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusItem(0));
          }
        }}
        className={`${linkCls} ${linkTone(active)}`}
      >
        More ▾
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="More destinations"
          className="absolute right-0 top-[46px] z-50 min-w-[176px] rounded border border-rule bg-surface py-1 shadow-[var(--shadow-pulled)]"
        >
          {OVERFLOW.map((n, i) => (
            <Link
              key={n.href}
              href={n.href}
              role="menuitem"
              ref={(el) => {
                itemsRef.current[i] = el;
              }}
              aria-current={isActive(pathname, n.href) ? "page" : undefined}
              onClick={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  focusItem(i + 1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  focusItem(i - 1);
                } else if (e.key === "Home") {
                  e.preventDefault();
                  focusItem(0);
                } else if (e.key === "End") {
                  e.preventDefault();
                  focusItem(OVERFLOW.length - 1);
                }
              }}
              className={`block px-3 py-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] hover:bg-sel ${
                isActive(pathname, n.href) ? "text-ink" : "text-ink-2"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── The right-hand readout ────────────────────────────────────────────────
   Resolved on the CLIENT: a server-rendered clock is a hydration mismatch, and
   `useSyncExternalStore` with a null server snapshot is the sanctioned way to
   say "this value exists only in the browser" — React renders the server
   snapshot during hydration and swaps in the real one immediately after, with
   no setState inside an effect. Same pattern as ThemeToggle.

   WHAT THIS DATE IS, EXACTLY. It is the BROWSER's calendar day, and it is the
   only date in the app that is: every other date — /review's eyebrow, the
   docket, the diary, every ledger row — renders in the stored
   `UserPreference.timezone` (see src/lib/dates.ts). So on a machine whose zone
   differs from the saved one, this readout can print a different day than the
   page under it, and this comment is not going to claim otherwise. Removing
   that divergence means passing the stored zone down from the root layout,
   which owns the `readUiPrefs()` call; until that happens the guarantee here is
   narrower than it looks — the stamp is the reader's wall-clock day, nothing
   more.

   WHAT IT IS NOT ANY MORE: stale. This memoised on
   `Math.floor(Date.now() / 86_400_000)`, which is a UTC day ordinal, while the
   value it cached was `toLocaleDateString` in the browser's zone. West of
   Greenwich those roll at different moments — at UTC-7 the key turns over at
   17:00 local — so a tab opened between local midnight and 17:00 kept serving
   the PREVIOUS day's string on every re-render, for up to 17 hours, from a
   cache whose key insisted it was fresh. A cache key must be computed from the
   same clock as the value it guards; here the value is its own key, so there is
   nothing left to keep in step.

   `getSnapshot` still has to be stable, and it is: it returns a string, React
   compares snapshots with `Object.is`, and equal strings are `Object.is`-equal
   whatever built them. The subscription below then handles the one case a
   render-time read cannot — a tab left open across midnight.

   Below ~1100px the readout drops out entirely rather than wrapping the
   masthead (A4). */

function todayStamp(): string {
  return new Date()
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric",
    })
    .replace(/,/g, "")
    .toUpperCase();
}

/**
 * Notify at the browser's next midnight, then every midnight after. `setHours`
 * takes local time, so this lands on the reader's own day boundary — the same
 * boundary the printed value turns on — rather than on UTC's. A long-lived tab
 * is exactly the case the old day-ordinal cache got wrong, so leaving it to
 * "some later re-render" would only shorten the staleness, not end it.
 */
const subscribeToMidnight = (onStoreChange: () => void) => {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 100);
    timer = setTimeout(() => {
      onStoreChange();
      schedule();
    }, nextMidnight.getTime() - now.getTime());
  };
  schedule();
  return () => clearTimeout(timer);
};

const noStampOnServer = () => null;

function Datestamp() {
  const stamp = useSyncExternalStore(subscribeToMidnight, todayStamp, noStampOnServer);

  return (
    <span className="hidden whitespace-nowrap font-mono text-[10.5px] font-medium tracking-[0.06em] text-ink-2 min-[1100px]:inline">
      {stamp ?? " "}
    </span>
  );
}
