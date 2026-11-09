import type { Direction } from '../types/entities';

/** Production sheet names shared by animation definitions and asset registration. */
export const PLAYER_SHEET_ANIMS = [
  'idle',
  'walk',
  'run',
  'jump',
  'attack',
  'attack2',
  'attack3',
] as const;
export type PlayerSheetAnim = (typeof PLAYER_SHEET_ANIMS)[number];

export const DIRECTIONS: readonly Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const DIRECTION_FILE_SUFFIX: Readonly<Record<Direction, string>> = {
  N: 'north',
  NE: 'northeast',
  E: 'east',
  SE: 'southeast',
  S: 'south',
  SW: 'southwest',
  W: 'west',
  NW: 'northwest',
};

export function playerSheetAlias(anim: PlayerSheetAnim, dir: Direction): string {
  return `player_${anim}_${DIRECTION_FILE_SUFFIX[dir]}`;
}
