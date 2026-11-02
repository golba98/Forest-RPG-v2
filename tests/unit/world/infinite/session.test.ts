import { it, expect } from 'vitest';
import { WorldRepository } from '../../../../src/persistence/WorldRepository';
import type { WorldCheckpoint } from '../../../../src/persistence/WorldRepository';
import type { ChunkDelta, RegionIdentity } from '../../../../src/world/infinite/types';
import { InfiniteSession, bindSession } from '../../../../src/world/infinite/InfiniteSession';
import { Simulation } from '../../../../src/simulation/Simulation';
import { Tile } from '../../../../src/types/tiles';
import type { WorldProp } from '../../../../src/types/world';
import { movementRuntime, restoreMovementRuntime } from '../../../../src/systems/MovementSystem';
import { collectLoot } from '../../../../src/systems/LootSystem';
class MemoryRepository extends WorldRepository {
  readonly recordsByKey = new Map<string, ChunkDelta>();
  state: WorldCheckpoint | undefined;
  constructor() {
    super({} as IDBFactory);
  }
  override async establish(_id: string, _region: RegionIdentity) {}
  override async readChunk(_id: string, key: string, _revision: number) {
    return this.recordsByKey.get(key);
  }
  override async checkpoint(_state: WorldCheckpoint, changes: ReadonlyMap<string, ChunkDelta>) {
    this.state = structuredClone(_state);
    for (const [key, delta] of changes) this.recordsByKey.set(key, structuredClone(delta));
  }
}
it('restores removed scenery, altered cells, collected objectives and living actor state after eviction', async () => {
  const session = new InfiniteSession(
    {
      id: 'session',
      seed: 42,
      generatorVersion: 13,
      biomeVersion: 1,
      chunkSize: 32,
      level: 1,
      difficulty: 'normal',
    },
    new MemoryRepository(),
  );
  await session.prepareAt(0.5, 0.5);
  const sim = new Simulation();
  sim.loadWorld(bindSession(session.buildWindow(), session));
  const world = sim.world,
    origin = world.window!;
  const flower = world.props.find(
    (p) =>
      p.kind === 'flower_pink' &&
      p.tileX >= 8 &&
      p.tileY >= 8 &&
      p.tileX < world.meta.width - 8 &&
      p.tileY < world.meta.height - 8,
  )!;
  expect(flower).toBeDefined();
  const props = world.props as WorldProp[];
  props.splice(props.indexOf(flower), 1);
  const placed = { ...flower, id: 'placed:cut-flower' };
  sim.applyWorldEdit({
    kind: 'place',
    prop: { ...placed, tileX: placed.tileX + origin.originX, tileY: placed.tileY + origin.originY },
  });
  const addedIndex = sim.world.props.findIndex((p) => p.id === placed.id);
  expect(addedIndex).toBeGreaterThanOrEqual(0);
  (sim.world.props as WorldProp[]).splice(addedIndex, 1);
  const tile = world.tiles.findIndex((v) => v === Tile.FLOWERS);
  expect(tile).toBeGreaterThanOrEqual(0);
  world.tiles[tile] = Tile.GRASS;
  const coin = sim.getEntities().find((e) => e.kind === 'pickup' && e.pickupType === 'coin')!;
  coin.alive = false;
  const enemy = sim.getEntities().find((e) => e.kind === 'enemy')!;
  if (enemy.kind === 'enemy') enemy.health = 1;
  const before = session.objectiveStatus();
  await sim.saveInfinite();
  expect(session.objectiveStatus().coinsRemaining).toBe(before.coinsRemaining - 1);
  await sim.setGlobalPosition(-400.5, 300.5);
  expect(session.source.info.residentChunks).toBeLessThanOrEqual(128);
  await sim.setGlobalPosition(0.5, 0.5);
  expect(sim.world.props.some((p) => p.id === flower.id)).toBe(false);
  expect(sim.world.props.some((p) => p.id === placed.id)).toBe(false);
  expect(sim.world.tiles[tile]).toBe(Tile.GRASS);
  expect(sim.getEntities().find((e) => e.id === coin.id)?.alive).toBe(false);
  const restored = sim.getEntities().find((e) => e.id === enemy.id);
  expect(restored?.kind === 'enemy' && restored.health).toBe(1);
  expect(sim.world.window?.originX).toBe(origin.originX);
  session.dispose();
}, 30000);

it('preserves movement anchors during a viewport rebase and pays opened chests once after reload', async () => {
  const repository = new MemoryRepository();
  const descriptor = {
    id: 'movement-chests',
    seed: 42,
    generatorVersion: 13,
    biomeVersion: 1,
    chunkSize: 32,
    level: 1,
    difficulty: 'normal',
  } as const;
  const session = new InfiniteSession(descriptor, repository);
  await session.prepareAt(0.5, 0.5);
  const sim = new Simulation();
  sim.loadWorld(bindSession(session.buildWindow(), session));
  const player = sim.player;
  const oldOrigin = session.origin;
  restoreMovementRuntime(player, {
    landing: { x: player.x - 1, y: player.y },
    dash: { remaining: 150, cooldown: 600 },
  });
  await sim.ensureView(160, 90);
  expect(sim.player).toBe(player);
  const movement = movementRuntime(player);
  expect(movement.dash).toEqual({ remaining: 150, cooldown: 600 });
  expect(movement.landing!.x + session.origin.x).toBe(0.5 - 1);
  expect(movement.landing!.y + session.origin.y).toBe(0.5);
  expect(session.origin).not.toEqual(oldOrigin);
  await sim.setGlobalPosition(-400.5, 300.5);
  const chest = sim
    .getEntities()
    .find(
      (e) =>
        e.kind === 'pickup' &&
        e.pickupType === 'chest' &&
        e.x > 8 &&
        e.y > 8 &&
        e.x < sim.world.meta.width - 8 &&
        e.y < sim.world.meta.height - 8,
    );
  expect(chest?.kind).toBe('pickup');
  if (!chest || chest.kind !== 'pickup') throw new Error('Missing test chest');
  sim.player.x = chest.x - 0.8;
  sim.player.y = chest.y;
  const before = sim.player.stats.coins;
  collectLoot(sim.world, sim.player, sim.getEntities(), 0, true, () => {});
  expect(chest.chest?.state).toBe('opening');
  collectLoot(sim.world, sim.player, sim.getEntities(), 0.6, false, () => {});
  expect(sim.player.stats.coins).toBe(before + 5);
  const position = session.globalPosition(sim.player);
  await sim.saveInfinite();
  await sim.setGlobalPosition(0.5, 0.5);
  await sim.setGlobalPosition(position.x, position.y);
  expect(sim.getEntities().find((e) => e.id === chest.id)).toMatchObject({
    chest: { state: 'opened' },
  });
  await sim.saveInfinite();
  const state = repository.state!;
  const restored = new InfiniteSession(descriptor, repository);
  restored.revision = state.revision;
  await restored.prepareAt(position.x, position.y);
  const reloaded = new Simulation();
  reloaded.loadWorld(bindSession(restored.buildWindow(), restored));
  reloaded.restoreInfinite(state);
  const opened = reloaded.getEntities().find((e) => e.id === chest.id);
  expect(opened).toMatchObject({ chest: { state: 'opened' } });
  collectLoot(reloaded.world, reloaded.player, reloaded.getEntities(), 1, true, () => {});
  expect(reloaded.player.stats.coins).toBe(before + 5);
  session.dispose();
  restored.dispose();
}, 30000);
