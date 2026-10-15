import { expect, test } from "@playwright/test";

/**
 * Core user journeys: dissect a run, read the heads, search the corpus,
 * and watch a sandbox scenario fail on purpose.
 */
test("dissect shows the residual stream and attention", async ({ page }) => {
  await page.goto("/dissect");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Step through a forward pass");
  await expect(page.getByText("residual stream at position", { exact: false })).toBeVisible();
  await expect(page.getByText("per-layer attention", { exact: false })).toBeVisible();
});

test("heads names the induction head", async ({ page }) => {
  await page.goto("/heads");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every attention head");
  await expect(page.getByText("induction", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("previous-token", { exact: false }).first()).toBeVisible();
});

test("circuits draws the attribution graph", async ({ page }) => {
  await page.goto("/circuits");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Discover the circuit");
  await expect(page.getByText("attributed graph", { exact: false })).toBeVisible();
});

test("corpus search finds induction heads", async ({ page }) => {
  await page.goto("/corpus?q=induction+head");
  await expect(page.getByText(/results for/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
});

test("sandbox runs all eight scenarios", async ({ page }) => {
  await page.goto("/sandbox");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Eight ways");
  await expect(page.getByText("reasoning trace", { exact: false }).first()).toBeVisible();
});

test("ethics argues from six positions", async ({ page }) => {
  await page.goto("/ethics");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Six positions");
  await expect(page.getByText("aggregate", { exact: false }).first()).toBeVisible();
});
