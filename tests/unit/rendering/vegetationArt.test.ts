import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { VEGETATION, vegetationFor } from '../../../src/rendering/vegetationArt';
import { rendererExtraAssets, GROUND_PROPS } from '../../../src/rendering/assetCatalog';
import { getTileArt } from '../../../src/rendering/terrainArt';
import { Tile } from '../../../src/types/tiles';
import { bridgeFixture } from '../../fixtures/bridge-world';
import { propDepth, propFootprint } from '../../../src/world/ObjectSemantics';
import { placeWoodland } from '../../../src/world/generation/woodland';
import { Rng } from '../../../src/world/Rng';
import { boundsOverlap, bridgeReservations } from '../../../src/world/BridgeGeometry';

it('every curated frame is inside its shipped atlas, nonempty and transparent around its silhouette', async () => {
  for (const frame of Object.values(VEGETATION)) {
    const asset = rendererExtraAssets().find((a) => a.alias === frame.atlas)!;
    const path = resolve('public', asset.src);
    const png = readFileSync(path);
    const { x, y, w, h } = frame.rect;
    expect(x + w).toBeLessThanOrEqual(png.readUInt32BE(16));
    expect(y + h).toBeLessThanOrEqual(png.readUInt32BE(20));
    expect(frame.root[0]).toBeGreaterThan(0);
    expect(frame.root[0]).toBeLessThan(w);
    expect(frame.root[1]).toBeLessThanOrEqual(h);
    const { data } = await sharp(path)
      .extract({ left: x, top: y, width: w, height: h })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alpha = Array.from(data).filter((_, i) => i % 4 === 3);
    expect(alpha.some((a) => a === 0)).toBe(true);
    expect(alpha.some((a) => a === 255)).toBe(true);
  }
});

it('legacy saves keep compact native trees and identical prop identities/footprints', () => {
  const { world } = bridgeFixture();
  for (const version of [0, 8, 10, 11]) {
    const old = { ...world, meta: { ...world.meta, generatorVersion: version } };
    for (let x = 4; x < 20; x++) {
      const prop = { id: x, kind: 'tree' as const, tileX: x, tileY: 10, solid: true };
      const before = structuredClone(prop);
      const footprint = propFootprint(prop);
      const frame = vegetationFor(prop, old)!;
      expect(frame.rect.w).toBeLessThanOrEqual(64);
      expect(frame.rect.h).toBeLessThanOrEqual(64);
      expect(vegetationFor(prop, old)).toEqual(frame);
      expect(propFootprint(prop)).toEqual(footprint);
      expect(prop).toEqual(before);
    }
  }
});

it('actual native canopy bounds stay outside bridge reservations', () => {
  const { grid, world, bridge } = bridgeFixture();
  for (let y = 10; y < 30; y++)
    for (let x = 10; x < 30; x++) {
      if (grid.get(x, y) === Tile.GRASS) grid.set(x, y, Tile.FOREST);
    }
  const props = placeWoodland(grid, new Rng(42), world.spawn, [bridge]);
  expect(props.length).toBeGreaterThan(0);
  for (const prop of props) {
    const frame = vegetationFor(prop, { ...world, props })!;
    const minX = prop.tileX + 0.5 - frame.root[0] / 32;
    const minY = prop.tileY + 1 - frame.root[1] / 32;
    const bounds = { minX, minY, maxX: minX + frame.rect.w / 32, maxY: minY + frame.rect.h / 32 };
    expect(bridgeReservations(bridge).some((r) => boundsOverlap(bounds, r))).toBe(false);
  }
});

it('both flower terrain and hilltop vegetation draw native LPC frames', () => {
  let hillPlants = 0;
  for (let x = 0; x < 80; x++) {
    expect(getTileArt(Tile.FLOWERS, x, 12)[1]?.alias).toBe('lpc_plants');
    const layers = getTileArt(Tile.PLATEAU, x, 12, 255);
    for (const layer of layers) {
      expect(layer.alias).not.toMatch(/^decor_(flower|bush)/);
      if (layer.alias === 'lpc_plants') {
        hillPlants++;
        expect(layer.maxWidthTiles).toBe(1);
      }
    }
  }
  expect(hillPlants).toBeGreaterThan(0);
});

it('transparent solid vegetation sorts between actors standing behind and in front of its base', () => {
  for (const kind of ['log_horizontal', 'log_vertical', 'log_stump', 'bush_obstacle'] as const) {
    const prop = { id: 1, kind, tileX: 4, tileY: 3, solid: true };
    expect(GROUND_PROPS.has(kind)).toBe(false);
    expect(propDepth(prop)).toBeGreaterThan(3.5);
    expect(propDepth(prop)).toBeLessThan(3.8);
  }
});
