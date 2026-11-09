export const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const integer = (v: unknown): v is number => finite(v) && Number.isInteger(v);
export const point = (v: unknown, w: number, h: number): boolean =>
  object(v) && finite(v.x) && finite(v.y) && v.x >= 0 && v.x < w && v.y >= 0 && v.y < h;
export const hasNumbers = (o: Record<string, unknown>, keys: string[]): boolean =>
  keys.every((k) => finite(o[k]));
