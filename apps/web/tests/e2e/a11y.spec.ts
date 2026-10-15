import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accessibility is a gate, not a stretch goal: every page in this suite must
 * introduce zero new axe violations.
 */
for (const path of ["/", "/dissect", "/heads", "/corpus", "/sandbox", "/ethics"]) {
  test(`a11y: ${path} has no critical violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const critical = results.violations.filter((v) => v.impact === "critical");
    expect(critical, JSON.stringify(critical.map((v) => v.id), null, 2)).toHaveLength(0);
  });
}
