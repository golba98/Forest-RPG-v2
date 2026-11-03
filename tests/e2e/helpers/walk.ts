import { expect, type Page } from '@playwright/test';
export async function walk(page: Page, dx: number, dy: number) {
  const p = await page.evaluate(() => window.__GAME__!.getStreamingDebug()!.globalPosition);
  const route = await page.evaluate((p) => window.__GAME__!.planTravelPath(p.x, p.y), {
    x: p.x + dx,
    y: p.y + dy,
  });
  expect(route.length).toBeGreaterThan(0);
  const held = new Set<string>();
  try {
    for (const target of route) {
      for (let tries = 0; tries < 100; tries++) {
        const at = await page.evaluate((target) => {
          const game = window.__GAME__!;
          game.setPlayerHealth(7);
          const at = game.getStreamingDebug()!.globalPosition;
          game.setTimeScale(
            Math.max(Math.abs(target.x - at.x), Math.abs(target.y - at.y)) < 0.3 ? 0.2 : 1,
          );
          return at;
        }, target);
        const x = target.x - at.x,
          y = target.y - at.y;
        if (Math.max(Math.abs(x), Math.abs(y)) < 0.025) break;
        if (tries === 99)
          throw new Error(
            `Traversal stuck at ${JSON.stringify(at)} heading to ${JSON.stringify(target)}`,
          );
        const keys = [
          ...(Math.abs(x) > 0.015 ? [x > 0 ? 'KeyD' : 'KeyA'] : []),
          ...(Math.abs(y) > 0.015 ? [y > 0 ? 'KeyS' : 'KeyW'] : []),
        ];
        // Keep actual keyboard input held between clock ticks. Releasing and
        // re-pressing every 16 ms adds thousands of browser protocol round trips
        // on longer routes without exercising any additional movement behavior.
        for (const key of held)
          if (!keys.includes(key)) {
            await page.keyboard.up(key);
            held.delete(key);
          }
        for (const key of keys)
          if (!held.has(key)) {
            await page.keyboard.down(key);
            held.add(key);
          }
        await page.clock.runFor(16);
      }
    }
  } finally {
    for (const key of held) await page.keyboard.up(key);
  }
}
