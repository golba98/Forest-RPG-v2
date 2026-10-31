import type { Page } from '@playwright/test';
import type { Entity, EnemyEntity, PlayerEntity, PortalEntity } from '../../../src/types/entities';
import type { Settings } from '../../../src/persistence/SettingsStore';
import type { WorldData } from '../../../src/types/world';

type FixtureSave = {
  entities: Entity[];
  world: Omit<WorldData, 'tiles'> & { tiles: number[] };
  runtime: { encounters?: unknown; moisture?: unknown };
  time: number;
  elapsedMs: number;
};

export async function boot(page: Page, enemyOffsets: readonly (readonly [number, number])[] = [], settings: Partial<Settings> = {}, live = false) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(settings => localStorage.setItem('forestrpg.v2.settings', JSON.stringify({
    clouds: false, particles: false, lighting: false, shake: false, tutorials: false, ...settings,
  })), settings);
  // The clock must own the RAF scheduled during boot, not just later timers.
  if (!live) await page.clock.install();
  await page.goto('/?debug=1&autostart=1&tutorial=0&seed=42');
  await page.waitForFunction(() => !!window.__GAME__ && !!window.__RENDER_DEBUG__);
  // Leave ample headroom for the cross-process call on a busy test host. The
  // fixture is loaded afterward, so advancing boot time cannot affect the case.
  if (!live) await page.clock.pauseAt(await page.evaluate(() => Date.now() + 5_000));
  await page.evaluate(offsets => {
    const g = window.__GAME__!;
    g.pauseSimulation();
    g.saveGame('directions');
    const data = JSON.parse(localStorage.getItem('forestrpg.v2.save.directions')!) as FixtureSave;
    const p = data.entities.find((e): e is PlayerEntity => e.kind === 'player')!;
    const portal = data.entities.find((e): e is PortalEntity => e.kind === 'portal')!;
    const baseEnemy = data.entities.find((e): e is EnemyEntity => e.kind === 'enemy')!;
    delete data.runtime.encounters;
    delete data.runtime.moisture;
    data.world = {
      ...data.world, meta: { ...data.world.meta, width: 40, height: 40, isTutorial: false },
      tiles: Array<number>(1600).fill(1), props: [], bridges: [], encounterSites: [],
      enemySpawns: [], pickupSpawns: [], spawn: { x: 20, y: 20 }, portal: { x: 38, y: 38 },
    };
    Object.assign(p, { x: 20.5, y: 20.5, prevX: 20.5, prevY: 20.5, facing: 'S', anim: 'idle', animTimeMs: 0 });
    Object.assign(portal, { x: 38.5, y: 38.5, prevX: 38.5, prevY: 38.5, active: false, portalState: 'locked', roundComplete: false });
    const enemies = offsets.map(([dx, dy], i): EnemyEntity => ({
      ...baseEnemy, id: `direction-enemy-${i}`, enemyType: 'mantis',
      x: p.x + dx, y: p.y + dy, prevX: p.x + dx, prevY: p.y + dy,
      health: 20, maxHealth: 20, aggressive: false, hurtTimerMs: 0, alive: true, aiState: 'idle',
    }));
    data.entities = [p, portal, ...enemies]; data.time = .3; data.elapsedMs = 0;
    localStorage.setItem('forestrpg.v2.save.directions', JSON.stringify(data));
    if (!g.loadGame('directions')) throw new Error('Direction fixture failed to load');
  }, enemyOffsets);
  if (live) await page.waitForTimeout(50);
  else await page.clock.runFor(50);
  return errors;
}
