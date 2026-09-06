import { test, expect } from "@playwright/test";
import { endSession, openSession } from "./support/backend";
import { joinRoomThroughUi } from "./support/room";

/** The tab bar is a nav of buttons, with aria-current marking the open one. */
function sections(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "Workshop sections" });
}

test.describe("inside the room", () => {
  test("the header identifies the session and reports the live connection", async ({ page }) => {
    const session = await openSession({
      instructorName: "Ada Lovelace",
      workshopTitle: "Debugging in the small",
    });

    await joinRoomThroughUi(page, session.roomCode);
    await expect(page).toHaveURL(new RegExp(`/room/${session.roomCode}$`));

    await expect(page.getByText("Debugging in the small")).toBeVisible();
    await expect(page.getByText("Ada Lovelace")).toBeVisible();

    // No instructor is connected, so the honest status is "away", not "live" —
    // the student's own socket being up is not the same thing.
    await expect(page.getByText("Instructor offline")).toBeVisible({ timeout: 20_000 });
  });

  test("every workshop section is reachable from the tab bar", async ({ page }) => {
    const session = await openSession();
    await joinRoomThroughUi(page, session.roomCode);
    await expect(page).toHaveURL(new RegExp(`/room/${session.roomCode}$`));

    const tabs = sections(page);
    for (const label of ["Guide", "Files", "AI Helper", "Live", "Q&A"]) {
      await expect(tabs.getByRole("button", { name: label })).toBeVisible();
    }

    await tabs.getByRole("button", { name: "Files" }).click();
    await expect(tabs.getByRole("button", { name: "Files" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("ending the session reaches the student over the socket", async ({ page }) => {
    const session = await openSession();
    await joinRoomThroughUi(page, session.roomCode);
    await expect(page).toHaveURL(new RegExp(`/room/${session.roomCode}$`));

    // Wait for the room to settle before ending it, or the broadcast can be
    // sent before this client is in the room and the test proves nothing.
    await expect(sections(page)).toBeVisible();

    await endSession(session);

    await expect(page.getByText("Session over.", { exact: false })).toBeVisible({
      timeout: 20_000,
    });

    // Only Guide and Files survive the end of a session.
    await expect(sections(page).getByRole("button", { name: "Guide" })).toBeVisible();
    await expect(sections(page).getByRole("button", { name: "Files" })).toBeVisible();
    await expect(sections(page).getByRole("button", { name: "AI Helper" })).toHaveCount(0);
  });

  test("a student who joins an already-ended room is turned away", async ({ page }) => {
    const session = await openSession();
    await endSession(session);

    await joinRoomThroughUi(page, session.roomCode);

    await expect(page.getByRole("alert")).toContainText(/ended/i);
    await expect(page).toHaveURL(/\/join$/);
  });
});

test.describe("theming", () => {
  test("switching to light mode sticks across a reload", async ({ page }) => {
    const session = await openSession();
    await joinRoomThroughUi(page, session.roomCode);
    await expect(page).toHaveURL(new RegExp(`/room/${session.roomCode}$`));

    const html = page.locator("html");
    await expect(html).not.toHaveClass(/light/);

    await page.evaluate(() => {
      localStorage.setItem("wkai_theme_mode", "light");
    });
    await page.reload();
    await expect(sections(page)).toBeVisible();

    await expect(html).toHaveClass(/light/);
  });

  test("the accent colour is applied as a custom property", async ({ page }) => {
    await page.goto("/join");
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()
    );
    expect(accent).not.toBe("");
  });
});
