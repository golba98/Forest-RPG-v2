import { bridgeFixture } from './bridge-world';
import { Tile } from '../../src/types/tiles';
import type { WorldData } from '../../src/types/world';
export function streamingSurfaceFixture(vertical: boolean): WorldData {
  const { world } = bridgeFixture(vertical ? 'vertical' : 'horizontal', 7);
  world.tiles.fill(Tile.MUD, 6 * 48 + 6, 6 * 48 + 12);
  world.tiles[35 * 48 + 35] = Tile.PLATEAU;
  return {
    ...world,
    props: [
      { id: 'tree', kind: 'tree', tileX: 8, tileY: 9, solid: true },
      { id: 'rock', kind: 'rock_boulder', tileX: 25, tileY: 12, solid: true },
    ],
    encounterSites: [{ id: 'nest', kind: 'nest', x: 13.5, y: 14.5 }],
  };
}
