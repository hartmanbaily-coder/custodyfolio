import { expect, test } from "@playwright/test";

test("appearance follows the system by default and persists explicit choices", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  const appearance = page.getByLabel("Appearance");
  await expect(appearance).toHaveValue("system");
  await appearance.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Appearance").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("dark workspace reports remain white in print output", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("custody-folio-theme", "dark"));
  await page.goto("/records");
  await page.getByRole("button", { name: "Enter records workspace" }).click();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.emulateMedia({ media: "print" });
  const printSurface = page.locator(".report-surface");
  await expect(printSurface).toBeVisible();
  await expect
    .poll(() => printSurface.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(255, 255, 255)");
  await expect
    .poll(() => printSurface.evaluate((element) => getComputedStyle(element).color))
    .toBe("rgb(15, 23, 42)");
});

test("public pages expose route-specific canonicals and the complete policy set", async ({ page }) => {
  await page.goto("/privacy");

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://custodyfolio.com/privacy"
  );
  for (const path of [
    "/privacy",
    "/terms",
    "/security",
    "/ai-data-use",
    "/subprocessors",
    "/accessibility",
    "/contact",
    "/account/delete",
  ]) {
    await expect(page.locator(`a[href="${path}"]`).first()).toBeAttached();
  }
});
