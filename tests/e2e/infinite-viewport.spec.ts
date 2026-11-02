import { test, expect } from '@playwright/test';
import sharp from 'sharp';
test('viewport, zoom and large signed positions prepare their complete surroundings', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1&autostart=1&seed=1337');
  await page.waitForFunction(() => !!window.__GAME__?.getStreamingDebug(), {}, { timeout: 60000 });
  await page.evaluate(() => window.__GAME__!.setTimeScale(0));
  for (const size of [
    { width: 390, height: 844 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    for (const zoom of [0.5, 2, 'auto'] as const) {
      await page.evaluate((z) => window.__RENDER_DEBUG__!.setZoom(z), zoom);
      await expect
        .poll(() => page.evaluate(() => window.__GAME__!.getStreamingDebug()?.preparing), {
          timeout: 30000,
        })
        .toBe(false);
      await page.waitForTimeout(300);
      const state = await page.evaluate(() => window.__GAME__!.getState());
      expect(state.camera.boundsClamped).toBe(false);
    }
  }
  for (const [x, y] of [
    [1000000000.5, -1000000000.5],
    [-1000000000.5, 1000000000.5],
  ]) {
    await page.evaluate((p) => window.__GAME__!.setGlobalPosition(p.x, p.y), { x: x!, y: y! });
    const p = (await page.evaluate(() => window.__GAME__!.getStreamingDebug()))!.globalPosition;
    expect(Math.abs(p.x - x!)).toBeLessThan(2);
    expect(Math.abs(p.y - y!)).toBeLessThan(2);
  }
  for (const mode of ['full', 'hidden', 'radar']) {
    await page.keyboard.press('KeyM');
    await expect
      .poll(() => page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().minimapMode))
      .toBe(mode);
    if (mode === 'full') {
      const capture = await page.screenshot({
        path: info.outputPath('large-signed-regional-map.png'),
      });
      const { data, info: pixels } = await sharp(capture)
        .raw()
        .toBuffer({ resolveWithObject: true });
      let white = 0;
      for (let y = 357; y <= 363; y++)
        for (let x = 637; x <= 643; x++) {
          const i = (y * pixels.width + x) * pixels.channels;
          if (data[i]! > 220 && data[i + 1]! > 220 && data[i + 2]! > 220) white++;
        }
      expect(white).toBeGreaterThan(10);
    }
  }
  await page.screenshot({ path: info.outputPath('large-signed-world.png') });
  expect(errors).toEqual([]);
});
