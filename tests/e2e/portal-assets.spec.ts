import { expect, test } from '@playwright/test';
import sharp from 'sharp';

for (const olderManifest of [false, true]) {
  test(`portal uses real art with ${olderManifest ? 'an older manifest missing its alias' : 'the shipped manifest'}`, async ({
    page,
  }, info) => {
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' && message.text().includes('missing texture'))
        warnings.push(message.text());
    });
    if (olderManifest) {
      await page.route('**/assets/manifests/asset_manifest.json', async (route) => {
        const response = await route.fetch();
        const manifest = await response.json();
        for (const bundle of manifest.bundles)
          bundle.assets = bundle.assets.filter(
            (asset: { alias: string }) => asset.alias !== 'portal_forest',
          );
        await route.fulfill({ response, json: manifest });
      });
    }
    const artResponse = page.waitForResponse((response) =>
      response.url().endsWith('/assets/images/objects/portal_forest.png'),
    );
    await page.goto('/?debug=1&autostart=1&tutorial=0&seed=42');
    await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
    const response = await artResponse;
    expect(response.status()).toBe(200);
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().portalTextures)).toEqual([
      expect.objectContaining({ width: 1312, height: 1199, placeholder: false }),
    ]);
    await page.evaluate(() => {
      const game = window.__GAME__!,
        portal = game.getState().world.portalPos;
      game.setDaylightRatio(0.5);
      window.__RENDER_DEBUG__!.setWeatherPreview('clear');
      game.setPlayerPosition(portal.x + 0.5, portal.y + 2.5);
    });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites)).toBe(
      0,
    );
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().portalViews)).toBe(1);
    const screenshot = await page.screenshot({ path: info.outputPath('portal-real-art.png') });
    const { data, info: image } = await sharp(screenshot)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let checkerPixels = 0;
    for (let i = 0; i < data.length; i += image.channels)
      if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 255) checkerPixels++;
    expect(checkerPixels).toBe(0);
    expect(warnings).toEqual([]);
    // The same texture must survive view destruction/recreation on saved-world reload.
    expect(await page.evaluate(() => window.__GAME__!.saveGame('portal-art'))).toBe(true);
    expect(await page.evaluate(() => window.__GAME__!.loadGame('portal-art'))).toBe(true);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites)).toBe(
      0,
    );
  });
}

test('a failed portal image is counted as a placeholder instead of passing visual diagnostics', async ({
  page,
}) => {
  await page.route('**/assets/images/objects/portal_forest.png', (route) => route.abort());
  await page.goto('/?debug=1&autostart=1&tutorial=0&seed=42');
  await page.waitForFunction(() => window.__GAME__?.getState().ui.currentMenu === null);
  await expect
    .poll(() => page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().placeholderSprites))
    .toBe(1);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().portalViews)).toBe(1);
  expect(await page.evaluate(() => window.__RENDER_DEBUG__!.getInfo().portalTextures)).toEqual([
    expect.objectContaining({ width: 16, height: 16, placeholder: true }),
  ]);
});
