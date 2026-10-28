import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { generateWorld } from '../../src/world/WorldGenerator';
import { Tile, isHillTile, type TileId } from '../../src/types/tiles';
import type { WorldData } from '../../src/types/world';

/**
 * Deterministic visual QA captures. Run with VISUAL_PHASE=before|after to fill
 * docs/qa/screens/<phase>/. Scenes are chosen from the same seeded world the
 * game generates, so before/after pairs show identical terrain.
 */
const PHASE = process.env.VISUAL_PHASE ?? 'after';
const OUT = `docs/qa/screens/${PHASE}`;
mkdirSync(OUT, { recursive: true });

const elevated = (w: WorldData, x: number, y: number): boolean => {
  const t = w.tiles[y * w.meta.width + x] as TileId;
  return isHillTile(t) || t === Tile.PLATEAU;
};
const walkable = (w: WorldData, x: number, y: number): boolean => {
  const t = w.tiles[y * w.meta.width + x];
  return t === Tile.GRASS || t === Tile.FLOWERS || t === Tile.MUD;
};

/** Walkable tile directly below the south rim of the largest nearby hill mass. */
function hillViewpoint(w: WorldData): { x: number; y: number } {
  let best = { x: w.spawn.x, y: w.spawn.y, score: -1 };
  for (let y = 8; y < w.meta.height - 8; y++) for (let x = 8; x < w.meta.width - 8; x++) {
    if (!elevated(w, x, y - 1) || !walkable(w, x, y) || !walkable(w, x, y + 1)) continue;
    let score = 0;
    for (let dy = -7; dy <= 2; dy++) for (let dx = -8; dx <= 8; dx++) if (elevated(w, x + dx, y + dy)) score++;
    if (score > best.score) best = { x, y, score };
  }
  return { x: best.x + 0.5, y: best.y + 2.5 };
}

async function boot(page: Page, query: string): Promise<void> {
  await page.goto(`/?debug=1&autostart=1&${query}`);
  await page.waitForFunction(() => window.__GAME__?.getState().engine.isRunning === true && window.__GAME__.getState().ui.currentMenu === null);
  // Midday, so lighting does not vary between captures.
  await page.evaluate(() => window.__GAME__!.setDaylightRatio(0.5));
}

async function teleport(page: Page, x: number, y: number, settleMs = 900): Promise<void> {
  await page.evaluate(([px, py]) => window.__GAME__!.setPlayerPosition(px!, py!), [x, y]);
  await page.waitForTimeout(settleMs);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1280, height: 720 } });

for (const seed of [42, 1, 1337]) {
  test(`seed ${seed}: forest, hills and portal`, async ({ page }) => {
    const world = generateWorld({ seed, level: 1, difficulty: 'normal' });
    await boot(page, `seed=${seed}`);
    await shot(page, `seed${seed}-01-spawn`);
    const hill = hillViewpoint(world);
    await teleport(page, hill.x, hill.y);
    await shot(page, `seed${seed}-02-hill`);
    const portal = world.portal;
    await teleport(page, portal.x + 0.5, portal.y + 4.5);
    await shot(page, `seed${seed}-03-portal-locked`);
    await teleport(page, portal.x + 0.5, portal.y + 2.2, 350);
    await shot(page, `seed${seed}-04-portal-approach`);
    await page.evaluate(() => { window.__GAME__!.executeCommand('/kill all'); window.__GAME__!.executeCommand('/collect all'); });
    await teleport(page, portal.x + 0.5, portal.y + 4.5);
    await expect.poll(() => page.evaluate(() => window.__GAME__!.getState().world.isPortalActive)).toBe(true);
    await shot(page, `seed${seed}-05-portal-open`);
  });
}

test('projectiles, night ambience and tutorial', async ({ page }) => {
  await boot(page, 'seed=42');
  await page.evaluate(() => window.__GAME__!.setPlayerMana(100));
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(120);
  await shot(page, 'misc-01-magic-bolt');
  await page.evaluate(() => window.__GAME__!.setDaylightRatio(0.02));
  await page.waitForTimeout(600);
  await shot(page, 'misc-02-night');
  await boot(page, 'tutorial=1');
  await shot(page, 'misc-03-tutorial');
});
