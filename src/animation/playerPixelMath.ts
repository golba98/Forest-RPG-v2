/** Native 64px indexed-palette pose interpolation. No image scaling or alpha blend. */
export const PLAYER_CELL = 64;
const SIZE = PLAYER_CELL * PLAYER_CELL;
export const PLAYER_PALETTE = [
  '000000',
  '2f2522',
  '594a40',
  '8b7c69',
  'b9b3a1',
  'c9c2ae',
  'dbd3c0',
  'e7d5c6',
  'e8e1d2',
  'f4ecd9',
  'faf3e8',
  'fffaf2',
  'd19da7',
  'e5b6bc',
].map((hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)));
const neighbours = Array.from({ length: SIZE }, (_, i) => [
  ...(i % 64 ? [i - 1] : []),
  ...(i % 64 < 63 ? [i + 1] : []),
  ...(i >= 64 ? [i - 64] : []),
  ...(i < SIZE - 64 ? [i + 64] : []),
]);
interface Field {
  edge: Uint8Array;
  distance: Int16Array;
  centre: [number, number];
}
const fields = new WeakMap<Uint8Array, Field>();
function flood(seeds: number[]): { nearest: Int16Array; distance: Int16Array } {
  const nearest = new Int16Array(SIZE).fill(-1),
    distance = new Int16Array(SIZE),
    queue = new Int16Array(SIZE);
  let end = 0;
  for (const i of seeds) {
    nearest[i] = i;
    queue[end++] = i;
  }
  for (let at = 0; at < end; at++) {
    const i = queue[at] ?? 0;
    for (const j of neighbours[i] ?? [])
      if (nearest[j] === -1) {
        nearest[j] = nearest[i] ?? 0;
        distance[j] = (distance[i] ?? 0) + 1;
        queue[end++] = j;
      }
  }
  return { nearest, distance };
}
function field(p: Uint8Array): Field {
  const cached = fields.get(p);
  if (cached) return cached;
  const edge = new Uint8Array(SIZE),
    edges: number[] = [],
    fills: number[] = [];
  let top = 64;
  for (let i = 0; i < SIZE; i++)
    if (p[i]) {
      fills.push(i);
      top = Math.min(top, Math.floor(i / 64));
      if ((neighbours[i] ?? []).some((j) => !p[j])) {
        edge[i] = 1;
        edges.push(i);
      }
    }
  const points = fills.filter((i) => Math.floor(i / 64) < top + 18);
  const centre: [number, number] = points.length
    ? [
        points.reduce((s, i) => s + (i % 64), 0) / points.length,
        points.reduce((s, i) => s + Math.floor(i / 64), 0) / points.length,
      ]
    : [32, 32];
  const boundary = flood(edges);
  const out = {
    edge,
    distance: boundary.distance,
    centre,
  };
  fields.set(p, out);
  return out;
}
const sampleIndex = (x: number, y: number) =>
  x >= 0 && x < 64 && y >= 0 && y < 64 ? y * 64 + x : -1;
function material(p: Uint8Array, f: Field, x: number, y: number, boundary: boolean): number {
  let cost = Infinity,
    color = boundary ? 2 : 4;
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const j = sampleIndex(x + dx, y + dy);
      if (j < 0 || !p[j] || (boundary && !f.edge[j])) continue;
      const d = dx * dx + dy * dy;
      if (d < cost) {
        cost = d;
        color = p[j] ?? color;
      }
    }
  return color;
}
export function interpolatePlayerPixels(a: Uint8Array, b: Uint8Array, t: number): Uint8Array {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const fa = field(a),
    fb = field(b),
    mask = new Uint8Array(SIZE),
    out = new Uint8Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    const da = a[i] ? (fa.distance[i] ?? 0) + 0.5 : -(fa.distance[i] ?? 0) + 0.5;
    const db = b[i] ? (fb.distance[i] ?? 0) + 0.5 : -(fb.distance[i] ?? 0) + 0.5;
    if (da * (1 - t) + db * t >= 0) mask[i] = 1;
  }
  const ax = Math.round((fb.centre[0] - fa.centre[0]) * t),
    ay = Math.round((fb.centre[1] - fa.centre[1]) * t);
  const bx = Math.round((fa.centre[0] - fb.centre[0]) * (1 - t)),
    by = Math.round((fa.centre[1] - fb.centre[1]) * (1 - t));
  for (let i = 0; i < SIZE; i++)
    if (mask[i]) {
      const x = i % 64,
        y = Math.floor(i / 64),
        boundary = (neighbours[i] ?? []).some((j) => !mask[j]);
      const weight = 1;
      const ca = material(
          a,
          fa,
          x - Math.round(ax * weight),
          y - Math.round(ay * weight),
          boundary,
        ),
        cb = material(b, fb, x - Math.round(bx * weight), y - Math.round(by * weight), boundary);
      // Transport both full-pose materials. Quantize the light planes to the
      // original palette; dark features use the nearer pose, never alpha blending.
      if (ca >= 4 && ca <= 11 && cb >= 4 && cb <= 11) {
        const rgb = [0, 1, 2].map(
          (k) => (PLAYER_PALETTE[ca]?.[k] ?? 0) * (1 - t) + (PLAYER_PALETTE[cb]?.[k] ?? 0) * t,
        );
        let best = Infinity,
          c = ca;
        for (let n = 4; n <= 11; n++) {
          const d = rgb.reduce((sum, v, k) => sum + (v - (PLAYER_PALETTE[n]?.[k] ?? 0)) ** 2, 0);
          if (d < best) {
            best = d;
            c = n;
          }
        }
        out[i] = c;
      } else out[i] = t <= 0.5 ? ca : cb;
    }
  // Remove only redundant inner pixels of a connected exterior dark stroke.
  const connected = new Uint8Array(SIZE),
    queue: number[] = [];
  for (let i = 0; i < SIZE; i++)
    if (out[i] && out[i]! <= 2 && (neighbours[i] ?? []).some((j) => !out[j])) {
      connected[i] = 1;
      queue.push(i);
    }
  for (let at = 0; at < queue.length; at++)
    for (const j of neighbours[queue[at] ?? 0] ?? [])
      if (out[j] && out[j]! <= 2 && !connected[j]) {
        connected[j] = 1;
        queue.push(j);
      }
  const clean = Uint8Array.from(out);
  for (const i of queue) {
    const ns = neighbours[i] ?? [];
    if (ns.some((j) => !out[j])) continue;
    if (
      ns.some((j) => (neighbours[j] ?? []).some((k) => !out[k])) &&
      ns.filter(
        (j) =>
          (out[j] ?? 0) >= 3 && (out[j] ?? 0) <= 11 && (neighbours[j] ?? []).every((k) => out[k]),
      ).length >= 2
    )
      clean[i] = 4;
  }
  return clean;
}
export function playerRgba(p: Uint8Array): Uint8Array {
  const out = new Uint8Array(SIZE * 4);
  for (let i = 0; i < SIZE; i++) {
    const c = p[i] ?? 0;
    if (!c) continue;
    const rgb = PLAYER_PALETTE[c] ?? [];
    for (let k = 0; k < 3; k++) out[i * 4 + k] = rgb[k] ?? 0;
    out[i * 4 + 3] = 255;
  }
  return out;
}
export function decodePlayerPixels(encoded: string): Uint8Array {
  const bytes = atob(encoded),
    out = new Uint8Array(SIZE);
  let at = 0;
  for (let i = 0; i < bytes.length; i += 3) {
    const count = bytes.charCodeAt(i) * 256 + bytes.charCodeAt(i + 1);
    out.fill(bytes.charCodeAt(i + 2), at, at + count);
    at += count;
  }
  if (at !== SIZE) throw Error('Invalid native player frame');
  return out;
}
