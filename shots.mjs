import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const shots = [["/", "dashboard"], ["/review", "review-queue"], ["/tracker?view=kanban", "tracker-kanban"], ["/sources", "sources"]];
for (const [path, name] of shots) {
  await page.goto("http://localhost:3000" + path, { waitUntil: "networkidle" });
  await page.screenshot({ path: `/tmp/claude-0/-home-user/ea9e1caf-4089-5e47-b588-41af5359b80f/scratchpad/${name}.png` });
}
await browser.close();
