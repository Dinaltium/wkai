import { test, expect } from "@playwright/test";

test.describe("landing page", () => {
  test("shows the hero and routes both calls to action", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("writes itself down");

    await page.getByRole("link", { name: /Join with a code/ }).first().click();
    await expect(page).toHaveURL(/\/join$/);
    await expect(page.getByRole("heading", { name: "Join the workshop" })).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: /Get the instructor app/ }).first().click();
    await expect(page).toHaveURL(/\/download$/);
  });

  test("the hero video has a poster so the page is never blank while it loads", async ({ page }) => {
    await page.goto("/");
    const video = page.locator("video").first();
    await expect(video).toHaveAttribute("poster", /hero-workshop-poster/);
  });
});

test.describe("error routes", () => {
  test("an unknown URL gets the 404 page, not a blank screen", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");

    await expect(page.getByText("404", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "That page isn't here" })).toBeVisible();

    // The 404 offers the action that actually helps: join with a code.
    await page.getByRole("link", { name: /Join with a code/ }).click();
    await expect(page).toHaveURL(/\/join$/);
  });

  test("a room URL with a bad code sends the student back to join with a reason", async ({ page }) => {
    await page.goto("/room/ZZZZZZ");

    await expect(page).toHaveURL(/\/join$/, { timeout: 20_000 });
    await expect(page.getByRole("alert")).toContainText(/ZZZZZZ/);
  });
});
