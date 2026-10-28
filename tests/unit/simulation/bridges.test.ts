import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { IDLE_INTENT } from '../../../src/types/entities';
import { canOccupy, hasClearPath, moveWithCollision } from '../../../src/systems/CollisionSystem';
import { PLAYER_FOOTPRINT } from '../../../src/systems/EntityFootprint';
import { bridgeGeometry, onBridgeDeck } from '../../../src/world/BridgeGeometry';
import { findPath } from '../../../src/world/pathfinding';
import { gridOf, isWalkableForMobs, speedMultiplierAt } from '../../../src/world/TileMap';
import { bridgeFixture } from '../../fixtures/bridge-world';

for (const orientation of ['horizontal', 'vertical'] as const)
  describe(`${orientation} bridge traversal`, () => {
    const horizontal = orientation === 'horizontal';
    for (const cross of [0.42, 1, 1.58])
      it(`walks both ways without seams at cross-offset ${cross}`, () => {
        const { world, bridge } = bridgeFixture(orientation, 6),
          s = new Simulation();
        s.loadWorld(world);
        const point = (a: number) => ({
          x: bridge.x + (horizontal ? a : cross),
          y: bridge.y + (horizontal ? cross : a) - PLAYER_FOOTPRINT.offsetY,
        });
        const start = point(-1),
          end = point(bridge.span + 3);
        s.setPlayerPosition(start.x, start.y);
        moveWithCollision(world, s.player, end.x - start.x, end.y - start.y);
        expect(s.player.x).toBeCloseTo(end.x);
        expect(s.player.y).toBeCloseTo(end.y);
        moveWithCollision(world, s.player, start.x - end.x, start.y - end.y);
        expect(s.player.x).toBeCloseTo(start.x);
        expect(s.player.y).toBeCloseTo(start.y);
      });
    it('stays dry at full speed and retains swimming beside the structure', () => {
      const { world, bridge } = bridgeFixture(orientation),
        s = new Simulation();
      s.loadWorld(world);
      const x = bridge.x + (horizontal ? 2 : 1),
        y = bridge.y + (horizontal ? 1 : 2) - PLAYER_FOOTPRINT.offsetY;
      s.setPlayerPosition(x, y);
      const rendered = () => s.buildRenderSnapshot().entities.find((e) => e.id === s.player.id)!;
      expect(rendered().submerged).toBe(false);
      expect(s.getGameplayDebug().terrain.category).toBe('crossing');
      s.step(1 / 60, { ...IDLE_INTENT, moveX: horizontal ? 1 : 0, moveY: horizontal ? 0 : 1 });
      expect(Math.hypot(s.player.x - x, s.player.y - y)).toBeCloseTo(6.25 / 60);
      s.setPlayerPosition(x + (horizontal ? 0 : -2), y + (horizontal ? -2 : 0));
      expect(rendered().submerged).toBe(true);
      const sx = s.player.x,
        sy = s.player.y;
      s.step(1 / 60, { ...IDLE_INTENT, moveX: horizontal ? 1 : 0, moveY: horizontal ? 0 : 1 });
      expect(Math.hypot(s.player.x - sx, s.player.y - sy)).toBeCloseTo(6.25 / 1.5 / 60);
    });
    it('blocks sideways walking, slides along rails, and permits existing jump behavior', () => {
      const { world, bridge } = bridgeFixture(orientation),
        s = new Simulation();
      s.loadWorld(world);
      const x = bridge.x + (horizontal ? 2 : 1),
        y = bridge.y + (horizontal ? 1 : 2) - PLAYER_FOOTPRINT.offsetY;
      s.setPlayerPosition(x, y);
      moveWithCollision(world, s.player, horizontal ? 0.6 : -3, horizontal ? -3 : 0.6);
      expect(onBridgeDeck(world, s.player.x, s.player.y + PLAYER_FOOTPRINT.offsetY)).toBe(true);
      expect(horizontal ? s.player.x - x : s.player.y - y).toBeCloseTo(0.6);
      s.setPlayerPosition(x, y);
      moveWithCollision(world, s.player, horizontal ? 0 : -2, horizontal ? -2 : 0, 'jumping');
      expect(horizontal ? s.player.y : s.player.x).toBeCloseTo((horizontal ? y : x) - 2);
    });
    it('gives ground enemies a dry path while preserving water collision beside the deck', () => {
      const { world, bridge } = bridgeFixture(orientation);
      const g = bridgeGeometry(bridge);
      const from = { x: bridge.x, y: bridge.y },
        to = {
          x: horizontal ? bridge.x + bridge.span + 1 : bridge.x,
          y: horizontal ? bridge.y : bridge.y + bridge.span + 1,
        };
      const open = (x: number, y: number) => canOccupy(world, x + 0.5, y + 0.5, 0.3, 'groundEnemy');
      const grid = gridOf(world);
      const deckX = bridge.x + (horizontal ? 2 : 1),
        deckY = bridge.y + (horizontal ? 1 : 2);
      expect(isWalkableForMobs(grid, deckX, deckY)).toBe(true);
      expect(speedMultiplierAt(grid, deckX, deckY)).toBe(1);
      expect(findPath(world.meta, from, to, open, 2500)).not.toBeNull();
      expect(
        hasClearPath(world, from.x + 0.5, from.y + 0.5, to.x + 0.5, to.y + 0.5, 0.3, 'groundEnemy'),
      ).toBe(true);
      const x = bridge.x + (horizontal ? 2 : -0.5),
        y = bridge.y + (horizontal ? -0.5 : 2);
      expect(canOccupy(world, x, y, 0.1, 'groundEnemy')).toBe(false);
      expect(canOccupy(world, x, y, 0.1)).toBe(true);
      expect(isWalkableForMobs(grid, Math.floor(x), Math.floor(y))).toBe(false);
      expect(speedMultiplierAt(grid, x, y)).toBeCloseTo(1 / 1.5);
      expect(
        canOccupy(
          world,
          (g.deck.minX + g.deck.maxX) / 2,
          (g.deck.minY + g.deck.maxY) / 2,
          0.3,
          'ghost',
        ),
      ).toBe(true);
    });
    it('supports sprint, dash and diagonal approaches without snagging', () => {
      const { world, bridge } = bridgeFixture(orientation, 6),
        s = new Simulation();
      s.loadWorld(world);
      s.setPlayerPosition(
        bridge.x + (horizontal ? -0.5 : 0.7),
        bridge.y + (horizontal ? 0.7 : -0.5) - PLAYER_FOOTPRINT.offsetY,
      );
      for (let i = 0; i < 6; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1, moveY: 1 });
      for (let i = 0; i < 90; i++)
        s.step(1 / 60, {
          ...IDLE_INTENT,
          sprint: true,
          dash: true,
          moveX: horizontal ? 1 : 0,
          moveY: horizontal ? 0 : 1,
        });
      expect(horizontal ? s.player.x : s.player.y + PLAYER_FOOTPRINT.offsetY).toBeGreaterThan(
        (horizontal ? bridge.x : bridge.y) + bridge.span + 2,
      );
    });
  });
