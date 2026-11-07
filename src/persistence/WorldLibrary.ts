import type { Difficulty } from '../types/world';

/** Stable player-facing identity, independent of streamed save lineages. */
export interface WorldLibraryEntry {
  id: string;
  name: string;
  createdAt: number;
  lastPlayedAt: number;
  seed: number;
  difficulty: Difficulty;
  level: number;
  kind: 'streamed' | 'finite';
}
export function worldName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 64) throw new Error('Enter a world name between 1 and 64 characters.');
  return name;
}
export function worldSeed(value: string): number | undefined {
  if (!value.trim()) return undefined;
  if (!/^\d+$/.test(value.trim()) || Number(value) > 0xffffffff)
    throw new Error('Seed must be a whole number from 0 to 4294967295.');
  return Number(value);
}
export const libraryId = () => crypto.randomUUID().replaceAll('-', '');
