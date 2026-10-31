/** Build original soil rendering without modifying the working tree. */
import { build } from 'vite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
let renderer = readFileSync('src/rendering/PixiRenderer.ts', 'utf8');
renderer = renderer
  .replace("import { createSoilChunkArt, type SoilChunkArt } from './SoilArt';\n", '')
  .replace('  private soilChunks = new Map<string, SoilChunkArt>();\n', '')
  .replaceAll(
    '    for (const soil of this.soilChunks.values()) soil.destroy();\n    this.soilChunks.clear();\n',
    '',
  )
  .replace(
    '    this.soilChunks.get(key)?.destroy();\n    this.soilChunks.delete(key);\n    const soil = createSoilChunkArt(world, x, y, CHUNK);\n    if (soil) this.soilChunks.set(key, soil);\n',
    '',
  )
  .replace(
    'neighbourMaterialMask(world.tiles, width, height, tx, ty)',
    'neighbourMaterialMask(world.tiles, width, height, tx, ty, tile === Tile.MUD)',
  )
  .replace(
    'for (const [index, layer] of getTileArt(tile, tx, ty, elevation, shore).entries()) {',
    'for (const layer of getTileArt(tile, tx, ty, elevation, shore)) {',
  );
const start = renderer.indexOf('        // Compose the material after');
if (start < 0) throw Error('Expected material insertion missing');
const end = renderer.indexOf('\n      }', start);
renderer = renderer.slice(0, start) + renderer.slice(end);
if (renderer.includes('soilChunks') || renderer.includes('SoilChunk'))
  throw Error('Original renderer reconstruction failed');
const originals = new Map([
  ['/src/rendering/PixiRenderer.ts', renderer],
  ...['waterArt.ts', 'terrainArt.ts'].map((f) => [
    `/src/rendering/${f}`,
    execFileSync('git', ['show', `58baaf8:src/rendering/${f}`], { encoding: 'utf8' }),
  ]),
]);
await build({
  plugins: [
    {
      name: 'original-soil-evidence',
      enforce: 'pre',
      load(id) {
        for (const [name, source] of originals) if (id.endsWith(name)) return source;
      },
    },
  ],
  build: { outDir: '/tmp/forest-mud-original-dist', emptyOutDir: true },
});
