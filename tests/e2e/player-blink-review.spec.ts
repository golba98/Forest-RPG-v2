import { test, expect } from '@playwright/test';

test.skip(!process.env.PLAYER_FLOW_REVIEW, 'Local comparison inspector');
test('approved inspector demonstrates eye-local blinking at normal and quarter speed', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#status')).toContainText('Approved character', { timeout: 30000 });
  await page.click('#inspect-pause');
  await page.selectOption('#inspect-clip', 'idle');
  await page.selectOption('#direction', 'S');
  const canvas = page.locator('#inspect');
  await expect(canvas).toHaveAttribute('data-frame', '0');
  await page.click('#inspect-blink');
  await expect(canvas).toHaveAttribute('data-phase', 'closing');
  const pixels = () =>
    canvas.evaluate((c: HTMLCanvasElement) =>
      Array.from(c.getContext('2d')!.getImageData(700, 144, 64, 64).data),
    );
  const partial = await pixels();
  const head = await canvas.getAttribute('data-head');
  await page.waitForTimeout(120);
  expect(await pixels()).toEqual(partial);
  expect(await canvas.getAttribute('data-head')).toBe(head);
  await page.screenshot({ path: info.outputPath('paired-partial.png') });
  for (const phase of ['closed', 'opening', 'open']) {
    // A body frame boundary can occur before the next eyelid boundary.
    for (let i = 0; i < 4 && (await canvas.getAttribute('data-phase')) !== phase; i++)
      await page.click('#inspect-step');
    await expect(canvas).toHaveAttribute('data-phase', phase);
    await page.screenshot({ path: info.outputPath(`paired-${phase}.png`) });
  }
  // Record real RAF playback, first at normal speed then at quarter speed.
  for (const speed of ['1', '0.25']) {
    await page.selectOption('#inspect-speed', speed);
    await page.click('#inspect-pause');
    for (const clip of ['idle', 'walk', 'run', 'jump', 'attack', 'attack2', 'attack3']) {
      await page.selectOption('#inspect-clip', clip);
      await page.click('#inspect-blink');
      await expect(canvas).toHaveAttribute('data-phase', 'open', { timeout: 1500 });
      await page.waitForTimeout(450);
    }
    await page.click('#inspect-pause');
  }
  // The recording was magnified. Check discrete pixels at the same 140% content
  // magnification too; this is CSS content zoom, not a claimed browser-UI setting.
  await page.evaluate(() => {
    document.body.style.zoom = '1.4';
  });
  await page.selectOption('#inspect-clip', 'idle');
  await page.click('#inspect-blink');
  await page.screenshot({ path: info.outputPath('paired-140-percent-content-zoom.png') });
  expect(errors).toEqual([]);
});
