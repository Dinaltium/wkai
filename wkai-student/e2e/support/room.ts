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
    // The field only exists once the preflight reports this room has a
    // password, which happens as soon as the sixth character lands.
    await page.getByPlaceholder("Ask your instructor").fill(password);
  }
  await page.getByRole("button", { name: "Join session" }).click();
}

/**
 * Dismisses the "instructor is not here" modal if it has appeared.
 *
 * No test connects an instructor, so once the server's grace period lapses the
 * modal opens over the room and its backdrop swallows every click. Whether it
 * arrives before a given assertion depends on how fast the rest of the suite
 * ran, which made one tab-bar test fail only in a full run and pass on its own.
 * Tests that are not about presence should get past it explicitly.
 */
export async function dismissInstructorAway(page: Page): Promise<void> {
  const stay = page.getByRole("button", { name: "Stay in the session" });
  if (await stay.isVisible().catch(() => false)) {
    await stay.click();
    await stay.waitFor({ state: "hidden" });
  }
}
