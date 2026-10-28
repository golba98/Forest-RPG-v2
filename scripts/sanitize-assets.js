/**
 * scripts/sanitize-assets.js
 *
 * Automated Asset Sanitization and Migration Pipeline for Forest RPG V2.
 *
 * Reads legacy assets from:
 *   /home/k9-vortex/Development/1-JavaScript/3-Game Development/assets (STRICTLY READ-ONLY)
 * Sanitizes and writes to:
 *   /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/public/assets
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Workspace paths
const LEGACY_ROOT = '/home/k9-vortex/Development/1-JavaScript/3-Game Development/assets';
const TARGET_ROOT = path.resolve(__dirname, '../public/assets');

// Ensure sharp is available
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('[sanitize-assets] ERROR: "sharp" package is required.');
  console.error('[sanitize-assets] Please run: npm install -D sharp');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Directory Structure Creation
// ---------------------------------------------------------------------------
const DIRS = [
  'audio/music',
  'audio/sfx',
  'fonts',
  'images/background',
  'images/characters/player/idle',
  'images/characters/player/walk',
  'images/characters/player/run',
  'images/characters/player/jump',
  'images/characters/player/attack',
  'images/characters/enemies',
  'images/items',
  'images/objects/clouds',
  'images/objects/decor',
  'images/terrain/hills',
  'images/ui',
  'video',
  'manifests',
];

function ensureDirectories() {
  console.log('[sanitize-assets] Ensuring target directory hierarchy...');
  for (const dir of DIRS) {
    const fullPath = path.join(TARGET_ROOT, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Quirk 1: Hill Tiles Chroma Screen Sanitization
// ---------------------------------------------------------------------------
const HILL_FILES = [
  { src: '1-Background/2-Game/1-Forest/1-hill_east.png', dst: 'images/terrain/hills/hill_east.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_north.png', dst: 'images/terrain/hills/hill_north.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_northeast.png', dst: 'images/terrain/hills/hill_northeast.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_northwest.png', dst: 'images/terrain/hills/hill_northwest.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_south.png', dst: 'images/terrain/hills/hill_south.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_southeast.png', dst: 'images/terrain/hills/hill_southeast.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_southwest.png', dst: 'images/terrain/hills/hill_southwest.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_west.png', dst: 'images/terrain/hills/hill_west.png' },
];

async function sanitizeHills() {
  console.log('[sanitize-assets] Sanitizing hill tiles (removing green-screen chroma keys)...');
  for (const hill of HILL_FILES) {
    const srcPath = path.join(LEGACY_ROOT, hill.src);
    const dstPath = path.join(TARGET_ROOT, hill.dst);

    const image = sharp(srcPath);
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

    let cleared = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = info.channels === 4 ? data[i + 3] : 255;
      if (a === 0) continue;

      // Chroma key rules from legacy survey:
      // White: r > 240 && g > 240 && b > 240
      // Green: g > 100 && r < 80 && b < 80
      // Green fringe: g > r + 35 && g > b + 35 && g > 90
      if ((r > 240 && g > 240 && b > 240) ||
          (g > 100 && r < 80 && b < 80) ||
          (g > r + 35 && g > b + 35 && g > 90)) {
        if (info.channels === 4) {
          data[i + 3] = 0;
        }
        cleared++;
      }
    }

    await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels,
      },
    })
      .png()
      .toFile(dstPath);

    console.log(`  ✓ ${path.basename(hill.dst)} (${info.width}x${info.height}): ${cleared} chroma pixels cleared`);
  }
}

// ---------------------------------------------------------------------------
// 3. Quirk 2: East Attack Animation & Horizontal Mirroring
// ---------------------------------------------------------------------------
async function processAttackAnimations() {
  console.log('[sanitize-assets] Normalizing attack animations (East & West mirroring)...');
  const attackDir = path.join(LEGACY_ROOT, '2-Characters/6-Attack');
  const targetDir = path.join(TARGET_ROOT, 'images/characters/player/attack');

  // Direct copies for existing sheets
  const directMaps = [
    { src: 'attack_north.png', dst: 'attack_north.png' },
    { src: 'attack_north_east.png', dst: 'attack_northeast.png' },
    { src: 'attack_north_west.png', dst: 'attack_northwest.png' },
    { src: 'attack_south.png', dst: 'attack_south.png' },
    { src: 'attack_south_east.png', dst: 'attack_southeast.png' },
    { src: 'attack_south_west.png', dst: 'attack_southwest.png' },
  ];

  for (const m of directMaps) {
    fs.copyFileSync(path.join(attackDir, m.src), path.join(targetDir, m.dst));
  }

  // Handle attack_west.png:
  // In legacy artwork, attack_west.png is drawn facing EAST.
  // 1. Save original artwork as attack_east.png
  const srcWest = path.join(attackDir, 'attack_west.png');
  fs.copyFileSync(srcWest, path.join(targetDir, 'attack_east.png'));
  console.log('  ✓ attack_east.png authored from legacy attack_west.png (un-flipped East artwork)');

  // 2. Generate true attack_west.png by per-frame horizontal mirroring
  const imgWest = sharp(srcWest);
  const { data, info } = await imgWest.raw().toBuffer({ resolveWithObject: true });
  const numFrames = 4;
  const frameWidth = info.width / numFrames; // 111.5
  const mirrored = Buffer.from(data);

  for (let f = 0; f < numFrames; f++) {
    const startX = Math.floor(f * frameWidth);
    const endX = Math.floor((f + 1) * frameWidth);
    const currentFw = endX - startX;

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < currentFw; x++) {
        const srcOffset = (y * info.width + (startX + x)) * info.channels;
        const dstOffset = (y * info.width + (endX - 1 - x)) * info.channels;

        for (let c = 0; c < info.channels; c++) {
          mirrored[dstOffset + c] = data[srcOffset + c];
        }
      }
    }
  }

  await sharp(mirrored, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toFile(path.join(targetDir, 'attack_west.png'));
  console.log('  ✓ attack_west.png generated via per-frame horizontal mirroring');
}

// ---------------------------------------------------------------------------
// 4. Quirk 3: Dedicated 32x32 Pixel-Art Icons for Items
// ---------------------------------------------------------------------------
async function generateItemSprites() {
  console.log('[sanitize-assets] Generating dedicated 32x32 pixel-art item icons...');
  const itemsDir = path.join(TARGET_ROOT, 'images/items');

  // 4.1 Chest Sprite
  const chestBuf = Buffer.alloc(32 * 32 * 4, 0);
  function setPx(buf, x, y, r, g, b, a = 255) {
    if (x < 0 || x >= 32 || y < 0 || y >= 32) return;
    const idx = (y * 32 + x) * 4;
    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = a;
  }

  // Chest Palette
  const C_OUTLINE = [28, 14, 5];
  const C_WOOD_MID = [139, 69, 19];
  const C_WOOD_LIGHT = [176, 95, 34];
  const C_WOOD_DARK = [92, 46, 14];
  const C_GOLD_MID = [220, 170, 30];
  const C_GOLD_LIGHT = [255, 220, 90];
  const C_GOLD_DARK = [160, 110, 10];
  const C_LOCK = [45, 45, 55];
  const C_SHADOW = [0, 0, 0, 80];

  // Base shadow
  for (let x = 3; x <= 28; x++) {
    for (let y = 27; y <= 29; y++) {
      setPx(chestBuf, x, y, ...C_SHADOW);
    }
  }
  // Wood body
  for (let x = 4; x <= 27; x++) {
    for (let y = 8; y <= 26; y++) {
      setPx(chestBuf, x, y, ...C_WOOD_MID);
    }
  }
  // Borders & lid line
  for (let x = 4; x <= 27; x++) {
    setPx(chestBuf, x, 8, ...C_OUTLINE);
    setPx(chestBuf, x, 15, ...C_OUTLINE);
    setPx(chestBuf, x, 26, ...C_OUTLINE);
  }
  for (let y = 8; y <= 26; y++) {
    setPx(chestBuf, 4, y, ...C_OUTLINE);
    setPx(chestBuf, 27, y, ...C_OUTLINE);
  }
  // Wood highlights
  for (let x = 5; x <= 26; x++) {
    setPx(chestBuf, x, 9, ...C_WOOD_LIGHT);
    setPx(chestBuf, x, 16, ...C_WOOD_DARK);
    setPx(chestBuf, x, 25, ...C_WOOD_DARK);
  }
  // Gold Straps
  for (const bx of [7, 8, 9, 22, 23, 24]) {
    for (let y = 8; y <= 26; y++) {
      setPx(chestBuf, bx, y, ...C_GOLD_MID);
    }
    setPx(chestBuf, bx, 8, ...C_OUTLINE);
    setPx(chestBuf, bx, 26, ...C_OUTLINE);
    setPx(chestBuf, bx, 9, ...C_GOLD_LIGHT);
    setPx(chestBuf, bx, 25, ...C_GOLD_DARK);
  }
  // Iron Lock Plate
  for (let x = 13; x <= 18; x++) {
    for (let y = 14; y <= 18; y++) {
      setPx(chestBuf, x, y, ...C_GOLD_MID);
    }
    setPx(chestBuf, x, 14, ...C_OUTLINE);
    setPx(chestBuf, x, 18, ...C_OUTLINE);
  }
  for (let y = 14; y <= 18; y++) {
    setPx(chestBuf, 13, y, ...C_OUTLINE);
    setPx(chestBuf, 18, y, ...C_OUTLINE);
  }
  setPx(chestBuf, 15, 16, 15, 15, 20);
  setPx(chestBuf, 16, 16, 15, 15, 20);
  setPx(chestBuf, 15, 17, ...C_LOCK);
  setPx(chestBuf, 16, 17, ...C_LOCK);

  await sharp(chestBuf, { raw: { width: 32, height: 32, channels: 4 } })
    .png()
    .toFile(path.join(itemsDir, 'chest.png'));
  console.log('  ✓ chest.png (32x32) generated');

  // 4.2 Potions (Health & Speed)
  function renderPotion(liquidMain, liquidLight, liquidDark, liquidBubble) {
    const buf = Buffer.alloc(32 * 32 * 4, 0);
    const outline = [20, 25, 35];
    const glassRim = [200, 225, 255, 220];
    const glassBody = [180, 210, 240, 100];
    const corkMain = [145, 80, 30];
    const corkLight = [190, 110, 45];
    const corkDark = [95, 50, 15];
    const specular = [255, 255, 255, 210];

    // Shadow
    for (let x = 10; x <= 21; x++) setPx(buf, x, 29, 0, 0, 0, 60);

    // Cork
    for (let x = 13; x <= 18; x++) {
      for (let y = 4; y <= 7; y++) setPx(buf, x, y, ...corkMain);
      setPx(buf, x, 4, ...corkLight);
      setPx(buf, x, 7, ...corkDark);
    }
    setPx(buf, 13, 4, ...outline);
    setPx(buf, 18, 4, ...outline);

    // Glass Lip / Neck
    for (let x = 11; x <= 20; x++) {
      setPx(buf, x, 8, ...glassRim);
      setPx(buf, x, 9, ...outline);
    }
    for (let y = 9; y <= 12; y++) {
      setPx(buf, 12, y, ...outline);
      setPx(buf, 19, y, ...outline);
      for (let x = 13; x <= 18; x++) setPx(buf, x, y, ...glassBody);
    }

    // Flask bulb body
    const cx = 15.5, cy = 21.0, r = 7.8;
    for (let y = 12; y <= 28; y++) {
      for (let x = 7; x <= 24; x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d <= r + 0.8) {
          if (d > r - 0.5) {
            setPx(buf, x, y, ...outline);
          } else if (y < 17) {
            setPx(buf, x, y, ...glassBody);
          } else {
            if (y === 17) setPx(buf, x, y, ...liquidLight);
            else if (y >= 25 || d > r - 1.5) setPx(buf, x, y, ...liquidDark);
            else setPx(buf, x, y, ...liquidMain);
          }
        }
      }
    }

    // Bubbles
    setPx(buf, 13, 23, ...liquidBubble);
    setPx(buf, 17, 24, ...liquidBubble);
    setPx(buf, 15, 20, ...liquidBubble);

    // Specular highlight
    setPx(buf, 10, 16, ...specular);
    setPx(buf, 10, 17, ...specular);
    setPx(buf, 11, 15, ...specular);
    setPx(buf, 14, 10, ...specular);

    return buf;
  }

  const hpBuf = renderPotion([220, 30, 60], [255, 90, 120], [150, 10, 35], [255, 210, 220, 240]);
  await sharp(hpBuf, { raw: { width: 32, height: 32, channels: 4 } })
    .png()
    .toFile(path.join(itemsDir, 'potion_health.png'));
  console.log('  ✓ potion_health.png (32x32) generated');

  const speedBuf = renderPotion([0, 180, 240], [100, 230, 255], [0, 100, 180], [200, 250, 255, 240]);
  await sharp(speedBuf, { raw: { width: 32, height: 32, channels: 4 } })
    .png()
    .toFile(path.join(itemsDir, 'potion_speed.png'));
  console.log('  ✓ potion_speed.png (32x32) generated');

  // 4.3 Coin Icon & Sheet
  const coinSrc = path.join(LEGACY_ROOT, '6-Icons/coin_4_frames.png');
  fs.copyFileSync(coinSrc, path.join(itemsDir, 'coin_anim.png'));

  // Extract first 32x32 frame as single icon
  await sharp(coinSrc)
    .extract({ left: 0, top: 0, width: 32, height: 32 })
    .png()
    .toFile(path.join(itemsDir, 'coin.png'));
  console.log('  ✓ coin.png (32x32) and coin_anim.png (128x32) created');
}

// ---------------------------------------------------------------------------
// 5. Quirk 4: Ghost Texture Downscaling
// ---------------------------------------------------------------------------
async function processGhostTextures() {
  console.log('[sanitize-assets] Downscaling ghost textures (eliminating 2.8MB VRAM waste)...');
  const enemyDir = path.join(TARGET_ROOT, 'images/characters/enemies');

  // GhostMove: 1406x1536 -> 234x256 (3x4 frames of 78x64)
  const ghostMoveSrc = path.join(LEGACY_ROOT, '2-Characters/5-Enemies/GhostMove.png');
  await sharp(ghostMoveSrc)
    .resize(234, 256, {
      kernel: sharp.kernel.lanczos3,
      fit: 'fill',
    })
    .png()
    .toFile(path.join(enemyDir, 'ghost_move.png'));
  console.log('  ✓ ghost_move.png downscaled: 1406x1536 -> 234x256 px');

  // GhostAttack: 1984x2168 -> 234x256 (3x4 frames of 78x64)
  const ghostAttackSrc = path.join(LEGACY_ROOT, '2-Characters/5-Enemies/GhostAttack.png');
  await sharp(ghostAttackSrc)
    .resize(234, 256, {
      kernel: sharp.kernel.lanczos3,
      fit: 'fill',
    })
    .png()
    .toFile(path.join(enemyDir, 'ghost_attack.png'));
  console.log('  ✓ ghost_attack.png downscaled: 1984x2168 -> 234x256 px');
}

// ---------------------------------------------------------------------------
// 6. Grass Tile Seam Padding (31x31 -> 32x32)
// ---------------------------------------------------------------------------
async function processGrassTile() {
  console.log('[sanitize-assets] Padding grass tile (31x31 -> 32x32) to prevent grid seams...');
  const srcTile = path.join(LEGACY_ROOT, '1-Background/2-Game/1-Forest/tile_1.png');
  const terrainDir = path.join(TARGET_ROOT, 'images/terrain');

  // Keep legacy 31x31
  fs.copyFileSync(srcTile, path.join(terrainDir, 'grass_legacy.png'));

  // Create 32x32 seamless tile by edge-clamping row 30 & col 30 to row 31 & col 31
  const img = sharp(srcTile);
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });

  const buf32 = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++) {
    const srcY = Math.min(y, 30);
    for (let x = 0; x < 32; x++) {
      const srcX = Math.min(x, 30);
      const srcIdx = (srcY * 31 + srcX) * 4;
      const dstIdx = (y * 32 + x) * 4;
      for (let c = 0; c < 4; c++) {
        buf32[dstIdx + c] = data[srcIdx + c];
      }
    }
  }

  await sharp(buf32, { raw: { width: 32, height: 32, channels: 4 } })
    .png()
    .toFile(path.join(terrainDir, 'grass.png'));
  console.log('  ✓ grass.png padded to 32x32 seamless grid tile');
}

// ---------------------------------------------------------------------------
// 7. Quirk 5: Audio & Remaining Asset Copying
// ---------------------------------------------------------------------------
async function copyRemainingAssets() {
  console.log('[sanitize-assets] Copying audio, fonts, objects, and characters...');

  // Audio
  const musicSrc = path.join(LEGACY_ROOT, '8-Music');
  const sfxSrc = path.join(LEGACY_ROOT, '9-Sounds');
  fs.copyFileSync(path.join(musicSrc, 'game_music.wav'), path.join(TARGET_ROOT, 'audio/music/game_music.wav'));
  fs.copyFileSync(path.join(musicSrc, 'menu_music.wav'), path.join(TARGET_ROOT, 'audio/music/menu_music.wav'));
  fs.copyFileSync(path.join(sfxSrc, 'Button_Press.mp3'), path.join(TARGET_ROOT, 'audio/sfx/button_press.mp3'));
  fs.copyFileSync(path.join(sfxSrc, 'Button_Press.mp3'), path.join(TARGET_ROOT, 'audio/sfx/button_press.wav'));

  // Fonts & GUI
  fs.copyFileSync(path.join(LEGACY_ROOT, '3-GUI/font.ttf'), path.join(TARGET_ROOT, 'fonts/pixel_font.ttf'));
  fs.copyFileSync(path.join(LEGACY_ROOT, '3-GUI/Button_BG.png'), path.join(TARGET_ROOT, 'images/ui/button_bg.png'));
  fs.copyFileSync(path.join(LEGACY_ROOT, '3-GUI/Heart.png'), path.join(TARGET_ROOT, 'images/ui/heart.png'));
  fs.copyFileSync(path.join(LEGACY_ROOT, '6-Icons/forest-rpg-icon.svg'), path.join(TARGET_ROOT, 'images/ui/icon.svg'));

  // Backgrounds & Video
  fs.copyFileSync(path.join(LEGACY_ROOT, '1-Background/1-Menu/Background.png'), path.join(TARGET_ROOT, 'images/background/menu_bg.png'));
  fs.copyFileSync(path.join(LEGACY_ROOT, '1-Background/1-Menu/Settings_Background.png'), path.join(TARGET_ROOT, 'images/background/settings_bg.png'));
  const videoSrc = path.join(LEGACY_ROOT, '1-Background/1-Menu/Menu_Vid.mp4');
  if (fs.existsSync(videoSrc)) {
    fs.copyFileSync(videoSrc, path.join(TARGET_ROOT, 'video/menu_vid.mp4'));
  }

  // Terrain
  fs.copyFileSync(path.join(LEGACY_ROOT, '1-Background/2-Game/1-Forest/water_1.png'), path.join(TARGET_ROOT, 'images/terrain/water.png'));
  fs.copyFileSync(path.join(LEGACY_ROOT, '1-Background/2-Game/1-Forest/tree_1.png'), path.join(TARGET_ROOT, 'images/terrain/tree.png'));
  fs.copyFileSync(path.join(LEGACY_ROOT, '1-Background/2-Game/1-Forest/bridge_1.png'), path.join(TARGET_ROOT, 'images/terrain/bridge_hd.png'));
  // Downscale bridge to 64x64 plank tile
  await sharp(path.join(LEGACY_ROOT, '1-Background/2-Game/1-Forest/bridge_1.png'))
    .resize(64, 64)
    .png()
    .toFile(path.join(TARGET_ROOT, 'images/terrain/bridge.png'));

  // Characters - Player Idle, Walk, Run, Jump
  const dirs = ['east', 'north', 'northeast', 'northwest', 'south', 'southeast', 'southwest', 'west'];
  for (const d of dirs) {
    fs.copyFileSync(
      path.join(LEGACY_ROOT, `2-Characters/1-Idle/idle_sheet_${d}.png`),
      path.join(TARGET_ROOT, `images/characters/player/idle/idle_${d}.png`)
    );
    fs.copyFileSync(
      path.join(LEGACY_ROOT, `2-Characters/2-Walking/walk_sheet_${d}.png`),
      path.join(TARGET_ROOT, `images/characters/player/walk/walk_${d}.png`)
    );
    fs.copyFileSync(
      path.join(LEGACY_ROOT, `2-Characters/4-Jumping/jump_sheet_${d}.png`),
      path.join(TARGET_ROOT, `images/characters/player/jump/jump_${d}.png`)
    );
  }

  // Running sheets (normalize legacy inconsistent underscores)
  const runMaps = [
    { src: 'run_sheet_east.png', dst: 'run_east.png' },
    { src: 'run_sheet_north.png', dst: 'run_north.png' },
    { src: 'run_sheet_north_east.png', dst: 'run_northeast.png' },
    { src: 'run_sheet_north_west.png', dst: 'run_northwest.png' },
    { src: 'run_sheet_south.png', dst: 'run_south.png' },
    { src: 'run_sheet_south_east.png', dst: 'run_southeast.png' },
    { src: 'run_sheet_south_west.png', dst: 'run_southwest.png' },
    { src: 'run_sheet_west.png', dst: 'run_west.png' },
  ];
  for (const r of runMaps) {
    fs.copyFileSync(
      path.join(LEGACY_ROOT, '2-Characters/3-Running', r.src),
      path.join(TARGET_ROOT, 'images/characters/player/run', r.dst)
    );
  }

  // Enemies
  const enemyCopies = [
    { src: 'MantisMove.png', dst: 'mantis_move.png' },
    { src: 'MantisAttack.png', dst: 'mantis_attack.png' },
    { src: 'BeetleMove.png', dst: 'beetle_move.png' },
    { src: 'BeetleAttack.png', dst: 'beetle_attack.png' },
    { src: 'MaggotWalk.png', dst: 'maggot_walk.png' },
    { src: 'MaggotSpit.png', dst: 'maggot_spit.png' },
    { src: 'AcidBlob.png', dst: 'acid_blob.png' },
    { src: 'AcidSplat.png', dst: 'acid_splat.png' },
    { src: 'EggCluster.png', dst: 'egg_cluster.png' },
    { src: 'Eggsplosion.png', dst: 'eggsplosion.png' },
  ];
  for (const e of enemyCopies) {
    fs.copyFileSync(
      path.join(LEGACY_ROOT, '2-Characters/5-Enemies', e.src),
      path.join(TARGET_ROOT, 'images/characters/enemies', e.dst)
    );
  }

  // Objects & Decor
  for (let i = 1; i <= 4; i++) {
    fs.copyFileSync(
      path.join(LEGACY_ROOT, `5-Objects/cloud_${i}.png`),
      path.join(TARGET_ROOT, `images/objects/clouds/cloud_${i}.png`)
    );
  }
  fs.copyFileSync(
    path.join(LEGACY_ROOT, '5-Objects/2-Portal/portal_active_sheet.png'),
    path.join(TARGET_ROOT, 'images/objects/portal_active.png')
  );
  fs.copyFileSync(
    path.join(LEGACY_ROOT, '5-Objects/2-Portal/portal_inactive_sheet.png'),
    path.join(TARGET_ROOT, 'images/objects/portal_inactive.png')
  );

  const decorMaps = [
    { src: 'bush_small_1.png', dst: 'bush_small.png' },
    { src: 'bush_upward_1.png', dst: 'bush_obstacle.png' },
    { src: 'flower_more_1.png', dst: 'flower_clump.png' },
    { src: 'flower_pink_1.png', dst: 'flower_pink.png' },
    { src: 'flower_yellow.png', dst: 'flower_yellow.png' },
    { src: 'hole_1.png', dst: 'hole.png' },
    { src: 'log_horizontal_1.png', dst: 'log_horizontal.png' },
    { src: 'log_upward_1.png', dst: 'log_stump.png' },
    { src: 'log_vertically_1.png', dst: 'log_vertical.png' },
    { src: 'rock_small_1.png', dst: 'rock_pebble.png' },
    { src: 'rock_upward_1.png', dst: 'rock_boulder.png' },
  ];
  for (const d of decorMaps) {
    fs.copyFileSync(
      path.join(LEGACY_ROOT, '5-Objects/1-More', d.src),
      path.join(TARGET_ROOT, 'images/objects/decor', d.dst)
    );
  }

  console.log('  ✓ Audio, GUI, background, and character assets migrated');
}

// ---------------------------------------------------------------------------
// 8. Generate PixiJS 8 Asset Manifest
// ---------------------------------------------------------------------------
function generateManifest() {
  console.log('[sanitize-assets] Generating PixiJS 8 Asset Manifest...');
  const manifest = {
    bundles: [
      {
        name: 'boot',
        assets: [
          { alias: 'font_pixel', src: 'assets/fonts/pixel_font.ttf' },
          { alias: 'ui_button_bg', src: 'assets/images/ui/button_bg.png' },
          { alias: 'ui_heart', src: 'assets/images/ui/heart.png' },
          { alias: 'bg_menu', src: 'assets/images/background/menu_bg.png' },
          { alias: 'bg_settings', src: 'assets/images/background/settings_bg.png' },
          { alias: 'sfx_button', src: 'assets/audio/sfx/button_press.mp3' },
          { alias: 'music_menu', src: 'assets/audio/music/menu_music.wav' },
        ],
      },
      {
        name: 'world',
        assets: [
          { alias: 'tile_grass', src: 'assets/images/terrain/grass.png' },
          { alias: 'tile_water', src: 'assets/images/terrain/water.png' },
          { alias: 'tile_tree', src: 'assets/images/terrain/tree.png' },
          { alias: 'tile_bridge', src: 'assets/images/terrain/bridge.png' },
          { alias: 'hill_e', src: 'assets/images/terrain/hills/hill_east.png' },
          { alias: 'hill_n', src: 'assets/images/terrain/hills/hill_north.png' },
          { alias: 'hill_ne', src: 'assets/images/terrain/hills/hill_northeast.png' },
          { alias: 'hill_nw', src: 'assets/images/terrain/hills/hill_northwest.png' },
          { alias: 'hill_s', src: 'assets/images/terrain/hills/hill_south.png' },
          { alias: 'hill_se', src: 'assets/images/terrain/hills/hill_southeast.png' },
          { alias: 'hill_sw', src: 'assets/images/terrain/hills/hill_southwest.png' },
          { alias: 'hill_w', src: 'assets/images/terrain/hills/hill_west.png' },
          { alias: 'music_game', src: 'assets/audio/music/game_music.wav' },
        ],
      },
      {
        name: 'entities',
        assets: [
          { alias: 'enemy_mantis_move', src: 'assets/images/characters/enemies/mantis_move.png' },
          { alias: 'enemy_mantis_attack', src: 'assets/images/characters/enemies/mantis_attack.png' },
          { alias: 'enemy_beetle_move', src: 'assets/images/characters/enemies/beetle_move.png' },
          { alias: 'enemy_beetle_attack', src: 'assets/images/characters/enemies/beetle_attack.png' },
          { alias: 'enemy_maggot_walk', src: 'assets/images/characters/enemies/maggot_walk.png' },
          { alias: 'enemy_maggot_spit', src: 'assets/images/characters/enemies/maggot_spit.png' },
          { alias: 'enemy_ghost_move', src: 'assets/images/characters/enemies/ghost_move.png' },
          { alias: 'enemy_ghost_attack', src: 'assets/images/characters/enemies/ghost_attack.png' },
          { alias: 'projectile_acid_blob', src: 'assets/images/characters/enemies/acid_blob.png' },
          { alias: 'vfx_acid_splat', src: 'assets/images/characters/enemies/acid_splat.png' },
          { alias: 'vfx_eggsplosion', src: 'assets/images/characters/enemies/eggsplosion.png' },
          { alias: 'item_chest', src: 'assets/images/items/chest.png' },
          { alias: 'item_potion_health', src: 'assets/images/items/potion_health.png' },
          { alias: 'item_potion_speed', src: 'assets/images/items/potion_speed.png' },
          { alias: 'item_coin', src: 'assets/images/items/coin.png' },
          { alias: 'item_coin_anim', src: 'assets/images/items/coin_anim.png' },
          { alias: 'portal_active', src: 'assets/images/objects/portal_active.png' },
          { alias: 'portal_inactive', src: 'assets/images/objects/portal_inactive.png' },
        ],
      },
    ],
  };

  const manifestPath = path.join(TARGET_ROOT, 'manifests/asset_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`  ✓ asset_manifest.json written to ${manifestPath}`);
}

// ---------------------------------------------------------------------------
// Main Pipeline Execution
// ---------------------------------------------------------------------------
async function main() {
  console.log('====================================================');
  console.log('Forest RPG V2 — Asset Sanitization & Migration Pipeline');
  console.log('====================================================');

  if (!fs.existsSync(LEGACY_ROOT)) {
    console.error(`[sanitize-assets] FATAL: Legacy directory not found: ${LEGACY_ROOT}`);
    process.exit(1);
  }

  ensureDirectories();
  await sanitizeHills();
  await processAttackAnimations();
  await generateItemSprites();
  await processGhostTextures();
  await processGrassTile();
  await copyRemainingAssets();
  generateManifest();

  console.log('====================================================');
  console.log('Asset Sanitization and Migration Successfully Completed!');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('[sanitize-assets] FATAL ERROR during pipeline execution:', err);
  process.exit(1);
});
