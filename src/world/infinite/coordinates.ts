/** Global cells use safe integer arithmetic. GPU and physics use nearby local coordinates. */
export const COORDINATE_LIMIT = 2_147_483_647;
const CHUNK_SIZE = 32;
export const REGION_SIZE = 256;
export interface ChunkAddress {
  readonly x: number;
  readonly y: number;
}
export function addressKey(x: number, y: number): string {
  return `${x},${y}`;
}
export function assertCoordinate(n: number): void {
  if (!Number.isSafeInteger(n) || Math.abs(n) > COORDINATE_LIMIT)
    throw new RangeError('World coordinate exceeds the supported range');
}
export function splitCoordinate(n: number, size = CHUNK_SIZE): { chunk: number; local: number } {
  assertCoordinate(n);
  if (!Number.isSafeInteger(size) || size <= 0) throw new RangeError('Invalid chunk size');
  const chunk = Math.floor(n / size);
  return { chunk, local: n - chunk * size };
}
/** Hash complete signed coordinates as text; never truncate coordinates to uint32. */
export function coordinateHash(seed: number, x: number, y: number, salt = ''): number {
  const value = `${seed >>> 0}:${x}:${y}:${salt}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}
export function valueNoise(seed: number, x: number, y: number, salt: string): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const at = (dx: number, dy: number) => coordinateHash(seed, ix + dx, iy + dy, salt) / 0xffffffff;
  const a = at(0, 0),
    b = at(1, 0),
    c = at(0, 1),
    d = at(1, 1);
  return a + (b - a) * smooth(fx) + (c - a + (d - c - b + a) * smooth(fx)) * smooth(fy);
}
