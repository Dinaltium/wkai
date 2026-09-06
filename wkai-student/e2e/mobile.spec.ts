import { test, expect } from "@playwright/test";

/**
 * Mobile layout guards.
 *
 * The landing page once shipped a grid whose track was sized by a child's
 * min-content rather than the phone's width, so the document was 709px wide in
 * a 375px viewport: the page opened scrolled sideways with the hero half off
 * screen and the nav dock adrift. Nothing in the suite noticed, because every
 * other test ran at desktop width.
 *
 * A page is allowed to scroll down. It is never allowed to scroll across.
 */

const PAGES = ["/", "/join", "/download"] as const;

/** Phones in use, narrowest first — 320 is where fixed widths break. */
const WIDTHS = [320, 375, 414] as const;

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 780 } });

    for (const path of PAGES) {
      test(`${path} does not scroll sideways`, async ({ page }) => {
        await page.goto(path);
        // The dock and hero settle after their intro; measuring mid-animation
        // reads transforms that are on their way out.
        await page.waitForTimeout(1200);

        const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
          const de = document.documentElement;
          const offenders = [...document.querySelectorAll<HTMLElement>("*")]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              // Ignore anything with no box, and anything deliberately parked
              // off-screen (a closed menu, a visually-hidden label).
              if (r.width === 0 || r.height === 0) return false;
              return r.right > de.clientWidth + 1;
            })
            .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 90))
            .slice(0, 5);
          return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, offenders };
        });

        expect(
          scrollWidth,
          `page overflows by ${scrollWidth - clientWidth}px. First offenders: ${offenders.join(" | ")}`
        ).toBeLessThanOrEqual(clientWidth);
      });
    }
  });
}

test.describe("touch targets", () => {
  // A viewport, not a device preset: the presets carry defaultBrowserType,
  // which Playwright refuses inside a describe because it would force a new
  // worker. Only the width matters for measuring what a thumb has to hit.
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

  test("everything tappable on the landing page is at least 44px tall", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1200);

    const undersized = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("a, button, summary, input")]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30),
            height: Math.round(r.height),
            width: Math.round(r.width),
          };
        })
        // Zero-size elements are not on screen to be tapped.
        .filter((t) => t.width > 0 && t.height > 0 && t.height < 44)
    );

    expect(undersized, `undersized: ${JSON.stringify(undersized)}`).toEqual([]);
  });
});
