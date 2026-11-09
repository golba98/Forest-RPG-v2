import { isTileId } from '../types/tiles';
import { COORDINATE_LIMIT } from '../world/infinite/coordinates';
import { newWorldId } from '../world/infinite/InfiniteSession';
import { biomes } from '../world/infinite/biomes';
import type { RegionIdentity } from '../world/infinite/types';
import type { ChunkDelta } from '../world/infinite/types';
import type { WorldCheckpoint, WorldRepository } from './WorldRepository';
import { validateEncounterState } from './EncounterValidation';
import { BIOME_IDS, validEnvironmentAssetKey } from '../world/Biomes';
import type { EncounterState } from '../types/encounters';
import { finite, object as isRecord } from './codecs/validation';

const nonNegativeFinite = (v: unknown) => finite(v) && v >= 0;
const coordinate = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < COORDINATE_LIMIT - 1024;
export function validateCheckpoint(
  value: unknown,
  entity: (v: unknown) => boolean,
): asserts value is WorldCheckpoint {
  if (!isRecord(value) || value.version !== 3 || !isRecord(value.descriptor))
    throw new Error('Invalid infinite world checkpoint');
  const d = value.descriptor;
  if (
    typeof d.id !== 'string' ||
    !d.id ||
    d.id.length > 160 ||
    !Number.isInteger(d.seed) ||
    Number(d.seed) < 0 ||
    Number(d.seed) > 0xffffffff ||
    !(
      (d.generatorVersion === 13 && d.biomeVersion === 1) ||
      ((d.generatorVersion === 14 || d.generatorVersion === 15 || d.generatorVersion === 16) &&
        d.biomeVersion === 2)
    ) ||
    (d.mode !== undefined && d.mode !== 'adventure' && d.mode !== 'biome-walk') ||
    ![32, 64].includes(Number(d.chunkSize)) ||
    !Number.isInteger(d.level) ||
    Number(d.level) < 1 ||
    !['easy', 'normal', 'hard'].includes(String(d.difficulty))
  )
    throw new Error('Unsupported infinite world descriptor');
  if (value.exploration !== undefined) {
    const e = value.exploration;
    const point = (p: unknown) => isRecord(p) && coordinate(p.x) && coordinate(p.y);
    if (
      d.mode !== 'biome-walk' ||
      !isRecord(e) ||
      !point(e.home) ||
      !isRecord(e.landings) ||
      Object.keys(e.landings).length > 5 ||
      Object.entries(e.landings).some(
        ([id, p]) => !BIOME_IDS.includes(id as (typeof BIOME_IDS)[number]) || !point(p),
      )
    )
      throw new Error('Invalid exploration landings');
  }
  if (
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    typeof value.time !== 'number' ||
    value.time < 0 ||
    value.time >= 1 ||
    typeof value.elapsedMs !== 'number' ||
    !Number.isFinite(value.elapsedMs) ||
    value.elapsedMs < 0 ||
    !Array.isArray(value.objectives) ||
    value.objectives.length > 8192 ||
    !value.objectives.every((v) => typeof v === 'string' && v.length < 160) ||
    !isRecord(value.runtime) ||
    !Number.isInteger(value.runtime.rngState) ||
    Number(value.runtime.rngState) < 0 ||
    Number(value.runtime.rngState) > 0xffffffff
  )
    throw new Error('Invalid infinite world runtime');
  const runtime = value.runtime;
  for (const key of ['entitySequence', 'lootSequence'])
    if (
      runtime[key] !== undefined &&
      (!Number.isSafeInteger(runtime[key]) || Number(runtime[key]) < 0)
    )
      throw new Error('Invalid entity sequence');
  if (runtime.movement !== undefined) {
    const movement = runtime.movement;
    if (
      !isRecord(movement) ||
      (movement.landing !== undefined &&
        (!isRecord(movement.landing) ||
          !coordinate(movement.landing.x) ||
          !coordinate(movement.landing.y))) ||
      (movement.dash !== undefined &&
        (!isRecord(movement.dash) ||
          !nonNegativeFinite(movement.dash.remaining) ||
          !nonNegativeFinite(movement.dash.cooldown)))
    )
      throw new Error('Invalid movement runtime');
  }
  if (
    !Array.isArray(value.entities) ||
    value.entities.length > 256 ||
    !value.entities.every(
      (v) =>
        entity(v) && isRecord(v) && ['player', 'portal', 'projectile'].includes(String(v.kind)),
    ) ||
    value.entities.filter((e) => isRecord(e) && e.kind === 'player').length !== 1 ||
    value.entities.filter((e) => isRecord(e) && e.kind === 'portal').length !==
      (d.mode === 'biome-walk' ? 0 : 1)
  )
    throw new Error('Invalid infinite world entities');
}
export function validateDelta(
  value: unknown,
  size: number,
  entity: (v: unknown) => boolean,
): asserts value is ChunkDelta {
  if (
    !isRecord(value) ||
    !isRecord(value.tiles) ||
    !Object.entries(value.tiles).every(
      ([k, v]) =>
        /^\d+$/.test(k) && Number(k) < size * size && typeof v === 'number' && isTileId(v),
    ) ||
    !Array.isArray(value.removed) ||
    !value.removed.every((v) => typeof v === 'string' && v.length <= 160) ||
    !Array.isArray(value.added) ||
    !Array.isArray(value.entities) ||
    value.entities.length > 4096 ||
    !value.entities.every(
      (v) => entity(v) && isRecord(v) && ['enemy', 'pickup'].includes(String(v.kind)),
    ) ||
    typeof value.activated !== 'boolean'
  )
    throw new Error('Invalid chunk modifications');
  if (
    value.events !== undefined &&
    (!isRecord(value.events) ||
      !Object.values(value.events).every(
        (v) =>
          typeof v === 'boolean' ||
          typeof v === 'string' ||
          (typeof v === 'number' && Number.isFinite(v)),
      ))
  )
    throw new Error('Invalid persistent events');
  const bytes = (v: unknown, length: number) =>
    Array.isArray(v) &&
    (v.length === length || v.length === 0) &&
    v.every((b) => typeof b === 'number' && Number.isInteger(b) && b >= 0 && b <= 255);
  if (value.discovered !== undefined && !bytes(value.discovered, (size * size) / 8))
    throw new Error('Invalid discovery mask');
  if (
    value.moisture !== undefined &&
    (!isRecord(value.moisture) ||
      !bytes(value.moisture.wetness, size * size) ||
      !bytes(value.moisture.puddles, size * size) ||
      typeof value.moisture.atMs !== 'number' ||
      !Number.isFinite(value.moisture.atMs) ||
      value.moisture.atMs < 0)
  )
    throw new Error('Invalid chunk moisture');
  const kinds = [
    'tree',
    'bush_small',
    'bush_obstacle',
    'flower_clump',
    'flower_pink',
    'flower_yellow',
    'log_horizontal',
    'log_vertical',
    'log_stump',
    'rock_boulder',
    'rock_pebble',
    'hole',
  ];
  if (
    !value.added.every(
      (v) =>
        isRecord(v) &&
        (typeof v.id === 'string' || Number.isSafeInteger(v.id)) &&
        coordinate(v.tileX) &&
        coordinate(v.tileY) &&
        Number.isInteger(v.tileX) &&
        Number.isInteger(v.tileY) &&
        kinds.includes(String(v.kind)) &&
        validEnvironmentAssetKey(v.assetKey) &&
        typeof v.solid === 'boolean',
    )
  )
    throw new Error('Invalid placed object');
  if (
    value.encounters !== undefined &&
    (!isRecord(value.encounters) ||
      value.encounters.version !== 1 ||
      !Array.isArray(value.encounters.bosses) ||
      !Array.isArray(value.encounters.groves))
  )
    throw new Error('Invalid chunk encounters');
  if (isRecord(value.encounters)) {
    const state = structuredClone(value.encounters) as unknown as EncounterState;
    const sites = [
      ...state.bosses.map((b) => ({ id: b.siteId, kind: 'nest' as const, x: 1, y: 1 })),
      ...state.groves.map((g) => ({ id: g.siteId, kind: 'grove' as const, x: 1, y: 1 })),
    ];
    if (sites.length > 16 || sites.some((s) => typeof s.id !== 'string' || s.id.length > 160))
      throw new Error('Invalid chunk encounter sites');
    for (const grove of state.groves) {
      if (!Array.isArray(grove.members)) throw new Error('Invalid ghost members');
      for (const member of grove.members) {
        if (!coordinate(member.x) || !coordinate(member.y))
          throw new Error('Invalid ghost coordinates');
        member.x = 1;
        member.y = 1;
      }
    }
    validateEncounterState({ meta: { width: 10, height: 10 }, encounterSites: sites }, state);
  }
}
function checksum(text: string, hash = 2166136261) {
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}
export async function exportInfinite(
  repository: WorldRepository,
  state: WorldCheckpoint,
  overrides: ReadonlyMap<string, ChunkDelta> = new Map(),
): Promise<Blob> {
  async function* records(): AsyncGenerator<unknown> {
    yield { format: 'forestrpg', version: 3, checkpoint: state };
    for await (const region of repository.regions(state.descriptor.id)) yield { region };
    for await (const record of repository.records(state.descriptor.id, state.revision))
      if (!overrides.has(record.key)) yield record;
    for (const [key, delta] of overrides) yield { key, delta };
  }
  const iterator = records(),
    encoder = new TextEncoder();
  let count = -1,
    hash = 2166136261;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.enqueue(encoder.encode(JSON.stringify({ end: count, checksum: hash }) + '\n'));
          controller.close();
          return;
        }
        const line =
          JSON.stringify(next.value, (_k, v: unknown) =>
            v instanceof Uint8Array ? Array.from(v) : v,
          ) + '\n';
        hash = checksum(line, hash);
        count++;
        controller.enqueue(encoder.encode(line));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
  const blob = await new Response(stream).blob();
  return new Blob([blob], { type: 'application/x-ndjson' });
}

async function* lines(input: string | Blob): AsyncGenerator<string> {
  if (typeof input === 'string') {
    for (const line of input.split('\n')) if (line) yield line;
    return;
  }
  const reader = input.stream().getReader(),
    decoder = new TextDecoder();
  let pending = '';
  try {
    for (;;) {
      const next = await reader.read();
      pending += decoder.decode(next.value, { stream: !next.done });
      let index: number;
      while ((index = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, index);
        pending = pending.slice(index + 1);
        if (line) yield line;
      }
      if (pending.length > 8_000_000) throw new Error('Archive record is too large');
      if (next.done) break;
    }
    if (pending) yield pending;
  } finally {
    reader.releaseLock();
  }
}
/** Stages the import under a new world identity. The active game is changed only after the checksum passes. */
export async function importInfinite(
  repository: WorldRepository,
  input: string | Blob,
  entity: (v: unknown) => boolean,
): Promise<WorldCheckpoint> {
  let state: WorldCheckpoint | undefined,
    count = 0,
    hash = 2166136261,
    ended = false;
  try {
    for await (const line of lines(input)) {
      const record: unknown = JSON.parse(line);
      if (!isRecord(record) || ended) throw new Error('Invalid infinite world archive');
      if (record.end !== undefined) {
        if (record.end !== count || record.checksum !== hash)
          throw new Error('Incomplete or damaged world archive');
        ended = true;
        continue;
      }
      hash = checksum(line + '\n', hash);
      if (!state) {
        if (record.format !== 'forestrpg' || record.version !== 3)
          throw new Error('Unsupported world archive');
        validateCheckpoint(record.checkpoint, entity);
        state = {
          ...record.checkpoint,
          descriptor: { ...record.checkpoint.descriptor, id: newWorldId() },
          revision: 0,
        };
        continue;
      }
      if (record.region !== undefined) {
        const region = record.region;
        if (
          !isRecord(region) ||
          !Number.isInteger(region.x) ||
          !Number.isInteger(region.y) ||
          !coordinate(Number(region.x) * 256) ||
          !coordinate(Number(region.y) * 256) ||
          region.generatorVersion !== state.descriptor.generatorVersion ||
          typeof region.biome !== 'string' ||
          !Number.isInteger(region.biomeVersion)
        )
          throw new Error('Invalid established region');
        biomes.get(region.biome, Number(region.biomeVersion));
        await repository.establish(state.descriptor.id, region as unknown as RegionIdentity);
        count++;
        continue;
      }
      if (typeof record.key !== 'string' || !/^[-]?\d+,[-]?\d+$/.test(record.key))
        throw new Error('Invalid chunk address');
      const [x, y] = record.key.split(',').map(Number);
      if (
        !coordinate(Number(x) * state.descriptor.chunkSize) ||
        !coordinate(Number(y) * state.descriptor.chunkSize)
      )
        throw new Error('Chunk address exceeds supported coordinates');
      validateDelta(record.delta, state.descriptor.chunkSize, entity);
      await repository.stageChunk(state.descriptor.id, record.key, record.delta);
      count++;
    }
    if (!state || !ended) throw new Error('Incomplete world archive');
    await repository.checkpoint(state, new Map());
    return state;
  } catch (error) {
    if (state) await repository.discard(state.descriptor.id);
    throw error;
  }
}
