import { IDLE_INTENT } from '../../../../src/types/entities';
import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import golden from '../../../fixtures/streaming-surface-reference.json';
import { streamingSurfaceFixture } from '../../../fixtures/streaming-surface';
import {
  SurfaceSites,
  SurfaceMoisture,
  surfaceSites,
} from '../../../../src/systems/SurfaceMoisture';
import { prepareInSlices, CancelledWork } from '../../../../src/core/WorkSlice';
import { InfiniteSession, bindSession } from '../../../../src/world/infinite/InfiniteSession';
import { WorldRepository } from '../../../../src/persistence/WorldRepository';
import { Simulation } from '../../../../src/simulation/Simulation';
import type { ChunkDelta } from '../../../../src/world/infinite/types';
import type { WorldCheckpoint } from '../../../../src/persistence/WorldRepository';
import { restoreWindowMoisture } from '../../../../src/world/infinite/ChunkMoisture';
class Repository extends WorldRepository {
  savedChunks = new Map<string, ChunkDelta>();
  stalled: (() => void) | undefined;
  delay = false;
  fail = false;
  constructor() {
    super({} as IDBFactory);
  }
  override async establish() {}
  override async readChunk(_id: string, key: string) {
    return this.savedChunks.get(key);
  }
  override async checkpoint(_state: WorldCheckpoint, changes: ReadonlyMap<string, ChunkDelta>) {
    if (this.delay)
      await new Promise<void>((resolve) => {
        this.stalled = resolve;
      });
    if (this.fail) throw new Error('disk unavailable');
    for (const [k, v] of changes) this.savedChunks.set(k, structuredClone(v));
  }
}
const descriptor = {
  id: 'transitions',
  seed: 42,
  generatorVersion: 13,
  biomeVersion: 1,
  chunkSize: 32,
  level: 1,
  difficulty: 'normal',
} as const;
it('staged surface indexes match pre-optimization golden output, including bridge approaches and nests', async () => {
  for (const row of golden.rows) {
    const world = streamingSurfaceFixture(row.vertical);
    const sites = await SurfaceSites.prepare(world, () => true);
    const hash = createHash('sha256')
      .update(JSON.stringify({ eligible: sites.eligible, pools: [...sites.pools] }))
      .digest('hex');
    expect(hash).toBe(row.hash);
    expect(surfaceSites(world)).toBe(sites);
  }
});
it('cancels cooperative work without running or publishing its remaining mutations', async () => {
  let calls = 0;
  function* job() {
    while (true) {
      calls++;
      yield;
    }
  }
  await expect(prepareInSlices(job(), () => false)).rejects.toBeInstanceOf(CancelledWork);
  expect(calls).toBe(0);
});
it('restores non-aligned chunks and uniform weather states with identical per-cell integration', () => {
  const world = streamingSurfaceFixture(false);
  const at = 720101;
  const m = {
    wetness: Array.from({ length: 1024 }, (_, i) => i % 256),
    puddles: Array.from({ length: 1024 }, (_, i) => (i * 7) % 256),
    atMs: 710001,
  };
  const delta: ChunkDelta = {
    tiles: {},
    removed: [],
    added: [],
    entities: [],
    activated: true,
    moisture: m,
  };
  const restored = restoreWindowMoisture(world, at, 42, 32, { x: -17, y: 19 }, () => delta);
  // Compare arbitrary chunk offsets to independently restored one-cell windows.
  for (const [x, y] of [
    [0, 0],
    [31, 1],
    [47, 47],
    [17, 23],
  ] as const) {
    const one = {
      ...world,
      meta: { ...world.meta, width: 1, height: 1 },
      tiles: new Uint8Array(1),
    };
    const sample = restoreWindowMoisture(one, at, 42, 32, { x: x - 17, y: y + 19 }, () => delta);
    expect(restored.wetness[y * 48 + x]).toBe(sample.wetness[0]);
    expect(restored.puddles[y * 48 + x]).toBe(sample.puddles[0]);
  }
});
it('stages negative/diagonal windows without publishing origin or aliasing active buffers', async () => {
  const session = new InfiniteSession(descriptor, new Repository());
  try {
    await session.prepareAt(0.5, 0.5);
    const old = session.buildWindow(),
      origin = session.origin;
    await session.prepareAt(-32.5, -32.5);
    const staged = await session.stageWindow(old, () => true);
    expect(session.origin).toEqual(origin);
    expect(staged.tiles.buffer).not.toBe(old.tiles.buffer);
    for (let y = 0; y < staged.meta.height; y++)
      for (let x = 0; x < staged.meta.width; x++) {
        expect(staged.tiles[y * staged.meta.width + x]).toBe(
          session.tileAt(x + staged.window!.originX, y + staged.window!.originY),
        );
      }
    session.commitWindow(staged);
    expect(session.origin).toEqual({ x: staged.window!.originX, y: staged.window!.originY });
  } finally {
    session.dispose();
  }
}, 30000);
it('continues fixed updates during delayed checkpoint and guards an unsafe persistence edge', async () => {
  const repo = new Repository(),
    session = new InfiniteSession(descriptor, repo),
    sim = new Simulation();
  try {
    await session.prepareAt(0.5, 0.5);
    sim.loadWorld(bindSession(session.buildWindow(), session));
    repo.delay = true;
    sim.player.x = 128.5;
    sim.player.prevX = 128.5;
    sim.step(1 / 60, IDLE_INTENT);
    for (let n = 0; n < 2000 && !repo.stalled; n++) await new Promise((r) => setTimeout(r, 2));
    expect(repo.stalled).toBeDefined();
    expect(session.transitions).toBe(1);
    expect(sim.getWorldWaitReason()).toBeNull();
    const elapsed = sim.elapsedMs;
    sim.step(1 / 60, IDLE_INTENT);
    expect(sim.elapsedMs).toBeGreaterThan(elapsed);
    sim.player.x = 10;
    expect(sim.getWorldWaitReason()).toBe('persistence-edge');
    repo.stalled!();
    repo.delay = false;
    await sim.saveInfinite();
    expect(session.error).toBeNull();
  } finally {
    repo.stalled?.();
    session.dispose();
  }
}, 30000);
it('preserves sub-byte live wetness and update remainder across overlapping windows', () => {
  const world = streamingSurfaceFixture(false);
  const window = {
    originX: 0,
    originY: 0,
    descriptor,
    discovered: new Uint8Array(world.tiles.length),
    discoveryVersion: 0,
    teleportVersion: 0,
  };
  const a = new SurfaceMoisture(new SurfaceSites({ ...world, window }));
  a.step(30123, true);
  const target = new SurfaceMoisture(
    new SurfaceSites({ ...world, window: { ...window, originX: 1 } }),
  );
  target.copyOverlap(a);
  for (const i of target.sites.eligible) {
    const x = (i % 48) + 1,
      y = Math.floor(i / 48);
    if (x < 48) expect(target.wetness[i]).toBe(a.wetness[y * 48 + x]);
  }
  expect(target.save().remainderMs).toBe(a.save().remainderMs);
});
it('reconciles edits and live enemy state made while derived state is being prepared', async () => {
  const { vi } = await import('vitest');
  const repo = new Repository(),
    session = new InfiniteSession(descriptor, repo),
    sim = new Simulation();
  let release!: () => void, started!: () => void;
  const barrier = new Promise<void>((r) => {
      release = r;
    }),
    ready = new Promise<void>((r) => {
      started = r;
    });
  const original = SurfaceSites.prepare;
  const spy = vi.spyOn(SurfaceSites, 'prepare').mockImplementationOnce(async (world, valid) => {
    started();
    await barrier;
    return original(world, valid);
  });
  try {
    await session.prepareAt(0.5, 0.5);
    sim.loadWorld(bindSession(session.buildWindow(), session));
    const enemy = sim
      .getEntities()
      .find((e) => e.kind === 'enemy' && e.x > 80 && e.x < 140 && e.y > 64 && e.y < 128)!;
    const flower = sim.world.props.find(
      (p) =>
        p.kind === 'flower_pink' && p.tileX > 64 && p.tileX < 128 && p.tileY > 64 && p.tileY < 128,
    )!;
    expect(flower).toBeDefined();
    expect(enemy).toBeDefined();
    sim.player.x = 128.5;
    sim.player.prevX = 128.5;
    sim.step(1 / 60, IDLE_INTENT);
    await ready;
    const origin = session.origin;
    sim.applyWorldEdit({
      kind: 'remove',
      id: String(flower.id),
      x: flower.tileX + origin.x,
      y: flower.tileY + origin.y,
    });
    if (enemy.kind === 'enemy') enemy.health = 1;
    release();
    for (let n = 0; n < 2000 && session.transitions === 0; n++)
      await new Promise((r) => setTimeout(r, 2));
    expect(session.transitions).toBe(1);
    expect(sim.world.props.some((p) => p.id === flower.id)).toBe(false);
    expect(sim.getEntities().find((e) => e.id === enemy.id)).toBe(enemy);
    if (enemy.kind === 'enemy') expect(enemy.health).toBe(1);
    await sim.saveInfinite();
  } finally {
    release();
    spy.mockRestore();
    session.dispose();
  }
}, 30000);
it('retains dirty state on checkpoint failure, blocks unsafe travel, and permits durable recovery', async () => {
  const repo = new Repository(),
    session = new InfiniteSession(descriptor, repo),
    sim = new Simulation();
  try {
    await session.prepareAt(0.5, 0.5);
    sim.loadWorld(bindSession(session.buildWindow(), session));
    const flower = sim.world.props.find(
      (p) =>
        p.kind === 'flower_pink' && p.tileX > 64 && p.tileX < 128 && p.tileY > 64 && p.tileY < 128,
    )!;
    sim.applyWorldEdit({
      kind: 'remove',
      id: String(flower.id),
      x: flower.tileX + session.origin.x,
      y: flower.tileY + session.origin.y,
    });
    repo.fail = true;
    sim.player.x = 128.5;
    sim.step(1 / 60, IDLE_INTENT);
    for (let n = 0; n < 2000 && !session.error; n++) await new Promise((r) => setTimeout(r, 2));
    expect(session.error).toContain('disk unavailable');
    expect(session.deltas.size).toBeGreaterThan(0);
    sim.player.x = 10;
    expect(sim.getWorldWaitReason()).toBe('stream-error-edge');
    repo.fail = false;
    await sim.saveInfinite();
    expect(session.error).toBeNull();
    expect([...repo.savedChunks.values()].some((d) => d.removed.includes(String(flower.id)))).toBe(
      true,
    );
  } finally {
    session.dispose();
  }
}, 30000);
