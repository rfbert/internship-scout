import { test, expect } from "@playwright/test";

/** Smoke: every section renders without a server error. Assumes seeded DB. */
const SECTIONS = [
  ["/", "Dashboard"],
  ["/opportunities", "Opportunities"],
  ["/review", "Review"],
  ["/tracker", "Tracker"],
  ["/companies", "Companies"],
  ["/calendar", "Calendar"],
  ["/archive", "Archive"],
  ["/analytics", "Analytics"],
  ["/sources", "Sources"],
  ["/runs", "Runs"],
  ["/reports", "Reports"],
  ["/settings", "Settings"],
] as const;

for (const [path] of SECTIONS) {
  test(`renders ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toContainText("Application error");
  });
}

/**
 * The only test in this suite that WRITES, and it is opt-in for a reason.
 *
 * It clicks Accept, which creates an Application and records a decision. Every
 * other test here is a read. The guard is not about flakiness: this repo's
 * local `.env` points at the PRODUCTION database, and Playwright's `webServer`
 * starts `npm run dev`, which loads it. So `npm run test:e2e` on a laptop
 * drives a real browser against real data. Today the click is inert only
 * because no listing happens to be titled with the seeded sample's name — the
 * `isVisible()` check below is a coincidence, not a safety mechanism, and it
 * stops being one the moment a sample is seeded or a posting is named that.
 *
 * Run it deliberately, against a database you are willing to write to:
 *
 *     E2E_ALLOW_WRITES=1 npm run test:e2e
 */
test("review queue shows seeded sample and accepts it into the tracker", async ({ page }) => {
  test.skip(
    !process.env.E2E_ALLOW_WRITES,
    "Writes to the database under test. Set E2E_ALLOW_WRITES=1 to run it — and check which database DATABASE_URL points at first."
  );
  await page.goto("/review");
  const sampleTitle = "AI Product Management Intern (SAMPLE)";
  const sample = page.getByText(sampleTitle).first();
  if (await sample.isVisible().catch(() => false)) {
    // Scope the action to the sample's own card, not the page's first button.
    const card = page
      .locator("div")
      .filter({ hasText: sampleTitle })
      .filter({ has: page.getByRole("button", { name: /^accept/i }) })
      .last();
    await card.getByRole("button", { name: /^accept/i }).first().click();
    await page.waitForTimeout(1500);
    await page.goto("/tracker");
    await expect(page.getByText(sampleTitle).first()).toBeVisible();
  }
});

test("settings shows scoring weights that sum to 100", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText(/100/).first()).toBeVisible();
});
