import { test, expect, type Page, type TestInfo } from '@playwright/test';

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const body = await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

async function expectPanelFits(page: Page): Promise<void> {
  const dimensions = await page.locator('.menu-panel').evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      content: el.scrollWidth, width: el.clientWidth };
  });
  expect(dimensions.left).toBeGreaterThanOrEqual(0);
  expect(dimensions.top).toBeGreaterThanOrEqual(0);
  expect(dimensions.right).toBeLessThanOrEqual(dimensions.viewportWidth);
  expect(dimensions.bottom).toBeLessThanOrEqual(dimensions.viewportHeight);
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
}

const layouts = [
  { width: 1920, height: 1080, scale: '1', language: 'English' },
  { width: 1280, height: 720, scale: '1', language: 'English' },
  { width: 800, height: 600, scale: '1', language: 'English' },
  { width: 390, height: 844, scale: '1', language: 'English' },
  { width: 390, height: 844, scale: '1.2', language: 'Spanish' },
  { width: 390, height: 844, scale: '1.2', language: 'German' },
  { width: 800, height: 600, scale: '1.2', language: 'German' },
  { width: 1280, height: 720, scale: '0.8', language: 'English' },
];

for (const layout of layouts) {
  test(`menu layout ${layout.width}x${layout.height}, scale ${layout.scale}, ${layout.language}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(layout);
    await page.goto('/?debug=1');
    await page.getByTestId('new-game-button').waitFor();
    await expectPanelFits(page);
    await capture(page, testInfo, 'main-menu');
    await page.getByTestId('settings-button').click();
    if (layout.scale !== '1' || layout.language !== 'English') {
      await page.locator('.settings-tab').nth(3).click();
      await page.getByRole('combobox', { name: 'UI scale', exact: true }).selectOption(layout.scale);
      await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption(layout.language);
    }

    for (const [index, category] of ['Display', 'Gameplay', 'Audio', 'Accessibility', 'Controls'].entries()) {
      const tab = page.locator('.settings-tab').nth(index);
      await tab.click();
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await expectPanelFits(page);
      const section = page.locator(`fieldset[data-section="${category}"]`);
      await expect(section).toBeVisible();
      const overflow = await page.locator('.settings-body').evaluate(el => el.scrollWidth - el.clientWidth);
      expect(overflow, `${category} must not scroll horizontally`).toBeLessThanOrEqual(1);
      for (const action of await page.locator('.settings-footer button').all()) {
        await expect(action).toBeInViewport({ ratio: 1 });
        expect(await action.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      }
      const targets = await section.locator('input, select, button').evaluateAll(controls => controls.map(control => {
        const target = control instanceof HTMLInputElement && control.type === 'checkbox' ? control.closest('label')! : control;
        const rect = target.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
      for (const target of targets) {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      }
      await capture(page, testInfo, `settings-${category.toLowerCase()}`);
      const lastControl = section.locator('input, select, button').last();
      await lastControl.scrollIntoViewIfNeeded();
      // Chromium can round a scrolled edge by a fraction of a CSS pixel.
      await expect(lastControl).toBeInViewport({ ratio: 0.99 });
    }
    await page.locator('.settings-footer button').last().click();
    await expect(page.locator('#game-overlay')).toHaveAttribute('data-screen', 'menu');
    await expectPanelFits(page);
    await capture(page, testInfo, 'main-menu-scaled');
    expect(errors).toEqual([]);
  });
}

test('settings keyboard navigation, rebinding, cancel and resets remain usable', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.getByTestId('new-game-button').waitFor();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('settings-button')).toBeFocused();
  await page.keyboard.press('Enter');
  const firstTab = page.locator('.settings-tab').first();
  await expect(firstTab).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(firstTab).toBeFocused();
  expect(await firstTab.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');

  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  const up = page.locator('.setting-row').filter({ hasText: 'Move up' }).getByRole('button');
  await up.click();
  await page.keyboard.press('KeyZ');
  await expect(up).toHaveText('KeyZ');
  await up.click();
  await page.keyboard.press('Escape');
  await expect(up).toHaveText('KeyZ');
  await expect(page.locator('#game-overlay')).toHaveAttribute('data-screen', 'settings');
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-overlay')).toHaveAttribute('data-screen', 'menu');
  await page.reload();
  await page.getByTestId('settings-button').click();
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(up).toHaveText('KeyZ');
  await page.getByRole('button', { name: 'Reset controls', exact: true }).click();
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(up).toHaveText('KeyW');
  await page.getByRole('button', { name: 'Display', exact: true }).click();
  await page.getByRole('combobox', { name: 'Frame limit', exact: true }).selectOption('120');
  await page.getByRole('button', { name: 'Reset settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Frame limit', exact: true })).toHaveValue('60');
});

test('welcome, pause, character and game-over share the theme and return to gameplay', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('/?debug=1');
  await page.getByTestId('new-game-button').click();
  await expect(page.locator('#game-overlay')).toHaveAttribute('data-screen', 'welcome');
  await expectPanelFits(page);
  await capture(page, testInfo, 'welcome');
  await page.getByRole('button', { name: 'Start tutorial', exact: true }).click();
  await expect(page.locator('#game-overlay')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('resume-button')).toBeVisible();
  await expectPanelFits(page);
  await capture(page, testInfo, 'paused');
  await page.getByTestId('settings-button').click();
  await capture(page, testInfo, 'settings-over-paused-world');
  await page.keyboard.press('Escape');
  await page.getByTestId('resume-button').click();
  await page.keyboard.press('KeyC');
  await expect(page.locator('#game-overlay')).toHaveAttribute('data-screen', 'character');
  await expectPanelFits(page);
  await capture(page, testInfo, 'character');
  const resume = page.getByRole('button', { name: 'Resume', exact: true });
  await expect(resume).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(resume).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game-overlay')).toBeHidden();
  await page.evaluate(() => window.__GAME__!.setPlayerHealth(0));
  await expect(page.locator('#game-overlay')).toHaveAttribute('data-screen', 'gameover');
  await expectPanelFits(page);
  await capture(page, testInfo, 'game-over');
});

test('blocked menu video falls back to the woodland poster', async ({ page }, testInfo) => {
  await page.route('**/assets/video/menu_vid.webm', route => route.abort());
  await page.goto('/?debug=1');
  const overlay = page.locator('#game-overlay');
  await expect(overlay).toHaveAttribute('data-video', 'fallback');
  await expect(page.locator('.menu-backdrop')).toBeHidden();
  await expectPanelFits(page);
  await capture(page, testInfo, 'poster-fallback');
  await page.getByTestId('tutorial-button').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-button').click();
  await expect(overlay).toHaveAttribute('data-backdrop', 'world');
  expect(await overlay.evaluate(el => getComputedStyle(el).backgroundImage)).not.toContain('woodland_menu');
});
