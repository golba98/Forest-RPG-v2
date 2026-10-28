import { expect, it } from 'vitest';
import { nestGeometry } from '../../../src/world/NestGeometry';
import { Simulation } from '../../../src/simulation/Simulation';
import { IDLE_INTENT } from '../../../src/types/entities';
import { encounterFixture } from '../../fixtures/encounter-world';
import { Tile } from '../../../src/types/tiles';
import { canOccupy } from '../../../src/systems/CollisionSystem';
it('crawls from the visible opening to the original combat anchor and resumes mid-crawl', () => {
  const s = new Simulation();
  s.loadWorld(encounterFixture());
  s.setPlayerPosition(15.8, 12.2875);
  s.step(1 / 60, { ...IDLE_INTENT, interact: true });
  for (let i = 0; i < 144; i++) s.step(1 / 60, IDLE_INTENT);
  const e = s.getEntities().find((e) => e.kind === 'enemy' && e.enemyType === 'beetle')!;
  expect(e.y).toBeCloseTo(12.125);
  expect(canOccupy(s.world, e.x, e.y, 0.3, 'groundEnemy')).toBe(true);
  const state = s.getRuntimeState();
  const entities = structuredClone([...s.getEntities()]);
  const time = s.getTimeOfDay();
  const elapsed = s.elapsedMs;
  s.loadWorld(s.world);
  s.restoreEntities(entities, time, elapsed, 0, state);
  const restored = s.getEntities().find((e) => e.kind === 'enemy' && e.enemyType === 'beetle')!;
  expect(restored.y).toBeCloseTo(e.y);
  expect(
    s.buildRenderSnapshot().entities.find((e) => e.spriteKey === 'beetle')?.nestEmergence?.progress,
  ).toBeCloseTo(0.5);
  for (let i = 0; i < 24; i++) s.step(1 / 60, IDLE_INTENT);
  expect(restored.y).toBeCloseTo(12.5);
  expect(s.getEncounterDebug().bosses[0]?.phase).toBe('fighting');
});
it('shortens the entrance approach on cramped legacy terrain without changing it', () => {
  const w = encounterFixture();
  const site = w.encounterSites![0]!;
  w.tiles[11 * 64 + 12] = Tile.FOREST;
  const before = w.tiles.slice();
  const g = nestGeometry(w, site);
  expect(g.travel).toBeLessThan(0.75);
  expect(canOccupy(w, g.entrance.x, g.entrance.y, 0.3, 'groundEnemy')).toBe(true);
  expect(w.tiles).toEqual(before);
});
