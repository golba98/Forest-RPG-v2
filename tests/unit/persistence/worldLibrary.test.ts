import { describe, expect, it } from 'vitest';
import { worldName, worldSeed } from '../../../src/persistence/WorldLibrary';
describe('world creation input', () => {
  it('accepts random seeds and the complete unsigned seed range', () => {
    expect(worldSeed(' ')).toBeUndefined();
    expect(worldSeed('0')).toBe(0);
    expect(worldSeed('4294967295')).toBe(4294967295);
    for (const input of ['-1', '1.5', '4294967296', 'seed', 'Infinity'])
      expect(() => worldSeed(input)).toThrow();
  });
  it('normalizes names and rejects empty or excessive names', () => {
    expect(worldName('  Home  ')).toBe('Home');
    expect(() => worldName(' ')).toThrow();
    expect(() => worldName('x'.repeat(65))).toThrow();
  });
});

import { InfiniteSession, infiniteDescriptor } from '../../../src/world/infinite/InfiniteSession';
import { WorldRepository } from '../../../src/persistence/WorldRepository';
it('pins autosaves to each session and carries library identity to subsequent levels', () => {
  const previous = WorldRepository.libraryContext;
  const entry = {
    id: 'a'.repeat(32),
    name: 'Home',
    createdAt: 1,
    lastPlayedAt: 1,
    seed: 42,
    difficulty: 'hard' as const,
    level: 1,
    kind: 'streamed' as const,
  };
  const sessions: InfiniteSession[] = [];
  try {
    WorldRepository.libraryContext = entry;
    const first = new InfiniteSession(
      infiniteDescriptor({ seed: 42, level: 1, difficulty: 'hard' }),
      new WorldRepository({} as IDBFactory),
    );
    sessions.push(first);
    const next = new InfiniteSession(
      infiniteDescriptor({ seed: 123, level: 2, difficulty: 'hard' }),
      new WorldRepository({} as IDBFactory),
    );
    sessions.push(next);
    WorldRepository.libraryContext = undefined;
    const preview = new InfiniteSession(
      infiniteDescriptor({ seed: 42, level: 1, difficulty: 'normal', mode: 'biome-walk' }),
      new WorldRepository({} as IDBFactory),
    );
    sessions.push(preview);
    expect(first.saveSlot()).toBe(entry.id);
    expect(next.saveSlot()).toBe(entry.id);
    expect(preview.saveSlot()).toBe('biome-walk');
    expect(first.saveSlot('manual')).toBe('manual');
  } finally {
    sessions.forEach((s) => s.dispose());
    WorldRepository.libraryContext = previous;
  }
});
