import { GAME_CONFIG } from '../config/GameConfig';
import type { Bounds } from '../types/gameplay';
import type { WorldBridge } from '../types/world';

export const BRIDGE_TILE_PX = 32;
export const BRIDGE_WIDTH = 2;
export const BRIDGE_DECK_INSET = 6 / BRIDGE_TILE_PX;
export const BRIDGE_RAIL_OUTSET = 3 / BRIDGE_TILE_PX;
export interface BridgeWorld {
  readonly bridges?: readonly WorldBridge[];
}
export interface BridgeGeometry {
  readonly footprint: Bounds;
  readonly deck: Bounds;
  readonly rails: readonly Bounds[];
  readonly approaches: readonly Bounds[];
}
const geometries = new WeakMap<WorldBridge, BridgeGeometry>();
const indexes = new WeakMap<BridgeWorld, Map<string, WorldBridge>>();

export function bridgeGeometry(bridge: WorldBridge): BridgeGeometry {
  const cached = geometries.get(bridge);
  if (cached) return cached;
  const horizontal = bridge.orientation === 'horizontal';
  const length = bridge.span + 2;
  const bounds = (a0: number, b0: number, a1: number, b1: number): Bounds =>
    horizontal
      ? { minX: bridge.x + a0, minY: bridge.y + b0, maxX: bridge.x + a1, maxY: bridge.y + b1 }
      : { minX: bridge.x + b0, minY: bridge.y + a0, maxX: bridge.x + b1, maxY: bridge.y + a1 };
  const { approachLength: approach, approachBuffer: buffer } = GAME_CONFIG.world.bridges;
  const geometry: BridgeGeometry = {
    footprint: bounds(0, 0, length, BRIDGE_WIDTH),
    deck: bounds(0, BRIDGE_DECK_INSET, length, BRIDGE_WIDTH - BRIDGE_DECK_INSET),
    // Low rails stop half a tile short of each end, leaving a forgiving bank landing.
    rails: [
      bounds(0.5, BRIDGE_RAIL_OUTSET, length - 0.5, BRIDGE_DECK_INSET),
      bounds(
        0.5,
        BRIDGE_WIDTH - BRIDGE_DECK_INSET,
        length - 0.5,
        BRIDGE_WIDTH - BRIDGE_RAIL_OUTSET,
      ),
    ],
    approaches: [
      bounds(-approach, -buffer, 1, BRIDGE_WIDTH + buffer),
      bounds(length - 1, -buffer, length + approach, BRIDGE_WIDTH + buffer),
    ],
  };
  geometries.set(bridge, geometry);
  return geometry;
}

export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function bridgeReservations(bridge: WorldBridge): readonly Bounds[] {
  const g = bridgeGeometry(bridge);
  return [g.footprint, ...g.approaches];
}

/** Includes art overhangs as well as physical props, keeping the entire entrance visible. */
export function intersectsBridgeReservation(
  bridges: readonly WorldBridge[],
  area: Bounds,
): boolean {
  return bridges.some((b) => bridgeReservations(b).some((r) => boundsOverlap(r, area)));
}

export function bridgeAtTile(world: BridgeWorld, x: number, y: number): WorldBridge | undefined {
  if (!world.bridges?.length) return undefined;
  let index = indexes.get(world);
  if (!index) {
    index = new Map();
    for (const bridge of world.bridges) {
      const f = bridgeGeometry(bridge).footprint;
      for (let ty = f.minY; ty < f.maxY; ty++)
        for (let tx = f.minX; tx < f.maxX; tx++) index.set(`${tx},${ty}`, bridge);
    }
    indexes.set(world, index);
  }
  return index.get(`${x},${y}`);
}

export function onBridgeDeck(world: BridgeWorld, x: number, y: number): boolean {
  const bridge = bridgeAtTile(world, Math.floor(x), Math.floor(y));
  if (!bridge) return false;
  const d = bridgeGeometry(bridge).deck;
  return x >= d.minX && x < d.maxX && y >= d.minY && y < d.maxY;
}

/** Rectangle remainder used to leave river collision intact beside the walking surface. */
export function subtractDeck(tile: Bounds, deck: Bounds): Bounds[] {
  if (!boundsOverlap(tile, deck)) return [tile];
  const x0 = Math.max(tile.minX, deck.minX),
    x1 = Math.min(tile.maxX, deck.maxX);
  const y0 = Math.max(tile.minY, deck.minY),
    y1 = Math.min(tile.maxY, deck.maxY);
  return [
    { ...tile, maxY: y0 },
    { ...tile, minY: y1 },
    { minX: tile.minX, maxX: x0, minY: y0, maxY: y1 },
    { minX: x1, maxX: tile.maxX, minY: y0, maxY: y1 },
  ].filter((b) => b.maxX > b.minX && b.maxY > b.minY);
}
