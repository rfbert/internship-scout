#!/usr/bin/env node
/**
 * The Register's contrast gate (spec A10 / D3).
 *
 * Parses src/app/globals.css as the SINGLE SOURCE OF TRUTH — no duplicated
 * palette lives in this file — and asserts WCAG 2.x AA (4.5:1) for every
 * foreground/background pair the design actually uses, in both themes.
 *
 * Why 4.5 for everything and never the 3:1 large-text allowance: the Register's
 * largest text is 28px/600 (21pt), below the 24pt / 18.66px-bold threshold, and
 * every mono caps run is 10–11px. Nothing in this design qualifies as "large".
 *
 * Zero dependencies. Exits 1 with a failure list if any assertion breaks.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS_PATH = join(ROOT, "src/app/globals.css");

// ── Parse ────────────────────────────────────────────────────────────────────

/**
 * Reads `--name: #hex;` and `--name: light-dark(#L, #D);` declarations.
 * Returns { light: Map<name,hex>, dark: Map<name,hex> }. A plain hex is
 * theme-invariant and lands in both maps (that is exactly what the well tokens
 * are: an oscilloscope screen is black in a lit lab too).
 */
function parseTokens(css) {
  const light = new Map();
  const dark = new Map();

  const lightDark = /--([a-z0-9-]+)\s*:\s*light-dark\(\s*(#[0-9a-fA-F]{3,8})\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g;
  for (const m of css.matchAll(lightDark)) {
    light.set(m[1], m[2]);
    dark.set(m[1], m[3]);
  }

  const flat = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
  for (const m of css.matchAll(flat)) {
    // light-dark() values are already captured above and never match here
    // (the value does not start with `#`).
    if (!light.has(m[1])) light.set(m[1], m[2]);
    if (!dark.has(m[1])) dark.set(m[1], m[2]);
  }

  return { light, dark };
}

// ── WCAG 2.x relative luminance ──────────────────────────────────────────────

function toRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const round2 = (n) => Math.round(n * 100) / 100;

// ── The matrix ───────────────────────────────────────────────────────────────

const TEXT_FG = ["ink", "ink-2", "ink-3", "carmine", "blue", "green", "ochre"];
const TEXT_BG = ["paper", "surface", "surface-2", "inset", "sel"];

const WELL_FG = [
  "well-fg",
  "well-carmine",
  "well-blue",
  "well-green",
  "well-ochre",
  "well-muted",
  "well-cursor",
];

/**
 * Decorative allow-list — named, with a reason each, so an omission shows up in
 * a diff as a deliberate decision rather than a forgotten check. Color is never
 * the sole carrier of meaning anywhere in this design (D3).
 */
const DECORATIVE = {
  rule: "structural separator — table/section borders, never text",
  feint: "row rule — the feint blue of ledger paper, never text",
  "well-grid": "sub-threshold graticule inside instrument wells",
  "well-rule": "well divider — structural, never text",
  "scroll-shade":
    "fold shade at a scrolling ledger's edge — an affordance, never text, and " +
    "the content it hints at is reachable without seeing it",
};

const REQUIRED_TOKENS = [
  ...TEXT_FG,
  ...TEXT_BG,
  ...WELL_FG,
  ...Object.keys(DECORATIVE),
  "well-bg",
  "well-edge",
  "on-accent",
];

// ── Run ──────────────────────────────────────────────────────────────────────

const css = readFileSync(CSS_PATH, "utf8");
const { light, dark } = parseTokens(css);

const failures = [];
const rows = [];

function check(label, theme, fgName, bgName, fgHex, bgHex, min) {
  const r = round2(ratio(fgHex, bgHex));
  const pass = r >= min;
  rows.push({ label, theme, pair: `${fgName} on ${bgName}`, ratio: r, min, pass });
  if (!pass) {
    failures.push(`${label} · ${theme}: ${fgName} (${fgHex}) on ${bgName} (${bgHex}) = ${r}:1, needs ${min}:1`);
  }
}

// 1 · Token presence. A typo'd or deleted token must fail the build rather than
//     silently resolving to `initial`.
for (const name of REQUIRED_TOKENS) {
  if (!light.has(name)) failures.push(`Missing token --${name} (light) in src/app/globals.css`);
  if (!dark.has(name)) failures.push(`Missing token --${name} (dark) in src/app/globals.css`);
}

if (failures.length === 0) {
  // 2 · Text pairs, both themes.
  for (const [theme, map] of [["light", light], ["dark", dark]]) {
    for (const fg of TEXT_FG) {
      for (const bg of TEXT_BG) {
        check("Text", theme, fg, bg, map.get(fg), map.get(bg), 4.5);
      }
    }
  }

  // 3 · Ink stamps — --paper on --ink (primary verbs are ink stamps, not fills).
  for (const [theme, map] of [["light", light], ["dark", dark]]) {
    check("Ink stamp", theme, "paper", "ink", map.get("paper"), map.get("ink"), 4.5);
  }

  // 4 · Focus chrome. --on-accent on --blue is text; --blue against the two page
  //     surfaces is a non-text UI indicator (3:1).
  for (const [theme, map] of [["light", light], ["dark", dark]]) {
    check("Chrome", theme, "on-accent", "blue", map.get("on-accent"), map.get("blue"), 4.5);
    check("Focus ring", theme, "blue", "paper", map.get("blue"), map.get("paper"), 3);
    check("Focus ring", theme, "blue", "surface", map.get("blue"), map.get("surface"), 3);
  }

  // 5 · Wells — theme-invariant, so a single check.
  for (const fg of WELL_FG) {
    check("Well", "both", fg, "well-bg", light.get(fg), light.get("well-bg"), 4.5);
  }

  // 6 · Can you see where the well ENDS? 3:1, per WCAG 1.4.11 for a boundary
  //     that carries meaning — and here it does: an instrument well is a
  //     different kind of surface from open page, and a reader who cannot find
  //     its edge cannot tell the data layer from the document.
  //
  //     What is asserted is the boundary, not any one token, because the two
  //     themes draw it with different instruments. In day the FILL does it —
  //     a near-black panel on ledger paper is a 16:1 step and the border is a
  //     formality at 1.47:1. In night the fill says nothing (#14171B on
  //     #17191D is 1.02:1) and the edge is the whole story. So the measure is
  //     the better of the two, and a theme may satisfy it either way. Checking
  //     the border alone would fail day for a boundary that is in fact the
  //     most obvious thing on the page.
  //
  //     This regressed once, silently: the edge inherited --rule, night landed
  //     at max(1.02, 1.64) = 1.64:1, and the well dissolved into the page. No
  //     check caught it because no check existed.
  for (const [theme, map] of [["light", light], ["dark", dark]]) {
    const viaFill = ratio(map.get("well-bg"), map.get("paper"));
    const viaEdge = ratio(map.get("well-edge"), map.get("paper"));
    const [drawnBy, best] = viaFill >= viaEdge ? ["fill", viaFill] : ["edge", viaEdge];
    const r = round2(best);
    const pass = r >= 3;
    rows.push({ label: "Well boundary", theme, pair: `well ${drawnBy} on paper`, ratio: r, min: 3, pass });
    if (!pass) {
      failures.push(
        `Well boundary · ${theme}: the well is indistinguishable from the page — ` +
          `fill ${round2(viaFill)}:1, edge ${round2(viaEdge)}:1, best ${r}:1, needs 3:1`
      );
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

const pad = (s, n) => String(s).padEnd(n);
console.log("Contrast (WCAG AA) — parsed from src/app/globals.css\n");
console.log(`${pad("check", 15)}${pad("theme", 7)}${pad("pair", 30)}${pad("ratio", 9)}min`);
console.log("-".repeat(64));
for (const r of rows) {
  console.log(
    `${pad(r.label, 15)}${pad(r.theme, 7)}${pad(r.pair, 30)}${pad(`${r.ratio.toFixed(2)}:1`, 9)}${r.min}  ${r.pass ? "OK" : "FAIL"}`,
  );
}

console.log("\nDecorative (exempt — color never carries meaning alone, D3):");
for (const [name, why] of Object.entries(DECORATIVE)) {
  console.log(`  --${pad(name, 12)} ${why}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contrast failure(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(`\n${rows.length} pairs checked, all pass.`);
