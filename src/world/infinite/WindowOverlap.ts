import type { WorldData } from '../../types/world';
/** Copy into owned destination storage; the active world's buffers are never aliased. */
export function copyWindowOverlap(target: WorldData, current: WorldData): void {
  const a = current.window,
    b = target.window;
  if (!a || !b) return;
  const x0 = Math.max(a.originX, b.originX),
    y0 = Math.max(a.originY, b.originY);
  const x1 = Math.min(a.originX + current.meta.width, b.originX + target.meta.width);
  const y1 = Math.min(a.originY + current.meta.height, b.originY + target.meta.height);
  if (x1 <= x0) return;
  for (let y = y0; y < y1; y++) {
    const src = (y - a.originY) * current.meta.width + x0 - a.originX;
    const dst = (y - b.originY) * target.meta.width + x0 - b.originX;
    target.tiles.set(current.tiles.subarray(src, src + x1 - x0), dst);
    b.discovered?.set(a.discovered?.subarray(src, src + x1 - x0) ?? new Uint8Array(x1 - x0), dst);
  }
}
