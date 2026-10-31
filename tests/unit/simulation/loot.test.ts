import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { makeWorld } from '../game/fakes';
import { IDLE_INTENT, type PickupEntity } from '../../../src/types/entities';
import { canOccupy, hasClearPath } from '../../../src/systems/CollisionSystem';
import { collectLoot, prepareLoot } from '../../../src/systems/LootSystem';
import { roundStatus } from '../../../src/systems/PortalSystem';
import { Tile } from '../../../src/types/tiles';

function fixture() {
  const s = new Simulation();
  s.loadWorld({
    ...makeWorld(),
    pickupSpawns: [{ id: 'chest:5:5', type: 'chest', x: 5, y: 5, chestVariant: 'wooden' }],
  });
  s.setPlayerPosition(5.5, 6.4);
  const chest = s.getEntities().find((e) => e.kind === 'pickup') as PickupEntity;
  return { s, chest };
}
describe('loot transactions', () => {
  it('opens once, blocks its base, and preserves opened state after restore', () => {
    const { s, chest } = fixture();
    expect(canOccupy(s.world, 5.5, 5.7, 0.1)).toBe(false);
    s.step(1 / 60, { ...IDLE_INTENT, interact: true });
    expect(chest.chest?.state).toBe('opening');
    s.step(0.3, IDLE_INTENT);
    const entities = structuredClone([...s.getEntities()]);
    const runtime = s.getRuntimeState();
    s.restoreEntities(entities, s.getTimeOfDay(), s.elapsedMs, 0, runtime);
    s.step(0.3, IDLE_INTENT);
    expect(s.player.stats.coins).toBe(5);
    for (let i = 0; i < 10; i++) s.step(0.1, { ...IDLE_INTENT, interact: true });
    expect(s.player.stats.coins).toBe(5);
    expect(s.getEntities().find((e) => e.id === chest.id)).toMatchObject({
      alive: true,
      chest: { state: 'opened' },
    });
  });
  it('commits balance and opened state before feedback observers', () => {
    const { s, chest } = fixture();
    chest.chest!.state = 'opening';
    chest.chest!.elapsedMs = 590;
    let called = 0;
    collectLoot(s.world, s.player, s.getEntities(), 0.02, false, () => {
      called++;
      expect(chest.chest?.state).toBe('opened');
      expect(s.player.stats.coins).toBe(5);
    });
    expect(called).toBe(1);
  });
  it('does not interact through terrain or while jumping', () => {
    const { s, chest } = fixture();
    s.player.isJumping = true;
    collectLoot(s.world, s.player, s.getEntities(), 0.02, true, () => {});
    expect(chest.chest?.state).toBe('closed');
    s.player.isJumping = false;
    s.world.tiles[6 * s.world.meta.width + 5] = Tile.BORDER;
    collectLoot(s.world, s.player, s.getEntities(), 0.02, true, () => {});
    expect(chest.chest?.state).toBe('closed');
  });
  it('defaults legacy chests and never resurrects consumed ones', () => {
    const { s, chest } = fixture();
    delete chest.chest;
    prepareLoot(s.world, s.getEntities());
    expect(chest).toMatchObject({ chest: { state: 'closed' } });
    chest.alive = false;
    delete chest.chest;
    prepareLoot(s.world, s.getEntities());
    expect(chest.chest).toBeUndefined();
    expect(canOccupy(s.world, 5.5, 5.7, 0.1)).toBe(true);
  });
  it('collects valued bonus coins once without changing completion requirements', () => {
    const { s, chest } = fixture();
    const coin: PickupEntity = {
      ...chest,
      id: 'bonus',
      pickupType: 'coin',
      x: s.player.x,
      y: s.player.y,
      value: 5,
      requiredForCompletion: false,
    };
    delete coin.chest;
    expect(roundStatus([coin]).complete).toBe(true);
    collectLoot(s.world, s.player, [coin], 0.02, false, () => {});
    collectLoot(s.world, s.player, [coin], 0.02, false, () => {});
    expect(s.player.stats.coins).toBe(5);
    expect(coin.alive).toBe(false);
    expect(
      roundStatus([{ ...coin, alive: true, requiredForCompletion: true }]).coinsRemaining,
    ).toBe(1);
  });
  it('allows walking behind foliage but blocks the trunk', () => {
    const world = {
      ...makeWorld(),
      props: [{ id: 1, kind: 'tree' as const, tileX: 5, tileY: 5, solid: true }],
    };
    expect(hasClearPath(world, 4, 5.2, 7, 5.2, 0.2)).toBe(true);
    expect(canOccupy(world, 5.5, 5.85, 0.2)).toBe(false);
  });
});

it('creates exactly one optional enemy coin drop and never adds drops to the tutorial', () => {
  for (const tutorial of [false, true]) {
    const s = new Simulation();
    s.loadWorld(makeWorld(1, tutorial));
    s.setPlayerPosition(2.5, 3.5);
    s.player.facing = 'E';
    const id = s.spawnEnemy('mantis', 3.5, 3.5);
    const enemy = s.getEntities().find((e) => e.id === id);
    if (enemy?.kind !== 'enemy') throw new Error('Missing enemy');
    enemy.health = 1;
    enemy.aggressive = false;
    s.step(1 / 60, { ...IDLE_INTENT, attack: true });
    for (let i = 0; i < 12; i++) s.step(1 / 60, IDLE_INTENT);
    expect(enemy.alive).toBe(false);
    for (let i = 0; i < 20; i++) s.step(0.02, { ...IDLE_INTENT, attack: true });
    const drops = s.getEntities().filter((e) => e.id === `coin-drop:${id}`);
    expect(drops.length).toBe(tutorial ? 0 : 1);
    if (!tutorial)
      expect(drops[0]).toMatchObject({
        value: 1,
        requiredForCompletion: false,
        pickupType: 'coin',
      });
  }
});
