import { expect, it, vi } from 'vitest';
import { ResidencyCache } from '../../../src/rendering/ResidencyCache';

const bounds = { x: 0, y: 0, width: 512, height: 512 };
const distant = { ...bounds, x: 5000 };

it('retains recent resources, applies spatial/time hysteresis and disposes exactly once', () => {
  const dispose = vi.fn();
  const cache = new ResidencyCache<string>(dispose);
  cache.set('a', 'a', bounds, 100, 0);
  cache.prune(new Set(), distant, 4999, 1000);
  expect(cache.entries.has('a')).toBe(true);
  cache.prune(new Set(), bounds, 6000, 1000);
  expect(cache.entries.has('a')).toBe(true);
  cache.prune(new Set(), distant, 6000, 1000);
  expect(cache.bytes).toBe(0);
  expect(dispose).toHaveBeenCalledExactlyOnceWith('a');
  cache.clear();
  expect(dispose).toHaveBeenCalledTimes(1);
});

it('evicts least recently used resources under pressure without evicting mandatory content', () => {
  const dispose = vi.fn();
  const cache = new ResidencyCache<string>(dispose);
  cache.set('old', 'old', bounds, 100, 0);
  cache.set('recent', 'recent', bounds, 100, 10);
  cache.set('required', 'required', bounds, 100, 0);
  cache.prune(new Set(['required']), bounds, 20, 200);
  expect([...cache.entries.keys()]).toEqual(['recent', 'required']);
  cache.prune(new Set(['required']), bounds, 30, 50);
  expect([...cache.entries.keys()]).toEqual(['required']);
  cache.clear();
  expect(dispose).toHaveBeenCalledTimes(3);
});
