#!/usr/bin/env node
/**
 * Are the pages actually WORKING — not merely answering?
 *
 * A Next.js error boundary renders with HTTP 200. So does a Server Component
 * that threw. A smoke check that reads status codes calls both of those green,
 * which is exactly what happened here: /sources spent a deploy showing "The
 * intake register failed to load" while every check said 200. The cause was a
 * per-source `count()` fanned out through `Promise.all`, which exhausted
 * Supabase's 15-client session pool under real traffic and never once failed
 * on a laptop with one reader.
 *
 * So this asserts PRESENCE, not absence. Each page must print its own <h1>.
 * A page that throws cannot, whatever the status code says and whatever the
 * error UI happens to be worded like in this environment — and that last part
 * matters: the first version of this script looked only for error strings, and
 * a deliberately broken /sources sailed through it, because the dev overlay
 * says something different from the production error boundary. Absence of a
 * phrase you predicted is a weak signal. Presence of the page's own headline
 * is a strong one.
 *
 * Usage:  node scripts/smoke-pages.mjs [baseUrl]
 * Exit 0 iff every page rendered.
 */
const base = process.argv[2] ?? "http://localhost:3000";

/** [path, the page's own <h1>]. Query variants reuse their base page's h1. */
const PAGES = [
  ["/", "The day, in order."],
  ["/opportunities", "New Opportunities"],
  ["/review", "Review Queue"],
  ["/review?sort=posted", "Review Queue"],
  ["/review?sort=deadline", "Review Queue"],
  ["/tracker", "Application Tracker"],
  ["/tracker?overdue=1", "Application Tracker"],
  ["/companies", "Companies on file."],
  ["/calendar", "What comes due, and when."],
  ["/analytics", "What the search has returned."],
  ["/runs", "Every run, and what it brought in."],
  ["/reports", "Every digest the agent wrote."],
  ["/sources", "Data Sources"],
  ["/settings", "How the scout is instructed."],
  ["/archive", "Archive"],
];

/**
 * Belt and braces. These only ever appear in rendered error UI — each was
 * checked against a healthy page before being added, because a smoke check
 * that cries wolf gets ignored, which leaves you where you started. Notably
 * ABSENT: "This page could not be found" and "Unhandled Runtime Error", both
 * of which Next inlines into every dev response and which flagged all fifteen
 * healthy pages when they were on the list.
 */
const FAILURE_MARKERS = [
  "failed to load", // every error.tsx in this app
  "Application error", // Next's client-side error boundary
  "Internal Server Error",
  "EMAXCONNSESSION", // the pooler limit that took /sources down
];

const strip = (html) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, "&");

let bad = 0;
for (const [path, headline] of PAGES) {
  let status = 0;
  let body = "";
  try {
    const res = await fetch(base + path, { redirect: "follow" });
    status = res.status;
    body = await res.text();
  } catch (err) {
    console.log(`FAIL  ${path.padEnd(28)} request failed: ${err.message}`);
    bad++;
    continue;
  }

  const text = strip(body);
  const rendered = text.includes(headline);
  const marker = FAILURE_MARKERS.find((m) => body.toLowerCase().includes(m.toLowerCase()));
  const ok = status === 200 && rendered && !marker;
  if (!ok) bad++;

  const why = !rendered ? `did not render its headline (“${headline}”)` : marker ? `rendered “${marker}”` : "";
  console.log(`${ok ? "ok  " : "FAIL"}  ${path.padEnd(28)} ${status}${why ? `  ← ${why}` : ""}`);
}

console.log(`\n${PAGES.length - bad}/${PAGES.length} pages rendered at ${base}`);
process.exit(bad === 0 ? 0 : 1);
