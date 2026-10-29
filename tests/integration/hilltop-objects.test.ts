// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { generateWorld } from '../../src/world/WorldGenerator';
import { prepareHilltopObjects, hasHilltopClearance } from '../../src/world/HilltopObjects';
import { propDepth, propFootprint } from '../../src/world/ObjectSemantics';
import { plateauDecoration } from '../../src/world/HilltopDecoration';
import { elevationMask } from '../../src/world/ElevationTopology';
import { Simulation } from '../../src/simulation/Simulation';
import { IDLE_INTENT } from '../../src/types/entities';
import type { WorldData, WorldProp } from '../../src/types/world';
import { Tile } from '../../src/types/tiles';
import { canOccupy, hasClearPath, moveWithCollision } from '../../src/systems/CollisionSystem';
import { PLAYER_FOOTPRINT as F } from '../../src/systems/EntityFootprint';
import { getTileArt, getWorldPropArt } from '../../src/rendering/terrainArt';
import { SaveManager } from '../../src/persistence/SaveManager';
import type { Game } from '../../src/game/Game';

let world: WorldData;
beforeAll(() => {
  world = generateWorld({ seed: 42, level: 1, difficulty: 'normal' });
});
const hillRock = (w: WorldData) =>
  w.props.find((p) => p.hilltop?.sourceX === 70 && p.hilltop.sourceY === 96)!;
const directions = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const;
function legacy(w: WorldData): WorldData {
  const { hilltopObjectsVersion: _version, ...meta } = w.meta;
  return {
    ...w,
    meta: { ...meta, generatorVersion: 9, riverRepairVersion: 1 },
    props: w.props.filter((p) => !p.hilltop),
  };
}
function fixture(): WorldData {
  return {
    meta: {
      seed: 42,
      generatorVersion: 9,
      width: 24,
      height: 24,
      level: 1,
      difficulty: 'normal',
      isTutorial: false,
    },
    tiles: new Uint8Array(24 * 24).fill(Tile.PLATEAU),
    props: [],
    spawn: { x: 1, y: 1 },
    portal: { x: 22, y: 22 },
    enemySpawns: [],
    pickupSpawns: [],
    encounterSites: [],
  };
}

it('promotes the actual seed-42 decoration through generation and simulation loading', () => {
  const p = hillRock(world);
  expect(p).toMatchObject({ kind: 'rock_boulder', tileX: 70, tileY: 96, solid: true });
  const sim = new Simulation();
  sim.loadWorld(world);
  sim.setPlayerPosition(69.5, 96.2875);
  for (let i = 0; i < 60; i++) sim.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
  expect(sim.player.isJumping).toBe(false);
  expect(sim.player.x).toBeCloseTo(70 + propFootprint(p)!.minX - F.halfWidth);
  // Original implementation had no object, and walked all the way through.
  expect(sim.player.x).toBeLessThan(70);
  expect(prepareHilltopObjects(legacy(world)).props).toEqual(world.props);
});

for (const kind of ['hill', 'ground'] as const)
  describe(`${kind} reference boulder`, () => {
    for (const [dx, dy] of directions)
      it(`blocks a swept ${dx},${dy} approach without penetration`, () => {
        const p =
          kind === 'hill'
            ? hillRock(world)
            : world.props.find(
                (p) => p.tileX === 87 && p.tileY === 37 && p.kind === 'rock_boulder',
              )!;
        const b = propFootprint(p)!;
        // Equal distances to the Minkowski-expanded corner exercise simultaneous
        // diagonal contact, rather than merely sliding past one side of the rock.
        const cx = p.tileX + (b.minX + b.maxX) / 2,
          cy = p.tileY + (b.minY + b.maxY) / 2 - F.offsetY;
        const x =
          dx === 0
            ? cx
            : p.tileX + (dx > 0 ? b.minX - F.halfWidth - 0.1 : b.maxX + F.halfWidth + 0.1);
        const y =
          dy === 0
            ? cy
            : p.tileY +
              (dy > 0
                ? b.minY - F.halfHeight - F.offsetY - 0.1
                : b.maxY + F.halfHeight - F.offsetY + 0.1);
        const sim = new Simulation();
        sim.loadWorld(world);
        sim.setPlayerPosition(x, y);
        expect(canOccupy(sim.world, x, y, F)).toBe(true);
        moveWithCollision(sim.world, sim.player, dx, dy);
        expect(sim.player.x).toBeCloseTo(x + dx * 0.1);
        expect(sim.player.y).toBeCloseTo(y + dy * 0.1);
        expect(canOccupy(sim.world, sim.player.x, sim.player.y, F)).toBe(true);
        expect(hasClearPath(sim.world, x, y, x + dx, y + dy, F)).toBe(false);
      });
    it('retains the intended ability to jump over boulders', () => {
      const p =
        kind === 'hill'
          ? hillRock(world)
          : world.props.find((p) => p.tileX === 87 && p.tileY === 37 && p.kind === 'rock_boulder')!;
      const b = propFootprint(p)!;
      const sim = new Simulation();
      sim.loadWorld(world);
      sim.setPlayerPosition(
        p.tileX + b.minX - F.halfWidth - 0.05,
        p.tileY + (b.minY + b.maxY) / 2 - F.offsetY,
      );
      sim.step(1 / 60, { ...IDLE_INTENT, moveX: 1, jump: true });
      for (let i = 0; i < 29; i++) sim.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
      expect(sim.player.x).toBeGreaterThan(p.tileX + b.maxX + F.halfWidth);
      expect(sim.player.isJumping).toBe(false);
    });
  });

it('uses the old sprite placement exactly once, and sorts by its contact anchor', () => {
  const p = hillRock(world),
    b = propFootprint(p)!;
  expect(getWorldPropArt(p)).toMatchObject({
    maxWidthTiles: 0.9,
    maxHeightTiles: 0.9,
    align: 'center',
    offsetX: 1,
    offsetY: -2,
  });
  for (let n = 0; n < 5; n++)
    expect(
      getTileArt(world.tiles[96 * 150 + 70]!, 70, 96, 255).some((l) => l.alias.includes('boulder')),
    ).toBe(false);
  expect(propDepth(p)).toBeCloseTo(p.tileY + b.maxY - 10 / 32);
  expect(world.props.filter((o) => o.id === p.id)).toHaveLength(1);
});

it('accepts open summit space, rejects a narrow required route including diagonal corner squeezes', () => {
  const w = fixture();
  const p: WorldProp = {
    id: 100,
    kind: 'rock_boulder',
    tileX: 8,
    tileY: 8,
    solid: true,
    hilltop: { sourceX: 8, sourceY: 8 },
  };
  expect(hasHilltopClearance(w, p)).toBe(true);
  // A 1-tile neck linking two rooms; its centres remain connected before placement.
  w.tiles.fill(Tile.GRASS);
  for (let y = 3; y <= 13; y++)
    for (let x = 3; x <= 13; x++) if (y < 7 || y > 9 || x === 8) w.tiles[y * 24 + x] = Tile.PLATEAU;
  expect(hasClearPath(w, 8.5, 5.5, 8.5, 11.5, F)).toBe(true);
  expect(hasHilltopClearance(w, p)).toBe(false);
  const corner = {
    ...fixture(),
    props: [{ id: 1, kind: 'rock_boulder' as const, tileX: 9, tileY: 9, solid: true }],
  };
  expect(hasHilltopClearance(corner, p)).toBe(false);
});

it('relocates stair-adjacent candidates deterministically and omits rocks on tiny summits', () => {
  const w = fixture();
  let source: { x: number; y: number } | undefined;
  for (let y = 4; y < 19; y++)
    for (let x = 4; x < 19; x++)
      if (plateauDecoration(Tile.PLATEAU, x, y, 255)?.kind === 'rock_boulder') source = { x, y };
  expect(source).toBeDefined();
  const s = source!;
  w.tiles[s.y * 24 + s.x + 1] = Tile.STAIRS;
  const a = prepareHilltopObjects(w),
    b = prepareHilltopObjects(w);
  const p = a.props.find((p) => p.hilltop?.sourceX === s.x && p.hilltop.sourceY === s.y);
  expect(p).toBeDefined();
  expect(p?.tileX === s.x && p.tileY === s.y).toBe(false);
  expect(a.props).toEqual(b.props);
  expect(a.tiles).toBe(w.tiles);
  expect(prepareHilltopObjects(a)).toBe(a);
  const tiny = fixture();
  tiny.tiles.fill(Tile.GRASS);
  for (let y = s.y - 1; y <= s.y + 1; y++)
    for (let x = s.x - 1; x <= s.x + 1; x++) tiny.tiles[y * 24 + x] = Tile.PLATEAU;
  expect(prepareHilltopObjects(tiny).props).toHaveLength(0);
});

it('keeps lower ground free, crosses stairs, then blocks on the raised surface', () => {
  const w = fixture();
  w.tiles.fill(Tile.GRASS);
  for (let y = 6; y <= 16; y++) for (let x = 6; x <= 16; x++) w.tiles[y * 24 + x] = Tile.PLATEAU;
  w.tiles[16 * 24 + 8] = Tile.STAIRS;
  const p: WorldProp = {
    id: 1,
    kind: 'rock_boulder',
    tileX: 8,
    tileY: 14,
    solid: true,
    hilltop: { sourceX: 8, sourceY: 14 },
  };
  const proposed = { ...w, props: [p], meta: { ...w.meta, hilltopObjectsVersion: 1 as const } };
  const sim = new Simulation();
  sim.loadWorld(proposed);
  sim.setPlayerPosition(8.5, 17.5);
  moveWithCollision(sim.world, sim.player, 0, -4);
  expect(sim.player.y).toBeCloseTo(14 + propFootprint(p)!.maxY + F.halfHeight - F.offsetY);
  expect(sim.player.y).toBeLessThan(16);
  expect(hasClearPath(sim.world, 6, 17.5, 16, 17.5, F)).toBe(true);
  // The face outside the stair still blocks ascent.
  sim.setPlayerPosition(12.5, 17.5);
  moveWithCollision(sim.world, sim.player, 0, -4);
  expect(sim.player.y).toBeGreaterThan(16);
});

it('migrates saved terrain and overlapping actors locally, preserves progress, and reloads without duplicates', () => {
  const sim = new Simulation();
  sim.loadWorld(world);
  const game = { loadWorld: (w: WorldData) => sim.loadWorld(w) } as Game;
  const saves = new SaveManager(localStorage, game, sim);
  const data = JSON.parse(saves.export());
  const old = legacy(world);
  data.world = { ...old, tiles: Array.from(old.tiles) };
  const player = data.entities.find((e: { kind: string }) => e.kind === 'player');
  Object.assign(player, { x: 70.5, y: 96.2875, prevX: 70.5, prevY: 96.2875 });
  player.stats.coins = 987;
  const enemy = data.entities.find((e: { kind: string }) => e.kind === 'enemy');
  Object.assign(enemy, { x: 70.5, y: 96.6, prevX: 70.5, prevY: 96.6 });
  const raw = JSON.stringify(data);
  saves.import(raw);
  const first = saves.export(),
    position = { x: sim.player.x, y: sim.player.y };
  expect(sim.world.tiles).toEqual(old.tiles);
  expect(sim.world.bridges).toEqual(old.bridges);
  expect(sim.world.encounterSites).toEqual(old.encounterSites);
  expect(sim.player.stats.coins).toBe(987);
  expect(Math.hypot(position.x - 70.5, position.y - 96.2875)).toBeLessThan(2);
  expect(canOccupy(sim.world, position.x, position.y, F)).toBe(true);
  expect(
    elevationMask(
      sim.world.tiles,
      150,
      150,
      Math.floor(position.x),
      Math.floor(position.y + F.offsetY),
    ),
  ).toBe(255);
  expect(hillRock(sim.world)).toMatchObject({ tileX: 70, tileY: 96 });
  expect(sim.world.meta.hilltopObjectsVersion).toBe(1);
  saves.import(raw);
  expect(saves.export()).toBe(first);
  for (let n = 0; n < 3; n++) {
    saves.import(first);
    expect(saves.export()).toBe(first);
  }
  expect(new Set(sim.world.props.map((p) => p.id)).size).toBe(sim.world.props.length);
});
