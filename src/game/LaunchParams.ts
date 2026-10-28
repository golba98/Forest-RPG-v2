import type { Difficulty } from '../types/world';

export interface LaunchParams {
  /** Explicit world seed (`?seed=`); otherwise a random seed is chosen per world. */
  readonly seed: number | null;
  /** `?tutorial=1` forces the Training Glade, `0` skips it, null = default flow. */
  readonly tutorial: boolean | null;
  readonly difficulty: Difficulty | null;
  /** Enables `window.__GAME__` and cheat terminal commands. */
  readonly debug: boolean;
  /** Skip the main menu and start playing immediately (`?autostart=1`). */
  readonly autostart: boolean;
}

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export function parseLaunchParams(search: string, isDev: boolean): LaunchParams {
  const params = new URLSearchParams(search);

  const seedRaw = params.get('seed');
  const seedNum = seedRaw === null ? NaN : Number(seedRaw);
  const seed = Number.isInteger(seedNum) ? seedNum >>> 0 : null;

  const tutorialRaw = params.get('tutorial');
  const tutorial = tutorialRaw === null ? null : tutorialRaw === '1' || tutorialRaw === 'true';

  const difficultyRaw = params.get('difficulty');
  const difficulty = DIFFICULTIES.find((d) => d === difficultyRaw) ?? null;

  const flag = (name: string) => {
    const v = params.get(name);
    return v === '1' || v === 'true';
  };

  return {
    seed,
    tutorial,
    difficulty,
    debug: isDev || flag('debug'),
    autostart: flag('autostart'),
  };
}

/** Random 32-bit seed for a fresh world. World generation itself stays deterministic. */
export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
