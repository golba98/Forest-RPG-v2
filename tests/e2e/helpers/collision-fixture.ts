import { expect, type Page } from '@playwright/test';

/** Deterministic physical border; a coin keeps the empty fixture's portal locked. */
export async function loadBorderWorld(page: Page): Promise<void> {
  const loaded = await page.evaluate(() => {
    const tiles = Array<number>(144).fill(1);
    for (let n = 0; n < 12; n++) {
      tiles[n] = 12;
      tiles[132 + n] = 12;
      tiles[n * 12] = 12;
      tiles[n * 12 + 11] = 12;
    }
    tiles[10 * 12 + 10] = 103;
    return window.__GAME__!.loadLegacySave({
      logicalW: 12,
      logicalH: 12,
      cellSize: 32,
      mapStates: tiles,
      terrainLayer: tiles.map((t) => (t === 103 ? 1 : t)),
      treeObjects: [],
      playerPosition: { x: 3, y: 3 },
      portalPos: { x: 9, y: 9 },
      enemies: [],
    });
  });
  expect(loaded).toBe(true);
}
