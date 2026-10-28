import { GAME_CONFIG } from '../../config/GameConfig';
import { Tile } from '../../types/tiles';
import type { TilePoint, WorldBridge } from '../../types/world';
import { bridgeGeometry } from '../BridgeGeometry';
import type { Rng } from '../Rng';
import type { GenGrid } from './GenGrid';

const MIN_CONNECTED_AREA = 12;
const SHORTCUT_SAVING = 12;
const CARDINAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function isBank(tile: number): boolean {
  return tile === Tile.GRASS || tile === Tile.FLOWERS || tile === Tile.MUD;
}

/** Check the whole structure and its broad, level landings, not just a centreline. */
export function validBridgeTerrain(grid: GenGrid, bridge: WorldBridge): boolean {
  const g = bridgeGeometry(bridge);
  if (
    [g.footprint, ...g.approaches].some(
      (b) => b.minX < 0 || b.minY < 0 || b.maxX > grid.width || b.maxY > grid.height,
    )
  )
    return false;
  for (const a of g.approaches)
    for (let y = a.minY; y < a.maxY; y++)
      for (let x = a.minX; x < a.maxX; x++)
        if (!grid.inBounds(x, y) || !isBank(grid.get(x, y))) return false;
  const horizontal = bridge.orientation === 'horizontal';
  for (let a = 1; a <= bridge.span; a++)
    for (let b = 0; b < 2; b++) {
      const x = bridge.x + (horizontal ? a : b),
        y = bridge.y + (horizontal ? b : a);
      if (!grid.inBounds(x, y) || grid.get(x, y) !== Tile.RIVER) return false;
    }
  return true;
}

function banks(b: WorldBridge): readonly [TilePoint, TilePoint] {
  return b.orientation === 'horizontal'
    ? [
        { x: b.x, y: b.y },
        { x: b.x + b.span + 1, y: b.y },
      ]
    : [
        { x: b.x, y: b.y },
        { x: b.x, y: b.y + b.span + 1 },
      ];
}

/** Bounded dry-route search: an existing short walk makes a second crossing redundant. */
function shortDryRoute(
  grid: GenGrid,
  from: TilePoint,
  to: TilePoint,
  open: Uint8Array,
  limit: number,
): boolean {
  const start = from.y * grid.width + from.x,
    target = to.y * grid.width + to.x;
  const visited = new Set<number>([start]);
  const queue: Array<[number, number]> = [[start, 0]];
  for (let head = 0; head < queue.length; head++) {
    const entry = queue[head];
    if (!entry) continue;
    const [i, distance] = entry;
    if (i === target) return true;
    if (distance >= limit) continue;
    const x = i % grid.width,
      y = Math.floor(i / grid.width);
    for (const [dx, dy] of CARDINAL) {
      const nx = x + dx,
        ny = y + dy,
        n = ny * grid.width + nx;
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height || !open[n] || visited.has(n))
        continue;
      visited.add(n);
      queue.push([n, distance + 1]);
    }
  }
  return false;
}

function dryRegions(
  grid: GenGrid,
  bridges: readonly WorldBridge[],
): { open: Uint8Array; labels: Int32Array; sizes: number[] } {
  // Woodland cells become grass later; their prospective routes count in placement scoring.
  const open = Uint8Array.from(grid.tiles, (t) => Number(isBank(t) || t === Tile.FOREST));
  for (const bridge of bridges) {
    const f = bridgeGeometry(bridge).footprint;
    for (let y = f.minY; y < f.maxY; y++)
      for (let x = f.minX; x < f.maxX; x++) open[y * grid.width + x] = 1;
  }
  const labels = new Int32Array(open.length).fill(-1),
    sizes: number[] = [];
  const queue = new Int32Array(open.length);
  for (let i = 0; i < open.length; i++) {
    if (!open[i] || labels[i] !== -1) continue;
    const label = sizes.length;
    let head = 0,
      tail = 1;
    queue[0] = i;
    labels[i] = label;
    while (head < tail) {
      const cell = queue[head++] ?? 0,
        x = cell % grid.width,
        y = Math.floor(cell / grid.width);
      for (const [dx, dy] of CARDINAL) {
        const nx = x + dx,
          ny = y + dy,
          n = ny * grid.width + nx;
        if (
          nx < 0 ||
          ny < 0 ||
          nx >= grid.width ||
          ny >= grid.height ||
          !open[n] ||
          labels[n] !== -1
        )
          continue;
        labels[n] = label;
        queue[tail++] = n;
      }
    }
    sizes.push(tail);
  }
  return { open, labels, sizes };
}

function distance(a: WorldBridge, b: WorldBridge): number {
  const f = bridgeGeometry(a).footprint,
    g = bridgeGeometry(b).footprint;
  return Math.hypot(
    Math.max(0, f.minX - g.maxX, g.minX - f.maxX),
    Math.max(0, f.minY - g.maxY, g.minY - f.maxY),
  );
}

/** Deterministic structures over unchanged terrain, selected before props can obstruct them. */
export function placeBridges(grid: GenGrid, spawn: TilePoint, rng: Rng): WorldBridge[] {
  const rules = GAME_CONFIG.world.bridges;
  const candidates: Array<{ bridge: WorldBridge; jitter: number }> = [];
  for (let y = 1; y < grid.height - 1; y++)
    for (let x = 1; x < grid.width - 1; x++) {
      if (!isBank(grid.get(x, y))) continue;
      for (const orientation of ['horizontal', 'vertical'] as const) {
        for (let span = rules.minSpan; span <= rules.maxSpan; span++) {
          const bridge: WorldBridge = {
            id: 0,
            x,
            y,
            orientation,
            span,
            variant: rng.nextInt(0, 3),
          };
          if (validBridgeTerrain(grid, bridge))
            candidates.push({ bridge, jitter: rng.nextFloat() });
        }
      }
    }
  const bridges: WorldBridge[] = [];
  const target = Math.min(
    rules.maxCount,
    Math.max(1, Math.ceil((grid.width * grid.height) / rules.tilesPerBridge)),
  );
  while (bridges.length < target) {
    const { open, labels, sizes } = dryRegions(grid, bridges);
    const ranked = candidates
      .filter(({ bridge }) => bridges.every((b) => distance(b, bridge) >= rules.minSpacing))
      .map((c) => {
        const [a, b] = banks(c.bridge),
          first = labels[a.y * grid.width + a.x] ?? -1,
          second = labels[b.y * grid.width + b.x] ?? -1;
        const area = Math.min(sizes[first] ?? 0, sizes[second] ?? 0);
        return {
          ...c,
          a,
          b,
          area,
          score:
            (first === second ? 0 : 10000) +
            Math.min(area, 1000) -
            c.bridge.span * 20 +
            c.jitter * 10 -
            Math.hypot(c.bridge.x - spawn.x, c.bridge.y - spawn.y) * 0.1,
        };
      })
      .filter((c) => c.area >= MIN_CONNECTED_AREA)
      .sort((a, b) => b.score - a.score);
    const chosen = ranked.find(
      (c) => !shortDryRoute(grid, c.a, c.b, open, c.bridge.span + 1 + SHORTCUT_SAVING),
    );
    if (!chosen) break;
    bridges.push({ ...chosen.bridge, id: bridges.length });
  }
  return bridges;
}
