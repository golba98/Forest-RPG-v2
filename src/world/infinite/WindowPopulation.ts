import type { Entity, PlayerEntity, EnemyEntity, PickupEntity } from '../../types/entities';
import type { SimulationRuntime, EncounterState } from '../../types/encounters';
import type { WorldData } from '../../types/world';
import type { ChunkDelta, InfiniteDescriptor } from './types';
import type { ChunkAddress } from './coordinates';
import type { ForestGenerator } from './ForestGenerator';
import { addressKey } from './coordinates';
import { Tile } from '../../types/tiles';
import { translateEntity } from './EntityCoordinates';
const EMPTY: ChunkDelta = { tiles: {}, removed: [], added: [], entities: [], activated: false };
export interface PopulationContext {
  readonly descriptor: InfiniteDescriptor;
  readonly prepared: readonly ChunkAddress[];
  readonly origin: { x: number; y: number };
  readonly deltas: ReadonlyMap<string, ChunkDelta>;
  readonly generator: ForestGenerator;
  keyAt(x: number, y: number): string;
  legacyTile(x: number, y: number): number | undefined;
}
export interface MountedWindow {
  world: WorldData;
  entities: Entity[];
  runtime: SimulationRuntime;
}
export function hydrateWindow(
  world: WorldData,
  player: PlayerEntity,
  portal: Entity | undefined,
  runtime: SimulationRuntime,
  context: PopulationContext,
): MountedWindow {
  const entities: Entity[] = [player];
  if (portal) entities.push(portal);
  const encounters: EncounterState = { version: 1, bosses: [], groves: [] };
  const baseline = baselineActors(world, context);
  for (const a of context.prepared) {
    const key = addressKey(a.x, a.y),
      delta = context.deltas.get(key) ?? EMPTY,
      s = context.descriptor.chunkSize;
    if (
      a.x * s < context.origin.x ||
      a.y * s < context.origin.y ||
      a.x * s >= context.origin.x + world.meta.width ||
      a.y * s >= context.origin.y + world.meta.width
    )
      continue;
    if (delta.activated) {
      entities.push(
        ...delta.entities.map((e) => translateEntity(e, -context.origin.x, -context.origin.y)),
      );
      if (delta.encounters) {
        encounters.bosses.push(...delta.encounters.bosses);
        encounters.groves.push(
          ...delta.encounters.groves.map((g) => ({
            ...g,
            members: g.members.map((m) => ({
              ...m,
              x: m.x - context.origin.x,
              y: m.y - context.origin.y,
            })),
          })),
        );
      }
    } else {
      for (const p of baseline)
        if (context.keyAt(p.x + context.origin.x, p.y + context.origin.y) === key) entities.push(p);
    }
  }
  const activeSites = new Set((world.encounterSites ?? []).map((s) => s.id));
  const activeEntities = entities.filter(
    (e) => e.kind !== 'enemy' || !e.encounterId || activeSites.has(e.encounterId),
  );
  const retained = new Set(activeEntities.map((e) => e.id));
  return {
    world,
    entities: activeEntities.filter(
      (e, i) => activeEntities.findIndex((other) => other.id === e.id) === i,
    ),
    runtime: {
      ...runtime,
      encounters: {
        version: 1,
        bosses: encounters.bosses.filter((b) => activeSites.has(b.siteId)),
        groves: encounters.groves
          .filter((g) => activeSites.has(g.siteId))
          .filter((g) => g.members.every((m) => m.status !== 'active' || retained.has(m.id))),
      },
    },
  };
}
export function baselineActors(world: WorldData, context: PopulationContext): Entity[] {
  const result: Entity[] = [];
  const base = (id: string, x: number, y: number) => ({
    id,
    x: x + 0.5,
    y: y + 0.5,
    prevX: x + 0.5,
    prevY: y + 0.5,
    halfSize: 0.3,
    facing: 'S' as const,
    anim: 'idle' as const,
    animTimeMs: 0,
    alive: true,
  });
  const hp = (type: string) =>
    type === 'beetle'
      ? 15 + (context.descriptor.level - 1) * 5
      : type === 'maggot'
        ? 2 + Math.floor(context.descriptor.level / 3)
        : 3 + Math.floor(context.descriptor.level / 2);
  world.enemySpawns.forEach((p, i) =>
    result.push({
      ...base(p.id ?? `legacy:enemy:${i}`, p.x, p.y),
      kind: 'enemy',
      enemyType: p.type,
      health: p.maxHealth ?? hp(p.type),
      maxHealth: p.maxHealth ?? hp(p.type),
      aiState: 'idle',
      aggressive: p.aggressive ?? true,
      hurtTimerMs: 0,
      attackCooldownMs: 0,
    } as EnemyEntity),
  );
  world.pickupSpawns.forEach((p, i) =>
    result.push({
      ...base(p.id ?? `legacy:coin:${i}`, p.x, p.y),
      kind: 'pickup',
      pickupType: p.type,
      ...(p.type === 'chest'
        ? { chest: { variant: p.chestVariant ?? 'wooden', state: 'closed', elapsedMs: 0 } }
        : {}),
    } as PickupEntity),
  );
  // Optional deterministic encounters/resources outside the bounded starting objectives.
  for (
    let cy = Math.floor(context.origin.y / 32);
    cy < Math.ceil((context.origin.y + world.meta.height) / 32);
    cy++
  )
    for (
      let cx = Math.floor(context.origin.x / 32);
      cx < Math.ceil((context.origin.x + world.meta.width) / 32);
      cx++
    ) {
      const a = { x: cx, y: cy },
        gx = cx * 32 + 16,
        gy = cy * 32 + 16;
      if (
        Math.hypot(gx, gy) < 96 ||
        ((gx % 96 === 48 || gx % 96 === -48) &&
          (gy % 96 === 48 || gy % 96 === -48) &&
          context.generator.hasGrove(Math.floor(gx / 96), Math.floor(gy / 96))) ||
        context.generator.tileAt(gx, gy) !== Tile.GRASS ||
        context.legacyTile(gx, gy) !== undefined
      )
        continue;
      result.push({
        ...base(`wild:${a.x},${a.y}`, gx - context.origin.x, gy - context.origin.y),
        kind: 'enemy',
        enemyType: (a.x + a.y) % 2 ? 'mantis' : 'maggot',
        health: hp((a.x + a.y) % 2 ? 'mantis' : 'maggot'),
        maxHealth: hp((a.x + a.y) % 2 ? 'mantis' : 'maggot'),
        aiState: 'idle',
        aggressive: true,
        hurtTimerMs: 0,
        attackCooldownMs: 0,
      });
      if ((a.x + a.y) % 4 === 0 && context.generator.tileAt(gx + 3, gy) === Tile.GRASS)
        result.push({
          ...base(`chest:${a.x},${a.y}`, gx - context.origin.x + 3, gy - context.origin.y),
          kind: 'pickup',
          pickupType: 'chest',
          requiredForCompletion: false,
          chest: { variant: 'wooden', state: 'closed', elapsedMs: 0 },
        });
    }
  return result;
}
