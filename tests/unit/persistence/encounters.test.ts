// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { Game } from '../../../src/game/Game';
import { SaveManager } from '../../../src/persistence/SaveManager';
import { InputManager } from '../../../src/core/input/InputManager';
import { EventBus } from '../../../src/core/events/EventBus';
import { parseLaunchParams } from '../../../src/game/LaunchParams';
import { IDLE_INTENT } from '../../../src/types/entities';
import { encounterFixture } from '../../fixtures/encounter-world';
import { FakeRenderer, FakeWorldFactory } from '../game/fakes';

let s: Simulation, game: Game, saves: SaveManager;
const frame = 1 / 60;
function advance(seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) s.step(frame, IDLE_INTENT);
}
function start() {
  s.setPlayerPosition(15.8, 12.2875);
  s.step(frame, { ...IDLE_INTENT, interact: true });
}
beforeEach(async () => {
  localStorage.clear();
  s = new Simulation();
  const factory = new FakeWorldFactory();
  game = new Game({
    canvas: document.createElement('canvas'),
    renderer: new FakeRenderer(),
    simulation: s,
    input: new InputManager(),
    bus: new EventBus(),
    worlds: factory,
    params: parseLaunchParams('', false),
    viewport: () => ({ width: 800, height: 600, resolution: 1 }),
  });
  await game.boot();
  game.loadWorld(encounterFixture());
  s.player.hurtTimerMs = 1e8;
  saves = new SaveManager(localStorage, game, s);
});
afterEach(() => game.destroy());

it('round-trips nest locations, warning progress, inventory, terrain and defeated rewards', () => {
  start();
  advance(0.5);
  s.player.stats.coins = 123;
  s.player.inventory.speedPotions = 4;
  const before = s.getEncounterDebug(),
    tiles = s.world.tiles.slice(),
    bridges = s.world.bridges;
  saves.save('warning');
  saves.load('warning');
  expect(s.getEncounterDebug()).toEqual(before);
  expect(s.world.tiles).toEqual(tiles);
  expect(s.world.bridges).toEqual(bridges);
  expect(s.player.stats.coins).toBe(123);
  expect(s.player.inventory.speedPotions).toBe(4);
  advance(2.4);
  s.player.stats.baseDamage = 100;
  s.step(frame, { ...IDLE_INTENT, skillQ: true });
  expect(s.getEncounterDebug().bosses[0]?.phase).toBe('defeated');
  const stats = structuredClone(s.player.stats);
  saves.save('defeated');
  saves.load('defeated');
  start();
  advance(3);
  expect(s.player.stats.level).toBe(stats.level);
  expect(
    s.getEntities().some((e) => e.kind === 'enemy' && e.enemyType === 'beetle' && e.alive),
  ).toBe(false);
});

it('uses records to discard extra or stale living boss entities without replaying rewards', () => {
  start();
  advance(3);
  const boss = s.getEntities().find((e) => e.kind === 'enemy' && e.enemyType === 'beetle')!;
  const payload = JSON.parse(saves.export());
  payload.entities.push({ ...boss, id: 'duplicate-boss' });
  saves.import(JSON.stringify(payload));
  expect(
    s.getEntities().filter((e) => e.kind === 'enemy' && e.enemyType === 'beetle' && e.alive),
  ).toHaveLength(1);
  s.player.stats.baseDamage = 100;
  s.step(frame, { ...IDLE_INTENT, skillQ: true });
  const dead = JSON.parse(saves.export());
  for (const e of dead.entities)
    if (e.kind === 'enemy' && e.enemyType === 'beetle')
      Object.assign(e, { alive: true, health: 15 });
  const level = s.player.stats.level;
  saves.import(JSON.stringify(dead));
  expect(s.player.stats.level).toBe(level);
  expect(
    s.getEntities().some((e) => e.kind === 'enemy' && e.enemyType === 'beetle' && e.alive),
  ).toBe(false);
});

it('migrates a surviving old boss with its saved health, without changing the map', () => {
  start();
  advance(3);
  const payload = JSON.parse(saves.export());
  delete payload.runtime.encounters;
  delete payload.world.encounterSites;
  const boss = payload.entities.find((e: { enemyType?: string }) => e.enemyType === 'beetle');
  boss.health = 4;
  payload.world.enemySpawns = [{ type: 'beetle', x: 12, y: 12 }];
  const tiles = [...payload.world.tiles];
  saves.import(JSON.stringify(payload));
  expect(s.world.tiles).toEqual(Uint8Array.from(tiles));
  expect(s.getEncounterDebug().bosses[0]?.phase).toBe('fighting');
  expect(s.getEncounterDebug().bosses[0]?.health).toBe(4);
  const site = s.world.encounterSites!.find((s) => s.kind === 'nest')!;
  expect(Math.hypot(site.x - boss.x, site.y - boss.y)).toBeLessThanOrEqual(8);
  expect(s.player.stats.level).toBe(1);
});

it('preserves old recorded boss death and a completed portal without adding rewards', () => {
  start();
  advance(3);
  const payload = JSON.parse(saves.export());
  delete payload.runtime.encounters;
  delete payload.world.encounterSites;
  const boss = payload.entities.find((e: { enemyType?: string }) => e.enemyType === 'beetle');
  boss.health = 0;
  boss.alive = false;
  payload.entities.find((e: { kind: string }) => e.kind === 'portal').roundComplete = true;
  saves.import(JSON.stringify(payload));
  expect(s.getEncounterDebug().bosses[0]?.phase).toBe('defeated');
  expect(s.player.stats.level).toBe(1);
  expect(s.getGameplayDebug().round.complete).toBe(true);
  saves.save('migrated');
  saves.load('migrated');
  expect(s.getEncounterDebug().bosses[0]?.phase).toBe('defeated');
});

it('preserves an old boss defeat even when a stale living duplicate remains', () => {
  start();
  advance(3);
  const payload = JSON.parse(saves.export());
  delete payload.runtime.encounters;
  delete payload.world.encounterSites;
  const boss = payload.entities.find((e: { enemyType?: string }) => e.enemyType === 'beetle');
  payload.entities.push({ ...boss, id: 'stale-living-boss' });
  Object.assign(boss, { alive: false, health: 0 });
  const level = s.player.stats.level;
  saves.import(JSON.stringify(payload));
  expect(s.getEncounterDebug().bosses[0]?.phase).toBe('defeated');
  expect(s.getEncounterDebug().bosses[0]?.rewardClaimed).toBe(true);
  expect(s.getEntities().some((e) => e.kind === 'enemy' && e.enemyType === 'beetle')).toBe(false);
  start();
  advance(3);
  saves.save('old-duplicates');
  saves.load('old-duplicates');
  expect(s.getEncounterDebug().bosses[0]?.phase).toBe('defeated');
  expect(s.player.stats.level).toBe(level);
});

it('restores partial ghost formation, finite membership, introductory progress and cooldown', () => {
  s.setTimeOfDay(0.95);
  s.setPlayerPosition(33, 39.2875);
  advance(0.4);
  const forming = s.getEncounterDebug().groves[0]!;
  saves.save('forming');
  saves.load('forming');
  expect(s.getEncounterDebug().groves[0]).toEqual(forming);
  advance(0.7);
  const ghost = s
    .getEntities()
    .find((e) => e.kind === 'enemy' && e.enemyType === 'ghost' && e.alive)!;
  s.setPlayerPosition(ghost.x, ghost.y);
  s.player.stats.baseDamage = 100;
  s.step(frame, { ...IDLE_INTENT, skillQ: true });
  advance(30);
  saves.save('cooldown');
  saves.load('cooldown');
  expect(s.player.hauntedIntroComplete).toBe(true);
  expect(s.getEncounterDebug().groves[0]?.cooldownMs).toBeCloseTo(60000);
  advance(20);
  saves.save('cooldown');
  saves.load('cooldown');
  expect(s.getEncounterDebug().groves[0]?.cooldownMs).toBeCloseTo(40000);
});

it('rejects invalid encounter records before replacing the active run', () => {
  const raw = saves.export(),
    version = s.worldVersion;
  for (const change of [
    (p: ReturnType<typeof JSON.parse>) => {
      p.runtime.encounters.bosses[0].phase = 'unknown';
    },
    (p: ReturnType<typeof JSON.parse>) => {
      p.runtime.encounters.groves[0].cooldownMs = -1;
    },
    (p: ReturnType<typeof JSON.parse>) => {
      p.world.encounterSites.push(p.world.encounterSites[0]);
    },
    (p: ReturnType<typeof JSON.parse>) => {
      p.runtime.encounters.bosses[0].health = 0;
    },
    (p: ReturnType<typeof JSON.parse>) => {
      p.runtime.encounters.groves[0].phase = 'available';
      p.runtime.encounters.groves[0].cooldownMs = 60000;
    },
  ]) {
    const payload = JSON.parse(raw);
    change(payload);
    expect(() => saves.import(JSON.stringify(payload))).toThrow('Invalid encounter data');
    expect(s.worldVersion).toBe(version);
  }
});

it('adopts a cramped legacy boss after repairing its saved collision position', () => {
  const tiles = new Array<number>(64).fill(1);
  tiles[3 * 8 + 3] = 2;
  saves.import(
    JSON.stringify({
      logicalW: 8,
      logicalH: 8,
      cellSize: 32,
      mapStates: tiles,
      terrainLayer: tiles,
      treeObjects: [],
      playerPosition: { x: 4, y: 4 },
      portalPos: { x: 6, y: 6 },
      enemies: [{ type: 'beetle', x: 3, y: 3, health: 4, maxHealth: 15 }],
    }),
  );
  const boss = s.getEntities().find((e) => e.kind === 'enemy' && e.enemyType === 'beetle');
  expect(boss?.kind === 'enemy' && boss.health).toBe(4);
  expect(s.getEncounterDebug().bosses[0]?.phase).toBe('fighting');
  expect(s.world.tiles).toEqual(Uint8Array.from(tiles));
  saves.save('legacy-boss');
  saves.load('legacy-boss');
  expect(s.getEncounterDebug().bosses[0]?.health).toBe(4);
});
