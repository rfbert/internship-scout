/* ══════════════════════════════════════════════════════════════════════════
   THE RENDERED DIGEST — stored email markup, quarantined.

   WHY THIS IS AN IFRAME AND NEVER `dangerouslySetInnerHTML`:

   1. IT IS ATTACKER-INFLUENCED MARKUP, EVEN THOUGH WE WROTE IT.
      The strings interpolated into the digest — company names, posting titles,
      locations, next-action notes, raw collection-error messages — come from
      scraped postings and third-party errors. `builder.ts` escapes all of
      them (14 `esc()` call sites; `esc(t.company)`, `esc(t.title)`,
      `esc(e.message)`), and the apply URL's scheme is checked as well.

      CORRECTION, because this comment used to claim the opposite: it asserted
      there was NO escaping and that `<img src=x onerror=…>` sat in
      `email_reports.html_body` today. That was false when written and it is
      false now — one grep disproves it. It is corrected rather than deleted
      because a fabricated vulnerability is worse than no comment: it sends
      the next reader hunting a stored XSS that does not exist, and it makes
      the real reason for the iframe look like it was never examined.

      The real reason is that escaping is a property of a file that is edited,
      not a guarantee of the boundary. Inlining stored markup into the app's
      own DOM would make any future escaping mistake in the mail template an
      XSS on this origin with the reader's session attached. The iframe is the
      trust boundary, and it holds whether or not `builder.ts` is correct on
      any given day. That is what makes it worth having — not a bug it was
      never fixing.

   2. IT WOULD FIGHT THE APP'S CSS. The digest is a `<table>`-based, hex-coded,
      light-only email sheet (spec A6). Dropped into the Register it would
      inherit the ledger's type scale and theme tokens and print as neither one
      thing nor the other. A separate document keeps the preview truthful: this
      is what the mail client will show.

   THE SANDBOX. `sandbox=""` — the empty value is every restriction ON, so:
   no scripts (a `<script>` in a scraped title is inert), a unique opaque
   origin (no reach into this document, no cookies, no storage), no forms, no
   popups, no top-level navigation. `referrerPolicy="no-referrer"` covers the
   remote-image case, which is the one network fetch the email markup could
   otherwise perform.

   THE CSP (`next.config.ts`) NEEDED NO CHANGE, and here is why, because the
   next person will reasonably assume it did:
     · `frame-src` is not declared, so it falls back to `default-src 'self'`.
       A `srcDoc` iframe navigates to `about:srcdoc`, a *local scheme*, which
       CSP exempts from source-list matching precisely because it cannot carry
       remote content — so `'self'` does not block it. Verified in the browser:
       no CSP violation is reported on this page.
     · A local-scheme document INHERITS the embedder's policy, which is the
       useful half. The digest is therefore rendered under the app's own CSP:
       `style-src 'unsafe-inline'` lets its inline `style=` attributes paint,
       `img-src 'self' data:` silently drops any remote tracking pixel, and
       `script-src` would refuse an inline script even if the sandbox somehow
       did not — two independent locks on the same door.
   If a future change adds a `frame-src` directive to that header, it must keep
   a `'self'`-scoped allowance or this preview goes blank. Never relax
   `script-src` for it; the sandbox is what makes the markup safe, not the CSP.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The stored body is a `<body>`-rooted fragment (`builder.ts` `sheet()`), not
 * a whole document. Prepending a doctype and a charset is the only thing done
 * to it — without the doctype the frame parses in quirks mode and the email's
 * table layout collapses, and without the charset the digest's `·` and `—`
 * separators mojibake. The markup itself is passed through byte-for-byte:
 * sanitising it here would make the preview a lie about what was stored.
 */
const wrap = (html: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>${html}</html>`;

/**
 * How tall to make the frame.
 *
 * Scripts are off, so the document cannot measure and report itself, and there
 * is no `srcdoc` equivalent of `height: auto`. One fixed height has to serve
 * both a quiet day and an eight-listing morning, and it cannot: a flat 720px
 * left half a screen of blank white under the ~1.9 KB digests that are the
 * common case, and still cut the big ones off.
 *
 * So the height is ESTIMATED from the stored character count, the only signal
 * available before paint. The digest is one machine-generated template, so the
 * relationship is close to linear. THESE COEFFICIENTS ARE MEASURED, not
 * guessed — rendered in Chrome and read back off `scrollHeight`:
 *
 *     1,925 chars → 403px      (Aug 12, one listing)
 *     4,685 chars → 706px      (Aug 4, four listings)
 *     8,831 chars → 1385px     (Jul 18, eight listings — the largest on file)
 *
 * A line through the two endpoints gives `129 + 0.1422 · chars`, which is exact
 * at both and over-estimates the midpoint by ~90px. That asymmetry is the point:
 * over-estimating costs white space, under-estimating hides the bottom of the
 * digest, so the fit is deliberately left on the generous side and given a
 * further 24px of slack. Re-measure with the same method if the email template
 * changes shape; do not tune these numbers by eye.
 *
 * The 1600px ceiling covers roughly 10 KB, comfortably past anything the agent
 * has produced. Beyond it the frame's own document scrolls — the digest is
 * never truncated, it just needs a second scroll region, which is why the
 * ceiling is set high enough that no report on file reaches it.
 *
 * A CSS `resize: vertical` drag handle was tried here and REMOVED: `overflow`
 * does not apply to replaced elements, so Chrome computes it to `clip` and
 * paints no grabber. Verified by dragging the corner — the height did not move.
 * Do not re-add it without checking that it actually resizes.
 */
export const frameHeight = (chars: number) =>
  Math.round(Math.min(1600, Math.max(320, 129 + chars * 0.1422 + 24)));

export function DigestFrame({ html, subject }: { html: string; subject: string }) {
  return (
    <iframe
      // No `src`: the document is inlined, so nothing is fetched over the wire.
      srcDoc={wrap(html)}
      sandbox=""
      referrerPolicy="no-referrer"
      title={`Rendered digest — ${subject}`}
      style={{
        // A light sheet in both themes, deliberately: the email is light-only
        // by spec A6, and a browser-forced dark scrollbar around it would
        // suggest a dark variant exists. `colorScheme` also stops the UA
        // repainting the frame's default canvas behind the email's own
        // background.
        colorScheme: "light",
        height: `${frameHeight(html.length)}px`,
      }}
      className="block w-full border-0 bg-white"
    />
  );
}
