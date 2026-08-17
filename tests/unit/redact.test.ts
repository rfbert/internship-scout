import { describe, expect, it } from "vitest";
import { redactPaths, summarizeFailure } from "@/app/runs/meta";

/*
 * A failed run used to render thirteen of these, raw, on a page anyone can be
 * shown — two full screens publishing a home directory and an excerpt of this
 * repository's source. The tests below are less about the formatting than
 * about one property: NO ABSOLUTE PATH REACHES THE PAGE, by any branch,
 * including the fallback taken when the message is a shape nobody anticipated.
 */

const PRISMA_FAILURE = `
Invalid \`tx.listingScore.upsert()\` invocation in
/Users/dev/projects/internship-scout/src/agent/run.ts:738:41

  735 const existing = await tx.listingScore.findFirst({
  736   where: { listingId },
  737 });
→ 738 await tx.listingScore.upsert(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction.
`.trim();

describe("redactPaths", () => {
  it("keeps the filename and drops the directories that lead to it", () => {
    const out = redactPaths(PRISMA_FAILURE);
    expect(out).toContain("run.ts:738:41");
    expect(out).not.toContain("/Users/dev");
    expect(out).not.toContain("Downloads");
    expect(out).not.toContain("internship-scout/src");
  });

  it("redacts a deployed host's paths, not just this laptop's", () => {
    // The reason a home-directory-shaped rule is not enough: on Vercel the
    // same message names /var/task/... instead, and it is no more publishable.
    const out = redactPaths("at /var/task/.next/server/chunks/8471.js:12:9");
    expect(out).not.toContain("/var/task");
    expect(out).toContain("8471.js:12:9");
  });

  it("redacts Windows paths too", () => {
    const out = redactPaths(String.raw`C:\Users\rf\proj\src\agent\run.ts:1:1`);
    expect(out).not.toContain(String.raw`C:\Users`);
    expect(out).toContain("run.ts:1:1");
  });

  /*
   * The shapes the first version missed entirely. It required the final
   * segment to carry a file extension, so a path ending in a DIRECTORY matched
   * nothing and survived whole — and "Cannot find module" and "ENOENT … no
   * such directory" are ordinary failures for a bundled app on a serverless
   * host, i.e. exactly where the guard was most needed. Table-driven, because
   * the failure was a missing case rather than a wrong transformation.
   */
  it.each([
    ["module resolution", "Cannot find module '/Users/dev/projects/internship-scout/src/lib/prisma'", "prisma"],
    ["ENOENT on a directory", "ENOENT: no such file or directory, scandir '/Users/dev/projects/internship-scout/data'", "data"],
    ["a bare cwd", "Working directory is /Users/dev/projects/internship-scout", "internship-scout"],
    ["a trailing separator", "Could not write to /Users/dev/projects/internship-scout/src/agent/", "agent"],
    ["a serverless bundle path", "at /var/task/.next/server/chunks/8471.js:12:9", "8471.js:12:9"],
  ])("redacts %s", (_name, input, kept) => {
    const out = redactPaths(input);
    expect(out).not.toContain("/Users/dev");
    expect(out).not.toContain("/var/task");
    expect(out).toContain(kept);
  });

  it("redacts UNC and JSON-escaped Windows paths", () => {
    expect(redactPaths(String.raw`\\build01\share\app\run.ts:4:2`)).not.toContain("build01");
    expect(redactPaths(String.raw`C:\\Users\\rf\\proj\\run.ts`)).not.toContain("Users");
  });

  it("does not run one match across two paths in prose", () => {
    // A space inside the segment class let a single match swallow the words
    // between two unrelated paths: "read /etc/a/b and /usr/lib/c" → "read c".
    const out = redactPaths("read /etc/nginx/nginx.conf and /usr/local/lib/node.js now");
    expect(out).toContain("and");
    expect(out).toContain("now");
  });

  it("leaves ordinary prose and URLs alone", () => {
    // A source URL is the one path-shaped thing on this page that is real
    // evidence — it says which board failed.
    const msg = "429 rate limited after 3 retries";
    expect(redactPaths(msg)).toBe(msg);
    expect(redactPaths("fetch https://boards.example.com/a/b/c failed")).toContain(
      "https://boards.example.com/a/b/c"
    );
  });

  /*
   * A URL is not a filesystem path, and here it is usually the WHOLE evidence.
   * The POSIX rule used to match the path part of a URL, so
   * `https://raw.githubusercontent.com/org/repo/main/README.md` collapsed to
   * `https:/README.md` — and since `run.ts` files GitHub collection errors
   * with no `url` column, and the event log is redacted the same way, which
   * repo failed became unrecoverable from anywhere on the page. All six GitHub
   * sources are configured `file: "README.md"`, so every one of them produced
   * the identical useless string.
   */
  it("keeps a deep URL intact — it is the evidence, not the leak", () => {
    const url = "https://raw.githubusercontent.com/speedyapply/2027-AI-College-Jobs/main/README.md";
    expect(redactPaths(`HTTP 503 for GET ${url}`)).toBe(`HTTP 503 for GET ${url}`);
    expect(summarizeFailure(`HTTP 503 for GET ${url}`)).toContain("speedyapply");
  });

  it("redacts a path that sits in the same message as a URL", () => {
    const out = redactPaths(
      "GET https://example.com/a/b/c.json failed; wrote /Users/dev/projects/internship-scout/tmp/out.log"
    );
    expect(out).toContain("https://example.com/a/b/c.json");
    expect(out).not.toContain("/Users/dev");
    expect(out).toContain("out.log");
  });
});

describe("summarizeFailure", () => {
  it("names the operation and the cause, not the stack", () => {
    const out = summarizeFailure(PRISMA_FAILURE);
    expect(out).toContain("tx.listingScore.upsert()");
    expect(out).toContain("Transaction already closed");
    expect(out).not.toContain("/Users/dev");
    // One line — the whole point is that it fits where a paragraph did not.
    expect(out.split("\n")).toHaveLength(1);
  });

  it("still redacts when it falls through to the first line", () => {
    // The branch that matters most: an unrecognised shape must not become a
    // hole through which a path escapes.
    const out = summarizeFailure("boom at /Users/dev/secret/place/thing.ts:4:2");
    expect(out).not.toContain("/Users/dev");
    expect(out).toContain("thing.ts:4:2");
  });

  it("never returns an empty string, whatever it is handed", () => {
    expect(summarizeFailure("")).toBeTruthy();
    expect(summarizeFailure("   \n  \n ")).toBeTruthy();
  });

  it("caps a single enormous line rather than printing the blob", () => {
    expect(summarizeFailure("x".repeat(5000)).length).toBeLessThanOrEqual(201);
  });

  it("ends a clipped line on a word, so it does not read as a rendering bug", () => {
    // The first cut of this printed "…expired transaction. The tim", which
    // leaves the reader unsure whether the sentence ended or the page broke.
    const out = summarizeFailure(`${"word ".repeat(60)}finaltoken`);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });
});
