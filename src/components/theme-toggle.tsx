"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;
const LABELS = { system: "System theme", light: "Light theme", dark: "Dark theme" } as const;

/** Same-tab change signal — the browser only fires "storage" in other tabs. */
const THEME_EVENT = "internship-scout:themechange";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

function getSnapshot(): Theme {
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : "system";
}

// The server (and hydration) render "system"; the inline script in layout.tsx
// has already applied any stored override to <html> pre-paint, and React swaps
// the label in right after hydration reads the real snapshot.
const getServerSnapshot = (): Theme => "system";

/**
 * Cycles system → light → dark. The choice persists in localStorage("theme")
 * and is applied pre-paint by the inline script in layout.tsx; here we mirror
 * it onto <html data-theme> and re-render via the localStorage-backed store.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Mirror the store onto <html> so a change made in another tab restyles
  // this one too, not just the toggle's label. (cycle() also writes it for
  // same-tab pre-effect immediacy.)
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    if (next === "system") {
      localStorage.removeItem("theme");
      delete document.documentElement.dataset.theme;
    } else {
      localStorage.setItem("theme", next);
      document.documentElement.dataset.theme = next;
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  const Icon = ICONS[theme];
  return (
    <button
      onClick={cycle}
      title={`${LABELS[theme]} — click to switch`}
      aria-label={`Theme: ${theme}. Click to switch.`}
      className="flex items-center gap-1.5 rounded border border-transparent px-1.5 py-1 text-ink-3 transition-colors duration-[120ms] ease-out hover:border-rule hover:text-ink"
    >
      {/* One of the two surviving pictograms (B5): a theme control has no
          notation of its own, and the sun/moon pair is genuinely universal. */}
      <Icon size={13} strokeWidth={1.8} />
      <span className="font-mono text-[10px] uppercase tracking-[0.08em]">{theme}</span>
    </button>
  );
}
