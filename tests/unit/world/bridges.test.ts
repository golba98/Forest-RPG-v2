import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../../src/config/GameConfig';
import { Tile } from '../../../src/types/tiles';
import {
  bridgeGeometry,
  boundsOverlap,
  bridgeReservations,
} from '../../../src/world/BridgeGeometry';
import { placeBridges, validBridgeTerrain } from '../../../src/world/generation/bridges';
import { Rng } from '../../../src/world/Rng';
import { placeWoodland } from '../../../src/world/generation/woodland';
import { placeProps } from '../../../src/world/generation/placement';
import { bridgeFixture } from '../../fixtures/bridge-world';

for (const orientation of ['horizontal', 'vertical'] as const)
  describe(`${orientation} bridge generation`, () => {
    for (let span = 1; span <= GAME_CONFIG.world.bridges.maxSpan; span++)
      it(`spans ${span} water tiles without changing terrain`, () => {
        const { grid, world, bridge } = bridgeFixture(orientation, span);
        const before = grid.tiles.slice();
        expect(validBridgeTerrain(grid, bridge)).toBe(true);
        const placed = placeBridges(grid, world.spawn, new Rng(17));
        expect(placed.length).toBeGreaterThan(0);
        expect(placed).toEqual(placeBridges(grid, world.spawn, new Rng(17)));
        expect(
          placed.every(
            (b) => b.orientation === orientation && b.span === span && validBridgeTerrain(grid, b),
          ),
        ).toBe(true);
        expect(grid.tiles).toEqual(before);
        for (const a of placed)
          for (const b of placed) {
            if (a.id === b.id) continue;
            const f = bridgeGeometry(a).footprint,
              g = bridgeGeometry(b).footprint;
            expect(
              Math.hypot(
                Math.max(0, f.minX - g.maxX, g.minX - f.maxX),
                Math.max(0, f.minY - g.maxY, g.minY - f.maxY),
              ),
            ).toBeGreaterThanOrEqual(GAME_CONFIG.world.bridges.minSpacing);
          }
      });
    it('rejects incomplete water gaps, high banks and obstructed approaches', () => {
      for (const tile of [Tile.RIVER, Tile.HILL_W, Tile.BORDER, Tile.FOREST]) {
        const { grid, bridge } = bridgeFixture(orientation);
        const a = bridgeGeometry(bridge).approaches[0]!;
        grid.set(a.minX, a.minY, tile);
        expect(validBridgeTerrain(grid, bridge)).toBe(false);
      }
      const { grid, bridge } = bridgeFixture(orientation);
      grid.set(
        orientation === 'horizontal' ? 21 : bridge.x,
        orientation === 'horizontal' ? bridge.y : 21,
        Tile.GRASS,
      );
      expect(validBridgeTerrain(grid, bridge)).toBe(false);
    });
  });

it('does not build over wide water or redundant short detours', () => {
  const { grid, world } = bridgeFixture('horizontal', 7);
  expect(placeBridges(grid, world.spawn, new Rng(3))).toEqual([]);
  grid.tiles.fill(Tile.GRASS);
  grid.set(20, 20, Tile.RIVER);
  grid.set(20, 21, Tile.RIVER);
  expect(placeBridges(grid, world.spawn, new Rng(3))).toEqual([]);
});

it('protects the complete deck and approach from trees, canopies and decorations', () => {
  const { grid, world, bridge } = bridgeFixture();
  const f = bridgeGeometry(bridge).footprint;
  for (let y = f.minY - 4; y < f.maxY + 4; y++)
    for (let x = f.minX - 4; x < f.maxX + 4; x++)
      if (grid.get(x, y) === Tile.GRASS) grid.set(x, y, Tile.FOREST);
  const trees = placeWoodland(grid, new Rng(13), world.spawn, [bridge]);
  const props = placeProps(grid, world.spawn, world.portal, new Rng(14), true, trees, [bridge]);
  for (const p of [...trees, ...props]) {
    const bounds =
      p.kind === 'tree'
        ? { minX: p.tileX - 0.5, minY: p.tileY - 1, maxX: p.tileX + 1.5, maxY: p.tileY + 1 }
        : { minX: p.tileX, minY: p.tileY - 0.5, maxX: p.tileX + 1, maxY: p.tileY + 1 };
    expect(bridgeReservations(bridge).some((r) => boundsOverlap(bounds, r))).toBe(false);
  }
});
