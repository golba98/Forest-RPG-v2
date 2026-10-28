/**
 * Authentic Legacy Map and Settings Fixtures for Forest RPG V2
 * Based on `/home/k9-vortex/Development/1-JavaScript/3-Game Development/maps/active_map.json`
 * and authoritative specifications in `legacy_game_spec.md`.
 */

import { LegacyActiveMapPayload, LegacySettingsPayload } from './types';

export const LEGACY_TILE_TYPES = {
  GRASS: 1,
  FOREST: 2,
  MOB: 3,
  CLIFF: 6,
  RAMP: 7,
  LOG: 8,
  FLOWERS: 9,
  CAVE: 10,
  RIVER: 11,
  BORDER: 12,
  HILL_NORTH: 13,
  HILL_NORTHEAST: 14,
  HILL_EAST: 15,
  HILL_SOUTHEAST: 16,
  HILL_SOUTH: 17,
  HILL_SOUTHWEST: 18,
  HILL_WEST: 19,
  HILL_NORTHWEST: 20,
  CHEST: 100,
  HEALTH: 101,
  POWERUP: 102,
  COIN: 103,
} as const;

/**
 * Authentic 8x8 minimal active_map payload directly from legacy map_server.
 */
export const MINIMAL_LEGACY_MAP_8X8: LegacyActiveMapPayload = {
  persistentGameId: 'server_default_1765159366471',
  timestamp: 1765159366471,
  logicalW: 8,
  logicalH: 8,
  cellSize: 32,
  mapStates: Array(64).fill(1),
  terrainLayer: Array(64).fill(1),
  treeObjects: [],
  playerPosition: { x: 4, y: 4 },
  portalPos: { x: 6, y: 6 },
  isPortalActive: false,
  enemies: [],
};

/**
 * Creates an authentic 150x150 legacy save payload (22,500 tiles)
 * containing genuine legacy entity distribution, rivers, bridges, and coins.
 */
export function createStandardLegacyMap150x150(): LegacyActiveMapPayload {
  const totalTiles = 150 * 150;
  const mapStates = new Array<number>(totalTiles).fill(LEGACY_TILE_TYPES.GRASS);
  const terrainLayer = new Array<number>(totalTiles).fill(LEGACY_TILE_TYPES.GRASS);

  // Border barriers
  for (let x = 0; x < 150; x++) {
    mapStates[0 * 150 + x] = LEGACY_TILE_TYPES.BORDER;
    mapStates[149 * 150 + x] = LEGACY_TILE_TYPES.BORDER;
  }
  for (let y = 0; y < 150; y++) {
    mapStates[y * 150 + 0] = LEGACY_TILE_TYPES.BORDER;
    mapStates[y * 150 + 149] = LEGACY_TILE_TYPES.BORDER;
  }

  // River drunk walk simulation across column 70-74
  for (let y = 0; y < 150; y++) {
    const riverX = 72 + Math.floor(Math.sin(y / 10) * 3);
    for (let dx = -1; dx <= 1; dx++) {
      const idx = y * 150 + (riverX + dx);
      if (idx >= 0 && idx < totalTiles) {
        mapStates[idx] = LEGACY_TILE_TYPES.RIVER;
      }
    }
  }

  // Bridges (RAMP) over river at y = 50 and y = 100
  for (let dx = -2; dx <= 2; dx++) {
    mapStates[50 * 150 + (72 + dx)] = LEGACY_TILE_TYPES.RAMP;
    mapStates[100 * 150 + (72 + dx)] = LEGACY_TILE_TYPES.RAMP;
  }

  // Flowers and Coins
  for (let i = 1; i <= 20; i++) {
    const coinIdx = (20 + i * 5) * 150 + (30 + (i % 10) * 4);
    mapStates[coinIdx] = LEGACY_TILE_TYPES.COIN;
  }

  // Tree objects
  const treeObjects: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 50; i++) {
    const tx = 10 + (i * 7) % 130;
    const ty = 15 + (i * 11) % 120;
    if (tx !== 75 || ty !== 75) {
      treeObjects.push({ x: tx, y: ty });
      mapStates[ty * 150 + tx] = LEGACY_TILE_TYPES.FOREST;
    }
  }

  return {
    persistentGameId: 'legacy_session_standard_1765159366471',
    timestamp: 1788878021375,
    logicalW: 150,
    logicalH: 150,
    cellSize: 32,
    mapStates,
    terrainLayer,
    treeObjects,
    decorativeObjects: [
      { id: 'bush_1', type: 'walkable', tileX: 12, tileY: 14 },
      { id: 'flower_1', type: 'walkable', tileX: 20, tileY: 25 },
    ],
    playerPosition: { x: 75, y: 75 },
    portalPos: { x: 78, y: 78 },
    isPortalActive: false,
    enemies: [
      {
        type: 'mantis',
        x: 118,
        y: 60,
        health: 3,
        maxHealth: 3,
        direction: 'S',
      },
      {
        type: 'maggot',
        x: 83,
        y: 89,
        health: 2,
        maxHealth: 2,
        direction: 'S',
      },
      {
        type: 'beetle',
        x: 87,
        y: 88,
        health: 15,
        maxHealth: 15,
        direction: 'S',
      },
    ],
  };
}

/**
 * Authentic legacy settings payload from `legacy_game_spec.md`.
 */
export const LEGACY_SETTINGS_DEFAULT: LegacySettingsPayload = {
  v: 1,
  masterVol: 0.8,
  musicVol: 0.6,
  sfxVol: 0.7,
  textSizeSetting: 75,
  uiScale: 75,
  difficulty: 'normal',
  fpsMode: '60',
  targetFps: 60,
  performanceOverlay: false,
  performanceOverlayEnabled: false,
  sensitivitySetting: 5,
  invertYAxis: false,
  hudEnabled: true,
  showHUD: true,
  showTutorialsSetting: true,
  showTutorials: true,
  colorModeSetting: 'None',
  languageSetting: 'English',
  showStars: true,
  screenShakeEnabled: true,
  showParticles: true,
  showFireflyLighting: true,
};

/**
 * Malformed or boundary legacy save payloads to test corruption recovery.
 */
export const CORRUPTED_LEGACY_PAYLOADS = {
  truncatedArray: {
    persistentGameId: 'corrupt_truncated_test',
    timestamp: Date.now(),
    logicalW: 150,
    logicalH: 150,
    cellSize: 32,
    mapStates: [1, 2, 3], // Length 3 instead of 22500
    terrainLayer: [1, 2, 3],
    treeObjects: [],
  },
  negativeDimensions: {
    persistentGameId: 'corrupt_negative_test',
    timestamp: Date.now(),
    logicalW: -10,
    logicalH: 150,
    cellSize: 32,
    mapStates: Array(1500).fill(1),
    terrainLayer: Array(1500).fill(1),
    treeObjects: [],
  },
  invalidTileIds: {
    persistentGameId: 'corrupt_invalid_tiles',
    timestamp: Date.now(),
    logicalW: 8,
    logicalH: 8,
    cellSize: 32,
    mapStates: Array(64).fill(99999), // Invalid tile IDs
    terrainLayer: Array(64).fill(1),
    treeObjects: [],
  },
  missingRequiredKeys: {
    // Missing persistentGameId, logicalW, mapStates
    timestamp: Date.now(),
    someRandomKey: 'garbage',
  },
  malformedJsonString: '{"persistentGameId": "broken_json", "logicalW": 150, "mapStates": [1, 2, 3',
};
