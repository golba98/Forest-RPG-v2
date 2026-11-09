import { buildUplandArt } from './build-upland-art.mjs';
/** Reproduce native-sized environment packs from the retained source sheets. */
import sharp from 'sharp';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const root = 'public/assets/images/environment';
const treeSource = 'docs/assets/source/environment/trees-generated.png';
const meta = await sharp(treeSource).metadata();
async function isolate(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height,
    seen = new Uint8Array(n);
  let largest = [];
  for (let start = 0; start < n; start++)
    if (!seen[start] && data[start * 4 + 3] > 64) {
      const queue = [start];
      seen[start] = 1;
      for (let q = 0; q < queue.length; q++) {
        const i = queue[q],
          x = i % info.width,
          y = Math.floor(i / info.width);
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ]) {
          const nx = x + dx,
            ny = y + dy,
            j = ny * info.width + nx;
          if (
            nx >= 0 &&
            ny >= 0 &&
            nx < info.width &&
            ny < info.height &&
            !seen[j] &&
            data[j * 4 + 3] > 64
          ) {
            seen[j] = 1;
            queue.push(j);
          }
        }
      }
      if (queue.length > largest.length) largest = queue;
    }
  const keep = new Set(largest);
  for (let i = 0; i < n; i++) if (!keep.has(i)) data[i * 4 + 3] = 0;
  return sharp(data, { raw: info }).png().toBuffer();
}
const frames = [];
for (let i = 0; i < 12; i++) {
  const extracted = await sharp(treeSource)
    .extract({
      left: Math.floor(((i % 4) * meta.width) / 4),
      top: Math.floor((Math.floor(i / 4) * meta.height) / 3.15),
      width: Math.floor(meta.width / 4),
      height: Math.floor(meta.height / 3.15),
    })
    .png()
    .toBuffer();
  const cell = await sharp(await isolate(extracted))
    .trim()
    .png()
    .toBuffer();
  const resized = await sharp(cell)
    .resize(88, 112, { fit: 'inside', kernel: 'nearest' })
    .png()
    .toBuffer();
  const m = await sharp(resized).metadata();
  await sharp({ create: { width: 96, height: 128, channels: 4, background: '#00000000' } })
    .composite([{ input: resized, left: Math.floor((96 - m.width) / 2), top: 120 - m.height }])
    .png()
    .toFile(`${root}/shared/tree-${i}.png`);
  frames.push({
    id: `tree-${i}`,
    family: 'tree',
    origin: 'generated',
    width: 96,
    height: 128,
    anchor: [48, 120],
    collision: [-0.28, -0.35, 0.28, 0],
    occlusion: [0, 0, 96, 110],
    layer: 'actors',
    frames: 1,
    weight: 1,
  });
}
// Two intact native LPC young trees, useful at woodland edges and in meadows.
for (let i = 12; i < 14; i++) {
  await sharp(`${root}/lpc/trees-pale.png`)
    .extract({ left: (i - 12) * 64, top: 0, width: 64, height: 64 })
    .png()
    .toFile(`${root}/shared/tree-${i}.png`);
  frames.push({
    id: `tree-${i}`,
    family: 'tree',
    origin: 'reused-lpc',
    width: 64,
    height: 64,
    anchor: [32, i === 12 ? 60 : 62],
    collision: [-0.18, -0.35, 0.18, 0],
    occlusion: [0, 0, 64, 54],
    layer: 'actors',
    frames: 1,
    weight: 1,
  });
}
const plants = {
  forest: [
    [352, 384],
    [0, 576],
    [32, 576],
    [384, 384],
    [416, 384],
    [0, 320],
    [448, 864],
    [416, 864],
    [160, 832],
    [32, 768],
  ],
  meadow: [
    [352, 192],
    [416, 32],
    [0, 96],
    [32, 96],
    [0, 320],
    [32, 320],
    [64, 320],
    [0, 0],
    [32, 0],
    [416, 864],
  ],
  highlands: [
    [0, 320],
    [32, 320],
    [64, 320],
    [416, 864],
    [0, 576],
    [32, 768],
  ],
  wetlands: [
    [32, 416],
    [64, 416],
    [96, 416],
    [128, 416],
    [352, 384],
    [384, 384],
    [416, 384],
    [0, 480],
    [32, 480],
    [160, 832],
  ],
  autumn: [
    [0, 224],
    [32, 224],
    [64, 224],
    [96, 224],
    [0, 576],
    [32, 576],
    [64, 576],
    [416, 864],
    [160, 832],
    [32, 768],
  ],
};
const hash = (x, y, s) => {
  let h = Math.imul(x + 19, 374761393) ^ Math.imul(y + 37, 668265263) ^ s;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// Quiet clustered ground grain: sparse accents, no dense repeated blade pattern.
const pixels = Buffer.alloc(256 * 32 * 4);
for (let v = 0; v < 8; v++)
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const broad = hash(Math.floor(x / 5), Math.floor(y / 4), v),
        grain = hash(x, y, v);
      const lum = Math.round(245 + (broad - 0.5) * 8 + (grain < 0.06 ? -12 : grain > 0.97 ? 5 : 0));
      const idx = (y * 256 + v * 32 + x) * 4;
      pixels[idx] = pixels[idx + 1] = pixels[idx + 2] = lum;
      pixels[idx + 3] = 255;
    }
await sharp(pixels, { raw: { width: 256, height: 32, channels: 4 } })
  .png()
  .toFile(`${root}/shared/ground.png`);
const packs = {};
for (const [biome, rects] of Object.entries(plants)) {
  await mkdir(`${root}/${biome}`, { recursive: true });
  const inputs = await Promise.all(
    rects.map(async ([left, top], i) => ({
      input: await sharp(`${root}/lpc/plants.png`)
        .extract({ left, top, width: 32, height: 32 })
        .png()
        .toBuffer(),
      left: i * 32,
      top: 0,
    })),
  );
  await sharp({
    create: { width: rects.length * 32, height: 32, channels: 4, background: '#00000000' },
  })
    .composite(inputs)
    .png()
    .toFile(`${root}/${biome}/plants.png`);
  packs[biome] = {
    plants: rects.map((rect, i) => ({
      id: `${biome}-plant-${i}`,
      sourceRect: [...rect, 32, 32],
      origin: 'reused-lpc',
      anchor: [16, 30],
      collision: null,
      layer: 'ground',
      frames: 1,
      weight: 1,
    })),
    groundVariants: 8,
    groundSource: 'shared/ground.png',
  };
}
// Preserve all original relief masks and collision geometry, remove saturated orange material.
const cliffPath = 'public/assets/images/terrain/hills/cliff_tileset.png';
const cliff = await sharp(cliffPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
// V15 keeps the sunlit grass top, making the raised level visible. The older
// transparent-top relief remains available for frozen worlds.
const upland = Buffer.from(cliff.data);
for (let i = 0; i < cliff.data.length; i += 4) {
  const r = cliff.data[i],
    g = cliff.data[i + 1],
    b = cliff.data[i + 2];
  if (r > g * 1.16 && r > b * 1.3) {
    const l = Math.round(r * 0.33 + g * 0.5 + b * 0.17);
    cliff.data[i] = Math.min(255, l + 7);
    cliff.data[i + 1] = Math.min(255, l + 4);
    cliff.data[i + 2] = Math.max(0, l - 9);
    upland[i] = cliff.data[i];
    upland[i + 1] = cliff.data[i + 1];
    upland[i + 2] = cliff.data[i + 2];
  }
  // Make grass-top pixels transparent: the continuous biome ground remains visible.
  else if (g > r * 1.08 && g > b * 1.25) cliff.data[i + 3] = 0;
}
const reliefFrames = JSON.parse(
  await readFile('src/rendering/generated/cliff_tileset.json', 'utf8'),
).frames;
// Broken turf caps and exposed earth/stone strata replace the ruler-straight
// bright masonry line. The silhouette and every collision pixel stay unchanged.
for (const [key, f] of Object.entries(reliefFrames)) {
  if (!key.startsWith('mask_')) continue;
  const mask = Number(key.slice(5));
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const i = ((f.y + y) * cliff.info.width + f.x + x) * 4;
      if (!upland[i + 3]) continue;
      const face =
        y >= 12 &&
        (!(mask & 16) ||
          (mask & 64 && !(mask & 32) && x < 6) ||
          (mask & 4 && !(mask & 8) && x >= 26));
      if (!face) continue;
      const grain = (hash(x, y, mask + 83) - 0.5) * 9;
      const turf = y < 13 + (hash(x, 0, 91) > 0.55 ? 1 : 0);
      const depth = (y - 12) / 20;
      const stone = hash(Math.floor(x / 5), Math.floor(y / 4), mask + 89) > 0.68;
      const rgb = turf
        ? [101, 124, 56]
        : y >= 30
          ? [55, 47, 35]
          : stone
            ? [130 - depth * 35, 125 - depth * 35, 104 - depth * 30]
            : [125 - depth * 38, 105 - depth * 34, 73 - depth * 25];
      for (let k = 0; k < 3; k++) upland[i + k] = Math.round(rgb[k] + grain);
    }
}
const slopeGrass = await sharp('public/assets/images/terrain/grass.png')
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
for (const dir of ['n', 's', 'e', 'w']) {
  const f = reliefFrames[`stairs_${dir}`];
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const vertical = dir === 'n' || dir === 's',
        side = vertical ? x : y,
        along = vertical ? y : x;
      if (side < 2 || side >= 30) continue;
      const progress = (dir === 's' || dir === 'e' ? along : 31 - along) / 31;
      const grain = hash(x, y, 72) * 8;
      const rgb = [
        108 - progress * 24 + grain,
        99 - progress * 22 + grain,
        72 - progress * 17 + grain,
      ];
      const i = ((f.y + y) * cliff.info.width + f.x + x) * 4;
      for (let k = 0; k < 3; k++) cliff.data[i + k] = Math.round(rgb[k]);
      // Worn soil follows the opening, feathering into the biome floor at both
      // ends. Keep the stone cheeks and exact passable opening geometry intact.
      const taper = Math.min(1, along / 7, (31 - along) / 7);
      const edge = Math.min(1, (side - 2) / 5, (29 - side) / 5);
      cliff.data[i + 3] = Math.round(155 * taper * edge);
      // An opaque soil ramp replaces the rock face inside the actual passable
      // corridor. A translucent overlay would leave a visible wall underneath.
      const slopeLight = 1 - progress;
      const seam = Math.min(1, along / 4, (31 - along) / 4, (side - 2) / 4, (29 - side) / 4);
      const grassIndex = (y * slopeGrass.info.width + x) * 4;
      const grassColor = [0, 1, 2].map(
        (k) => slopeGrass.data[grassIndex + k] * (1 + slopeLight * 0.22),
      );
      const soilColor = [100 + slopeLight * 28, 92 + slopeLight * 29, 62 + slopeLight * 16];
      for (let k = 0; k < 3; k++)
        upland[i + k] = Math.round(grassColor[k] * (1 - seam) + soilColor[k] * seam + grain);
      upland[i + 3] = 255;
    }
}
await sharp(cliff.data, { raw: cliff.info }).png().toFile(`${root}/shared/relief.png`);
await sharp(upland, { raw: cliff.info }).png().toFile(`${root}/shared/upland.png`);
await buildUplandArt(root);
const species = {
  forest: [12, 13],
  meadow: [1, 8],
  highlands: [2, 3, 10],
  wetlands: [4, 5],
  autumn: [6, 7, 9],
};
for (const [id, pack] of Object.entries(packs)) {
  pack.trees = species[id];
  pack.streamedTrees =
    id === 'forest'
      ? ['native:young', 'native:tall', 'native:broad', 'native:compact']
      : species[id].map((n) => `tree:${n}`);
  pack.dependencies = [
    'shared/ground.png',
    'shared/relief.png',
    `${id}/upland.png`,
    ...species[id].map((n) => `shared/tree-${n}.png`),
    ...(id === 'forest' ? ['lpc/trees-pale.png'] : []),
  ];
  pack.upland = {
    origin: 'authored-project-relief',
    variants: 3,
    cliffMasks: 47,
    stepOrientations: 4,
    frames: 174,
    source: `${id}/upland.png`,
  };
  pack.placement = {
    ground: 'passable',
    trees: 'solid trunks; overhead canopy',
    water: id === 'wetlands' ? 'shallow water is walkable' : 'existing river rules',
  };
}
for (const f of frames) {
  f.biomes = Object.entries(species)
    .filter(([, ids]) => ids.includes(Number(f.id.slice(5))))
    .map(([id]) => id);
  f.dependencies = [];
  f.placement = ['dry-ground', 'plateau', 'protected-approach-exclusion'];
}
await writeFile(
  'src/world/environmentAssets.json',
  JSON.stringify(
    {
      trees: frames,
      upland: {
        width: 360,
        height: 648,
        variantStride: 216,
        variants: 3,
        framesPerVariant: 58,
        tileSize: 32,
        anchor: [0, 0],
        layer: 'terrain',
        origin: 'authored-project-relief',
        geometry: 'HillCollisionGeometry',
        frames: 'rendering/generated/cliff_tileset.json',
        biomes: ['forest', 'meadow', 'highlands', 'wetlands', 'autumn'],
      },
    },
    null,
    2,
  ) + '\n',
);
const manifest = {
  version: 1,
  treeSource,
  trees: frames,
  packs,
  shared: {
    ground: { origin: 'authored-procedural', variants: 8 },
    relief: { origin: 'adapted-project', geometry: 'unchanged cliff_tileset masks' },
    upland: {
      origin: 'adapted-project',
      frames: 58,
      geometry: 'unchanged cliff_tileset masks',
      surfaces: 'sunlit tops, exposed strata, four opaque soil ramps',
    },
    rocks: {
      origin: 'reused-project',
      assets: ['rock_boulder', 'rock_pebble'],
      additionalAuthoredVariants: 6,
    },
  },
  note: 'Pack selections are not unique artwork counts. LPC crops retain CC BY-SA 3.0; generated trees use LPC as style reference. No runtime recoloring of tree sprites.',
};
await writeFile(`${root}/inventory.json`, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  'docs/assets/source/environment/provenance.json',
  JSON.stringify(
    {
      tool: 'image_gen',
      source: treeSource,
      reference: 'public/assets/images/environment/lpc/trees-pale.png',
      toolOutput:
        '01a19efd-25ed-7be1-bafb-5903ea14b2d3/exec-09482dc3-fa91-4c67-b754-4283a65a7e96.png',
      requestedSpecies: [
        'old oak',
        'birch',
        'windswept pine',
        'juniper',
        'willow',
        'alder',
        'copper maple',
        'golden birch',
        'rowan',
        'beech',
        'fir',
        'gnarled oak',
      ],
      prompt:
        '12 distinct top-down RPG trees in 4x3 cells, transparent; LPC scale/style reference; oak, birch, pine, juniper, willow, alder, maple, golden birch, rowan, beech, fir, gnarled oak.',
      processing:
        'Trim individual cells, nearest fit 88x112, transparent 96x128 canvas, root baseline 120. Existing native LPC young trees and plants are cropped without recoloring.',
      license:
        'LPC attribution and CC-BY-SA-3.0 retained for derivatives and reference-derived tree pack.',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Prepared 12 generated tree frames, 2 native LPC tree crops, 46 LPC plant selections, 8 authored ground frames and adapted relief atlas.',
);

// Menu previews are cropped from real streamed gameplay captures, never mockups.
// Refresh the curated captures with biome-walk.spec.ts before running this script.
for (const id of Object.keys(species)) {
  const source = `docs/images/infinite-biomes/${id}.png`;
  const crop =
    id === 'wetlands'
      ? { left: 340, top: 150, width: 640, height: 448 }
      : id === 'highlands'
        ? { left: 380, top: 0, width: 640, height: 448 }
        : { left: 340, top: 165, width: 640, height: 448 };
  await mkdir('public/assets/images/biome-previews', { recursive: true });
  await sharp(source)
    .extract(crop)
    .resize(400, 280, { kernel: 'nearest', fit: 'cover' })
    .png()
    .toFile(`public/assets/images/biome-previews/${id}.png`);
}
