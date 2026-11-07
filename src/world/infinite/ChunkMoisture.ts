import type { WorldData } from '../../types/world';
import type { SavedMoisture } from '../../systems/SurfaceMoisture';
import type { ChunkDelta } from './types';

export function restoreWindowMoisture(
  world: WorldData,
  elapsedMs: number,
  seed: number,
  size: number,
  origin: { x: number; y: number },
  deltaAt: (x: number, y: number) => ChunkDelta,
): SavedMoisture {
  const wetness = Array<number>(world.tiles.length).fill(0),
    puddles = wetness.slice(),
    s = size;
  const integrate = (w: number, p: number, start: number) => {
    // Every 180-second weather period includes 150 dry seconds, enough to erase previous moisture.
    let tick = Math.floor(Math.max(start, elapsedMs - 360000) / 200);
    const end = Math.floor(elapsedMs / 200);
    while (tick < end) {
      const stamp = tick * 200 + (seed % 19) * 1000,
        phase = Math.floor(stamp / 30000),
        next = Math.min(
          end,
          Math.max(tick + 1, Math.ceil(((phase + 1) * 30000 - (seed % 19) * 1000) / 200)),
        ),
        n = next - tick;
      if (phase % 6 === 4) {
        const first = Math.max(1, Math.ceil((0.65 - w) / 0.02 - 1e-9));
        p = Math.min(1, p + Math.max(0, n - first + 1) * (0.2 / 30));
        w = Math.min(1, w + n * 0.02);
      } else {
        w = Math.max(0, w - n * (0.2 / 90));
        p = Math.max(0, p - n * (0.2 / 120));
      }
      tick = next;
    }
    return [Math.round(w * 255), Math.round(p * 255)] as const;
  };
  const results = new Map<string, readonly [number, number]>();
  const valueAt = (m: ReturnType<typeof deltaAt>['moisture'], i: number) => {
    const w = m?.wetness[i] ?? 0,
      p = m?.puddles[i] ?? 0,
      at = m?.atMs ?? 0;
    const key = `${w}:${p}:${at}`;
    const cached = results.get(key);
    if (cached) return cached;
    const value = integrate(w / 255, p / 255, at);
    if (results.size < 4096) results.set(key, value);
    return value;
  };
  for (let y = 0; y < world.meta.height;) {
    const gy = origin.y + y,
      ly = gy - Math.floor(gy / s) * s;
    const height = Math.min(s - ly, world.meta.height - y);
    for (let x = 0; x < world.meta.width;) {
      const gx = origin.x + x,
        lx = gx - Math.floor(gx / s) * s;
      const width = Math.min(s - lx, world.meta.width - x),
        m = deltaAt(gx, gy).moisture;
      const uniform = !m?.wetness.length && !m?.puddles.length;
      const shared = uniform ? valueAt(m, 0) : undefined;
      for (let row = 0; row < height; row++) {
        const dst = (y + row) * world.meta.width + x;
        if (shared) {
          wetness.fill(shared[0], dst, dst + width);
          puddles.fill(shared[1], dst, dst + width);
        } else
          for (let col = 0; col < width; col++) {
            const value = valueAt(m, (ly + row) * s + lx + col);
            wetness[dst + col] = value[0];
            puddles[dst + col] = value[1];
          }
      }
      x += width;
    }
    y += height;
  }
  return { version: 1, wetness, puddles, remainderMs: elapsedMs % 200 };
}
