import { canOccupy } from '../systems/CollisionSystem';
import { PLAYER_FOOTPRINT } from '../systems/EntityFootprint';
import type { TilePoint } from '../types/world';
import { elevationMask } from './ElevationTopology';
import { plateauDecoration } from './HilltopDecoration';
import type { LandscapeSource } from './LandscapePlan';

const CARDINALS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

export interface LandscapeRegion {
  readonly id: string;
  readonly anchor: TilePoint;
  readonly size: number;
}

/** Cardinal components; identity is the first row-major cell, never discovery/query order. */
export class LandscapeRegions {
  private readonly labels: Int32Array;
  private readonly cells: number[][] = [];
  readonly regions: readonly LandscapeRegion[];

  constructor(
    private readonly source: LandscapeSource,
    kind: 'plateau' | 'water',
    includes: (tile: number) => boolean,
  ) {
    const { width: w, height: h } = source.meta;
    this.labels = new Int32Array(w * h).fill(-1);
    const regions: LandscapeRegion[] = [];
    for (let start = 0; start < w * h; start++) {
      if (this.labels[start] !== -1 || !includes(source.tiles[start] ?? 0)) continue;
      const label = regions.length,
        cells = [start];
      this.labels[start] = label;
      for (let q = 0; q < cells.length; q++) {
        const at = cells[q]!,
          x = at % w,
          y = Math.floor(at / w);
        for (const [dx, dy] of CARDINALS) {
          const nx = x + dx,
            ny = y + dy,
            ni = ny * w + nx;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= w ||
            ny >= h ||
            this.labels[ni] !== -1 ||
            !includes(source.tiles[ni] ?? 0)
          )
            continue;
          this.labels[ni] = label;
          cells.push(ni);
        }
      }
      const anchor = { x: start % w, y: Math.floor(start / w) };
      regions.push({ id: `${kind}:${anchor.x},${anchor.y}`, anchor, size: cells.length });
      this.cells.push(cells);
    }
    this.regions = regions;
  }

  at(x: number, y: number): LandscapeRegion | null {
    const { width, height } = this.source.meta;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height)
      return null;
    return this.regions[this.labels[y * width + x] ?? -1] ?? null;
  }

  /** Milestone 1's selection, reconstructed from its pre-promotion occupancy. */
  summits(): ReadonlyMap<string, TilePoint> {
    const { width: w, height: h } = this.source.meta;
    const base = { ...this.source, props: this.source.props.filter((p) => !p.hilltop) };
    const result = new Map<string, TilePoint>();
    for (const [label, cells] of this.cells.entries()) {
      let sx = 0,
        sy = 0;
      for (const at of cells) {
        sx += at % w;
        sy += Math.floor(at / w);
      }
      const cx = sx / cells.length,
        cy = sy / cells.length;
      const interior = cells.filter(
        (at) => elevationMask(base.tiles, w, h, at % w, Math.floor(at / w)) === 255,
      );
      interior.sort(
        (a, b) =>
          ((a % w) - cx) ** 2 +
            (Math.floor(a / w) - cy) ** 2 -
            (((b % w) - cx) ** 2 + (Math.floor(b / w) - cy) ** 2) || a - b,
      );
      const summit =
        interior.find((at) => {
          const x = at % w,
            y = Math.floor(at / w);
          if (base.props.some((p) => Math.abs(p.tileX - x) <= 1 && Math.abs(p.tileY - y) <= 1))
            return false;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (
                plateauDecoration(
                  base.tiles[(y + dy) * w + x + dx] ?? 0,
                  x + dx,
                  y + dy,
                  elevationMask(base.tiles, w, h, x + dx, y + dy),
                )?.kind === 'rock_boulder'
              )
                return false;
          return canOccupy(base, x + 0.5, y + 0.5, PLAYER_FOOTPRINT);
        }) ??
        interior[0] ??
        cells[0]!;
      result.set(this.regions[label]!.id, { x: summit % w, y: Math.floor(summit / w) });
    }
    return result;
  }
}
