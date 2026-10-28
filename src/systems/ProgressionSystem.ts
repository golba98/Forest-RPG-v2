import { GAME_CONFIG as C } from '../config/GameConfig';
import type { PlayerStats } from '../types/entities';
export function awardXp(stats: PlayerStats, amount: number): void {
  stats.xp += Math.max(0, amount);
  while (stats.xp >= stats.xpToNextLevel) {
    stats.xp -= stats.xpToNextLevel; stats.level++; stats.statPoints++;
    stats.xpToNextLevel = Math.floor(C.progression.baseXpToNextLevel * C.progression.xpGrowth ** (stats.level - 1));
  }
}
