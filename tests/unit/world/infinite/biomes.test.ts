import { it, expect } from 'vitest';
import { BiomeRegistry, biomes, climateAt } from '../../../../src/world/infinite/biomes';
it('pins established biome versions when a new expansion policy becomes available', () => {
  const registry = new BiomeRegistry(),
    forest = biomes.get('forest', 1);
  registry.register(forest);
  const established = registry.selectRegion(42, -4, 3, [{ id: 'forest', version: 1 }]);
  registry.register({ ...forest, id: 'test-only-biome' });
  expect(
    registry.selectRegion(
      42,
      -4,
      3,
      [
        { id: 'test-only-biome', version: 1 },
        { id: 'forest', version: 1 },
      ],
      { biome: established.id, biomeVersion: established.version },
    ),
  ).toBe(established);
  expect(registry.selectRegion(42, -4, 3, [{ id: 'forest', version: 1 }]).id).toBe('forest');
  expect(Object.isFrozen(established.terrain)).toBe(true);
  expect(climateAt(42, -100, 200)).toEqual(climateAt(42, -100, 200));
  expect(() => registry.register(forest)).toThrow('Duplicate');
});
