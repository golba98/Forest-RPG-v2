import { expect, it } from 'vitest';
import { Tile } from '../../../src/types/tiles';
import { NB } from '../../../src/rendering/hillAutotile';
import { getTileArt } from '../../../src/rendering/terrainArt';
import { waterEdgeMask, waterEdges, waterBaseAlias, waterEdgeAlias, WATER_BASE_VARIANTS } from '../../../src/rendering/waterArt';

/** 5×5 grass grid with `cells` set to the given tiles. */
function grid(cells: ReadonlyArray<readonly [number, number, number]>): number[] {
  const tiles = new Array<number>(25).fill(Tile.GRASS);
  for (const [x, y, t] of cells) tiles[y * 5 + x] = t;
  return tiles;
}

it('a vertical river has shoreline on both banks only', () => {
  const tiles = grid([0, 1, 2, 3, 4].map((y) => [2, y, Tile.RIVER] as const));
  const mask = waterEdgeMask(tiles, 5, 5, 2, 2);
  expect(mask & NB.E && mask & NB.W).toBeTruthy();
  expect(mask & (NB.N | NB.S)).toBe(0);
  expect(waterEdges(mask)).toEqual(['e', 'w']);
});

it('bridges and the map edge count as water, so they get no foam', () => {
  const tiles = grid([
    [2, 0, Tile.RIVER],
    [2, 1, Tile.LOG],
    [2, 2, Tile.RIVER],
    [2, 3, Tile.RAMP],
    [2, 4, Tile.RIVER],
  ]);
  expect(waterEdgeMask(tiles, 5, 5, 2, 2) & (NB.N | NB.S)).toBe(0);
  expect(waterEdgeMask(tiles, 5, 5, 2, 0) & (NB.N | NB.NE | NB.NW)).toBe(0);
});

it('a bend gets side strips plus a corner nub where only the diagonal is land', () => {
  // River runs down column 2 then turns east along row 2.
  const tiles = grid([
    [2, 0, Tile.RIVER],
    [2, 1, Tile.RIVER],
    [2, 2, Tile.RIVER],
    [3, 2, Tile.RIVER],
    [4, 2, Tile.RIVER],
  ]);
  const edges = waterEdges(waterEdgeMask(tiles, 5, 5, 2, 2));
  expect(edges).toEqual(expect.arrayContaining(['s', 'w', 'ne']));
  expect(edges).not.toContain('n');
  expect(edges).not.toContain('e');
});

it('river tiles render a procedural base plus one overlay per edge', () => {
  const tiles = grid([0, 1, 2, 3, 4].map((y) => [2, y, Tile.RIVER] as const));
  const layers = getTileArt(Tile.RIVER, 2, 2, 0, waterEdgeMask(tiles, 5, 5, 2, 2));
  expect(layers[0]?.alias).toMatch(/^water_base_\d$/);
  expect(layers.slice(1).map((l) => l.alias)).toEqual([waterEdgeAlias('e'), waterEdgeAlias('w')]);
  expect(waterBaseAlias(WATER_BASE_VARIANTS + 1)).toBe('water_base_1');
});
