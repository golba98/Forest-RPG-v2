import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const TARGET_ROOT = '/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/public/assets';

const results = {
  hills: [],
  items: [],
  player: [],
  enemies: [],
  ghosts: [],
  errors: [],
  warnings: [],
};

// -------------------------------------------------------------
// 1. Hills Alpha & Perimeter Chroma Inspection
// -------------------------------------------------------------
const hillFiles = [
  'hill_east.png',
  'hill_north.png',
  'hill_northeast.png',
  'hill_northwest.png',
  'hill_south.png',
  'hill_southeast.png',
  'hill_southwest.png',
  'hill_west.png',
];

for (const filename of hillFiles) {
  const filePath = path.join(TARGET_ROOT, 'images/terrain/hills', filename);
  if (!fs.existsSync(filePath)) {
    results.errors.push(`Missing hill file: ${filename}`);
    continue;
  }

  const image = sharp(filePath);
  const metadata = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let remainingGreenPixels = 0;
  let remainingFringePixels = 0;
  let perimeterTotal = 0;
  let perimeterTransparent = 0;
  let perimeterOpaque = 0;
  let perimeterGreenChroma = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = channels === 4 ? data[idx + 3] : 255;

      const isPerimeter = (x === 0 || x === width - 1 || y === 0 || y === height - 1);
      if (isPerimeter) {
        perimeterTotal++;
        if (a === 0) {
          perimeterTransparent++;
        } else {
          perimeterOpaque++;
          // check if perimeter opaque pixel has green chroma / fringe
          if ((g > 100 && r < 80 && b < 80) || (g > r + 35 && g > b + 35 && g > 90)) {
            perimeterGreenChroma++;
          }
        }
      }

      // Check across ALL pixels for non-transparent green chroma / fringe
      if (a > 0) {
        if (g > 100 && r < 80 && b < 80) {
          remainingGreenPixels++;
        }
        if (g > r + 35 && g > b + 35 && g > 90) {
          remainingFringePixels++;
        }
      }
    }
  }

  results.hills.push({
    file: filename,
    width,
    height,
    channels,
    hasAlpha: channels === 4,
    perimeterTotal,
    perimeterTransparent,
    perimeterOpaque,
    perimeterGreenChroma,
    remainingGreenPixels,
    remainingFringePixels,
    clean: remainingGreenPixels === 0 && remainingFringePixels === 0 && perimeterGreenChroma === 0,
  });
}

// -------------------------------------------------------------
// 2. Item Icons Dimensions (32x32)
// -------------------------------------------------------------
const itemFiles = [
  { name: 'potion_health.png', expectedW: 32, expectedH: 32 },
  { name: 'potion_speed.png', expectedW: 32, expectedH: 32 },
  { name: 'chest.png', expectedW: 32, expectedH: 32 },
  { name: 'coin.png', expectedW: 32, expectedH: 32 },
  { name: 'coin_anim.png', expectedW: 128, expectedH: 32 },
];

for (const item of itemFiles) {
  const filePath = path.join(TARGET_ROOT, 'images/items', item.name);
  if (!fs.existsSync(filePath)) {
    results.errors.push(`Missing item file: ${item.name}`);
    continue;
  }

  const meta = await sharp(filePath).metadata();
  const match = meta.width === item.expectedW && meta.height === item.expectedH;
  if (!match) {
    results.errors.push(`Dimension mismatch for ${item.name}: got ${meta.width}x${meta.height}, expected ${item.expectedW}x${item.expectedH}`);
  }
  results.items.push({
    file: item.name,
    width: meta.width,
    height: meta.height,
    expected: `${item.expectedW}x${item.expectedH}`,
    match,
    channels: meta.channels,
    format: meta.format,
  });
}

// -------------------------------------------------------------
// 3. Player Sheets & Enemy Sprites Frame Counts & Dimensions
// -------------------------------------------------------------
const dirs = ['east', 'north', 'northeast', 'northwest', 'south', 'southeast', 'southwest', 'west'];

for (const d of dirs) {
  // Idle (4 frames, 20px fw -> 80px)
  const idlePath = path.join(TARGET_ROOT, `images/characters/player/idle/idle_${d}.png`);
  if (fs.existsSync(idlePath)) {
    const meta = await sharp(idlePath).metadata();
    const frameCount = meta.width / 20;
    results.player.push({
      action: 'idle',
      dir: d,
      width: meta.width,
      height: meta.height,
      frameWidth: 20,
      frameCount,
      expectedFrames: 4,
      valid: meta.width === 80 && frameCount === 4,
    });
  } else {
    results.errors.push(`Missing player idle_${d}.png`);
  }

  // Walk (4 frames, 20px fw -> 80px)
  const walkPath = path.join(TARGET_ROOT, `images/characters/player/walk/walk_${d}.png`);
  if (fs.existsSync(walkPath)) {
    const meta = await sharp(walkPath).metadata();
    const frameCount = meta.width / 20;
    results.player.push({
      action: 'walk',
      dir: d,
      width: meta.width,
      height: meta.height,
      frameWidth: 20,
      frameCount,
      expectedFrames: 4,
      valid: meta.width === 80 && frameCount === 4,
    });
  } else {
    results.errors.push(`Missing player walk_${d}.png`);
  }

  // Run (6 frames, 20px fw -> 120px)
  const runPath = path.join(TARGET_ROOT, `images/characters/player/run/run_${d}.png`);
  if (fs.existsSync(runPath)) {
    const meta = await sharp(runPath).metadata();
    const frameCount = meta.width / 20;
    results.player.push({
      action: 'run',
      dir: d,
      width: meta.width,
      height: meta.height,
      frameWidth: 20,
      frameCount,
      expectedFrames: 6,
      valid: meta.width === 120 && frameCount === 6,
    });
  } else {
    results.errors.push(`Missing player run_${d}.png`);
  }

  // Jump (5 frames, 20px fw -> 100px)
  const jumpPath = path.join(TARGET_ROOT, `images/characters/player/jump/jump_${d}.png`);
  if (fs.existsSync(jumpPath)) {
    const meta = await sharp(jumpPath).metadata();
    const frameCount = meta.width / 20;
    results.player.push({
      action: 'jump',
      dir: d,
      width: meta.width,
      height: meta.height,
      frameWidth: 20,
      frameCount,
      expectedFrames: 5,
      valid: meta.width === 100 && frameCount === 5,
    });
  } else {
    results.errors.push(`Missing player jump_${d}.png`);
  }

  // Attack (4 frames, 446px -> ~111.5px fw)
  const attackPath = path.join(TARGET_ROOT, `images/characters/player/attack/attack_${d}.png`);
  if (fs.existsSync(attackPath)) {
    const meta = await sharp(attackPath).metadata();
    const frameWidth = meta.width / 4;
    results.player.push({
      action: 'attack',
      dir: d,
      width: meta.width,
      height: meta.height,
      frameWidth,
      frameCount: 4,
      expectedFrames: 4,
      valid: meta.width === 446,
    });
  } else {
    results.errors.push(`Missing player attack_${d}.png`);
  }
}

// Check Attack East vs West mirroring empirically
const attackEastPath = path.join(TARGET_ROOT, 'images/characters/player/attack/attack_east.png');
const attackWestPath = path.join(TARGET_ROOT, 'images/characters/player/attack/attack_west.png');
if (fs.existsSync(attackEastPath) && fs.existsSync(attackWestPath)) {
  const eastRaw = await sharp(attackEastPath).raw().toBuffer({ resolveWithObject: true });
  const westRaw = await sharp(attackWestPath).raw().toBuffer({ resolveWithObject: true });
  
  // Verify that west is indeed per-frame horizontally mirrored east
  const numFrames = 4;
  const fw = eastRaw.info.width / numFrames;
  let mirroredMatchCount = 0;
  let totalChecked = 0;

  for (let f = 0; f < numFrames; f++) {
    const startX = Math.floor(f * fw);
    const endX = Math.floor((f + 1) * fw);
    const currentFw = endX - startX;
    for (let y = 0; y < eastRaw.info.height; y++) {
      for (let x = 0; x < currentFw; x++) {
        const eastIdx = (y * eastRaw.info.width + (startX + x)) * eastRaw.info.channels;
        const westIdx = (y * westRaw.info.width + (endX - 1 - x)) * westRaw.info.channels;
        totalChecked++;
        let match = true;
        for (let c = 0; c < eastRaw.info.channels; c++) {
          if (eastRaw.data[eastIdx + c] !== westRaw.data[westIdx + c]) {
            match = false;
            break;
          }
        }
        if (match) mirroredMatchCount++;
      }
    }
  }

  const mirrorPct = (mirroredMatchCount / totalChecked) * 100;
  results.playerMirrorTest = {
    totalPixels: totalChecked,
    mirroredMatchCount,
    mirrorPct,
    isExactMirror: mirrorPct === 100,
  };
}

// Enemies
const enemySpecs = [
  { name: 'mantis_move.png', expectedW: 128, expectedH: 128, cols: 4, rows: 4, frameW: 32, frameH: 32 },
  { name: 'mantis_attack.png', expectedW: 224, expectedH: 128, cols: 7, rows: 4, frameW: 32, frameH: 32 },
  { name: 'beetle_move.png', expectedW: 128, expectedH: 128, cols: 4, rows: 4, frameW: 32, frameH: 32 },
  { name: 'beetle_attack.png', expectedW: 192, expectedH: 128, cols: 6, rows: 4, frameW: 32, frameH: 32 },
  { name: 'maggot_walk.png', expectedW: 128, expectedH: 128, cols: 4, rows: 4, frameW: 32, frameH: 32 },
  { name: 'maggot_spit.png', expectedW: 224, expectedH: 128, cols: 7, rows: 4, frameW: 32, frameH: 32 },
  { name: 'ghost_move.png', expectedW: 234, expectedH: 256, cols: 3, rows: 4, frameW: 78, frameH: 64 },
  { name: 'ghost_attack.png', expectedW: 234, expectedH: 256, cols: 3, rows: 4, frameW: 78, frameH: 64 },
  { name: 'acid_blob.png', expectedW: 224, expectedH: 128, cols: 7, rows: 4, frameW: 32, frameH: 32 },
  { name: 'acid_splat.png', expectedW: 384, expectedH: 64, cols: 6, rows: 1, frameW: 64, frameH: 64 },
  { name: 'egg_cluster.png', expectedW: 32, expectedH: 32, cols: 1, rows: 1, frameW: 32, frameH: 32 },
  { name: 'eggsplosion.png', expectedW: 128, expectedH: 64, cols: 4, rows: 1, frameW: 32, frameH: 64 },
];

for (const enemy of enemySpecs) {
  const filePath = path.join(TARGET_ROOT, 'images/characters/enemies', enemy.name);
  if (!fs.existsSync(filePath)) {
    results.errors.push(`Missing enemy file: ${enemy.name}`);
    continue;
  }

  const meta = await sharp(filePath).metadata();
  const match = meta.width === enemy.expectedW && meta.height === enemy.expectedH;
  if (!match) {
    results.errors.push(`Enemy dimension mismatch for ${enemy.name}: got ${meta.width}x${meta.height}, expected ${enemy.expectedW}x${enemy.expectedH}`);
  }
  const calcCols = meta.width / enemy.frameW;
  const calcRows = meta.height / enemy.frameH;

  results.enemies.push({
    file: enemy.name,
    width: meta.width,
    height: meta.height,
    expectedDimensions: `${enemy.expectedW}x${enemy.expectedH}`,
    frameDimensions: `${enemy.frameW}x${enemy.frameH}`,
    cols: calcCols,
    rows: calcRows,
    expectedCols: enemy.cols,
    expectedRows: enemy.rows,
    match: match && calcCols === enemy.cols && calcRows === enemy.rows,
  });
}

// -------------------------------------------------------------
// 4. Ghost Sprites Downscaled Check
// -------------------------------------------------------------
const ghostFiles = ['ghost_move.png', 'ghost_attack.png'];
for (const gf of ghostFiles) {
  const filePath = path.join(TARGET_ROOT, 'images/characters/enemies', gf);
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    const meta = await sharp(filePath).metadata();
    results.ghosts.push({
      file: gf,
      sizeBytes: stat.size,
      sizeKB: (stat.size / 1024).toFixed(2),
      width: meta.width,
      height: meta.height,
      is234x256: meta.width === 234 && meta.height === 256,
      under50KB: stat.size < 50 * 1024,
    });
  }
}

console.log(JSON.stringify(results, null, 2));
