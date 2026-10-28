// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EventBus } from '../../../src/core/events/EventBus';
import { InputManager } from '../../../src/core/input/InputManager';
import { Game } from '../../../src/game/Game';
import { parseLaunchParams } from '../../../src/game/LaunchParams';
import { SaveManager } from '../../../src/persistence/SaveManager';
import { generateTutorialWorld } from '../../../src/world/TutorialMap';
import { Simulation } from '../../../src/simulation/Simulation';
import { FakeRenderer, FakeWorldFactory } from '../game/fakes';
import { bridgeFixture } from '../../fixtures/bridge-world';
let game: Game;
let sim: Simulation;
let saves: SaveManager;
beforeEach(async () => {
  localStorage.clear();
  sim = new Simulation();
  game = new Game({
    canvas: document.createElement('canvas'),
    renderer: new FakeRenderer(),
    simulation: sim,
    input: new InputManager(),
    bus: new EventBus(),
    worlds: {
      generate: (options) => new FakeWorldFactory().generate(options),
      tutorial: generateTutorialWorld,
    },
    params: parseLaunchParams('', false),
    viewport: () => ({ width: 800, height: 600, resolution: 1 }),
  });
  await game.boot();
  game.startNewGame({ tutorial: true });
  saves = new SaveManager(localStorage, game, sim);
});
afterEach(() => game.destroy());
it('round-trips bridge structures and a player on the deck without regenerating terrain', () => {
  const { world, bridge } = bridgeFixture();
  game.loadWorld(world);
  sim.setPlayerPosition(bridge.x + 2, bridge.y + 1);
  const before = sim.world.tiles.slice();
  saves.save('bridge');
  sim.setPlayerPosition(8, 8);
  saves.load('bridge');
  expect(sim.world.bridges).toEqual([bridge]);
  expect(sim.world.tiles).toEqual(before);
  expect(sim.player.x).toBe(bridge.x + 2);
  expect(sim.player.y).toBe(bridge.y + 1);
  expect(sim.buildRenderSnapshot().entities.find(e => e.id === sim.player.id)?.submerged).toBe(false);
});

it('rejects malformed, overlapping or unsupported bridges before replacing the active world', () => {
  const { world, bridge } = bridgeFixture();
  game.loadWorld(world);
  const version = sim.worldVersion, data = JSON.parse(saves.export());
  for (const bridges of [[{ ...bridge, span: 1000 }], [{ ...bridge, orientation: 'diagonal' }], [{ ...bridge, x: -1 }], [{ ...bridge, x: 1e20 }], [bridge, { ...bridge, id: 1 }], [{ ...bridge, x: bridge.x + 1 }]]) {
    data.world.bridges = bridges;
    expect(() => saves.import(JSON.stringify(data))).toThrow('Invalid bridges');
    expect(sim.worldVersion).toBe(version);
  }
});
it('round-trips world, combat and player state in a slot', () => {
  sim.setPlayerPosition(15.5, 5.5);
  sim.player.stats.health = 4;
  sim.player.stats.xp = 42;
  const enemy = sim.getEntities().find((e) => e.kind === 'enemy');
  if (enemy?.kind === 'enemy') enemy.health = 2;
  sim.setTimeOfDay(0.7);
  saves.save('one');
  sim.player.stats.health = 1;
  sim.setPlayerPosition(3.5, 15.5);
  saves.load('one');
  expect(sim.player.stats).toMatchObject({ health: 4, xp: 42 });
  expect(sim.player.x).toBe(15.5);
  expect(sim.getTimeOfDay()).toBeCloseTo(0.7);
  expect(sim.getEntities().find((e) => e.kind === 'enemy' && e.health === 2)).toBeDefined();
});
it('rejects corrupt terrain before replacing the active world', () => {
  const version = sim.worldVersion;
  const bad = JSON.parse(saves.export()) as { world: { tiles: number[] } };
  bad.world.tiles[0] = 255;
  expect(() => saves.import(JSON.stringify(bad))).toThrow('Invalid terrain');
  expect(sim.worldVersion).toBe(version);
});

it('imports copied legacy maps and preserves the original payload for export', async () => {
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync('tests/fixtures/legacy/active_map.json', 'utf8');
  saves.import(raw);
  expect(sim.world.meta.width).toBe(8);
  expect(sim.world.tiles).toHaveLength(64);
  const exported = JSON.parse(saves.export()) as { legacyExtras: { persistentGameId: string } };
  expect(exported.legacyExtras.persistentGameId).toBe('server_default_1765159366471');
});

it('rejects impossible progression that would stall the simulation', () => {
  const version = sim.worldVersion;
  const bad = JSON.parse(saves.export()) as {
    entities: Array<{ kind: string; stats?: { xpToNextLevel: number } }>;
  };
  const player = bad.entities.find((e) => e.kind === 'player');
  if (player?.stats) player.stats.xpToNextLevel = 0;
  expect(() => saves.import(JSON.stringify(bad))).toThrow('Invalid entities');
  expect(sim.worldVersion).toBe(version);
});

it('offers a legacy autosave for Continue and migrates it on load', async () => {
  const { readFileSync } = await import('node:fs');
  localStorage.setItem(
    'autosave_map',
    readFileSync('tests/fixtures/legacy/default_map_8x8.json', 'utf8'),
  );
  expect(saves.exists()).toBe(true);
  saves.load();
  expect(sim.world.meta.width).toBe(8);
  expect(localStorage.getItem('forestrpg.v2.save.auto')).not.toBeNull();
});

it('persists completion and restores transitioning portals as open exactly once', () => {
  for (const e of sim.getEntities()) if (e.kind === 'enemy' || e.kind === 'pickup') e.alive = false;
  sim.step(1 / 60, {
    moveX: 0,
    moveY: 0,
    sprint: false,
    attack: false,
    skillQ: false,
    skillE: false,
    jump: false,
    dash: false,
    potionHealth: false,
    potionSpeed: false,
  });
  sim.setPlayerPosition(17.5, 3.5);
  expect(sim.claimPortalTransition()).toBe(true);
  saves.save('portal');
  saves.load('portal');
  const portal = sim.getEntities().find((e) => e.kind === 'portal');
  expect(portal?.portalState).toBe('open');
  expect(portal?.roundComplete).toBe(true);
  expect(sim.claimPortalTransition()).toBe(true);
  expect(sim.claimPortalTransition()).toBe(false);
});
it('normalizes older V2 saves and relocates a player saved inside a solid hill', () => {
  const data = JSON.parse(saves.export());
  const portal = data.entities.find((e: { kind: string }) => e.kind === 'portal');
  delete portal.portalState;
  delete portal.roundComplete;
  delete portal.entryEligible;
  portal.active = true;
  const p = data.entities.find((e: { kind: string }) => e.kind === 'player');
  p.x = 0.5;
  p.y = 0.5;
  saves.import(JSON.stringify(data));
  expect(sim.getEntities().find((e) => e.kind === 'portal')?.portalState).toBe('locked');
  expect(sim.player.x).toBeGreaterThan(1);
});
it('rejects unknown portal states before mutating the current world', () => {
  const data = JSON.parse(saves.export());
  data.entities.find((e: { kind: string }) => e.kind === 'portal').portalState = 'invented';
  const version = sim.worldVersion;
  expect(() => saves.import(JSON.stringify(data))).toThrow('Invalid entities');
  expect(sim.worldVersion).toBe(version);
});

it('imports legacy boulders and trees as physical objects with intentional footprints', async () => {
  const { adaptLegacySave } = await import('../../../src/persistence/LegacySaveAdapter');
  const { canOccupy } = await import('../../../src/systems/CollisionSystem');
  const tiles = new Array<number>(64).fill(1);
  tiles[2 * 8 + 2] = 2;
  const { world } = adaptLegacySave({
    logicalW: 8,
    logicalH: 8,
    mapStates: tiles,
    terrainLayer: tiles,
    treeObjects: [{ x: 2, y: 2 }],
    decorativeObjects: [{ id: 'rock_upward_1', type: 'walkable', tileX: 5, tileY: 3 }],
    playerPosition: { x: 4, y: 4 },
    portalPos: { x: 6, y: 6 },
  });
  expect(world.tiles[2 * 8 + 2]).toBe(1);
  expect(canOccupy(world, 2.5, 1.2, 0.1)).toBe(true);
  expect(canOccupy(world, 2.5, 1.8, 0.1)).toBe(false);
  expect(canOccupy(world, 2.5, 2.8, 0.1)).toBe(false);
  expect(canOccupy(world, 5.5, 3.7, 0.3)).toBe(false);
});
it('rejects a fully solid save before replacing the active run', () => {
  const data = JSON.parse(saves.export());
  data.world.tiles.fill(12);
  const version = sim.worldVersion;
  expect(() => saves.import(JSON.stringify(data))).toThrow('No safe position');
  expect(sim.worldVersion).toBe(version);
});
