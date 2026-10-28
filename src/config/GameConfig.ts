/**
 * Central, read-only balance and engine configuration.
 *
 * Values are ported from the original game (see docs/original-game-audit.md).
 * Legacy per-frame rates are converted to per-second at the legacy 60 FPS.
 * Units: distances in tiles, times in ms unless suffixed otherwise.
 */
export const GAME_CONFIG = {
  world: {
    width: 150,
    height: 150,
    /** Logical pixels per tile (legacy cellSize). */
    tileSize: 32,
    tutorialWidth: 20,
    tutorialHeight: 20,
    coinsPerLevel: 20,
    enemiesByDifficulty: { easy: 6, normal: 12, hard: 24 },
    bridges: {
      minSpan: 1,
      maxSpan: 6,
      minSpacing: 16,
      tilesPerBridge: 4500,
      maxCount: 8,
      approachLength: 2,
      approachBuffer: 1,
    },
  },

  dayNight: {
    cycleSec: 480,
    /** New haunted encounters and night visuals: timeOfDay < nightEnd || timeOfDay >= nightStart. */
    nightStart: 0.9,
    nightEnd: 0.2,
    torchRadiusDayPx: 520,
    torchRadiusNightPx: 230,
    starCount: 500,
  },

  player: {
    halfSize: 0.3,
    /**
     * Continuous-movement speeds (tiles/s) derived from the legacy tile-step
     * cadence: one tile per BASE_MOVE_COOLDOWN 160 ms (walk) and
     * SPRINT_MOVE_COOLDOWN 150 ms with a shorter 75 ms step (sprint).
     * Tuned values are documented in docs/gameplay-systems.md.
     */
    walkSpeed: 6.25,
    sprintSpeed: 8.5,
    baseHealth: 7,
    maxHealthCap: 20,
    baseMana: 100,
    baseStamina: 100,
    baseDamage: 1,
    /** Legacy SPRINT_MAX_DURATION_MS 3000 → drains a full bar in 3 s. */
    sprintDrainPerSec: 100 / 3,
    /** Legacy SPRINT_REGEN_PER_FRAME 0.2 @ 60 FPS. */
    staminaRegenPerSec: 12,
    sprintLockoutMs: 4000,
    /** Legacy 0.05 mana/frame @ 60 FPS. */
    manaRegenPerSec: 3,
    healthRegenDelayMs: 6000,
    healthRegenIntervalMs: 4000,
    attackStaminaCost: 12,
    jumpDurationMs: 500,
    jumpPeakTiles: 1.5,
    /** Horizontal speed while airborne, as a fraction of ground speed (walk-jump ≈ 1.9 tiles). */
    jumpAirSpeedFactor: 0.6,
    /** Airborne speed cap (tiles/s) so sprint, dash and potions cannot stretch a jump past ≈ 2.1 tiles. */
    jumpMaxAirSpeed: 4.2,
    dashDurationMs: 200,
    dashCooldownMs: 1000,
    speedPotionDurationMs: 8000,
    healthPotionHeal: 2,
  },

  progression: {
    baseXpToNextLevel: 100,
    xpGrowth: 1.5,
    statHealth: 1,
    statDamage: 1,
    statMana: 25,
    statStamina: 20,
  },

  combat: {
    comboWindowMs: 800,
    critMultiplier: 1.5,
    critBonus: 1,
    enemyKnockbackTiles: 0.6,
    attackRangeTiles: 1.8,
    autoHitRadiusTiles: 0.7,
    angleToleranceRad: 1.2,
    bossAttackRangeTiles: 3.0,
    bossAutoHitRadiusTiles: 2.0,
    bossAngleToleranceRad: 2.5,
    spin: { manaCost: 30, radiusTiles: 3.5, damageMultiplier: 2, knockbackTiles: 1.5 },
    bolt: { manaCost: 20, speedTilesPerSec: 15, lifetimeMs: 1000, hitRadiusTiles: 0.8 },
    lootDropChance: 0.4,
    lootHealthShare: 0.6,
    flowerCoinChance: 0.1,
    flowerPotionChance: 0.15,
    shakeNormal: { magnitude: 1.5, durationMs: 110 },
    shakeCritical: { magnitude: 2.5, durationMs: 110 },
  },

  camera: {
    followLerp: 0.12,
  },
} as const;

export type GameConfig = typeof GAME_CONFIG;
