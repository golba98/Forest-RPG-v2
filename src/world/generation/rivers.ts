import { Tile } from '../../types/tiles';
import type { TilePoint } from '../../types/world';
import type { PerlinNoise } from '../Noise';
import type { Rng } from '../Rng';
import { isInClearArea } from './GenGrid';
import type { ClearArea, GenGrid } from './GenGrid';

const MAIN_RIVER_LENGTH_FACTOR = 1.5;
const BRANCH_STEPS = 40;
const GUIDED_STEPS_FACTOR = 6;
const RIVER_JUMP_INTERVAL = 70;
const RIVER_JUMP_PROB = 0.25;
const CHANCE_ENTER_CLEAR = 0.35;
const JITTER_NOISE_SCALE = 0.12;
const WIDEN_PROB = 0.45;

const DIAGONALS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

type Side = 0 | 1 | 2 | 3; // top, right, bottom, left

interface Endpoint extends TilePoint {
  readonly side: Side;
}

/** Stamps a filled disc of RIVER centred on a fractional point. */
function stampDisc(grid: GenGrid, cx: number, cy: number, radius: number): void {
  const reach = Math.ceil(radius);
  for (let dy = -reach; dy <= radius; dy++) {
    for (let dx = -reach; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const nx = Math.floor(cx + dx);
      const ny = Math.floor(cy + dy);
      if (grid.inBounds(nx, ny)) grid.set(nx, ny, Tile.RIVER);
    }
  }
}

/**
 * Guaranteed main river crossing the middle of the map edge to edge, with
 * 2–3 natural branches peeling off its central 60%.
 */
export function carveMainRiver(grid: GenGrid, rng: Rng, noise: PerlinNoise): void {
  const { width: w, height: h } = grid;
  const horizontal = rng.nextFloat() < 0.5;
  let cx = horizontal ? 0 : w / 2 + (rng.nextFloat() - 0.5) * (w * 0.1);
  let cy = horizontal ? h / 2 + (rng.nextFloat() - 0.5) * (h * 0.1) : 0;
  const points: { x: number; y: number }[] = [];

  const steps = Math.max(w, h) * MAIN_RIVER_LENGTH_FACTOR;
  for (let s = 0; s < steps; s++) {
    stampDisc(grid, cx, cy, 0.8 + noise.noise2(s * 0.1, 123));
    points.push({ x: cx, y: cy });
    if (horizontal) {
      cx += 1;
      cy += (noise.noise2(cx * 0.04, 555) - 0.5) * 1.8;
      if (cx >= w) break;
    } else {
      cy += 1;
      cx += (noise.noise2(cy * 0.04, 777) - 0.5) * 1.8;
      if (cy >= h) break;
    }
  }

  const branchCount = 2 + Math.floor(rng.nextFloat() * 2);
  for (let b = 0; b < branchCount; b++) {
    const startIdx = Math.floor(rng.nextFloat() * (points.length * 0.6)) + Math.floor(points.length * 0.2);
    const start = points[Math.min(startIdx, points.length - 1)];
    if (!start) break;
    let bx = start.x;
    let by = start.y;
    let angle = horizontal ? (rng.nextFloat() < 0.5 ? -Math.PI / 2 : Math.PI / 2) : rng.nextFloat() < 0.5 ? 0 : Math.PI;
    angle += (rng.nextFloat() - 0.5) * 0.5;

    for (let s = 0; s < BRANCH_STEPS; s++) {
      stampDisc(grid, bx, by, 0.6 + noise.noise2(s * 0.1, b * 10) * 0.8);
      bx += Math.cos(angle);
      by += Math.sin(angle);
      angle += (noise.noise2(s * 0.1, b * 50) - 0.5) * 0.3;
      if (bx < 0 || bx >= w || by < 0 || by >= h) break;
    }
  }
}

/** Score weights for one step of a guided river walk (lower score = preferred). */
interface WalkWeights {
  readonly diagonal: number;
  readonly turn: number;
  /** Extra score for a candidate tile (clear-zone avoidance, spawn attraction…). */
  readonly bias: (x: number, y: number) => number;
}

/**
 * Greedy guided walk: each step picks the 8-neighbour with the lowest
 * distance-to-target + noise jitter + penalties, randomly widening as it goes.
 */
function walkStep(
  grid: GenGrid,
  noise: PerlinNoise,
  from: TilePoint,
  target: TilePoint,
  prevDir: TilePoint | null,
  weights: WalkWeights,
  backtrackPenalty: boolean
): TilePoint | null {
  let best: TilePoint | null = null;
  let bestScore = Infinity;
  for (const c of grid.neighbors8(from.x, from.y)) {
    const dist = Math.hypot(target.x - c.x, target.y - c.y);
    const jitter = (noise.noise2(c.x * JITTER_NOISE_SCALE, c.y * JITTER_NOISE_SCALE) - 0.5) * 3;
    const dirX = c.x - from.x;
    const dirY = c.y - from.y;
    const forward = (target.x - from.x) * dirX + (target.y - from.y) * dirY;
    const backtrack = backtrackPenalty && forward < 0 ? 6 : 0;
    const diag = Math.abs(dirX) + Math.abs(dirY) === 2 ? weights.diagonal : 0;
    const turn = prevDir && (dirX !== prevDir.x || dirY !== prevDir.y) ? weights.turn : 0;
    const score = dist + jitter + weights.bias(c.x, c.y) + backtrack + diag + turn;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function widen(grid: GenGrid, rng: Rng, x: number, y: number, distToTarget: number): void {
  const prob = distToTarget < 4 ? WIDEN_PROB * 0.35 : WIDEN_PROB;
  for (const n of grid.neighbors8(x, y)) {
    if (rng.nextFloat() < prob) grid.set(n.x, n.y, Tile.RIVER);
  }
}

/**
 * 1–2 extra rivers walked from one map edge to the opposite edge. Each has a
 * 35% chance of being allowed through the clear area (otherwise heavily
 * penalised), and every 70 steps may jump to a fresh edge start.
 */
export function carveGuidedRivers(grid: GenGrid, clear: ClearArea, rng: Rng, noise: PerlinNoise): void {
  const { width: w, height: h } = grid;
  const maxSteps = Math.max(w, h) * GUIDED_STEPS_FACTOR;

  const reachedSide = (x: number, y: number, side: Side): boolean =>
    (side === 0 && y === 0) || (side === 1 && x === w - 1) || (side === 2 && y === h - 1) || (side === 3 && x === 0);

  const pickStartAndTarget = (): { start: Endpoint; target: Endpoint } => {
    const side = Math.floor(rng.nextFloat() * 4) as Side;
    let sx: number;
    let sy: number;
    let tx: number;
    let ty: number;
    if (side === 0) {
      sx = Math.floor(rng.nextFloat() * w);
      sy = 0;
      tx = Math.floor(w * 0.25 + rng.nextFloat() * w * 0.5);
      ty = h - 1;
    } else if (side === 1) {
      sx = w - 1;
      sy = Math.floor(rng.nextFloat() * h);
      tx = 0;
      ty = Math.floor(h * 0.25 + rng.nextFloat() * h * 0.5);
    } else if (side === 2) {
      sx = Math.floor(rng.nextFloat() * w);
      sy = h - 1;
      tx = Math.floor(w * 0.25 + rng.nextFloat() * w * 0.5);
      ty = 0;
    } else {
      sx = 0;
      sy = Math.floor(rng.nextFloat() * h);
      tx = w - 1;
      ty = Math.floor(h * 0.25 + rng.nextFloat() * h * 0.5);
    }
    const targetSide = ((side + 2) % 4) as Side;
    return { start: { x: sx, y: sy, side }, target: { x: tx, y: ty, side: targetSide } };
  };

  const carveOne = (start: Endpoint, target: Endpoint): void => {
    let pos: TilePoint = { x: start.x, y: start.y };
    let prevDir: TilePoint | null = null;
    const allowThrough = rng.nextFloat() < CHANCE_ENTER_CLEAR;
    const weights: WalkWeights = {
      diagonal: 0.8,
      turn: 1.4,
      bias: (x, y) => (isInClearArea(clear, x, y) ? (allowThrough ? 6 : 1000) : 0),
    };

    for (let steps = 0; steps < maxSteps; ) {
      grid.set(pos.x, pos.y, Tile.RIVER);
      const distToTarget = Math.hypot(target.x - pos.x, target.y - pos.y);
      widen(grid, rng, pos.x, pos.y, distToTarget);

      if (reachedSide(pos.x, pos.y, target.side)) {
        if (distToTarget > 2 && rng.nextFloat() < 0.4) {
          const extras = grid.neighbors8(pos.x, pos.y).filter((n) => reachedSide(n.x, n.y, target.side));
          if (extras.length > 0) {
            const extra = rng.pick(extras);
            grid.set(extra.x, extra.y, Tile.RIVER);
          }
        }
        return;
      }

      const next = walkStep(grid, noise, pos, target, prevDir, weights, true);
      if (!next) return;
      prevDir = { x: next.x - pos.x, y: next.y - pos.y };
      pos = next;
      steps++;
      if (steps % RIVER_JUMP_INTERVAL === 0 && rng.nextFloat() < RIVER_JUMP_PROB) {
        const jump = pickStartAndTarget().start;
        pos = { x: Math.max(0, Math.min(w - 1, jump.x)), y: Math.max(0, Math.min(h - 1, jump.y)) };
        prevDir = null;
      }
    }
  };

  const riverCount = 1 + Math.floor(rng.nextFloat() * 2);
  for (let r = 0; r < riverCount; r++) {
    const { start, target } = pickStartAndTarget();
    carveOne(start, target);
  }
}

/**
 * Branch that starts on an existing river, is pulled through the player's
 * spawn zone, then continues from the river tile nearest spawn to the
 * opposite map edge (legacy `carveBranchFromRiver`).
 */
export function carveSpawnBranch(grid: GenGrid, spawn: TilePoint, rng: Rng, noise: PerlinNoise): void {
  const { width: w, height: h } = grid;
  const riverTiles: TilePoint[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid.get(x, y) === Tile.RIVER) riverTiles.push({ x, y });
    }
  }
  const start = riverTiles.length > 0 ? rng.pick(riverTiles) : pickEdgePoint(w, h, rng);
  const targetEdge: TilePoint = {
    x: start.x <= w / 2 ? w - 1 : 0,
    y: Math.floor(h * (0.25 + rng.nextFloat() * 0.5)),
  };

  const maxSteps = Math.max(w, h) * GUIDED_STEPS_FACTOR;
  const attractRadius = Math.max(w, h) * 0.25;
  const weights: WalkWeights = {
    diagonal: 0.6,
    turn: 1.2,
    bias: (x, y) => (Math.hypot(spawn.x - x, spawn.y - y) < attractRadius ? -2 : 0),
  };

  const carvePath = (from: TilePoint, target: TilePoint, stepLimit: number): void => {
    let pos = from;
    let prevDir: TilePoint | null = null;
    for (let steps = 0; steps < stepLimit; steps++) {
      grid.set(pos.x, pos.y, Tile.RIVER);
      const distToTarget = Math.hypot(target.x - pos.x, target.y - pos.y);
      widen(grid, rng, pos.x, pos.y, distToTarget);
      if (distToTarget <= 1.5) return;
      const next = walkStep(grid, noise, pos, target, prevDir, weights, false);
      if (!next) return;
      prevDir = { x: next.x - pos.x, y: next.y - pos.y };
      pos = next;
    }
  };

  carvePath(start, spawn, Math.floor(maxSteps * 0.6));

  let nearest: TilePoint | null = null;
  let bestDist = Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid.get(x, y) !== Tile.RIVER) continue;
      const d = Math.hypot(spawn.x - x, spawn.y - y);
      if (d < bestDist) {
        bestDist = d;
        nearest = { x, y };
      }
    }
  }
  if (nearest) carvePath(nearest, targetEdge, maxSteps);
}

function pickEdgePoint(w: number, h: number, rng: Rng): TilePoint {
  const side = Math.floor(rng.nextFloat() * 4);
  if (side === 0) return { x: Math.floor(rng.nextFloat() * w), y: 0 };
  if (side === 1) return { x: w - 1, y: Math.floor(rng.nextFloat() * h) };
  if (side === 2) return { x: Math.floor(rng.nextFloat() * w), y: h - 1 };
  return { x: 0, y: Math.floor(rng.nextFloat() * h) };
}

/**
 * Makes the spawn surroundings playable: rivers within the safe radius become
 * walkable LOG tiles, and trees anywhere inside the clear area become grass.
 */
export function applySpawnSafeArea(grid: GenGrid, clear: ClearArea, spawn: TilePoint): void {
  const safeRadius = Math.min(3, Math.max(2, Math.floor(Math.min(clear.endX - clear.startX, clear.endY - clear.startY) / 6)));
  for (let dy = -safeRadius; dy <= safeRadius; dy++) {
    for (let dx = -safeRadius; dx <= safeRadius; dx++) {
      const x = spawn.x + dx;
      const y = spawn.y + dy;
      if (!grid.inBounds(x, y) || !isInClearArea(clear, x, y)) continue;
      const tile = grid.get(x, y);
      if (tile === Tile.RIVER) grid.set(x, y, Tile.LOG);
      else if (tile === Tile.FOREST || tile === Tile.CLIFF) grid.set(x, y, Tile.GRASS);
    }
  }

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!isInClearArea(clear, x, y)) continue;
      const tile = grid.get(x, y);
      if (tile === Tile.FOREST || tile === Tile.CLIFF) grid.set(x, y, Tile.GRASS);
    }
  }
}

/** Fills checkerboard diagonal river gaps outside the clear area. */
export function smoothRiverDiagonals(grid: GenGrid, clear: ClearArea): void {
  const touchesClear = (x: number, y: number): boolean =>
    isInClearArea(clear, x, y) ||
    isInClearArea(clear, x + 1, y) ||
    isInClearArea(clear, x, y + 1) ||
    isInClearArea(clear, x + 1, y + 1);

  for (let y = 0; y < grid.height - 1; y++) {
    for (let x = 0; x < grid.width - 1; x++) {
      if (touchesClear(x, y)) continue;
      const tl = grid.get(x, y) === Tile.RIVER;
      const tr = grid.get(x + 1, y) === Tile.RIVER;
      const bl = grid.get(x, y + 1) === Tile.RIVER;
      const br = grid.get(x + 1, y + 1) === Tile.RIVER;
      if (tl && br && !tr && !bl) {
        grid.set(x + 1, y, Tile.RIVER);
        grid.set(x, y + 1, Tile.RIVER);
      } else if (tr && bl && !tl && !br) {
        grid.set(x, y, Tile.RIVER);
        grid.set(x + 1, y + 1, Tile.RIVER);
      }
    }
  }
}

/** Turns single-pixel river tips (diagonal pairs of dead ends) outside the clear area into grass. */
export function roundRiverTips(grid: GenGrid, clear: ClearArea): void {
  const cardinalRivers = (x: number, y: number): number => {
    let count = 0;
    if (grid.inBounds(x + 1, y) && grid.get(x + 1, y) === Tile.RIVER) count++;
    if (grid.inBounds(x - 1, y) && grid.get(x - 1, y) === Tile.RIVER) count++;
    if (grid.inBounds(x, y + 1) && grid.get(x, y + 1) === Tile.RIVER) count++;
    if (grid.inBounds(x, y - 1) && grid.get(x, y - 1) === Tile.RIVER) count++;
    return count;
  };

  const toGrass = new Set<number>();
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.get(x, y) !== Tile.RIVER || isInClearArea(clear, x, y)) continue;
      if (cardinalRivers(x, y) > 1) continue;
      for (const [dx, dy] of DIAGONALS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!grid.inBounds(nx, ny) || grid.get(nx, ny) !== Tile.RIVER) continue;
        if (isInClearArea(clear, nx, ny)) continue;
        if (cardinalRivers(nx, ny) <= 1) toGrass.add(ny * grid.width + nx);
      }
    }
  }
  for (const idx of toGrass) {
    if (grid.tiles[idx] === Tile.RIVER) grid.tiles[idx] = Tile.GRASS;
  }
}
