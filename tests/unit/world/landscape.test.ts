import { expect, it } from 'vitest';
import { LandscapePlan, landscapeFor, invalidateLandscape } from '../../../src/world/LandscapePlan';
import { hasClearPath, invalidatePropIndex } from '../../../src/systems/CollisionSystem';
import { PLAYER_FOOTPRINT } from '../../../src/systems/EntityFootprint';
import { bridgeGeometry } from '../../../src/world/BridgeGeometry';
import { formatLandscapeInspection, inspectLandscape } from '../../../src/world/LandscapeInspector';
import { requiredBridgeAccess, requiredNestAccess } from '../../../src/world/LandscapeAccess';
import { placeWoodland } from '../../../src/world/generation/woodland';
import { GenGrid } from '../../../src/world/generation/GenGrid';
import { LandscapeTrace } from '../../../src/world/LandscapeTrace';
import { Rng } from '../../../src/world/Rng';
import { Tile } from '../../../src/types/tiles';
import type { WorldData } from '../../../src/types/world';
import { bridgeFixture } from '../../fixtures/bridge-world';
import { landscapeFixture } from '../../fixtures/landscape-world';

it('shares actual cliff geometry and swept walking/jumping transitions', () => {
  const w = landscapeFixture(),
    plan = landscapeFor(w);
  const rock = w.props.find((p) => p.hilltop?.sourceX === 70 && p.hilltop.sourceY === 96)!;
  expect(plan.surfaceAt(70.5, 96.5)).toMatchObject({
    kind: 'ground',
    elevation: 1,
    plateau: { id: expect.stringMatching(/^plateau:/) },
  });
  const a = { x: 69.5, y: 96.2875 },
    b = { x: 71.5, y: 96.2875 };
  for (const profile of ['player', 'jumping', 'groundEnemy'] as const)
    expect(plan.canTraverse(a, b, PLAYER_FOOTPRINT, profile)).toBe(
      hasClearPath(w, a.x, a.y, b.x, b.y, PLAYER_FOOTPRINT, profile),
    );
  expect(plan.canTraverse(a, b, PLAYER_FOOTPRINT)).toBe(false);
  expect(plan.canTraverse(a, b, PLAYER_FOOTPRINT, 'jumping')).toBe(true);
  expect(rock.kind).toBe('rock_boulder');
  const stair = w.tiles.findIndex((t) => t === Tile.STAIRS);
  const info = plan.surfaceAt((stair % 150) + 0.5, Math.floor(stair / 150) + 0.5);
  expect(info.stairDirection).not.toBeNull();
  expect(info.cliffBounds.length).toBeGreaterThan(0);
  expect(plan.surfaceAt(-0.1, 0).tile).toBe(Tile.BORDER);
  expect(plan.plateauAt(-1, 96)).toBeNull();
});

it('keeps water identity under bridge decks and across legacy channel cells', () => {
  const { world, bridge } = bridgeFixture();
  const g = bridgeGeometry(bridge),
    plan = landscapeFor(world);
  const x = bridge.x + 1.5,
    y = bridge.y + 1;
  expect(plan.surfaceAt(x, y)).toMatchObject({
    kind: 'deck',
    water: { id: expect.stringMatching(/^water:/) },
    bridgeDecks: [{ id: bridge.id, bounds: g.deck }],
  });
  const before = plan.waterAt(Math.floor(x), Math.floor(y))?.id;
  world.tiles[Math.floor(y) * world.meta.width + Math.floor(x)] = Tile.LOG;
  invalidateLandscape(world);
  expect(landscapeFor(world).waterAt(Math.floor(x), Math.floor(y))?.id).toBe(before);
  expect(plan.surfaceAt(x, g.deck.minY - 0.01).kind).toBe('water');
  expect(requiredBridgeAccess(landscapeFor(world), bridge).ok).toBe(true);
});

it('preserves the exact inclusive stair and strict gameplay-point thresholds', () => {
  const { world } = bridgeFixture();
  world.tiles[10 * 48 + 10] = Tile.STAIRS;
  const plan = new LandscapePlan(
    {
      ...world,
      spawn: { x: 30, y: 30 },
      portal: { x: 40, y: 40 },
      enemySpawns: [],
      pickupSpawns: [],
    },
    'objects',
  );
  expect(plan.protectedStairAt({ x: 12, y: 12 })).toBe(true);
  expect(plan.protectedStairAt({ x: 13, y: 12 })).toBe(false);
  const bounds = { minX: 28, minY: 28, maxX: 29, maxY: 29 };
  expect(plan.hilltopRejection({ x: 28.5, y: 30 }, bounds, 'absent')).toBeNull();
  expect(plan.hilltopRejection({ x: 28.5001, y: 30 }, bounds, 'absent')).toBe('gameplay-position');
  const bridge = plan.reservations().find((r) => r.kind === 'bridge')!;
  expect(
    plan
      .conflicts({ ...bridge.bounds, minX: bridge.bounds.maxX, maxX: bridge.bounds.maxX + 1 }, [
        'bridge',
      ])
      .some((r) => r.id === bridge.id),
  ).toBe(false);
});

it('uses shared protections to change real woodland decisions without changing its RNG consumption', () => {
  const grid = new GenGrid(32, 32, Tile.FOREST),
    other = new GenGrid(32, 32, Tile.FOREST);
  grid.set(8, 8, Tile.STAIRS);
  other.set(8, 8, Tile.STAIRS);
  const spawn = { x: 16, y: 16 },
    nest = { id: 'nest:fixture', kind: 'nest' as const, x: 23.5, y: 23.5 };
  const base = { meta: grid, tiles: grid.tiles, props: [], spawn, encounterSites: [nest] };
  const plan = new LandscapePlan(base, 'woodland'),
    trace = new LandscapeTrace(),
    rng = new Rng(7),
    otherRng = new Rng(7);
  const trees = placeWoodland(grid, rng, spawn, plan, trace);
  const unreserved = placeWoodland(other, otherRng, spawn);
  expect(trees).not.toEqual(unreserved);
  expect(rng.getState()).toBe(otherRng.getState());
  expect(trees.every((p) => plan.woodlandRejection({ x: p.tileX, y: p.tileY }) === null)).toBe(
    true,
  );
  expect(trace.inspect().entries.some((e) => e.reasons.includes(nest.id))).toBe(true);
  expect(trace.inspect().entries.some((e) => e.reasons.includes('stair-approach'))).toBe(true);
  expect(trace.inspect().counts.woodland.rejected).toBeGreaterThan(256);
  expect(trace.inspect().entries).toHaveLength(256);
});

it('rebuilds stable regions, summit protections and source reservations independent of query and source order', () => {
  const w = landscapeFixture(),
    reversed = {
      ...w,
      props: [...w.props].reverse(),
      bridges: [...w.bridges!].reverse(),
      encounterSites: [...w.encounterSites!].reverse(),
    };
  const a = landscapeFor(w),
    b = landscapeFor(reversed);
  const coords = Array.from({ length: w.tiles.length }, (_, i) => ({
    x: i % 150,
    y: Math.floor(i / 150),
  }));
  const ids = (p: LandscapePlan, points: typeof coords) =>
    points.map((at) => [at.x, at.y, p.plateauAt(at.x, at.y)?.id, p.waterAt(at.x, at.y)?.id]);
  expect(ids(a, coords)).toEqual(ids(b, [...coords].reverse()).reverse());
  expect([...a.summits()]).toEqual([...b.summits()]);
  expect(a.reservations()).toEqual(b.reservations());
  expect(inspectLandscape(w, 70.5, 96.5).placement.hilltop.accepted).toBe(true);
  const terminal = formatLandscapeInspection(inspectLandscape(w, 70.5, 96.5));
  expect(terminal).toContain('Hilltop hypothetical: accepted');
  expect(terminal).toContain('hilltop-objects:1');
  expect(terminal.split('\n').length).toBeLessThan(20);
  const sharedSpawn = { type: 'mantis' as const, x: 30, y: 30 };
  const duplicatePoints = landscapeFor({ ...w, enemySpawns: [sharedSpawn, sharedSpawn] });
  expect(duplicatePoints.reservations().filter((r) => r.kind === 'enemy-spawn')).toHaveLength(1);
});

it('invalidates derived topology, reservations and live occupancy when authoritative state changes', () => {
  const w = landscapeFixture(),
    initial = landscapeFor(w);
  expect(initial.plateauAt(70, 96)).not.toBeNull();
  w.tiles[96 * 150 + 70] = Tile.RIVER;
  invalidateLandscape(w);
  const changed = landscapeFor(w);
  expect(changed).not.toBe(initial);
  expect(changed.plateauAt(70, 96)).toBeNull();
  expect(changed.waterAt(70, 96)).not.toBeNull();
  const moved = { ...w, encounterSites: w.encounterSites!.map((s) => ({ ...s, x: s.x + 1 })) };
  expect(landscapeFor(moved).reservations()).not.toEqual(changed.reservations());
});

it('distinguishes failed required access from optional placement space', () => {
  const { world, bridge } = bridgeFixture(),
    plan = new LandscapePlan(world, 'access');
  const blocked: WorldData = {
    ...world,
    props: [{ id: 99, kind: 'tree', solid: true, tileX: bridge.x - 1, tileY: bridge.y + 1 }],
  };
  expect(requiredBridgeAccess(plan, bridge).ok).toBe(true);
  expect(requiredBridgeAccess(new LandscapePlan(blocked, 'access'), bridge).ok).toBe(false);
  const nest = { id: 'nest:blocked', kind: 'nest' as const, x: 0.5, y: 0.5 };
  expect(requiredNestAccess(plan, world.spawn, nest).ok).toBe(false);
});

it('reflects removal of solid objects through the existing collision invalidation seam', () => {
  const w = landscapeFixture(),
    before = landscapeFor(w);
  expect(before.canOccupy(70.5, 96.2875, PLAYER_FOOTPRINT)).toBe(false);
  const props = w.props as import('../../../src/types/world').WorldProp[];
  props.splice(
    props.findIndex((p) => p.hilltop?.sourceX === 70 && p.hilltop.sourceY === 96),
    1,
  );
  invalidatePropIndex(w);
  invalidateLandscape(w);
  const after = landscapeFor(w);
  expect(after.canOccupy(70.5, 96.2875, PLAYER_FOOTPRINT)).toBe(true);
  expect(after.plateauAt(70, 96)).toEqual(before.plateauAt(70, 96));
});
