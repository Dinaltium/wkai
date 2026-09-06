import { test, expect } from "@playwright/test";
import { openSession, randomRoomCode } from "./support/backend";
import { enterRoomCode, joinRoomThroughUi } from "./support/room";

test.describe("joining a workshop", () => {
  test("the submit button stays disabled until a name and six characters are in", async ({ page }) => {
    await page.goto("/join");
    const submit = page.getByRole("button", { name: "Join session" });

    await expect(submit).toBeDisabled();

    await page.getByPlaceholder("Alex Smith").fill("Grace Hopper");
    await expect(submit).toBeDisabled();

    await enterRoomCode(page, "ABC12");
    await expect(submit).toBeDisabled();

    await page.getByLabel("Room code character 6").fill("3");
    await expect(submit).toBeEnabled();
  });

  test("typing advances through the six boxes", async ({ page }) => {
    await page.goto("/join");
    await enterRoomCode(page, "ABC123");

    for (const [index, char] of [..."ABC123"].entries()) {
      await expect(page.getByLabel(`Room code character ${index + 1}`)).toHaveValue(char);
    }
  });

  test("a lowercase code is accepted and upper-cased", async ({ page }) => {
    const session = await openSession();
    await joinRoomThroughUi(page, session.roomCode.toLowerCase());

    await expect(page).toHaveURL(new RegExp(`/room/${session.roomCode}$`));
  });

  test("a code with no room behind it explains itself instead of hanging", async ({ page }) => {
    await joinRoomThroughUi(page, randomRoomCode());

    await expect(page.getByRole("alert")).toContainText(/No room with that code/i);
    await expect(page).toHaveURL(/\/join$/);
  });

  test("a protected room rejects the wrong password and accepts the right one", async ({ page }) => {
    const session = await openSession({ sessionPassword: "hunter2" });

    await joinRoomThroughUi(page, session.roomCode, "Grace Hopper", "wrong-password");
    await expect(page.getByRole("alert")).toContainText(/password/i);

    await page.getByPlaceholder("Leave empty if there is none").fill("hunter2");
    await page.getByRole("button", { name: "Join session" }).click();
    await expect(page).toHaveURL(new RegExp(`/room/${session.roomCode}$`));
  });

  test("the student's name is remembered for the next join", async ({ page }) => {
    const first = await openSession();
    await joinRoomThroughUi(page, first.roomCode, "Grace Hopper");
    await expect(page).toHaveURL(new RegExp(`/room/${first.roomCode}$`));

    await page.goto("/join");
    await expect(page.getByPlaceholder("Alex Smith")).toHaveValue("Grace Hopper");
  });
});
