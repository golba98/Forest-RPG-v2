// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { generateWorld } from '../../src/world/WorldGenerator';
import { prepareHilltopObjects } from '../../src/world/HilltopObjects';
import { landscapeFor } from '../../src/world/LandscapePlan';
import { enableLandscapeDiagnostics, landscapeTrace } from '../../src/world/LandscapeTrace';
import { inspectLandscape } from '../../src/world/LandscapeInspector';
import { appliedMigrations } from '../../src/world/WorldCompatibility';
import { Simulation } from '../../src/simulation/Simulation';
import { SaveManager } from '../../src/persistence/SaveManager';
import { IDLE_INTENT } from '../../src/types/entities';
import { Tile } from '../../src/types/tiles';
import { generateTutorialWorld } from '../../src/world/TutorialMap';
import type { WorldData } from '../../src/types/world';
import type { Game } from '../../src/game/Game';
import { landscapeFixture } from '../fixtures/landscape-world';

afterEach(() => enableLandscapeDiagnostics(false));
function manager(world = landscapeFixture()) {
  const sim = new Simulation();
  sim.loadWorld(world);
  return {
    sim,
    saves: new SaveManager(
      localStorage,
      { loadWorld: (w: WorldData) => sim.loadWorld(w) } as Game,
      sim,
    ),
  };
}
function planningState(w: WorldData) {
  const p = landscapeFor(w);
  return {
    regions: Array.from(w.tiles, (_, i) => [
      p.plateauAt(i % w.meta.width, Math.floor(i / w.meta.width))?.id,
      p.waterAt(i % w.meta.width, Math.floor(i / w.meta.width))?.id,
    ]),
    summits: [...p.summits()],
    reservations: p.reservations(),
    hill: inspectLandscape(w, 70.5, 96.5),
    ground: inspectLandscape(w, 87.5, 37.5),
  };
}
function oldWorld(w: WorldData): WorldData {
  const { hilltopObjectsVersion: _version, ...meta } = w.meta;
  return {
    ...w,
    meta: { ...meta, generatorVersion: 9, riverRepairVersion: 1 },
    props: w.props.filter((p) => !p.hilltop),
  };
}

for (const seed of [1, 42, 123, 1337]) {
  it(`preserves the captured pre-change v10 seed-${seed} world through loading without regeneration`, () => {
    const fixture = landscapeFixture(seed);
    const sim = new Simulation();
    sim.loadWorld(fixture);
    const actual = sim.world;
    // Whole authoritative state: terrain/elevation/water, props, stairs, bridges,
    // spawn descriptors, encounter reservations, stable IDs and migration markers.
    expect(actual).toEqual(fixture);
    expect(landscapeFor(actual).reservations()).toEqual(landscapeFor(fixture).reservations());
  });
}

it('records actual v12 woodland and hilltop consumers after treasure placement', () => {
  enableLandscapeDiagnostics(true);
  const world = generateWorld({ seed: 42, level: 1, difficulty: 'normal' });
  expect(world.meta.generatorVersion).toBe(12);
  const trace = landscapeTrace(world)!;
  expect(trace.counts.hilltop.accepted + trace.counts.hilltop.relocated).toBe(world.props.filter(p => p.hilltop).length);
  expect(trace.counts.woodland.accepted).toBe(world.props.filter((p) => p.kind === 'tree').length);
  expect(trace.counts.woodland.rejected).toBeGreaterThan(0);
  expect(
    trace.entries.some(
      (e) => e.consumer === 'hilltop' && e.outcome === 'relocated' && e.reasons.length > 0,
    ),
  ).toBe(true);
  expect(inspectLandscape(world, 70.5, 96.5).trace).not.toBeNull();
});

it('reconstructs all region IDs, reservations, summit and clearance queries on save/reload', () => {
  const { sim, saves } = manager();
  const before = planningState(sim.world),
    raw = saves.export();
  saves.import(raw);
  expect(planningState(sim.world)).toEqual(before);
  expect(saves.export()).toBe(raw);
  expect(raw).not.toContain('plateauRegions');
  expect(raw).not.toContain('limitPerConsumer');
});

it('keeps partial conversion and alternate source iteration deterministic without duplicate objects', () => {
  const captured = landscapeFixture(),
    old = oldWorld(captured);
  const reversed = {
    ...old,
    props: [...old.props].reverse(),
    bridges: [...old.bridges!].reverse(),
    encounterSites: [...old.encounterSites!].reverse(),
  };
  const bySource = (w: WorldData) => w.props.filter((p) => p.hilltop).sort((a, b) => a.id - b.id);
  expect(bySource(prepareHilltopObjects(reversed))).toEqual(bySource(captured));
  const partial = {
    ...old,
    props: [...old.props, ...captured.props.filter((p) => p.hilltop).slice(0, 8)],
  };
  const converted = prepareHilltopObjects(partial);
  expect(bySource(converted)).toEqual(bySource(captured));
  expect(prepareHilltopObjects(converted)).toBe(converted);
});

it('repeatedly converts the pre-change legacy representation and retains progress and encounter state', () => {
  const { sim, saves } = manager(),
    data = JSON.parse(saves.export());
  const old = oldWorld(landscapeFixture());
  data.world = { ...old, tiles: Array.from(old.tiles) };
  data.entities.find((e: { kind: string }) => e.kind === 'player').stats.coins = 4321;
  const original = JSON.stringify(data),
    runtime = structuredClone(data.runtime.encounters);
  let converted = '';
  for (let n = 0; n < 3; n++) {
    saves.import(original);
    expect(sim.player.stats.coins).toBe(4321);
    expect(sim.getRuntimeState().encounters).toEqual(runtime);
    expect(sim.world.tiles).toEqual(old.tiles);
    expect(sim.world.props).toEqual(landscapeFixture().props);
    expect(appliedMigrations(sim.world.meta)).toEqual(['river-repair:1', 'hilltop-objects:1']);
    const next = saves.export();
    if (converted) expect(next).toBe(converted);
    converted = next;
    saves.import(converted);
    expect(saves.export()).toBe(converted);
    expect(new Set(sim.world.props.map((p) => p.id)).size).toBe(sim.world.props.length);
  }
});

for (const version of [0, 1, 4, 7, 8, 9, 10, 11, 12])
  it(`loads supported generator ${version} without regeneration`, () => {
    const { sim, saves } = manager(),
      data = JSON.parse(saves.export());
    data.world.meta.generatorVersion = version;
    data.world.meta.riverRepairVersion = 1;
    saves.import(JSON.stringify(data));
    expect(sim.world.meta.generatorVersion).toBe(version);
    expect(sim.world.tiles).toEqual(landscapeFixture().tiles);
    expect(sim.world.props).toEqual(landscapeFixture().props);
  });

it('interprets missing generator metadata as unknown legacy without guessing a river algorithm', () => {
  const { sim, saves } = manager(),
    data = JSON.parse(saves.export());
  delete data.world.meta.generatorVersion;
  delete data.world.meta.riverRepairVersion;
  saves.import(JSON.stringify(data));
  expect(sim.world.meta.generatorVersion).toBe(0);
  expect(sim.world.meta.riverRepairVersion).toBeUndefined();
  expect(sim.world.tiles).toEqual(landscapeFixture().tiles);
  expect(JSON.parse(saves.export()).world.meta.generatorVersion).toBe(0);
});

for (const version of [-1, 13, 1.5, '10', null])
  it(`rejects unsupported generator metadata ${String(version)} before changing the active run`, () => {
    const { sim, saves } = manager(),
      data = JSON.parse(saves.export()),
      before = sim.world;
    data.world.meta.generatorVersion = version;
    expect(() => saves.import(JSON.stringify(data))).toThrow('Unsupported generator');
    expect(sim.world).toBe(before);
  });

it('rejects unsupported schema and migration versions and generation requests explicitly', () => {
  const { sim, saves } = manager(),
    data = JSON.parse(saves.export()),
    before = sim.world;
  for (const field of ['riverRepairVersion', 'hilltopObjectsVersion']) {
    const bad = structuredClone(data);
    bad.world.meta[field] = 2;
    expect(() => saves.import(JSON.stringify(bad))).toThrow('Unsupported');
  }
  data.version = 3;
  expect(() => saves.import(JSON.stringify(data))).toThrow('Unsupported');
  expect(() =>
    sim.loadWorld({ ...before, meta: { ...before.meta, generatorVersion: 13 } }),
  ).toThrow('Unsupported generator');
  expect(() =>
    generateWorld({ seed: 42, level: 1, difficulty: 'normal', generatorVersion: 9 }),
  ).toThrow('Unsupported generation request');
  expect(sim.world).toBe(before);
});

it('invalidates the cached plan through actual flower cutting and prop removal', () => {
  const { sim } = manager(generateTutorialWorld());
  sim.world.tiles[15 * 20 + 4] = Tile.FLOWERS;
  (sim.world.props as import('../../src/types/world').WorldProp[]).push({
    id: 123456,
    kind: 'flower_pink',
    tileX: 4,
    tileY: 15,
    solid: false,
  });
  sim.player.facing = 'E';
  const before = landscapeFor(sim.world);
  sim.step(1 / 60, { ...IDLE_INTENT, attack: true });
  for (let frame = 0; frame < 10; frame++) sim.step(1 / 60, IDLE_INTENT);
  expect(sim.world.tiles[15 * 20 + 4]).toBe(Tile.GRASS);
  expect(sim.world.props.some((p) => p.id === 123456)).toBe(false);
  expect(landscapeFor(sim.world)).not.toBe(before);
});
