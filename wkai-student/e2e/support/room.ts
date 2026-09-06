import type { Page } from "@playwright/test";

/**
 * Fills the six-box room-code field.
 *
 * The field is six separate inputs that advance focus on each keystroke, so a
 * test cannot simply type into "the code input" — each box is addressed by its
 * own accessible name.
 */
export async function enterRoomCode(page: Page, roomCode: string): Promise<void> {
  const characters = roomCode.toUpperCase().split("");
  for (let i = 0; i < characters.length; i++) {
    await page.getByLabel(`Room code character ${i + 1}`).fill(characters[i]);
  }
}

/** Walks the join form end to end: name, code, optional password, submit. */
export async function joinRoomThroughUi(
  page: Page,
  roomCode: string,
  studentName = "Grace Hopper",
  password?: string
): Promise<void> {
  await page.goto("/join");
  await page.getByPlaceholder("Alex Smith").fill(studentName);
  await enterRoomCode(page, roomCode);
  if (password !== undefined) {
    await page.getByPlaceholder("Leave empty if there is none").fill(password);
  }
  await page.getByRole("button", { name: "Join session" }).click();
}
