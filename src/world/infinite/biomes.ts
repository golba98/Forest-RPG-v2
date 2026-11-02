import type { TileId } from '../../types/tiles';
import { Tile } from '../../types/tiles';
import type { PropKind } from '../../types/world';
import { valueNoise } from './coordinates';

export interface BiomeDefinition {
  readonly id: string;
  readonly version: number;
  readonly palette: readonly PropKind[];
  readonly terrain: {
    readonly ground: TileId;
    readonly flowers: TileId;
    readonly hillThreshold: number;
    readonly riverThreshold: number;
  };
  readonly objects: {
    readonly treeBaseDensity: number;
    readonly treeVariation: number;
    readonly decorationFrequency: number;
    readonly hillRockFrequency: number;
  };
  readonly features: readonly ('rivers' | 'hills' | 'bridges' | 'paths')[];
  readonly encounters: readonly ('mantis' | 'maggot' | 'nest' | 'grove')[];
  readonly effects: readonly ('rain' | 'leaves' | 'fireflies')[];
  readonly transitionWidth: number;
  readonly climate?: {
    readonly temperature: readonly [number, number];
    readonly moisture: readonly [number, number];
  };
}
export class BiomeRegistry {
  private readonly entries = new Map<string, BiomeDefinition>();
  register(biome: BiomeDefinition): void {
    const key = `${biome.id}:${biome.version}`;
    if (this.entries.has(key)) throw new Error(`Duplicate biome ${key}`);
    this.entries.set(
      key,
      Object.freeze({
        ...biome,
        terrain: Object.freeze({ ...biome.terrain }),
        objects: Object.freeze({ ...biome.objects }),
        palette: Object.freeze([...biome.palette]),
        features: Object.freeze([...biome.features]),
        encounters: Object.freeze([...biome.encounters]),
        effects: Object.freeze([...biome.effects]),
      }),
    );
  }
  get(id: string, version: number): BiomeDefinition {
    const biome = this.entries.get(`${id}:${version}`);
    if (!biome) throw new Error(`Unsupported biome ${id}:${version}`);
    return biome;
  }
  /** An explicit expansion policy supplies allowed versions; registering a biome alone never changes worlds. */
  selectRegion(
    seed: number,
    x: number,
    y: number,
    allowed: readonly { id: string; version: number }[],
    pinned?: { biome: string; biomeVersion: number },
  ): BiomeDefinition {
    if (pinned) return this.get(pinned.biome, pinned.biomeVersion);
    const climate = climateAt(seed, x * 256 + 128, y * 256 + 128);
    for (const choice of allowed) {
      const biome = this.get(choice.id, choice.version),
        range = biome.climate;
      if (
        !range ||
        (climate.temperature >= range.temperature[0] &&
          climate.temperature <= range.temperature[1] &&
          climate.moisture >= range.moisture[0] &&
          climate.moisture <= range.moisture[1])
      )
        return biome;
    }
    throw new Error('Biome policy has no matching biome');
  }
}
export const biomes = new BiomeRegistry();
biomes.register({
  id: 'forest',
  version: 1,
  terrain: {
    ground: Tile.GRASS,
    flowers: Tile.FLOWERS,
    hillThreshold: 0.69,
    riverThreshold: 0.018,
  },
  objects: {
    treeBaseDensity: 0.025,
    treeVariation: 0.23,
    decorationFrequency: 53,
    hillRockFrequency: 97,
  },
  palette: [
    'tree',
    'bush_small',
    'flower_pink',
    'flower_yellow',
    'rock_boulder',
    'rock_pebble',
    'log_stump',
  ],
  features: ['rivers', 'hills', 'bridges', 'paths'],
  encounters: ['mantis', 'maggot', 'nest', 'grove'],
  effects: ['rain', 'leaves', 'fireflies'],
  transitionWidth: 16,
});
/** Climate is stable and independent of the installed registry; only Forest is selectable in v1. */
export function climateAt(seed: number, x: number, y: number) {
  return {
    temperature: valueNoise(seed, x / 1024, y / 1024, 'temperature'),
    moisture: valueNoise(seed, x / 1024, y / 1024, 'moisture'),
  };
}
