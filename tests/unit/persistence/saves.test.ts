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
let game: Game;
let sim: Simulation;
let saves: SaveManager;
beforeEach(async () => {
  localStorage.clear(); sim = new Simulation();
  game = new Game({ canvas: document.createElement('canvas'), renderer: new FakeRenderer(), simulation: sim, input: new InputManager(), bus: new EventBus(), worlds: { generate: options => new FakeWorldFactory().generate(options), tutorial: generateTutorialWorld }, params: parseLaunchParams('', false), viewport: () => ({ width: 800, height: 600, resolution: 1 }) });
  await game.boot(); game.startNewGame({ tutorial: true }); saves = new SaveManager(localStorage, game, sim);
});
afterEach(() => game.destroy());
it('round-trips world, combat and player state in a slot', () => {
  sim.setPlayerPosition(15.5, 5.5); sim.player.stats.health = 4; sim.player.stats.xp = 42;
  const enemy = sim.getEntities().find(e => e.kind === 'enemy'); if (enemy?.kind === 'enemy') enemy.health = 2;
  sim.setTimeOfDay(0.7); saves.save('one');
  sim.player.stats.health = 1; sim.setPlayerPosition(3.5, 15.5);
  saves.load('one');
  expect(sim.player.stats).toMatchObject({ health: 4, xp: 42 });
  expect(sim.player.x).toBe(15.5); expect(sim.getTimeOfDay()).toBeCloseTo(0.7);
  expect(sim.getEntities().find(e => e.kind === 'enemy' && e.health === 2)).toBeDefined();
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
  const bad = JSON.parse(saves.export()) as { entities: Array<{ kind: string; stats?: { xpToNextLevel: number } }> };
  const player = bad.entities.find(e => e.kind === 'player');
  if (player?.stats) player.stats.xpToNextLevel = 0;
  expect(() => saves.import(JSON.stringify(bad))).toThrow('Invalid entities');
  expect(sim.worldVersion).toBe(version);
});

it('offers a legacy autosave for Continue and migrates it on load', async () => {
  const { readFileSync } = await import('node:fs');
  localStorage.setItem('autosave_map', readFileSync('tests/fixtures/legacy/default_map_8x8.json', 'utf8'));
  expect(saves.exists()).toBe(true);
  saves.load();
  expect(sim.world.meta.width).toBe(8);
  expect(localStorage.getItem('forestrpg.v2.save.auto')).not.toBeNull();
});
