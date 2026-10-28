import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { IDLE_INTENT, type Entity, type EnemyEntity } from '../../../src/types/entities';
import { Tile } from '../../../src/types/tiles';
import { PLAYER_FOOTPRINT } from '../../../src/systems/EntityFootprint';
import { canOccupy } from '../../../src/systems/CollisionSystem';
import { encounterFixture } from '../../fixtures/encounter-world';

const frame = 1 / 60;
function advance(s: Simulation, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) s.step(frame, IDLE_INTENT);
}
function setup(seed = 123) {
  const s = new Simulation();
  s.loadWorld(encounterFixture(seed));
  s.player.hurtTimerMs = 1e8;
  s.player.stats.maxMana = s.player.stats.mana = 100000;
  return s;
}
function enemies(s: Simulation, type?: 'beetle' | 'ghost') {
  return s
    .getEntities()
    .filter(
      (e): e is EnemyEntity => e.kind === 'enemy' && e.alive && (!type || e.enemyType === type),
    );
}
function nearNest(s: Simulation) {
  s.setPlayerPosition(15.8, 12.5 - PLAYER_FOOTPRINT.offsetY);
}
function start(s: Simulation) {
  nearNest(s);
  s.step(frame, { ...IDLE_INTENT, interact: true });
}
function grove(s: Simulation) {
  s.setTimeOfDay(0.95);
  s.setPlayerPosition(33, 39.5 - PLAYER_FOOTPRINT.offsetY);
  s.step(frame, IDLE_INTENT);
}
function restore(s: Simulation, extra: Entity[] = []) {
  const entities = structuredClone([...s.getEntities(), ...extra]),
    runtime = s.getRuntimeState(),
    time = s.getTimeOfDay(),
    elapsed = s.elapsedMs;
  s.loadWorld(s.world);
  s.restoreEntities(entities, time, elapsed, 0, runtime);
}

describe('Big Bug nest', () => {
  it('discovers without attacking and requires a deliberate interaction at a safe distance', () => {
    const s = setup();
    nearNest(s);
    advance(s, 2);
    expect(s.getEncounterDebug().bosses[0]?.discovered).toBe(true);
    expect(s.getEncounterDebug().bosses[0]?.phase).toBe('dormant');
    expect(enemies(s, 'beetle')).toHaveLength(0);
    expect(s.getGameplayDebug().round.enemiesRemaining).toBe(1);
    s.setPlayerPosition(12.5, 12.5);
    s.step(frame, { ...IDLE_INTENT, interact: true });
    expect(s.getEncounterDebug().bosses[0]?.phase).toBe('dormant');
    expect(s.buildRenderSnapshot().encounters?.interaction).toBe('stepBack');
  });
  it('warns for two seconds, emerges harmlessly, and repeated interaction cannot duplicate it', () => {
    const s = setup();
    const cues: string[] = [];
    s.onEncounterCue = (kind) => cues.push(kind);
    start(s);
    advance(s, 1.9);
    expect(enemies(s, 'beetle')).toHaveLength(0);
    advance(s, 0.1);
    expect(s.getEncounterDebug().bosses[0]?.phase).toBe('emerging');
    expect(enemies(s, 'beetle')).toHaveLength(1);
    const e = enemies(s, 'beetle')[0]!;
    s.player.stats.baseDamage = 100;
    for (let i = 0; i < 40; i++) s.step(frame, { ...IDLE_INTENT, interact: true, skillQ: true });
    expect(e.health).toBe(e.maxHealth);
    expect(e.combatReady).toBe(false);
    expect(s.buildRenderSnapshot().encounters?.boss).toBeNull();
    advance(s, 0.15);
    expect(e.combatReady).toBe(true);
    expect(s.buildRenderSnapshot().encounters?.boss?.name).toBe('Big Bug');
    expect(enemies(s, 'beetle')).toHaveLength(1);
    expect(cues).toEqual(['nestWarning', 'bossEmerge']);
  });
  it('does not damage the player during emergence even at the same position', () => {
    const s = setup();
    start(s);
    advance(s, 2);
    s.setPlayerPosition(12.5, 12.5);
    s.player.hurtTimerMs = 0;
    const health = s.player.stats.health;
    advance(s, 0.7);
    expect(s.player.stats.health).toBe(health);
    expect(enemies(s, 'beetle')[0]?.aiState).toBe('idle');
  });
  it('keeps ordinary dodging active and resets only after a genuine retreat', () => {
    const s = setup();
    start(s);
    advance(s, 2.9);
    advance(s, 5);
    expect(s.getEncounterDebug().bosses[0]?.phase).toBe('fighting');
    s.setPlayerPosition(55, 12.5);
    advance(s, 5.5);
    expect(s.getEncounterDebug().bosses[0]?.phase).toBe('fighting');
    advance(s, 11);
    expect(s.getEncounterDebug().bosses[0]?.phase).toBe('dormant');
    expect(s.getEncounterDebug().bosses[0]?.health).toBe(15);
    start(s);
    advance(s, 2.9);
    expect(enemies(s, 'beetle')).toHaveLength(1);
    expect(s.getEncounterDebug().bosses[0]?.phase).toBe('fighting');
  });
  it('disengages from an unreachable swimmer without waiting indefinitely', () => {
    const s = setup();
    start(s);
    advance(s, 2.9);
    for (let y = 10; y < 16; y++)
      for (let x = 20; x < 25; x++) s.world.tiles[y * 64 + x] = Tile.RIVER;
    s.setPlayerPosition(22.5, 12.5);
    advance(s, 19);
    expect(s.getEncounterDebug().bosses[0]?.phase).toBe('dormant');
    expect(s.player.stats.level).toBe(1);
  });
  it('disengages across thin cliff faces even when both tile centres are walkable', () => {
    const s = setup();
    start(s);
    advance(s, 2.9);
    for (let y = 1; y < 63; y++)
      for (let x = 18; x < 63; x++)
        s.world.tiles[y * 64 + x] = x === 18 ? Tile.HILL_W : Tile.PLATEAU;
    s.setPlayerPosition(22.5, 12.5);
    advance(s, 20);
    expect(canOccupy(s.world, s.player.x, s.player.y, PLAYER_FOOTPRINT)).toBe(true);
    expect(s.getEncounterDebug().bosses[0]?.phase).toBe('dormant');
  });
  it('awards existing rewards once and keeps defeat permanent across reload', () => {
    const s = setup();
    start(s);
    advance(s, 2.9);
    nearNest(s);
    s.player.stats.baseDamage = 100;
    s.step(frame, { ...IDLE_INTENT, skillQ: true });
    expect(s.getEncounterDebug().bosses[0]?.phase).toBe('defeated');
    expect(s.player.stats.level).toBe(2);
    expect(s.player.stats.xp).toBe(0);
    const rewards = structuredClone(s.player.stats),
      loot = s.getEntities().filter((e) => e.kind === 'pickup').length;
    restore(s);
    start(s);
    advance(s, 4);
    expect(enemies(s, 'beetle')).toHaveLength(0);
    expect(s.player.stats.level).toBe(rewards.level);
    expect(s.getEntities().filter((e) => e.kind === 'pickup').length).toBe(loot);
    expect(s.getGameplayDebug().round.complete).toBe(true);
  });
  for (const seconds of [0.5, 2.4, 3])
    it(`restores warning/emergence/fighting without restarting timers at ${seconds}s`, () => {
      const s = setup();
      start(s);
      advance(s, seconds);
      const b = s.getEncounterDebug().bosses[0]!;
      restore(s);
      expect(s.getEncounterDebug().bosses[0]).toEqual(b);
      expect(enemies(s, 'beetle')).toHaveLength(seconds < 2 ? 0 : 1);
      advance(s, 3);
      expect(enemies(s, 'beetle')).toHaveLength(1);
    });
  it('reconciles an extra owned entity instead of duplicating the boss', () => {
    const s = setup();
    start(s);
    advance(s, 3);
    restore(s, [{ ...enemies(s, 'beetle')[0]!, id: 'duplicate-boss' }]);
    expect(enemies(s, 'beetle')).toHaveLength(1);
  });
  it('publishes defeat feedback only after the reward and defeat record are consistent', () => {
    const s = setup();
    start(s);
    advance(s, 3);
    nearNest(s);
    let snapshotLevel = 0,
      snapshotPhase = '';
    s.onHit = (e) => {
      if (e.health === 0) {
        snapshotLevel = s.player.stats.level;
        snapshotPhase = s.getRuntimeState().encounters!.bosses[0]!.phase;
      }
    };
    s.player.stats.baseDamage = 100;
    s.step(frame, { ...IDLE_INTENT, skillQ: true });
    expect(snapshotPhase).toBe('defeated');
    expect(snapshotLevel).toBe(2);
  });
});

describe('haunted grove groups', () => {
  it('makes the introductory group solitary and harmless for its whole formation', () => {
    const s = setup();
    grove(s);
    advance(s, 0.4);
    expect(enemies(s, 'ghost')).toHaveLength(1);
    const e = enemies(s, 'ghost')[0]!;
    expect(e.combatReady).toBe(false);
    s.setPlayerPosition(e.x, e.y);
    s.player.hurtTimerMs = 0;
    s.player.stats.baseDamage = 100;
    const hp = s.player.stats.health;
    for (let i = 0; i < 20; i++) s.step(frame, { ...IDLE_INTENT, skillQ: true });
    expect(e.health).toBe(e.maxHealth);
    expect(s.player.stats.health).toBe(hp);
    advance(s, 0.4);
    expect(e.combatReady).toBe(true);
    expect(enemies(s, 'ghost')).toHaveLength(1);
  });
  it('staggers later groups and caps overlapping groves including pending members', () => {
    const s = setup();
    s.player.hauntedIntroComplete = true;
    grove(s);
    const group = s.getEncounterDebug().groves.find((g) => g.phase === 'active')!;
    expect(group.members.length).toBeGreaterThanOrEqual(2);
    expect(group.members.length).toBeLessThanOrEqual(3);
    expect(enemies(s, 'ghost')).toHaveLength(1);
    advance(s, 0.75);
    expect(enemies(s, 'ghost').length).toBeGreaterThanOrEqual(2);
    expect(enemies(s, 'ghost').filter((e) => e.combatReady)).toHaveLength(0);
    advance(s, 0.4);
    expect(enemies(s, 'ghost').filter((e) => e.combatReady)).toHaveLength(1);
    expect(s.getEncounterDebug().groves.filter((g) => g.phase === 'active')).toHaveLength(1);
    expect(s.getEncounterDebug().groves.flatMap((g) => g.members).length).toBeLessThanOrEqual(3);
  });
  it('keeps fighting ghosts through dawn', () => {
    const s = setup();
    grove(s);
    advance(s, 1.1);
    s.setTimeOfDay(0.4);
    advance(s, 0.5);
    expect(enemies(s, 'ghost')).toHaveLength(1);
    expect(enemies(s, 'ghost')[0]?.combatReady).toBe(true);
  });
  it('uses occasional, deterministic, solitary daytime manifestations', () => {
    let encounters = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = setup(seed);
      s.setTimeOfDay(0.5);
      s.setPlayerPosition(33, 39.5);
      s.step(frame, IDLE_INTENT);
      const count = s.getEncounterDebug().groves.flatMap((g) => g.members).length;
      expect(count).toBeLessThanOrEqual(1);
      encounters += count;
      const t = setup(seed);
      t.setTimeOfDay(0.5);
      t.setPlayerPosition(33, 39.5);
      t.step(frame, IDLE_INTENT);
      expect(t.getEncounterDebug()).toEqual(s.getEncounterDebug());
    }
    expect(encounters).toBeGreaterThan(0);
    expect(encounters).toBeLessThan(20);
  });
  it('persists cooldown and requires leaving and re-entering after clearing', () => {
    const s = setup();
    grove(s);
    advance(s, 1.1);
    const e = enemies(s, 'ghost')[0]!;
    s.setPlayerPosition(e.x, e.y);
    s.player.stats.baseDamage = 100;
    s.step(frame, { ...IDLE_INTENT, skillQ: true });
    const group = s.getEncounterDebug().groves[0]!;
    expect(group.cooldownMs).toBe(90000);
    expect(s.player.hauntedIntroComplete).toBe(true);
    advance(s, 30);
    restore(s);
    expect(s.getEncounterDebug().groves[0]!.cooldownMs).toBeCloseTo(60000);
    advance(s, 61);
    expect(enemies(s, 'ghost')).toHaveLength(0);
    s.setPlayerPosition(33, 58);
    s.step(frame, IDLE_INTENT);
    grove(s);
    expect(s.getEncounterDebug().groves[0]!.cycle).toBe(2);
    expect(s.getEncounterDebug().groves[0]!.members.length).toBeGreaterThanOrEqual(2);
  });
  it('restores partial formation and dismisses retreats without granting XP', () => {
    const s = setup();
    grove(s);
    advance(s, 0.4);
    restore(s);
    expect(enemies(s, 'ghost')[0]?.combatReady).toBe(false);
    advance(s, 0.7);
    expect(enemies(s, 'ghost')[0]?.combatReady).toBe(true);
    s.setPlayerPosition(5, 55);
    advance(s, 8.1);
    expect(
      s.buildRenderSnapshot().entities.some((e) => e.spriteKey === 'ghost' && e.quietRemoval),
    ).toBe(true);
    advance(s, 0.9);
    expect(enemies(s, 'ghost')).toHaveLength(0);
    expect(s.player.stats.level).toBe(1);
    expect(s.player.stats.xp).toBe(0);
    expect(s.getEncounterDebug().groves[0]?.phase).toBe('cooldown');
    restore(s);
    expect(enemies(s, 'ghost')).toHaveLength(0);
  });
  it('does not produce ghosts merely because night begins', () => {
    const s = setup();
    s.setTimeOfDay(0.95);
    advance(s, 5);
    expect(enemies(s, 'ghost')).toHaveLength(0);
  });
  it('suppresses grove activation and pending manifestations around an active boss arena', () => {
    const s = setup(),
      world = encounterFixture();
    s.loadWorld({
      ...world,
      encounterSites: [
        world.encounterSites![0]!,
        { ...world.encounterSites![1]!, x: 22.5, y: 12.5 },
      ],
    });
    s.player.hurtTimerMs = 1e8;
    s.setTimeOfDay(0.95);
    start(s);
    advance(s, 3);
    expect(s.getEncounterDebug().bosses[0]?.phase).toBe('fighting');
    expect(s.getEncounterDebug().groves[0]?.phase).toBe('available');
    expect(enemies(s, 'ghost')).toHaveLength(0);
    expect(() => s.spawnEnemy('ghost', 22, 12)).toThrow('No available haunted grove');
  });
  it('uses actual dry ground and never manifests in blocked water or on a bank', () => {
    const s = setup();
    grove(s);
    advance(s, 2);
    for (const e of enemies(s, 'ghost')) {
      expect(canOccupy(s.world, e.x, e.y, e.halfSize, 'groundEnemy')).toBe(true);
      expect(s.world.tiles[Math.floor(e.y) * 64 + Math.floor(e.x)]).toBe(Tile.GRASS);
    }
  });
});
