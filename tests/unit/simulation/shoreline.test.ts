import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { IDLE_INTENT } from '../../../src/types/entities';
import { Tile } from '../../../src/types/tiles';
import { canOccupy, moveWithCollision } from '../../../src/systems/CollisionSystem';
import { PLAYER_FOOTPRINT as F } from '../../../src/systems/EntityFootprint';
import { shorelineFixture } from '../../fixtures/shoreline-world';
import { bridgeFixture } from '../../fixtures/bridge-world';
import { supportingSurface } from '../../../src/systems/SurfaceState';

function swimming(s: Simulation) {
  return s.buildRenderSnapshot().entities.find((e) => e.kind === 'player')!.submerged;
}

describe('raised shoreline contact', () => {
  for (const fps of [30, 60, 144])
    for (const side of ['land', 'water'] as const)
      for (const diagonal of [false, true])
        it(`${side} stays valid and ${side === 'land' ? 'dry' : 'wet'} at ${fps}Hz, diagonal=${diagonal}`, () => {
          const s = new Simulation();
          s.loadWorld(shorelineFixture());
          s.setPlayerPosition(10.5, side === 'land' ? 16.6 : 19);
          for (let i = 0; i < fps; i++) {
            s.step(1 / fps, {
              ...IDLE_INTENT,
              moveY: side === 'land' ? 1 : -1,
              moveX: diagonal ? 1 : 0,
              sprint: true,
            });
            expect(canOccupy(s.world, s.player.x, s.player.y, F)).toBe(true);
            expect(swimming(s)).toBe(side === 'water');
          }
          expect(s.player.y).toBeCloseTo(side === 'land' ? 17.0625 : 17.8875, 7);
        });

  it('blocks the painted north concave corner beside a water notch', () => {
    const world = shorelineFixture();
    world.tiles[9 * 24 + 9] = Tile.RIVER;
    // Both cardinal neighbours are raised, but the north-west diagonal is water.
    // The atlas paints a 6x4px rim in the NW corner of (10,10).
    expect(canOccupy(world, 10.3, 10.08 - F.offsetY, F)).toBe(false);
  });

  it('keeps stair cheeks solid while the intended flight stays open', () => {
    const world = shorelineFixture();
    world.tiles[17 * 24 + 12] = Tile.STAIRS;
    expect(canOccupy(world, 12.22, 17.6 - F.offsetY, F)).toBe(false);
    expect(canOccupy(world, 12.5, 17.6 - F.offsetY, F)).toBe(true);
  });

  it('enters and leaves water at an accessible shore with one resolved surface state', () => {
    const s = new Simulation();
    s.loadWorld(shorelineFixture());
    s.setPlayerPosition(2.5, 17.5 - F.offsetY);
    for (const direction of [1, -1]) {
      let transitions = 0,
        previous = swimming(s);
      for (let i = 0; i < 30; i++) {
        s.step(1 / 60, { ...IDLE_INTENT, moveY: direction });
        const current = swimming(s);
        expect(current).toBe(supportingSurface(s.world, s.player).kind === 'water');
        if (current !== previous) transitions++;
        previous = current;
      }
      expect(transitions).toBe(1);
      expect(swimming(s)).toBe(direction === 1);
      const before = s.player.y;
      s.step(1 / 60, { ...IDLE_INTENT, moveY: direction });
      expect(Math.abs(s.player.y - before)).toBeCloseTo(
        (6.25 / 60) * (direction === 1 ? 1 / 1.5 : 1),
      );
    }
  });

  it('cannot slip through outer corners or concave water notches', () => {
    const world = shorelineFixture();
    world.tiles[17 * 24 + 17] = Tile.RIVER;
    world.tiles[16 * 24 + 17] = Tile.RIVER;
    const s = new Simulation();
    s.loadWorld(world);
    for (const start of [
      { x: 15, y: 15 },
      { x: 19, y: 19 },
      { x: 4, y: 19 },
    ])
      for (const dx of [-1, 1])
        for (const dy of [-1, 1]) {
          s.setPlayerPosition(start.x, start.y);
          for (let i = 0; i < 90; i++) {
            s.step(1 / 60, { ...IDLE_INTENT, moveX: dx, moveY: dy, sprint: true });
            expect(canOccupy(world, s.player.x, s.player.y, F)).toBe(true);
          }
        }
  });

  it('preserves saved terrain and progress, relocating only invalid feet', () => {
    const s = new Simulation();
    const world = shorelineFixture(),
      tiles = world.tiles.slice();
    s.loadWorld(world);
    s.setPlayerPosition(12.5, 17.0625);
    s.player.stats.coins = 1234;
    s.player.inventory.healthPotions = 3;
    const entities = structuredClone([...s.getEntities()]);
    s.loadWorld(world);
    s.restoreEntities(entities, 0.3, 1250, 2);
    expect(s.player.y).toBe(17.0625);
    expect(s.player.stats.coins).toBe(1234);
    expect(s.player.inventory.healthPotions).toBe(3);
    expect(swimming(s)).toBe(false);
    const invalid = structuredClone(entities);
    Object.assign(
      invalid.find((e) => e.kind === 'player')!,
      { y: 17.6 },
    );
    s.restoreEntities(invalid, 0.3, 1250, 2);
    expect(canOccupy(world, s.player.x, s.player.y, F)).toBe(true);
    expect(s.player.stats.coins).toBe(1234);
    expect(world.tiles).toEqual(tiles);
    expect(world.bridges).toEqual([]);
  });

  for (const orientation of ['horizontal', 'vertical'] as const)
    it(`${orientation} raised bridge landings open only beneath the deck`, () => {
      const { world, bridge } = bridgeFixture(orientation);
      const horizontal = orientation === 'horizontal';
      for (let y = 1; y < 47; y++)
        for (let x = 1; x < 47; x++)
          if (world.tiles[y * 48 + x] === Tile.GRASS) world.tiles[y * 48 + x] = Tile.PLATEAU;
      const s = new Simulation();
      s.loadWorld(world);
      const start = {
        x: bridge.x + (horizontal ? -1 : 1),
        y: bridge.y + (horizontal ? 1 : -1) - F.offsetY,
      };
      const dx = horizontal ? bridge.span + 4 : 0,
        dy = horizontal ? 0 : bridge.span + 4;
      s.setPlayerPosition(start.x, start.y);
      moveWithCollision(world, s.player, dx, dy);
      expect(s.player.x).toBeCloseTo(start.x + dx);
      expect(s.player.y).toBeCloseTo(start.y + dy);
      expect(swimming(s)).toBe(false);
      moveWithCollision(world, s.player, -dx, -dy);
      expect(s.player.x).toBeCloseTo(start.x);
      expect(s.player.y).toBeCloseTo(start.y);
      // The adjacent bank remains a wall, even within the broad placement reservation.
      s.setPlayerPosition(
        bridge.x + (horizontal ? -1 : -0.5),
        bridge.y + (horizontal ? -0.5 : -1) - F.offsetY,
      );
      moveWithCollision(world, s.player, dx, dy);
      expect(horizontal ? s.player.x : s.player.y).toBeLessThan(
        (horizontal ? bridge.x : bridge.y) + 1,
      );
    });
});
