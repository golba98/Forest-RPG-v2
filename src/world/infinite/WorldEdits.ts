import type { WorldData, WorldProp } from '../../types/world';
import type { TileId } from '../../types/tiles';
import type { ChunkDelta } from './types';
import { addressKey, splitCoordinate } from './coordinates';
import { invalidatePropIndex } from '../../systems/CollisionSystem';
import { invalidateLandscape } from '../LandscapePlan';

export type WorldEdit =
  | { readonly kind: 'tile'; readonly x: number; readonly y: number; readonly tile: TileId }
  | { readonly kind: 'remove'; readonly x: number; readonly y: number; readonly id: string }
  | { readonly kind: 'place'; readonly prop: WorldProp }
  | {
      readonly kind: 'event';
      readonly x: number;
      readonly y: number;
      readonly id: string;
      readonly value: string | number | boolean;
    };
/** Future construction/resource systems use the same durable boundary as existing terrain cuts. */
export function applyWorldEdit(
  world: WorldData,
  deltas: Map<string, ChunkDelta>,
  edit: WorldEdit,
): void {
  const window = world.window;
  if (!window) throw new Error('A streamed world is required');
  const x = edit.kind === 'place' ? edit.prop.tileX : edit.x,
    y = edit.kind === 'place' ? edit.prop.tileY : edit.y;
  const sx = splitCoordinate(x, window.descriptor.chunkSize),
    sy = splitCoordinate(y, window.descriptor.chunkSize),
    key = addressKey(sx.chunk, sy.chunk);
  const prior = deltas.get(key) ?? {
    tiles: {},
    removed: [],
    added: [],
    entities: [],
    activated: false,
  };
  const lx = x - window.originX,
    ly = y - window.originY,
    inside = lx >= 0 && ly >= 0 && lx < world.meta.width && ly < world.meta.height;
  if (!inside) throw new Error('Prepare the chunk before editing it');
  if (edit.kind === 'tile') {
    deltas.set(key, {
      ...prior,
      tiles: { ...prior.tiles, [sy.local * window.descriptor.chunkSize + sx.local]: edit.tile },
    });
    if (inside) world.tiles[ly * world.meta.width + lx] = edit.tile;
  } else if (edit.kind === 'remove') {
    deltas.set(key, {
      ...prior,
      removed: [...new Set([...prior.removed, edit.id])],
      added: prior.added.filter((p) => String(p.id) !== edit.id),
    });
    const props = world.props as WorldProp[],
      index = props.findIndex((p) => String(p.id) === edit.id);
    if (index >= 0) props.splice(index, 1);
  } else if (edit.kind === 'place') {
    if (
      prior.added.some((p) => p.id === edit.prop.id) ||
      world.props.some((p) => p.id === edit.prop.id)
    )
      throw new Error('Duplicate placed object identity');
    deltas.set(key, { ...prior, added: [...prior.added, edit.prop] });
    if (inside) (world.props as WorldProp[]).push({ ...edit.prop, tileX: lx, tileY: ly });
  } else deltas.set(key, { ...prior, events: { ...prior.events, [edit.id]: edit.value } });
  invalidatePropIndex(world);
  invalidateLandscape(world);
}
