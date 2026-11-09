/** Native 32px relief artwork. Extends the existing atlas layout and collision silhouette;
 * no downloaded art, smoothing, engine geometry or character assets are involved. */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const N = 1,
  E = 4,
  S = 16,
  W = 64;
function hash(x, y, s) {
  let h =
    Math.imul(x + 913, 374761393) ^ Math.imul(y + 173, 668265263) ^ Math.imul(s + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const palettes = {
  forest: { stone: [119, 119, 96], dark: [51, 55, 39], moss: [83, 103, 47], turf: [1, 1, 1] },
  meadow: {
    stone: [145, 131, 100],
    dark: [65, 58, 40],
    moss: [110, 123, 59],
    turf: [0.95, 0.97, 0.79],
  },
  highlands: {
    stone: [136, 143, 145],
    dark: [51, 58, 62],
    moss: [91, 102, 69],
    turf: [0.73, 0.75, 0.69],
  },
  wetlands: {
    stone: [98, 112, 99],
    dark: [38, 49, 39],
    moss: [66, 95, 55],
    turf: [0.57, 0.7, 0.64],
  },
  autumn: {
    stone: [143, 123, 102],
    dark: [65, 51, 39],
    moss: [109, 102, 51],
    turf: [1, 0.66, 0.49],
  },
};
function region(x, y, m) {
  if (!(m & S) && y >= 12) return 'face';
  if (!(m & N) && y < 4) return 'north';
  if (!(m & W) && x < 6) return 'west';
  if (!(m & E) && x >= 26) return 'east';
  if (m & N && m & W && !(m & 128) && x < 6 && y < 4) return 'north';
  if (m & N && m & E && !(m & 2) && x >= 26 && y < 4) return 'north';
  if (m & S && m & W && !(m & 32) && x < 6 && y >= 12) return 'face';
  if (m & S && m & E && !(m & 8) && x >= 26 && y >= 12) return 'face';
  return 'top';
}
const mix = (a, b, t) => a.map((c, k) => Math.round(c * (1 - t) + b[k] * t));
function rock(x, y, v, p) {
  // Broad slanted strata with irregular fracture planes, not rectangular masonry courses.
  const band = Math.floor((y + x * 0.19 + Math.sin(x * 0.23 + v) * 1.8) / 6);
  const seam = (y + x * 0.19 + Math.sin(x * 0.23 + v) * 1.8) % 6;
  const shade = (hash(band, v, 31) - 0.5) * 22 - (y - 12) * 1.3;
  let c = p.stone.map((n) => n + shade);
  if (seam < 0.85 && hash(Math.floor(x / 4), band, v + 57) > 0.27) c = mix(c, p.dark, 0.55);
  else if (seam < 1.7) c = c.map((n) => n + 11);
  const crack = (7 + v * 8 + Math.floor((y - 12) / 3)) % 32;
  if (Math.abs(x - crack) < 1 && y > 16 && y < 28) c = mix(c, p.dark, 0.66);
  if (y >= 30) c = mix(c, p.dark, (y - 29) / 3);
  if (y < 14 + (hash(Math.floor(x / 3), 0, v + 3) > 0.45 ? 2 : 0))
    c = mix(p.moss, c, Math.max(0, (y - 12) / 4));
  if (hash(Math.floor(x / 3), Math.floor(y / 3), v + 93) > 0.91) c = mix(c, p.moss, 0.56);
  const grain = (hash(x, y, v + 81) - 0.5) * 7;
  return c.map((n) => Math.round(n + grain));
}
export async function buildUplandArt(root = 'public/assets/images/environment') {
  const { data, info } = await sharp('public/assets/images/environment/shared/upland.png')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { frames } = JSON.parse(
    await readFile('src/rendering/generated/cliff_tileset.json', 'utf8'),
  );
  for (const [biome, p] of Object.entries(palettes)) {
    const out = Buffer.alloc(info.width * info.height * 3 * 4);
    for (let v = 0; v < 3; v++)
      for (const [key, f] of Object.entries(frames)) {
        const isMask = key.startsWith('mask_'),
          m = isMask ? Number(key.slice(5)) : 255;
        const stair = key.startsWith('stairs_'),
          dir = key.slice(-1);
        for (let y = 0; y < 32; y++)
          for (let x = 0; x < 32; x++) {
            const src = ((f.y + y) * info.width + f.x + x) * 4;
            const dest = ((v * info.height + f.y + y) * info.width + f.x + x) * 4;
            const r = region(x, y, m);
            let c = [data[src], data[src + 1], data[src + 2]],
              a = data[src + 3];
            if (isMask || key.startsWith('plateau_')) {
              if (r === 'top') c = c.map((n, k) => Math.round(n * p.turf[k]));
              else if (r === 'face') c = rock(x, y, v, p);
              else {
                const along = r === 'north' ? x : y,
                  depth = r === 'west' ? x : r === 'east' ? 31 - x : y;
                const shade = r === 'west' ? 12 : r === 'east' ? -17 : 4;
                const grain = (hash(along, depth, v + 6) - 0.5) * 9;
                c = p.stone.map((n) => n + shade + grain);
                if (depth === 0) c = mix(c, p.dark, 0.64);
                if (depth >= 3 + (hash(Math.floor(along / 3), 0, v) > 0.5 ? 1 : 0)) c = p.moss;
                // Broken diagonal faults soften the long vertical edge without changing collision.
                if ((along + depth * 2 + v * 5) % 17 < 2 && depth < 4) c = mix(c, p.dark, 0.4);
              }
            }
            if (stair) {
              const vertical = dir === 'n' || dir === 's',
                side = vertical ? x : y;
              const along = vertical ? y : x,
                t = dir === 's' || dir === 'e' ? along : 31 - along;
              if (side >= 2 && side < 30) {
                const step = Math.floor(Math.max(0, t - 3) / 6),
                  offset =
                    (t - 3 + 60 + (hash(Math.floor(side / 5), step, v + 23) > 0.65 ? 1 : 0)) % 6;
                const grain = (hash(x, y, v + 11) - 0.5) * 8;
                c = p.stone.map((n) => n + 18 - step * 3 + grain);
                if (offset >= 4) c = mix(c, p.dark, offset === 5 ? 0.65 : 0.4);
                else if (offset === 0) c = c.map((n) => n + 17);
                if (side === 7 + ((step * 7 + v * 3) % 19) && offset > 0 && offset < 4)
                  c = mix(c, p.dark, 0.38);
                const edge = Math.min(
                  1,
                  Math.min(side - 2, 29 - side) / 3,
                  Math.min(t, 31 - t) / 3,
                );
                // Ground is supplied by the runtime's material compositor. Baking
                // forest grass here leaves a green rectangle on rocky/muddy floors.
                a = Math.round(255 * Math.max(0, edge));
              } else {
                // Solid cheeks retain a stone silhouette, never a grass-colored rail.
                c = mix(p.stone, p.dark, side === 0 || side === 31 ? 0.45 : 0.15);
                a = t >= 3 && t <= 28 ? 255 : 0;
              }
            }
            for (let k = 0; k < 3; k++) out[dest + k] = Math.max(0, Math.min(255, c[k]));
            out[dest + 3] = a;
          }
        // Extruded two-pixel gutters match the existing nearest-neighbour atlas contract.
        for (let y = -2; y < 34; y++)
          for (let x = -2; x < 34; x++)
            if (x < 0 || x >= 32 || y < 0 || y >= 32) {
              const src =
                ((v * info.height + f.y + Math.max(0, Math.min(31, y))) * info.width +
                  f.x +
                  Math.max(0, Math.min(31, x))) *
                4;
              const dest = ((v * info.height + f.y + y) * info.width + f.x + x) * 4;
              out.copy(out, dest, src, src + 4);
            }
      }
    await sharp(out, { raw: { width: info.width, height: info.height * 3, channels: 4 } })
      .png()
      .toFile(`${root}/${biome}/upland.png`);
  }
}
if (process.argv[1]?.endsWith('build-upland-art.mjs')) await buildUplandArt();
