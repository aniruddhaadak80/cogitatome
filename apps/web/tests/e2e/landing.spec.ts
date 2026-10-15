import { expect, test } from "@playwright/test";

/**
 * The landing page is the product's front door: it runs a real forward pass
 * server-side, so these assertions check computed numbers, not static copy.
 */
test("landing renders the hero and the live forward pass", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Open the brain");
  await expect(page.getByText("interpretability observatory", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("zero api keys", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /dissect it now/i })).toBeVisible();
});

test("landing links every route in the lab", async ({ page }) => {
  await page.goto("/");
  for (const href of ["/dissect", "/heads", "/circuits", "/features", "/probes", "/sandbox", "/ethics", "/corpus", "/timeline"]) {
    await expect(page.getByRole("link", { name: new RegExp(href.slice(1), "i") }).first()).toBeVisible();
  }
});

test("command palette opens with keyboard and jumps", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder(/go to a route/i)).toBeVisible();
  await page.keyboard.type("heads");
  await page.getByRole("option").first().click();
  await expect(page).toHaveURL(/\/heads/);
});
