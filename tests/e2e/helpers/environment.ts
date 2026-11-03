import { expect, type Page } from '@playwright/test';

/** Asset IO uses real time while these tests own RAF through Playwright's clock. */
export async function settleEnvironment(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.clock.runFor(17);
        return page.evaluate(
          () =>
            !!window.__GAME__ &&
            !!window.__RENDER_DEBUG__ &&
            window.__RENDER_DEBUG__.getInfo().environment?.ready !== false,
        );
      },
      { intervals: [20], timeout: 10000 },
    )
    .toBe(true);
}
